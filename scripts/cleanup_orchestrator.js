/**
 * Safe Financial Data Cleanup Orchestrator (STEP 33.120)
 *
 * Implements safe, auditable orchestration for identifying, validating,
 * and preparing dummy/test financial transactions for eventual removal.
 *
 * DEFECT CORRECTIONS (STEP 33.120):
 * - D-1: Narrowly scoped system collection path policy.
 *        Permits consideration of billing-linked sequence reservations (system/res_*)
 *        and idempotency tokens (system/op_*) ONLY when explicitly included in an approved
 *        manifest with verified reciprocal links to confirmed test bills.
 *        Counters (system/counters), restore progress (system/_restoreProgress),
 *        physical reservations (system/res_phys_*), and all unknown system/* documents
 *        remain unconditionally protected and rejected.
 * - D-2: Receipt linkage schema alignment.
 *        Validates actual production receipt fields: source === 'billing', billingFirestoreId,
 *        billingId, and reservationDocId against corresponding billing records.
 *        Requires reciprocal confirmation. Unlinked, conflicting, independent, or physical
 *        receipts fail closed and are protected.
 * - D-3: Protected collection whitelist hardening.
 *        Removed payments, transfers, loans, and chitty collections from allowed candidates.
 *        Added explicit deny-by-default and protected collection denylist coverage.
 *
 * MODES SUPPORTED:
 * - inventory: Inspect synthetic fixtures and classify candidate records.
 * - validate:  Validate manifest structure, dependencies, and protected path safeguards.
 * - dry-run:   Perform complete simulation without performing any writes or deletions.
 * - execute:   STRICTLY AND PERMANENTLY DISABLED in STEP 33.120. Fails closed with zero mutations.
 *
 * ABSOLUTE SAFETY BOUNDARIES:
 * - Zero connection to production Firebase (temple-f4f7d) or Vercel.
 * - Zero production reads, modifications, or deletions.
 * - Candidate rules (allow delete: if false;) respected; zero client-side delete bypasses.
 * - Monotonic counters (system/counters) and recovery metadata (system/_restoreProgress)
 *   are strictly protected and never decremented or deleted.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_SCHEMA_VERSION = '1.0.0';

const RECORD_CLASSIFICATIONS = Object.freeze({
  CONFIRMED_TEST_TRANSACTION: 'confirmed_test_transaction',
  HISTORICAL_TEST_ARTIFACT: 'historical_test_artifact',
  DERIVED_FINANCIAL_VALUE: 'derived_financial_value',
  MASTER_CONFIGURATION: 'master_configuration',
  NUMBERING_AND_RECOVERY_METADATA: 'numbering_and_recovery_metadata',
  AUTHENTICATION_AND_APP_CONFIG: 'authentication_and_app_config',
  UNVERIFIED_RECORD: 'unverified_record'
});

/**
 * Whitelist of deletion-eligible candidate collections.
 * Hardened per Defect D-3: payments, transfers, loans, and chitty records REMOVED.
 * Added 'system' under strictly scoped billing reservation/idempotency policy (Defect D-1).
 */
const ALLOWED_CANDIDATE_COLLECTIONS = Object.freeze([
  'billing',
  'receipts',
  'system',
  'migration_staging',
  '__system_diagnostics__'
]);

/**
 * Denylist of protected collections that must NEVER be targeted for cleanup.
 * Hardened per Defect D-3: includes payments, transfers, loans, and chitty collections.
 */
const PROTECTED_COLLECTIONS = Object.freeze([
  'settings',
  'funds',
  'incomeCategories',
  'expenseCategories',
  'bankAccounts',
  'users',
  'payments',
  'transfers',
  'loans',
  'chittyCollections',
  'chittyPayouts',
  'chittyMembers'
]);

const PROTECTED_EXACT_DOCS = Object.freeze([
  'system/counters',
  'system/_restoreProgress',
  'settings/set_1'
]);

/**
 * Deterministically stringifies any JavaScript value according to RFC 8785 subset.
 */
function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(item => (item === undefined || typeof item === 'function') ? 'null' : canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const entries = [];
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined && typeof v !== 'function') {
      entries.push(JSON.stringify(k) + ':' + canonicalJsonStringify(v));
    }
  }
  return '{' + entries.join(',') + '}';
}

/**
 * Computes SHA-256 hash of a canonicalized value or string.
 */
function computeSha256(data) {
  const str = typeof data === 'string' ? data : canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').toUpperCase();
}

/**
 * Evaluates whether a given collection and document ID matches the protected-record denylist.
 * Normalizes alternate casing, URL decoding, path separators, and traversal attempts.
 *
 * Implements:
 * - Narrowly scoped path policy for system collection (Defect D-1)
 * - Rejection of physical and independent receipts (Defect D-2)
 * - Explicit protection of payments, transfers, loans, and chitty (Defect D-3)
 */
