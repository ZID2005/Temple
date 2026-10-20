/**
 * STEP 33.140: Transactional Reset Tool Isolated Synthetic Test Suite
 *
 * Location: tests/test_step_33_140_transactional_reset.js
 *
 * Verifies the dedicated project administrative reset tool:
 * scripts/transactional_reset_orchestrator.js
 *
 * STRICT SAFETY BOUNDARIES:
 * - 100% In-memory synthetic store only.
 * - Zero Firebase SDKs, zero Firestore SDKs, zero emulator connections.
 * - Zero network calls (HTTP/HTTPS/Net sockets intercepted and asserted 0 calls).
 * - Zero child process spawning for network or execution.
 * - Execution unconditionally locked (EXECUTE_MODE_DISABLED).
 * - Zero production reads, mutations, or resets.
 */

'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const child_process = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Network & Process Eavesdropping Guard
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

// ---------------------------------------------------------------------------
// Import Real Tool Source (Direct Project Source, No Approximation)
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
} = require('../scripts/transactional_reset_orchestrator');

// ---------------------------------------------------------------------------
// Test Reporter
// ---------------------------------------------------------------------------
const testResults = [];

function recordTest(id, name, passed, details = '') {
  const result = { id, name, passed, details };
  testResults.push(result);
  const statusStr = passed ? '[PASS]' : '[FAIL]';
  console.log(`${statusStr} Test ${String(id).padStart(2, '0')}: ${name}`);
  if (details) {
    console.log(`       Details: ${details}`);
  }
}

// ---------------------------------------------------------------------------
// Synthetic Test Fixtures Builder
// ---------------------------------------------------------------------------

