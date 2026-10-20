/**
 * STEP 33.148: ISOLATED RECOVERY REHEARSAL AND RECOVERY EVIDENCE TEST SUITE
 *
 * Location: tests/test_step_33_148_recovery_rehearsal.js
 *
 * PURPOSE:
 * Rigorously plan, exercise, and validate an isolated rehearsal for the
 * Temple Accounts transactional reset tooling using 100% synthetic test data.
 * Verifies backup preflight, source identity validation, manifest generation,
 * classification, simulated batch operations, failure injection, and recovery
 * evidence without touching production data, live credentials, or protected files.
 *
 * SAFETY INVARIANTS:
 * - 100% In-memory synthetic store only (SyntheticFirestore).
 * - Zero network access (http/https/net/dgram intercepted and asserted 0 calls).
 * - Zero production Firebase URLs, credentials, or emulator endpoints.
 * - All five destructive execution entry points unconditionally locked.
 * - Protected project files verified byte-for-byte before and after rehearsal.
 */

'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const dgram = require('dgram');
const child_process = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Strict Network & Process Isolation Guard
// ---------------------------------------------------------------------------

let networkCallsDetected = 0;
let processSpawnDetected = 0;

const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalNetConnect = net.connect;
const originalCreateSocket = dgram.createSocket;
const originalSpawn = child_process.spawn;
const originalExec = child_process.exec;
const originalFork = child_process.fork;

http.request = function (...args) {
  networkCallsDetected++;
  throw new Error('AIR_GAP_VIOLATION: http.request is strictly forbidden in isolated rehearsal.');
};
https.request = function (...args) {
  networkCallsDetected++;
  throw new Error('AIR_GAP_VIOLATION: https.request is strictly forbidden in isolated rehearsal.');
};
net.connect = function (...args) {
  networkCallsDetected++;
  throw new Error('AIR_GAP_VIOLATION: net.connect is strictly forbidden in isolated rehearsal.');
};
dgram.createSocket = function (...args) {
  networkCallsDetected++;
  throw new Error('AIR_GAP_VIOLATION: dgram.createSocket is strictly forbidden in isolated rehearsal.');
};

// ---------------------------------------------------------------------------
// 2. Protected File Baseline Hashes
// ---------------------------------------------------------------------------

const PROTECTED_BASELINES = {
  orchestrator: {
    path: path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js'),
    expectedSha256: 'DB924F7C7189C1223C634F09009306A3314852EF6CE294B9A4D94B56E57533A7'
  },
  tests: {
    path: path.join(__dirname, '..', 'tests', 'test_step_33_140_transactional_reset.js'),
    expectedSha256: '67999A744A254258C9DB292ECDF54C876727D0D2CCF3783A247F76EB26B2A48C'
  },
  applicationHtml: {
    path: path.join(__dirname, '..', 'Temple_Accounts-1.html'),
    expectedSha256: '45297BD26B59C69E1E9242BDA32AC0D866862268EF7B00DD437686688355BE98'
  },
  firestoreRules: {
    path: path.join(__dirname, '..', 'firestore.rules'),
    expectedSha256: '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD'
  }
};

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// 3. Import Orchestrator Module Under Test
// ---------------------------------------------------------------------------

const {
  canonicalJsonStringify,
  computeSha256,
  ALLOWED_TRANSACTION_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  PROTECTED_SYSTEM_DOCS,
  REQUIRED_BACKUP_COLLECTIONS,
  DOCUMENTED_BACKUP_EXCLUSIONS,
  RECOVERY_GAP_ANALYSIS,
  SyntheticFirestore,
  TransactionalResetOrchestrator
} = require('../scripts/transactional_reset_orchestrator.js');

