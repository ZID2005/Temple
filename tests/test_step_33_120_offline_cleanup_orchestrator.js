/**
 * STEP 33.120: Offline Cleanup Orchestrator Defect Correction & Safety Validation Test Suite
 *
 * Strictly offline, isolated test suite verifying corrections for:
 * - Defect D-1: Narrowly scoped system collection path policy (billing reservations/ops allowed under reciprocal validation)
 * - Defect D-2: Receipt linkage schema alignment (source === 'billing', billingFirestoreId, billingId, reservationDocId)
 * - Defect D-3: Protected collection whitelist hardening (payments, transfers, loans, chitty collections rejected)
 * - Permanent execution lock enforcement (EXECUTE_MODE_DISABLED, security violation detection)
 *
 * 100% AIR-GAPPED & OFFLINE:
 * - Zero network connections (HTTP/HTTPS/Sockets intercepted & verified 0 calls).
 * - Zero Firebase or Firestore interactions.
 * - Zero production reads or mutations.
 * - Pure synthetic test fixtures only.
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
// Network & Process Eavesdropping Guard (Verifies Test Requirement 16)
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
// Synthetic Offline Fixtures (Labeled strictly as synthetic test data)
// ---------------------------------------------------------------------------
const SYNTHETIC_TEST_FIXTURE = {
  collections: {
    billing: [
      {
        id: 'bill_syn_1001',
        firestoreId: 'bill_syn_1001',
        billNumber: 'BILL-0001',
        accountingReceiptId: 'rcpt_syn_1001',
        reservationDocId: 'res_syn_1001',
        operationId: 'op_syn_uuid_1001',
        amount: 250,
        devoteeName: 'Synthetic Test Devotee 1',
        date: '2026-10-19'
      },
      {
        id: 'bill_syn_1002',
        firestoreId: 'bill_syn_1002',
        billNumber: 'BILL-0002',
        accountingReceiptId: 'rcpt_syn_1002',
        reservationDocId: 'res_syn_1002',
        operationId: 'op_syn_uuid_1002',
        amount: 500,
        devoteeName: 'Synthetic Test Devotee 2',
        date: '2026-10-19'
      }
    ],
    receipts: [
      {
        id: 'rcpt_syn_1001',
        firestoreId: 'rcpt_syn_1001',
        source: 'billing',
        billingId: 1001,
        billingFirestoreId: 'bill_syn_1001',
        billingReceiptNo: 'BILL-0001',
        reservationDocId: 'res_syn_1001',
        amount: 250,
        date: '2026-10-19'
      },
      {
        id: 'rcpt_syn_1002',
        firestoreId: 'rcpt_syn_1002',
        source: 'billing',
        billingId: 1002,
        billingFirestoreId: 'bill_syn_1002',
        billingReceiptNo: 'BILL-0002',
        reservationDocId: 'res_syn_1002',
        amount: 500,
        date: '2026-10-19'
      },
      {
        id: 'rcpt_phys_2001',
        firestoreId: 'rcpt_phys_2001',
        source: 'physical',
        receiptNo: 'PHYS-2001',
        amount: 1000,
        date: '2026-10-19'
      },
      {
        id: 'rcpt_independent_1',
        firestoreId: 'rcpt_independent_1',
        source: 'counter_manual',
        receiptNo: 'RCPT-DIRECT-01',
        amount: 300,
        date: '2026-10-19'
      }
    ],
    system: [
      {
        id: 'counters',
        firestoreId: 'counters',
        globalSequenceCounter: 5000,
        billingReceiptCounter: 2000,
        receiptCounter: 2000,
        voucherCounter: 1000
      },
      {
        id: '_restoreProgress',
        firestoreId: '_restoreProgress',
        inProgress: false,
        lastRestoreDate: '2026-10-19'
      },
      {
        id: 'res_syn_1001',
        firestoreId: 'res_syn_1001',
        billDocId: 'bill_syn_1001',
        receiptDocId: 'rcpt_syn_1001'
      },
      {
        id: 'op_syn_uuid_1001',
        firestoreId: 'op_syn_uuid_1001',
        billDocId: 'bill_syn_1001',
        receiptDocId: 'rcpt_syn_1001',
        resDocId: 'res_syn_1001'
      },
      {
        id: 'res_phys_2001',
        firestoreId: 'res_phys_2001',
        receiptDocId: 'rcpt_phys_2001'
      }
    ],
    payments: [
      {
        id: 'pmt_syn_101',
        firestoreId: 'pmt_syn_101',
        voucherNo: 'V-101',
        amount: 450
      }
    ],
    transfers: [
      {
        id: 'tx_syn_201',
        firestoreId: 'tx_syn_201',
        fromAcc: 'Cash in Hand',
        toAcc: 'Canara Bank',
        amount: 1000
      }
    ],
    loans: [
      {
        id: 'ln_syn_301',
        firestoreId: 'ln_syn_301',
        loanType: 'staff_advance',
        amount: 5000
      }
    ]
  }
};

function runOfflineTestSuite() {
  console.log('========================================================================');
  console.log('   STEP 33.120: OFFLINE CLEANUP ORCHESTRATOR DEFECT CORRECTION & SAFETY SUITE');
  console.log('   100% Air-Gapped Synthetic Verification (Zero Network / Zero DB Access)');
  console.log('========================================================================\n');

  const orchestrator = new CleanupOrchestrator();

  // -------------------------------------------------------------------------
  // TEST 1: Counter paths are always rejected as cleanup targets
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Counter Paths Safeguard ---');
  const counterPaths = [
    { col: 'system', id: 'counters' },
    { col: 'system', id: 'COUNTERS' },
    { col: 'system', id: 'counters/sub' },
    { col: 'billing', id: 'counters' },
    { col: 'settings', id: 'counters' }
  ];
  for (const cp of counterPaths) {
    const prot = checkProtectedPath(cp.col, cp.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `test_counter_${cp.col}_${cp.id.replace(/[^A-Za-z0-9]/g, '_')}`,
      entries: [{
        collection: cp.col,
        docId: cp.id,
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const val = orchestrator.validateManifest(man);
    assert(prot.isProtected && !val.valid && (val.protectedEntries.length > 0 || val.rejectedEntries.length > 0),
      `T1-COUNTER-${cp.col.toUpperCase()}-${cp.id.replace(/[^A-Za-z0-9]/g, '_')}`,
      `Counter target path rejected: ${cp.col}/${cp.id}`,
      `isProtected: ${prot.isProtected}, reason: ${prot.reason}`);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Recovery-control paths are always rejected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Recovery-Control Paths Safeguard ---');
  const recoveryPaths = [
    { col: 'system', id: '_restoreProgress' },
    { col: 'system', id: '_RESTOREPROGRESS' },
    { col: 'system', id: '_backup_20261019' },
    { col: 'system', id: '_recovery_state' }
  ];
  for (const rp of recoveryPaths) {
    const prot = checkProtectedPath(rp.col, rp.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_recovery',
      entries: [{
        collection: rp.col,
        docId: rp.id,
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const val = orchestrator.validateManifest(man);
    assert(prot.isProtected && !val.valid && prot.assetType === 'system_recovery_metadata',
      `T2-RECOVERY-${rp.id}`,
      `Recovery-control path rejected: ${rp.col}/${rp.id}`,
      `AssetType: ${prot.assetType}, Reason: ${prot.reason}`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Unknown system document types are rejected (Defect D-1)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Unknown System Document Types Rejection (Defect D-1) ---');
  const unknownSystemDocs = [
    'random_audit',
    'temp_config',
    'debug_flag',
    'audit_trail',
    'some_unknown_doc'
  ];
  for (const ud of unknownSystemDocs) {
    const prot = checkProtectedPath('system', ud);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `test_unknown_sys_${ud}`,
      entries: [{
        collection: 'system',
        docId: ud,
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const val = orchestrator.validateManifest(man);
    assert(prot.isProtected && !val.valid && prot.assetType === 'system_metadata',
      `T3-UNKNOWN-SYS-${ud.toUpperCase()}`,
      `Unknown system document rejected by default: system/${ud}`,
      `isProtected: ${prot.isProtected}, reason: ${prot.reason}`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Properly linked billing reservation passes validation (Defect D-1)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Properly Linked Billing Reservation Validation (Defect D-1) ---');
  const validResManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_valid_reservation_test',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          linkedReceiptId: 'rcpt_syn_1001',
          linkedReservationId: 'res_syn_1001'
        }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billingFirestoreId: 'bill_syn_1001',
          reservationDocId: 'res_syn_1001',
          source: 'billing'
        }
      },
      {
        collection: 'system',
        docId: 'res_syn_1001',
        recordType: 'sequence_reservation',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billDocId: 'bill_syn_1001',
          receiptDocId: 'rcpt_syn_1001'
        }
      }
    ]
  };

  const valRes = orchestrator.validateManifest(validResManifest, SYNTHETIC_TEST_FIXTURE);
  assert(valRes.valid === true && valRes.errors.length === 0 && valRes.validatedCandidates.length === 3,
    'T4-VALID-RESERVATION-VALIDATION',
    'Properly linked billing reservation passes structural validation without error',
    `Errors: ${valRes.errors.length}, Validated: ${valRes.validatedCandidates.length}`);

  const dryRes = orchestrator.dryRun(validResManifest, SYNTHETIC_TEST_FIXTURE);
  assert(dryRes.mutationsPerformed === 0 && dryRes.deletionsPerformed === 0 && dryRes.status === 'PROPOSAL_VALIDATED',
    'T4-VALID-RESERVATION-DRYRUN',
    'Dry run for reservation executes zero writes and zero mutations',
    `Status: ${dryRes.status}, Deletions: ${dryRes.deletionsPerformed}`);

  let resExecThrew = false;
  try {
    orchestrator.execute(validResManifest);
  } catch (err) {
    resExecThrew = err.code === 'EXECUTE_MODE_DISABLED';
  }
  assert(resExecThrew,
    'T4-VALID-RESERVATION-EXECUTE-LOCKED',
    'Execution remains strictly locked even for valid reservation manifest',
    `Execution mode lock enforced.`);

  // -------------------------------------------------------------------------
  // TEST 5: Properly linked billing idempotency token passes validation (Defect D-1)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Properly Linked Billing Idempotency Token Validation (Defect D-1) ---');
  const validOpManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_valid_idempotency_test',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          linkedReceiptId: 'rcpt_syn_1001',
          linkedOperationId: 'op_syn_uuid_1001'
        }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billingFirestoreId: 'bill_syn_1001',
          source: 'billing'
        }
      },
      {
        collection: 'system',
        docId: 'op_syn_uuid_1001',
        recordType: 'idempotency_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billDocId: 'bill_syn_1001',
          receiptDocId: 'rcpt_syn_1001'
        }
      }
    ]
  };

  const valOp = orchestrator.validateManifest(validOpManifest, SYNTHETIC_TEST_FIXTURE);
  assert(valOp.valid === true && valOp.errors.length === 0 && valOp.validatedCandidates.length === 3,
    'T5-VALID-IDEMPOTENCY-VALIDATION',
    'Properly linked billing idempotency document passes structural validation',
    `Errors: ${valOp.errors.length}, Validated: ${valOp.validatedCandidates.length}`);

  const dryOp = orchestrator.dryRun(validOpManifest, SYNTHETIC_TEST_FIXTURE);
  assert(dryOp.mutationsPerformed === 0 && dryOp.deletionsPerformed === 0 && dryOp.status === 'PROPOSAL_VALIDATED',
    'T5-VALID-IDEMPOTENCY-DRYRUN',
    'Dry run for idempotency document executes zero writes and zero mutations',
    `Status: ${dryOp.status}, Deletions: ${dryOp.deletionsPerformed}`);

  // -------------------------------------------------------------------------
  // TEST 6: Incorrect or missing receipt linkage fields fail closed (Defect D-2)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Receipt Linkage Fail Closed (Defect D-2) ---');
  // 6A: Receipt missing linked bill
  const missingBillManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_missing_bill_link',
    entries: [
      {
        collection: 'receipts',
        docId: 'rcpt_orphan',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {} // No billingFirestoreId or billingId
      }
    ]
  };
  const valMissingBill = orchestrator.validateManifest(missingBillManifest);
  assert(valMissingBill.valid === false && valMissingBill.missingDependencies.some(d => d.dependencyType === 'linked_bill'),
    'T6A-RECEIPT-MISSING-LINKED-BILL',
    'Receipt missing billingFirestoreId / billingId fails closed',
    `Valid: ${valMissingBill.valid}, Errors: ${valMissingBill.errors[0]}`);

  // 6B: Receipt points to bill missing from manifest
  const missingBillInManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_bill_not_in_manifest',
    entries: [
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billingFirestoreId: 'bill_syn_nonexistent'
        }
      }
    ]
  };
  const valMissingManifestBill = orchestrator.validateManifest(missingBillInManifest);
  assert(valMissingManifestBill.valid === false && valMissingManifestBill.missingDependencies.some(d => d.missingDocPath === 'billing/bill_syn_nonexistent'),
    'T6B-RECEIPT-REFERENCES-ABSENT-BILL',
    'Receipt referencing bill omitted from manifest fails closed',
    `Missing doc path: ${valMissingManifestBill.missingDependencies[0]?.missingDocPath}`);

  // 6C: Contradictory reservationDocId between receipt and bill
  const contradictoryResManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_contradictory_res',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          linkedReceiptId: 'rcpt_syn_1001',
          reservationDocId: 'res_syn_1001'
        }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: {
          billingFirestoreId: 'bill_syn_1001',
          reservationDocId: 'res_syn_CONTRADICTORY'
        }
      }
    ]
  };
  const valContradictoryRes = orchestrator.validateManifest(contradictoryResManifest);
  assert(valContradictoryRes.valid === false && valContradictoryRes.dependencyConflicts.length > 0,
    'T6C-CONTRADICTORY-RESERVATION-DOC-ID',
    'Contradictory reservationDocId between bill and receipt is rejected',
    `Conflicts: ${valContradictoryRes.dependencyConflicts[0]?.reason}`);

  // -------------------------------------------------------------------------
  // TEST 7: Independent and physical receipts are rejected (Defect D-2)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Independent and Physical Receipts Protection (Defect D-2) ---');
  // 7A: Physical receipt
  const physRcptManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_phys_receipt',
    entries: [{
      collection: 'receipts',
      docId: 'rcpt_phys_2001',
      recordType: 'physical_receipt',
      classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
      approvalStatus: 'trustee_approved'
    }]
  };
  const valPhysRcpt = orchestrator.validateManifest(physRcptManifest);
  assert(valPhysRcpt.valid === false && valPhysRcpt.protectedEntries.some(p => p.assetType === 'physical_receipt'),
    'T7A-PHYSICAL-RECEIPT-REJECTED',
    'Physical receipt rcpt_phys_* is rejected as protected',
    `Protected: ${valPhysRcpt.protectedEntries[0]?.reason}`);

  // 7B: Independent receipt with source !== 'billing'
  const indepRcptManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_indep_receipt',
    entries: [{
      collection: 'receipts',
      docId: 'rcpt_manual_101',
      recordType: 'independent_receipt',
      source: 'counter_manual',
      classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
      approvalStatus: 'trustee_approved'
    }]
  };
  const valIndepRcpt = orchestrator.validateManifest(indepRcptManifest);
  assert(valIndepRcpt.valid === false && valIndepRcpt.protectedEntries.some(p => p.assetType === 'independent_receipt'),
    'T7B-INDEPENDENT-RECEIPT-REJECTED',
    'Independent receipt with non-billing source is rejected as protected',
    `Protected: ${valIndepRcpt.protectedEntries[0]?.reason}`);

  // 7C: Physical reservation document in system
  const physResProt = checkProtectedPath('system', 'res_phys_2001');
  assert(physResProt.isProtected === true && physResProt.assetType === 'physical_reservation',
    'T7C-PHYSICAL-RESERVATION-REJECTED',
    'Physical reservation system/res_phys_* is protected',
    `Reason: ${physResProt.reason}`);

  // -------------------------------------------------------------------------
  // TEST 8: Payments, transfers, and loans are rejected (Defect D-3)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Protected Financial Collections Rejection (Defect D-3) ---');
  const protectedFinancialCollections = [
    { col: 'payments', id: 'pmt_syn_101', expectedAsset: 'protected_financial_record' },
    { col: 'transfers', id: 'tx_syn_201', expectedAsset: 'protected_financial_record' },
    { col: 'loans', id: 'ln_syn_301', expectedAsset: 'protected_financial_record' },
    { col: 'chittyMembers', id: 'cm_syn_401', expectedAsset: 'chitty_record' },
    { col: 'chittyCollections', id: 'cc_syn_402', expectedAsset: 'chitty_record' },
    { col: 'chittyPayouts', id: 'cp_syn_403', expectedAsset: 'chitty_record' }
  ];

  for (const pfc of protectedFinancialCollections) {
    const prot = checkProtectedPath(pfc.col, pfc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `test_denylist_${pfc.col}`,
      entries: [{
        collection: pfc.col,
        docId: pfc.id,
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const val = orchestrator.validateManifest(man);
    assert(prot.isProtected && !val.valid && prot.assetType === pfc.expectedAsset,
      `T8-PROTECTED-${pfc.col.toUpperCase()}`,
      `Collection ${pfc.col} rejected by protected denylist and excluded from candidates`,
      `isProtected: ${prot.isProtected}, AssetType: ${prot.assetType}`);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Master data, settings, opening balances, and counters are protected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 9: Master Configuration & Infrastructure Protection ---');
  const masterAssets = [
    { col: 'settings', id: 'set_1', label: 'Temple Settings & Opening Balances' },
    { col: 'funds', id: 'f_general', label: 'Master Accounting Fund' },
    { col: 'incomeCategories', id: 'ic_pooja', label: 'Master Income Category' },
    { col: 'expenseCategories', id: 'ec_puja_items', label: 'Master Expense Category' },
    { col: 'bankAccounts', id: 'ba_canara', label: 'Master Bank Account' },
    { col: 'users', id: 'u_admin', label: 'User Auth Configuration' }
  ];

  for (const ma of masterAssets) {
    const prot = checkProtectedPath(ma.col, ma.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `test_master_${ma.col}`,
      entries: [{
        collection: ma.col,
        docId: ma.id,
        classification: RECORD_CLASSIFICATIONS.MASTER_CONFIGURATION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const val = orchestrator.validateManifest(man);
    assert(prot.isProtected && !val.valid,
      `T9-MASTER-${ma.col.toUpperCase()}`,
      `Master asset protected: ${ma.label} (${ma.col}/${ma.id})`,
      `isProtected: ${prot.isProtected}, reason: ${prot.reason}`);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Duplicate manifest entries are rejected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 10: Duplicate Manifest Entries Rejection ---');
  const dupManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_duplicate_entries',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_syn_1001' }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { billingFirestoreId: 'bill_syn_1001' }
      },
      {
        collection: 'billing',
        docId: 'bill_syn_1001', // DUPLICATE ENTRY
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_syn_1001' }
      }
    ]
  };
  const valDup = orchestrator.validateManifest(dupManifest);
  assert(valDup.valid === false && valDup.rejectedEntries.some(r => r.reason.includes('Duplicate document ID')),
    'T10-DUPLICATE-MANIFEST-ENTRIES',
    'Duplicate manifest entries fail closed',
    `Errors: ${valDup.errors[0]}`);

  // -------------------------------------------------------------------------
  // TEST 11: Missing reciprocal links are flagged
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 11: Missing Reciprocal Linkage Flagging ---');
  // 11A: Bill references receipt omitted from manifest
  const missingRcptManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_missing_rcpt',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_syn_1001' }
      }
    ]
  };
  const valMissingRcpt = orchestrator.validateManifest(missingRcptManifest);
  assert(valMissingRcpt.valid === false && valMissingRcpt.missingDependencies.some(d => d.missingDocPath === 'receipts/rcpt_syn_1001'),
    'T11A-BILL-MISSING-RCPT-IN-MANIFEST',
    'Bill referencing receipt omitted from manifest flags missing dependency',
    `Missing: ${valMissingRcpt.missingDependencies[0]?.missingDocPath}`);

  // 11B: System reservation references bill omitted from manifest
  const missingBillFromResManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_missing_bill_from_res',
    entries: [
      {
        collection: 'system',
        docId: 'res_syn_1001',
        recordType: 'sequence_reservation',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { billDocId: 'bill_syn_1001' }
      }
    ]
  };
  const valMissingBillFromRes = orchestrator.validateManifest(missingBillFromResManifest);
  assert(valMissingBillFromRes.valid === false && valMissingBillFromRes.missingDependencies.some(d => d.missingDocPath === 'billing/bill_syn_1001'),
    'T11B-RESERVATION-MISSING-BILL-IN-MANIFEST',
    'Reservation referencing bill omitted from manifest flags missing dependency',
    `Missing: ${valMissingBillFromRes.missingDependencies[0]?.missingDocPath}`);

  // -------------------------------------------------------------------------
  // TEST 12: Contradictory bill/receipt relationships are rejected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 12: Contradictory Relationship Validation ---');
  const contradictoryManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_contradictory_bill_rcpt',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_syn_1001' }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { billingFirestoreId: 'bill_syn_OTHER' } // Contradicts bill_syn_1001
      }
    ]
  };
  const valContradictory = orchestrator.validateManifest(contradictoryManifest);
  assert(valContradictory.valid === false && valContradictory.dependencyConflicts.length > 0,
    'T12-CONTRADICTORY-BILL-RECEIPT-LINKAGE',
    'Contradictory bill/receipt cross-reference is rejected with dependency conflict',
    `Conflict: ${valContradictory.dependencyConflicts[0]?.reason}`);

  // -------------------------------------------------------------------------
  // TEST 13: Unknown collections and malformed document paths are rejected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 13: Unknown Collections and Malformed Paths ---');
  // 13A: Unknown collection
  const unknownColManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_unknown_col',
    entries: [{
      collection: 'donations',
      docId: 'don_1',
      classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
      approvalStatus: 'trustee_approved'
    }]
  };
  const valUnknownCol = orchestrator.validateManifest(unknownColManifest);
  assert(valUnknownCol.valid === false && valUnknownCol.rejectedEntries.some(r => r.reason.includes('Unsupported or non-candidate collection')),
    'T13A-UNKNOWN-COLLECTION-REJECTED',
    'Unknown collection path "donations" rejected by deny-by-default policy',
    `Error: ${valUnknownCol.errors[0]}`);

  // 13B: Malformed path with traversal
  const travProt = checkProtectedPath('billing', '../system/counters');
  assert(travProt.isProtected === true && travProt.assetType === 'invalid_path_syntax',
    'T13B-PATH-TRAVERSAL-REJECTED',
    'Document ID containing path traversal ".." rejected as invalid_path_syntax',
    `Reason: ${travProt.reason}`);

  // 13C: Malformed docId with backslash
  const backslashProt = checkProtectedPath('billing', 'sub\\doc');
  assert(backslashProt.isProtected === true && backslashProt.assetType === 'invalid_path_syntax',
    'T13C-BACKSLASH-REJECTED',
    'Document ID containing backslash rejected as invalid_path_syntax',
    `Reason: ${backslashProt.reason}`);

  // 13D: Malformed docId with null byte
  const nullByteProt = checkProtectedPath('billing', 'doc\0null');
  assert(nullByteProt.isProtected === true && nullByteProt.assetType === 'invalid_path_syntax',
    'T13D-NULL-BYTE-REJECTED',
    'Document ID containing null byte rejected',
    `Reason: ${nullByteProt.reason}`);

  // -------------------------------------------------------------------------
  // TEST 14: Trustee approval cannot activate execution (Preserve Lock)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 14: Permanent Execution Lock Verification ---');
  const fullyApprovedManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_fully_approved_test',
    approvalStatus: 'trustee_approved',
    approvedBy: ['Trustee President', 'Trustee Secretary'],
    approvalDate: '2026-10-19',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_syn_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_syn_1001' }
      },
      {
        collection: 'receipts',
        docId: 'rcpt_syn_1001',
        recordType: 'billing_linked_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { billingFirestoreId: 'bill_syn_1001' }
      }
    ]
  };

  let executionFailedSafely = false;
  let executionErrorCode = null;
  try {
    orchestrator.execute(fullyApprovedManifest);
  } catch (err) {
    executionFailedSafely = true;
    executionErrorCode = err.code;
  }
  assert(executionFailedSafely && executionErrorCode === 'EXECUTE_MODE_DISABLED',
    'T14-EXECUTION-LOCK-ENFORCED',
    'Execution strictly disabled: execute() throws EXECUTE_MODE_DISABLED even with trustee approval',
    `Error code: ${executionErrorCode}`);

  // -------------------------------------------------------------------------
  // TEST 15: Force-delete and protection-bypass attempts are rejected
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 15: Anti-Bypass and Security Safeguards ---');
  const bypassKeywords = [
    'forceDelete',
    'force_delete',
    'ignoreDenylist',
    'ignore_protection',
    'bypassSafeguards',
    'bypass_safeguards',
    'allowProtected',
    'skipValidation',
    'adminBypass',
    'emergencyDelete'
  ];

  for (const kw of bypassKeywords) {
    const maliciousManifest = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'malicious_bypass_test',
      [kw]: true,
      entries: [{
        collection: 'billing',
        docId: 'bill_syn_1001',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved'
      }]
    };
    const valBypass = orchestrator.validateManifest(maliciousManifest);
    assert(valBypass.errors.some(e => e.includes('SECURITY_VIOLATION')),
      `T15-BYPASS-${kw.toUpperCase()}`,
      `Security violation triggered by override attempt: "${kw}"`,
      `Errors: ${valBypass.errors[0]}`);
  }

  // Option-level override attempt
  const valOptionOverride = orchestrator.validateManifest(validResManifest, null, { force_delete: true });
  assert(valOptionOverride.errors.some(e => e.includes('SECURITY_VIOLATION')),
    'T15-OPTION-LEVEL-FORCE-DELETE',
    'Option-level force_delete rejected as SECURITY_VIOLATION',
    `Errors: ${valOptionOverride.errors[0]}`);

  let optionExecFailed = false;
  try {
    orchestrator.execute(validResManifest, { force_delete: true, ignore_protection: true });
  } catch (err) {
    optionExecFailed = err.code === 'EXECUTE_MODE_DISABLED';
  }
  assert(optionExecFailed,
    'T15-EXECUTE-CALL-FORCE-DELETE-LOCKED',
    'Calling execute() with force_delete still throws EXECUTE_MODE_DISABLED',
    `Lock remains unbreakable.`);

  // -------------------------------------------------------------------------
  // TEST 16: Zero database connection or mutation occurs during tests
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 16: Zero Database Connection / Zero Mutation Invariant ---');
  assert(networkCallsDetected === 0,
    'T16A-ZERO-NETWORK-CALLS',
    'Zero outbound HTTP/HTTPS/Socket calls during test execution',
    `Detected network calls: ${networkCallsDetected}`);

  assert(processSpawnDetected === 0,
    'T16B-ZERO-PROCESS-SPAWNS',
    'Zero child process spawns during test execution',
    `Detected process spawns: ${processSpawnDetected}`);

  // -------------------------------------------------------------------------
  // Summary & Teardown
  // -------------------------------------------------------------------------
  // Restore mocked functions
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  net.connect = originalNetConnect;
  child_process.spawn = originalSpawn;
  child_process.exec = originalExec;

  console.log('\n========================================================================');
  console.log(`   TEST EXECUTION COMPLETE: Passed: ${passCount}, Failed: ${failCount}`);
  console.log(`   OVERALL VERDICT: ${failCount === 0 ? '✅ 100% PASS' : '❌ FAIL'}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run the suite
runOfflineTestSuite();
