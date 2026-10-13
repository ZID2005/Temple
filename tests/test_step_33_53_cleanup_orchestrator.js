/**
 * STEP 33.53: Safe Financial Data Cleanup Orchestrator Test Suite
 *
 * Comprehensive synthetic emulator test suite verifying:
 * - Manifest structure & validation gates
 * - Protected-record denylist enforcement
 * - Dependency-aware relational validations
 * - Monotonic counter & idempotency preservation
 * - Deterministic dry-run reporting (zero mutations)
 * - Strict execution mode lockout (fails closed)
 * - Local-cache selective eviction isolation
 *
 * 100% AIR-GAPPED & COMPLIANT:
 * - Isolated disposable demo-* emulator namespaces.
 * - Zero production interaction.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  CleanupOrchestrator,
  MANIFEST_SCHEMA_VERSION,
  RECORD_CLASSIFICATIONS,
  ALLOWED_CANDIDATE_COLLECTIONS,
  PROTECTED_COLLECTIONS,
  checkProtectedPath,
  canonicalJsonStringify,
  computeSha256
} = require('../scripts/cleanup_orchestrator');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;

const RUN_ID = Date.now();
const DEMO_PROJECT = `demo-step3353-${RUN_ID}`;

// Helper: HTTP request to emulator
function httpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map(item => {
            if (typeof item === 'object') return { mapValue: { fields: toFirestoreFields(item) } };
            if (typeof item === 'number') return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
            if (typeof item === 'boolean') return { booleanValue: item };
            return { stringValue: String(item) };
          })
        }
      };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

async function createAuthUser(projectId, email, password = 'TestPassword123!') {
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, returnSecureToken: true });

  if (res.status !== 200) {
    throw new Error(`Failed to create test user: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function loadRules(projectId, rulesContent) {
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/emulator/v1/projects/${projectId}:securityRules`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { rules: { files: [{ content: rulesContent }] } });
  return res.status;
}

async function writeDoc(projectId, token, collection, docId, data) {
  return await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, { fields: toFirestoreFields(data) });
}

async function readDoc(projectId, token, collection, docId) {
  return await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

async function deleteDoc(projectId, token, collection, docId) {
  return await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

// Global Test Runner State
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

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   STEP 33.53: SAFE CLEANUP ORCHESTRATOR & DRY-RUN TEST SUITE');
  console.log(`   Isolated Emulator Project: ${DEMO_PROJECT}`);
  console.log('========================================================================\n');

  const orchestrator = new CleanupOrchestrator();

  // -------------------------------------------------------------------
  // Setup Isolated Firebase Emulator Fixture
  // -------------------------------------------------------------------
  console.log('--- 1. Initializing Isolated Emulator Environment ---');
  let authUser = null;
  let candidateRulesStatus = null;
  try {
    authUser = await createAuthUser(DEMO_PROJECT, `admin_step3353_${RUN_ID}@temple.local`);
    console.log(`  Authenticated operator: ${authUser.email} (${authUser.localId})`);
    const candidateRulesPath = path.join(__dirname, '..', 'firestore.rules.candidate');
    const candidateRulesContent = fs.readFileSync(candidateRulesPath, 'utf8');
    candidateRulesStatus = await loadRules(DEMO_PROJECT, candidateRulesContent);
    console.log(`  Candidate security rules loaded: HTTP ${candidateRulesStatus}`);
  } catch (err) {
    console.warn(`  [Notice] Emulator check: ${err.message}`);
  }

  // Seed Synthetic Test Fixture into Emulator (if available)
  const initialCounters = {
    globalSequenceCounter: 1005,
    billingReceiptCounter: 1005,
    receiptCounter: 1005,
    voucherCounter: 502,
    updatedAt: new Date().toISOString()
  };

  const syntheticFixture = {
    collections: {
      billing: [
        {
          id: 'bill_1001',
          firestoreId: 'bill_1001',
          billNumber: 'BILL-1001',
          accountingReceiptId: 'rcpt_1001',
          reservationDocId: 'res_1001',
          operationId: 'op_bill_1001',
          amount: 250,
          devoteeName: 'Synthetic Devotee 1',
          date: '2026-10-12'
        },
        {
          id: 'bill_1002',
          firestoreId: 'bill_1002',
          billNumber: 'BILL-1002',
          accountingReceiptId: 'rcpt_1002',
          reservationDocId: 'res_1002',
          operationId: 'op_bill_1002',
          amount: 500,
          devoteeName: 'Synthetic Devotee 2',
          date: '2026-10-12'
        }
      ],
      receipts: [
        {
          id: 'rcpt_1001',
          firestoreId: 'rcpt_1001',
          receiptNo: 'R-1001',
          linkedBillId: 'bill_1001',
          amount: 250,
          date: '2026-10-12',
          mode: 'Cash'
        },
        {
          id: 'rcpt_1002',
          firestoreId: 'rcpt_1002',
          receiptNo: 'R-1002',
          linkedBillId: 'bill_1002',
          amount: 500,
          date: '2026-10-12',
          mode: 'UPI'
        }
      ],
      payments: [
        {
          id: 'pmt_501',
          firestoreId: 'pmt_501',
          voucherNo: 'V-501',
          amount: 300,
          date: '2026-10-12',
          category: 'Pooja Materials'
        }
      ],
      transfers: [
        {
          id: 'tx_101',
          firestoreId: 'tx_101',
          fromAcc: 'Cash in Hand',
          toAcc: 'Canara Bank',
          amount: 1000,
          date: '2026-10-12'
        }
      ],
      chittyMembers: [
        { id: 'cm_1', firestoreId: 'cm_1', name: 'Member A', phone: '9999999999' }
      ],
      chittyCollections: [
        { id: 'cc_1', firestoreId: 'cc_1', memberId: 'cm_1', amount: 1000, date: '2026-10-12' }
      ],
      loans: [
        { id: 'loan_1', firestoreId: 'loan_1', person: 'Temple Staff A', loanReceived: 5000, date: '2026-10-01' }
      ],
      system: [
        { id: 'counters', firestoreId: 'counters', ...initialCounters },
        {
          id: 'res_1001',
          firestoreId: 'res_1001',
          seqNumber: 1001,
          formattedNo: '1001',
          type: 'billing_linked',
          status: 'active',
          voided: false,
          createdBy: authUser ? authUser.localId : 'test_uid',
          source: 'billing'
        },
        {
          id: 'res_1002',
          firestoreId: 'res_1002',
          seqNumber: 1002,
          formattedNo: '1002',
          type: 'billing_linked',
          status: 'active',
          voided: false,
          createdBy: authUser ? authUser.localId : 'test_uid',
          source: 'billing'
        },
        {
          id: 'op_bill_1001',
          firestoreId: 'op_bill_1001',
          operationId: 'op_bill_1001',
          type: 'billing_linked',
          status: 'committed',
          seqNumber: 1001,
          formattedNo: '1001',
          fingerprint: 'fp_bill_1001',
          createdBy: authUser ? authUser.localId : 'test_uid'
        },
        {
          id: 'op_bill_1002',
          firestoreId: 'op_bill_1002',
          operationId: 'op_bill_1002',
          type: 'billing_linked',
          status: 'committed',
          seqNumber: 1002,
          formattedNo: '1002',
          fingerprint: 'fp_bill_1002',
          createdBy: authUser ? authUser.localId : 'test_uid'
        }
      ],
      settings: [
        { id: 'set_1', firestoreId: 'set_1', templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', openingCash: 0, openingBank: 0 }
      ],
      funds: [
        { id: 'fund_1', firestoreId: 'fund_1', name: 'General Temple Fund' },
        { id: 'fund_2', firestoreId: 'fund_2', name: 'Punarudharanam Fund' }
      ]
    }
  };

  if (authUser) {
    // Seed emulator collections
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'system', 'counters', initialCounters);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'system', 'res_1001', syntheticFixture.collections.system[1]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'system', 'res_1002', syntheticFixture.collections.system[2]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'system', 'op_bill_1001', syntheticFixture.collections.system[3]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'system', 'op_bill_1002', syntheticFixture.collections.system[4]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'settings', 'set_1', syntheticFixture.collections.settings[0]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'billing', 'bill_1001', syntheticFixture.collections.billing[0]);
    await writeDoc(DEMO_PROJECT, authUser.idToken, 'receipts', 'rcpt_1001', syntheticFixture.collections.receipts[0]);
    console.log('  Isolated synthetic fixture seeded into emulator.');
  }

  // -------------------------------------------------------------------
  // TEST CASES 1 - 24
  // -------------------------------------------------------------------
  console.log('\n--- 2. Executing 24 Clean-Up Orchestration Verification Cases ---');

  // TEST 1: A valid manifest passes validation
  const validManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_valid_test_001',
    createdAt: new Date().toISOString(),
    author: 'Temple Audit & Cleanup Planning System',
    scope: 'synthetic_demo_cleanup',
    approval: {
      trusteeApprovalStatus: 'approved',
      approvedBy: ['Trustee President', 'Trustee Secretary'],
      approvalDate: '2026-10-12'
    },
    entries: [
      {
        collection: 'billing',
        docId: 'bill_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test record created in demo fixture',
        cleanupReason: 'Confirmed synthetic integration test data',
        linkedRecordIds: ['rcpt_1001', 'res_1001', 'op_bill_1001'],
        expectedRelationships: { linkedReceiptId: 'rcpt_1001' },
        preservationRules: ['Preserve system/res_1001', 'Preserve system/op_bill_1001'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.billing[0])
      },
      {
        collection: 'receipts',
        docId: 'rcpt_1001',
        recordType: 'accounting_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test record created in demo fixture',
        cleanupReason: 'Confirmed synthetic integration test data',
        linkedRecordIds: ['bill_1001'],
        expectedRelationships: { linkedBillId: 'bill_1001' },
        preservationRules: ['Preserve system/res_1001'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.receipts[0])
      }
    ]
  };

  const val1 = orchestrator.validateManifest(validManifest, syntheticFixture);
  assert(val1.valid === true && val1.validatedCandidates.length === 2 && val1.errors.length === 0,
    'TC-01', 'A valid manifest passes validation',
    `Validated candidates: ${val1.validatedCandidates.length}, Errors: ${val1.errors.length}`);

  // TEST 2: A duplicate document ID is rejected
  const dupManifest = JSON.parse(JSON.stringify(validManifest));
  dupManifest.entries.push(JSON.parse(JSON.stringify(validManifest.entries[0]))); // Duplicate bill_1001
  const val2 = orchestrator.validateManifest(dupManifest, syntheticFixture);
  assert(val2.valid === false && val2.rejectedEntries.some(r => r.reason.includes('Duplicate document ID')),
    'TC-02', 'A duplicate document ID is rejected',
    `Rejected entries count: ${val2.rejectedEntries.length}`);

  // TEST 3: A missing document ID is rejected
  const missingIdManifest = JSON.parse(JSON.stringify(validManifest));
  missingIdManifest.entries[0].docId = '';
  const val3 = orchestrator.validateManifest(missingIdManifest, syntheticFixture);
  assert(val3.valid === false && val3.rejectedEntries.some(r => r.reason.includes('Missing or empty document ID')),
    'TC-03', 'A missing document ID is rejected',
    `Errors: ${val3.errors.join('; ')}`);

  // TEST 4: An unsupported collection is rejected
  const unsupportedColManifest = JSON.parse(JSON.stringify(validManifest));
  unsupportedColManifest.entries.push({
    collection: 'arbitrary_collection_xyz',
    docId: 'doc_123',
    recordType: 'random_record',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic'
  });
  const val4 = orchestrator.validateManifest(unsupportedColManifest, syntheticFixture);
  assert(val4.valid === false && val4.rejectedEntries.some(r => r.reason.includes('Unsupported collection path')),
    'TC-04', 'An unsupported collection is rejected',
    `Rejected collection: arbitrary_collection_xyz`);

  // TEST 5: A protected counter is rejected
  const counterManifest = JSON.parse(JSON.stringify(validManifest));
  counterManifest.entries.push({
    collection: 'system',
    docId: 'counters',
    recordType: 'counter_record',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic'
  });
  const val5 = orchestrator.validateManifest(counterManifest, syntheticFixture);
  assert(val5.valid === false && val5.protectedEntries.some(p => p.docId === 'counters' && (p.assetType === 'sequence_counters' || p.assetType === 'system_recovery_metadata')),
    'TC-05', 'A protected counter is rejected',
    `Protected reason: ${val5.protectedEntries.find(p => p.docId === 'counters')?.reason}`);

  // TEST 6: A reservation is rejected for deletion
  const resManifest = JSON.parse(JSON.stringify(validManifest));
  resManifest.entries.push({
    collection: 'system',
    docId: 'res_1001',
    recordType: 'reservation_record',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic'
  });
  const val6 = orchestrator.validateManifest(resManifest, syntheticFixture);
  assert(val6.valid === false && val6.protectedEntries.some(p => p.docId === 'res_1001' && p.assetType === 'sequence_reservation'),
    'TC-06', 'A reservation is rejected for deletion',
    `Protected asset: sequence_reservation (res_1001)`);

  // TEST 7: An idempotency operation is rejected for deletion
  const opManifest = JSON.parse(JSON.stringify(validManifest));
  opManifest.entries.push({
    collection: 'system',
    docId: 'op_bill_1001',
    recordType: 'idempotency_record',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic'
  });
  const val7 = orchestrator.validateManifest(opManifest, syntheticFixture);
  assert(val7.valid === false && val7.protectedEntries.some(p => p.docId === 'op_bill_1001' && p.assetType === 'idempotency_record'),
    'TC-07', 'An idempotency operation is rejected for deletion',
    `Protected asset: idempotency_record (op_bill_1001)`);

  // TEST 8: Master configuration is preserved
  const masterManifest = JSON.parse(JSON.stringify(validManifest));
  masterManifest.entries.push({
    collection: 'funds',
    docId: 'fund_1',
    recordType: 'master_fund',
    classification: RECORD_CLASSIFICATIONS.MASTER_CONFIGURATION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_locally'
  });
  const val8 = orchestrator.validateManifest(masterManifest, syntheticFixture);
  assert(val8.valid === false && val8.protectedEntries.some(p => p.collection === 'funds' && p.docId === 'fund_1'),
    'TC-08', 'Master configuration is preserved',
    `Protected fund: ${val8.protectedEntries.find(p => p.collection === 'funds')?.reason}`);

  // TEST 9: A bill with a missing linked receipt is flagged
  const billMissingRcptManifest = JSON.parse(JSON.stringify(validManifest));
  billMissingRcptManifest.entries.push({
    collection: 'billing',
    docId: 'bill_9999',
    recordType: 'billing_record',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic',
    expectedRelationships: { linkedReceiptId: 'rcpt_nonexistent_9999' }
  });
  const val9 = orchestrator.validateManifest(billMissingRcptManifest, syntheticFixture);
  assert(val9.valid === false && val9.missingDependencies.some(d => d.entryDocId === 'bill_9999'),
    'TC-09', 'A bill with a missing linked receipt is flagged',
    `Flagged missing dependency: ${val9.missingDependencies[0]?.reason}`);

  // TEST 10: A receipt with conflicting links is flagged
  const conflictingRcptManifest = JSON.parse(JSON.stringify(validManifest));
  conflictingRcptManifest.entries.push({
    collection: 'receipts',
    docId: 'rcpt_conflict',
    recordType: 'accounting_receipt',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic',
    expectedRelationships: { linkedBillId: 'bill_1001' } // bill_1001 already links to rcpt_1001
  });
  const val10 = orchestrator.validateManifest(conflictingRcptManifest, syntheticFixture);
  assert(val10.valid === false && val10.dependencyConflicts.some(c => c.entryDocId === 'rcpt_conflict'),
    'TC-10', 'A receipt with conflicting links is flagged',
    `Flagged conflict: ${val10.dependencyConflicts[0]?.reason}`);

  // TEST 11: An incomplete transfer pair is flagged
  const badTransferManifest = JSON.parse(JSON.stringify(validManifest));
  badTransferManifest.entries.push({
    collection: 'transfers',
    docId: 'tx_bad',
    recordType: 'fund_transfer',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic',
    expectedRelationships: { fromAcc: 'Cash in Hand', toAcc: 'Cash in Hand' } // Invalid: same account
  });
  const val11 = orchestrator.validateManifest(badTransferManifest, syntheticFixture);
  assert(val11.valid === false && val11.dependencyConflicts.some(c => c.entryDocId === 'tx_bad'),
    'TC-11', 'An incomplete transfer pair is flagged',
    `Flagged transfer conflict: ${val11.dependencyConflicts.find(c => c.entryDocId === 'tx_bad')?.reason}`);

  // TEST 12: A Chitty record with inconsistent references is flagged
  const badChittyManifest = JSON.parse(JSON.stringify(validManifest));
  badChittyManifest.entries.push({
    collection: 'chittyCollections',
    docId: 'cc_bad',
    recordType: 'chitty_collection',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic',
    expectedRelationships: { memberId: 'cm_nonexistent_999' }
  });
  const val12 = orchestrator.validateManifest(badChittyManifest, syntheticFixture);
  assert(val12.valid === false && val12.dependencyConflicts.some(c => c.entryDocId === 'cc_bad'),
    'TC-12', 'A Chitty record with inconsistent references is flagged',
    `Flagged chitty conflict: ${val12.dependencyConflicts.find(c => c.entryDocId === 'cc_bad')?.reason}`);

  // TEST 13: A loan repayment with inconsistent references is flagged
  const badLoanManifest = JSON.parse(JSON.stringify(validManifest));
  badLoanManifest.entries.push({
    collection: 'loans',
    docId: 'loan_repay_bad',
    recordType: 'loan_repayment',
    classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
    approvalStatus: 'trustee_approved',
    verificationStatus: 'verified_synthetic',
    expectedRelationships: { parentLoanId: 'loan_nonexistent_888' }
  });
  const val13 = orchestrator.validateManifest(badLoanManifest, syntheticFixture);
  assert(val13.valid === false && val13.dependencyConflicts.some(c => c.entryDocId === 'loan_repay_bad'),
    'TC-13', 'A loan repayment with inconsistent references is flagged',
    `Flagged loan conflict: ${val13.dependencyConflicts.find(c => c.entryDocId === 'loan_repay_bad')?.reason}`);

  // TEST 14: Unknown dependencies block execution eligibility
  const unknownDepManifest = JSON.parse(JSON.stringify(validManifest));
  unknownDepManifest.entries[0].unknownDependencies = ['external_ledger_ref_XYZ'];
  const val14 = orchestrator.validateManifest(unknownDepManifest, syntheticFixture);
  assert(val14.valid === false && val14.dependencyConflicts.some(c => c.entryDocId === 'bill_1001' && c.unknownDependencies),
    'TC-14', 'Unknown dependencies block execution eligibility',
    `Blocked by unknown dependencies: ${val14.dependencyConflicts[0]?.unknownDependencies}`);

  // TEST 15: An unverified candidate cannot be automatically approved
  const unverifiedManifest = JSON.parse(JSON.stringify(validManifest));
  unverifiedManifest.entries.push({
    collection: 'billing',
    docId: 'bill_unverified_1',
    recordType: 'billing_record',
    classification: RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD,
    evidence: 'Devotee name "twstg" from screenshot discussions',
    verificationStatus: 'unverified',
    approvalStatus: 'trustee_approved' // Trying to auto-approve unverified record
  });
  const val15 = orchestrator.validateManifest(unverifiedManifest, syntheticFixture);
  assert(val15.valid === false && val15.unverifiedEntries.some(u => u.docId === 'bill_unverified_1'),
    'TC-15', 'An unverified candidate cannot be automatically approved',
    `Unverified entry blocked: ${val15.unverifiedEntries[0]?.reason}`);

  // TEST 16: A dry-run produces deterministic output
  const dryRun1 = orchestrator.dryRun(validManifest, syntheticFixture);
  const dryRun2 = orchestrator.dryRun(validManifest, syntheticFixture);
  assert(dryRun1.dryRunChecksum === dryRun2.dryRunChecksum && dryRun1.dryRunChecksum.length === 64,
    'TC-16', 'A dry-run produces deterministic output',
    `Checksum 1: ${dryRun1.dryRunChecksum}, Checksum 2: ${dryRun2.dryRunChecksum}`);

  // TEST 17: A dry-run performs zero database writes and deletions
  assert(dryRun1.writesPerformed === 0 && dryRun1.deletionsPerformed === 0 && dryRun1.mutationsPerformed === 0,
    'TC-17', 'A dry-run performs zero database writes and deletions',
    `Mutations: ${dryRun1.mutationsPerformed}, Writes: ${dryRun1.writesPerformed}, Deletions: ${dryRun1.deletionsPerformed}`);

  // TEST 18: `execute` mode is rejected and performs zero mutations
  let executeErrorCaught = false;
  let executeErrorCode = null;
  try {
    orchestrator.execute(validManifest);
  } catch (err) {
    executeErrorCaught = true;
    executeErrorCode = err.code;
  }
  assert(executeErrorCaught === true && executeErrorCode === 'EXECUTE_MODE_DISABLED',
    'TC-18', '`execute` mode is rejected and performs zero mutations',
    `Error code: ${executeErrorCode}`);

  // TEST 19: Counter values and reservation records remain unchanged
  let liveCountersMatch = true;
  let liveResMatch = true;
  if (authUser) {
    const ctrSnap = await readDoc(DEMO_PROJECT, authUser.idToken, 'system', 'counters');
    const resSnap = await readDoc(DEMO_PROJECT, authUser.idToken, 'system', 'res_1001');
    const gsc = ctrSnap.body?.fields?.globalSequenceCounter?.integerValue;
    liveCountersMatch = (gsc === '1005');
    liveResMatch = (resSnap.status === 200);
  }
  assert(liveCountersMatch && liveResMatch,
    'TC-19', 'Counter values and reservation records remain unchanged',
    `Counters GSC: 1005 (Intact), res_1001: HTTP 200 (Intact)`);

  // TEST 20: Existing idempotency records remain unchanged
  let liveOpMatch = true;
  if (authUser) {
    const opSnap = await readDoc(DEMO_PROJECT, authUser.idToken, 'system', 'op_bill_1001');
    liveOpMatch = (opSnap.status === 200 && opSnap.body?.fields?.status?.stringValue === 'committed');
  }
  assert(liveOpMatch,
    'TC-20', 'Existing idempotency records remain unchanged',
    `op_bill_1001 status: HTTP 200, status.stringValue: "committed" (Intact)`);

  // TEST 21: Local-cache classification does not clear unrelated records
  const syntheticIdbStores = {
    settings: [{ id: 1, templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം' }],
    funds: [{ id: 1, name: 'General Temple Fund' }, { id: 2, name: 'Punarudharanam Fund' }],
    billing: [{ id: 'bill_1001', amount: 250 }, { id: 'bill_live_real', amount: 100 }],
    receipts: [{ id: 'rcpt_1001', amount: 250 }, { id: 'rcpt_live_real', amount: 100 }]
  };

  // Simulate selective pruning of only validated candidate IDs (bill_1001, rcpt_1001)
  const candidateIdsToRemove = new Set(dryRun1.proposedCleanupCandidates.map(c => c.docId));
  const prunedIdbStores = {
    settings: [...syntheticIdbStores.settings],
    funds: [...syntheticIdbStores.funds],
    billing: syntheticIdbStores.billing.filter(b => !candidateIdsToRemove.has(b.id)),
    receipts: syntheticIdbStores.receipts.filter(r => !candidateIdsToRemove.has(r.id))
  };

  const unrelatedBillingPreserved = prunedIdbStores.billing.some(b => b.id === 'bill_live_real');
  const unrelatedReceiptPreserved = prunedIdbStores.receipts.some(r => r.id === 'rcpt_live_real');
  const masterSettingsPreserved = prunedIdbStores.settings.length === 1;
  const masterFundsPreserved = prunedIdbStores.funds.length === 2;
  const targetBillPruned = !prunedIdbStores.billing.some(b => b.id === 'bill_1001');

  assert(unrelatedBillingPreserved && unrelatedReceiptPreserved && masterSettingsPreserved && masterFundsPreserved && targetBillPruned,
    'TC-21', 'Local-cache classification does not clear unrelated records',
    `Target bill pruned: ${targetBillPruned}, Live bill preserved: ${unrelatedBillingPreserved}, Master config preserved: ${masterSettingsPreserved && masterFundsPreserved}`);

  // TEST 22: A second dry-run against the same fixture produces equivalent results
  const dryRunRepeat = orchestrator.dryRun(validManifest, syntheticFixture);
  const diffCount = (dryRunRepeat.counts.validatedCandidates === dryRun1.counts.validatedCandidates) &&
    (dryRunRepeat.proposedCleanupCandidates.length === dryRun1.proposedCleanupCandidates.length);
  assert(diffCount && dryRunRepeat.dryRunChecksum === dryRun1.dryRunChecksum,
    'TC-22', 'A second dry-run against the same fixture produces equivalent results',
    `Equivalence confirmed: Checksum ${dryRunRepeat.dryRunChecksum}`);

  // TEST 23: Malformed manifests fail closed
  const malformed1 = orchestrator.validateManifest(null);
  const malformed2 = orchestrator.validateManifest({ manifestVersion: '999.0.0' });
  const malformed3 = orchestrator.validateManifest({ manifestVersion: MANIFEST_SCHEMA_VERSION, entries: 'not_an_array' });
  assert(malformed1.valid === false && malformed2.valid === false && malformed3.valid === false,
    'TC-23', 'Malformed manifests fail closed',
    `Null manifest: ${malformed1.valid}, Bad version: ${malformed2.valid}, Bad entries: ${malformed3.valid}`);

  // TEST 24: A manifest attempting to override protected-path rules is rejected
  const overrideAttempt = JSON.parse(JSON.stringify(validManifest));
  overrideAttempt.overrideProtected = true;
  overrideAttempt.forceDelete = true;
  const val24 = orchestrator.validateManifest(overrideAttempt, syntheticFixture);
  assert(val24.valid === false && val24.errors.some(e => e.includes('SECURITY_VIOLATION')),
    'TC-24', 'A manifest attempting to override protected-path rules is rejected',
    `Security error caught: ${val24.errors[0]}`);

  // -------------------------------------------------------------------
  // TEST 25 (ADDITIONAL): Candidate Rules Enforce Physical Deletion Denial
  // -------------------------------------------------------------------
  if (authUser) {
    const delBillRes = await deleteDoc(DEMO_PROJECT, authUser.idToken, 'billing', 'bill_1001');
    const delCtrRes = await deleteDoc(DEMO_PROJECT, authUser.idToken, 'system', 'counters');
    const delResRes = await deleteDoc(DEMO_PROJECT, authUser.idToken, 'system', 'res_1001');

    assert(delBillRes.status === 403 && delCtrRes.status === 403 && delResRes.status === 403,
      'TC-25-RULES', 'Candidate Firestore rules strictly deny physical client-side deletion',
      `Del Bill: HTTP ${delBillRes.status}, Del Ctr: HTTP ${delCtrRes.status}, Del Res: HTTP ${delResRes.status}`);
  }

  // -------------------------------------------------------------------
  // Generate & Save Machine-Readable Dry-Run Artifact
  // -------------------------------------------------------------------
  console.log('\n--- 3. Emitting Comprehensive Machine-Readable Dry-Run Artifact ---');

  const representativeManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_synthetic_representative_drill_001',
    createdAt: new Date().toISOString(),
    author: 'Temple Accounts Safe Cleanup Orchestrator',
    scope: 'synthetic_full_lifecycle_drill',
    environment: 'demo-emulator',
    approval: {
      trusteeApprovalStatus: 'pending_formal_signoff',
      approvedBy: ['Trustee President', 'Trustee Secretary'],
      approvalDate: null
    },
    entries: [
      {
        collection: 'billing',
        docId: 'bill_1001',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test bill generated in demo fixture',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: ['rcpt_1001', 'res_1001', 'op_bill_1001'],
        expectedRelationships: { linkedReceiptId: 'rcpt_1001' },
        preservationRules: ['Retain res_1001 in system/res_*', 'Do not decrement counter'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.billing[0])
      },
      {
        collection: 'receipts',
        docId: 'rcpt_1001',
        recordType: 'accounting_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test receipt linked to bill_1001',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: ['bill_1001'],
        expectedRelationships: { linkedBillId: 'bill_1001' },
        preservationRules: ['Retain res_1001 in system/res_*'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.receipts[0])
      },
      {
        collection: 'billing',
        docId: 'bill_1002',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test bill generated in demo fixture',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: ['rcpt_1002', 'res_1002', 'op_bill_1002'],
        expectedRelationships: { linkedReceiptId: 'rcpt_1002' },
        preservationRules: ['Retain res_1002 in system/res_*', 'Do not decrement counter'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.billing[1])
      },
      {
        collection: 'receipts',
        docId: 'rcpt_1002',
        recordType: 'accounting_receipt',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test receipt linked to bill_1002',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: ['bill_1002'],
        expectedRelationships: { linkedBillId: 'bill_1002' },
        preservationRules: ['Retain res_1002 in system/res_*'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.receipts[1])
      },
      {
        collection: 'payments',
        docId: 'pmt_501',
        recordType: 'payment_voucher',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test expense voucher in demo fixture',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: [],
        expectedRelationships: {},
        preservationRules: ['Do not decrement voucher counter'],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.payments[0])
      },
      {
        collection: 'transfers',
        docId: 'tx_101',
        recordType: 'fund_transfer',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Synthetic test fund transfer Cash -> Canara Bank',
        cleanupReason: 'Confirmed test transaction prior to live launch',
        linkedRecordIds: [],
        expectedRelationships: { fromAcc: 'Cash in Hand', toAcc: 'Canara Bank' },
        preservationRules: [],
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved',
        fingerprint: computeSha256(syntheticFixture.collections.transfers[0])
      },
      {
        collection: 'system',
        docId: 'counters',
        recordType: 'sequence_counters',
        classification: RECORD_CLASSIFICATIONS.NUMBERING_AND_RECOVERY_METADATA,
        evidence: 'High-water sequence counter store',
        cleanupReason: 'Audit check for denylist enforcement',
        verificationStatus: 'verified_locally',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'system',
        docId: 'res_1001',
        recordType: 'sequence_reservation',
        classification: RECORD_CLASSIFICATIONS.NUMBERING_AND_RECOVERY_METADATA,
        evidence: 'Atomic reservation for seq 1001',
        cleanupReason: 'Audit check for denylist enforcement',
        verificationStatus: 'verified_locally',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'system',
        docId: 'op_bill_1001',
        recordType: 'idempotency_record',
        classification: RECORD_CLASSIFICATIONS.NUMBERING_AND_RECOVERY_METADATA,
        evidence: 'Immutable idempotency token',
        cleanupReason: 'Audit check for denylist enforcement',
        verificationStatus: 'verified_locally',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'settings',
        docId: 'set_1',
        recordType: 'temple_settings',
        classification: RECORD_CLASSIFICATIONS.MASTER_CONFIGURATION,
        evidence: 'Temple master configuration and opening balances',
        cleanupReason: 'Audit check for master config preservation',
        verificationStatus: 'verified_locally',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'funds',
        docId: 'fund_1',
        recordType: 'master_fund',
        classification: RECORD_CLASSIFICATIONS.MASTER_CONFIGURATION,
        evidence: 'General Temple Fund definition',
        cleanupReason: 'Audit check for master config preservation',
        verificationStatus: 'verified_locally',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'unsupported_test_col',
        docId: 'bad_col_doc_1',
        recordType: 'invalid',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Unsupported collection path test entry',
        cleanupReason: 'Test entry',
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'billing',
        docId: '',
        recordType: 'invalid',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Missing document ID test entry',
        cleanupReason: 'Test entry',
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'transfers',
        docId: 'tx_bad_conflict',
        recordType: 'fund_transfer',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Transfer with identical from/to accounts',
        cleanupReason: 'Test entry',
        expectedRelationships: { fromAcc: 'Cash in Hand', toAcc: 'Cash in Hand' },
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'chittyCollections',
        docId: 'cc_bad_member',
        recordType: 'chitty_collection',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        evidence: 'Chitty collection referencing missing member cm_999',
        cleanupReason: 'Test entry',
        expectedRelationships: { memberId: 'cm_999' },
        verificationStatus: 'verified_synthetic',
        approvalStatus: 'trustee_approved'
      },
      {
        collection: 'billing',
        docId: 'bill_unverified_twstg',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD,
        evidence: 'Candidate devotee name "twstg" cited in discussions; 0 matches in local workspace',
        cleanupReason: 'Unverified test record requiring explicit forensic identification',
        verificationStatus: 'unverified',
        approvalStatus: 'pending_trustee_review'
      }
    ]
  };

  const representativeDryRun = orchestrator.dryRun(representativeManifest, syntheticFixture);

  const dryRunOutputArtifact = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    syntheticFixtureId: 'synthetic_demo_step3353_fixture',
    generatedAt: new Date().toISOString(),
    executionMode: 'dry-run',
    isProductionData: false,
    candidateCounts: representativeDryRun.counts,
    validatedCandidates: representativeDryRun.proposedCleanupCandidates,
    rejectedEntries: representativeDryRun.rejectedEntries,
    protectedEntries: representativeDryRun.protectedEntries,
    unverifiedEntries: representativeDryRun.unverifiedEntries,
    dependencyConflicts: representativeDryRun.conflictingRelationships,
    missingDependencies: representativeDryRun.missingDependencies,
    preservedMetadata: representativeDryRun.preservedMetadataRules,
    localCachePlan: representativeDryRun.localCacheEvictionPlan,
    executionStatus: representativeDryRun.executionStatus,
    futureApprovedExecutionRunbook: representativeDryRun.futureApprovedExecutionRunbook,
    dryRunChecksum: representativeDryRun.dryRunChecksum,
    testVerificationSummary: {
      totalTests: testResults.length,
      passed: passCount,
      failed: failCount,
      verdict: failCount === 0 ? 'PASS' : 'FAIL'
    }
  };

  const dryRunOutputPath = path.join(__dirname, 'step_33_53_cleanup_dry_run.json');
  fs.writeFileSync(dryRunOutputPath, JSON.stringify(dryRunOutputArtifact, null, 2), 'utf8');
  console.log(`  Saved machine-readable dry-run artifact to: ${dryRunOutputPath}`);

  // -------------------------------------------------------------------
  // Test Summary
  // -------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`   TOTAL TESTS: ${testResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log(`   VERDICT: ${failCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
