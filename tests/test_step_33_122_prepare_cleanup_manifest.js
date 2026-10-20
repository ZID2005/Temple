/**
 * STEP 33.122: Offline Cleanup Manifest Preparation CLI Test Suite
 *
 * Strictly offline, air-gapped test suite verifying scripts/prepare_cleanup_manifest.js:
 * - Preflight baseline integrity & permanent execution lock verification
 * - Cryptographic canonicalization and SHA-256 integrity verification
 * - 4-document reciprocal cluster validation (bill, receipt, reservation, idempotency)
 * - Strict protection of physical receipts/reservations/ops, independent receipts,
 *   monotonic sequence counters, restore progress, payments, transfers, loans, chitty, master config
 * - Rejection of tampered hashes, duplicate document paths, unsupported schemas, malformed paths
 * - Output overwrite refusal guard (--force required)
 * - Unresolved records quarantine and itemized reporting
 * - Input export immutability verification (zero source mutation)
 * - Zero network calls, zero database operations, zero process spawns
 */

'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const child_process = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const {
  prepareCleanupManifest,
  runCli,
  verifyExportIntegrity,
  validateExportStructure,
  getBackupIntegrityPayload,
  indexExportDocuments,
  evaluateClusters,
  SUPPORTED_SCHEMA_VERSIONS
} = require('../scripts/prepare_cleanup_manifest');

const {
  CleanupOrchestrator,
  MANIFEST_SCHEMA_VERSION,
  RECORD_CLASSIFICATIONS,
  ALLOWED_CANDIDATE_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  PROTECTED_EXACT_DOCS,
  checkProtectedPath,
  canonicalJsonStringify,
  computeSha256
} = require('../scripts/cleanup_orchestrator');

// ---------------------------------------------------------------------------
// Network & Process Eavesdropping Guard (Air-Gap Verification)
// ---------------------------------------------------------------------------
let networkCallsDetected = 0;
let processSpawnDetected = 0;

const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalNetConnect = net.connect;
const originalSpawn = child_process.spawn;
const originalExec = child_process.exec;

http.request = function (...args) {
  networkCallsDetected++;
  throw new Error('NETWORK_VIOLATION: http.request is strictly forbidden in offline test suite.');
};
https.request = function (...args) {
  networkCallsDetected++;
  throw new Error('NETWORK_VIOLATION: https.request is strictly forbidden in offline test suite.');
};
net.connect = function (...args) {
  networkCallsDetected++;
  throw new Error('NETWORK_VIOLATION: net.connect is strictly forbidden in offline test suite.');
};
child_process.spawn = function (...args) {
  processSpawnDetected++;
  throw new Error('PROCESS_VIOLATION: child_process.spawn is strictly forbidden in offline test suite.');
};
child_process.exec = function (...args) {
  processSpawnDetected++;
  throw new Error('PROCESS_VIOLATION: child_process.exec is strictly forbidden in offline test suite.');
};

// ---------------------------------------------------------------------------
// Test Reporter State
// ---------------------------------------------------------------------------
const testResults = [];
let passCount = 0;
let failCount = 0;

function assert(condition, testId, description, evidence = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] ${testId}: ${description}`);
    testResults.push({ id: testId, status: 'PASS', description, evidence });
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}`);
    console.error(`     Evidence: ${evidence}`);
    testResults.push({ id: testId, status: 'FAIL', description, evidence });
  }
}

// ---------------------------------------------------------------------------
// Scratch Directory for Temporary Synthetic Exports
// ---------------------------------------------------------------------------
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch_step_33_122');
if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

function cleanScratch() {
  if (fs.existsSync(SCRATCH_DIR)) {
    const files = fs.readdirSync(SCRATCH_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(SCRATCH_DIR, file));
      } catch (e) {}
    }
  }
}

/**
 * Creates an authoritative Schema v23.2 synthetic export object with verified canonical SHA-256 hash.
 */
