/**
 * tests/test_step_33_54_cleanup_audit.js
 *
 * STEP 33.54: Safe Financial Data Cleanup Orchestrator Security Audit
 * & Adversarial Verification Suite
 *
 * 100% AIR-GAPPED & COMPLIANT:
 * - Isolated disposable demo-* emulator namespaces (127.0.0.1:8080, 127.0.0.1:9099).
 * - Zero production access to temple-f4f7d or Vercel.
 * - Zero mutation of real financial data or live counters.
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
  PROTECTED_EXACT_DOCS,
  checkProtectedPath,
  canonicalJsonStringify,
  computeSha256
} = require('../scripts/cleanup_orchestrator');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;

const RUN_ID = Date.now();
const DEMO_PROJECT = `demo-step3354-${RUN_ID}`;

// Helper: HTTP request to emulator REST API
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

function fromFirestoreFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) obj[k] = v.stringValue;
    else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) obj[k] = parseFloat(v.doubleValue);
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else if ('nullValue' in v) obj[k] = null;
    else if ('mapValue' in v) obj[k] = fromFirestoreFields(v.mapValue.fields);
    else if ('arrayValue' in v) obj[k] = (v.arrayValue.values || []).map(val => {
      if ('stringValue' in val) return val.stringValue;
      if ('integerValue' in val) return parseInt(val.integerValue, 10);
      if ('booleanValue' in val) return val.booleanValue;
      if ('mapValue' in val) return fromFirestoreFields(val.mapValue.fields);
      return null;
    });
  }
  return obj;
}

async function createAuthUser(projectId, email, password = 'AuditPassword123!') {
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

// Global test reporting structures
const auditResults = {
  step: 'STEP 33.54',
  title: 'Cleanup Orchestrator Security Audit & Adversarial Verification',
  runId: RUN_ID,
  timestamp: new Date().toISOString(),
  emulator: {
    host: EMULATOR_HOST,
    firestorePort: FIRESTORE_PORT,
    authPort: AUTH_PORT,
    projectId: DEMO_PROJECT
  },
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0
  },
  tests: []
};

function assertTest(condition, testId, category, description, evidence = '') {
  auditResults.summary.total++;
  if (condition) {
    auditResults.summary.passed++;
    console.log(`  ✅ [PASS] ${testId} [${category}]: ${description}`);
    auditResults.tests.push({ id: testId, category, status: 'PASS', description, evidence });
  } else {
    auditResults.summary.failed++;
    console.error(`  ❌ [FAIL] ${testId} [${category}]: ${description}`);
    console.error(`     Evidence: ${evidence}`);
    auditResults.tests.push({ id: testId, category, status: 'FAIL', description, evidence });
  }
}

async function runAuditSuite() {
  console.log('========================================================================');
  console.log('  STEP 33.54: CLEANUP ORCHESTRATOR SECURITY AUDIT & ADVERSARIAL TESTS');
  console.log(`  Isolated Disposable Namespace: ${DEMO_PROJECT}`);
  console.log('========================================================================\n');

  const orchestrator = new CleanupOrchestrator();

  // -------------------------------------------------------------------
  // Setup Emulator Fixture
  // -------------------------------------------------------------------
  console.log('--- Phase 1: Emulator Fixture Provisioning ---');
  let authUser = null;
  let token = null;
  try {
    authUser = await createAuthUser(DEMO_PROJECT, `audit_operator_${RUN_ID}@temple.local`);
    token = authUser.idToken;
    console.log(`  Authenticated operator: ${authUser.email} (${authUser.localId})`);
    const candidateRulesPath = path.join(__dirname, '..', 'firestore.rules.candidate');
    const candidateRulesContent = fs.readFileSync(candidateRulesPath, 'utf8');
    const rulesStatus = await loadRules(DEMO_PROJECT, candidateRulesContent);
    console.log(`  Candidate rules loaded: HTTP ${rulesStatus}`);
  } catch (err) {
    console.error(`  Emulator initialization error: ${err.message}`);
  }

  // Seed baseline state into isolated emulator conforming to firestore.rules.candidate schema
  const baselineData = {
    counters: {
      globalSequenceCounter: 1050,
      billingReceiptCounter: 50,
      receiptCounter: 1000,
      voucherCounter: 200,
      updatedAt: new Date().toISOString()
    },
    reservation: {
      seqNumber: 1050,
      formattedNo: 'BILL-1050',
      type: 'billing_linked',
      source: 'billing',
      status: 'active',
      voided: false,
      createdBy: authUser ? authUser.localId : 'test_uid',
      operationId: 'op_bill_1050'
    },
    idempotency: {
      operationId: 'op_bill_1050',
      type: 'billing_linked',
      seqNumber: 1050,
      formattedNo: 'BILL-1050',
      fingerprint: 'fp_1050',
      status: 'committed',
      createdBy: authUser ? authUser.localId : 'test_uid'
    },
    settings: {
      templeName: 'Marutha Chamundi Devi Temple',
      address: 'Ashari Vilakam, Keraladityapuram'
    },
    fund: {
      name: 'Punarudharanam Fund',
      targetAmount: 5000000
    },
    billing: {
      totalAmount: 500,
      devoteeName: 'Test Devotee 1',
      accountingReceiptId: 'rcpt_1050',
      status: 'active',
      voided: false,
      createdBy: authUser ? authUser.localId : 'test_uid'
    },
    receipt: {
      amount: 500,
      devoteeName: 'Test Devotee 1',
      linkedBillId: 'bill_1050',
      status: 'active',
      voided: false,
      createdBy: authUser ? authUser.localId : 'test_uid'
    }
  };

  if (token) {
    await writeDoc(DEMO_PROJECT, token, 'system', 'counters', baselineData.counters);
    await writeDoc(DEMO_PROJECT, token, 'system', 'res_1050', baselineData.reservation);
    await writeDoc(DEMO_PROJECT, token, 'system', 'op_bill_1050', baselineData.idempotency);
    await writeDoc(DEMO_PROJECT, token, 'settings', 'set_1', baselineData.settings);
    await writeDoc(DEMO_PROJECT, token, 'funds', 'fund_1', baselineData.fund);
    await writeDoc(DEMO_PROJECT, token, 'billing', 'bill_1050', baselineData.billing);
    await writeDoc(DEMO_PROJECT, token, 'receipts', 'rcpt_1050', baselineData.receipt);
    console.log('  Baseline synthetic fixture seeded successfully into emulator.\n');
  }

  // -------------------------------------------------------------------
  // GROUP 1: MANIFEST & PATH VALIDATION ADVERSARIAL TESTS
  // -------------------------------------------------------------------
  console.log('--- Group 1: Manifest & Path Validation Adversarial Tests ---');

  // SEC-PATH-01: Protected counters path rejected
  const resCounter = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_counter_path',
    entries: [{ collection: 'system', docId: 'counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resCounter.valid && resCounter.errors.some(e => e.includes('system/counters') || e.includes('Protected record')),
    'SEC-PATH-01', 'PathValidation',
    'Protected counter path (system/counters) is strictly rejected',
    `Errors: ${JSON.stringify(resCounter.errors)}`
  );

  // SEC-PATH-02: Counter path prefix rejected regardless of collection
  const resColCounter = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_col_counter',
    entries: [{ collection: 'billing', docId: 'counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resColCounter.valid && resColCounter.errors.some(e => e.includes('counters') && e.includes('Protected record')),
    'SEC-PATH-02', 'PathValidation',
    'Counter ID in non-system collection is rejected by document-level denylist',
    `Errors: ${JSON.stringify(resColCounter.errors)}`
  );

  // SEC-PATH-03: Reservation path rejected
  const resRes = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_reservation_path',
    entries: [{ collection: 'system', docId: 'res_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resRes.valid && resRes.errors.some(e => e.includes('res_1050')),
    'SEC-PATH-03', 'PathValidation',
    'Sequence reservation path (system/res_*) is strictly rejected',
    `Errors: ${JSON.stringify(resRes.errors)}`
  );

  // SEC-PATH-04: Idempotency path rejected
  const resOp = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_idempotency_path',
    entries: [{ collection: 'system', docId: 'op_bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resOp.valid && resOp.errors.some(e => e.includes('op_bill_1050')),
    'SEC-PATH-04', 'PathValidation',
    'Idempotency path (system/op_*) is strictly rejected',
    `Errors: ${JSON.stringify(resOp.errors)}`
  );

  // SEC-PATH-05: Restore progress path rejected
  const resProg = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_restore_progress',
    entries: [{ collection: 'system', docId: '_restoreProgress', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resProg.valid && resProg.errors.some(e => e.includes('_restoreProgress')),
    'SEC-PATH-05', 'PathValidation',
    'Restore progress path (system/_restoreProgress) is strictly rejected',
    `Errors: ${JSON.stringify(resProg.errors)}`
  );

  // SEC-PATH-06: Master configuration rejected
  const resSettings = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_master_config',
    entries: [
      { collection: 'settings', docId: 'set_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'funds', docId: 'fund_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'incomeCategories', docId: 'inc_cat_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'bankAccounts', docId: 'ba_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'users', docId: 'usr_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }
    ]
  });
  assertTest(
    !resSettings.valid && resSettings.protectedEntries.length === 5,
    'SEC-PATH-06', 'PathValidation',
    'Master configuration paths (settings, funds, incomeCategories, bankAccounts, users) are all protected and rejected',
    `Protected count: ${resSettings.protectedEntries.length}`
  );

  // SEC-PATH-07: Unsupported collection rejected
  const resUnsup = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_unsupported_col',
    entries: [{ collection: 'ledger', docId: 'entry_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resUnsup.valid && resUnsup.errors.some(e => e.includes('Unsupported collection path "ledger"')),
    'SEC-PATH-07', 'PathValidation',
    'Unsupported collection path (ledger) is rejected by candidate collection whitelist',
    `Errors: ${JSON.stringify(resUnsup.errors)}`
  );

  // SEC-PATH-08: Duplicate document IDs rejected
  const resDup = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_dup_id',
    entries: [
      { collection: 'billing', docId: 'bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1050' } },
      { collection: 'billing', docId: 'bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1050' } }
    ]
  });
  assertTest(
    !resDup.valid && resDup.errors.some(e => e.includes('Duplicate document ID "billing/bill_1050"')),
    'SEC-PATH-08', 'PathValidation',
    'Duplicate document IDs in cleanup manifest are detected and rejected',
    `Errors: ${JSON.stringify(resDup.errors)}`
  );

  // SEC-PATH-09: Malformed and missing IDs rejected
  const resMalformed = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_malformed_id',
    entries: [
      { collection: 'billing', docId: '', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'billing', docId: '   ', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'billing', docId: null, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: '', docId: 'bill_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'billing', docId: 'bill/subdoc/1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }
    ]
  });
  assertTest(
    !resMalformed.valid && resMalformed.errors.length === 5,
    'SEC-PATH-09', 'PathValidation',
    'Malformed and missing document/collection IDs (empty, null, whitespace, slashes) fail closed',
    `Errors count: ${resMalformed.errors.length}`
  );

  // SEC-PATH-10: Path normalization cannot bypass protected checks
  const resTraversal = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_path_traversal',
    entries: [
      { collection: 'billing', docId: '../system/counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1' } },
      { collection: 'System', docId: 'counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'billing', docId: 'RES_1001', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1' } },
      { collection: 'billing', docId: 'OP_1001', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1' } }
    ]
  });
  assertTest(
    !resTraversal.valid && resTraversal.validatedCandidates.length === 0,
    'SEC-PATH-10', 'PathValidation',
    'Path normalization (traversal ../, casing System, prefix RES_ / OP_) cannot bypass protected-path guards',
    `Validated candidates: ${resTraversal.validatedCandidates.length}, Errors: ${JSON.stringify(resTraversal.errors)}`
  );

  // SEC-PATH-11: Override flags and unexpected manifest fields fail closed
  const overrideFlags = ['overrideProtected', 'forceDelete', 'ignoreDenylist', 'bypassSafeguards', 'allowProtected', 'skipValidation', 'dryRunBypass', 'disableSafetyChecks', 'adminBypass'];
  let allOverridesBlocked = true;
  for (const flag of overrideFlags) {
    const manifestWithFlag = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `adv_flag_${flag}`,
      [flag]: true,
      entries: [{ collection: 'billing', docId: 'bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1050' } }]
    };
    const resFlag = orchestrator.validateManifest(manifestWithFlag);
    if (resFlag.valid || !resFlag.errors.some(e => e.includes('SECURITY_VIOLATION'))) {
      allOverridesBlocked = false;
      break;
    }
  }
  assertTest(
    allOverridesBlocked,
    'SEC-PATH-11', 'PathValidation',
    'All safety override and bypass flags trigger SECURITY_VIOLATION and fail closed',
    `Tested flags: ${overrideFlags.join(', ')}`
  );

  // SEC-PATH-12: Dummy classification cannot override protected denylist
  const resDummyMaster = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_dummy_master',
    entries: [{
      collection: 'settings',
      docId: 'set_1',
      classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION, // claiming to be dummy
      approvalStatus: 'trustee_approved'
    }]
  });
  assertTest(
    !resDummyMaster.valid && resDummyMaster.protectedEntries.length === 1 && resDummyMaster.validatedCandidates.length === 0,
    'SEC-PATH-12', 'PathValidation',
    'Classification as dummy transaction cannot override protected-record denylist for master records',
    `Protected entries: ${resDummyMaster.protectedEntries.length}`
  );

  // -------------------------------------------------------------------
  // GROUP 2: DEPENDENCY SAFETY TESTS
  // -------------------------------------------------------------------
  console.log('\n--- Group 2: Relational Dependency Safety Tests ---');

  // SEC-DEP-01: Bill with missing receipt is blocked
  const resBillNoRcpt = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_bill_no_rcpt',
    entries: [{ collection: 'billing', docId: 'bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  });
  assertTest(
    !resBillNoRcpt.valid && resBillNoRcpt.missingDependencies.length > 0,
    'SEC-DEP-01', 'DependencySafety',
    'Billing record with missing linked receipt specification is blocked',
    `Missing: ${JSON.stringify(resBillNoRcpt.missingDependencies)}`
  );

  // SEC-DEP-02: Bill referencing nonexistent receipt in dataset is blocked
  const fixtureWithMissingRcpt = { collections: { billing: [{ firestoreId: 'bill_1050', accountingReceiptId: 'rcpt_9999' }], receipts: [] } };
  const resBillNonexistentRcpt = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_bill_nonexistent_rcpt',
    entries: [{ collection: 'billing', docId: 'bill_1050', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_9999' } }]
  }, fixtureWithMissingRcpt);
  assertTest(
    !resBillNonexistentRcpt.valid && resBillNonexistentRcpt.missingDependencies.some(d => d.missingDocPath === 'receipts/rcpt_9999'),
    'SEC-DEP-02', 'DependencySafety',
    'Bill referencing nonexistent receipt in dataset fixture is blocked',
    `Missing dependencies: ${JSON.stringify(resBillNonexistentRcpt.missingDependencies)}`
  );

  // SEC-DEP-03: Receipt with conflicting bill references is blocked
  const fixtureConflictingLinks = {
    collections: {
      billing: [{ firestoreId: 'bill_1050', accountingReceiptId: 'rcpt_DIFF_222' }],
      receipts: [{ firestoreId: 'rcpt_1050', accountingBillId: 'bill_1050' }]
    }
  };
  const resRcptConflict = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_rcpt_conflict',
    entries: [{
      collection: 'receipts',
      docId: 'rcpt_1050',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { linkedBillId: 'bill_1050' }
    }]
  }, fixtureConflictingLinks);
  assertTest(
    !resRcptConflict.valid && resRcptConflict.dependencyConflicts.length > 0,
    'SEC-DEP-03', 'DependencySafety',
    'Receipt with conflicting reciprocal linkage to billing is blocked',
    `Conflicts: ${JSON.stringify(resRcptConflict.dependencyConflicts)}`
  );

  // SEC-DEP-04: Incomplete transfer pair is blocked
  const resIncompleteTransfer = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_incomplete_transfer',
    entries: [
      { collection: 'transfers', docId: 'trans_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { fromAcc: 'Cash in Hand', toAcc: 'Cash in Hand' } },
      { collection: 'transfers', docId: 'trans_2', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { fromAcc: 'Cash in Hand' } }
    ]
  });
  assertTest(
    !resIncompleteTransfer.valid && resIncompleteTransfer.dependencyConflicts.length === 2,
    'SEC-DEP-04', 'DependencySafety',
    'Incomplete transfer pairs (same source/target, or missing destination) are blocked',
    `Conflicts count: ${resIncompleteTransfer.dependencyConflicts.length}`
  );

  // SEC-DEP-05: Chitty transaction with inconsistent member is blocked
  const fixtureChittyMissingMember = {
    collections: {
      chittyCollections: [{ firestoreId: 'cc_1', memberId: 'cm_nonexistent' }],
      chittyMembers: [{ firestoreId: 'cm_1' }]
    }
  };
  const resChittyInconsistent = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_chitty_inconsistent',
    entries: [{
      collection: 'chittyCollections',
      docId: 'cc_1',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { memberId: 'cm_nonexistent' }
    }]
  }, fixtureChittyMissingMember);
  assertTest(
    !resChittyInconsistent.valid && resChittyInconsistent.dependencyConflicts.some(c => c.entryDocId === 'cc_1'),
    'SEC-DEP-05', 'DependencySafety',
    'Chitty transaction referencing nonexistent member is blocked',
    `Conflicts: ${JSON.stringify(resChittyInconsistent.dependencyConflicts)}`
  );

  // SEC-DEP-06: Loan repayment with missing parent loan is blocked
  const fixtureLoanMissingParent = {
    collections: {
      loans: [{ firestoreId: 'loan_repay_1', repayment: 500, parentLoanId: 'loan_parent_999' }]
    }
  };
  const resLoanInconsistent = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_loan_inconsistent',
    entries: [{
      collection: 'loans',
      docId: 'loan_repay_1',
      recordType: 'loan_repayment',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { parentLoanId: 'loan_parent_999' }
    }]
  }, fixtureLoanMissingParent);
  assertTest(
    !resLoanInconsistent.valid && resLoanInconsistent.dependencyConflicts.some(c => c.entryDocId === 'loan_repay_1'),
    'SEC-DEP-06', 'DependencySafety',
    'Loan repayment referencing nonexistent parent loan is blocked',
    `Conflicts: ${JSON.stringify(resLoanInconsistent.dependencyConflicts)}`
  );

  // SEC-DEP-07: Unknown dependency types block validation
  const resUnknownDep = orchestrator.validateManifest({
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'adv_unknown_dep',
    entries: [{
      collection: 'billing',
      docId: 'bill_1050',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { linkedReceiptId: 'rcpt_1050' },
      unknownDependencies: ['external_audit_ref_xyz']
    }]
  });
  assertTest(
    !resUnknownDep.valid && resUnknownDep.dependencyConflicts.some(c => c.unknownDependencies),
    'SEC-DEP-07', 'DependencySafety',
    'Unknown dependency types strictly block execution eligibility',
    `Conflicts: ${JSON.stringify(resUnknownDep.dependencyConflicts)}`
  );

  // -------------------------------------------------------------------
  // GROUP 3: NON-MUTATION GUARANTEES (LIVE EMULATOR TEST)
  // -------------------------------------------------------------------
  console.log('\n--- Group 3: Non-Mutation Guarantees in Live Emulator ---');

  const validManifestFixture = {
    collections: {
      billing: [{ firestoreId: 'bill_1050', totalAmount: 500, accountingReceiptId: 'rcpt_1050' }],
      receipts: [{ firestoreId: 'rcpt_1050', amount: 500, linkedBillId: 'bill_1050' }]
    }
  };
  const validManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'valid_manifest_step_33_54',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_1050',
        recordType: 'billing_record',
        classification: 'confirmed_test_transaction',
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_1050' },
        cleanupReason: 'Verified dummy billing record'
      },
      {
        collection: 'receipts',
        docId: 'rcpt_1050',
        recordType: 'receipt_record',
        classification: 'confirmed_test_transaction',
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedBillId: 'bill_1050' },
        cleanupReason: 'Verified dummy linked receipt'
      }
    ]
  };

  // SEC-MUT-01: Dry-run execution reports zero mutations
  const dryRun1 = orchestrator.dryRun(validManifest, validManifestFixture);
  assertTest(
    dryRun1.status === 'PROPOSAL_VALIDATED' &&
    dryRun1.mutationsPerformed === 0 &&
    dryRun1.writesPerformed === 0 &&
    dryRun1.deletionsPerformed === 0 &&
    dryRun1.executionMode === 'dry-run' &&
    dryRun1.executionStatus.isExecutionEnabled === false,
    'SEC-MUT-01', 'NonMutation',
    'Dry-run returns PROPOSAL_VALIDATED with exactly 0 mutations, 0 writes, 0 deletions',
    `mutationsPerformed: ${dryRun1.mutationsPerformed}, writesPerformed: ${dryRun1.writesPerformed}, deletionsPerformed: ${dryRun1.deletionsPerformed}`
  );

  // Readback from Firestore after dryRun
  let counterRead1 = null;
  let resRead1 = null;
  let opRead1 = null;
  let setRead1 = null;
  let billRead1 = null;
  if (token) {
    const r1 = await readDoc(DEMO_PROJECT, token, 'system', 'counters');
    counterRead1 = fromFirestoreFields(r1.body.fields);
    const r2 = await readDoc(DEMO_PROJECT, token, 'system', 'res_1050');
    resRead1 = fromFirestoreFields(r2.body.fields);
    const r3 = await readDoc(DEMO_PROJECT, token, 'system', 'op_bill_1050');
    opRead1 = fromFirestoreFields(r3.body.fields);
    const r4 = await readDoc(DEMO_PROJECT, token, 'settings', 'set_1');
    setRead1 = fromFirestoreFields(r4.body.fields);
    const r5 = await readDoc(DEMO_PROJECT, token, 'billing', 'bill_1050');
    billRead1 = fromFirestoreFields(r5.body.fields);
  }

  // SEC-MUT-02: Live database state remains 100% untouched after dry-run
  assertTest(
    counterRead1 && counterRead1.globalSequenceCounter === 1050 &&
    resRead1 && resRead1.status === 'active' &&
    opRead1 && opRead1.status === 'committed' &&
    setRead1 && setRead1.templeName === baselineData.settings.templeName &&
    billRead1 && billRead1.totalAmount === 500,
    'SEC-MUT-02', 'NonMutation',
    'Database records (counters, reservations, idempotency, settings, billing) are 100% unchanged after dry-run',
    `Counter GSC: ${counterRead1?.globalSequenceCounter}, Bill Amount: ${billRead1?.totalAmount}`
  );

  // SEC-MUT-03: Execute mode is strictly disabled and fails closed
  let executeErrorCaught = null;
  try {
    orchestrator.execute(validManifest);
  } catch (err) {
    executeErrorCaught = err;
  }
  assertTest(
    executeErrorCaught &&
    executeErrorCaught.code === 'EXECUTE_MODE_DISABLED' &&
    executeErrorCaught.details.mutationsPerformed === 0 &&
    executeErrorCaught.details.deletionsPerformed === 0,
    'SEC-MUT-03', 'ExecutionLockout',
    'execute() mode throws EXECUTE_MODE_DISABLED error and fails closed',
    `Error code: ${executeErrorCaught?.code}, message: ${executeErrorCaught?.message}`
  );

  // Readback after attempted execute()
  let counterRead2 = null;
  let billRead2 = null;
  if (token) {
    const r1 = await readDoc(DEMO_PROJECT, token, 'system', 'counters');
    counterRead2 = fromFirestoreFields(r1.body.fields);
    const r5 = await readDoc(DEMO_PROJECT, token, 'billing', 'bill_1050');
    billRead2 = fromFirestoreFields(r5.body.fields);
  }

  // SEC-MUT-04: Live database state remains 100% untouched after attempted execute()
  assertTest(
    counterRead2 && counterRead2.globalSequenceCounter === 1050 &&
    billRead2 && billRead2.totalAmount === 500,
    'SEC-MUT-04', 'ExecutionLockout',
    'Database remains 100% unmutated following execute() rejection',
    `Counter GSC: ${counterRead2?.globalSequenceCounter}, Bill Amount: ${billRead2?.totalAmount}`
  );

  // SEC-MUT-05: Dry-run output is deterministic
  const dryRun2 = orchestrator.dryRun(validManifest, validManifestFixture);
  assertTest(
    dryRun1.dryRunChecksum === dryRun2.dryRunChecksum && dryRun1.dryRunChecksum.length === 64,
    'SEC-MUT-05', 'Determinism',
    'Dry-run output checksum is 100% deterministic across identical runs',
    `Checksum: ${dryRun1.dryRunChecksum}`
  );

  // -------------------------------------------------------------------
  // GROUP 4: AIR-GAP ISOLATION AUDIT
  // -------------------------------------------------------------------
  console.log('\n--- Group 4: Air-Gap Isolation Audit ---');

  // SEC-AIR-01: Zero production references in execution environment
  assertTest(
    DEMO_PROJECT.startsWith('demo-') &&
    DEMO_PROJECT !== 'temple-f4f7d' &&
    EMULATOR_HOST === '127.0.0.1' &&
    FIRESTORE_PORT === 8080,
    'SEC-AIR-01', 'AirGapIsolation',
    'Test environment strictly isolated to local loopback and demo-* project namespace',
    `Project: ${DEMO_PROJECT}, Host: ${EMULATOR_HOST}:${FIRESTORE_PORT}`
  );

  // -------------------------------------------------------------------
  // Write Machine-Readable Audit Evidence JSON
  // -------------------------------------------------------------------
  const outputPath = path.join(__dirname, 'step_33_54_audit_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(auditResults, null, 2), 'utf8');
  console.log(`\nMachine-readable audit results saved to: ${outputPath}`);

  console.log('========================================================================');
  console.log(`TOTAL AUDIT CHECKS: ${auditResults.summary.total} | PASSED: ${auditResults.summary.passed} | FAILED: ${auditResults.summary.failed}`);
  console.log(`AUDIT VERDICT: ${auditResults.summary.failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================\n');

  return auditResults.summary.failed === 0;
}

runAuditSuite().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
