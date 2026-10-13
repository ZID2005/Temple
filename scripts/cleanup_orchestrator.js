/**
 * Safe Financial Data Cleanup Orchestrator (STEP 33.53)
 *
 * Implements safe, auditable orchestration for identifying, validating,
 * and preparing dummy/test financial transactions for eventual removal.
 *
 * MODES SUPPORTED:
 * - inventory: Inspect synthetic fixtures and classify candidate records.
 * - validate:  Validate manifest structure, dependencies, and protected path safeguards.
 * - dry-run:   Perform complete simulation without performing any writes or deletions.
 * - execute:   STRICTLY DISABLED in STEP 33.53. Fails closed and performs zero mutations.
 *
 * ABSOLUTE SAFETY BOUNDARIES:
 * - Zero connection to production Firebase (temple-f4f7d) or Vercel.
 * - Zero production reads, modifications, or deletions.
 * - Candidate rules (allow delete: if false;) respected; zero client-side delete bypasses.
 * - Monotonic counters (system/counters), reservations (system/res_*), and idempotency
 *   records (system/op_*) are strictly protected and never decremented or deleted.
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

const ALLOWED_CANDIDATE_COLLECTIONS = Object.freeze([
  'billing',
  'receipts',
  'payments',
  'transfers',
  'loans',
  'chittyCollections',
  'chittyPayouts',
  'chittyMembers',
  'migration_staging',
  '__system_diagnostics__'
]);

const PROTECTED_COLLECTIONS = Object.freeze([
  'system',
  'settings',
  'funds',
  'incomeCategories',
  'expenseCategories',
  'bankAccounts',
  'users'
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
 */