function checkProtectedPath(collection, docId) {
  const rawCol = String(collection || '').trim();
  const rawId = String(docId || '').trim();

  // Attempt URL decode to catch encoded bypass attempts (e.g., %73ystem, %2f)
  let decCol = rawCol;
  let decId = rawId;
  try { decCol = decodeURIComponent(rawCol); } catch (e) {}
  try { decId = decodeURIComponent(rawId); } catch (e) {}

  // Detect path traversal, null bytes, backslashes, or internal slashes in docId
  if (decId.includes('/') || decId.includes('\\') || decId.includes('..') || decId.includes('\0')) {
    return {
      isProtected: true,
      reason: `Suspicious or malformed document ID containing path traversal or separators: ${rawId}`,
      assetType: 'invalid_path_syntax'
    };
  }

  // Detect path traversal, null bytes, backslashes in collection
  if (decCol.includes('/') || decCol.includes('\\') || decCol.includes('..') || decCol.includes('\0')) {
    return {
      isProtected: true,
      reason: `Suspicious or malformed collection containing path traversal or separators: ${rawCol}`,
      assetType: 'invalid_path_syntax'
    };
  }

  // Normalized lower-case representations
  const lowerCol = decCol.toLowerCase();
  const lowerId = decId.toLowerCase();
  const lowerFullPath = `${lowerCol}/${lowerId}`;
  const normPath = path.posix.normalize(`${decCol}/${decId}`).toLowerCase();

  // 1. Exact path matches (case-insensitive & normalized)
  const lowerExact = PROTECTED_EXACT_DOCS.map(d => d.toLowerCase());
  if (lowerExact.includes(lowerFullPath) || lowerExact.includes(normPath)) {
    const assetType = (lowerCol === 'system' || normPath.startsWith('system/'))
      ? (lowerId === 'counters' || normPath === 'system/counters' ? 'sequence_counters' : 'system_recovery_metadata')
      : 'master_configuration';
    return {
      isProtected: true,
      reason: `Exact protected system or configuration path: ${rawCol}/${rawId}`,
      assetType
    };
  }

  // 2. Global sequence counter document guard (case-insensitive & normalized)
  if (lowerId === 'counters' || lowerId.startsWith('counters/') || normPath.endsWith('/counters')) {
    return {
      isProtected: true,
      reason: 'Global sequence counter document (monotonic invariant)',
      assetType: 'sequence_counters'
    };
  }

  // 3. Physical receipts and physical sequences guard (rcpt_phys_*, res_phys_*, op_phys_*)
  if (lowerId.startsWith('rcpt_phys_')) {
    return {
      isProtected: true,
      reason: 'Physical receipt document is protected from cleanup',
      assetType: 'physical_receipt'
    };
  }
  if (lowerId.startsWith('res_phys_') || lowerId.startsWith('op_phys_')) {
    return {
      isProtected: true,
      reason: 'Physical sequence reservation or idempotency marker is protected',
      assetType: 'physical_reservation'
    };
  }

  // 4. Narrowly scoped System collection path policy (Defect D-1)
  if (lowerCol === 'system' || normPath.startsWith('system/')) {
    // 4a. Monotonic sequence counters
    if (lowerId === 'counters' || normPath === 'system/counters') {
      return { isProtected: true, reason: 'Global sequence counter document (system/counters)', assetType: 'sequence_counters' };
    }
    // 4b. Recovery progress and restore controls
    if (lowerId === '_restoreprogress' || lowerId.startsWith('_') || normPath.includes('/_restoreprogress')) {
      return { isProtected: true, reason: `System recovery and control document: system/${rawId}`, assetType: 'system_recovery_metadata' };
    }
    // 4c. Physical reservations / operations
    if (lowerId.startsWith('res_phys_') || lowerId.startsWith('op_phys_')) {
      return { isProtected: true, reason: `Physical sequence reservation/idempotency marker: system/${rawId}`, assetType: 'physical_reservation' };
    }
    // 4d. Permitted billing-linked reservation (system/res_*)
    // Permitted for consideration ONLY; requires reciprocal validation against confirmed test bill in validateManifest
    if (lowerId.startsWith('res_')) {
      return {
        isProtected: false,
        conditionalCandidate: true,
        assetType: 'sequence_reservation',
        reason: 'Permitted billing reservation candidate subject to reciprocal bill validation'
      };
    }
    // 4e. Permitted billing-linked idempotency record (system/op_*)
    // Permitted for consideration ONLY; requires reciprocal validation against confirmed test bill in validateManifest
    if (lowerId.startsWith('op_')) {
      return {
        isProtected: false,
        conditionalCandidate: true,
        assetType: 'idempotency_record',
        reason: 'Permitted billing idempotency candidate subject to reciprocal bill validation'
      };
    }
    // 4f. Reject all unknown / unverified system document types by default
    return {
      isProtected: true,
      reason: `Unknown or non-eligible system document type: system/${rawId}`,
      assetType: 'system_metadata'
    };
  }

  // 5. Sequence markers or idempotency tokens outside system collection are prohibited
  if (lowerCol !== 'system' && (lowerId.startsWith('res_') || lowerId.startsWith('op_'))) {
    return {
      isProtected: true,
      reason: `Sequence marker or idempotency record cannot be targeted outside system collection: ${rawCol}/${rawId}`,
      assetType: 'sequence_reservation'
    };
  }

  // 6. Protected collections denylist check (Defect D-3)
  const lowerProtectedCols = PROTECTED_COLLECTIONS.map(c => c.toLowerCase());
  if (lowerProtectedCols.includes(lowerCol) || lowerProtectedCols.some(c => normPath.startsWith(c + '/'))) {
    if (lowerCol === 'settings' || normPath.startsWith('settings/')) {
      return { isProtected: true, reason: 'Temple identity and account settings (settings/*)', assetType: 'master_configuration' };
    }
    if (lowerCol === 'funds' || normPath.startsWith('funds/')) {
      return { isProtected: true, reason: 'Master fund definition (funds/*)', assetType: 'master_configuration' };
    }
    if (lowerCol === 'incomecategories' || lowerCol === 'expensecategories' || normPath.startsWith('incomecategories/') || normPath.startsWith('expensecategories/')) {
      return { isProtected: true, reason: 'Master accounting category definition', assetType: 'master_configuration' };
    }
    if (lowerCol === 'bankaccounts' || normPath.startsWith('bankaccounts/')) {
      return { isProtected: true, reason: 'Bank account configuration (bankAccounts/*)', assetType: 'master_configuration' };
    }
    if (lowerCol === 'users' || normPath.startsWith('users/')) {
      return { isProtected: true, reason: 'Authentication and access control record (users/*)', assetType: 'authentication_config' };
    }
    if (lowerCol === 'payments' || normPath.startsWith('payments/')) {
      return { isProtected: true, reason: 'Expense payment vouchers are protected financial records (payments/*)', assetType: 'protected_financial_record' };
    }
    if (lowerCol === 'transfers' || normPath.startsWith('transfers/')) {
      return { isProtected: true, reason: 'Fund transfers are protected financial records (transfers/*)', assetType: 'protected_financial_record' };
    }
    if (lowerCol === 'loans' || normPath.startsWith('loans/')) {
      return { isProtected: true, reason: 'Loans and repayments are protected financial records (loans/*)', assetType: 'protected_financial_record' };
    }
    if (lowerCol === 'chittycollections' || lowerCol === 'chittypayouts' || lowerCol === 'chittymembers' ||
        normPath.startsWith('chittycollections/') || normPath.startsWith('chittypayouts/') || normPath.startsWith('chittymembers/')) {
      return { isProtected: true, reason: 'Chitty member and financial records are protected (chitty*/*)', assetType: 'chitty_record' };
    }
    return { isProtected: true, reason: `Protected collection: ${rawCol}`, assetType: 'protected_collection' };
  }

  // Not protected by path rule alone. Candidate eligibility evaluated by whitelist and relational validation.
  return { isProtected: false };
}