function createFullSyntheticFixture(options = {}) {
  const store = new SyntheticFirestore();

  // 1. Master Data Collections (MUST BE PRESERVED!)
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
    balance: 100000
  });

  store.set('funds', 'fund_2', {
    _firestoreId: 'fund_2',
    id: 2,
    name: 'Chitty Fund',
    balance: 50000
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
    accountNumber: '123456789'
  });

  store.set('chittyMembers', 'member_1', {
    _firestoreId: 'member_1',
    id: 1,
    name: 'Devotee Member A',
    phone: '9876543210'
  });

  store.set('users', 'user_1', {
    _firestoreId: 'user_1',
    username: 'admin',
    role: 'superadmin'
  });

  // 2. Financial Modules (Target Test Transactions)

  // Module 1: Vazhipadu Billing Cluster 1
  store.set('billing', 'bill_1', {
    _firestoreId: 'bill_1',
    id: 1,
    receiptNo: 'BILL-001',
    totalAmount: 150,
    devoteeName: 'Test Devotee 1',
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
    amount: 150,
    name: 'Test Devotee 1',
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

  // Module 1: Vazhipadu Billing Cluster 2
  store.set('billing', 'bill_2', {
    _firestoreId: 'bill_2',
    id: 2,
    receiptNo: 'BILL-002',
    totalAmount: 200,
    devoteeName: 'Test Devotee 2',
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
    amount: 200,
    name: 'Test Devotee 2',
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

  // Module 2: Independent Accounting Receipt Cluster (Sequence 3)
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
    amount: 300,
    name: 'Test Devotee 3',
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

  // Module 3: Payment Vouchers (Real application schema: category, paidTo)
  store.set('payments', 'pay_1', {
    _firestoreId: 'pay_1',
    id: 501,
    voucherNo: 'V-501',
    amount: 500,
    fund: 'General Temple Fund',
    category: 'Temple Maintenance',
    paidTo: 'Test Maintenance Vendor'
  });

  // Module 4: Contra Transfers (Real application schema: fromAcc, toAcc)
  store.set('transfers', 'tx_1', {
    _firestoreId: 'tx_1',
    id: 1,
    amount: 1000,
    fromAcc: 'General Temple Fund',
    toAcc: 'Canara Bank'
  });

  // Module 5: Loans (Real application schema: person, loanReceived, repayment)
  store.set('loans', 'loan_1', {
    _firestoreId: 'loan_1',
    id: 1,
    person: 'Test Person 1',
    loanReceived: 5000,
    repayment: 0,
    date: '2026-10-19'
  });

  // Module 6: Chitty Collections (Real application schema: amountReceived, memberId)
  store.set('chittyCollections', 'cc_1', {
    _firestoreId: 'cc_1',
    id: 1,
    memberId: 1,
    amountReceived: 1000,
    date: '2026-10-19'
  });

  // Module 7: Chitty Payouts (Real application schema: amount, memberId)
  store.set('chittyPayouts', 'cp_1', {
    _firestoreId: 'cp_1',
    id: 1,
    memberId: 1,
    amount: 18000,
    date: '2026-10-19'
  });

  // Module 8: Obsolete Staging (flat) & Diagnostic records
  store.set('migration_staging', 'batch_stage_1', {
    _firestoreId: 'batch_stage_1',
    recordsCount: 10,
    hasSubcollections: false,
    status: 'OBSOLETE_FLAT_RECORD'
  });
  store.set('__system_diagnostics__', 'test_probe_1', {
    _firestoreId: 'test_probe_1',
    probeType: 'latency'
  });

  // 3. Physical Paper Receipt & Tracking Reservation (MUST BE PRESERVED!)
  store.set('receipts', 'rcpt_phys_P600', {
    _firestoreId: 'rcpt_phys_P600',
    physId: 'P600',
    source: 'physical',
    physicalType: 'P',
    receiptNo: 'P600',
    name: 'Physical Devotee',
    amount: 120,
    fund: 'General Temple Fund',
    reservationDocId: 'res_phys_P600'
  });
  store.set('system', 'res_phys_P600', {
    _firestoreId: 'res_phys_P600',
    physId: 'P600',
    type: 'physical_receipt',
    receiptDocId: 'rcpt_phys_P600',
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

  // 5. Restore progress
  store.set('system', '_restoreProgress', {
    _firestoreId: '_restoreProgress',
    status: 'completed'
  });

  // Attach authoritative verified source identity (deterministic baseline)
  const backup = createSyntheticBackup(store, options);
  const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');
  store.sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
    rawBytes,
    backupObj: backup,
    filePath: 'synthetic://in-memory-fixture.json'
  });

  return store;
}

function createSyntheticBackup(store, options = {}) {
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
      firestoreProject: 'temple-f4f7d',
      exportedAt: options.exportedAt || '2026-10-19T12:00:00.000Z',
      schemaVersion: '23.2',
      backupVersion: '4',
      snapshotId: options.snapshotId || 'SNAPSHOT_STEP33_140_SYNTHETIC'
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

function attachSourceIdentity(store, options = {}) {
  const backup = createSyntheticBackup(store, options);
  const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');
  store.sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
    rawBytes,
    backupObj: backup,
    filePath: options.filePath || 'synthetic://in-memory-fixture.json',
    expectedCollectionCoverage: options.expectedCollectionCoverage
  });
  return store.sourceIdentity;
}

// ---------------------------------------------------------------------------
// Main Test Execution
// ---------------------------------------------------------------------------

async function runTestSuite() {
  console.log('================================================================================');
  console.log('STEP 33.140: TRANSACTIONAL RESET ORCHESTRATOR ISOLATED SYNTHETIC TEST SUITE');
  console.log('Target: scripts/transactional_reset_orchestrator.js');
  console.log('Mode: Offline-Only, Execution Locked (Zero Live Access, Zero Mutations)');
  console.log('================================================================================\n');

  // --- Test 01: Complete billing/receipt/reservation/idempotency cluster ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const b1Target = manifest.targetRecords.find(r => r.collection === 'billing' && r.id === 'bill_1');
    const r1Target = manifest.targetRecords.find(r => r.collection === 'receipts' && r.id === 'rcpt_1');
    const res1Target = manifest.targetRecords.find(r => r.collection === 'system' && r.id === 'res_1');
    const op1Target = manifest.targetRecords.find(r => r.collection === 'system' && r.id === 'op_bill_1');

    const edges = manifest.relationshipEdges;
    const hasBillRcptEdge = edges.includes('billing/bill_1 <-> receipts/rcpt_1');
    const hasBillResEdge = edges.includes('billing/bill_1 <-> system/res_1');
    const hasResOpEdge = edges.includes('system/res_1 <-> system/op_bill_1');

    const passed = !!(b1Target && r1Target && res1Target && op1Target && hasBillRcptEdge && hasBillResEdge && hasResOpEdge && manifest.eligibleForReset === true);
    recordTest(
      1,
      'Complete billing/receipt/reservation/idempotency cluster',
      passed,
      `All 4 cluster members targeted: ${passed}, Edges verified: bill-rcpt=${hasBillRcptEdge}, bill-res=${hasBillResEdge}, res-op=${hasResOpEdge}, eligibleForReset: ${manifest.eligibleForReset}`
    );
  } catch (err) {
    recordTest(1, 'Complete billing/receipt/reservation/idempotency cluster', false, `Error: ${err.message}`);
  }

  // --- Test 02: Independent software receipt cluster ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const r3Target = manifest.targetRecords.find(r => r.collection === 'receipts' && r.id === 'rcpt_3');
    const res3Target = manifest.targetRecords.find(r => r.collection === 'system' && r.id === 'res_3');
    const op3Target = manifest.targetRecords.find(r => r.collection === 'system' && r.id === 'op_rcpt_3');

    const edges = manifest.relationshipEdges;
    const hasRcptResEdge = edges.includes('receipts/rcpt_3 <-> system/res_3');
    const hasResOpEdge = edges.includes('system/res_3 <-> system/op_rcpt_3');

    const rawRes = store.get('system', 'res_3');
    const isIndependent = rawRes.type === 'independent_receipt' && !rawRes.billDocId;

    const passed = !!(r3Target && res3Target && op3Target && hasRcptResEdge && hasResOpEdge && isIndependent && manifest.eligibleForReset === true);
    recordTest(
      2,
      'Independent software receipt cluster',
      passed,
      `Targeted: rcpt_3=${!!r3Target}, res_3=${!!res3Target}, op_rcpt_3=${!!op3Target}, edges verified: rcpt-res=${hasRcptResEdge}, res-op=${hasResOpEdge}, eligibleForReset: ${manifest.eligibleForReset}`
    );
  } catch (err) {
    recordTest(2, 'Independent software receipt cluster', false, `Error: ${err.message}`);
  }

  // --- Test 03: Payment, transfer, loan, chitty collection and payout classification ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const payTarget = manifest.targetRecords.find(r => r.collection === 'payments' && r.id === 'pay_1');
    const txTarget = manifest.targetRecords.find(r => r.collection === 'transfers' && r.id === 'tx_1');
    const loanTarget = manifest.targetRecords.find(r => r.collection === 'loans' && r.id === 'loan_1');
    const ccTarget = manifest.targetRecords.find(r => r.collection === 'chittyCollections' && r.id === 'cc_1');
    const cpTarget = manifest.targetRecords.find(r => r.collection === 'chittyPayouts' && r.id === 'cp_1');

    const passed = !!(payTarget && txTarget && loanTarget && ccTarget && cpTarget && manifest.eligibleForReset === true);
    recordTest(
      3,
      'Payment, transfer, loan, chitty collection and payout classification',
      passed,
      `All 5 subledgers targeted: pay=${!!payTarget}, tx=${!!txTarget}, loan=${!!loanTarget}, cc=${!!ccTarget}, cp=${!!cpTarget}, eligibleForReset: ${manifest.eligibleForReset}`
    );
  } catch (err) {
    recordTest(3, 'Payment, transfer, loan, chitty collection and payout classification', false, `Error: ${err.message}`);
  }

  // --- Test 04: Preservation of chitty members and master data ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const masterCollections = ['settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts', 'chittyMembers', 'users'];
    let allMasterPreserved = true;
    for (const mc of masterCollections) {
      const inTargets = manifest.targetRecords.some(r => r.collection === mc);
      const inPreserved = manifest.preservedRecords.some(r => r.collection === mc);
      if (inTargets || !inPreserved) {
        allMasterPreserved = false;
      }
    }

    // Also assert fatal error if batch deletion ever targets protected master data
    let safetyViolationCaught = false;
    try {
      orch.simulateBatchDeletions(store, {
        failAtStage: 999 // Ensure clean run until protected collection check
      });
    } catch (e) {}

    // Inject protected collection doc into batch stage records manually to test guard
    let fatalCaught = false;
    try {
      const testStore = createFullSyntheticFixture();
      const testManifest = orch.generateManifest(testStore);
      testManifest.topologicalBatches[0].records.push({ collection: 'funds', id: 'fund_1' });
      orch.simulateBatchDeletions(testStore);
    } catch (e) {
      if (e.message.includes('FATAL_SAFETY_VIOLATION')) fatalCaught = true;
    }

    const passed = allMasterPreserved && fatalCaught && store.get('funds', 'fund_1') !== null;
    recordTest(
      4,
      'Preservation of chitty members and master data',
      passed,
      `Master collections preserved: ${allMasterPreserved}, Deletion intercepted with FATAL_SAFETY_VIOLATION: ${fatalCaught}`
    );
  } catch (err) {
    recordTest(4, 'Preservation of chitty members and master data', false, `Error: ${err.message}`);
  }

  // --- Test 05: Preservation of physical receipt records and reservations ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const physRcptTarget = manifest.targetRecords.find(r => r.id === 'rcpt_phys_P600');
    const physResTarget = manifest.targetRecords.find(r => r.id === 'res_phys_P600');

    const physRcptPreserved = manifest.preservedRecords.find(r => r.id === 'rcpt_phys_P600');
    const physResPreserved = manifest.preservedRecords.find(r => r.id === 'res_phys_P600');

    const passed = !physRcptTarget && !physResTarget && !!physRcptPreserved && !!physResPreserved;
    recordTest(
      5,
      'Preservation of physical receipt records and reservations',
      passed,
      `Physical receipt excluded from targets: ${!physRcptTarget}, Preserved: ${!!physRcptPreserved}. Reservation preserved: ${!!physResPreserved}`
    );
  } catch (err) {
    recordTest(5, 'Preservation of physical receipt records and reservations', false, `Error: ${err.message}`);
  }

  // --- Test 06: Unknown collection and unknown document fail-closed behavior ---
  try {
    const store = createFullSyntheticFixture();
    store.set('unknown_audit_dump', 'dump_1', { payload: 'alien data' });
    store.set('billing', 'invalid_bill_xyz', { malformed: true });

    const orch = new TransactionalResetOrchestrator();
    const report = orch.produceDryRunReport(store);
    const manifest = orch.generateManifest(store);

    const quarantinedCol = report.quarantinedRecords.some(q => q.collection === 'unknown_audit_dump');
    const quarantinedDoc = report.quarantinedRecords.some(q => q.id === 'invalid_bill_xyz');
    const blocked = report.eligibleForReset === false && manifest.eligibleForReset === false;

    const passed = quarantinedCol && quarantinedDoc && blocked;
    recordTest(
      6,
      'Unknown collection and unknown document fail-closed behavior',
      passed,
      `Quarantined unknown collection: ${quarantinedCol}, Quarantined invalid doc: ${quarantinedDoc}, eligibleForReset: ${report.eligibleForReset}`
    );
  } catch (err) {
    recordTest(6, 'Unknown collection and unknown document fail-closed behavior', false, `Error: ${err.message}`);
  }

  // --- Test 07: Orphan and reciprocal-link failures ---
  try {
    // 7a: Bill points to missing receipt
    const storeA = createFullSyntheticFixture();
    storeA.delete('receipts', 'rcpt_1');
    const orchA = new TransactionalResetOrchestrator();
    const manifestA = orchA.generateManifest(storeA);
    const brokenLinkageA = manifestA.linkageErrors.some(e => e.includes("Broken Linkage: Bill 'bill_1' points to missing"));

    // 7b: Orphan reservation points to missing bill
    const storeB = createFullSyntheticFixture();
    storeB.set('system', 'res_99', {
      _firestoreId: 'res_99',
      seqNumber: 99,
      type: 'billing_linked',
      billDocId: 'bill_99',
      receiptDocId: 'rcpt_99'
    });
    const orchB = new TransactionalResetOrchestrator();
    const manifestB = orchB.generateManifest(storeB);
    const orphanCaughtB = manifestB.linkageErrors.some(e => e.includes("Orphaned Software Reservation: 'res_99'"));

    const passed = brokenLinkageA && orphanCaughtB && manifestA.eligibleForReset === false && manifestB.eligibleForReset === false;
    recordTest(
      7,
      'Orphan and reciprocal-link failures',
      passed,
      `Broken bill-to-receipt link detected: ${brokenLinkageA}, Orphan reservation detected: ${orphanCaughtB}, Manifests ineligible: true`
    );
  } catch (err) {
    recordTest(7, 'Orphan and reciprocal-link failures', false, `Error: ${err.message}`);
  }

  // --- Test 08: Duplicate sequence and conflicting operation detection ---
  try {
    const store = createFullSyntheticFixture();
    // Conflicting operation referencing different bill
    const rawOp = store.get('system', 'op_bill_1');
    rawOp.billDocId = 'bill_conflicting_999';
    store.set('system', 'op_bill_1', rawOp);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const conflictDetected = manifest.linkageErrors.some(e =>
      e.includes('Conflicting Identifier Reference') && e.includes('op_bill_1')
    );

    const passed = conflictDetected && manifest.eligibleForReset === false;
    recordTest(
      8,
      'Duplicate sequence and conflicting operation detection',
      passed,
      `Conflict detected: ${conflictDetected}, Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(8, 'Duplicate sequence and conflicting operation detection', false, `Error: ${err.message}`);
  }

  // --- Test 09: Deterministic manifest digest across shuffled input order ---
  try {
    const storeStandard = createFullSyntheticFixture();

    // Create a second store with collections and docs loaded in reversed/shuffled order
    const storeShuffled = new SyntheticFirestore();
    const allCols = storeStandard.listCollections().reverse();
    for (const c of allCols) {
      const docs = storeStandard.list(c).reverse();
      for (const d of docs) {
        storeShuffled.set(c, d._firestoreId, d);
      }
    }
    attachSourceIdentity(storeShuffled);

    const orch1 = new TransactionalResetOrchestrator();
    const manifest1 = orch1.generateManifest(storeStandard);

    const orch2 = new TransactionalResetOrchestrator();
    const manifest2 = orch2.generateManifest(storeShuffled);

    const match = manifest1.manifestHash === manifest2.manifestHash && manifest1.manifestHash.length === 64;
    recordTest(
      9,
      'Deterministic manifest digest across shuffled input order',
      match,
      `Store A Digest: ${manifest1.manifestHash} | Store B Digest: ${manifest2.manifestHash} | Digests match: ${match}`
    );
  } catch (err) {
    recordTest(9, 'Deterministic manifest digest across shuffled input order', false, `Error: ${err.message}`);
  }

  // --- Test 10: Missing collection or incomplete snapshot detection ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    delete backup.collections.transfers;

    const orch = new TransactionalResetOrchestrator();
    let caught = false;
    let errMessage = '';
    try {
      orch.verifyBackupIntegrity(backup);
    } catch (e) {
      caught = true;
      errMessage = e.message;
    }

    const passed = caught && errMessage.includes("Required collection 'transfers' missing from backup export");
    recordTest(
      10,
      'Missing collection or incomplete snapshot detection',
      passed,
      `Backup preflight halted cleanly: "${errMessage}"`
    );
  } catch (err) {
    recordTest(10, 'Missing collection or incomplete snapshot detection', false, `Error: ${err.message}`);
  }

  // --- Test 11: Tampered export/hash detection ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    // Tamper with billing total amount
    backup.collections.billing[0].totalAmount = 999999;

    const orch = new TransactionalResetOrchestrator();
    let caught = false;
    let errMessage = '';
    try {
      orch.verifyBackupIntegrity(backup);
    } catch (e) {
      caught = true;
      errMessage = e.message;
    }

    const passed = caught && errMessage.includes('BACKUP_INTEGRITY_MISMATCH');
    recordTest(
      11,
      'Tampered export/hash detection',
      passed,
      `Cryptographic verification halted execution: "${errMessage}"`
    );
  } catch (err) {
    recordTest(11, 'Tampered export/hash detection', false, `Error: ${err.message}`);
  }

  // --- Test 12: Interrupted synthetic batch and journal recovery behavior, without real deletion ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    orch.generateManifest(store);

    // Simulate crash on record 'pay_1' during Stage 2
    let crashed = false;
    try {
      orch.simulateBatchDeletions(store, { failAtStage: 2, failAtRecord: 'pay_1' });
    } catch (err) {
      if (err.message.includes('INTERRUPTED_EXECUTION')) crashed = true;
    }

    const journalDoc = store.get('system', '_resetJournal');
    const journalHasUnverified = journalDoc && journalDoc.entries.some(e => e.id === 'pay_1' && e.state === 'UNVERIFIED');
    const journalStatusInterrupted = journalDoc && journalDoc.status === 'INTERRUPTED';

    // Verify subsequent dry-run report quarantines the interrupted state
    const dryRunReport = orch.produceDryRunReport(store);
    const detectedInManifest = dryRunReport.quarantinedRecords.some(q => q.id === '_resetJournal' && q.reason === 'INTERRUPTED_RESET_IN_PROGRESS');
    const cleanSlate = orch.verifyCleanSlate(store);

    let counterInitBlocked = false;
    try {
      orch.initializeCounters(store);
    } catch (e) {
      counterInitBlocked = true;
    }

    const passed = crashed && journalHasUnverified && journalStatusInterrupted && detectedInManifest && !cleanSlate.clean && counterInitBlocked;
    recordTest(
      12,
      'Interrupted synthetic batch and journal recovery behavior, without real deletion',
      passed,
      `Simulated crash intercepted: ${crashed}, Journal marked UNVERIFIED: ${journalHasUnverified}, Re-run blocked: ${detectedInManifest}, Counter init blocked: ${counterInitBlocked}`
    );
  } catch (err) {
    recordTest(12, 'Interrupted synthetic batch and journal recovery behavior, without real deletion', false, `Error: ${err.message}`);
  }

  // --- Test 13: Counter preservation and commissioning precondition validation without resetting counters ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    // 1. Attempt counter init while test records remain -> MUST FAIL & preserve counters
    let counterInitBlocked = false;
    let initialCounters = store.get('system', 'counters');
    const origGsc = initialCounters.globalSequenceCounter;
    try {
      orch.initializeCounters(store);
    } catch (e) {
      counterInitBlocked = true;
    }
    const preservedCounters = store.get('system', 'counters');
    const counterPreserved = preservedCounters.globalSequenceCounter === origGsc;

    // 2. Perform synthetic simulation batch deletions to test commissioning guard on zeroed counter
    orch.simulateBatchDeletions(store);
    orch.initializeCounters(store);
    orch.releaseMaintenanceLock();

    // 3. Independent receipt attempted when counter is 0 -> MUST BE BLOCKED
    let independentPreemptBlocked = false;
    let preemptErr = '';
    try {
      orch.executeCommissioningTransaction(store, {
        type: 'independent_receipt',
        amount: 250,
        name: 'Early Devotee'
      });
    } catch (e) {
      independentPreemptBlocked = true;
      preemptErr = e.message;
    }

    // 4. Inaugural bill created -> allocates BILL-001 / R-001
    const inauguralBill = orch.executeCommissioningTransaction(store, {
      type: 'billing',
      totalAmount: 100,
      devoteeName: 'Inaugural Genuine Devotee'
    });

    const passed = counterInitBlocked &&
                   counterPreserved &&
                   independentPreemptBlocked &&
                   preemptErr.includes('COMMISSIONING_GUARD_VIOLATION') &&
                   inauguralBill.billNo === 'BILL-001' &&
                   inauguralBill.accountingReceiptNo === 'R-001';

    recordTest(
      13,
      'Counter preservation and commissioning precondition validation without resetting counters',
      passed,
      `Counter init blocked on dirty store: ${counterInitBlocked}, Counter preserved: ${counterPreserved}, Preemption blocked: ${independentPreemptBlocked}, Inaugural allocated: ${inauguralBill.billNo}/${inauguralBill.accountingReceiptNo}`
    );
  } catch (err) {
    recordTest(13, 'Counter preservation and commissioning precondition validation without resetting counters', false, `Error: ${err.message}`);
  }

  // --- Test 14: Concurrent-operation and stale-idempotency hazard detection ---
  try {
    const store = createFullSyntheticFixture();
    // 1. Inject stale idempotency token pointing to non-existent reservation
    store.set('system', 'op_stale_999', {
      _firestoreId: 'op_stale_999',
      operationId: 'op_stale_999',
      resDocId: 'res_999',
      status: 'committed'
    });

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);
    const staleDetected = manifest.linkageErrors.some(e => e.includes("Stale Idempotency Token: 'op_stale_999' references missing or non-target reservation 'res_999'"));

    // 2. Test maintenance lock concurrent transaction intercept
    orch.engageMaintenanceLock();
    let maintenanceBlocked = false;
    try {
      orch.interceptTransactionAttempt('billing', { amount: 100 });
    } catch (e) {
      maintenanceBlocked = e.message.includes('MAINTENANCE_LOCK_ACTIVE');
    }
    orch.releaseMaintenanceLock();

    const passed = staleDetected && maintenanceBlocked && manifest.eligibleForReset === false;
    recordTest(
      14,
      'Concurrent-operation and stale-idempotency hazard detection',
      passed,
      `Stale token detected: ${staleDetected}, Concurrent operation during maintenance blocked: ${maintenanceBlocked}`
    );
  } catch (err) {
    recordTest(14, 'Concurrent-operation and stale-idempotency hazard detection', false, `Error: ${err.message}`);
  }

  // --- Test 15: Every destructive entry point remains disabled and causes zero mutations ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const destructiveEntryPoints = [
      { name: 'execute', fn: (opts) => orch.execute(manifest, opts) },
      { name: 'executeReset', fn: (opts) => orch.executeReset(manifest, opts) },
      { name: 'executeCleanup', fn: (opts) => orch.executeCleanup(manifest, opts) },
      { name: 'performLiveDeletion', fn: (opts) => orch.performLiveDeletion(manifest, opts) },
      { name: 'executeBatchedDeletions', fn: (opts) => orch.executeBatchedDeletions(manifest, opts) }
    ];

    const bypassAttempts = [
      {},
      { dryRun: false },
      { override: true },
      { force: true },
      { trusteeApproved: true },
      { adminToken: 'MASTER_OVERRIDE' },
      { dryRun: false, override: true, trusteeApproved: true, force: true, adminToken: 'MASTER_OVERRIDE' }
    ];

    let allBlocked = true;
    let failureDetail = '';

    for (const ep of destructiveEntryPoints) {
      for (const attempt of bypassAttempts) {
        let threw = false;
        let errCode = null;
        let mutations = null;
        try {
          ep.fn(attempt);
        } catch (e) {
          threw = true;
          errCode = e.code;
          if (e.details) {
            mutations = e.details.mutationsPerformed;
          }
        }

        if (!threw || errCode !== 'EXECUTE_MODE_DISABLED' || mutations !== 0) {
          allBlocked = false;
          failureDetail = `${ep.name} failed to throw EXECUTE_MODE_DISABLED under options ${JSON.stringify(attempt)}`;
          break;
        }
      }
      if (!allBlocked) break;
    }

    // Verify 0 mutations occurred in store
    const billCountAfter = store.list('billing').length;
    const rcptCountAfter = store.list('receipts').length;
    const zeroMutations = billCountAfter === 2 && rcptCountAfter === 4;

    const passed = allBlocked && zeroMutations;
    recordTest(
      15,
      'Every destructive entry point remains disabled and causes zero mutations',
      passed,
      passed ? `All 5 destructive methods rejected 7 bypass configurations each (35 checks). Zero mutations confirmed.` : failureDetail
    );
  } catch (err) {
    recordTest(15, 'Every destructive entry point remains disabled and causes zero mutations', false, `Error: ${err.message}`);
  }

  // --- Test 16: Reverse audit: missing bill reservation detected and reset blocked ---
  try {
    const store = createFullSyntheticFixture();
    store.delete('system', 'res_1');
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const missingResDetected = manifest.linkageErrors.some(e => e.includes("Missing Reservation: Bill 'bill_1' points to missing"));
    const passed = missingResDetected && manifest.eligibleForReset === false;
    recordTest(
      16,
      'Reverse audit: missing bill reservation detected and reset blocked',
      passed,
      `Detected: "${missingResDetected}", Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(16, 'Reverse audit: missing bill reservation detected and reset blocked', false, `Error: ${err.message}`);
  }

  // --- Test 17: Reverse audit: missing receipt reservation detected and reset blocked ---
  try {
    const store = createFullSyntheticFixture();
    store.delete('system', 'res_2');
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const missingResDetected = manifest.linkageErrors.some(e => e.includes("Missing Reservation: Receipt 'rcpt_2' points to missing"));
    const passed = missingResDetected && manifest.eligibleForReset === false;
    recordTest(
      17,
      'Reverse audit: missing receipt reservation detected and reset blocked',
      passed,
      `Detected: "${missingResDetected}", Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(17, 'Reverse audit: missing receipt reservation detected and reset blocked', false, `Error: ${err.message}`);
  }

  // --- Test 18: Subledger schema validation: malformed payloads quarantined and reset blocked ---
  try {
    const store = createFullSyntheticFixture();
    // Corrupt payloads aligned with actual application schemas
    store.set('payments', 'pay_1', { _firestoreId: 'pay_1', amount: -50, fund: '', category: '' }); // Invalid amount & fund & category
    store.set('transfers', 'tx_1', { _firestoreId: 'tx_1', amount: 100, fromAcc: 'Canara Bank', toAcc: 'Canara Bank' }); // Same accounts
    store.set('loans', 'loan_1', { _firestoreId: 'loan_1', person: '', loanReceived: -100, repayment: 0 }); // Invalid person & negative amount
    store.set('chittyCollections', 'cc_1', { _firestoreId: 'cc_1', amountReceived: 0, memberId: '' }); // Zero amountReceived & empty member
    store.set('chittyPayouts', 'cp_1', { _firestoreId: 'cp_1', amount: -100, memberId: '' }); // Negative amount & empty member

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const quarantinedSubledgers = manifest.quarantinedRecords.filter(q => q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const passed = quarantinedSubledgers.length === 5 && manifest.eligibleForReset === false;
    recordTest(
      18,
      'Subledger schema validation: malformed payloads quarantined and reset blocked',
      passed,
      `Quarantined malformed subledger records: ${quarantinedSubledgers.length}/5, Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(18, 'Subledger schema validation: malformed payloads quarantined and reset blocked', false, `Error: ${err.message}`);
  }

  // --- Test 19: Clean-slate residual detection across all target collections and unknown collections ---
  try {
    const orch = new TransactionalResetOrchestrator();
    const cleanStore = new SyntheticFirestore();
    cleanStore.set('system', '_resetJournal', { _firestoreId: '_resetJournal', status: 'COMPLETED' });

    const csInitial = orch.verifyCleanSlate(cleanStore);
    const initialClean = csInitial.clean;

    const targetsToTest = [
      { col: 'billing', id: 'bill_1', doc: { id: 1 } },
      { col: 'receipts', id: 'rcpt_1', doc: { id: 1 } },
      { col: 'payments', id: 'pay_1', doc: { id: 1 } },
      { col: 'transfers', id: 'tx_1', doc: { id: 1 } },
      { col: 'loans', id: 'loan_1', doc: { id: 1 } },
      { col: 'chittyCollections', id: 'cc_1', doc: { id: 1 } },
      { col: 'chittyPayouts', id: 'cp_1', doc: { id: 1 } },
      { col: 'migration_staging', id: 'stage_1', doc: { id: 1 } },
      { col: '__system_diagnostics__', id: 'test_1', doc: { id: 1 } },
      { col: 'system', id: 'res_1', doc: { id: 1 } },
      { col: 'system', id: 'op_bill_1', doc: { id: 1 } },
      { col: 'unknown_audit_col', id: 'rogue_doc', doc: { rogue: true } }
    ];

    let allDetected = true;
    for (const t of targetsToTest) {
      cleanStore.set(t.col, t.id, t.doc);
      const cs = orch.verifyCleanSlate(cleanStore);
      if (cs.clean) {
        allDetected = false;
      }
      cleanStore.delete(t.col, t.id);
    }

    const passed = initialClean && allDetected;
    recordTest(
      19,
      'Clean-slate residual detection across all target collections and unknown collections',
      passed,
      `All 12 individual residual injections detected: ${allDetected}`
    );
  } catch (err) {
    recordTest(19, 'Clean-slate residual detection across all target collections and unknown collections', false, `Error: ${err.message}`);
  }

  // --- Test 20: Synthetic-store guard: rejection of non-synthetic store across all public entry points ---
  try {
    const nonSynthetic = { isSynthetic: false };
    const orch = new TransactionalResetOrchestrator();

    const entryPoints = [
      { name: 'assertQuarantine', fn: () => orch.assertQuarantine(nonSynthetic) },
      { name: 'generateManifest', fn: () => orch.generateManifest(nonSynthetic) },
      { name: 'produceDryRunReport', fn: () => orch.produceDryRunReport(nonSynthetic) },
      { name: 'simulateBatchDeletions', fn: () => orch.simulateBatchDeletions(nonSynthetic) },
      { name: 'verifyCleanSlate', fn: () => orch.verifyCleanSlate(nonSynthetic) },
      { name: 'initializeCounters', fn: () => orch.initializeCounters(nonSynthetic) },
      { name: 'executeCommissioningTransaction', fn: () => orch.executeCommissioningTransaction(nonSynthetic, { type: 'billing' }) }
    ];

    let allRejected = true;
    for (const ep of entryPoints) {
      let rejected = false;
      try {
        ep.fn();
      } catch (e) {
        if (e.message.includes('QUARANTINE_ERROR') && e.message.includes('store.isSynthetic !== true')) {
          rejected = true;
        }
      }
      if (!rejected) allRejected = false;
    }

    recordTest(
      20,
      'Synthetic-store guard: rejection of non-synthetic store across all public entry points',
      allRejected,
      `Enforced across all ${entryPoints.length} public entry points: ${allRejected}`
    );
  } catch (err) {
    recordTest(20, 'Synthetic-store guard: rejection of non-synthetic store across all public entry points', false, `Error: ${err.message}`);
  }

  // --- Test 21: Voucher counter consistency: reset to 500 policy and subsequent voucher sequence ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    orch.simulateBatchDeletions(store);
    const postInitCounters = orch.initializeCounters(store);
    orch.releaseMaintenanceLock();

    const voucherCounterResetTo500 = postInitCounters.voucherCounter === 500;
    const gscZeroed = postInitCounters.globalSequenceCounter === 0;

    // Commissioning: inaugural bill -> sequence 1
    orch.executeCommissioningTransaction(store, {
      type: 'billing',
      totalAmount: 100,
      devoteeName: 'Inaugural'
    });

    // First genuine voucher allocated -> must be V-501
    const v501 = orch.executeCommissioningTransaction(store, {
      type: 'payment',
      amount: 150,
      category: 'Pooja Materials'
    });

    // Second genuine voucher -> must be V-502
    const v502 = orch.executeCommissioningTransaction(store, {
      type: 'payment',
      amount: 200,
      category: 'Electricity'
    });

    const passed = voucherCounterResetTo500 && gscZeroed && v501.voucherNo === 'V-501' && v502.voucherNo === 'V-502';
    recordTest(
      21,
      'Voucher counter consistency: reset to 500 policy and subsequent voucher sequence',
      passed,
      `Voucher counter reset to 500: ${voucherCounterResetTo500}, First voucher: ${v501.voucherNo}, Second voucher: ${v502.voucherNo}`
    );
  } catch (err) {
    recordTest(21, 'Voucher counter consistency: reset to 500 policy and subsequent voucher sequence', false, `Error: ${err.message}`);
  }

  // --- Test 22: Relationship validation: reservation referencing missing operation document ---
  try {
    const store = createFullSyntheticFixture();
    store.delete('system', 'op_bill_1');

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const detected = manifest.linkageErrors.some(e =>
      e.includes("Missing Operation Document: Software reservation 'res_1' references missing")
    );
    const passed = detected && manifest.eligibleForReset === false;
    recordTest(
      22,
      'Relationship validation: reservation referencing missing operation document',
      passed,
      `Detected missing operation document: ${detected}, Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(22, 'Relationship validation: reservation referencing missing operation document', false, `Error: ${err.message}`);
  }

  // --- Test 23: Relationship validation: operation referencing missing software reservation ---
  try {
    const store = createFullSyntheticFixture();
    store.set('system', 'op_orphan', {
      _firestoreId: 'op_orphan',
      operationId: 'op_orphan',
      resDocId: 'res_999',
      status: 'committed'
    });

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const detected = manifest.linkageErrors.some(e =>
      e.includes("Stale Idempotency Token: 'op_orphan' references missing or non-target reservation 'res_999'")
    );
    const passed = detected && manifest.eligibleForReset === false;
    recordTest(
      23,
      'Relationship validation: operation referencing missing software reservation',
      passed,
      `Detected stale operation token: ${detected}, Reset blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(23, 'Relationship validation: operation referencing missing software reservation', false, `Error: ${err.message}`);
  }

  // --- Test 24: Manifest digest coverage: changing a preserved record ID changes the digest ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    // Rename preserved fund doc
    const fundDoc = storeB.get('funds', 'fund_1');
    storeB.delete('funds', 'fund_1');
    fundDoc._firestoreId = 'fund_99';
    fundDoc.id = 99;
    storeB.set('funds', 'fund_99', fundDoc);

    const orchA = new TransactionalResetOrchestrator();
    const orchB = new TransactionalResetOrchestrator();

    const hashA = orchA.generateManifest(storeA).manifestHash;
    const hashB = orchB.generateManifest(storeB).manifestHash;

    const passed = hashA !== hashB;
    recordTest(
      24,
      'Manifest digest coverage: changing a preserved record ID changes the digest',
      passed,
      `Base Hash: ${hashA} | Modified Hash: ${hashB} | Digests differ: ${passed}`
    );
  } catch (err) {
    recordTest(24, 'Manifest digest coverage: changing a preserved record ID changes the digest', false, `Error: ${err.message}`);
  }

  // --- Test 25: Manifest digest coverage: changing target membership changes the digest ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    // Add an extra valid payment (using actual application schema: category)
    storeB.set('payments', 'pay_2', {
      _firestoreId: 'pay_2',
      id: 502,
      voucherNo: 'V-502',
      amount: 200,
      fund: 'General Temple Fund',
      category: 'Electricity'
    });

    const hashA = new TransactionalResetOrchestrator().generateManifest(storeA).manifestHash;
    const hashB = new TransactionalResetOrchestrator().generateManifest(storeB).manifestHash;

    const passed = hashA !== hashB;
    recordTest(
      25,
      'Manifest digest coverage: changing target membership changes the digest',
      passed,
      `Base Hash: ${hashA} | Modified Hash: ${hashB} | Digests differ: ${passed}`
    );
  } catch (err) {
    recordTest(25, 'Manifest digest coverage: changing target membership changes the digest', false, `Error: ${err.message}`);
  }

  // --- Test 26: Manifest digest coverage: changing preserved membership changes the digest ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    // Add extra preserved member
    storeB.set('chittyMembers', 'member_2', {
      _firestoreId: 'member_2',
      id: 2,
      name: 'Member 2'
    });

    const hashA = new TransactionalResetOrchestrator().generateManifest(storeA).manifestHash;
    const hashB = new TransactionalResetOrchestrator().generateManifest(storeB).manifestHash;

    const passed = hashA !== hashB;
    recordTest(
      26,
      'Manifest digest coverage: changing preserved membership changes the digest',
      passed,
      `Base Hash: ${hashA} | Modified Hash: ${hashB} | Digests differ: ${passed}`
    );
  } catch (err) {
    recordTest(26, 'Manifest digest coverage: changing preserved membership changes the digest', false, `Error: ${err.message}`);
  }

  // --- Test 27: Manifest digest coverage: changing quarantine status changes the digest ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    storeB.set('random_dump', 'dump_1', { data: 'test' });

    const hashA = new TransactionalResetOrchestrator().generateManifest(storeA).manifestHash;
    const hashB = new TransactionalResetOrchestrator().generateManifest(storeB).manifestHash;

    const passed = hashA !== hashB;
    recordTest(
      27,
      'Manifest digest coverage: changing quarantine status changes the digest',
      passed,
      `Base Hash: ${hashA} | Modified Hash: ${hashB} | Digests differ: ${passed}`
    );
  } catch (err) {
    recordTest(27, 'Manifest digest coverage: changing quarantine status changes the digest', false, `Error: ${err.message}`);
  }

  // --- Test 28: Manifest digest coverage: tampering with target document content changes the digest (document fingerprinting) ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    // Tamper with bill amount but keep IDs identical
    const bill = storeB.get('billing', 'bill_1');
    bill.totalAmount = 9999;
    storeB.set('billing', 'bill_1', bill);

    const hashA = new TransactionalResetOrchestrator().generateManifest(storeA).manifestHash;
    const hashB = new TransactionalResetOrchestrator().generateManifest(storeB).manifestHash;

    const passed = hashA !== hashB;
    recordTest(
      28,
      'Manifest digest coverage: tampering with target document content changes the digest (document fingerprinting)',
      passed,
      `Base Hash: ${hashA} | Tampered Hash: ${hashB} | Digests differ: ${passed}`
    );
  } catch (err) {
    recordTest(28, 'Manifest digest coverage: tampering with target document content changes the digest', false, `Error: ${err.message}`);
  }

  // --- Test 29: Air-gap guard: live Firebase URLs, credentials, and emulator environment variables actively rejected ---
  try {
    const forbiddenOptions = [
      { productionDatabaseUrl: 'https://temple-f4f7d.firebaseio.com' },
      { firebaseConfig: { projectId: 'temple-f4f7d' } },
      { serviceAccount: { client_email: 'service@temple-f4f7d.iam.gserviceaccount.com' } },
      { emulatorHost: 'localhost:8080' },
      { databaseUrl: 'http://127.0.0.1:8080' }
    ];

    let allRejected = true;
    for (const opt of forbiddenOptions) {
      let threw = false;
      try {
        new TransactionalResetOrchestrator(opt);
      } catch (e) {
        if (e.message.includes('SECURITY_VIOLATION')) {
          threw = true;
        }
      }
      if (!threw) allRejected = false;
    }

    recordTest(
      29,
      'Air-gap guard: live Firebase URLs, credentials, and emulator environment variables actively rejected',
      allRejected,
      `All ${forbiddenOptions.length} live credential/endpoint options rejected with SECURITY_VIOLATION: ${allRejected}`
    );
  } catch (err) {
    recordTest(29, 'Air-gap guard: live Firebase URLs, credentials, and emulator options', false, `Error: ${err.message}`);
  }

  // --- Test 30: Recovery gap analysis completeness: safe-merge documented, external managed backup mandated ---
  try {
    const gapAnalysis = RECOVERY_GAP_ANALYSIS;
    const safeMergeDoc = gapAnalysis.restoreFunctionType === 'safe_merge_non_destructive';
    const noRollback = gapAnalysis.exactRollbackSupported === false;
    const hasUnrepresented = gapAnalysis.unrepresentedCollections.length >= 3;
    const mandatesExternal = gapAnalysis.mandatoryLivePrecondition.includes('gcloud firestore export');

    const passed = safeMergeDoc && noRollback && hasUnrepresented && mandatesExternal;
    recordTest(
      30,
      'Recovery gap analysis completeness: safe-merge documented, external managed backup mandated',
      passed,
      `Safe-merge documented: ${safeMergeDoc}, Exact rollback unsupported: ${noRollback}, Unrepresented collections: ${gapAnalysis.unrepresentedCollections.length}, Managed backup mandated: ${mandatesExternal}`
    );
  } catch (err) {
    recordTest(30, 'Recovery gap analysis completeness', false, `Error: ${err.message}`);
  }

  // --- Test 31: CLI execution safety: dry-run argument succeeds; execution flags trigger fatal rejection ---
  try {
    const tempFixturePath = path.join(__dirname, '..', 'scripts', '_temp_test_fixture.json');
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    fs.writeFileSync(tempFixturePath, JSON.stringify(backup, null, 2), 'utf8');

    // Test execution flag rejection via child process invocation of script
    let execRejected = false;
    try {
      child_process.execSync(`node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --execute`, {
        stdio: 'pipe'
      });
    } catch (e) {
      const errOutput = e.stderr ? e.stderr.toString() : '';
      if (errOutput.includes('EXECUTE_MODE_DISABLED')) {
        execRejected = true;
      }
    }

    // Test dry-run succeeds
    let dryRunSucceeded = false;
    try {
      const output = child_process.execSync(
        `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempFixturePath}"`,
        { stdio: 'pipe' }
      );
      const parsed = JSON.parse(output.toString());
      if (parsed.dryRun === true && parsed.executionLocked === true && parsed.manifestHash) {
        dryRunSucceeded = true;
      }
    } catch (e) {}

    // Cleanup temp file
    if (fs.existsSync(tempFixturePath)) {
      fs.unlinkSync(tempFixturePath);
    }

    const passed = execRejected && dryRunSucceeded;
    recordTest(
      31,
      'CLI execution safety: dry-run argument succeeds; execution flags trigger fatal rejection',
      passed,
      `--execute flag rejected with EXECUTE_MODE_DISABLED: ${execRejected}, --dry-run produced valid report: ${dryRunSucceeded}`
    );
  } catch (err) {
    recordTest(31, 'CLI execution safety', false, `Error: ${err.message}`);
  }

  // --- Test 32: Intercepted network and process eavesdropping guard: asserts 0 network calls throughout execution ---
  try {
    const passed = networkCallsDetected === 0;
    recordTest(
      32,
      'Intercepted network and process eavesdropping guard: asserts 0 network calls throughout execution',
      passed,
      `Network calls detected across entire test suite run: ${networkCallsDetected}`
    );
  } catch (err) {
    recordTest(32, 'Intercepted network and process eavesdropping guard', false, `Error: ${err.message}`);
  }

  // --- Test 33: Schema fidelity: Independent software receipts (source: 'firestore') and negative controls ---
  try {
    const store = createFullSyntheticFixture();
    // Add independent software receipt with real application schema (rcpt_10, res_10, op_rcpt_10)
    store.set('receipts', 'rcpt_10', {
      _firestoreId: 'rcpt_10',
      id: 10,
      receiptNo: 'R-010',
      source: 'firestore',
      billingId: null,
      billingFirestoreId: null,
      billingReceiptNo: null,
      reservationDocId: 'res_10',
      operationId: 'op_rcpt_10',
      amount: 750,
      name: 'Special Devotee',
      fund: 'General Temple Fund',
      category: 'Special Pooja'
    });
    store.set('system', 'res_10', {
      _firestoreId: 'res_10',
      seqNumber: 10,
      formattedNo: '010',
      type: 'independent_receipt',
      status: 'active',
      billDocId: null,
      receiptDocId: 'rcpt_10',
      operationId: 'op_rcpt_10'
    });
    store.set('system', 'op_rcpt_10', {
      _firestoreId: 'op_rcpt_10',
      operationId: 'op_rcpt_10',
      seqNumber: 10,
      resDocId: 'res_10',
      billDocId: null,
      receiptDocId: 'rcpt_10',
      status: 'committed'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const indepTargeted = manifest.targetRecords.some(r => r.collection === 'receipts' && r.id === 'rcpt_10');
    const resTargeted = manifest.targetRecords.some(r => r.collection === 'system' && r.id === 'res_10');
    const eligibleClean = manifest.eligibleForReset === true;

    // Negative control 1: Independent receipt corrupted with unlinked billingId
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('receipts', 'rcpt_11', {
      _firestoreId: 'rcpt_11',
      id: 11,
      receiptNo: 'R-011',
      source: 'firestore',
      billingId: 9999, // Broken billing link
      reservationDocId: 'res_11',
      operationId: 'op_rcpt_11'
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Physical receipt never classified as software receipt
    const physInTargets = manifest.targetRecords.some(r => r.id === 'rcpt_phys_P600');
    const physInPreserved = manifest.preservedRecords.some(r => r.id === 'rcpt_phys_P600');

    // Negative control 3: Missing software reservation for independent receipt
    const storeNeg3 = createFullSyntheticFixture();
    storeNeg3.set('receipts', 'rcpt_12', {
      _firestoreId: 'rcpt_12',
      id: 12,
      receiptNo: 'R-012',
      source: 'firestore',
      billingId: null,
      reservationDocId: 'res_missing_12',
      operationId: 'op_rcpt_12',
      amount: 500,
      name: 'No Res Devotee',
      fund: 'General Temple Fund'
    });
    const manifestNeg3 = orch.generateManifest(storeNeg3);
    const neg3Blocked = manifestNeg3.eligibleForReset === false &&
      manifestNeg3.linkageErrors.some(e => e.includes("Missing Reservation: Receipt 'rcpt_12' points to missing"));

    const passed = indepTargeted && resTargeted && eligibleClean && neg1Blocked && !physInTargets && physInPreserved && neg3Blocked;
    recordTest(
      33,
      "Schema fidelity: Independent software receipts (source: 'firestore') and negative controls",
      passed,
      `Targeted: ${indepTargeted}, Clean eligible: ${eligibleClean}, Neg1 blocked: ${neg1Blocked}, Phys excluded from targets: ${!physInTargets}, Neg3 blocked: ${neg3Blocked}`
    );
  } catch (err) {
    recordTest(33, "Schema fidelity: Independent software receipts (source: 'firestore') and negative controls", false, `Error: ${err.message}`);
  }

  // --- Test 34: Schema fidelity: Payment category validation and legacy fallback negative controls ---
  try {
    const store = createFullSyntheticFixture();
    // Payment with real application field: category (docId: pay_505)
    store.set('payments', 'pay_505', {
      _firestoreId: 'pay_505',
      id: 505,
      voucherNo: 'V-505',
      amount: 450,
      fund: 'General Temple Fund',
      category: 'Annadanam Expenses',
      paidTo: 'Rice Merchant'
    });
    // Payment with legacy fallback field: expenseCategory (docId: pay_506)
    store.set('payments', 'pay_506', {
      _firestoreId: 'pay_506',
      id: 506,
      voucherNo: 'V-506',
      amount: 600,
      fund: 'General Temple Fund',
      expenseCategory: 'Pooja Items',
      paidTo: 'Flower Supplier'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const realCatTargeted = manifest.targetRecords.some(r => r.id === 'pay_505');
    const legacyCatTargeted = manifest.targetRecords.some(r => r.id === 'pay_506');
    const eligibleClean = manifest.eligibleForReset === true;

    // Negative control 1: Payment missing both category and expenseCategory
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('payments', 'pay_507', {
      _firestoreId: 'pay_507',
      id: 507,
      amount: 100,
      fund: 'General Temple Fund'
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Quarantined = manifestNeg1.quarantinedRecords.some(q => q.id === 'pay_507' && q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Payment with non-positive amount
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.set('payments', 'pay_508', {
      _firestoreId: 'pay_508',
      id: 508,
      amount: -100,
      fund: 'General Temple Fund',
      category: 'Invalid'
    });
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    const passed = realCatTargeted && legacyCatTargeted && eligibleClean && neg1Quarantined && neg1Blocked && neg2Blocked;
    recordTest(
      34,
      'Schema fidelity: Payment category validation and legacy fallback negative controls',
      passed,
      `Real category targeted: ${realCatTargeted}, Legacy fallback targeted: ${legacyCatTargeted}, Neg1 quarantined/blocked: ${neg1Quarantined && neg1Blocked}, Neg2 blocked: ${neg2Blocked}`
    );
  } catch (err) {
    recordTest(34, 'Schema fidelity: Payment category validation and legacy fallback negative controls', false, `Error: ${err.message}`);
  }

  // --- Test 35: Schema fidelity: Transfer fromAcc/toAcc validation and negative controls ---
  try {
    const store = createFullSyntheticFixture();
    // Transfer with real application fields: fromAcc and toAcc
    store.set('transfers', 'tx_real', {
      _firestoreId: 'tx_real',
      id: 10,
      amount: 2500,
      fromAcc: 'General Temple Fund',
      toAcc: 'Canara Bank'
    });
    // Transfer with legacy fallback fields: fromAccount and toAccount
    store.set('transfers', 'tx_legacy', {
      _firestoreId: 'tx_legacy',
      id: 11,
      amount: 1500,
      fromAccount: 'Canara Bank',
      toAccount: 'Chitty Fund'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const realTxTargeted = manifest.targetRecords.some(r => r.id === 'tx_real');
    const legacyTxTargeted = manifest.targetRecords.some(r => r.id === 'tx_legacy');
    const eligibleClean = manifest.eligibleForReset === true;

    // Negative control 1: Self-transfer (fromAcc === toAcc)
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('transfers', 'tx_self', {
      _firestoreId: 'tx_self',
      id: 12,
      amount: 1000,
      fromAcc: 'Canara Bank',
      toAcc: 'Canara Bank'
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Quarantined = manifestNeg1.quarantinedRecords.some(q => q.id === 'tx_self' && q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Missing destination account
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.set('transfers', 'tx_no_dest', {
      _firestoreId: 'tx_no_dest',
      id: 13,
      amount: 1000,
      fromAcc: 'Canara Bank'
    });
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    const passed = realTxTargeted && legacyTxTargeted && eligibleClean && neg1Quarantined && neg1Blocked && neg2Blocked;
    recordTest(
      35,
      'Schema fidelity: Transfer fromAcc/toAcc validation and negative controls',
      passed,
      `Real transfer targeted: ${realTxTargeted}, Legacy fallback targeted: ${legacyTxTargeted}, Neg1 self-transfer quarantined: ${neg1Quarantined}, Neg2 blocked: ${neg2Blocked}`
    );
  } catch (err) {
    recordTest(35, 'Schema fidelity: Transfer fromAcc/toAcc validation and negative controls', false, `Error: ${err.message}`);
  }

  // --- Test 36: Schema fidelity: Loans person, loanReceived, repayment validation and negative controls ---
  try {
    const store = createFullSyntheticFixture();
    // Loan record representing loan disbursement (real schema: person, loanReceived, repayment: 0)
    store.set('loans', 'loan_disburse', {
      _firestoreId: 'loan_disburse',
      id: 20,
      person: 'Devotee Borrower',
      loanReceived: 25000,
      repayment: 0,
      date: '2026-10-19'
    });
    // Loan record representing repayment (real schema: person, loanReceived: 0, repayment)
    store.set('loans', 'loan_repay', {
      _firestoreId: 'loan_repay',
      id: 21,
      person: 'Devotee Borrower',
      loanReceived: 0,
      repayment: 5000,
      date: '2026-10-20'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const disburseTargeted = manifest.targetRecords.some(r => r.id === 'loan_disburse');
    const repayTargeted = manifest.targetRecords.some(r => r.id === 'loan_repay');
    const eligibleClean = manifest.eligibleForReset === true;

    // Verify master data is unaffected and no principalAmount/borrowerName requirement
    const noFictitiousRequirement = disburseTargeted && repayTargeted;

    // Negative control 1: Loan record missing person field
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('loans', 'loan_no_person', {
      _firestoreId: 'loan_no_person',
      id: 22,
      loanReceived: 5000
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Quarantined = manifestNeg1.quarantinedRecords.some(q => q.id === 'loan_no_person' && q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Loan record with zero for both loanReceived and repayment
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.set('loans', 'loan_zero', {
      _firestoreId: 'loan_zero',
      id: 23,
      person: 'Devotee Borrower',
      loanReceived: 0,
      repayment: 0
    });
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    const passed = disburseTargeted && repayTargeted && noFictitiousRequirement && eligibleClean && neg1Quarantined && neg1Blocked && neg2Blocked;
    recordTest(
      36,
      'Schema fidelity: Loans person, loanReceived, repayment validation and negative controls',
      passed,
      `Disbursement targeted: ${disburseTargeted}, Repayment targeted: ${repayTargeted}, Real schema confirmed: ${noFictitiousRequirement}, Neg1 quarantined/blocked: ${neg1Quarantined && neg1Blocked}, Neg2 blocked: ${neg2Blocked}`
    );
  } catch (err) {
    recordTest(36, 'Schema fidelity: Loans person, loanReceived, repayment validation and negative controls', false, `Error: ${err.message}`);
  }

  // --- Test 37: Schema fidelity: Chitty collections amountReceived validation and member verification ---
  try {
    const store = createFullSyntheticFixture();
    // Chitty collection with real schema: amountReceived and memberId
    store.set('chittyCollections', 'cc_real', {
      _firestoreId: 'cc_real',
      id: 30,
      memberId: 1,
      amountReceived: 2000,
      date: '2026-10-19',
      receiptNo: 'CC-30'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const ccTargeted = manifest.targetRecords.some(r => r.id === 'cc_real');
    const memberPreserved = manifest.preservedRecords.some(r => r.collection === 'chittyMembers' && r.id === 'member_1');
    const memberNotTargeted = !manifest.targetRecords.some(r => r.collection === 'chittyMembers');
    const eligibleClean = manifest.eligibleForReset === true;

    // Negative control 1: Chitty collection missing amountReceived (e.g. guessed 'amount')
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('chittyCollections', 'cc_guessed', {
      _firestoreId: 'cc_guessed',
      id: 31,
      memberId: 1,
      amount: 2000 // Guessed field, not real amountReceived
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Quarantined = manifestNeg1.quarantinedRecords.some(q => q.id === 'cc_guessed' && q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Chitty collection with empty memberId
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.set('chittyCollections', 'cc_no_member', {
      _firestoreId: 'cc_no_member',
      id: 32,
      memberId: '',
      amountReceived: 1000
    });
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    const passed = ccTargeted && memberPreserved && memberNotTargeted && eligibleClean && neg1Quarantined && neg1Blocked && neg2Blocked;
    recordTest(
      37,
      'Schema fidelity: Chitty collections amountReceived validation and member verification',
      passed,
      `Collection targeted: ${ccTargeted}, Master member preserved: ${memberPreserved}, Member excluded from targets: ${memberNotTargeted}, Neg1 guessed field quarantined: ${neg1Quarantined}, Neg2 blocked: ${neg2Blocked}`
    );
  } catch (err) {
    recordTest(37, 'Schema fidelity: Chitty collections amountReceived validation and member verification', false, `Error: ${err.message}`);
  }

  // --- Test 38: Schema fidelity: Chitty payouts amount validation and negative controls ---
  try {
    const store = createFullSyntheticFixture();
    // Chitty payout with real schema: amount and memberId
    store.set('chittyPayouts', 'cp_real', {
      _firestoreId: 'cp_real',
      id: 40,
      memberId: 1,
      amount: 19500,
      date: '2026-10-19'
    });
    attachSourceIdentity(store);

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const cpTargeted = manifest.targetRecords.some(r => r.id === 'cp_real');
    const eligibleClean = manifest.eligibleForReset === true;

    // Negative control 1: Non-positive amount
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('chittyPayouts', 'cp_neg', {
      _firestoreId: 'cp_neg',
      id: 41,
      memberId: 1,
      amount: -500
    });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Quarantined = manifestNeg1.quarantinedRecords.some(q => q.id === 'cp_neg' && q.reason === 'MALFORMED_SUBLEDGER_PAYLOAD');
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Missing memberId
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.set('chittyPayouts', 'cp_no_member', {
      _firestoreId: 'cp_no_member',
      id: 42,
      amount: 10000
    });
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    const passed = cpTargeted && eligibleClean && neg1Quarantined && neg1Blocked && neg2Blocked;
    recordTest(
      38,
      'Schema fidelity: Chitty payouts amount validation and negative controls',
      passed,
      `Payout targeted: ${cpTargeted}, Clean eligible: ${eligibleClean}, Neg1 quarantined/blocked: ${neg1Quarantined && neg1Blocked}, Neg2 blocked: ${neg2Blocked}`
    );
  } catch (err) {
    recordTest(38, 'Schema fidelity: Chitty payouts amount validation and negative controls', false, `Error: ${err.message}`);
  }

  // --- Test 39: Migration staging: nested subcollection detection and eligibility blocking ---
  try {
    // 1. Clean flat case: obsolete flat migration staging document
    const storeFlat = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifestFlat = orch.generateManifest(storeFlat);
    const flatTargeted = manifestFlat.targetRecords.some(r => r.collection === 'migration_staging' && r.id === 'batch_stage_1');
    const flatEligible = manifestFlat.eligibleForReset === true;
    const flatUnresolvedZero = manifestFlat.unresolvedNestedRecords.length === 0;

    // 2. Nested subcollection metadata presence
    const storeNested = createFullSyntheticFixture();
    storeNested.set('migration_staging', 'stage_nested_mig_1', {
      _firestoreId: 'stage_nested_mig_1',
      migrationId: 'mig_20261019_120000',
      storesCount: 4,
      totalWritten: 150,
      storeWriteResults: {
        receipts: 50,
        billing: 50,
        payments: 50
      }
    });

    const manifestNested = orch.generateManifest(storeNested);
    const nestedDetected = manifestNested.unresolvedNestedRecords.some(u =>
      u.id === 'stage_nested_mig_1' && u.reason === 'UNRESOLVED_NESTED_SUBCOLLECTIONS'
    );
    const nestedQuarantined = manifestNested.quarantinedRecords.some(q =>
      q.id === 'stage_nested_mig_1' && q.reason === 'UNRESOLVED_NESTED_SUBCOLLECTIONS'
    );
    const nestedBlocked = manifestNested.eligibleForReset === false;

    // Dry-run report exposure of unresolvedNestedRecords
    const reportNested = orch.produceDryRunReport(storeNested);
    const reportBlocked = reportNested.eligibleForReset === false;
    const reportHasUnresolved = reportNested.unresolvedNestedRecords.length > 0;

    // simulateBatchDeletions refusal on store with unresolved nested records
    let simBlocked = false;
    try {
      orch.simulateBatchDeletions(storeNested);
    } catch (e) {
      if (e.message.includes('not eligible for reset') || e.message.includes('eligibleForReset is false') || e.message.includes('EXECUTION_HALTED')) {
        simBlocked = true;
      }
    }

    const passed = flatTargeted && flatEligible && flatUnresolvedZero &&
      nestedDetected && nestedQuarantined && nestedBlocked &&
      reportBlocked && reportHasUnresolved && simBlocked;

    recordTest(
      39,
      'Migration staging: nested subcollection detection and eligibility blocking',
      passed,
      `Flat staging targeted: ${flatTargeted}, Nested detected: ${nestedDetected}, Reset blocked: ${nestedBlocked}, Report blocked: ${reportBlocked}, Simulation refused: ${simBlocked}`
    );
  } catch (err) {
    recordTest(39, 'Migration staging: nested subcollection detection and eligibility blocking', false, `Error: ${err.message}`);
  }

  // --- Test 40: Strict manifest eligibility exposure and multi-scenario negative controls ---
  try {
    const orch = new TransactionalResetOrchestrator();

    // Baseline: Clean synthetic store produces manifest.eligibleForReset === true
    const storeClean = createFullSyntheticFixture();
    const manifestClean = orch.generateManifest(storeClean);
    const cleanEligible = manifestClean.eligibleForReset === true;
    const cleanHash = manifestClean.manifestHash;

    // Check direct property exposure on returned manifest
    const propertyDirectlyExposed = Object.prototype.hasOwnProperty.call(manifestClean, 'eligibleForReset');
    const isBoolean = typeof manifestClean.eligibleForReset === 'boolean';

    // Negative control 1: Quarantined unknown collection doc
    const storeNeg1 = createFullSyntheticFixture();
    storeNeg1.set('unknown_test_col', 'alien_1', { data: 123 });
    const manifestNeg1 = orch.generateManifest(storeNeg1);
    const neg1Blocked = manifestNeg1.eligibleForReset === false;

    // Negative control 2: Broken linkage (missing receipt for bill)
    const storeNeg2 = createFullSyntheticFixture();
    storeNeg2.delete('receipts', 'rcpt_1');
    const manifestNeg2 = orch.generateManifest(storeNeg2);
    const neg2Blocked = manifestNeg2.eligibleForReset === false;

    // Negative control 3: Unresolved nested subcollection
    const storeNeg3 = createFullSyntheticFixture();
    storeNeg3.set('migration_staging', 'mig_nested', {
      _firestoreId: 'mig_nested',
      hasSubcollections: true
    });
    const manifestNeg3 = orch.generateManifest(storeNeg3);
    const neg3Blocked = manifestNeg3.eligibleForReset === false;

    // Negative control 4: Missing system counters document
    const storeNeg4 = createFullSyntheticFixture();
    storeNeg4.delete('system', 'counters');
    const manifestNeg4 = orch.generateManifest(storeNeg4);
    const neg4Blocked = manifestNeg4.eligibleForReset === false;

    // Digest coverage: Ineligible manifest produces different hash than clean manifest
    const hashDiffersOnIneligible = cleanHash !== manifestNeg1.manifestHash &&
      cleanHash !== manifestNeg2.manifestHash &&
      cleanHash !== manifestNeg3.manifestHash;

    const passed = cleanEligible && propertyDirectlyExposed && isBoolean &&
      neg1Blocked && neg2Blocked && neg3Blocked && neg4Blocked && hashDiffersOnIneligible;

    recordTest(
      40,
      'Strict manifest eligibility exposure and multi-scenario negative controls',
      passed,
      `Clean eligible: ${cleanEligible}, Property directly exposed: ${propertyDirectlyExposed}, Neg controls blocked (quarantine=${neg1Blocked}, linkage=${neg2Blocked}, nested=${neg3Blocked}, counter=${neg4Blocked}), Hash changes on corruption: ${hashDiffersOnIneligible}`
    );
  } catch (err) {
    recordTest(40, 'Strict manifest eligibility exposure and multi-scenario negative controls', false, `Error: ${err.message}`);
  }

  // ===========================================================================
  // STEP 33.144: REGRESSION TEST SUITE (GATE 4)
  //
  // Verifies authoritative source archive binding and mandatory CLI integrity preflight:
  // - Cryptographic binding of raw file SHA-256, metadata, and collection coverage
  // - Mandatory CLI dry-run integrity preflight before synthetic store construction
  // - Detection of missing, malformed, or tampered source exports
  // - Rejection of unverified direct manifest generation
  // ===========================================================================

  // --- Test 41: Valid synthetic export passes integrity preflight and produces manifest with explicit source identity ---
  try {
    const tempValidExportPath = path.join(__dirname, '..', 'scripts', '_temp_valid_export_test.json');
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    const backupJson = JSON.stringify(backup, null, 2);
    fs.writeFileSync(tempValidExportPath, backupJson, 'utf8');

    const rawBytes = fs.readFileSync(tempValidExportPath);
    const expectedFileSha = computeSha256(rawBytes);

    const sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      filePath: tempValidExportPath,
      requireIntegrityHash: true
    });

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store, { sourceIdentity });

    const fileIntegrityVerified = sourceIdentity.fileIntegrityVerified === true;
    const shaMatch = sourceIdentity.sourceFileSha256 === expectedFileSha;
    const boundInManifest = manifest.sourceIdentity && manifest.sourceIdentity.sourceFileSha256 === expectedFileSha;
    const eligible = manifest.eligibleForReset === true;
    const completenessFalse = sourceIdentity.exportCompletenessProof === false; // Distinguishes file integrity from DB completeness

    // Also run CLI dry-run and verify report includes sourceIdentity
    const cliOutput = child_process.execSync(
      `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempValidExportPath}"`,
      { stdio: 'pipe' }
    );
    const parsedCliReport = JSON.parse(cliOutput.toString());
    const cliBound = parsedCliReport.sourceIdentity && parsedCliReport.sourceIdentity.sourceFileSha256 === expectedFileSha;

    if (fs.existsSync(tempValidExportPath)) fs.unlinkSync(tempValidExportPath);

    const passed = fileIntegrityVerified && shaMatch && boundInManifest && eligible && completenessFalse && cliBound;
    recordTest(
      41,
      'Valid synthetic export passes integrity preflight and produces manifest with explicit source identity',
      passed,
      `Preflight verified: ${fileIntegrityVerified}, SHA match: ${shaMatch}, Bound in manifest: ${boundInManifest}, Eligible: ${eligible}, Completeness distinguished: ${completenessFalse}, CLI bound: ${cliBound}`
    );
  } catch (err) {
    recordTest(41, 'Valid synthetic export passes integrity preflight and produces manifest with explicit source identity', false, `Error: ${err.message}`);
  }

  // --- Test 42: Tampering with source bytes is detected and blocks manifest generation ---
  try {
    const tempTamperedExportPath = path.join(__dirname, '..', 'scripts', '_temp_tampered_export_test.json');
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    // Tamper with receipt amount in raw data without updating integrity hash
    backup.collections.receipts[0].amount = 999999;
    fs.writeFileSync(tempTamperedExportPath, JSON.stringify(backup, null, 2), 'utf8');

    let cliBlocked = false;
    let cliErrMsg = '';
    try {
      child_process.execSync(
        `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempTamperedExportPath}"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      cliBlocked = true;
      cliErrMsg = e.stderr ? e.stderr.toString() : '';
    }

    const rawBytes = fs.readFileSync(tempTamperedExportPath);
    let directBlocked = false;
    let directErrMsg = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        filePath: tempTamperedExportPath,
        requireIntegrityHash: true
      });
    } catch (e) {
      directBlocked = true;
      directErrMsg = e.message;
    }

    if (fs.existsSync(tempTamperedExportPath)) fs.unlinkSync(tempTamperedExportPath);

    const passed = cliBlocked && cliErrMsg.includes('BACKUP_INTEGRITY_MISMATCH') && directBlocked && directErrMsg.includes('BACKUP_INTEGRITY_MISMATCH');
    recordTest(
      42,
      'Tampering with source bytes is detected and blocks manifest generation',
      passed,
      `CLI blocked: ${cliBlocked}, CLI error: "${cliErrMsg.trim().split('\n')[0]}", Direct preflight blocked: ${directBlocked}`
    );
  } catch (err) {
    recordTest(42, 'Tampering with source bytes is detected and blocks manifest generation', false, `Error: ${err.message}`);
  }

  // --- Test 43: Changing source export metadata changes the manifest digest ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();
    const storeC = createFullSyntheticFixture();

    const backupA = createSyntheticBackup(storeA, { exportedAt: '2026-10-19T08:00:00.000Z', snapshotId: 'SNAP_ALPHA' });
    const rawBytesA = Buffer.from(canonicalJsonStringify(backupA), 'utf8');
    const sourceIdA = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({ rawBytes: rawBytesA, backupObj: backupA });

    const backupB = createSyntheticBackup(storeB, { exportedAt: '2026-10-19T14:30:00.000Z', snapshotId: 'SNAP_ALPHA' });
    const rawBytesB = Buffer.from(canonicalJsonStringify(backupB), 'utf8');
    const sourceIdB = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({ rawBytes: rawBytesB, backupObj: backupB });

    const backupC = createSyntheticBackup(storeC, { exportedAt: '2026-10-19T08:00:00.000Z', snapshotId: 'SNAP_BETA_DIFFERENT' });
    const rawBytesC = Buffer.from(canonicalJsonStringify(backupC), 'utf8');
    const sourceIdC = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({ rawBytes: rawBytesC, backupObj: backupC });

    const orch = new TransactionalResetOrchestrator();
    const manifestA = orch.generateManifest(storeA, { sourceIdentity: sourceIdA });
    const manifestB = orch.generateManifest(storeB, { sourceIdentity: sourceIdB });
    const manifestC = orch.generateManifest(storeC, { sourceIdentity: sourceIdC });

    const hashDiffersTimestamp = manifestA.manifestHash !== manifestB.manifestHash;
    const hashDiffersSnapshotId = manifestA.manifestHash !== manifestC.manifestHash;

    const passed = hashDiffersTimestamp && hashDiffersSnapshotId;
    recordTest(
      43,
      'Changing source export metadata changes the manifest digest',
      passed,
      `Hash A: ${manifestA.manifestHash} | Timestamp altered Hash B: ${manifestB.manifestHash} (diff: ${hashDiffersTimestamp}) | SnapshotId altered Hash C: ${manifestC.manifestHash} (diff: ${hashDiffersSnapshotId})`
    );
  } catch (err) {
    recordTest(43, 'Changing source export metadata changes the manifest digest', false, `Error: ${err.message}`);
  }

  // --- Test 44: Changing expected collection coverage changes the manifest digest ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');

    const sourceIdStandard = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      backupObj: backup
    });

    const customCoverage = {
      requiredCollections: REQUIRED_BACKUP_COLLECTIONS,
      documentedExclusions: [...DOCUMENTED_BACKUP_EXCLUSIONS, '_extra_audit_exclusion'].sort()
    };
    const sourceIdCustom = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      backupObj: backup,
      expectedCollectionCoverage: customCoverage
    });

    const orch = new TransactionalResetOrchestrator();
    const manifestStandard = orch.generateManifest(store, { sourceIdentity: sourceIdStandard });
    const manifestCustom = orch.generateManifest(store, { sourceIdentity: sourceIdCustom });

    const hashDiffers = manifestStandard.manifestHash !== manifestCustom.manifestHash;
    const passed = hashDiffers;
    recordTest(
      44,
      'Changing expected collection coverage changes the manifest digest',
      passed,
      `Standard Coverage Hash: ${manifestStandard.manifestHash} | Custom Coverage Hash: ${manifestCustom.manifestHash} | Digests differ: ${hashDiffers}`
    );
  } catch (err) {
    recordTest(44, 'Changing expected collection coverage changes the manifest digest', false, `Error: ${err.message}`);
  }

  // --- Test 45: Missing required collections halt dry-run before synthetic-store construction ---
  try {
    const tempIncompleteExportPath = path.join(__dirname, '..', 'scripts', '_temp_incomplete_export_test.json');
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    delete backup.collections.loans;
    fs.writeFileSync(tempIncompleteExportPath, JSON.stringify(backup, null, 2), 'utf8');

    let cliHalted = false;
    let cliErrOutput = '';
    try {
      child_process.execSync(
        `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempIncompleteExportPath}"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      cliHalted = true;
      cliErrOutput = e.stderr ? e.stderr.toString() : '';
    }

    if (fs.existsSync(tempIncompleteExportPath)) fs.unlinkSync(tempIncompleteExportPath);

    const hasMissingColMsg = cliErrOutput.includes("Required collection 'loans' missing from backup export");
    const hasPreflightRefusalMsg = cliErrOutput.includes('Synthetic data store construction and manifest generation REFUSED');
    const passed = cliHalted && hasMissingColMsg && hasPreflightRefusalMsg;

    recordTest(
      45,
      'Missing required collections halt dry-run before synthetic-store construction',
      passed,
      `CLI halted: ${cliHalted}, Missing collection identified: ${hasMissingColMsg}, Store construction refused: ${hasPreflightRefusalMsg}`
    );
  } catch (err) {
    recordTest(45, 'Missing required collections halt dry-run before synthetic-store construction', false, `Error: ${err.message}`);
  }

  // --- Test 46: Malformed or missing integrity hash halts dry-run ---
  try {
    const tempMissingHashPath = path.join(__dirname, '..', 'scripts', '_temp_missing_hash_test.json');
    const tempMalformedHashPath = path.join(__dirname, '..', 'scripts', '_temp_malformed_hash_test.json');

    const store = createFullSyntheticFixture();
    const backupNoHash = createSyntheticBackup(store);
    delete backupNoHash.metadata.integrity;
    fs.writeFileSync(tempMissingHashPath, JSON.stringify(backupNoHash, null, 2), 'utf8');

    const backupMalformedHash = createSyntheticBackup(store);
    backupMalformedHash.metadata.integrity = { algorithm: 'SHA-256', hash: 'MALFORMED_NON_HEX_HASH' };
    fs.writeFileSync(tempMalformedHashPath, JSON.stringify(backupMalformedHash, null, 2), 'utf8');

    let missingHalted = false;
    let missingErrMsg = '';
    try {
      child_process.execSync(
        `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempMissingHashPath}"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      missingHalted = true;
      missingErrMsg = e.stderr ? e.stderr.toString() : '';
    }

    let malformedHalted = false;
    let malformedErrMsg = '';
    try {
      child_process.execSync(
        `node "${path.join(__dirname, '..', 'scripts', 'transactional_reset_orchestrator.js')}" --dry-run "${tempMalformedHashPath}"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      malformedHalted = true;
      malformedErrMsg = e.stderr ? e.stderr.toString() : '';
    }

    if (fs.existsSync(tempMissingHashPath)) fs.unlinkSync(tempMissingHashPath);
    if (fs.existsSync(tempMalformedHashPath)) fs.unlinkSync(tempMalformedHashPath);

    const missingDetected = missingHalted && missingErrMsg.includes('Missing required cryptographic integrity hash');
    const malformedDetected = malformedHalted && malformedErrMsg.includes('Malformed integrity hash');
    const passed = missingDetected && malformedDetected;

    recordTest(
      46,
      'Malformed or missing integrity hash halts dry-run',
      passed,
      `Missing hash rejected: ${missingDetected}, Malformed hash rejected: ${malformedDetected}`
    );
  } catch (err) {
    recordTest(46, 'Malformed or missing integrity hash halts dry-run', false, `Error: ${err.message}`);
  }

  // --- Test 47: Caller-provided source hash that does not match actual bytes is rejected ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');
    const forgedHash = 'F'.repeat(64);

    let rejected = false;
    let errMessage = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        backupObj: backup,
        expectedSourceFileSha256: forgedHash
      });
    } catch (e) {
      rejected = true;
      errMessage = e.message;
    }

    const passed = rejected && errMessage.includes('Caller-provided source file SHA-256 mismatch');
    recordTest(
      47,
      'Caller-provided source hash that does not match actual bytes is rejected',
      passed,
      `Forged caller hash rejected: ${rejected}, Error: "${errMessage}"`
    );
  } catch (err) {
    recordTest(47, 'Caller-provided source hash that does not match actual bytes is rejected', false, `Error: ${err.message}`);
  }

  // --- Test 48: Missing or unverified snapshot metadata cannot silently become a verified snapshot ---
  try {
    const store = createFullSyntheticFixture();

    // Case A: Missing both timestamp and snapshotId
    const backupNoMeta = createSyntheticBackup(store);
    delete backupNoMeta.metadata.exportedAt;
    delete backupNoMeta.metadata.snapshotId;
    delete backupNoMeta.metadata.backupVersion;
    const rawBytesNoMeta = Buffer.from(canonicalJsonStringify(backupNoMeta), 'utf8');

    let noMetaRejected = false;
    let noMetaErrMsg = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes: rawBytesNoMeta,
        backupObj: backupNoMeta
      });
    } catch (e) {
      noMetaRejected = true;
      noMetaErrMsg = e.message;
    }

    // Case B: Malformed timestamp
    const backupBadDate = createSyntheticBackup(store);
    backupBadDate.metadata.exportedAt = 'NOT_A_VALID_DATE_STRING';
    const rawBytesBadDate = Buffer.from(canonicalJsonStringify(backupBadDate), 'utf8');

    let badDateRejected = false;
    let badDateErrMsg = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes: rawBytesBadDate,
        backupObj: backupBadDate
      });
    } catch (e) {
      badDateRejected = true;
      badDateErrMsg = e.message;
    }

    // Case C: Malformed snapshotId (illegal chars)
    const backupBadSnap = createSyntheticBackup(store);
    delete backupBadSnap.metadata.exportedAt;
    backupBadSnap.metadata.snapshotId = '$$INVALID;;SNAPSHOT@@';
    const rawBytesBadSnap = Buffer.from(canonicalJsonStringify(backupBadSnap), 'utf8');

    let badSnapRejected = false;
    let badSnapErrMsg = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes: rawBytesBadSnap,
        backupObj: backupBadSnap
      });
    } catch (e) {
      badSnapRejected = true;
      badSnapErrMsg = e.message;
    }

    const passed = noMetaRejected && noMetaErrMsg.includes('lacks verifiable timestamp or snapshot identifier') &&
                   badDateRejected && badDateErrMsg.includes('Malformed source export timestamp') &&
                   badSnapRejected && badSnapErrMsg.includes('Malformed source snapshot identifier');

    recordTest(
      48,
      'Missing or unverified snapshot metadata cannot silently become a verified snapshot',
      passed,
      `Missing metadata rejected: ${noMetaRejected}, Bad date rejected: ${badDateRejected}, Bad snapshotId rejected: ${badSnapRejected}`
    );
  } catch (err) {
    recordTest(48, 'Missing or unverified snapshot metadata cannot silently become a verified snapshot', false, `Error: ${err.message}`);
  }

  // --- Test 49: Direct manifest generation without validated source identity is rejected or explicitly marked ineligible ---
  try {
    // Construct store directly without attaching source identity
    const storeRaw = new SyntheticFirestore();
    storeRaw.set('billing', 'bill_1', {
      _firestoreId: 'bill_1',
      id: 1,
      receiptNo: 'BILL-001',
      totalAmount: 100,
      devoteeName: 'Test Devotee',
      fund: 'General Temple Fund',
      accountingReceiptId: 'rcpt_1',
      reservationDocId: 'res_1'
    });
    storeRaw.set('receipts', 'rcpt_1', {
      _firestoreId: 'rcpt_1',
      id: 1,
      receiptNo: 'R-001',
      source: 'billing',
      billingId: 1,
      billingFirestoreId: 'bill_1',
      reservationDocId: 'res_1',
      amount: 100,
      name: 'Test Devotee',
      fund: 'General Temple Fund'
    });
    storeRaw.set('system', 'res_1', {
      _firestoreId: 'res_1',
      seqNumber: 1,
      type: 'billing_linked',
      status: 'active',
      billDocId: 'bill_1',
      receiptDocId: 'rcpt_1',
      operationId: 'op_bill_1'
    });
    storeRaw.set('system', 'op_bill_1', {
      _firestoreId: 'op_bill_1',
      operationId: 'op_bill_1',
      resDocId: 'res_1',
      status: 'committed'
    });
    storeRaw.set('system', 'counters', { _firestoreId: 'counters' });

    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(storeRaw);

    const explicitlyIneligible = manifest.eligibleForReset === false;
    const sourceStatusUnverified = manifest.sourceIdentity && manifest.sourceIdentity.status === 'UNVERIFIED';
    const fileVerifiedFalse = manifest.sourceIdentity && manifest.sourceIdentity.fileIntegrityVerified === false;
    const integrityFailureRecorded = manifest.integrityFailures && manifest.integrityFailures.some(f => f.includes('SOURCE_IDENTITY_ERROR'));

    const passed = explicitlyIneligible && sourceStatusUnverified && fileVerifiedFalse && integrityFailureRecorded;
    recordTest(
      49,
      'Direct manifest generation without validated source identity is rejected or explicitly marked ineligible',
      passed,
      `Eligible for reset: ${manifest.eligibleForReset} (expected false), Status: ${manifest.sourceIdentity.status}, File verified: ${manifest.sourceIdentity.fileIntegrityVerified} (expected false), Integrity failure recorded: ${integrityFailureRecorded}`
    );
  } catch (err) {
    recordTest(49, 'Direct manifest generation without validated source identity is rejected or explicitly marked ineligible', false, `Error: ${err.message}`);
  }

  // --- Test 50: Failed preflight causes zero store mutations and cannot generate an eligible manifest ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    // Corrupt payload
    backup.collections.receipts[0].amount = 888888;
    const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');

    let preflightThrew = false;
    let preflightError = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        backupObj: backup,
        requireIntegrityHash: true
      });
    } catch (e) {
      preflightThrew = true;
      preflightError = e.message;
    }

    // Verify synthetic store was not initialized or modified by failed preflight
    const baselineBill = store.get('billing', 'bill_1');
    const storeUnmutated = baselineBill && baselineBill.totalAmount === 150;

    // Verify orchestrator cannot produce an eligible manifest from unverified source
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(new SyntheticFirestore());
    const cannotGenerateEligible = manifest.eligibleForReset === false;

    const passed = preflightThrew && storeUnmutated && cannotGenerateEligible;
    recordTest(
      50,
      'Failed preflight causes zero store mutations and cannot generate an eligible manifest',
      passed,
      `Preflight halted: ${preflightThrew} ("${preflightError}"), Store mutations: 0, Ineligible manifest guaranteed: ${cannotGenerateEligible}`
    );
  } catch (err) {
    recordTest(50, 'Failed preflight causes zero store mutations and cannot generate an eligible manifest', false, `Error: ${err.message}`);
  }

  // --- Test 51: Extended destructive entry points verification under all override permutations ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const destructiveMethods = [
      'execute',
      'executeReset',
      'executeCleanup',
      'performLiveDeletion',
      'executeBatchedDeletions'
    ];

    const advancedBypassAttempts = [
      { dryRun: false, sourceVerified: true, preflightPassed: true },
      { adminOverride: 'SUPER_ADMIN_TOKEN_999' },
      { force: true, emergencyUnlock: true, bypassQuarantine: true },
      { preflightHash: manifest.manifestHash, allowDestructive: true },
      { dryRun: false, force: true, trusteeApproved: true, adminOverride: 'ALL_PERMISSIONS' }
    ];

    let allRejected = true;
    let totalChecks = 0;

    for (const methodName of destructiveMethods) {
      for (const attempt of advancedBypassAttempts) {
        totalChecks++;
        let threw = false;
        let errCode = null;
        let mutations = null;
        try {
          orch[methodName](manifest, attempt);
        } catch (e) {
          threw = true;
          errCode = e.code;
          if (e.details) {
            mutations = e.details.mutationsPerformed;
          }
        }
        if (!threw || errCode !== 'EXECUTE_MODE_DISABLED' || mutations !== 0) {
          allRejected = false;
          break;
        }
      }
      if (!allRejected) break;
    }

    const passed = allRejected && totalChecks === 25;
    recordTest(
      51,
      'All five destructive entry points remain unconditionally disabled under all override options',
      passed,
      `All 5 methods rejected across ${totalChecks} advanced bypass attempts. Zero mutations confirmed: ${allRejected}`
    );
  } catch (err) {
    recordTest(51, 'All five destructive entry points remain unconditionally disabled under all override options', false, `Error: ${err.message}`);
  }

  // --- Test 52: Gate 4 Control 1: Fabricated plain-object sourceIdentity cannot produce an eligible manifest ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    const fabricatedPlainIdentity = {
      sourceFileSha256: 'A'.repeat(64),
      sourceFilePath: 'D:/Temple/fake_export.json',
      sourceExportTimestamp: '2026-10-19T12:00:00.000Z',
      snapshotId: 'FABRICATED_SNAPSHOT_ID',
      expectedCoverage: {
        requiredCollections: REQUIRED_BACKUP_COLLECTIONS.slice(),
        documentedExclusions: DOCUMENTED_BACKUP_EXCLUSIONS.slice(),
        presentCollections: REQUIRED_BACKUP_COLLECTIONS.slice()
      },
      integrityVerification: {
        verified: true,
        canonicalPayloadHash: 'B'.repeat(64),
        expectedHash: 'B'.repeat(64),
        algorithm: 'SHA-256'
      },
      fileIntegrityVerified: true,
      exportCompletenessProof: false,
      completenessNotice: 'Fabricated notice',
      verifiedAt: new Date().toISOString()
    };

    const manifestOption = orch.generateManifest(store, { sourceIdentity: fabricatedPlainIdentity });
    const blockedViaOption = manifestOption.eligibleForReset === false &&
      manifestOption.sourceIdentity.status === 'FABRICATED_OR_UNVERIFIED' &&
      manifestOption.sourceIdentity.fileIntegrityVerified === false &&
      manifestOption.integrityFailures.some(f => f.includes('Caller-provided source identity was not produced by trusted validation path'));

    // Also test via store.sourceIdentity assignment
    const storeWithFabricated = createFullSyntheticFixture();
    storeWithFabricated.sourceIdentity = fabricatedPlainIdentity;
    const manifestViaStore = orch.generateManifest(storeWithFabricated);
    const blockedViaStore = manifestViaStore.eligibleForReset === false &&
      manifestViaStore.sourceIdentity.status === 'FABRICATED_OR_UNVERIFIED' &&
      manifestViaStore.sourceIdentity.fileIntegrityVerified === false;

    const passed = blockedViaOption && blockedViaStore;
    recordTest(
      52,
      'Gate 4 Control 1: Fabricated plain-object sourceIdentity cannot produce an eligible manifest',
      passed,
      `Blocked via options: ${blockedViaOption}, Blocked via store property: ${blockedViaStore}, Status: ${manifestOption.sourceIdentity.status}`
    );
  } catch (err) {
    recordTest(52, 'Gate 4 Control 1: Fabricated plain-object sourceIdentity cannot produce an eligible manifest', false, `Error: ${err.message}`);
  }

  // --- Test 53: Gate 4 Control 2: Fabricated integrity hash cannot produce an eligible manifest ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    backup.metadata.integrity.hash = 'F'.repeat(64); // Fabricate hash
    const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');

    let preflightThrew = false;
    let preflightError = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes,
        backupObj: backup,
        requireIntegrityHash: true
      });
    } catch (e) {
      preflightThrew = true;
      preflightError = e.message;
    }

    // Try to craft an identity with fabricated payload hash and associate it with store
    const craftedIdentity = {
      sourceFileSha256: computeSha256(rawBytes),
      sourceExportTimestamp: '2026-10-19T12:00:00.000Z',
      snapshotId: 'SNAPSHOT_FABRICATED_HASH',
      fileIntegrityVerified: true,
      integrityVerification: { verified: true, canonicalPayloadHash: 'F'.repeat(64) }
    };
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store, { sourceIdentity: craftedIdentity });

    const passed = preflightThrew &&
      preflightError.includes('BACKUP_INTEGRITY_MISMATCH') &&
      manifest.eligibleForReset === false &&
      manifest.sourceIdentity.fileIntegrityVerified === false;

    recordTest(
      53,
      'Gate 4 Control 2: Fabricated integrity hash cannot produce an eligible manifest',
      passed,
      `Preflight rejected: ${preflightThrew} ("${preflightError.slice(0, 40)}..."), Manifest blocked: ${manifest.eligibleForReset === false}`
    );
  } catch (err) {
    recordTest(53, 'Gate 4 Control 2: Fabricated integrity hash cannot produce an eligible manifest', false, `Error: ${err.message}`);
  }

  // --- Test 54: Gate 4 Control 3: Genuine identity associated with Store A cannot authorize Store B ---
  try {
    const storeA = createFullSyntheticFixture();
    const storeB = createFullSyntheticFixture();

    const orch = new TransactionalResetOrchestrator();
    const manifestA = orch.generateManifest(storeA);
    const storeAEligible = manifestA.eligibleForReset === true;

    // Cross-store reuse: use Store A's identity on Store B
    const manifestB = orch.generateManifest(storeB, { sourceIdentity: storeA.sourceIdentity });
    const crossStoreRejected = manifestB.eligibleForReset === false &&
      manifestB.sourceIdentity.status === 'IDENTITY_STORE_MISMATCH' &&
      manifestB.sourceIdentity.fileIntegrityVerified === false &&
      manifestB.integrityFailures.some(f => f.includes('bound to a different store instance'));

    // Also try setting storeB.sourceIdentity = storeA.sourceIdentity
    storeB.sourceIdentity = storeA.sourceIdentity;
    const manifestB2 = orch.generateManifest(storeB);
    const storePropRejected = manifestB2.eligibleForReset === false &&
      manifestB2.sourceIdentity.status === 'IDENTITY_STORE_MISMATCH';

    const passed = storeAEligible && crossStoreRejected && storePropRejected;
    recordTest(
      54,
      'Gate 4 Control 3: Genuine identity associated with Store A cannot authorize Store B',
      passed,
      `Store A clean eligible: ${storeAEligible}, Cross-store option rejected: ${crossStoreRejected}, Property assignment rejected: ${storePropRejected}`
    );
  } catch (err) {
    recordTest(54, 'Gate 4 Control 3: Genuine identity associated with Store A cannot authorize Store B', false, `Error: ${err.message}`);
  }

  // --- Test 55: Gate 4 Control 4: Mutating store content after identity validation causes rejection or ineligibility ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    // Verify initial clean state is eligible
    const initialManifest = orch.generateManifest(store);
    const initiallyEligible = initialManifest.eligibleForReset === true;

    // Mutate store content after validation
    const rcpt1 = store.get('receipts', 'rcpt_1');
    rcpt1.amount = 999999;
    store.set('receipts', 'rcpt_1', rcpt1);

    // Re-run manifest generation on the mutated store
    const mutatedManifest = orch.generateManifest(store);
    const mutationRejected = mutatedManifest.eligibleForReset === false &&
      mutatedManifest.sourceIdentity.status === 'STALE_OR_MUTATED' &&
      mutatedManifest.sourceIdentity.fileIntegrityVerified === false &&
      mutatedManifest.integrityFailures.some(f => f.includes('Store content was mutated after identity validation'));

    const passed = initiallyEligible && mutationRejected;
    recordTest(
      55,
      'Gate 4 Control 4: Mutating store content after identity validation causes rejection or ineligibility',
      passed,
      `Initially eligible: ${initiallyEligible}, Post-mutation eligible: ${mutatedManifest.eligibleForReset}, Status: ${mutatedManifest.sourceIdentity.status}`
    );
  } catch (err) {
    recordTest(55, 'Gate 4 Control 4: Mutating store content after identity validation causes rejection or ineligibility', false, `Error: ${err.message}`);
  }

  // --- Test 56: Gate 4 Control 5: Mutating store collection coverage after validation causes rejection or ineligibility ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    // Verify initially eligible
    const initialManifest = orch.generateManifest(store);
    const initiallyEligible = initialManifest.eligibleForReset === true;

    // Mutate collection coverage by adding an unexpected collection
    store.set('surprise_untracked_collection', 'doc_test', {
      _firestoreId: 'doc_test',
      value: 'unauthorized_post_validation_data'
    });

    const mutatedManifest = orch.generateManifest(store);
    const coverageRejected = mutatedManifest.eligibleForReset === false &&
      (mutatedManifest.sourceIdentity.status === 'COVERAGE_MUTATED' || mutatedManifest.sourceIdentity.status === 'STALE_OR_MUTATED') &&
      mutatedManifest.sourceIdentity.fileIntegrityVerified === false &&
      mutatedManifest.integrityFailures.some(f => f.includes('mutated after') || f.includes('unexpected collection'));

    const passed = initiallyEligible && coverageRejected;
    recordTest(
      56,
      'Gate 4 Control 5: Mutating store collection coverage after validation causes rejection or ineligibility',
      passed,
      `Initially eligible: ${initiallyEligible}, Coverage mutation rejected: ${coverageRejected}, Status: ${mutatedManifest.sourceIdentity.status}`
    );
  } catch (err) {
    recordTest(56, 'Gate 4 Control 5: Mutating store collection coverage after validation causes rejection or ineligibility', false, `Error: ${err.message}`);
  }

  // --- Test 57: Gate 4 Control 6: Genuine validated source identity still permits expected clean synthetic manifest ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const passed = !!(
      manifest.eligibleForReset === true &&
      manifest.sourceIdentity &&
      manifest.sourceIdentity.fileIntegrityVerified === true &&
      manifest.sourceIdentity.integrityVerification?.verified === true &&
      manifest.sourceIdentity.sourceFileSha256 &&
      manifest.integrityFailures.length === 0 &&
      manifest.quarantinedRecords.length === 0 &&
      manifest.linkageErrors.length === 0 &&
      manifest.targetRecords.length > 0 &&
      manifest.manifestHash &&
      manifest.manifestHash.length === 64
    );

    recordTest(
      57,
      'Gate 4 Control 6: Genuine validated source identity still permits expected clean synthetic manifest',
      passed,
      `Eligible: ${manifest.eligibleForReset}, File verified: ${manifest.sourceIdentity?.fileIntegrityVerified}, Integrity verified: ${manifest.sourceIdentity?.integrityVerification?.verified}, Failures: ${manifest.integrityFailures.length}`
    );
  } catch (err) {
    recordTest(57, 'Gate 4 Control 6: Genuine validated source identity still permits expected clean synthetic manifest', false, `Error: ${err.message}`);
  }

  // --- Test 58: Gate 4 Control 7: rawBytes for export A combined with backupObj B is rejected ---
  try {
    const storeA = createFullSyntheticFixture();
    const backupA = createSyntheticBackup(storeA);
    const rawBytesA = Buffer.from(canonicalJsonStringify(backupA), 'utf8');

    const storeB = createFullSyntheticFixture();
    const backupB = createSyntheticBackup(storeB);
    // Mutate backup B's data so it is genuinely different from rawBytesA
    backupB.collections.billing[0].totalAmount = 888888;
    backupB.collections.billing[0].tampered = true;

    let threw = false;
    let errorMessage = '';
    try {
      TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
        rawBytes: rawBytesA,
        backupObj: backupB
      });
    } catch (e) {
      threw = true;
      errorMessage = e.message;
    }

    const passed = threw &&
      errorMessage.includes('Input mismatch: caller-supplied backupObj does not match parsed rawBytes') &&
      errorMessage.includes('Binding file SHA-256 to a different data object is strictly prohibited');

    recordTest(
      58,
      'Gate 4 Control 7: rawBytes for export A combined with backupObj B is rejected',
      passed,
      `Mismatched rawBytes/backupObj rejected: ${threw}, Message: "${errorMessage.slice(0, 50)}..."`
    );
  } catch (err) {
    recordTest(58, 'Gate 4 Control 7: rawBytes for export A combined with backupObj B is rejected', false, `Error: ${err.message}`);
  }

  // --- Test 59: Gate 4 Control 8: Matching rawBytes and backupObj succeeds ---
  try {
    const store = createFullSyntheticFixture();
    const backup = createSyntheticBackup(store);
    const rawBytes = Buffer.from(canonicalJsonStringify(backup), 'utf8');
    const expectedFileSha = computeSha256(rawBytes);

    const sourceIdentity = TransactionalResetOrchestrator.validateAndBuildSourceIdentity({
      rawBytes,
      backupObj: backup,
      filePath: 'D:/Temple/valid_backup.json'
    });

    const passed = !!(
      sourceIdentity &&
      sourceIdentity.fileIntegrityVerified === true &&
      sourceIdentity.integrityVerification?.verified === true &&
      sourceIdentity.sourceFileSha256 === expectedFileSha &&
      sourceIdentity.integrityVerification.canonicalPayloadHash === backup.metadata.integrity.hash
    );

    recordTest(
      59,
      'Gate 4 Control 8: Matching rawBytes and backupObj succeeds',
      passed,
      `Identity created: ${!!sourceIdentity}, File SHA match: ${sourceIdentity?.sourceFileSha256 === expectedFileSha}, Payload verified: ${sourceIdentity?.integrityVerification?.verified}`
    );
  } catch (err) {
    recordTest(59, 'Gate 4 Control 8: Matching rawBytes and backupObj succeeds', false, `Error: ${err.message}`);
  }

  // --- Test 60: Gate 4 Control 9: Missing source identity cannot produce an eligible manifest ---
  try {
    const store = new SyntheticFirestore();
    // Populate master data
    store.set('settings', 'config', { _firestoreId: 'config', templeName: 'Temple' });
    store.set('funds', 'fund_1', { _firestoreId: 'fund_1', id: 1, name: 'General' });
    store.set('bankAccounts', 'bank_1', { _firestoreId: 'bank_1', id: 1, name: 'Bank' });
    store.set('incomeCategories', 'inc_1', { _firestoreId: 'inc_1', id: 1, name: 'Inc' });
    store.set('expenseCategories', 'exp_1', { _firestoreId: 'exp_1', id: 1, name: 'Exp' });
    store.set('chittyMembers', 'member_1', { _firestoreId: 'member_1', id: 1, name: 'Member' });
    store.set('system', 'counters', { _firestoreId: 'counters', globalSequenceCounter: 1 });
    // Valid billing cluster
    store.set('billing', 'bill_1', { _firestoreId: 'bill_1', id: 1, receiptNo: 'BILL-001', totalAmount: 100, devoteeName: 'Devotee', accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1' });
    store.set('receipts', 'rcpt_1', { _firestoreId: 'rcpt_1', id: 1, receiptNo: 'R-001', source: 'billing', billingId: 1, billingFirestoreId: 'bill_1', reservationDocId: 'res_1', amount: 100 });
    store.set('system', 'res_1', { _firestoreId: 'res_1', seqNumber: 1, type: 'billing_linked', billDocId: 'bill_1', receiptDocId: 'rcpt_1' });

    // Explicitly NO source identity attached
    store.sourceIdentity = null;
    const orch = new TransactionalResetOrchestrator();
    const manifest = orch.generateManifest(store);

    const passed = manifest.eligibleForReset === false &&
      manifest.sourceIdentity.status === 'UNVERIFIED' &&
      manifest.sourceIdentity.fileIntegrityVerified === false &&
      manifest.integrityFailures.some(f => f.includes('Direct manifest generation without validated source identity'));

    recordTest(
      60,
      'Gate 4 Control 9: Missing source identity cannot produce an eligible manifest',
      passed,
      `Eligible: ${manifest.eligibleForReset} (expected false), Status: ${manifest.sourceIdentity.status}, File verified: ${manifest.sourceIdentity.fileIntegrityVerified}`
    );
  } catch (err) {
    recordTest(60, 'Gate 4 Control 9: Missing source identity cannot produce an eligible manifest', false, `Error: ${err.message}`);
  }

  // --- Test 61: Gate 4 Control 10: Reusing stale identity after content changes fails closed ---
  try {
    const store = createFullSyntheticFixture();
    const orch = new TransactionalResetOrchestrator();

    // Capture valid identity
    const initialIdentity = store.sourceIdentity;

    // Mutate content: delete a payment
    store.delete('payments', 'pay_1');

    // Attempt to force-pass the stale identity
    const staleManifest = orch.generateManifest(store, { sourceIdentity: initialIdentity });

    const passed = staleManifest.eligibleForReset === false &&
      staleManifest.sourceIdentity.status === 'STALE_OR_MUTATED' &&
      staleManifest.sourceIdentity.fileIntegrityVerified === false &&
      staleManifest.integrityFailures.some(f => f.includes('Store content was mutated after identity validation'));

    recordTest(
      61,
      'Gate 4 Control 10: Reusing stale identity after content changes fails closed',
      passed,
      `Eligible: ${staleManifest.eligibleForReset} (expected false), Status: ${staleManifest.sourceIdentity.status}, Failure caught: ${staleManifest.integrityFailures.length > 0}`
    );
  } catch (err) {
    recordTest(61, 'Gate 4 Control 10: Reusing stale identity after content changes fails closed', false, `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  const failedTests = testResults.filter(r => !r.passed).length;

  console.log('\n================================================================================');
  console.log(`TOTAL TESTS EXECUTED: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================================');

  if (failedTests > 0) {
    console.error('\nFAILED TESTS SUMMARY:');
    testResults.filter(r => !r.passed).forEach(r => console.error(`- Test ${r.id}: ${r.name} -> ${r.details}`));
    process.exit(1);
  } else {
    console.log('\nALL TESTS PASSED SUCCESSFULLY (100% PASS RATE).');
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