function createSyntheticExport(customizer = null) {
  const exportObj = {
    metadata: {
      schemaVersion: '23.2',
      timestamp: '2026-10-19T13:40:00.000Z',
      environment: 'synthetic_test',
      authoritativeSource: 'Firestore Export Drill',
      integrity: {
        algorithm: 'SHA-256',
        canonicalization: 'RFC8785-subset',
        hash: '',
        coveredSections: ['collections', 'counters', 'reservations', 'idempotency', 'system']
      }
    },
    collections: {
      billing: [
        {
          _firestoreId: 'bill_syn_1001',
          id: 1001,
          billNumber: 'BILL-1001',
          accountingReceiptId: 'rcpt_syn_1001',
          reservationDocId: 'res_syn_1001',
          operationId: 'op_syn_1001',
          amount: 250,
          devoteeName: 'Devotee Alpha',
          date: '2026-10-19'
        },
        {
          _firestoreId: 'bill_syn_1002',
          id: 1002,
          billNumber: 'BILL-1002',
          accountingReceiptId: 'rcpt_syn_1002',
          reservationDocId: 'res_syn_1002',
          operationId: 'op_syn_1002',
          amount: 500,
          devoteeName: 'Devotee Beta',
          date: '2026-10-19'
        }
      ],
      receipts: [
        {
          _firestoreId: 'rcpt_syn_1001',
          id: 1001,
          source: 'billing',
          billingId: 1001,
          billingFirestoreId: 'bill_syn_1001',
          reservationDocId: 'res_syn_1001',
          amount: 250,
          date: '2026-10-19'
        },
        {
          _firestoreId: 'rcpt_syn_1002',
          id: 1002,
          source: 'billing',
          billingId: 1002,
          billingFirestoreId: 'bill_syn_1002',
          reservationDocId: 'res_syn_1002',
          amount: 500,
          date: '2026-10-19'
        },
        {
          _firestoreId: 'rcpt_phys_2001',
          id: 2001,
          source: 'physical',
          receiptNo: 'PHYS-2001',
          amount: 1000,
          date: '2026-10-19'
        },
        {
          _firestoreId: 'rcpt_counter_3001',
          id: 3001,
          source: 'counter_manual',
          receiptNo: 'MANUAL-3001',
          amount: 150,
          date: '2026-10-19'
        }
      ],
      payments: [
        {
          _firestoreId: 'pmt_syn_1',
          voucherNo: 'V-001',
          amount: 750,
          payee: 'Temple Supplies Store'
        }
      ],
      transfers: [
        {
          _firestoreId: 'tx_syn_1',
          fromAcc: 'Cash in Hand',
          toAcc: 'Canara Bank',
          amount: 5000
        }
      ],
      loans: [
        {
          _firestoreId: 'loan_syn_1',
          borrower: 'Festival Committee',
          amount: 20000
        }
      ],
      chittyMembers: [
        {
          _firestoreId: 'chitty_mem_1',
          name: 'Member One'
        }
      ],
      chittyCollections: [
        {
          _firestoreId: 'chitty_col_1',
          amount: 1000
        }
      ],
      chittyPayouts: [
        {
          _firestoreId: 'chitty_payout_1',
          amount: 12000
        }
      ],
      settings: [
        {
          _firestoreId: 'set_1',
          templeName: 'Marutha Chamundi Devi Temple'
        }
      ],
      funds: [
        {
          _firestoreId: 'fund_general',
          name: 'General Fund'
        }
      ],
      incomeCategories: [
        {
          _firestoreId: 'cat_vazhipadu',
          name: 'Vazhipadu'
        }
      ],
      expenseCategories: [
        {
          _firestoreId: 'cat_pooja_expense',
          name: 'Pooja Expense'
        }
      ],
      bankAccounts: [
        {
          _firestoreId: 'bank_canara',
          accountNumber: '1234567890'
        }
      ],
      users: [
        {
          _firestoreId: 'user_trustee',
          role: 'trustee'
        }
      ]
    },
    counters: {
      globalSequenceCounter: 5000,
      billingReceiptCounter: 2000,
      receiptCounter: 2000,
      voucherCounter: 1000
    },
    reservations: [
      {
        _firestoreId: 'res_syn_1001',
        seqNumber: 1001,
        billDocId: 'bill_syn_1001',
        receiptDocId: 'rcpt_syn_1001',
        operationId: 'op_syn_1001'
      },
      {
        _firestoreId: 'res_syn_1002',
        seqNumber: 1002,
        billDocId: 'bill_syn_1002',
        receiptDocId: 'rcpt_syn_1002',
        operationId: 'op_syn_1002'
      },
      {
        _firestoreId: 'res_phys_2001',
        seqNumber: 2001,
        receiptDocId: 'rcpt_phys_2001'
      }
    ],
    idempotency: [
      {
        _firestoreId: 'op_syn_1001',
        operationId: 'op_syn_1001',
        billDocId: 'bill_syn_1001',
        receiptDocId: 'rcpt_syn_1001',
        resDocId: 'res_syn_1001',
        fingerprint: 'CANONICAL_FINGERPRINT_1001'
      },
      {
        _firestoreId: 'op_syn_1002',
        operationId: 'op_syn_1002',
        billDocId: 'bill_syn_1002',
        receiptDocId: 'rcpt_syn_1002',
        resDocId: 'res_syn_1002',
        fingerprint: 'CANONICAL_FINGERPRINT_1002'
      },
      {
        _firestoreId: 'op_phys_2001',
        operationId: 'op_phys_2001',
        receiptDocId: 'rcpt_phys_2001'
      }
    ],
    system: {
      counters: {
        globalSequenceCounter: 5000,
        billingReceiptCounter: 2000,
        receiptCounter: 2000,
        voucherCounter: 1000
      },
      _restoreProgress: {
        inProgress: false,
        lastRestoreDate: '2026-10-19'
      }
    }
  };

  if (typeof customizer === 'function') {
    customizer(exportObj);
  }

  // Compute canonical hash of the integrity payload
  const payload = getBackupIntegrityPayload(exportObj);
  const canonicalStr = canonicalJsonStringify(payload);
  const hash = computeSha256(canonicalStr);

  exportObj.metadata.integrity.hash = hash;
  exportObj.metadata.sha256 = hash;

  return exportObj;
}

/**
 * Writes an export object to scratch and returns full file path.
 */