class CleanupOrchestrator {
  constructor(options = {}) {
    this.options = options;
    this.allowedCollections = ALLOWED_CANDIDATE_COLLECTIONS;
    this.protectedCollections = PROTECTED_COLLECTIONS;
  }

  /**
   * Mode: INVENTORY
   * Inspects a synthetic fixture and categorizes records into candidates vs protected assets.
   */
  inventory(fixture) {
    if (!fixture || typeof fixture !== 'object') {
      throw new Error('INVALID_FIXTURE: Fixture must be an object containing collections or documents.');
    }

    const report = {
      mode: 'inventory',
      timestamp: new Date().toISOString(),
      counts: {
        totalRecordsInspected: 0,
        confirmedCandidates: 0,
        historicalArtifacts: 0,
        protectedMetadata: 0,
        masterConfiguration: 0,
        unverified: 0
      },
      candidates: [],
      protected: [],
      unverified: []
    };

    const collections = fixture.collections || fixture;

    for (const [colName, docs] of Object.entries(collections)) {
      if (!Array.isArray(docs) && typeof docs !== 'object') continue;
      const docList = Array.isArray(docs) ? docs : Object.values(docs);

      for (const doc of docList) {
        if (!doc) continue;
        report.counts.totalRecordsInspected++;
        const docId = doc.firestoreId || doc._firestoreId || doc.id || doc._id || 'unknown';
        const protection = checkProtectedPath(colName, docId);

        if (protection.isProtected) {
          report.counts.protectedMetadata++;
          report.protected.push({
            collection: colName,
            docId: docId,
            assetType: protection.assetType,
            reason: protection.reason,
            dataPreview: {
              keys: Object.keys(doc).slice(0, 5)
            }
          });
          continue;
        }

        // Evaluate candidate status against whitelist
        const isCandidateCol = ALLOWED_CANDIDATE_COLLECTIONS.includes(colName);
        if (!isCandidateCol) {
          report.counts.unverified++;
          report.unverified.push({
            collection: colName,
            docId: docId,
            reason: 'Unsupported collection path for financial cleanup'
          });
          continue;
        }

        // Classify record
        let defaultRecordType = `${colName}_record`;
        if (colName === 'system') {
          defaultRecordType = docId.startsWith('res_') ? 'billing_reservation' : (docId.startsWith('op_') ? 'billing_idempotency' : 'system_record');
        }

        const classification = doc._classification || (
          (doc.devoteeName === 'twstg' || doc.person === 'maya' || doc.notes === 'test')
            ? RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD
            : RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION
        );

        if (classification === RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD) {
          report.counts.unverified++;
          report.unverified.push({
            collection: colName,
            docId: docId,
            reason: 'Unverified test record requiring explicit forensic identification'
          });
        } else {
          report.counts.confirmedCandidates++;
          report.candidates.push({
            collection: colName,
            docId: docId,
            recordType: doc._recordType || defaultRecordType,
            classification: classification,
            fingerprint: computeSha256(doc),
            amount: doc.amount || doc.totalAmount || 0,
            date: doc.date || null
          });
        }
      }
    }

    return report;
  }