function checkProtectedPath(collection, docId) {
  const rawCol = String(collection || '').trim();
  const rawId = String(docId || '').trim();

  // Attempt URL decode to catch encoded bypass attempts (e.g., %73ystem)
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

  // 2. Entire protected collections (case-insensitive & normalized)
  const lowerProtectedCols = PROTECTED_COLLECTIONS.map(c => c.toLowerCase());
  if (lowerProtectedCols.includes(lowerCol) || lowerProtectedCols.some(c => normPath.startsWith(c + '/'))) {
    if (lowerCol === 'system' || normPath.startsWith('system/')) {
      if (lowerId.startsWith('res_') || normPath.includes('/res_')) {
        return { isProtected: true, reason: 'Sequence reservation document (system/res_*)', assetType: 'sequence_reservation' };
      }
      if (lowerId.startsWith('op_') || normPath.includes('/op_')) {
        return { isProtected: true, reason: 'Immutable idempotency token (system/op_*)', assetType: 'idempotency_record' };
      }
      return { isProtected: true, reason: 'System metadata document (system/*)', assetType: 'system_metadata' };
    }
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
    return { isProtected: true, reason: `Protected collection: ${rawCol}`, assetType: 'protected_collection' };
  }

  // 3. Document ID prefix protections regardless of collection specified (case-insensitive)
  if (lowerId === 'counters' || lowerId.startsWith('counters/') || normPath.endsWith('/counters')) {
    return { isProtected: true, reason: 'Global sequence counter document', assetType: 'sequence_counters' };
  }
  if (lowerId.startsWith('res_') || normPath.includes('/res_')) {
    return { isProtected: true, reason: 'Sequence reservation marker', assetType: 'sequence_reservation' };
  }
  if (lowerId.startsWith('op_') || normPath.includes('/op_')) {
    return { isProtected: true, reason: 'Idempotency operation record', assetType: 'idempotency_record' };
  }

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

        // Evaluate candidate status
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
            recordType: doc._recordType || `${colName}_record`,
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
  validateManifest(manifest, datasetFixture = null) {
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

    // 2. Reject override attempts
    const manifestStr = JSON.stringify(manifest);
    if (/overrideProtected|forceDelete|ignoreDenylist|bypassSafeguards|allowProtected|skipValidation|dryRunBypass|disableSafetyChecks|adminBypass/i.test(manifestStr)) {
      result.errors.push('SECURITY_VIOLATION: Manifest attempts to override protected-path rules or safety safeguards.');
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

      // Check unsupported collection path
      if (!ALLOWED_CANDIDATE_COLLECTIONS.includes(col)) {
        result.rejectedEntries.push({
          index: i,
          collection: col,
          docId,
          reason: `Unsupported collection path: ${col}`,
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
          entry.linkedRecordIds?.find(id => String(id).startsWith('rcpt_')) ||
          (docFixture && docFixture.accountingReceiptId);

        if (!linkedRcptId) {
          result.missingDependencies.push({
            entryDocId: docId,
            dependencyType: 'linked_receipt',
            reason: `Billing document ${docId} has no linked receipt specified.`
          });
          result.errors.push(`${entryRef}: Bill ${docId} has missing linked receipt reference.`);
        } else if (fixtureMap.size > 0 && !fixtureMap.has(`receipts/${linkedRcptId}`)) {
          result.missingDependencies.push({
            entryDocId: docId,
            missingDocPath: `receipts/${linkedRcptId}`,
            reason: `Bill ${docId} references nonexistent or missing receipt ${linkedRcptId}.`
          });
          result.errors.push(`${entryRef}: Bill ${docId} references missing linked receipt ${linkedRcptId}.`);
        }
      } else if (col === 'receipts') {
        const linkedBillId = entry.expectedRelationships?.linkedBillId ||
          entry.linkedRecordIds?.find(id => String(id).startsWith('bill_')) ||
          (docFixture && (docFixture.linkedBillId || docFixture.accountingBillId));

        if (linkedBillId && fixtureMap.size > 0) {
          const billFixture = fixtureMap.get(`billing/${linkedBillId}`);
          if (billFixture) {
            // Check reciprocal link consistency
            if (billFixture.accountingReceiptId && billFixture.accountingReceiptId !== docId) {
              result.dependencyConflicts.push({
                entryDocId: docId,
                conflictingDocPath: `billing/${linkedBillId}`,
                reason: `Receipt ${docId} links to bill ${linkedBillId}, but bill references ${billFixture.accountingReceiptId}.`
              });
              result.errors.push(`${entryRef}: Conflicting bill/receipt linkage between ${docId} and ${linkedBillId}.`);
            }
          }
        }
      } else if (col === 'transfers') {
        const fromAcc = entry.expectedRelationships?.fromAcc || (docFixture && docFixture.fromAcc);
        const toAcc = entry.expectedRelationships?.toAcc || (docFixture && docFixture.toAcc);
        if (!fromAcc || !toAcc || fromAcc === toAcc) {
          result.dependencyConflicts.push({
            entryDocId: docId,
            reason: `Incomplete or invalid transfer pair (fromAcc: "${fromAcc}", toAcc: "${toAcc}").`
          });
          result.errors.push(`${entryRef}: Transfer ${docId} has incomplete transfer pair.`);
        }
      } else if (col === 'chittyCollections' || col === 'chittyPayouts') {
        const memberId = entry.expectedRelationships?.memberId || (docFixture && docFixture.memberId);
        if (!memberId) {
          result.dependencyConflicts.push({
            entryDocId: docId,
            reason: `Chitty transaction ${docId} has missing memberId reference.`
          });
          result.errors.push(`${entryRef}: Chitty record ${docId} has missing member reference.`);
        } else if (fixtureMap.size > 0 && !fixtureMap.has(`chittyMembers/${memberId}`) && !fixtureMap.has(`chittyMembers/cm_${memberId}`)) {
          result.dependencyConflicts.push({
            entryDocId: docId,
            missingDocPath: `chittyMembers/${memberId}`,
            reason: `Chitty transaction ${docId} references inconsistent/nonexistent member ${memberId}.`
          });
          result.errors.push(`${entryRef}: Chitty record ${docId} references inconsistent member ${memberId}.`);
        }
      } else if (col === 'loans') {
        const isRepayment = entry.recordType === 'loan_repayment' || (docFixture && (docFixture.repayment > 0 && (!docFixture.loanReceived || docFixture.loanReceived === 0)));
        if (isRepayment) {
          const parentLoanId = entry.expectedRelationships?.parentLoanId || (docFixture && docFixture.parentLoanId);
          if (!parentLoanId) {
            result.dependencyConflicts.push({
              entryDocId: docId,
              reason: `Loan repayment ${docId} has missing parent loan reference.`
            });
            result.errors.push(`${entryRef}: Loan repayment ${docId} references missing parent loan.`);
          } else if (fixtureMap.size > 0 && !fixtureMap.has(`loans/${parentLoanId}`)) {
            result.dependencyConflicts.push({
              entryDocId: docId,
              missingDocPath: `loans/${parentLoanId}`,
              reason: `Loan repayment ${docId} references nonexistent parent loan ${parentLoanId}.`
            });
            result.errors.push(`${entryRef}: Loan repayment ${docId} has inconsistent loan references.`);
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
    const valResult = this.validateManifest(manifest, datasetFixture);

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
          assetType: 'sequence_reservations',
          targetPath: 'system/res_*',
          rule: 'MANDATORY AUDIT PRESERVATION. Historical sequence reservations remain intact.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'idempotency_tokens',
          targetPath: 'system/op_*',
          rule: 'IMMUTABLE AUDIT MARKERS. Write-once operation records remain permanently intact.',
          status: 'UNTOUCHED'
        },
        {
          assetType: 'master_configuration',
          targetPath: 'settings/set_1, funds/*, incomeCategories/*, expenseCategories/*, bankAccounts/*',
          rule: '100% PRESERVED. Temple settings, 6 accounting funds, category master records, and bank accounts are never modified by cleanup.',
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
        mechanism: 'Evict only verified candidate document IDs from local IndexedDB object stores (billing, receipts, payments, transfers, loans, chitty) after verified cloud cleanup.',
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
          'STEP 33.53 GOVERNANCE: Execute mode is strictly disabled in STEP 33.53.',
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
   * Must remain STRICTLY DISABLED in STEP 33.53.
   * Always throws an error and performs zero deletions.
   */
  execute(manifest, options = {}) {
    const error = new Error('EXECUTE_MODE_DISABLED: Execution mode is strictly disabled in STEP 33.53. Physical deletion of records is prohibited.');
    error.code = 'EXECUTE_MODE_DISABLED';
    error.details = {
      attemptedMode: 'execute',
      mutationsPerformed: 0,
      deletionsPerformed: 0,
      reason: 'Safety boundary violation. STEP 33.53 permits only inventory, validation, and dry-run operations.'
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
