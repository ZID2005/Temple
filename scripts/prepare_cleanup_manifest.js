/**
 * Offline Cleanup Manifest Preparation Tool (STEP 33.122)
 *
 * Implements an offline CLI and module to inspect an authoritative local Firestore export,
 * rigorously verify cryptographic baseline integrity, validate reciprocal relationships
 * for 4-document billing clusters (bill, receipt, reservation, idempotency),
 * strictly protect all non-candidate records and master configuration, and output
 * an itemized proposed cleanup manifest for trustee review alongside an unresolved records report.
 *
 * SAFETY INVARIANTS:
 * - Strictly offline: ZERO network connections, ZERO external database/Firebase SDK imports.
 * - Non-destructive: Never modifies or deletes any records. Does not mutate the source export.
 * - Non-executable: Produces a review-only manifest flagged `approvalStatus: 'pending_trustee_review'`.
 * - Overwrite refusal: Refuses to overwrite existing output files by default.
 * - Protected collections: payments, transfers, loans, chitty*, settings, funds, categories,
 *   bankAccounts, users, counters, restore metadata, physical receipts/reservations are strictly protected.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  MANIFEST_SCHEMA_VERSION,
  RECORD_CLASSIFICATIONS,
  ALLOWED_CANDIDATE_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  PROTECTED_EXACT_DOCS,
  checkProtectedPath,
  canonicalJsonStringify,
  computeSha256
} = require('./cleanup_orchestrator.js');

const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['23.2', '23.1']);

/**
 * Extracts payload for backup integrity hash calculation (RFC 8785 subset SHA-256).
 * Follows the exact established project convention from test_step_33_65, test_step_33_56, and test_step_33_49.
 * Excludes metadata to avoid circularity.
 */
function getBackupIntegrityPayload(backupObj) {
  return {
    collections: backupObj.collections || {},
    counters: backupObj.counters || null,
    reservations: backupObj.reservations || [],
    idempotency: backupObj.idempotency || [],
    system: backupObj.system || {}
  };
}

/**
 * Validates the cryptographic integrity and schema version of a loaded export.
 */
function verifyExportIntegrity(backupObj) {
  if (!backupObj || typeof backupObj !== 'object') {
    throw new Error('MALFORMED_EXPORT: Export must be a non-null JSON object.');
  }

  const meta = backupObj.metadata;
  if (!meta || typeof meta !== 'object') {
    throw new Error('MALFORMED_EXPORT: Export missing metadata section.');
  }

  // Schema version validation
  const schemaVer = String(meta.schemaVersion || '').trim();
  if (!schemaVer || !SUPPORTED_SCHEMA_VERSIONS.includes(schemaVer)) {
    throw new Error(`UNSUPPORTED_SCHEMA: Schema version "${schemaVer}" is not supported. Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`);
  }

  // Cryptographic hash validation
  const integrityMeta = meta.integrity || (meta.sha256 ? { hash: meta.sha256, algorithm: 'SHA-256' } : null);
  if (!integrityMeta || !integrityMeta.hash) {
    throw new Error('MISSING_INTEGRITY_METADATA: Authoritative export requires cryptographic integrity hash in metadata.integrity or metadata.sha256.');
  }

  const payloadToVerify = getBackupIntegrityPayload(backupObj);
  const canonicalPayload = canonicalJsonStringify(payloadToVerify);
  const computedHash = computeSha256(canonicalPayload);
  const expectedHash = String(integrityMeta.hash).trim().toUpperCase();

  if (computedHash !== expectedHash) {
    throw new Error(`INTEGRITY_CHECK_FAILED: Cryptographic checksum mismatch. Expected ${expectedHash}, computed ${computedHash}. Export may be corrupted or tampered.`);
  }

  return {
    verified: true,
    schemaVersion: schemaVer,
    algorithm: integrityMeta.algorithm || 'SHA-256',
    hash: computedHash,
    timestamp: meta.timestamp || null,
    environment: meta.environment || null
  };
}

/**
 * Helper to safely extract a document identifier.
 */
function getDocId(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const rawId = doc._firestoreId || doc.firestoreId || doc.id || doc._id;
  if (rawId === undefined || rawId === null) return null;
  return String(rawId).trim();
}

/**
 * Validates document ID syntax and checks for path traversal, control characters, or invalid separators.
 */
function validateDocId(id, context = '') {
  if (!id || typeof id !== 'string') {
    return { valid: false, reason: `Missing or non-string document ID in ${context}` };
  }
  if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0') || /[\x00-\x1F\x7F]/.test(id)) {
    return { valid: false, reason: `Invalid document ID "${id}" containing path traversal, null bytes, or slashes in ${context}` };
  }
  return { valid: true };
}