  /**
   * Mode: VALIDATE
   * Rigorously validates a manifest against schema rules, protected-record denylists,
   * dependency relationships, and authorization status.
   */
  validateManifest(manifest, datasetFixture = null, options = {}) {
    const result = {
      valid: false,
      schemaVersion: null,
      manifestId: null,
      errors: [],
      warnings: [],
      rejectedEntries: [],
      protectedEntries: [],
      validatedCandidates: [],
      dependencyConflicts: [],
      missingDependencies: [],
      unverifiedEntries: []
    };

    // 1. Structure and schema check
    if (!manifest || typeof manifest !== 'object') {
      result.errors.push('MALFORMED_MANIFEST: Manifest must be a non-null JSON object.');
      return result;
    }

    if (manifest.manifestVersion !== MANIFEST_SCHEMA_VERSION) {
      result.errors.push(`UNSUPPORTED_VERSION: Manifest version "${manifest.manifestVersion}" does not match required version "${MANIFEST_SCHEMA_VERSION}".`);
      return result;
    }

    result.schemaVersion = manifest.manifestVersion;
    result.manifestId = manifest.manifestId || 'unspecified_manifest';

    // 2. Reject override or bypass attempts in manifest or options (Preserve Execution Lock)
    const manifestStr = JSON.stringify(manifest || {});
    const optionsStr = JSON.stringify(options || {});
    const combinedStr = manifestStr + ' ' + optionsStr;
    const suspiciousPattern = /overrideProtected|forceDelete|force_delete|force-delete|ignoreDenylist|ignore_protection|ignore-protection|ignoreProtection|bypassSafeguards|bypass_safeguards|bypass-safeguards|allowProtected|skipValidation|dryRunBypass|disableSafetyChecks|adminBypass|emergencyDelete|bypass_protection|force_execution|unconditionalDelete/i;

    if (suspiciousPattern.test(combinedStr)) {
      result.errors.push('SECURITY_VIOLATION: Manifest or options attempt to override protected-path rules or safety safeguards.');
      return result;
    }

    if (!Array.isArray(manifest.entries)) {
      result.errors.push('MALFORMED_MANIFEST: Manifest entries must be an array.');
      return result;
    }

    const seenDocPaths = new Set();
    const fixtureMap = new Map();

    // Index dataset fixture if provided
    if (datasetFixture && typeof datasetFixture === 'object') {
      const collections = datasetFixture.collections || datasetFixture;
      for (const [colName, docs] of Object.entries(collections)) {
        if (!docs) continue;
        const docList = Array.isArray(docs) ? docs : Object.values(docs);
        for (const d of docList) {
          if (!d) continue;
          const id = String(d.firestoreId || d._firestoreId || d.id || d._id || '');
          if (id) {
            fixtureMap.set(`${colName}/${id}`, d);
          }
        }
      }
    }

    // Pre-index manifest entries for order-independent reciprocal validation
    const manifestEntryMap = new Map();
    for (const e of manifest.entries) {
      if (e && typeof e === 'object' && e.collection && e.docId) {
        const k = `${String(e.collection).trim()}/${String(e.docId).trim()}`;
        manifestEntryMap.set(k, e);
      }
    }

    // 3. Entry by entry validation
    for (let i = 0; i < manifest.entries.length; i++) {
      const entry = manifest.entries[i];
      const entryRef = `Entry[${i}]`;

      if (!entry || typeof entry !== 'object') {
        result.rejectedEntries.push({
          index: i,
          reason: 'Entry is null or not an object',
          entry
        });
        result.errors.push(`${entryRef}: Invalid entry format.`);
        continue;
      }

      // Check missing document ID
      if (!entry.docId || typeof entry.docId !== 'string' || entry.docId.trim() === '') {
        result.rejectedEntries.push({
          index: i,
          reason: 'Missing or empty document ID',
          entry
        });
        result.errors.push(`${entryRef}: Missing document ID.`);
        continue;
      }

      const docId = entry.docId.trim();
      const col = String(entry.collection || '').trim();

      // Check missing collection
      if (!col) {
        result.rejectedEntries.push({
          index: i,
          docId,
          reason: 'Missing collection path',
          entry
        });
        result.errors.push(`${entryRef}: Missing collection path for doc ${docId}.`);
        continue;
      }

      // Check malformed document ID (slashes, backslashes, traversal, control characters, internal whitespace)
      if (/[\/\\\0\s]|\.\./.test(docId)) {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Malformed document ID "${docId}". Slashes, whitespace, control characters, and path traversal are prohibited.`,
          entry
        });
        result.errors.push(`${entryRef}: Malformed document ID "${docId}".`);
        continue;
      }

      const fullPath = `${col}/${docId}`;

      // Check duplicate document ID
      if (seenDocPaths.has(fullPath)) {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Duplicate document ID in manifest: ${fullPath}`,
          entry
        });
        result.errors.push(`${entryRef}: Duplicate document ID "${fullPath}".`);
        continue;
      }
      seenDocPaths.add(fullPath);