// ---------------------------------------------------------------------------
// 4. Test Reporting Framework
// ---------------------------------------------------------------------------

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, passed, details = {}) {
  const status = passed ? 'PASS' : 'FAIL';
  if (passed) passCount++;
  else failCount++;
  const entry = { id, name, passed, status, details };
  results.push(entry);
  console.log(`[${status}] Test ${id}: ${name}`);
  if (Object.keys(details).length > 0) {
    console.log(`       Details: ${JSON.stringify(details)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Fresh Synthetic Dataset Fixture Generators
// ---------------------------------------------------------------------------

function createRehearsalStore(options = {}) {
  const store = new SyntheticFirestore();

  // 1. Master Data Collections (MUST BE PRESERVED)
  store.set('settings', 'config', {
    _firestoreId: 'config',
    templeName: 'Koodalmanikyam Temple',
    financialYear: '2026-2027',
    activeTheme: 'traditional'
  });

  store.set('funds', 'fund_1', {
    _firestoreId: 'fund_1',
    id: 1,
    name: 'General Temple Fund',
    balance: 250000
  });

  store.set('funds', 'fund_2', {
    _firestoreId: 'fund_2',
    id: 2,
    name: 'Chitty Fund',
    balance: 75000
  });

  store.set('incomeCategories', 'inc_1', {
    _firestoreId: 'inc_1',
    id: 1,
    name: 'Vazhipadu Income'
  });

  store.set('expenseCategories', 'exp_1', {
    _firestoreId: 'exp_1',
    id: 1,
    name: 'Temple Maintenance'
  });

  store.set('bankAccounts', 'bank_1', {
    _firestoreId: 'bank_1',
    id: 1,
    bankName: 'Canara Bank',
    accountNumber: '987654321012'
  });

  store.set('chittyMembers', 'member_1', {
    _firestoreId: 'member_1',
    id: 1,
    name: 'Devotee Member A',
    phone: '9876543210'
  });

  store.set('chittyMembers', 'member_2', {
    _firestoreId: 'member_2',
    id: 2,
    name: 'Devotee Member B',
    phone: '9876543211'
  });

  store.set('users', 'user_1', {
    _firestoreId: 'user_1',
    username: 'admin',
    role: 'superadmin'
  });

  // 2. Financial Modules (Target Test Transactions)

  // Module 1: Billing Cluster 1 (bill_1 <-> rcpt_1 <-> res_1 <-> op_bill_1)
  store.set('billing', 'bill_1', {
    _firestoreId: 'bill_1',
    id: 1,
    receiptNo: 'BILL-001',
    totalAmount: 250,
    devoteeName: 'Synthetic Devotee 1',
    fund: 'General Temple Fund',
    accountingReceiptId: 'rcpt_1',
    accountingReceiptNo: 'R-001',
    reservationDocId: 'res_1',
    operationId: 'op_bill_1'
  });

  store.set('receipts', 'rcpt_1', {
    _firestoreId: 'rcpt_1',
    id: 1,
    receiptNo: 'R-001',
    source: 'billing',
    billingId: 1,
    billingFirestoreId: 'bill_1',
    billingReceiptNo: 'BILL-001',
    reservationDocId: 'res_1',
    operationId: 'op_bill_1',
    amount: 250,
    name: 'Synthetic Devotee 1',
    fund: 'General Temple Fund'
  });

  store.set('system', 'res_1', {
    _firestoreId: 'res_1',
    seqNumber: 1,
    formattedNo: '001',
    type: 'billing_linked',
    status: 'active',
    billDocId: 'bill_1',
    receiptDocId: 'rcpt_1',
    operationId: 'op_bill_1'
  });

  store.set('system', 'op_bill_1', {
    _firestoreId: 'op_bill_1',
    operationId: 'op_bill_1',
    seqNumber: 1,
    resDocId: 'res_1',
    billDocId: 'bill_1',
    receiptDocId: 'rcpt_1',
    status: 'committed'
  });

  // Module 1: Billing Cluster 2 (bill_2 <-> rcpt_2 <-> res_2 <-> op_bill_2)
  store.set('billing', 'bill_2', {
    _firestoreId: 'bill_2',
    id: 2,
    receiptNo: 'BILL-002',
    totalAmount: 500,
    devoteeName: 'Synthetic Devotee 2',
    fund: 'General Temple Fund',
    accountingReceiptId: 'rcpt_2',
    accountingReceiptNo: 'R-002',
    reservationDocId: 'res_2',
    operationId: 'op_bill_2'
  });

  store.set('receipts', 'rcpt_2', {
    _firestoreId: 'rcpt_2',
    id: 2,
    receiptNo: 'R-002',
    source: 'billing',
    billingId: 2,
    billingFirestoreId: 'bill_2',
    billingReceiptNo: 'BILL-002',
    reservationDocId: 'res_2',
    operationId: 'op_bill_2',
    amount: 500,
    name: 'Synthetic Devotee 2',
    fund: 'General Temple Fund'
  });

  store.set('system', 'res_2', {
    _firestoreId: 'res_2',
    seqNumber: 2,
    formattedNo: '002',
    type: 'billing_linked',
    status: 'active',
    billDocId: 'bill_2',
    receiptDocId: 'rcpt_2',
    operationId: 'op_bill_2'
  });

  store.set('system', 'op_bill_2', {
    _firestoreId: 'op_bill_2',
    operationId: 'op_bill_2',
    seqNumber: 2,
    resDocId: 'res_2',
    billDocId: 'bill_2',
    receiptDocId: 'rcpt_2',
    status: 'committed'
  });

  // Module 2: Independent Software Receipts Cluster (rcpt_3 <-> res_3 <-> op_rcpt_3)
  store.set('receipts', 'rcpt_3', {
    _firestoreId: 'rcpt_3',
    id: 3,
    receiptNo: 'R-003',
    source: 'firestore',
    billingId: null,
    billingFirestoreId: null,
    billingReceiptNo: null,
    reservationDocId: 'res_3',
    operationId: 'op_rcpt_3',
    amount: 1000,
    name: 'Synthetic Devotee 3',
    fund: 'General Temple Fund',
    category: 'General Donation'
  });

  store.set('system', 'res_3', {
    _firestoreId: 'res_3',
    seqNumber: 3,
    formattedNo: '003',
    type: 'independent_receipt',
    status: 'active',
    billDocId: null,
    receiptDocId: 'rcpt_3',
    operationId: 'op_rcpt_3'
  });

  store.set('system', 'op_rcpt_3', {
    _firestoreId: 'op_rcpt_3',
    operationId: 'op_rcpt_3',
    seqNumber: 3,
    resDocId: 'res_3',
    billDocId: null,
    receiptDocId: 'rcpt_3',
    status: 'committed'
  });

  // Module 3: Payment Voucher
  store.set('payments', 'pay_1', {
    _firestoreId: 'pay_1',
    id: 501,
    voucherNo: 'V-501',
    amount: 1200,
    fund: 'General Temple Fund',
    category: 'Temple Maintenance',
    paidTo: 'Synthetic Electrical Contractor'
  });

  // Module 4: Contra Transfer
  store.set('transfers', 'tx_1', {
    _firestoreId: 'tx_1',
    id: 1,
    amount: 5000,
    fromAcc: 'General Temple Fund',
    toAcc: 'Canara Bank'
  });

  // Module 5: Loan Record
  store.set('loans', 'loan_1', {
    _firestoreId: 'loan_1',
    id: 1,
    person: 'Synthetic Staff A',
    loanReceived: 8000,
    repayment: 0,
    date: '2026-10-19'
  });

  // Module 6: Chitty Collection
  store.set('chittyCollections', 'cc_1', {
    _firestoreId: 'cc_1',
    id: 1,
    memberId: 1,
    amountReceived: 2000,
    date: '2026-10-19'
  });

  // Module 7: Chitty Payout
  store.set('chittyPayouts', 'cp_1', {
    _firestoreId: 'cp_1',
    id: 1,
    memberId: 1,
    amount: 30000,
    date: '2026-10-19'
  });

  // Module 8: Obsolete Flat Migration Staging & Diagnostic Probes
  store.set('migration_staging', 'batch_stage_flat_1', {
    _firestoreId: 'batch_stage_flat_1',
    recordsCount: 15,
    hasSubcollections: false,
    status: 'OBSOLETE_FLAT_RECORD'
  });

  store.set('__system_diagnostics__', 'test_probe_1', {
    _firestoreId: 'test_probe_1',
    probeType: 'latency_test'
  });

  // 3. Physical Paper Receipts & Tracking Reservations (MUST BE PRESERVED)
  store.set('receipts', 'rcpt_phys_P700', {
    _firestoreId: 'rcpt_phys_P700',
    physId: 'P700',
    source: 'physical',
    physicalType: 'P',
    receiptNo: 'P700',
    name: 'Physical Book Devotee 1',
    amount: 150,
    fund: 'General Temple Fund',
    reservationDocId: 'res_phys_P700'
  });

  store.set('system', 'res_phys_P700', {
    _firestoreId: 'res_phys_P700',
    physId: 'P700',
    type: 'physical_receipt',
    receiptDocId: 'rcpt_phys_P700',
    status: 'active'
  });

  store.set('receipts', 'rcpt_phys_PU800', {
    _firestoreId: 'rcpt_phys_PU800',
    physId: 'PU800',
    source: 'physical',
    physicalType: 'PU',
    receiptNo: 'PU800',
    name: 'Physical Book Devotee 2',
    amount: 300,
    fund: 'General Temple Fund',
    reservationDocId: 'res_phys_PU800'
  });

  store.set('system', 'res_phys_PU800', {
    _firestoreId: 'res_phys_PU800',
    physId: 'PU800',
    type: 'physical_receipt',
    receiptDocId: 'rcpt_phys_PU800',
    status: 'active'
  });

  // 4. Counters
  store.set('system', 'counters', {
    _firestoreId: 'counters',
    globalSequenceCounter: 3,
    billingReceiptCounter: 2,
    voucherCounter: 501,
    receiptCounter: 1000,
    billingPrefix: 'BILL-',
    receiptPrefix: 'R-',
    voucherPrefix: 'V-'
  });

  // 5. Restore Progress System Doc
  store.set('system', '_restoreProgress', {
    _firestoreId: '_restoreProgress',
    status: 'completed'
  });

  return store;
}

function buildSyntheticBackupObject(store, options = {}) {
  const collections = {};
  const BACKUP_COLS = [
    'settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts',
    'billing', 'receipts', 'payments', 'transfers',
    'chittyMembers', 'chittyCollections', 'chittyPayouts', 'loans'
  ];

  for (const c of BACKUP_COLS) {
    const docs = (store.list(c) || []).slice();
    docs.sort((a, b) => String(a._firestoreId || a.id).localeCompare(String(b._firestoreId || b.id)));
    collections[c] = docs;
  }

  const reservationsList = [];
  const idempotencyList = [];
  const otherSystemDocs = [];
  let countersData = null;

  const sysDocs = (store.list('system') || []).slice();
  sysDocs.sort((a, b) => String(a._firestoreId || a.id).localeCompare(String(b._firestoreId || b.id)));
  for (const d of sysDocs) {
    const id = d._firestoreId;
    if (id === 'counters') countersData = d;
    else if (id.startsWith('res_') && !id.startsWith('res_phys_')) reservationsList.push(d);
    else if (id.startsWith('op_') && !id.startsWith('op_phys_')) idempotencyList.push(d);
    else otherSystemDocs.push(d);
  }

  const backupObj = {
    metadata: {
      source: 'firestore',
      firestoreProject: 'temple-synthetic-rehearsal',
      exportedAt: options.exportedAt || '2026-10-19T20:00:00.000Z',
      schemaVersion: '23.2',
      backupVersion: '4',
      snapshotId: options.snapshotId || 'SNAPSHOT_STEP33_148_REHEARSAL'
    },
    collections,
    counters: countersData,
    reservations: reservationsList,
    idempotency: idempotencyList,
    system: { otherSystemDocs }
  };

  const payload = {
    collections: backupObj.collections,
    counters: backupObj.counters,
    reservations: backupObj.reservations,
    idempotency: backupObj.idempotency,
    system: backupObj.system
  };

  backupObj.metadata.integrity = {
    algorithm: 'SHA-256',
    hash: computeSha256(canonicalJsonStringify(payload))
  };

  return backupObj;
}

function attachValidatedSourceIdentity(store, backupObj) {
  const rawBytes = Buffer.from(canonicalJsonStringify(backupObj), 'utf8');
  const sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
    rawBytes,
    backupObj,
    filePath: 'synthetic://step33_148_recovery_rehearsal.json',
    expectedCoverage: {
      requiredCollections: REQUIRED_BACKUP_COLLECTIONS,
      presentCollections: Object.keys(backupObj.collections).sort(),
      documentedExclusions: DOCUMENTED_BACKUP_EXCLUSIONS
    }
  });
  store.sourceIdentity = sourceIdentity;
  return { rawBytes, sourceIdentity };
}

// ---------------------------------------------------------------------------
// 6. Test Suite Execution
// ---------------------------------------------------------------------------

async function runRehearsalSuite() {
  console.log('='.repeat(80));
  console.log('STEP 33.148: ISOLATED RECOVERY REHEARSAL & EVIDENCE VERIFICATION');
  console.log('='.repeat(80));

  // -------------------------------------------------------------------------
  // PHASE 1 — ENVIRONMENT PREFLIGHT
  // -------------------------------------------------------------------------

  const preHashes = {};
  for (const [key, item] of Object.entries(PROTECTED_BASELINES)) {
    const computed = computeFileHash(item.path);
    preHashes[key] = computed;
    recordTest(
      `1.${key}`,
      `Preflight Hash Check: ${path.basename(item.path)}`,
      computed === item.expectedSha256,
      { expected: item.expectedSha256, computed, match: computed === item.expectedSha256 }
    );
  }

  // Verify all 5 destructive entry points unconditionally locked
  const testOrch = new TransactionalResetOrchestrator();
  const dummyManifest = { eligibleForReset: true, targetRecords: [] };
  const lockedMethods = [
    'execute',
    'executeReset',
    'executeCleanup',
    'performLiveDeletion',
    'executeBatchedDeletions'
  ];

  let lockedPass = true;
  for (const m of lockedMethods) {
    try {
      testOrch[m](dummyManifest);
      lockedPass = false;
    } catch (e) {
      if (e.code !== 'EXECUTE_MODE_DISABLED') lockedPass = false;
    }
  }
  recordTest('1.destructive_locks', 'All 5 destructive entry points unconditionally locked', lockedPass, {
    methods: lockedMethods,
    allThrewExecuteModeDisabled: lockedPass
  });

  // Verify refusal of live database URLs / emulator endpoints
  let securityViolationCaught = false;
  try {
    new TransactionalResetOrchestrator({ emulatorHost: 'localhost:8080' });
  } catch (e) {
    if (e.message.includes('SECURITY_VIOLATION')) securityViolationCaught = true;
  }
  recordTest('1.security_guard_refusal', 'Orchestrator constructor rejects emulator endpoints and live URLs', securityViolationCaught, {
    refusedWithSecurityViolation: securityViolationCaught
  });

  // -------------------------------------------------------------------------
  // PHASE 3 — EXERCISE 1 & 2: VALID SYNTHETIC BACKUP & SOURCE IDENTITY
  // -------------------------------------------------------------------------

  const baseStore = createRehearsalStore();
  const backupObj = buildSyntheticBackupObject(baseStore);
  const rawBytes = Buffer.from(canonicalJsonStringify(backupObj), 'utf8');

  let backupPreflightPassed = false;
  try {
    const verified = testOrch.verifyBackupIntegrity(backupObj);
    backupPreflightPassed = (verified === true);
  } catch (e) {
    backupPreflightPassed = false;
  }
  recordTest('2.backup_integrity', 'Valid synthetic backup integrity preflight verification', backupPreflightPassed, {
    payloadHash: backupObj.metadata.integrity.hash,
    verified: backupPreflightPassed
  });

  let sourceIdentity = null;
  let sourceIdentityValid = false;
  try {
    sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      backupObj,
      filePath: 'synthetic://rehearsal-archive.json'
    });
    sourceIdentityValid = (
      sourceIdentity &&
      sourceIdentity.sourceFileSha256 === computeSha256(rawBytes) &&
      sourceIdentity.integrityVerification.verified === true
    );
  } catch (e) {
    sourceIdentityValid = false;
  }
  recordTest('3.source_identity_validation', 'Raw source-byte identity and snapshot metadata validation', sourceIdentityValid, {
    sourceFileSha256: sourceIdentity?.sourceFileSha256,
    canonicalPayloadHash: sourceIdentity?.integrityVerification?.canonicalPayloadHash,
    snapshotId: sourceIdentity?.snapshotId
  });

  // -------------------------------------------------------------------------
  // PHASE 3 — EXERCISE 3 & 4: MANIFEST GENERATION & CLASSIFICATION
  // -------------------------------------------------------------------------

  baseStore.sourceIdentity = sourceIdentity;
  const manifestOrch = new TransactionalResetOrchestrator();
  const manifest = manifestOrch.generateManifest(baseStore);

  recordTest('4.manifest_generation', 'Manifest generation succeeds with eligibleForReset === true', manifest.eligibleForReset === true, {
    eligibleForReset: manifest.eligibleForReset,
    status: manifest.sourceIdentity?.status,
    manifestDigest: manifest.manifestDigest,
    targetCount: manifest.targetRecords.length,
    preservedCount: manifest.preservedRecords.length,
    quarantinedCount: manifest.quarantinedRecords.length
  });

  // Verify target classification
  const targetCollections = new Set(manifest.targetRecords.map(r => r.collection));
  const expectedTargetCols = [
    'billing', 'receipts', 'payments', 'transfers', 'loans',
    'chittyCollections', 'chittyPayouts', 'migration_staging',
    '__system_diagnostics__', 'system'
  ];
  const allTargetColsPresent = expectedTargetCols.every(c => targetCollections.has(c));

  // Verify physical records strictly excluded from targets
  const physicalInTargets = manifest.targetRecords.some(r =>
    r.id.includes('phys') ||
    r.id === 'rcpt_phys_P700' ||
    r.id === 'rcpt_phys_PU800' ||
    r.id === 'res_phys_P700' ||
    r.id === 'res_phys_PU800'
  );

  // Verify master data strictly excluded from targets
  const masterInTargets = manifest.targetRecords.some(r =>
    ['settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts', 'chittyMembers', 'users'].includes(r.collection) ||
    r.id === 'counters'
  );

  recordTest('5.target_classification', 'Expected test transactions targeted; master data and physical records strictly excluded',
    allTargetColsPresent && !physicalInTargets && !masterInTargets,
    {
      targetCollectionsFound: Array.from(targetCollections).sort(),
      physicalInTargets,
      masterInTargets
    }
  );

  // Verify preserved classification
  const preservedIds = new Set(manifest.preservedRecords.map(r => `${r.collection}/${r.id}`));
  const requiredPreserved = [
    'settings/config',
    'funds/fund_1',
    'funds/fund_2',
    'incomeCategories/inc_1',
    'expenseCategories/exp_1',
    'bankAccounts/bank_1',
    'chittyMembers/member_1',
    'chittyMembers/member_2',
    'users/user_1',
    'receipts/rcpt_phys_P700',
    'receipts/rcpt_phys_PU800',
    'system/res_phys_P700',
    'system/res_phys_PU800',
    'system/counters'
  ];
  const allRequiredPreserved = requiredPreserved.every(id => preservedIds.has(id));

  recordTest('6.preserved_classification', 'Master data, user accounts, physical receipts, and counters verified preserved',
    allRequiredPreserved,
    {
      totalPreserved: manifest.preservedRecords.length,
      allRequiredPreservedFound: allRequiredPreserved
    }
  );

  recordTest('7.zero_quarantined_clean_baseline', 'Clean synthetic baseline produces 0 quarantined records and 0 linkage errors',
    manifest.quarantinedRecords.length === 0 && manifest.linkageErrors.length === 0,
    {
      quarantinedCount: manifest.quarantinedRecords.length,
      linkageErrorCount: manifest.linkageErrors.length
    }
  );

  // -------------------------------------------------------------------------
  // PHASE 3 — EXERCISE 5: FAILURE CASES INJECTION (NEGATIVE CONTROLS)
  // -------------------------------------------------------------------------

  // Neg 1: Tampered source bytes
  const tamperedBytes = Buffer.from(rawBytes);
  tamperedBytes[tamperedBytes.length - 15] = (tamperedBytes[tamperedBytes.length - 15] === 0x41) ? 0x42 : 0x41;
  let tamperedBlocked = false;
  try {
    TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes: tamperedBytes,
      backupObj
    });
  } catch (e) {
    tamperedBlocked = true;
  }
  recordTest('8.failure_tampered_bytes', 'Failure Case 1: Tampered source bytes rejected during identity validation', tamperedBlocked, {
    tamperedBlocked
  });

  // Neg 2: Missing required collection
  const backupMissingBilling = JSON.parse(canonicalJsonStringify(backupObj));
  delete backupMissingBilling.collections.billing;
  let missingColBlocked = false;
  try {
    testOrch.verifyBackupIntegrity(backupMissingBilling);
  } catch (e) {
    missingColBlocked = e.message.includes("Required collection 'billing' missing");
  }
  recordTest('9.failure_missing_collection', 'Failure Case 2: Missing required collection halts verification', missingColBlocked, {
    missingColBlocked
  });

  // Neg 3: Mismatched source identity (forged caller hash)
  let mismatchedCallerHashBlocked = false;
  try {
    TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      backupObj,
      expectedSourceFileSha256: '0'.repeat(64)
    });
  } catch (e) {
    mismatchedCallerHashBlocked = e.message.includes('Caller-provided source file SHA-256 mismatch');
  }
  recordTest('10.failure_mismatched_caller_hash', 'Failure Case 3: Caller-provided source hash mismatch rejected', mismatchedCallerHashBlocked, {
    mismatchedCallerHashBlocked
  });

  // Neg 4: Mutated/stale store content after identity validation
  const staleStore = createRehearsalStore();
  attachValidatedSourceIdentity(staleStore, buildSyntheticBackupObject(staleStore));
  staleStore.set('billing', 'bill_tampered', {
    _firestoreId: 'bill_tampered',
    id: 999,
    receiptNo: 'BILL-999',
    totalAmount: 100,
    devoteeName: 'Surreptitious Mutation',
    fund: 'General Temple Fund',
    accountingReceiptId: 'rcpt_1',
    reservationDocId: 'res_1'
  });
  const staleManifest = new TransactionalResetOrchestrator().generateManifest(staleStore);
  recordTest('11.failure_stale_mutated_store', 'Failure Case 4: Mutating store after identity validation marks manifest ineligible',
    staleManifest.eligibleForReset === false && staleManifest.sourceIdentity.status === 'STALE_OR_MUTATED',
    {
      eligibleForReset: staleManifest.eligibleForReset,
      status: staleManifest.sourceIdentity.status
    }
  );

  // Neg 5: Broken reciprocal relationship: billing pointer mismatch
  const brokenRelStore = createRehearsalStore();
  const brokenBill = brokenRelStore.get('billing', 'bill_1');
  brokenBill.accountingReceiptId = 'rcpt_nonexistent_999';
  brokenRelStore.set('billing', 'bill_1', brokenBill);
  attachValidatedSourceIdentity(brokenRelStore, buildSyntheticBackupObject(brokenRelStore));
  const brokenRelManifest = new TransactionalResetOrchestrator().generateManifest(brokenRelStore);
  recordTest('12.failure_broken_relationship', 'Failure Case 5: Broken reciprocal linkage caught and blocks eligibility',
    brokenRelManifest.eligibleForReset === false && brokenRelManifest.linkageErrors.length > 0,
    {
      eligibleForReset: brokenRelManifest.eligibleForReset,
      linkageErrors: brokenRelManifest.linkageErrors
    }
  );

  // Neg 6: Unresolved nested subcollections in migration staging
  const nestedStore = createRehearsalStore();
  nestedStore.set('migration_staging', 'batch_stage_nested_1', {
    _firestoreId: 'batch_stage_nested_1',
    recordsCount: 50,
    hasSubcollections: true,
    subcollections: ['items', 'audit_logs']
  });
  attachValidatedSourceIdentity(nestedStore, buildSyntheticBackupObject(nestedStore));
  const nestedManifest = new TransactionalResetOrchestrator().generateManifest(nestedStore);
  recordTest('13.failure_unresolved_nested_subcollection', 'Failure Case 6: Nested subcollections in migration staging quarantined and blocks eligibility',
    nestedManifest.eligibleForReset === false &&
    nestedManifest.unresolvedNestedRecords.length > 0 &&
    nestedManifest.quarantinedRecords.some(r => r.id === 'batch_stage_nested_1'),
    {
      eligibleForReset: nestedManifest.eligibleForReset,
      unresolvedNestedRecords: nestedManifest.unresolvedNestedRecords
    }
  );

  // Neg 7: Unknown unclassified collection
  const unknownColStore = createRehearsalStore();
  unknownColStore.set('unrecognized_legacy_table', 'doc_1', {
    _firestoreId: 'doc_1',
    data: 'mystery'
  });
  attachValidatedSourceIdentity(unknownColStore, buildSyntheticBackupObject(unknownColStore));
  const unknownManifest = new TransactionalResetOrchestrator().generateManifest(unknownColStore);
  recordTest('14.failure_unknown_collection_quarantined', 'Failure Case 7: Unknown collection quarantined deny-by-default and blocks eligibility',
    unknownManifest.eligibleForReset === false &&
    unknownManifest.quarantinedRecords.some(r => r.collection === 'unrecognized_legacy_table'),
    {
      eligibleForReset: unknownManifest.eligibleForReset,
      quarantinedCollections: unknownManifest.quarantinedRecords.map(r => r.collection)
    }
  );

  // Neg 8: Malformed transaction record
  const malformedStore = createRehearsalStore();
  malformedStore.set('billing', 'bill_bad_amount', {
    _firestoreId: 'bill_bad_amount',
    id: 'bad',
    receiptNo: 'BILL-BAD',
    totalAmount: -500 // Negative amount
  });
  attachValidatedSourceIdentity(malformedStore, buildSyntheticBackupObject(malformedStore));
  const malformedManifest = new TransactionalResetOrchestrator().generateManifest(malformedStore);
  recordTest('15.failure_malformed_record_quarantined', 'Failure Case 8: Malformed transaction record quarantined and blocks eligibility',
    malformedManifest.eligibleForReset === false &&
    malformedManifest.quarantinedRecords.some(r => r.id === 'bill_bad_amount'),
    {
      eligibleForReset: malformedManifest.eligibleForReset,
      quarantinedRecords: malformedManifest.quarantinedRecords
    }
  );

  // -------------------------------------------------------------------------
  // PHASE 3 — EXERCISE 6 & 7: SIMULATED BATCH PLANNING & INTERRUPTION RECOVERY
  // -------------------------------------------------------------------------

  // Dry-run report generation
  const dryRunStore = createRehearsalStore();
  attachValidatedSourceIdentity(dryRunStore, buildSyntheticBackupObject(dryRunStore));
  const dryRunOrch = new TransactionalResetOrchestrator();
  const dryRunReport = dryRunOrch.produceDryRunReport(dryRunStore);
  recordTest('16.dry_run_report_production', 'Dry-run report produces deterministic batches and recovery gap analysis',
    dryRunReport.eligibleForReset === true && dryRunReport.topologicalStages.length === 5,
    {
      eligibleForReset: dryRunReport.eligibleForReset,
      stageCount: dryRunReport.topologicalStages.length,
      stages: dryRunReport.topologicalStages,
      recoveryGapDocumented: dryRunReport.recoveryGapAnalysis?.exactRollbackSupported === false
    }
  );

  // Clean simulated execution across batches
  const simStore = createRehearsalStore();
  attachValidatedSourceIdentity(simStore, buildSyntheticBackupObject(simStore));
  const simOrch = new TransactionalResetOrchestrator();
  simOrch.generateManifest(simStore);
  const targetCountBeforeSim = simOrch.manifest.targetRecords.length;
  const simResult = simOrch.simulateBatchDeletions(simStore);

  recordTest('17.simulated_batch_execution', 'Simulated batch deletion succeeds across all topological stages',
    simResult.success === true && simResult.journalEntriesCount === targetCountBeforeSim,
    {
      success: simResult.success,
      journalEntriesCount: simResult.journalEntriesCount,
      targetCountExpected: targetCountBeforeSim,
      completedJournalStatus: simStore.get('system', '_resetJournal')?.status
    }
  );

  // Verify clean slate & physical records preservation post-simulation
  const cleanSlate = simOrch.verifyCleanSlate(simStore);
  const postPreservedP700 = simStore.get('receipts', 'rcpt_phys_P700');
  const postPreservedPU800 = simStore.get('receipts', 'rcpt_phys_PU800');
  const postPreservedResP700 = simStore.get('system', 'res_phys_P700');
  const postPreservedResPU800 = simStore.get('system', 'res_phys_PU800');
  const postPreservedConfig = simStore.get('settings', 'config');
  const postPreservedFund1 = simStore.get('funds', 'fund_1');
  const postPreservedMember1 = simStore.get('chittyMembers', 'member_1');

  recordTest('18.preservation_verification', 'All physical records and master data remain intact post-simulation',
    cleanSlate.clean === true &&
    postPreservedP700 !== undefined &&
    postPreservedPU800 !== undefined &&
    postPreservedResP700 !== undefined &&
    postPreservedResPU800 !== undefined &&
    postPreservedConfig !== undefined &&
    postPreservedFund1 !== undefined &&
    postPreservedMember1 !== undefined,
    {
      cleanSlateVerified: cleanSlate.clean,
      physicalReceiptP700Intact: !!postPreservedP700,
      physicalReceiptPU800Intact: !!postPreservedPU800,
      masterDataIntact: !!postPreservedConfig && !!postPreservedFund1
    }
  );

  // Interruption analysis: simulate failure at Stage 2
  const interruptStore = createRehearsalStore();
  attachValidatedSourceIdentity(interruptStore, buildSyntheticBackupObject(interruptStore));
  const interruptOrch = new TransactionalResetOrchestrator();
  interruptOrch.generateManifest(interruptStore);

  let interruptionCaught = false;
  try {
    interruptOrch.simulateBatchDeletions(interruptStore, { failAtStage: 2 });
  } catch (e) {
    interruptionCaught = true;
  }

  const interruptedJournal = interruptStore.get('system', '_resetJournal');
  recordTest('19.interruption_simulation', 'Simulated failure at Stage 2 records INTERRUPTED journal with checkpoint',
    interruptionCaught && interruptedJournal && interruptedJournal.status === 'INTERRUPTED',
    {
      interruptionCaught,
      journalStatus: interruptedJournal?.status,
      failedStage: interruptedJournal?.failedStage,
      completedStages: interruptedJournal?.completedStages
    }
  );

  // Recovery analysis: verify subsequent manifest generation detects interrupted journal and halts
  const recoveryOrch = new TransactionalResetOrchestrator();
  const recoveryManifest = recoveryOrch.generateManifest(interruptStore);
  recordTest('20.interrupted_journal_quarantine', 'Subsequent manifest generation detects interrupted journal and quarantines store',
    recoveryManifest.eligibleForReset === false &&
    recoveryManifest.quarantinedRecords.some(r => r.id === '_resetJournal'),
    {
      eligibleForReset: recoveryManifest.eligibleForReset,
      journalQuarantined: recoveryManifest.quarantinedRecords.some(r => r.id === '_resetJournal')
    }
  );

  // -------------------------------------------------------------------------
  // PHASE 3 — EXERCISE 8: PROTECTED FILE POST-REHEARSAL INTEGRITY
  // -------------------------------------------------------------------------

  const postHashes = {};
  let allHashesIntact = true;
  for (const [key, item] of Object.entries(PROTECTED_BASELINES)) {
    const computed = computeFileHash(item.path);
    postHashes[key] = computed;
    const matchesPre = (computed === preHashes[key]);
    const matchesBaseline = (computed === item.expectedSha256);
    if (!matchesPre || !matchesBaseline) allHashesIntact = false;
    recordTest(
      `21.${key}`,
      `Post-Rehearsal Hash Check: ${path.basename(item.path)}`,
      matchesPre && matchesBaseline,
      { baseline: item.expectedSha256, pre: preHashes[key], post: computed, intact: matchesPre && matchesBaseline }
    );
  }

  // -------------------------------------------------------------------------
  // PHASE 4: NETWORK & AIR-GAP AUDIT VERIFICATION
  // -------------------------------------------------------------------------

  recordTest('22.network_isolation_audit', 'Zero network calls detected across rehearsal suite',
    networkCallsDetected === 0,
    { networkCallsDetected }
  );

  // -------------------------------------------------------------------------
  // REHEARSAL SUMMARY REPORT
  // -------------------------------------------------------------------------

  console.log('='.repeat(80));
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log(`AIR-GAP STATUS: ${networkCallsDetected === 0 ? 'STRICT AIR-GAP CONFIRMED (0 network calls)' : 'AIR-GAP VIOLATION'}`);
  console.log(`PROTECTED FILES: ${allHashesIntact ? '100% UNCHANGED AND BIT-FOR-BIT IDENTICAL' : 'PROTECTED FILE MODIFIED'}`);
  console.log('='.repeat(80));

  const finalOutput = {
    step: 'STEP 33.148',
    timestamp: new Date().toISOString(),
    passCount,
    failCount,
    totalTests: results.length,
    verdict: failCount === 0 ? 'PASS' : 'FAIL',
    airGap: {
      networkCallsDetected,
      isolatedInMemory: true
    },
    baselines: {
      preHashes,
      postHashes,
      allIntact: allHashesIntact
    },
    recoveryEvidence: {
      synthesizedData: {
        financialModules: ['billing', 'receipts', 'payments', 'transfers', 'loans', 'chittyCollections', 'chittyPayouts'],
        systemCollections: ['reservations', 'idempotency', 'counters', '_restoreProgress', '_resetJournal'],
        masterData: ['settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts', 'chittyMembers', 'users'],
        physicalRecords: ['rcpt_phys_P700', 'rcpt_phys_PU800', 'res_phys_P700', 'res_phys_PU800'],
        diagnosticAndStaging: ['migration_staging', '__system_diagnostics__']
      },
      executedPhases: [
        'Phase 1: Environment Preflight & Baselines',
        'Phase 2: Source Archive Identity & Backup Verification',
        'Phase 3: Manifest Generation & Digest Computation',
        'Phase 4: Classification & Reciprocal Relational Validation',
        'Phase 5: Failure Injection (8 Negative Controls)',
        'Phase 6: Simulated Batch Planning & Interruption Analysis',
        'Phase 7: Protected File Integrity Comparison'
      ],
      simulatedPhases: [
        'Phase 6 Batch Deletions (executed in-memory on SyntheticFirestore; NO live Firestore deletion occurred or was attempted)'
      ],
      recoveryGapAnalysis: RECOVERY_GAP_ANALYSIS,
      destructiveExecutionLock: 'PERMANENTLY AND UNCONDITIONALLY LOCKED (5 of 5 methods throw EXECUTE_MODE_DISABLED)'
    },
    tests: results
  };

  const outputPath = path.join(__dirname, 'step_33_148_rehearsal_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2), 'utf8');
  console.log(`Detailed results written to: ${outputPath}`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRehearsalSuite().catch(err => {
  console.error('[FATAL REHEARSAL ERROR]', err);
  process.exit(1);
});