/**
 * Validates structural soundness of the export payload and detects duplicate paths or malformed documents.
 */
function validateExportStructure(backupObj) {
  const errors = [];
  const seenPaths = new Set();

  if (!backupObj.collections || typeof backupObj.collections !== 'object') {
    errors.push('Missing collections section in export.');
    return { valid: false, errors, seenPaths };
  }

  // Check required collections
  if (!Array.isArray(backupObj.collections.billing)) {
    errors.push('Collection "billing" is missing or not an array.');
  }
  if (!Array.isArray(backupObj.collections.receipts)) {
    errors.push('Collection "receipts" is missing or not an array.');
  }

  // Iterate all collections
  for (const [colName, docs] of Object.entries(backupObj.collections)) {
    const colVal = validateDocId(colName, `collection name "${colName}"`);
    if (!colVal.valid) {
      errors.push(colVal.reason);
      continue;
    }
    if (!Array.isArray(docs)) {
      errors.push(`Collection "${colName}" must be an array of documents.`);
      continue;
    }

    const seenColIds = new Set();
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const docId = getDocId(doc);
      if (!docId) {
        errors.push(`${colName}[${i}]: document missing document ID (_firestoreId or id).`);
        continue;
      }
      const idVal = validateDocId(docId, `${colName}[${i}]`);
      if (!idVal.valid) {
        errors.push(idVal.reason);
        continue;
      }
      if (seenColIds.has(docId)) {
        errors.push(`Duplicate document ID "${docId}" in collection "${colName}".`);
      }
      seenColIds.add(docId);

      const fullPath = `${colName}/${docId}`;
      if (seenPaths.has(fullPath)) {
        errors.push(`Cross-collection duplicate document path "${fullPath}".`);
      }
      seenPaths.add(fullPath);
    }
  }

  // Check top-level reservations
  const resList = backupObj.reservations || (backupObj.system && backupObj.system.reservations);
  if (resList !== undefined && resList !== null) {
    if (!Array.isArray(resList)) {
      errors.push('Reservations section must be an array.');
    } else {
      const seenRes = new Set();
      for (let i = 0; i < resList.length; i++) {
        const r = resList[i];
        const resId = getDocId(r) || (r.seqNumber ? `res_${r.seqNumber}` : null);
        if (!resId) {
          errors.push(`reservations[${i}]: missing reservation identifier.`);
          continue;
        }
        const idVal = validateDocId(resId, `reservations[${i}]`);
        if (!idVal.valid) {
          errors.push(idVal.reason);
          continue;
        }
        if (seenRes.has(resId)) {
          errors.push(`Duplicate reservation ID "${resId}" in reservations.`);
        }
        seenRes.add(resId);
      }
    }
  }

  // Check top-level idempotency
  const opList = backupObj.idempotency || (backupObj.system && backupObj.system.idempotency);
  if (opList !== undefined && opList !== null) {
    if (!Array.isArray(opList)) {
      errors.push('Idempotency section must be an array.');
    } else {
      const seenOp = new Set();
      for (let i = 0; i < opList.length; i++) {
        const o = opList[i];
        const opId = getDocId(o) || o.operationId;
        if (!opId) {
          errors.push(`idempotency[${i}]: missing operation identifier.`);
          continue;
        }
        const idVal = validateDocId(opId, `idempotency[${i}]`);
        if (!idVal.valid) {
          errors.push(idVal.reason);
          continue;
        }
        if (seenOp.has(opId)) {
          errors.push(`Duplicate idempotency ID "${opId}" in idempotency.`);
        }
        seenOp.add(opId);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    seenPaths
  };
}

/**
 * Extracts and indexes all documents from the export into queryable maps.
 */
function indexExportDocuments(backupObj) {
  const billingMap = new Map();
  const receiptMap = new Map();
  const reservationMap = new Map();
  const idempotencyMap = new Map();
  const protectedDocsCount = { total: 0, byCollection: {} };

  // 1. Billing documents
  const bills = backupObj.collections.billing || [];
  for (const b of bills) {
    const id = getDocId(b);
    if (id) billingMap.set(id, b);
  }

  // 2. Receipts
  const rcpts = backupObj.collections.receipts || [];
  for (const r of rcpts) {
    const id = getDocId(r);
    if (id) receiptMap.set(id, r);
  }

  // 3. System reservations (from reservations, system.reservations, collections.system)
  function indexRes(r) {
    if (!r) return;
    const id = getDocId(r) || (r.seqNumber ? `res_${r.seqNumber}` : null);
    if (id && !reservationMap.has(id)) {
      reservationMap.set(id, r);
    }
  }
  if (Array.isArray(backupObj.reservations)) backupObj.reservations.forEach(indexRes);
  if (backupObj.system && Array.isArray(backupObj.system.reservations)) backupObj.system.reservations.forEach(indexRes);
  if (backupObj.collections.system && Array.isArray(backupObj.collections.system)) {
    backupObj.collections.system.filter(d => {
      const id = getDocId(d);
      return id && id.startsWith('res_');
    }).forEach(indexRes);
  }

  // 4. System idempotency (from idempotency, system.idempotency, collections.system)
  function indexOp(o) {
    if (!o) return;
    const id = getDocId(o) || o.operationId;
    if (id && !idempotencyMap.has(id)) {
      idempotencyMap.set(id, o);
    }
  }
  if (Array.isArray(backupObj.idempotency)) backupObj.idempotency.forEach(indexOp);
  if (backupObj.system && Array.isArray(backupObj.system.idempotency)) backupObj.system.idempotency.forEach(indexOp);
  if (backupObj.collections.system && Array.isArray(backupObj.collections.system)) {
    backupObj.collections.system.filter(d => {
      const id = getDocId(d);
      return id && id.startsWith('op_');
    }).forEach(indexOp);
  }

  // 5. Protected documents inventory
  for (const [col, docs] of Object.entries(backupObj.collections)) {
    if (PROTECTED_COLLECTIONS.includes(col)) {
      const count = Array.isArray(docs) ? docs.length : 0;
      protectedDocsCount.total += count;
      protectedDocsCount.byCollection[col] = count;
    }
  }

  // Account for counters, restore progress, etc.
  if (backupObj.counters) {
    protectedDocsCount.total += 1;
    protectedDocsCount.byCollection['system/counters'] = 1;
  }
  if (backupObj.system && backupObj.system.counters) {
    protectedDocsCount.total += 1;
    protectedDocsCount.byCollection['system/counters'] = (protectedDocsCount.byCollection['system/counters'] || 0) + 1;
  }
  if (backupObj.collections.system && Array.isArray(backupObj.collections.system)) {
    for (const d of backupObj.collections.system) {
      const id = getDocId(d);
      const prot = checkProtectedPath('system', id);
      if (prot.isProtected) {
        protectedDocsCount.total += 1;
        protectedDocsCount.byCollection[`system/${id}`] = (protectedDocsCount.byCollection[`system/${id}`] || 0) + 1;
      }
    }
  }

  return {
    billingMap,
    receiptMap,
    reservationMap,
    idempotencyMap,
    protectedDocsCount
  };
}

/**
 * Evaluates candidate billing clusters and classifies valid clusters vs unresolved records.
 * Enforces strict 4-document reciprocal link integrity.
 */
function evaluateClusters(indexes) {
  const { billingMap, receiptMap, reservationMap, idempotencyMap, protectedDocsCount } = indexes;

  const candidateClusters = [];
  const candidateEntries = [];
  const unresolvedRecords = [];
  const clusteredDocPaths = new Set();

  // Helper to find receipt reference by explicit reference ID
  function findReceipt(ref) {
    if (ref === undefined || ref === null) return null;
    const sRef = String(ref).trim();
    if (receiptMap.has(sRef)) return receiptMap.get(sRef);
    if (!sRef.startsWith('rcpt_') && receiptMap.has(`rcpt_${sRef}`)) return receiptMap.get(`rcpt_${sRef}`);
    return null;
  }

  // Helper to find reservation reference by explicit reference ID
  function findReservation(ref) {
    if (ref === undefined || ref === null) return null;
    const sRef = String(ref).trim();
    if (reservationMap.has(sRef)) return reservationMap.get(sRef);
    if (!sRef.startsWith('res_') && reservationMap.has(`res_${sRef}`)) return reservationMap.get(`res_${sRef}`);
    return null;
  }

  // Helper to find idempotency reference by explicit reference ID
  function findIdempotency(ref) {
    if (ref === undefined || ref === null) return null;
    const sRef = String(ref).trim();
    if (idempotencyMap.has(sRef)) return idempotencyMap.get(sRef);
    if (!sRef.startsWith('op_') && idempotencyMap.has(`op_${sRef}`)) return idempotencyMap.get(`op_${sRef}`);
    return null;
  }

  // Iterate all billing documents
  for (const [billDocId, bill] of billingMap.entries()) {
    const billNumericId = bill.id !== undefined && !isNaN(Number(bill.id)) ? Number(bill.id) : undefined;
    const issues = [];

    // 1. Verify Bill-level fields
    const billRcptRef = bill.accountingReceiptId || bill.linkedReceiptId;
    const billResRef = bill.reservationDocId || bill.linkedReservationId;
    const billOpRef = bill.operationId || bill.linkedOperationId;

    if (!billRcptRef) {
      issues.push('Missing linked accounting receipt reference (accountingReceiptId).');
    }
    if (!billResRef) {
      issues.push('Missing linked reservation reference (reservationDocId).');
    }
    if (!billOpRef) {
      issues.push('Missing linked idempotency reference (operationId).');
    }

    // 2. Receipt Lookup & Verification
    const linkedReceipt = findReceipt(billRcptRef, billDocId, billNumericId);
    let rcptDocId = null;

    if (!linkedReceipt) {
      issues.push(`Referenced receipt "${billRcptRef}" does not exist in export.`);
    } else {
      rcptDocId = getDocId(linkedReceipt);

      // Check physical receipt guard
      if (rcptDocId.startsWith('rcpt_phys_') || linkedReceipt.source === 'physical') {
        issues.push(`Referenced receipt "${rcptDocId}" is a physical receipt (protected).`);
      }

      // Check source field
      if (linkedReceipt.source !== 'billing') {
        issues.push(`Referenced receipt "${rcptDocId}" has source "${linkedReceipt.source || 'missing'}". Must be "billing".`);
      }

      // Check reciprocal bill reference on receipt
      const rcptBillId = linkedReceipt.billingFirestoreId || linkedReceipt.linkedBillId ||
        (linkedReceipt.billingId !== undefined ? `bill_${linkedReceipt.billingId}` : null);

      const billMatches = (linkedReceipt.billingFirestoreId === billDocId) ||
        (linkedReceipt.linkedBillId === billDocId) ||
        (billNumericId !== undefined && Number(linkedReceipt.billingId) === billNumericId) ||
        (linkedReceipt.billingId !== undefined && `bill_${linkedReceipt.billingId}` === billDocId);

      if (!billMatches) {
        issues.push(`Receipt "${rcptDocId}" references conflicting bill "${rcptBillId || 'none'}" instead of "${billDocId}".`);
      }

      // Check reciprocal reservation reference if present on both
      if (linkedReceipt.reservationDocId && billResRef) {
        const rcptRes = String(linkedReceipt.reservationDocId).trim();
        const billRes = String(billResRef).trim();
        if (rcptRes !== billRes && !rcptRes.endsWith(billRes) && !billRes.endsWith(rcptRes)) {
          issues.push(`Receipt "${rcptDocId}" reservation "${rcptRes}" conflicts with bill reservation "${billRes}".`);
        }
      }
    }

    // 3. Reservation Lookup & Verification
    const linkedRes = findReservation(billResRef, billDocId, rcptDocId);
    let resDocId = null;

    if (!linkedRes) {
      issues.push(`Referenced reservation "${billResRef}" does not exist in export.`);
    } else {
      resDocId = getDocId(linkedRes) || (linkedRes.seqNumber ? `res_${linkedRes.seqNumber}` : null);

      if (resDocId.startsWith('res_phys_')) {
        issues.push(`Referenced reservation "${resDocId}" is a physical reservation (protected).`);
      }

      if (linkedRes.billDocId && linkedRes.billDocId !== billDocId && (billNumericId === undefined || linkedRes.billDocId !== String(billNumericId))) {
        issues.push(`Reservation "${resDocId}" references conflicting billDocId "${linkedRes.billDocId}" instead of "${billDocId}".`);
      }

      if (rcptDocId && linkedRes.receiptDocId && linkedRes.receiptDocId !== rcptDocId) {
        issues.push(`Reservation "${resDocId}" references conflicting receiptDocId "${linkedRes.receiptDocId}" instead of "${rcptDocId}".`);
      }
    }

    // 4. Idempotency Lookup & Verification
    const linkedOp = findIdempotency(billOpRef, billDocId, rcptDocId, resDocId);
    let opDocId = null;

    if (!linkedOp) {
      issues.push(`Referenced idempotency record "${billOpRef}" does not exist in export.`);
    } else {
      opDocId = getDocId(linkedOp) || linkedOp.operationId;

      if (opDocId.startsWith('op_phys_')) {
        issues.push(`Referenced idempotency record "${opDocId}" is a physical operation (protected).`);
      }

      if (linkedOp.billDocId && linkedOp.billDocId !== billDocId && (billNumericId === undefined || linkedOp.billDocId !== String(billNumericId))) {
        issues.push(`Idempotency record "${opDocId}" references conflicting billDocId "${linkedOp.billDocId}" instead of "${billDocId}".`);
      }

      if (rcptDocId && linkedOp.receiptDocId && linkedOp.receiptDocId !== rcptDocId) {
        issues.push(`Idempotency record "${opDocId}" references conflicting receiptDocId "${linkedOp.receiptDocId}" instead of "${rcptDocId}".`);
      }

      if (resDocId && linkedOp.resDocId && linkedOp.resDocId !== resDocId) {
        issues.push(`Idempotency record "${opDocId}" references conflicting resDocId "${linkedOp.resDocId}" instead of "${resDocId}".`);
      }
    }

    // 5. Cluster Decision
    if (issues.length === 0 && linkedReceipt && linkedRes && linkedOp) {
      // Complete valid 4-document cluster
      const clusterId = `cluster_${billDocId}`;
      const billPath = `billing/${billDocId}`;
      const rcptPath = `receipts/${rcptDocId}`;
      const resPath = `system/${resDocId}`;
      const opPath = `system/${opDocId}`;

      clusteredDocPaths.add(billPath);
      clusteredDocPaths.add(rcptPath);
      clusteredDocPaths.add(resPath);
      clusteredDocPaths.add(opPath);

      const clusterObj = {
        clusterId,
        parentBillingId: billDocId,
        approvalStatus: 'pending_trustee_review',
        inclusionReason: 'Complete verified 4-document billing cluster with verified reciprocal links',
        documents: [
          {
            path: billPath,
            collection: 'billing',
            docId: billDocId,
            documentType: 'billing_transaction',
            parentBillingId: billDocId,
            fingerprint: computeSha256(bill),
            verifiedRelationships: {
              accountingReceiptId: rcptDocId,
              reservationDocId: resDocId,
              operationId: opDocId
            }
          },
          {
            path: rcptPath,
            collection: 'receipts',
            docId: rcptDocId,
            documentType: 'billing_receipt',
            parentBillingId: billDocId,
            fingerprint: computeSha256(linkedReceipt),
            verifiedRelationships: {
              source: 'billing',
              billingFirestoreId: billDocId,
              reservationDocId: resDocId
            }
          },
          {
            path: resPath,
            collection: 'system',
            docId: resDocId,
            documentType: 'billing_reservation',
            parentBillingId: billDocId,
            fingerprint: computeSha256(linkedRes),
            verifiedRelationships: {
              billDocId,
              receiptDocId: rcptDocId
            }
          },
          {
            path: opPath,
            collection: 'system',
            docId: opDocId,
            documentType: 'billing_idempotency',
            parentBillingId: billDocId,
            fingerprint: computeSha256(linkedOp),
            verifiedRelationships: {
              billDocId,
              receiptDocId: rcptDocId,
              resDocId
            }
          }
        ]
      };

      candidateClusters.push(clusterObj);

      // Append flat candidate entries
      for (const doc of clusterObj.documents) {
        candidateEntries.push({
          collection: doc.collection,
          docId: doc.docId,
          path: doc.path,
          documentType: doc.documentType,
          classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
          approvalStatus: 'pending_trustee_review',
          parentBillingId: billDocId,
          reason: clusterObj.inclusionReason,
          fingerprint: doc.fingerprint,
          expectedRelationships: doc.verifiedRelationships
        });
      }
    } else {
      // Unresolved billing cluster
      unresolvedRecords.push({
        collection: 'billing',
        docId: billDocId,
        path: `billing/${billDocId}`,
        parentBillingId: billDocId,
        category: 'unresolved_billing_cluster',
        reasons: issues,
        summaryReason: issues.join('; '),
        documentData: bill
      });

      // Also quarantine linked receipt if exists
      if (linkedReceipt && rcptDocId) {
        unresolvedRecords.push({
          collection: 'receipts',
          docId: rcptDocId,
          path: `receipts/${rcptDocId}`,
          parentBillingId: billDocId,
          category: 'quarantined_cluster_receipt',
          summaryReason: `Quarantined because parent bill "${billDocId}" failed cluster verification: ${issues.join('; ')}`,
          documentData: linkedReceipt
        });
      }

      // Also quarantine linked reservation if exists
      if (linkedRes && resDocId) {
        unresolvedRecords.push({
          collection: 'system',
          docId: resDocId,
          path: `system/${resDocId}`,
          parentBillingId: billDocId,
          category: 'quarantined_cluster_reservation',
          summaryReason: `Quarantined because parent bill "${billDocId}" failed cluster verification: ${issues.join('; ')}`,
          documentData: linkedRes
        });
      }

      // Also quarantine linked idempotency if exists
      if (linkedOp && opDocId) {
        unresolvedRecords.push({
          collection: 'system',
          docId: opDocId,
          path: `system/${opDocId}`,
          parentBillingId: billDocId,
          category: 'quarantined_cluster_idempotency',
          summaryReason: `Quarantined because parent bill "${billDocId}" failed cluster verification: ${issues.join('; ')}`,
          documentData: linkedOp
        });
      }
    }
  }

  // 6. Check unclustered receipts
  for (const [rcptDocId, r] of receiptMap.entries()) {
    const rcptPath = `receipts/${rcptDocId}`;
    if (clusteredDocPaths.has(rcptPath)) continue;

    // Is it physical?
    if (rcptDocId.startsWith('rcpt_phys_') || r.source === 'physical') {
      protectedDocsCount.total += 1;
      protectedDocsCount.byCollection['receipts/physical'] = (protectedDocsCount.byCollection['receipts/physical'] || 0) + 1;
      continue;
    }

    // Is it independent?
    if (r.source && r.source !== 'billing') {
      protectedDocsCount.total += 1;
      protectedDocsCount.byCollection[`receipts/independent_${r.source}`] = (protectedDocsCount.byCollection[`receipts/independent_${r.source}`] || 0) + 1;
      continue;
    }

    // Unclustered billing receipt (orphaned or missing parent bill)
    // Check if not already in unresolvedRecords
    const alreadyLogged = unresolvedRecords.some(u => u.path === rcptPath);
    if (!alreadyLogged) {
      unresolvedRecords.push({
        collection: 'receipts',
        docId: rcptDocId,
        path: rcptPath,
        parentBillingId: r.billingFirestoreId || r.linkedBillId || (r.billingId !== undefined ? `bill_${r.billingId}` : null),
        category: 'orphaned_billing_receipt',
        summaryReason: `Billing receipt "${rcptDocId}" was not part of any verified cluster. Linked bill is missing or unverified.`,
        documentData: r
      });
    }
  }

  // 7. Check unclustered reservations
  for (const [resDocId, res] of reservationMap.entries()) {
    const resPath = `system/${resDocId}`;
    if (clusteredDocPaths.has(resPath)) continue;

    if (resDocId.startsWith('res_phys_')) {
      protectedDocsCount.total += 1;
      protectedDocsCount.byCollection['system/physical_reservations'] = (protectedDocsCount.byCollection['system/physical_reservations'] || 0) + 1;
      continue;
    }

    const alreadyLogged = unresolvedRecords.some(u => u.path === resPath);
    if (!alreadyLogged) {
      unresolvedRecords.push({
        collection: 'system',
        docId: resDocId,
        path: resPath,
        parentBillingId: res.billDocId || null,
        category: 'orphaned_reservation',
        summaryReason: `Reservation "${resDocId}" was not part of any verified cluster. Linked bill is missing or unverified.`,
        documentData: res
      });
    }
  }

  // 8. Check unclustered idempotency
  for (const [opDocId, op] of idempotencyMap.entries()) {
    const opPath = `system/${opDocId}`;
    if (clusteredDocPaths.has(opPath)) continue;

    if (opDocId.startsWith('op_phys_')) {
      protectedDocsCount.total += 1;
      protectedDocsCount.byCollection['system/physical_idempotency'] = (protectedDocsCount.byCollection['system/physical_idempotency'] || 0) + 1;
      continue;
    }

    const alreadyLogged = unresolvedRecords.some(u => u.path === opPath);
    if (!alreadyLogged) {
      unresolvedRecords.push({
        collection: 'system',
        docId: opDocId,
        path: opPath,
        parentBillingId: op.billDocId || null,
        category: 'orphaned_idempotency',
        summaryReason: `Idempotency record "${opDocId}" was not part of any verified cluster. Linked bill is missing or unverified.`,
        documentData: op
      });
    }
  }

  return {
    candidateClusters,
    candidateEntries,
    unresolvedRecords,
    protectedDocsCount
  };
}

/**
 * Main manifest preparation pipeline.
 *
 * @param {Object} options
 * @param {string} options.exportPath - Local path to input export JSON.
 * @param {string} options.outputPath - Local path for proposed manifest JSON output.
 * @param {string} [options.unresolvedPath] - Local path for unresolved records JSON report.
 * @param {boolean} [options.force] - Allow overwriting existing output files if true.
 * @returns {Object} Manifest preparation summary and metadata.
 */
function prepareCleanupManifest(options = {}) {
  const exportPath = options.exportPath;
  const outputPath = options.outputPath;
  let unresolvedPath = options.unresolvedPath;
  const force = Boolean(options.force);

  // 1. Argument validation
  if (!exportPath || typeof exportPath !== 'string') {
    throw new Error('MISSING_ARGUMENT: --export <filepath> is required.');
  }
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('MISSING_ARGUMENT: --output <filepath> is required.');
  }

  // Determine unresolved report path if not explicitly provided
  if (!unresolvedPath) {
    if (outputPath.endsWith('.json')) {
      unresolvedPath = outputPath.slice(0, -5) + '.unresolved.json';
    } else {
      unresolvedPath = outputPath + '.unresolved.json';
    }
  }

  // Validate path syntax and traversal
  const resolvedExport = path.resolve(exportPath);
  const resolvedOutput = path.resolve(outputPath);
  const resolvedUnresolved = path.resolve(unresolvedPath);

  if (resolvedOutput === resolvedUnresolved) {
    throw new Error('INVALID_PATH: Manifest output path and unresolved report path cannot be the same file.');
  }
  if (resolvedExport === resolvedOutput || resolvedExport === resolvedUnresolved) {
    throw new Error('INVALID_PATH: Output paths cannot overwrite the source export file.');
  }

  // 2. Refuse to overwrite existing files by default
  if (!force && fs.existsSync(resolvedOutput)) {
    throw new Error(`OUTPUT_FILE_EXISTS: Manifest output file "${resolvedOutput}" already exists. Overwrite refused. Pass --force to overwrite.`);
  }
  if (!force && fs.existsSync(resolvedUnresolved)) {
    throw new Error(`OUTPUT_FILE_EXISTS: Unresolved records report file "${resolvedUnresolved}" already exists. Overwrite refused. Pass --force to overwrite.`);
  }

  // 3. Check source export file existence
  if (!fs.existsSync(resolvedExport)) {
    throw new Error(`EXPORT_NOT_FOUND: Source export file does not exist: "${resolvedExport}".`);
  }

  const exportStats = fs.statSync(resolvedExport);
  if (!exportStats.isFile()) {
    throw new Error(`INVALID_EXPORT: Path is not a file: "${resolvedExport}".`);
  }
  if (exportStats.size === 0) {
    throw new Error(`EMPTY_EXPORT: Source export file is empty: "${resolvedExport}".`);
  }

  // 4. Read source export and calculate pre-execution file checksum
  const rawExportContent = fs.readFileSync(resolvedExport, 'utf8');
  const preReadSha256 = crypto.createHash('sha256').update(rawExportContent, 'utf8').digest('hex').toUpperCase();

  // 5. Parse JSON
  let backupObj;
  try {
    backupObj = JSON.parse(rawExportContent);
  } catch (err) {
    throw new Error(`MALFORMED_JSON_EXPORT: Failed to parse export JSON: ${err.message}`);
  }

  // 6. Verify export schema version and cryptographic baseline integrity
  const integrityVerification = verifyExportIntegrity(backupObj);

  // 7. Validate structural soundness, document IDs, and duplicate paths
  const structureValidation = validateExportStructure(backupObj);
  if (!structureValidation.valid) {
    throw new Error(`EXPORT_STRUCTURE_INVALID: Structural errors found in export:\n- ${structureValidation.errors.join('\n- ')}`);
  }

  // 8. Index documents
  const indexes = indexExportDocuments(backupObj);

  // 9. Evaluate candidate clusters
  const evaluation = evaluateClusters(indexes);

  // 10. Assemble proposed manifest review artifact
  const nowIso = new Date().toISOString();
  const manifestId = `proposed_manifest_${nowIso.replace(/[-:]/g, '').replace(/\..+/, '')}`;

  const manifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId,
    generatedAt: nowIso,
    tool: 'scripts/prepare_cleanup_manifest.js',
    approvalStatus: 'pending_trustee_review',
    executionLocked: true,
    sourceExport: {
      filePath: path.relative(process.cwd(), resolvedExport),
      fileSizeBytes: exportStats.size,
      fileSha256: preReadSha256,
      schemaVersion: integrityVerification.schemaVersion,
      exportTimestamp: integrityVerification.timestamp,
      environment: integrityVerification.environment,
      integrity: {
        verified: true,
        algorithm: integrityVerification.algorithm,
        hash: integrityVerification.hash
      }
    },
    summary: {
      totalBillingExamined: indexes.billingMap.size,
      candidateClustersCount: evaluation.candidateClusters.length,
      candidateDocumentsCount: evaluation.candidateEntries.length,
      unresolvedRecordsCount: evaluation.unresolvedRecords.length,
      protectedRecordsPreservedCount: evaluation.protectedDocsCount.total,
      protectedBreakdown: evaluation.protectedDocsCount.byCollection
    },
    candidateClusters: evaluation.candidateClusters,
    entries: evaluation.candidateEntries
  };

  // 11. Assemble unresolved records report
  const unresolvedReport = {
    reportVersion: '1.0.0',
    generatedAt: nowIso,
    sourceExport: {
      filePath: path.relative(process.cwd(), resolvedExport),
      fileSizeBytes: exportStats.size,
      fileSha256: preReadSha256,
      schemaVersion: integrityVerification.schemaVersion,
      exportTimestamp: integrityVerification.timestamp
    },
    summary: {
      totalUnresolvedRecords: evaluation.unresolvedRecords.length,
      byCategory: evaluation.unresolvedRecords.reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + 1;
        return acc;
      }, {})
    },
    unresolvedRecords: evaluation.unresolvedRecords
  };

  // Ensure output directories exist
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const unresolvedDir = path.dirname(resolvedUnresolved);
  if (!fs.existsSync(unresolvedDir)) fs.mkdirSync(unresolvedDir, { recursive: true });

  // 12. Write output files
  fs.writeFileSync(resolvedOutput, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(resolvedUnresolved, JSON.stringify(unresolvedReport, null, 2), 'utf8');

  // 13. Verify source export was not modified
  const postExecutionContent = fs.readFileSync(resolvedExport, 'utf8');
  const postReadSha256 = crypto.createHash('sha256').update(postExecutionContent, 'utf8').digest('hex').toUpperCase();
  if (preReadSha256 !== postReadSha256 || postExecutionContent.length !== rawExportContent.length) {
    throw new Error('CRITICAL_SAFETY_VIOLATION: Source export was mutated during execution!');
  }

  return {
    manifest,
    unresolvedReport,
    outputPaths: {
      manifest: resolvedOutput,
      unresolved: resolvedUnresolved
    },
    sourceUnchanged: true
  };
}