      // Check protected-record denylist FIRST before collection whitelist
      const protection = checkProtectedPath(col, docId);
      if (protection.isProtected) {
        result.protectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: protection.reason,
          assetType: protection.assetType,
          entry
        });
        result.errors.push(`${entryRef}: Protected record denylist violation: ${fullPath} (${protection.reason}).`);
        continue;
      }

      // Check unsupported collection path (Defect D-3: explicit deny-by-default)
      if (!ALLOWED_CANDIDATE_COLLECTIONS.includes(col)) {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Unsupported or non-candidate collection path: ${col}. Only candidate collections are eligible.`,
          entry
        });
        result.errors.push(`${entryRef}: Unsupported collection path "${col}".`);
        continue;
      }

      // Check classification validity
      const validClassifications = Object.values(RECORD_CLASSIFICATIONS);
      if (!entry.classification || !validClassifications.includes(entry.classification)) {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Invalid classification "${entry.classification}". Must be one of ${validClassifications.join(', ')}`,
          entry
        });
        result.errors.push(`${entryRef}: Invalid classification for doc ${docId}.`);
        continue;
      }

      // Check protected classifications that must remain preserved
      if (
        entry.classification === RECORD_CLASSIFICATIONS.MASTER_CONFIGURATION ||
        entry.classification === RECORD_CLASSIFICATIONS.NUMBERING_AND_RECOVERY_METADATA ||
        entry.classification === RECORD_CLASSIFICATIONS.AUTHENTICATION_AND_APP_CONFIG ||
        entry.classification === RECORD_CLASSIFICATIONS.DERIVED_FINANCIAL_VALUE
      ) {
        result.protectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Classification "${entry.classification}" mandates preservation.`,
          assetType: entry.classification,
          entry
        });
        result.warnings.push(`${entryRef}: Entry ${fullPath} classified as ${entry.classification} is marked protected and will not be removed.`);
        continue;
      }

      // Check unverified records
      if (
        entry.classification === RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD ||
        entry.verificationStatus === 'unverified'
      ) {
        result.unverifiedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: 'Record is unverified and cannot be automatically approved for cleanup.',
          entry
        });
        result.errors.push(`${entryRef}: Unverified candidate "${fullPath}" cannot be automatically approved.`);
        continue;
      }

      // Check approval fields
      if (entry.approvalStatus !== 'trustee_approved') {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Unapproved entry status: "${entry.approvalStatus}". Trustee approval required.`,
          entry
        });
        result.errors.push(`${entryRef}: Entry ${fullPath} lacks required trustee approval.`);
        continue;
      }

      // 4. Dependency-Aware Relational Validation
      const docFixture = fixtureMap.get(fullPath) || entry.documentData;

      if (col === 'billing') {
        const linkedRcptId = entry.expectedRelationships?.linkedReceiptId ||
          entry.expectedRelationships?.accountingReceiptId ||
          entry.linkedRecordIds?.find(id => String(id).startsWith('rcpt_')) ||
          (docFixture && docFixture.accountingReceiptId);

        if (!linkedRcptId) {
          result.missingDependencies.push({
            entryDocId: docId,
            dependencyType: 'linked_receipt',
            reason: `Billing document ${docId} has no linked receipt specified.`
          });
          result.errors.push(`${entryRef}: Bill ${docId} has missing linked receipt reference.`);
        } else {
          // Check if linked receipt is included in the manifest
          const rcptInManifest = manifestEntryMap.has(`receipts/${linkedRcptId}`);
          if (!rcptInManifest) {
            result.missingDependencies.push({
              entryDocId: docId,
              missingDocPath: `receipts/${linkedRcptId}`,
              reason: `Bill ${docId} references linked receipt ${linkedRcptId} which is not included in the manifest.`
            });
            result.errors.push(`${entryRef}: Bill ${docId} references linked receipt ${linkedRcptId} which is missing from manifest.`);
          } else {
            // Reciprocal link check on receipt
            const rcptEntry = manifestEntryMap.get(`receipts/${linkedRcptId}`);
            const rcptFixture = fixtureMap.get(`receipts/${linkedRcptId}`) || (rcptEntry && rcptEntry.documentData);
            const rcptBillId = rcptEntry?.expectedRelationships?.billingFirestoreId ||
              rcptEntry?.expectedRelationships?.linkedBillId ||
              (rcptEntry?.expectedRelationships?.billingId !== undefined && rcptEntry?.expectedRelationships?.billingId !== null ? `bill_${rcptEntry.expectedRelationships.billingId}` : null) ||
              rcptFixture?.billingFirestoreId ||
              (rcptFixture?.billingId !== undefined && rcptFixture?.billingId !== null ? `bill_${rcptFixture.billingId}` : null) ||
              rcptFixture?.linkedBillId;

            if (rcptBillId && rcptBillId !== docId) {
              result.dependencyConflicts.push({
                entryDocId: docId,
                conflictingDocPath: `receipts/${linkedRcptId}`,
                reason: `Bill ${docId} links to receipt ${linkedRcptId}, but receipt references bill ${rcptBillId}.`
              });
              result.errors.push(`${entryRef}: Conflicting bill/receipt linkage: Bill ${docId} references receipt ${linkedRcptId}, but receipt claims ${rcptBillId}.`);
            }
          }

          if (fixtureMap.size > 0 && !fixtureMap.has(`receipts/${linkedRcptId}`)) {
            result.missingDependencies.push({
              entryDocId: docId,
              missingDocPath: `receipts/${linkedRcptId}`,
              reason: `Bill ${docId} references nonexistent receipt ${linkedRcptId} in fixture.`
            });
            result.errors.push(`${entryRef}: Bill ${docId} references missing linked receipt ${linkedRcptId}.`);
          }
        }
      } else if (col === 'receipts') {
        // Physical receipt check (Defect D-2)
        if (docId.startsWith('rcpt_phys_') || entry.recordType === 'physical_receipt') {
          result.protectedEntries.push({
            index: i,
            collection: col,
            docId,
            reason: 'Physical receipt is protected from cleanup.',
            assetType: 'physical_receipt',
            entry
          });
          result.errors.push(`${entryRef}: Physical receipt ${docId} cannot be targeted for cleanup.`);
          continue;
        }

        // Independent receipt check: must have source === 'billing' (Defect D-2)
        const rcptSource = docFixture?.source || entry.expectedRelationships?.source || entry.source || (entry.documentData && entry.documentData.source);
        if (rcptSource && rcptSource !== 'billing') {
          result.protectedEntries.push({
            index: i,
            collection: col,
            docId,
            reason: `Independent receipt with source "${rcptSource}" is protected from cleanup.`,
            assetType: 'independent_receipt',
            entry
          });
          result.errors.push(`${entryRef}: Independent receipt ${docId} (source: ${rcptSource}) cannot be targeted for cleanup.`);
          continue;
        }

        // Linked bill identification using actual schema fields: billingFirestoreId and billingId (Defect D-2)
        const linkedBillId = entry.expectedRelationships?.billingFirestoreId ||
          entry.expectedRelationships?.linkedBillId ||
          (entry.expectedRelationships?.billingId !== undefined && entry.expectedRelationships?.billingId !== null ? `bill_${entry.expectedRelationships.billingId}` : null) ||
          entry.linkedRecordIds?.find(id => String(id).startsWith('bill_')) ||
          (docFixture && (
            docFixture.billingFirestoreId ||
            (docFixture.billingId !== undefined && docFixture.billingId !== null ? `bill_${docFixture.billingId}` : null) ||
            docFixture.linkedBillId ||
            docFixture.accountingBillId
          ));

        if (!linkedBillId) {
          result.missingDependencies.push({
            entryDocId: docId,
            dependencyType: 'linked_bill',
            reason: `Receipt ${docId} has missing linked bill reference (billingFirestoreId / billingId). Unlinked receipts fail closed.`
          });
          result.errors.push(`${entryRef}: Receipt ${docId} has missing linked bill reference.`);
          continue;
        }

        // Bill must be in manifest
        const billInManifest = manifestEntryMap.has(`billing/${linkedBillId}`);
        if (!billInManifest) {
          result.missingDependencies.push({
            entryDocId: docId,
            missingDocPath: `billing/${linkedBillId}`,
            reason: `Receipt ${docId} references bill ${linkedBillId} which is not included in the manifest.`
          });
          result.errors.push(`${entryRef}: Receipt ${docId} references bill ${linkedBillId} which is missing from manifest.`);
        }

        // Reciprocal checks against bill fixture / entry
        const billEntry = manifestEntryMap.get(`billing/${linkedBillId}`);
        const billFixture = fixtureMap.get(`billing/${linkedBillId}`) || (billEntry && billEntry.documentData);

        if (billFixture || billEntry) {
          const billRcptId = billEntry?.expectedRelationships?.linkedReceiptId ||
            billEntry?.expectedRelationships?.accountingReceiptId ||
            billFixture?.accountingReceiptId;

          if (billRcptId && billRcptId !== docId) {
            result.dependencyConflicts.push({
              entryDocId: docId,
              conflictingDocPath: `billing/${linkedBillId}`,
              reason: `Receipt ${docId} links to bill ${linkedBillId}, but bill references receipt ${billRcptId}.`
            });
            result.errors.push(`${entryRef}: Conflicting bill/receipt linkage between ${docId} and ${linkedBillId}.`);
          }

          // Check reservationDocId consistency if present on both
          const rcptResId = entry.expectedRelationships?.reservationDocId || docFixture?.reservationDocId;
          const billResId = billEntry?.expectedRelationships?.reservationDocId ||
            billEntry?.expectedRelationships?.linkedReservationId ||
            billFixture?.reservationDocId;

          if (rcptResId && billResId && rcptResId !== billResId) {
            result.dependencyConflicts.push({
              entryDocId: docId,
              conflictingDocPath: `billing/${linkedBillId}`,
              reason: `Receipt ${docId} specifies reservation ${rcptResId}, but bill specifies ${billResId}.`
            });
            result.errors.push(`${entryRef}: Contradictory reservation linkage between receipt ${docId} and bill ${linkedBillId}.`);
          }
        }
      } else if (col === 'system') {
        // Narrowly scoped system collection validation (Defect D-1)
        const isRes = docId.startsWith('res_') && !docId.startsWith('res_phys_');
        const isOp = docId.startsWith('op_') && !docId.startsWith('op_phys_');

        if (!isRes && !isOp) {
          result.rejectedEntries.push({
            index: i,
            collection: col,
            docId,
            reason: `System collection entry "${docId}" is not an eligible billing reservation or idempotency document.`,
            entry
          });
          result.errors.push(`${entryRef}: Non-eligible or unknown system document type "${fullPath}".`);
          continue;
        }

        // Must link to a confirmed test bill
        const linkedBillId = entry.expectedRelationships?.billDocId ||
          entry.expectedRelationships?.linkedBillId ||
          entry.linkedRecordIds?.find(id => String(id).startsWith('bill_')) ||
          (docFixture && (docFixture.billDocId || docFixture.linkedBillId));

        if (!linkedBillId) {
          result.missingDependencies.push({
            entryDocId: docId,
            dependencyType: 'linked_bill',
            reason: `System document ${docId} has no linked bill specified. Must be linked to a confirmed test bill.`
          });
          result.errors.push(`${entryRef}: System document ${docId} has missing linked bill reference.`);
          continue;
        }

        // Bill must be in manifest
        const billInManifest = manifestEntryMap.has(`billing/${linkedBillId}`);
        if (!billInManifest) {
          result.missingDependencies.push({
            entryDocId: docId,
            missingDocPath: `billing/${linkedBillId}`,
            reason: `System document ${docId} references bill ${linkedBillId} which is not included in the manifest.`
          });
          result.errors.push(`${entryRef}: System document ${docId} references bill ${linkedBillId} which is missing from manifest.`);
        }

        // Reciprocal checks against bill
        const billEntry = manifestEntryMap.get(`billing/${linkedBillId}`);
        const billFixture = fixtureMap.get(`billing/${linkedBillId}`) || (billEntry && billEntry.documentData);

        if (billFixture || billEntry) {
          if (isRes) {
            const expectedResId = billEntry?.expectedRelationships?.linkedReservationId ||
              billEntry?.expectedRelationships?.reservationDocId ||
              billFixture?.reservationDocId;
            if (expectedResId && expectedResId !== docId) {
              result.dependencyConflicts.push({
                entryDocId: docId,
                conflictingDocPath: `billing/${linkedBillId}`,
                reason: `Reservation ${docId} claims bill ${linkedBillId}, but bill specifies reservation ${expectedResId}.`
              });
              result.errors.push(`${entryRef}: Conflicting reservation linkage between ${docId} and ${linkedBillId}.`);
            }
          }
          if (isOp) {
            const expectedOpId = billEntry?.expectedRelationships?.linkedOperationId ||
              billEntry?.expectedRelationships?.operationId ||
              billFixture?.operationId;
            if (expectedOpId && expectedOpId !== docId) {
              result.dependencyConflicts.push({
                entryDocId: docId,
                conflictingDocPath: `billing/${linkedBillId}`,
                reason: `Idempotency record ${docId} claims bill ${linkedBillId}, but bill specifies operation ${expectedOpId}.`
              });
              result.errors.push(`${entryRef}: Conflicting idempotency linkage between ${docId} and ${linkedBillId}.`);
            }
          }
        }
      }

      // Check unknown dependencies
      if (entry.unknownDependencies && entry.unknownDependencies.length > 0) {
        result.dependencyConflicts.push({
          entryDocId: docId,
          unknownDependencies: entry.unknownDependencies,
          reason: `Record ${docId} contains unknown dependencies that cannot be safely resolved.`
        });
        result.errors.push(`${entryRef}: Unknown dependencies in ${docId} block execution eligibility.`);
      }

      // Entry successfully passed validation checks
      result.validatedCandidates.push({
        collection: col,
        docId,
        recordType: entry.recordType,
        classification: entry.classification,
        fingerprint: entry.fingerprint || (docFixture ? computeSha256(docFixture) : null),
        linkedRecordIds: entry.linkedRecordIds || [],
        cleanupReason: entry.cleanupReason
      });
    }

    // Set overall validity
    result.valid = result.errors.length === 0 && result.validatedCandidates.length > 0;
    return result;
  }

  /**
   * Mode: DRY-RUN
   * Performs full simulation of manifest validation and reports proposed changes.
   * STRICTLY READ-ONLY: Produces zero writes and zero mutations.
   */
  dryRun(manifest, datasetFixture = null, options = {}) {
    const valResult = this.validateManifest(manifest, datasetFixture, options);

    const dryRunReport = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      reportType: 'CLEANUP_ORCHESTRATOR_DRY_RUN',
      generatedAt: new Date().toISOString(),
      executionMode: 'dry-run',
      mutationsPerformed: 0,
      writesPerformed: 0,
      deletionsPerformed: 0,
      status: valResult.valid ? 'PROPOSAL_VALIDATED' : 'PROPOSAL_BLOCKED_WITH_ERRORS',
      counts: {
        totalManifestEntries: Array.isArray(manifest?.entries) ? manifest.entries.length : 0,
        validatedCandidates: valResult.validatedCandidates.length,
        rejectedEntries: valResult.rejectedEntries.length,
        protectedEntries: valResult.protectedEntries.length,
        unverifiedEntries: valResult.unverifiedEntries.length,
        missingDependencies: valResult.missingDependencies.length,
        conflictingRelationships: valResult.dependencyConflicts.length,
        recordsProposedForCleanup: valResult.valid ? valResult.validatedCandidates.length : 0,
        recordsExplicitlyPreserved: valResult.protectedEntries.length
      },
      preservedMetadataRules: [
        {
          assetType: 'sequence_counters',
          targetPath: 'system/counters',
          rule: 'MANDATORY MONOTONIC PRESERVATION. Counter must never be decremented, reset to zero, or deleted.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'recovery_metadata',
          targetPath: 'system/_restoreProgress',
          rule: 'MANDATORY AUDIT PRESERVATION. System restore progress and recovery audit documents remain permanently intact.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'protected_financial_records',
          targetPath: 'payments/*, transfers/*, loans/*, chitty*/*',
          rule: 'MANDATORY FINANCIAL PRESERVATION. Payments, transfers, loans, and chitty records are strictly excluded from candidate collections and protected by denylist.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'master_configuration',
          targetPath: 'settings/set_1, funds/*, incomeCategories/*, expenseCategories/*, bankAccounts/*, users/*',
          rule: '100% PRESERVED. Temple settings, 6 accounting funds, category master records, bank accounts, and auth configuration are never modified by cleanup.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'physical_receipts_and_reservations',
          targetPath: 'receipts/rcpt_phys_*, system/res_phys_*, system/op_phys_*',
          rule: 'UNTOUCHED. Physical receipt documents, physical reservations, and independent receipts are protected from cleanup.',
          status: 'UNTOUCHED'
        }
      ],
      proposedCleanupCandidates: valResult.valid ? valResult.validatedCandidates : [],
      rejectedEntries: valResult.rejectedEntries,
      protectedEntries: valResult.protectedEntries,
      unverifiedEntries: valResult.unverifiedEntries,
      missingDependencies: valResult.missingDependencies,
      conflictingRelationships: valResult.dependencyConflicts,
      validationErrors: valResult.errors,
      validationWarnings: valResult.warnings,
      localCacheEvictionPlan: {
        strategy: 'SELECTIVE_EVICTION_BY_DOC_ID',
        mechanism: 'Evict only verified candidate document IDs from local IndexedDB object stores (billing, receipts) after verified cloud cleanup.',
        prohibitedActions: [
          'DO NOT call indexedDB.deleteDatabase()',
          'DO NOT call clearStore("settings")',
          'DO NOT call clearStore("funds")',
          'DO NOT clear unrelated browser cache or user session state'
        ],
        proposedLocalEvictions: valResult.valid ? valResult.validatedCandidates.map(c => `${c.collection}/${c.docId}`) : []
      },
      executionStatus: {
        isExecutionEnabled: false,
        reasonsExecutionBlocked: [
          'STEP 33.120 GOVERNANCE: Execute mode is strictly disabled in STEP 33.120.',
          'FIRESTORE_SECURITY_RULES: Candidate rules enforce "allow delete: if false;" across financial collections.',
          'AUTHORIZATION_GATE: Requires independent written sign-off from Temple Trustees prior to any mutation.',
          'BACKUP_PREREQUISITE: Requires verified production backup under schema v23.2 with SHA-256 integrity verification immediately prior to execution.'
        ]
      },
      futureApprovedExecutionRunbook: [
        '1. Secure verified production snapshot via authorized administrator session.',
        '2. Verify snapshot SHA-256 integrity using RFC 8785 canonical digest.',
        '3. Inspect live production document IDs to generate authoritative live manifest.',
        '4. Present live manifest to Temple Trustees for formal written approval.',
        '5. Execute batch deletion via authorized administrative channel (Firebase Console or privileged Admin script).',
        '6. Perform post-cleanup multi-module reconciliation verifying Dashboard, Cash Book, Bank Book, and Ledger reflect ₹0.00 baseline without errors.',
        '7. Verify monotonic counters and sequence reservations remain completely intact.'
      ]
    };

    // Calculate deterministic checksum of dry run output (excluding timestamp and checksum field)
    const checksumPayload = {
      manifestId: manifest?.manifestId,
      schemaVersion: dryRunReport.schemaVersion,
      counts: dryRunReport.counts,
      candidates: dryRunReport.proposedCleanupCandidates,
      rejected: dryRunReport.rejectedEntries,
      protected: dryRunReport.protectedEntries,
      conflicts: dryRunReport.conflictingRelationships
    };

    dryRunReport.dryRunChecksum = computeSha256(checksumPayload);
    return dryRunReport;
  }

  /**
   * Mode: EXECUTE
   * STRICTLY AND PERMANENTLY DISABLED in STEP 33.120.
   * Physical deletion of records is prohibited. Always throws an error and performs zero deletions.
   */
  execute(manifest, options = {}) {
    const error = new Error('EXECUTE_MODE_DISABLED: Execution mode is strictly disabled in STEP 33.120. Physical deletion of records is permanently prohibited.');
    error.code = 'EXECUTE_MODE_DISABLED';
    error.details = {
      attemptedMode: 'execute',
      mutationsPerformed: 0,
      deletionsPerformed: 0,
      trusteeApprovalBypassed: false,
      reason: 'Safety boundary enforcement. STEP 33.120 permits only offline validation and dry-run reporting. Deletion execution is unconditionally locked.'
    };
    throw error;
  }
}

module.exports = {
  CleanupOrchestrator,
  MANIFEST_SCHEMA_VERSION,
  RECORD_CLASSIFICATIONS,
  ALLOWED_CANDIDATE_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  PROTECTED_EXACT_DOCS,
  checkProtectedPath,
  canonicalJsonStringify,
  computeSha256
};