function writeSyntheticExportFile(filename, exportObj) {
  const filePath = path.join(SCRATCH_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(exportObj, null, 2), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// TEST DRILL EXECUTION
// ---------------------------------------------------------------------------
async function runStep33122Tests() {
  console.log('========================================================================');
  console.log('   STEP 33.122: OFFLINE CLEANUP MANIFEST PREPARATION CLI TEST SUITE');
  console.log('   100% Air-Gapped Synthetic Verification (Zero Network / Zero DB)');
  console.log('========================================================================\n');

  // =========================================================================
  // GROUP 1: PREFLIGHT INTEGRITY & BASELINE VERIFICATION
  // =========================================================================
  console.log('--- GROUP 1: Preflight Baselines & Execution Lock Verification ---');

  const EXPECTED_HTML_HASH = 'E5991224013B752827E1C929350257C52C44100B28EC61BE3341F9EA2FD516DD';
  const EXPECTED_RULES_HASH = '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD';
  const EXPECTED_CANDIDATE_HASH = 'E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D';
  const EXPECTED_ORCH_HASH = 'E7CCADC2AA9CBF178AACA9134138DAA3B96D190AC82779959D5A26E71662301F';
  const EXPECTED_ORCH_TEST_HASH = '168C9DCE25A4E11C6865021CFE38A89D6045B7D8758BED5D356779E63FF80E5C';

  const htmlBuf = fs.readFileSync(path.join(__dirname, '..', 'Temple_Accounts-1.html'));
  const htmlHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();
  assert(htmlHash === EXPECTED_HTML_HASH && htmlBuf.length === 1145593, 'PRE-01', 'Main HTML baseline byte-for-byte exact match', `Hash: ${htmlHash}, Size: ${htmlBuf.length}`);

  const rulesBuf = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'));
  const rulesHash = crypto.createHash('sha256').update(rulesBuf).digest('hex').toUpperCase();
  assert(rulesHash === EXPECTED_RULES_HASH && rulesBuf.length === 1216, 'PRE-02', 'firestore.rules baseline byte-for-byte exact match', `Hash: ${rulesHash}`);

  const candBuf = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules.candidate'));
  const candHash = crypto.createHash('sha256').update(candBuf).digest('hex').toUpperCase();
  assert(candHash === EXPECTED_CANDIDATE_HASH && candBuf.length === 12407, 'PRE-03', 'firestore.rules.candidate baseline byte-for-byte exact match', `Hash: ${candHash}`);

  const orchBuf = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cleanup_orchestrator.js'));
  const orchHash = crypto.createHash('sha256').update(orchBuf).digest('hex').toUpperCase();
  assert(orchHash === EXPECTED_ORCH_HASH && orchBuf.length === 45231, 'PRE-04', 'cleanup_orchestrator.js baseline byte-for-byte exact match', `Hash: ${orchHash}`);

  const orchTestBuf = fs.readFileSync(path.join(__dirname, 'test_step_33_120_offline_cleanup_orchestrator.js'));
  const orchTestHash = crypto.createHash('sha256').update(orchTestBuf).digest('hex').toUpperCase();
  assert(orchTestHash === EXPECTED_ORCH_TEST_HASH && orchTestBuf.length === 37671, 'PRE-05', 'test_step_33_120 test suite baseline exact match', `Hash: ${orchTestHash}`);

  // Confirm orchestrator execution lock remains permanently enabled
  const orchSource = orchBuf.toString('utf8');
  assert(orchSource.includes('EXECUTE_MODE_DISABLED: Execution mode is strictly disabled in STEP 33.120'), 'LOCK-01', 'Permanent execution lock confirmed in scripts/cleanup_orchestrator.js');

  const orchestrator = new CleanupOrchestrator();
  let lockBlocked = false;
  try {
    orchestrator.execute({ manifestVersion: '1.0.0', entries: [] });
  } catch (err) {
    lockBlocked = (err.code === 'EXECUTE_MODE_DISABLED');
  }
  assert(lockBlocked, 'LOCK-02', 'orchestrator.execute() throws EXECUTE_MODE_DISABLED unconditionally');

  // Verify scripts/prepare_cleanup_manifest.js contains zero network / database / child_process imports
  const prepSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'prepare_cleanup_manifest.js'), 'utf8');
  const disallowedImports = ['child_process', 'http', 'https', 'net', 'dgram', 'firebase', 'firestore', 'fetch', 'axios', 'XMLHttpRequest'];
  const hasForbiddenImport = disallowedImports.some(pkg => new RegExp(`require\\(['"\`]${pkg}['"\`]\\)`).test(prepSource));
  assert(!hasForbiddenImport, 'CODE-AUDIT-01', 'prepare_cleanup_manifest.js imports zero network, db, or child_process packages');
  assert(!prepSource.includes('process.env.'), 'CODE-AUDIT-02', 'prepare_cleanup_manifest.js contains zero process.env reads');

  // =========================================================================
  // GROUP 2: SYNTHETIC EXPORT INTEGRITY & CANONICAL HASH VERIFICATION
  // =========================================================================
  console.log('\n--- GROUP 2: Canonical Integrity & Export Schema Verification ---');

  cleanScratch();
  const validExportObj = createSyntheticExport();
  const validExportFile = writeSyntheticExportFile('valid_export_v23_2.json', validExportObj);

  // 1. Valid export integrity verification
  const validVerification = verifyExportIntegrity(validExportObj);
  assert(validVerification.verified === true && validVerification.hash === validExportObj.metadata.integrity.hash,
    'INTEGRITY-01', 'Valid export verifies successfully with RFC 8785 SHA-256 hash', `Hash: ${validVerification.hash}`);

  // 2. Tampered export hash fails closed
  const tamperedExportObj = createSyntheticExport();
  tamperedExportObj.collections.billing[0].devoteeName = 'TAMPERED NAME AFTER HASH COMPUTATION';
  let tamperedCaught = false;
  try {
    verifyExportIntegrity(tamperedExportObj);
  } catch (err) {
    tamperedCaught = err.message.includes('INTEGRITY_CHECK_FAILED');
  }
  assert(tamperedCaught, 'INTEGRITY-02', 'Tampered export payload throws INTEGRITY_CHECK_FAILED');

  // 3. Missing integrity metadata fails closed
  const missingIntegrityObj = createSyntheticExport();
  delete missingIntegrityObj.metadata.integrity;
  delete missingIntegrityObj.metadata.sha256;
  let missingIntegrityCaught = false;
  try {
    verifyExportIntegrity(missingIntegrityObj);
  } catch (err) {
    missingIntegrityCaught = err.message.includes('MISSING_INTEGRITY_METADATA');
  }
  assert(missingIntegrityCaught, 'INTEGRITY-03', 'Missing integrity metadata throws MISSING_INTEGRITY_METADATA');

  // 4. Unsupported schema versions fail closed
  for (const badVer of ['23.0', '1.0.0', 'v2', '']) {
    const badVerObj = createSyntheticExport(obj => {
      obj.metadata.schemaVersion = badVer;
    });
    let badVerCaught = false;
    try {
      verifyExportIntegrity(badVerObj);
    } catch (err) {
      badVerCaught = err.message.includes('UNSUPPORTED_SCHEMA');
    }
    assert(badVerCaught, `INTEGRITY-04-${badVer || 'empty'}`, `Unsupported schema version "${badVer}" throws UNSUPPORTED_SCHEMA`);
  }

  // =========================================================================
  // GROUP 3: STRUCTURAL SOUNDNESS & MALFORMED INPUT REJECTION
  // =========================================================================
  console.log('\n--- GROUP 3: Structural Soundness & Malformed Input Rejection ---');

  // 1. Duplicate document ID in collection
  const dupDocObj = createSyntheticExport(obj => {
    obj.collections.billing.push({ ...obj.collections.billing[0] });
  });
  const dupDocFile = writeSyntheticExportFile('dup_doc_export.json', dupDocObj);
  let dupDocCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: dupDocFile,
      outputPath: path.join(SCRATCH_DIR, 'out_dup.json')
    });
  } catch (err) {
    dupDocCaught = err.message.includes('Duplicate document ID') || err.message.includes('EXPORT_STRUCTURE_INVALID');
  }
  assert(dupDocCaught, 'STRUCT-01', 'Duplicate document ID in billing collection rejected fail-closed');

  // 2. Duplicate reservation ID
  const dupResObj = createSyntheticExport(obj => {
    obj.reservations.push({ ...obj.reservations[0] });
  });
  const dupResFile = writeSyntheticExportFile('dup_res_export.json', dupResObj);
  let dupResCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: dupResFile,
      outputPath: path.join(SCRATCH_DIR, 'out_dup_res.json')
    });
  } catch (err) {
    dupResCaught = err.message.includes('Duplicate reservation ID') || err.message.includes('EXPORT_STRUCTURE_INVALID');
  }
  assert(dupResCaught, 'STRUCT-02', 'Duplicate reservation ID in reservations rejected fail-closed');

  // 3. Duplicate idempotency ID
  const dupOpObj = createSyntheticExport(obj => {
    obj.idempotency.push({ ...obj.idempotency[0] });
  });
  const dupOpFile = writeSyntheticExportFile('dup_op_export.json', dupOpObj);
  let dupOpCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: dupOpFile,
      outputPath: path.join(SCRATCH_DIR, 'out_dup_op.json')
    });
  } catch (err) {
    dupOpCaught = err.message.includes('Duplicate idempotency ID') || err.message.includes('EXPORT_STRUCTURE_INVALID');
  }
  assert(dupOpCaught, 'STRUCT-03', 'Duplicate idempotency ID rejected fail-closed');

  // 4. Malformed document ID with path traversal / slashes
  for (const badId of ['../etc/passwd', 'bill/sub', 'bill\\test', 'bill\0null']) {
    const badIdObj = createSyntheticExport(obj => {
      obj.collections.billing[0]._firestoreId = badId;
    });
    const badIdFile = writeSyntheticExportFile('bad_id_export.json', badIdObj);
    let badIdCaught = false;
    try {
      prepareCleanupManifest({
        exportPath: badIdFile,
        outputPath: path.join(SCRATCH_DIR, 'out_bad_id.json')
      });
    } catch (err) {
      badIdCaught = err.message.includes('path traversal') || err.message.includes('EXPORT_STRUCTURE_INVALID');
    }
    assert(badIdCaught, `STRUCT-04-${badId.replace(/[\/\\\0\.]/g, '_')}`, `Malformed document ID containing traversal/slashes "${badId}" rejected`);
  }

  // 5. Empty export file
  const emptyFile = path.join(SCRATCH_DIR, 'empty.json');
  fs.writeFileSync(emptyFile, '', 'utf8');
  let emptyCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: emptyFile,
      outputPath: path.join(SCRATCH_DIR, 'out_empty.json')
    });
  } catch (err) {
    emptyCaught = err.message.includes('EMPTY_EXPORT');
  }
  assert(emptyCaught, 'STRUCT-05', 'Empty export file throws EMPTY_EXPORT');

  // 6. Malformed JSON file
  const malformedJsonFile = path.join(SCRATCH_DIR, 'malformed.json');
  fs.writeFileSync(malformedJsonFile, '{ "broken": json', 'utf8');
  let malformedCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: malformedJsonFile,
      outputPath: path.join(SCRATCH_DIR, 'out_malformed.json')
    });
  } catch (err) {
    malformedCaught = err.message.includes('MALFORMED_JSON_EXPORT');
  }
  assert(malformedCaught, 'STRUCT-06', 'Malformed JSON export throws MALFORMED_JSON_EXPORT');

  // =========================================================================
  // GROUP 4: COMPLETE VALID CLUSTERS & PROPOSED MANIFEST GENERATION
  // =========================================================================
  console.log('\n--- GROUP 4: Valid Complete Clusters & Manifest Generation ---');

  const manifestPath = path.join(SCRATCH_DIR, 'proposed_cleanup_manifest.json');
  const unresolvedPath = path.join(SCRATCH_DIR, 'unresolved_records.json');

  const preExportHash = crypto.createHash('sha256').update(fs.readFileSync(validExportFile)).digest('hex').toUpperCase();

  const manifestResult = prepareCleanupManifest({
    exportPath: validExportFile,
    outputPath: manifestPath,
    unresolvedPath: unresolvedPath
  });

  const postExportHash = crypto.createHash('sha256').update(fs.readFileSync(validExportFile)).digest('hex').toUpperCase();

  assert(preExportHash === postExportHash, 'IMMUTABILITY-01', 'Source export file remained 100% byte-for-byte unchanged after preparation');

  assert(fs.existsSync(manifestPath), 'MANIFEST-01', 'Proposed manifest file created on disk');
  assert(fs.existsSync(unresolvedPath), 'MANIFEST-02', 'Unresolved records report created on disk');

  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const unresolvedData = JSON.parse(fs.readFileSync(unresolvedPath, 'utf8'));

  assert(manifestData.manifestVersion === '1.0.0', 'MANIFEST-03', 'Manifest schema version is 1.0.0');
  assert(manifestData.approvalStatus === 'pending_trustee_review', 'MANIFEST-04', 'Manifest approvalStatus is pending_trustee_review');
  assert(manifestData.executionLocked === true, 'MANIFEST-05', 'Manifest explicitly marked executionLocked: true');
  assert(manifestData.summary.candidateClustersCount === 2, 'MANIFEST-06', 'Exactly 2 candidate clusters identified');
  assert(manifestData.summary.candidateDocumentsCount === 8, 'MANIFEST-07', 'Exactly 8 candidate documents (4 docs per cluster)');
  assert(manifestData.candidateClusters.length === 2, 'MANIFEST-08', 'candidateClusters array contains 2 complete clusters');
  assert(manifestData.entries.length === 8, 'MANIFEST-09', 'Flat entries array contains 8 candidate records');

  // Verify all 4 document types exist per cluster
  for (const cluster of manifestData.candidateClusters) {
    const docTypes = cluster.documents.map(d => d.documentType).sort();
    assert(docTypes.includes('billing_transaction') &&
      docTypes.includes('billing_receipt') &&
      docTypes.includes('billing_reservation') &&
      docTypes.includes('billing_idempotency'),
      `CLUSTER-TYPES-${cluster.clusterId}`,
      `Cluster ${cluster.clusterId} contains all 4 verified document types`);
  }

  // Verify all entries have valid fingerprints and expected relationships
  for (const entry of manifestData.entries) {
    assert(typeof entry.fingerprint === 'string' && entry.fingerprint.length === 64,
      `ENTRY-FP-${entry.docId}`, `Entry ${entry.path} has 64-char SHA-256 fingerprint`);
    assert(entry.approvalStatus === 'pending_trustee_review',
      `ENTRY-APP-${entry.docId}`, `Entry ${entry.path} has approvalStatus pending_trustee_review`);
    assert(entry.classification === RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
      `ENTRY-CLS-${entry.docId}`, `Entry ${entry.path} has classification confirmed_test_transaction`);
  }

  // Orchestrator validation drill on generated proposed manifest:
  // Must fail closed with "Unapproved entry status: pending_trustee_review" because trustee approval is required
  const orchValidation = orchestrator.validateManifest(manifestData);
  assert(orchValidation.valid === false, 'ORCH-CHECK-01', 'CleanupOrchestrator rejects unapproved proposed manifest fail-closed');
  const hasPendingReviewError = orchValidation.errors.some(e => e.includes('pending_trustee_review') || e.includes('lacks required trustee approval'));
  assert(hasPendingReviewError, 'ORCH-CHECK-02', 'CleanupOrchestrator correctly detects pending_trustee_review status requiring trustee approval');

  // =========================================================================
  // GROUP 5: OUTPUT OVERWRITE REFUSAL SAFEGUARDS
  // =========================================================================
  console.log('\n--- GROUP 5: Output Overwrite Refusal Safeguards ---');

  // Refuse to overwrite manifest
  let overwriteManifestCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: validExportFile,
      outputPath: manifestPath,
      unresolvedPath: path.join(SCRATCH_DIR, 'new_unresolved.json'),
      force: false
    });
  } catch (err) {
    overwriteManifestCaught = err.message.includes('OUTPUT_FILE_EXISTS') && err.message.includes('Overwrite refused');
  }
  assert(overwriteManifestCaught, 'OVERWRITE-01', 'Refuses to overwrite existing manifest file without --force');

  // Refuse to overwrite unresolved report
  let overwriteUnresolvedCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: validExportFile,
      outputPath: path.join(SCRATCH_DIR, 'new_manifest.json'),
      unresolvedPath: unresolvedPath,
      force: false
    });
  } catch (err) {
    overwriteUnresolvedCaught = err.message.includes('OUTPUT_FILE_EXISTS') && err.message.includes('Overwrite refused');
  }
  assert(overwriteUnresolvedCaught, 'OVERWRITE-02', 'Refuses to overwrite existing unresolved report file without --force');

  // Overwrite succeeds with --force: true
  let forceSucceeded = false;
  try {
    prepareCleanupManifest({
      exportPath: validExportFile,
      outputPath: manifestPath,
      unresolvedPath: unresolvedPath,
      force: true
    });
    forceSucceeded = true;
  } catch (err) {
    forceSucceeded = false;
  }
  assert(forceSucceeded, 'OVERWRITE-03', 'Overwrites existing output files when --force is explicitly provided');

  // Refuse if output path equals source export path
  let overwriteSourceCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: validExportFile,
      outputPath: validExportFile,
      force: true
    });
  } catch (err) {
    overwriteSourceCaught = err.message.includes('Output paths cannot overwrite the source export');
  }
  assert(overwriteSourceCaught, 'OVERWRITE-04', 'Output path identical to source export path strictly prohibited');

  // Refuse if manifest path equals unresolved path
  let samePathsCaught = false;
  try {
    prepareCleanupManifest({
      exportPath: validExportFile,
      outputPath: path.join(SCRATCH_DIR, 'same.json'),
      unresolvedPath: path.join(SCRATCH_DIR, 'same.json'),
      force: true
    });
  } catch (err) {
    samePathsCaught = err.message.includes('Manifest output path and unresolved report path cannot be the same file');
  }
  assert(samePathsCaught, 'OVERWRITE-05', 'Manifest path identical to unresolved path strictly prohibited');

  // =========================================================================
  // GROUP 6: RELATIONAL DEFECTS & UNRESOLVED RECORDS QUARANTINE
  // =========================================================================
  console.log('\n--- GROUP 6: Relational Linkage Failures & Unresolved Quarantine ---');

  // 1. Bill missing linked receipt reference
  const noRcptBillObj = createSyntheticExport(obj => {
    delete obj.collections.billing[0].accountingReceiptId;
  });
  const noRcptBillFile = writeSyntheticExportFile('no_rcpt_bill.json', noRcptBillObj);
  const resNoRcpt = prepareCleanupManifest({
    exportPath: noRcptBillFile,
    outputPath: path.join(SCRATCH_DIR, 'm_no_rcpt.json'),
    force: true
  });
  assert(resNoRcpt.manifest.summary.candidateClustersCount === 1, 'REL-01-A', 'Only 1 candidate cluster approved when Bill 1 lacks accountingReceiptId');
  const unresNoRcpt = resNoRcpt.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresNoRcpt && unresNoRcpt.summaryReason.includes('Missing linked accounting receipt reference'),
    'REL-01-B', 'Bill 1 placed in unresolved records with clear missing receipt reference reason');

  // 2. Bill references receipt that does not exist in export
  const missingRcptObj = createSyntheticExport(obj => {
    obj.collections.billing[0].accountingReceiptId = 'rcpt_nonexistent_9999';
  });
  const missingRcptFile = writeSyntheticExportFile('missing_rcpt.json', missingRcptObj);
  const resMissingRcpt = prepareCleanupManifest({
    exportPath: missingRcptFile,
    outputPath: path.join(SCRATCH_DIR, 'm_miss_rcpt.json'),
    force: true
  });
  assert(resMissingRcpt.manifest.summary.candidateClustersCount === 1, 'REL-02-A', 'Cluster rejected when referenced receipt does not exist');
  const unresMissRcpt = resMissingRcpt.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresMissRcpt && unresMissRcpt.summaryReason.includes('does not exist in export'),
    'REL-02-B', 'Missing receipt logged with clear non-existent receipt explanation');

  // 3. Receipt source is NOT 'billing' (e.g. 'counter_manual' or missing)
  const nonBillingSourceObj = createSyntheticExport(obj => {
    obj.collections.receipts[0].source = 'counter_manual';
  });
  const nonBillingSourceFile = writeSyntheticExportFile('non_billing_source.json', nonBillingSourceObj);
  const resNonBilling = prepareCleanupManifest({
    exportPath: nonBillingSourceFile,
    outputPath: path.join(SCRATCH_DIR, 'm_non_billing.json'),
    force: true
  });
  assert(resNonBilling.manifest.summary.candidateClustersCount === 1, 'REL-03-A', 'Cluster rejected when linked receipt source !== "billing"');
  const unresNonBilling = resNonBilling.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresNonBilling && unresNonBilling.summaryReason.includes('Must be "billing"'),
    'REL-03-B', 'Receipt source failure logged with source requirement explanation');

  // 4. Contradictory reciprocal link (Receipt claims a different bill)
  const conflictingBillLinkObj = createSyntheticExport(obj => {
    obj.collections.receipts[0].billingFirestoreId = 'bill_different_999';
    obj.collections.receipts[0].billingId = 999;
  });
  const conflictingBillLinkFile = writeSyntheticExportFile('conflict_bill_link.json', conflictingBillLinkObj);
  const resConflictBill = prepareCleanupManifest({
    exportPath: conflictingBillLinkFile,
    outputPath: path.join(SCRATCH_DIR, 'm_conflict_bill.json'),
    force: true
  });
  assert(resConflictBill.manifest.summary.candidateClustersCount === 1, 'REL-04-A', 'Cluster rejected on contradictory reciprocal bill link');
  const unresConflictBill = resConflictBill.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresConflictBill && unresConflictBill.summaryReason.includes('conflicting bill'),
    'REL-04-B', 'Contradictory reciprocal bill linkage documented in unresolved report');

  // 5. Contradictory reservationDocId between Bill and Receipt
  const conflictingResLinkObj = createSyntheticExport(obj => {
    obj.collections.receipts[0].reservationDocId = 'res_syn_CONFLICT';
  });
  const conflictingResLinkFile = writeSyntheticExportFile('conflict_res_link.json', conflictingResLinkObj);
  const resConflictRes = prepareCleanupManifest({
    exportPath: conflictingResLinkFile,
    outputPath: path.join(SCRATCH_DIR, 'm_conflict_res.json'),
    force: true
  });
  assert(resConflictRes.manifest.summary.candidateClustersCount === 1, 'REL-05-A', 'Cluster rejected on contradictory reservation linkage between bill and receipt');
  const unresConflictRes = resConflictRes.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresConflictRes && unresConflictRes.summaryReason.includes('conflicts with bill reservation'),
    'REL-05-B', 'Contradictory reservation documented in unresolved report');

  // 6. Missing linked reservation document
  const missingResDocObj = createSyntheticExport(obj => {
    // Remove reservation for bill 1
    obj.reservations = obj.reservations.filter(r => r._firestoreId !== 'res_syn_1001');
  });
  const missingResDocFile = writeSyntheticExportFile('missing_res_doc.json', missingResDocObj);
  const resMissingRes = prepareCleanupManifest({
    exportPath: missingResDocFile,
    outputPath: path.join(SCRATCH_DIR, 'm_missing_res.json'),
    force: true
  });
  assert(resMissingRes.manifest.summary.candidateClustersCount === 1, 'REL-06-A', 'Cluster rejected when linked reservation does not exist');
  const unresMissingRes = resMissingRes.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresMissingRes && unresMissingRes.summaryReason.includes('Referenced reservation "res_syn_1001" does not exist'),
    'REL-06-B', 'Missing reservation documented in unresolved report');

  // 7. Reservation references conflicting billDocId
  const conflictingResBillObj = createSyntheticExport(obj => {
    obj.reservations[0].billDocId = 'bill_other_999';
  });
  const conflictingResBillFile = writeSyntheticExportFile('conflict_res_bill.json', conflictingResBillObj);
  const resConflictResBill = prepareCleanupManifest({
    exportPath: conflictingResBillFile,
    outputPath: path.join(SCRATCH_DIR, 'm_conflict_res_bill.json'),
    force: true
  });
  assert(resConflictResBill.manifest.summary.candidateClustersCount === 1, 'REL-07-A', 'Cluster rejected when reservation billDocId contradicts bill');

  // 8. Missing linked idempotency document
  const missingOpDocObj = createSyntheticExport(obj => {
    obj.idempotency = obj.idempotency.filter(o => o._firestoreId !== 'op_syn_1001');
  });
  const missingOpDocFile = writeSyntheticExportFile('missing_op_doc.json', missingOpDocObj);
  const resMissingOp = prepareCleanupManifest({
    exportPath: missingOpDocFile,
    outputPath: path.join(SCRATCH_DIR, 'm_missing_op.json'),
    force: true
  });
  assert(resMissingOp.manifest.summary.candidateClustersCount === 1, 'REL-08-A', 'Cluster rejected when linked idempotency record does not exist');
  const unresMissingOp = resMissingOp.unresolvedReport.unresolvedRecords.find(u => u.docId === 'bill_syn_1001');
  assert(unresMissingOp && unresMissingOp.summaryReason.includes('Referenced idempotency record "op_syn_1001" does not exist'),
    'REL-08-B', 'Missing idempotency documented in unresolved report');

  // 9. Idempotency references conflicting resDocId
  const conflictingOpResObj = createSyntheticExport(obj => {
    obj.idempotency[0].resDocId = 'res_wrong_999';
  });
  const conflictingOpResFile = writeSyntheticExportFile('conflict_op_res.json', conflictingOpResObj);
  const resConflictOpRes = prepareCleanupManifest({
    exportPath: conflictingOpResFile,
    outputPath: path.join(SCRATCH_DIR, 'm_conflict_op_res.json'),
    force: true
  });
  assert(resConflictOpRes.manifest.summary.candidateClustersCount === 1, 'REL-09-A', 'Cluster rejected when idempotency resDocId contradicts reservation');

  // 10. Bill references physical receipt (rcpt_phys_*)
  const physReceiptLinkedObj = createSyntheticExport(obj => {
    obj.collections.billing[0].accountingReceiptId = 'rcpt_phys_2001';
  });
  const physReceiptLinkedFile = writeSyntheticExportFile('phys_rcpt_linked.json', physReceiptLinkedObj);
  const resPhysLinked = prepareCleanupManifest({
    exportPath: physReceiptLinkedFile,
    outputPath: path.join(SCRATCH_DIR, 'm_phys_linked.json'),
    force: true
  });
  assert(resPhysLinked.manifest.summary.candidateClustersCount === 1, 'REL-10-A', 'Cluster rejected when billing references a physical receipt');

  // 11. Bill references physical reservation (res_phys_*)
  const physResLinkedObj = createSyntheticExport(obj => {
    obj.collections.billing[0].reservationDocId = 'res_phys_2001';
  });
  const physResLinkedFile = writeSyntheticExportFile('phys_res_linked.json', physResLinkedObj);
  const resPhysRes = prepareCleanupManifest({
    exportPath: physResLinkedFile,
    outputPath: path.join(SCRATCH_DIR, 'm_phys_res.json'),
    force: true
  });
  assert(resPhysRes.manifest.summary.candidateClustersCount === 1, 'REL-11-A', 'Cluster rejected when billing references a physical reservation');

  // 12. Orphaned billing receipt without any bill in billing
  const orphanedRcptObj = createSyntheticExport(obj => {
    obj.collections.receipts.push({
      _firestoreId: 'rcpt_orphan_8888',
      id: 8888,
      source: 'billing',
      billingId: 8888,
      billingFirestoreId: 'bill_nonexistent_8888',
      amount: 400
    });
  });
  const orphanedRcptFile = writeSyntheticExportFile('orphan_rcpt.json', orphanedRcptObj);
  const resOrphanRcpt = prepareCleanupManifest({
    exportPath: orphanedRcptFile,
    outputPath: path.join(SCRATCH_DIR, 'm_orphan_rcpt.json'),
    force: true
  });
  const unresOrphan = resOrphanRcpt.unresolvedReport.unresolvedRecords.find(u => u.docId === 'rcpt_orphan_8888');
  assert(unresOrphan && unresOrphan.category === 'orphaned_billing_receipt',
    'REL-12', 'Orphaned billing receipt classified into unresolved records');

  // =========================================================================
  // GROUP 7: STRICT ASSET PROTECTION & PRESERVATION
  // =========================================================================
  console.log('\n--- GROUP 7: Protected Assets & Master Configuration Preservation ---');

  // Confirm independent receipts are NOT in candidate entries
  const indepEntry = manifestData.entries.find(e => e.docId === 'rcpt_counter_3001');
  assert(!indepEntry, 'PROT-01', 'Independent counter receipt rcpt_counter_3001 excluded from candidate manifest');

  // Confirm physical receipts are NOT in candidate entries
  const physRcptEntry = manifestData.entries.find(e => e.docId === 'rcpt_phys_2001');
  assert(!physRcptEntry, 'PROT-02', 'Physical receipt rcpt_phys_2001 excluded from candidate manifest');

  // Confirm physical reservation is NOT in candidate entries
  const physResEntry = manifestData.entries.find(e => e.docId === 'res_phys_2001');
  assert(!physResEntry, 'PROT-03', 'Physical reservation res_phys_2001 excluded from candidate manifest');

  // Confirm physical idempotency is NOT in candidate entries
  const physOpEntry = manifestData.entries.find(e => e.docId === 'op_phys_2001');
  assert(!physOpEntry, 'PROT-04', 'Physical idempotency op_phys_2001 excluded from candidate manifest');

  // Confirm sequence counters are NOT in candidate entries
  const counterEntry = manifestData.entries.find(e => e.docId === 'counters');
  assert(!counterEntry, 'PROT-05', 'System sequence counters document excluded from candidate manifest');

  // Confirm restore metadata is NOT in candidate entries
  const restoreEntry = manifestData.entries.find(e => e.docId === '_restoreProgress');
  assert(!restoreEntry, 'PROT-06', 'System _restoreProgress metadata excluded from candidate manifest');

  // Confirm protected financial records (payments, transfers, loans, chitty) are NOT in candidate entries
  for (const protCol of ['payments', 'transfers', 'loans', 'chittyMembers', 'chittyCollections', 'chittyPayouts']) {
    const protColEntries = manifestData.entries.filter(e => e.collection === protCol);
    assert(protColEntries.length === 0, `PROT-COL-${protCol}`, `Protected collection "${protCol}" completely absent from manifest entries`);
  }

  // Confirm master configuration (settings, funds, categories, bankAccounts, users) are NOT in candidate entries
  for (const masterCol of ['settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts', 'users']) {
    const masterColEntries = manifestData.entries.filter(e => e.collection === masterCol);
    assert(masterColEntries.length === 0, `PROT-MASTER-${masterCol}`, `Master config collection "${masterCol}" completely absent from manifest entries`);
  }

  // =========================================================================
  // GROUP 8: CLI INTERFACE & ARGUMENT PARSING TESTS
  // =========================================================================
  console.log('\n--- GROUP 8: CLI Argument Parsing & Command Execution ---');

  // 1. --help displays usage and returns code 0
  let helpLog = '';
  let helpExitCode = null;
  runCli(['--help'], {
    log: msg => helpLog += msg,
    error: msg => {},
    exit: code => helpExitCode = code
  });
  assert(helpExitCode === 0 && helpLog.includes('Usage:') && helpLog.includes('--export'),
    'CLI-01', 'CLI --help displays usage and exits with code 0');

  // 2. Missing arguments returns code 1
  let missingArgsError = '';
  let missingArgsExitCode = null;
  runCli([], {
    log: msg => {},
    error: msg => missingArgsError += msg,
    exit: code => missingArgsExitCode = code
  });
  assert(missingArgsExitCode === 1 && missingArgsError.includes('Both --export <filepath> and --output <filepath> are required'),
    'CLI-02', 'CLI without required arguments reports error and exits with code 1');

  // 3. Unknown argument returns code 1
  let unknownArgError = '';
  let unknownArgExitCode = null;
  runCli(['--unknown-flag'], {
    log: msg => {},
    error: msg => unknownArgError += msg,
    exit: code => unknownArgExitCode = code
  });
  assert(unknownArgExitCode === 1 && unknownArgError.includes('Unknown argument: --unknown-flag'),
    'CLI-03', 'CLI with unknown argument reports error and exits with code 1');

  // 4. Complete CLI run on valid export with --force returns code 0 and writes manifest
  const cliOutPath = path.join(SCRATCH_DIR, 'cli_manifest_out.json');
  const cliUnresPath = path.join(SCRATCH_DIR, 'cli_unres_out.json');
  let cliSuccessExitCode = null;
  let cliLog = '';
  runCli(['--export', validExportFile, '--output', cliOutPath, '--unresolved', cliUnresPath, '--force'], {
    log: msg => cliLog += msg,
    error: msg => {},
    exit: code => cliSuccessExitCode = code
  });
  assert(cliSuccessExitCode === 0 && fs.existsSync(cliOutPath) && fs.existsSync(cliUnresPath),
    'CLI-04', 'CLI execution on valid export with flags succeeds with exit code 0');

  // =========================================================================
  // GROUP 9: AIR-GAP CONFIRMATION & ZERO NETWORK / PROCESS INVARIANTS
  // =========================================================================
  console.log('\n--- GROUP 9: Zero Network & Process Eavesdropping Confirmation ---');

  assert(networkCallsDetected === 0, 'AIRGAP-01', 'Zero outbound network requests detected across entire test suite execution', `Calls detected: ${networkCallsDetected}`);
  assert(processSpawnDetected === 0, 'AIRGAP-02', 'Zero child process spawns detected across entire test suite execution', `Spawns detected: ${processSpawnDetected}`);

  // Clean scratch files
  cleanScratch();
  try { fs.rmdirSync(SCRATCH_DIR); } catch (e) {}

  // ---------------------------------------------------------------------------
  // Summary & Report
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('   STEP 33.122 TEST SUITE EXECUTION SUMMARY');
  console.log('========================================================================');
  console.log(`Total Assertions:     ${testResults.length}`);
  console.log(`Passed:               ${passCount}`);
  console.log(`Failed:               ${failCount}`);
  console.log(`Outbound Network:     ${networkCallsDetected}`);
  console.log(`Processes Spawned:    ${processSpawnDetected}`);
  console.log(`Verdict:              ${failCount === 0 ? '✅ 100% PASS' : '❌ FAILURES DETECTED'}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStep33122Tests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