/**
 * CLI Argument Parser and Runner
 */
function runCli(customArgv = null, io = {}) {
  const exit = io.exit || process.exit;
  const log = io.log || console.log;
  const error = io.error || console.error;
  const args = customArgv !== null ? customArgv : process.argv.slice(2);
  let exportPath = null;
  let outputPath = null;
  let unresolvedPath = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--export' || arg === '-e') {
      exportPath = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      outputPath = args[++i];
    } else if (arg === '--unresolved' || arg === '-u') {
      unresolvedPath = args[++i];
    } else if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--help' || arg === '-h') {
      log(`
Temple Accounts - Offline Cleanup Manifest Preparation Tool (STEP 33.122)

Usage:
  node scripts/prepare_cleanup_manifest.js --export <local-export.json> --output <manifest.json> [options]

Options:
  --export, -e      Path to authoritative local Firestore export JSON (Required)
  --output, -o      Path to output proposed cleanup manifest JSON (Required)
  --unresolved, -u  Path to output unresolved records JSON report (Optional)
  --force, -f       Overwrite output files if they already exist
  --help, -h        Display this help message

Description:
  Inspects a local Firestore export, validates cryptographic integrity and 4-document
  billing cluster relationships, protects all financial records and counters, and generates
  an itemized proposed manifest with status "pending_trustee_review".
  Zero network calls. Zero database mutations. Offline review artifact only.
`);
      return exit(0);
    } else {
      error(`Unknown argument: ${arg}`);
      return exit(1);
    }
  }

  if (!exportPath || !outputPath) {
    error('Error: Both --export <filepath> and --output <filepath> are required.');
    error('Run with --help for usage details.');
    return exit(1);
  }

  try {
    const result = prepareCleanupManifest({ exportPath, outputPath, unresolvedPath, force });
    const { manifest, outputPaths } = result;

    log('========================================================================');
    log('   OFFLINE CLEANUP MANIFEST PREPARATION COMPLETED');
    log('========================================================================');
    log(`Source Export:        ${manifest.sourceExport.filePath} (${manifest.sourceExport.fileSizeBytes} bytes)`);
    log(`Export Integrity:     VERIFIED (${manifest.sourceExport.integrity.hash})`);
    log(`Billing Examined:     ${manifest.summary.totalBillingExamined}`);
    log(`Candidate Clusters:   ${manifest.summary.candidateClustersCount} (${manifest.summary.candidateDocumentsCount} candidate docs)`);
    log(`Unresolved Records:   ${manifest.summary.unresolvedRecordsCount}`);
    log(`Protected Preserved:  ${manifest.summary.protectedRecordsPreservedCount}`);
    log(`Approval Status:      ${manifest.approvalStatus}`);
    log(`Execution Lock:       ${manifest.executionLocked ? 'PERMANENTLY ENABLED' : 'DISABLED'}`);
    log('------------------------------------------------------------------------');
    log(`Manifest Output:      ${outputPaths.manifest}`);
    log(`Unresolved Report:    ${outputPaths.unresolved}`);
    log('========================================================================\n');
    return exit(0);
  } catch (err) {
    error(`ERROR: ${err.message}`);
    return exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  prepareCleanupManifest,
  runCli,
  verifyExportIntegrity,
  validateExportStructure,
  getBackupIntegrityPayload,
  indexExportDocuments,
  evaluateClusters,
  SUPPORTED_SCHEMA_VERSIONS
};
