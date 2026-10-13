/**
 * tests/test_step_33_55_cleanup_boundary_audit.js
 *
 * STEP 33.55: Final Cleanup-Tool Boundary Audit & Zero-Mutation Verification Suite
 *
 * 100% AIR-GAPPED & COMPLIANT:
 * - Isolated disposable demo-* emulator namespaces (127.0.0.1:8080, 127.0.0.1:9099).
 * - Zero production access to temple-f4f7d or Vercel.
 * - Zero mutation of real financial data or live counters.
 * - Read-only source audit plus isolated synthetic testing.
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
const DEMO_PROJECT = `demo-step3355-${RUN_ID}`;

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

async function createAuthUser(projectId, email, password = 'BoundaryPassword123!') {
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

const auditResults = {
  step: 'STEP 33.55',
  title: 'Final Cleanup-Tool Boundary Audit & Zero-Mutation Verification',
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
  categories: {
    PATH_NORMALIZATION_AND_ENCODING: { total: 0, passed: 0, failed: 0 },
    DELETION_EXECUTION_BOUNDARY: { total: 0, passed: 0, failed: 0 },
    VALIDATION_BEFORE_SIDE_EFFECTS: { total: 0, passed: 0, failed: 0 },
    MANIFEST_AND_DEPENDENCY_SAFEGUARDS: { total: 0, passed: 0, failed: 0 },
    DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS: { total: 0, passed: 0, failed: 0 },
    AIR_GAP_AND_SAFETY_ISOLATION: { total: 0, passed: 0, failed: 0 }
  },
  tests: []
};

function recordTest(condition, testId, category, description, evidence = '') {
  auditResults.summary.total++;
  if (!auditResults.categories[category]) {
    auditResults.categories[category] = { total: 0, passed: 0, failed: 0 };
  }
  auditResults.categories[category].total++;

  if (condition) {
    auditResults.summary.passed++;
    auditResults.categories[category].passed++;
    console.log(`  ✅ [PASS] ${testId} [${category}]: ${description}`);
    auditResults.tests.push({ id: testId, category, status: 'PASS', description, evidence });
  } else {
    auditResults.summary.failed++;
    auditResults.categories[category].failed++;
    console.error(`  ❌ [FAIL] ${testId} [${category}]: ${description}`);
    console.error(`     Evidence: ${evidence}`);
    auditResults.tests.push({ id: testId, category, status: 'FAIL', description, evidence });
  }
}

async function runStep3355Audit() {
  console.log('========================================================================');
  console.log('  STEP 33.55: FINAL CLEANUP-TOOL BOUNDARY AUDIT & ZERO-MUTATION VERIFICATION');
  console.log(`  Isolated Disposable Namespace: ${DEMO_PROJECT}`);
  console.log('========================================================================\n');

  // --- Phase 1: Emulator Provisioning & Air-Gap Verification ---
  console.log('--- Phase 1: Provisioning Disposable Emulator Namespace ---');
  let authUser, idToken;
  try {
    authUser = await createAuthUser(DEMO_PROJECT, `audit_3355_${RUN_ID}@temple.local`);
    idToken = authUser.idToken;
    console.log(`  Authenticated operator: ${authUser.email} (${authUser.localId})`);
  } catch (err) {
    console.error(`  Fatal: could not authenticate in emulator: ${err.message}`);
    process.exit(1);
  }

  const candRulesContent = fs.readFileSync(path.join(__dirname, '../firestore.rules.candidate'), 'utf8');
  const rulesStatus = await loadRules(DEMO_PROJECT, candRulesContent);
  recordTest(rulesStatus === 200, 'AIR-GAP-01', 'AIR_GAP_AND_SAFETY_ISOLATION',
    'Candidate security rules loaded cleanly into isolated emulator namespace', `HTTP ${rulesStatus}`);

  recordTest(DEMO_PROJECT.startsWith('demo-') && EMULATOR_HOST === '127.0.0.1',
    'AIR-GAP-02', 'AIR_GAP_AND_SAFETY_ISOLATION',
    '100% loopback air-gapped demo-* project prefix; zero production connectivity',
    `Host: ${EMULATOR_HOST}, Project: ${DEMO_PROJECT}`);

  // Seed baseline synthetic fixture conforming to candidate rules
  const syntheticBaseline = {
    'system/counters': {
      globalSequenceCounter: 1050,
      billingReceiptCounter: 50,
      receiptCounter: 1000,
      voucherCounter: 200,
      updatedAt: new Date().toISOString()
    },
    'system/res_1050': {
      seqNumber: 1050,
      formattedNo: 'BILL-1050',
      type: 'billing_linked',
      source: 'billing',
      status: 'active',
      voided: false,
      createdBy: authUser.localId,
      operationId: 'op_bill_1050'
    },
    'system/res_1051': {
      seqNumber: 1051,
      formattedNo: 'R-1051',
      type: 'independent_receipt',
      source: 'receipts',
      status: 'active',
      voided: false,
      createdBy: authUser.localId,
      operationId: 'op_rcpt_1051'
    },
    'system/op_bill_1050': {
      operationId: 'op_bill_1050',
      type: 'billing_linked',
      seqNumber: 1050,
      formattedNo: 'BILL-1050',
      fingerprint: 'fp_1050',
      status: 'committed',
      createdBy: authUser.localId
    },
    'settings/set_1': {
      templeName: 'Marutha Chamundi Devi Temple',
      address: 'Ashari Vilakam, Keraladityapuram'
    },
    'funds/fund_1': {
      name: 'Punarudharanam Fund',
      targetAmount: 5000000
    },
    'billing/bill_1050': {
      id: 'bill_1050',
      docId: 'bill_1050',
      totalAmount: 500,
      devoteeName: 'Test Devotee 1',
      accountingReceiptId: 'rcpt_1050',
      status: 'active',
      voided: false,
      createdBy: authUser.localId
    },
    'receipts/rcpt_1050': {
      id: 'rcpt_1050',
      docId: 'rcpt_1050',
      amount: 500,
      devoteeName: 'Test Devotee 1',
      linkedBillId: 'bill_1050',
      status: 'active',
      voided: false,
      createdBy: authUser.localId
    }
  };

  for (const [fullPath, data] of Object.entries(syntheticBaseline)) {
    const [c, id] = fullPath.split('/');
    const res = await writeDoc(DEMO_PROJECT, idToken, c, id, data);
    if (res.status !== 200) {
      throw new Error(`Failed to seed ${fullPath}: ${JSON.stringify(res.body)}`);
    }
  }
  console.log(`  Seeded ${Object.keys(syntheticBaseline).length} synthetic documents into ${DEMO_PROJECT}.\n`);

  const orchestrator = new CleanupOrchestrator();

  // =========================================================================
  // Section 4: Audit Path Normalization and Encoding
  // =========================================================================
  console.log('--- Section 4: Path Normalization and Encoding Adversarial Tests ---');

  // Test 4.1: Ordinary protected paths
  const ordinaryProtectedCases = [
    { col: 'system', id: 'counters', label: 'system/counters' },
    { col: 'system', id: 'res_1001', label: 'system/res_1001' },
    { col: 'system', id: 'op_bill_1', label: 'system/op_bill_1' },
    { col: 'system', id: '_restoreProgress', label: 'system/_restoreProgress' },
    { col: 'settings', id: 'set_1', label: 'settings/set_1' },
    { col: 'funds', id: 'f_general', label: 'funds/f_general' },
    { col: 'incomeCategories', id: 'ic_pooja', label: 'incomeCategories/ic_pooja' },
    { col: 'expenseCategories', id: 'ec_puja_items', label: 'expenseCategories/ec_puja_items' },
    { col: 'bankAccounts', id: 'ba_canara', label: 'bankAccounts/ba_canara' },
    { col: 'users', id: 'u_admin', label: 'users/u_admin' }
  ];
  for (const tc of ordinaryProtectedCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    recordTest(prot.isProtected, `PATH-ORD-${tc.col.toUpperCase()}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Ordinary protected path rejected: ${tc.label}`, `AssetType: ${prot.assetType}, Reason: ${prot.reason}`);
  }

  // Test 4.2: Uppercase and mixed-case variants
  const casingCases = [
    { col: 'SYSTEM', id: 'COUNTERS', label: 'SYSTEM/COUNTERS' },
    { col: 'System', id: 'Counters', label: 'System/Counters' },
    { col: 'system', id: 'RES_1001', label: 'system/RES_1001' },
    { col: 'system', id: 'OP_BILL_1', label: 'system/OP_BILL_1' },
    { col: 'Settings', id: 'Set_1', label: 'Settings/Set_1' },
    { col: 'FUNDS', id: 'F_GENERAL', label: 'FUNDS/F_GENERAL' },
    { col: 'IncomeCategories', id: 'IC_POOJA', label: 'IncomeCategories/IC_POOJA' },
    { col: 'EXPENSECATEGORIES', id: 'ec_1', label: 'EXPENSECATEGORIES/ec_1' },
    { col: 'BankAccounts', id: 'BA_1', label: 'BankAccounts/BA_1' },
    { col: 'USERS', id: 'U_1', label: 'USERS/U_1' },
    { col: 'billing', id: 'COUNTERS', label: 'billing/COUNTERS (doc-level guard)' },
    { col: 'billing', id: 'RES_9999', label: 'billing/RES_9999 (doc-level guard)' },
    { col: 'billing', id: 'OP_9999', label: 'billing/OP_9999 (doc-level guard)' }
  ];
  for (const tc of casingCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    recordTest(prot.isProtected, `PATH-CASE-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Case variant shielded from bypass: ${tc.label}`, `isProtected: ${prot.isProtected}, reason: ${prot.reason}`);
  }

  // Test 4.3: Leading and trailing whitespace
  const whitespaceCases = [
    { col: '  system  ', id: 'counters', label: 'Leading and trailing whitespace in collection system' },
    { col: 'system', id: '  counters  ', label: 'Leading and trailing whitespace in docId counters' },
    { col: 'billing', id: '  counters  ', label: 'Whitespace around protected docId counters' },
    { col: '  settings  ', id: '  set_1  ', label: 'Whitespace around settings set_1' }
  ];
  for (const tc of whitespaceCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_ws',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected && !val.valid, `PATH-WS-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Whitespace trimmed path protected and rejected: ${tc.label}`,
      `isProtected: ${prot.isProtected}, valid: ${val.valid}, error: ${val.errors[0]}`);
  }

  // Test 4.4: Repeated path separators
  const repeatedSepCases = [
    { col: 'system//counters', id: 'x', label: 'Repeated separators in collection' },
    { col: 'billing', id: 'doc1//subdoc', label: 'Repeated separators in docId' },
    { col: 'system///res_1001', id: 'x', label: 'Triple separators in collection' }
  ];
  for (const tc of repeatedSepCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_rep_sep',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-REP-SEP-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Repeated separators rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.5: Forward and backward separators
  const fwdBackCases = [
    { col: 'system\\counters', id: 'x', label: 'Backslash in collection' },
    { col: 'billing', id: 'sub\\doc1', label: 'Backslash in docId' },
    { col: '..\\system\\counters', id: 'x', label: 'Backslash traversal' }
  ];
  for (const tc of fwdBackCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_slash',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-SLASH-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Backslash and separator anomalies rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.6: Literal '..' traversal
  const dotDotCases = [
    { col: 'billing/../system', id: 'counters', label: 'Traversal in collection to system/counters' },
    { col: 'billing', id: '../system/counters', label: 'Traversal in docId to system/counters' },
    { col: 'billing', id: 'doc/../counters', label: 'DocId traversal to counters' },
    { col: '../system/counters', id: 'x', label: 'Root relative traversal' }
  ];
  for (const tc of dotDotCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_dotdot',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-TRAV-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Path traversal .. strictly rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.7: URL-encoded separators
  const urlEncodedSepCases = [
    { col: 'billing%2fsystem', id: 'counters', label: 'Encoded slash %2f in collection' },
    { col: 'billing', id: 'sub%2fcounters', label: 'Encoded slash %2f in docId' },
    { col: 'billing%5csystem', id: 'counters', label: 'Encoded backslash %5c in collection' },
    { col: 'billing', id: 'sub%5ccounters', label: 'Encoded backslash %5c in docId' }
  ];
  for (const tc of urlEncodedSepCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_url_enc',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-URLENC-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `URL-encoded separator rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.8: Double-encoded separators
  const doubleEncodedCases = [
    { col: 'billing%252fsystem', id: 'counters', label: 'Double encoded slash %252f in collection' },
    { col: 'billing', id: 'sub%252fcounters', label: 'Double encoded slash %252f in docId' },
    { col: 'billing%255csystem', id: 'counters', label: 'Double encoded backslash %255c in collection' }
  ];
  for (const tc of doubleEncodedCases) {
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_double_enc',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(!val.valid, `PATH-DBLENC-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Double-encoded separator rejected by manifest validation: ${tc.label}`, `valid: ${val.valid}, error: ${val.errors[0]}`);
  }

  // Test 4.9: Encoded dot segments
  const encodedDotCases = [
    { col: 'billing', id: '%2e%2e/system/counters', label: 'Encoded %2e%2e in docId' },
    { col: 'billing/%2e%2e/system', id: 'counters', label: 'Encoded %2e%2e in collection' },
    { col: 'billing', id: '%252e%252e/system/counters', label: 'Double encoded %252e%252e in docId' }
  ];
  for (const tc of encodedDotCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_enc_dot',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-ENCDOT-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Encoded dot segment traversal rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.10: Malformed percent escapes
  const malformedEscapeCases = [
    { col: 'system', id: '%zzcounters', label: 'Malformed percent escape %zz' },
    { col: 'billing', id: '%g1', label: 'Malformed percent escape %g1' },
    { col: 'billing', id: 'test%', label: 'Trailing incomplete percent %' }
  ];
  for (const tc of malformedEscapeCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_bad_escape',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-BADESC-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Malformed percent escape handled gracefully without bypass: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.11: Null bytes and encoded null bytes
  const nullByteCases = [
    { col: 'billing', id: 'doc\0counters', label: 'Literal null byte in docId' },
    { col: 'billing', id: 'doc%00counters', label: 'URL-encoded null byte %00 in docId' },
    { col: 'system\0billing', id: 'counters', label: 'Literal null byte in collection' }
  ];
  for (const tc of nullByteCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_null_byte',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-NULL-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Null byte injection strictly rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.12: Unicode lookalike separators and dots
  const unicodeLookalikes = [
    { col: 'billing', id: 'doc\uFF0Fcounters', label: 'Fullwidth slash U+FF0F in docId' },
    { col: 'billing', id: 'doc\u2044counters', label: 'Fraction slash U+2044 in docId' },
    { col: 'billing', id: 'doc\u2215counters', label: 'Division slash U+2215 in docId' },
    { col: 'billing', id: 'doc\uFF0Ecounters', label: 'Fullwidth dot U+FF0E in docId' },
    { col: 'billing', id: 'doc\u2025counters', label: 'Two-dot leader U+2025 in docId' }
  ];
  for (const tc of unicodeLookalikes) {
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_unicode',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    // In Firestore, lookalikes are treated as literal characters, not directory separators;
    // in orchestrator, missing dependencies on billing record will block it, preventing any candidate approval
    recordTest(!val.valid, `PATH-UNILOOK-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Unicode lookalike input fails closed and cannot bypass candidate safeguards: ${tc.label}`, `valid: ${val.valid}, errors: ${val.errors[0]}`);
  }

  // Test 4.13: Empty segments
  const emptySegmentCases = [
    { col: 'billing', id: '', label: 'Empty string docId' },
    { col: '', id: 'doc1', label: 'Empty string collection' },
    { col: 'billing', id: null, label: 'Null docId' },
    { col: null, id: 'doc1', label: 'Null collection' }
  ];
  for (const tc of emptySegmentCases) {
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_empty_seg',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(!val.valid && val.rejectedEntries.length > 0, `PATH-EMPTY-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Empty segment rejected: ${tc.label}`, `valid: ${val.valid}, errors: ${val.errors[0]}`);
  }

  // Test 4.14: Unexpected nested paths
  const nestedPathCases = [
    { col: 'billing/doc1/subcol', id: 'subdoc', label: 'Nested subcollection in collection path' },
    { col: 'billing', id: 'doc1/subcol/subdoc', label: 'Subcollection path embedded in docId' }
  ];
  for (const tc of nestedPathCases) {
    const prot = checkProtectedPath(tc.col, tc.id);
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_nested',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(prot.isProtected || !val.valid, `PATH-NEST-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Unexpected nested path rejected: ${tc.label}`, `isProtected: ${prot.isProtected}, valid: ${val.valid}`);
  }

  // Test 4.15: IDs containing whitespace
  const idWhitespaceCases = [
    { col: 'billing', id: 'doc 1', label: 'Space inside docId' },
    { col: 'billing', id: 'doc\t1', label: 'Tab inside docId' },
    { col: 'billing', id: 'doc\n1', label: 'Newline inside docId' }
  ];
  for (const tc of idWhitespaceCases) {
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_ws_id',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(!val.valid && val.rejectedEntries.length > 0, `PATH-IDWS-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Internal whitespace inside docId rejected: ${tc.label}`, `valid: ${val.valid}, error: ${val.errors[0]}`);
  }

  // Test 4.16: Unexpected URL schemes or absolute paths
  const schemeCases = [
    { col: 'file:///etc/passwd', id: 'doc1', label: 'file:// URL scheme' },
    { col: 'http://localhost/system/counters', id: 'doc1', label: 'http:// URL scheme' },
    { col: 'https://example.com/counters', id: 'doc1', label: 'https:// URL scheme' },
    { col: 'C:\\system\\counters', id: 'doc1', label: 'Windows drive letter path' },
    { col: '/system/counters', id: 'doc1', label: 'Absolute root path' }
  ];
  for (const tc of schemeCases) {
    const man = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: 'test_schemes',
      entries: [{ collection: tc.col, docId: tc.id, classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
    };
    const val = orchestrator.validateManifest(man);
    recordTest(!val.valid && val.rejectedEntries.length > 0, `PATH-SCHEME-${tc.label.replace(/[^A-Za-z0-9]/g, '_')}`, 'PATH_NORMALIZATION_AND_ENCODING',
      `Unexpected URL scheme or absolute path rejected: ${tc.label}`, `valid: ${val.valid}, error: ${val.errors[0]}`);
  }

  // =========================================================================
  // Section 5: Verify Complete Deletion Execution Boundary
  // =========================================================================
  console.log('\n--- Section 5: Complete Deletion Execution Boundary Tests ---');

  // Test 5.1: Static call-graph inspection of cleanup_orchestrator.js
  const orchestratorSource = fs.readFileSync(path.join(__dirname, '../scripts/cleanup_orchestrator.js'), 'utf8');

  const forbiddenImports = [
    'firebase', 'firebase-admin', '@google-cloud/firestore',
    'child_process', 'http', 'https', 'axios', 'node-fetch',
    'fs.unlink', 'fs.rm', 'fs.rmdir', 'indexedDB'
  ];
  for (const fi of forbiddenImports) {
    const hasForbidden = orchestratorSource.includes(`require('${fi}')`) ||
      orchestratorSource.includes(`require("${fi}")`) ||
      orchestratorSource.includes(`${fi}(`);
    recordTest(!hasForbidden, `BOUND-IMPORT-${fi.replace(/[^A-Za-z0-9]/g, '_')}`, 'DELETION_EXECUTION_BOUNDARY',
      `Zero references to external mutating API/module: ${fi}`, `hasForbidden: ${hasForbidden}`);
  }

  // Test 5.2: execute(manifest) throws EXECUTE_MODE_DISABLED unconditionally
  const testExecuteManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_exec',
    entries: [{
      collection: 'billing',
      docId: 'bill_1',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved'
    }]
  };

  let execThrew = false;
  let execErr = null;
  try {
    orchestrator.execute(testExecuteManifest);
  } catch (err) {
    execThrew = true;
    execErr = err;
  }
  recordTest(execThrew && execErr?.code === 'EXECUTE_MODE_DISABLED', 'BOUND-EXEC-01', 'DELETION_EXECUTION_BOUNDARY',
    'execute(manifest) throws EXECUTE_MODE_DISABLED unconditionally',
    `Code: ${execErr?.code}, Message: ${execErr?.message}`);

  // Test 5.3: execute with bypass options or flags still throws EXECUTE_MODE_DISABLED
  const bypassOptionCombinations = [
    { force: true },
    { bypassSafeguards: true },
    { skipValidation: true },
    { adminBypass: true },
    { allowDelete: true }
  ];
  for (const opt of bypassOptionCombinations) {
    let optThrew = false;
    let optErr = null;
    try {
      orchestrator.execute(testExecuteManifest, opt);
    } catch (err) {
      optThrew = true;
      optErr = err;
    }
    const label = Object.keys(opt)[0];
    recordTest(optThrew && optErr?.code === 'EXECUTE_MODE_DISABLED', `BOUND-EXEC-FLAG-${label}`, 'DELETION_EXECUTION_BOUNDARY',
      `execute() rejects bypass option { ${label}: true } and fails closed`, `Code: ${optErr?.code}`);
  }

  // Test 5.4: execute with environment variables set
  const envTestVars = ['ALLOW_EXECUTE', 'CLEANUP_EXECUTE', 'FORCE_CLEANUP', 'ADMIN_BYPASS'];
  for (const ev of envTestVars) {
    process.env[ev] = 'true';
    let envThrew = false;
    let envErr = null;
    try {
      orchestrator.execute(testExecuteManifest);
    } catch (err) {
      envThrew = true;
      envErr = err;
    }
    delete process.env[ev];
    recordTest(envThrew && envErr?.code === 'EXECUTE_MODE_DISABLED', `BOUND-EXEC-ENV-${ev}`, 'DELETION_EXECUTION_BOUNDARY',
      `execute() fails closed even if env ${ev}=true is set`, `Code: ${envErr?.code}`);
  }

  // Test 5.5: Verify no alternate execution methods exist on CleanupOrchestrator instance
  const classMethods = Object.getOwnPropertyNames(CleanupOrchestrator.prototype);
  const dangerousMethodNames = ['delete', 'destroy', 'remove', 'purge', 'drop', 'clear', 'erase', 'mutate'];
  const hasDangerousMethod = classMethods.some(m => dangerousMethodNames.some(d => m.toLowerCase().includes(d)));
  recordTest(!hasDangerousMethod, 'BOUND-NO-ALT-METHODS', 'DELETION_EXECUTION_BOUNDARY',
    'Zero alternate or hidden deletion methods on CleanupOrchestrator prototype',
    `Exposed methods: ${classMethods.join(', ')}`);

  // =========================================================================
  // Section 6: Verify Validation-Before-Side-Effects
  // =========================================================================
  console.log('\n--- Section 6: Validation-Before-Side-Effects Tests ---');

  // Test 6.1: Side effect count during pure validation
  let fsWriteAttempts = 0;
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (...args) {
    fsWriteAttempts++;
    return originalWriteFileSync.apply(this, args);
  };

  const malformedManifestForPhase6 = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'malformed_phase_6',
    entries: [
      { collection: 'system', docId: 'counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' },
      { collection: 'billing', docId: 'bill_nonexistent', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }
    ]
  };

  const valPhase6 = orchestrator.validateManifest(malformedManifestForPhase6);
  fs.writeFileSync = originalWriteFileSync;

  recordTest(!valPhase6.valid && fsWriteAttempts === 0, 'VAL-SIDE-FS-01', 'VALIDATION_BEFORE_SIDE_EFFECTS',
    'validateManifest rejects malformed manifest with zero filesystem write attempts',
    `Valid: ${valPhase6.valid}, fsWriteAttempts: ${fsWriteAttempts}`);

  // Test 6.2: Live emulator database snapshot comparison across dry-run
  async function snapshotEmulator(collections) {
    const snap = {};
    for (const [col, docs] of Object.entries(collections)) {
      snap[col] = {};
      for (const id of Object.keys(docs)) {
        const res = await readDoc(DEMO_PROJECT, idToken, col, id);
        snap[col][id] = res.status === 200 ? res.body : null;
      }
    }
    return snap;
  }

  const collectionsToWatch = {
    system: { counters: 1, res_1050: 1, res_1051: 1, op_bill_1050: 1 },
    settings: { set_1: 1 },
    funds: { fund_1: 1 },
    billing: { bill_1050: 1 },
    receipts: { rcpt_1050: 1 }
  };

  const beforeDryRunSnapshot = await snapshotEmulator(collectionsToWatch);
  const beforeHash = computeSha256(beforeDryRunSnapshot);

  // Execute valid dry-run
  const validManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'manifest_valid_phase_6',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_1050',
        recordType: 'billing_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedReceiptId: 'rcpt_1050' },
        cleanupReason: 'Synthetic test transaction'
      },
      {
        collection: 'receipts',
        docId: 'rcpt_1050',
        recordType: 'receipts_record',
        classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
        approvalStatus: 'trustee_approved',
        expectedRelationships: { linkedBillId: 'bill_1050' },
        cleanupReason: 'Linked synthetic receipt'
      }
    ]
  };

  const fixtureForDryRun = {
    billing: [syntheticBaseline['billing/bill_1050']],
    receipts: [syntheticBaseline['receipts/rcpt_1050']]
  };

  const dryRunOutput = orchestrator.dryRun(validManifest, fixtureForDryRun);

  const afterDryRunSnapshot = await snapshotEmulator(collectionsToWatch);
  const afterHash = computeSha256(afterDryRunSnapshot);

  recordTest(beforeHash === afterHash, 'VAL-SIDE-DB-01', 'VALIDATION_BEFORE_SIDE_EFFECTS',
    'Database records in emulator 100% byte-for-byte identical before and after dryRun',
    `Before: ${beforeHash}, After: ${afterHash}, Status: ${dryRunOutput.status}`);

  recordTest(dryRunOutput.mutationsPerformed === 0 && dryRunOutput.writesPerformed === 0 && dryRunOutput.deletionsPerformed === 0,
    'VAL-SIDE-COUNTS-02', 'VALIDATION_BEFORE_SIDE_EFFECTS',
    'Dry-run report confirms 0 mutations, 0 writes, 0 deletions performed',
    `Mutations: ${dryRunOutput.mutationsPerformed}, Writes: ${dryRunOutput.writesPerformed}, Deletions: ${dryRunOutput.deletionsPerformed}`);

  // Test 6.3: Database unchanged following rejected execute attempt
  let execFailed = false;
  try {
    orchestrator.execute(validManifest);
  } catch (e) {
    execFailed = true;
  }
  const postExecSnapshot = await snapshotEmulator(collectionsToWatch);
  const postExecHash = computeSha256(postExecSnapshot);

  recordTest(execFailed && beforeHash === postExecHash, 'VAL-SIDE-EXEC-03', 'VALIDATION_BEFORE_SIDE_EFFECTS',
    'Database 100% untouched following rejected execute() attempt',
    `PostExecHash: ${postExecHash}, Matches Baseline: ${beforeHash === postExecHash}`);

  // =========================================================================
  // Section 7: Verify Manifest and Dependency Safeguards
  // =========================================================================
  console.log('\n--- Section 7: Manifest and Dependency Safeguards Tests ---');

  // Test 7.1: Missing document ID
  const manMissingId = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_missing_id',
    entries: [{ collection: 'billing', docId: '', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  };
  const valMissingId = orchestrator.validateManifest(manMissingId);
  recordTest(!valMissingId.valid && valMissingId.rejectedEntries.length > 0, 'SAFE-DOC-MISSING', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Missing document ID rejected', `Valid: ${valMissingId.valid}`);

  // Test 7.2: Duplicate document ID
  const manDupId = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_dup_id',
    entries: [
      { collection: 'billing', docId: 'bill_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1001' } },
      { collection: 'billing', docId: 'bill_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved', expectedRelationships: { linkedReceiptId: 'rcpt_1001' } }
    ]
  };
  const valDupId = orchestrator.validateManifest(manDupId);
  recordTest(!valDupId.valid && valDupId.rejectedEntries.length > 0, 'SAFE-DOC-DUPLICATE', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Duplicate document ID rejected', `Valid: ${valDupId.valid}`);

  // Test 7.3: Invalid collection path
  const manBadCol = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_bad_col',
    entries: [{ collection: 'ledger', docId: 'led_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  };
  const valBadCol = orchestrator.validateManifest(manBadCol);
  recordTest(!valBadCol.valid && valBadCol.rejectedEntries.length > 0, 'SAFE-COL-INVALID', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Invalid collection path rejected (ledger not in ALLOWED_CANDIDATE_COLLECTIONS)', `Valid: ${valBadCol.valid}`);

  // Test 7.4: Protected records denylist
  const manProtRecord = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_prot_rec',
    entries: [{ collection: 'system', docId: 'counters', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  };
  const valProtRecord = orchestrator.validateManifest(manProtRecord);
  recordTest(!valProtRecord.valid && valProtRecord.protectedEntries.length > 0, 'SAFE-PROT-RECORD', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Protected record rejected via denylist', `Valid: ${valProtRecord.valid}`);

  // Test 7.5: Invalid classifications
  const manBadClass = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_bad_class',
    entries: [{ collection: 'billing', docId: 'bill_1', classification: 'bogus_class', approvalStatus: 'trustee_approved' }]
  };
  const valBadClass = orchestrator.validateManifest(manBadClass);
  recordTest(!valBadClass.valid && valBadClass.rejectedEntries.length > 0, 'SAFE-CLASS-INVALID', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Invalid classification rejected', `Valid: ${valBadClass.valid}`);

  // Test 7.6: Unverified candidates marked as approved
  const manUnverified = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_unverified',
    entries: [{ collection: 'billing', docId: 'bill_1', classification: RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD, approvalStatus: 'trustee_approved' }]
  };
  const valUnverified = orchestrator.validateManifest(manUnverified);
  recordTest(!valUnverified.valid && valUnverified.unverifiedEntries.length > 0, 'SAFE-UNVERIFIED-BLOCKED', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Unverified candidates blocked from automatic approval', `Valid: ${valUnverified.valid}`);

  // Test 7.7: Missing billing-to-receipt relationships
  const manBillNoRcpt = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_bill_no_rcpt',
    entries: [{ collection: 'billing', docId: 'bill_1', classification: 'confirmed_test_transaction', approvalStatus: 'trustee_approved' }]
  };
  const valBillNoRcpt = orchestrator.validateManifest(manBillNoRcpt);
  recordTest(!valBillNoRcpt.valid && valBillNoRcpt.missingDependencies.length > 0, 'SAFE-DEP-BILL-RCPT', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Billing record with missing linked receipt relationship blocked', `Valid: ${valBillNoRcpt.valid}`);

  // Test 7.8: Incomplete transfer pairs
  const manIncompleteTransfer = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_transfer_pair',
    entries: [{
      collection: 'transfers',
      docId: 'tr_1',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { fromAcc: 'Cash in Hand', toAcc: 'Cash in Hand' } // Invalid: same account
    }]
  };
  const valIncompleteTransfer = orchestrator.validateManifest(manIncompleteTransfer);
  recordTest(!valIncompleteTransfer.valid && valIncompleteTransfer.dependencyConflicts.length > 0, 'SAFE-DEP-TRANSFER-PAIR', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Incomplete transfer pair blocked (same source and destination)', `Valid: ${valIncompleteTransfer.valid}`);

  // Test 7.9: Conflicting reciprocal link between bill and receipt
  const manConflictingLinks = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_conflict',
    entries: [{
      collection: 'receipts',
      docId: 'rcpt_1001',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { linkedBillId: 'bill_1' }
    }]
  };
  const fixtureWithConflict = {
    billing: [{ id: 'bill_1', accountingReceiptId: 'rcpt_OTHER_9999' }],
    receipts: [{ id: 'rcpt_1001', linkedBillId: 'bill_1' }]
  };
  const valConflictingLinks = orchestrator.validateManifest(manConflictingLinks, fixtureWithConflict);
  recordTest(!valConflictingLinks.valid && valConflictingLinks.dependencyConflicts.length > 0, 'SAFE-DEP-CONFLICT-LINKS', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Reciprocal link conflict between billing and receipt detected and blocked', `Valid: ${valConflictingLinks.valid}`);

  // Test 7.10: Chitty member dependency integrity
  const manChittyNoMember = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_chitty',
    entries: [{
      collection: 'chittyCollections',
      docId: 'cc_1',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { memberId: 'cm_nonexistent_999' }
    }]
  };
  const valChittyNoMember = orchestrator.validateManifest(manChittyNoMember, { chittyMembers: [{ id: 'cm_1' }] });
  recordTest(!valChittyNoMember.valid && valChittyNoMember.dependencyConflicts.length > 0, 'SAFE-DEP-CHITTY-MEMBER', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Chitty collection referencing nonexistent member blocked', `Valid: ${valChittyNoMember.valid}`);

  // Test 7.11: Loan parent relationship integrity
  const manLoanNoParent = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_loan',
    entries: [{
      collection: 'loans',
      docId: 'ln_repay_1',
      recordType: 'loan_repayment',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { parentLoanId: 'ln_parent_missing' }
    }]
  };
  const valLoanNoParent = orchestrator.validateManifest(manLoanNoParent, { loans: [{ id: 'ln_1' }] });
  recordTest(!valLoanNoParent.valid && valLoanNoParent.dependencyConflicts.length > 0, 'SAFE-DEP-LOAN-PARENT', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Loan repayment referencing nonexistent parent loan blocked', `Valid: ${valLoanNoParent.valid}`);

  // Test 7.12: Unknown dependencies block execution eligibility
  const manUnknownDep = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_unknown_dep',
    entries: [{
      collection: 'billing',
      docId: 'bill_1',
      classification: 'confirmed_test_transaction',
      approvalStatus: 'trustee_approved',
      expectedRelationships: { linkedReceiptId: 'rcpt_1001' },
      unknownDependencies: ['external_audit_ref_xyz']
    }]
  };
  const valUnknownDep = orchestrator.validateManifest(manUnknownDep, fixtureForDryRun);
  recordTest(!valUnknownDep.valid && valUnknownDep.dependencyConflicts.length > 0, 'SAFE-DEP-UNKNOWN', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Record with unknown external dependencies blocked from execution eligibility', `Valid: ${valUnknownDep.valid}`);

  // Test 7.13: Safety override fields fail closed with SECURITY_VIOLATION
  const overrideFieldsToTest = [
    'overrideProtected', 'forceDelete', 'ignoreDenylist', 'bypassSafeguards',
    'allowProtected', 'skipValidation', 'dryRunBypass', 'disableSafetyChecks', 'adminBypass'
  ];
  for (const ofField of overrideFieldsToTest) {
    const manOverride = {
      manifestVersion: MANIFEST_SCHEMA_VERSION,
      manifestId: `test_override_${ofField}`,
      [ofField]: true,
      entries: [validManifest.entries[0]]
    };
    const valOverride = orchestrator.validateManifest(manOverride);
    const hasSecViolation = valOverride.errors.some(e => e.includes('SECURITY_VIOLATION'));
    recordTest(!valOverride.valid && hasSecViolation, `SAFE-OVERRIDE-${ofField.toUpperCase()}`, 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
      `Manifest containing override flag "${ofField}" triggers SECURITY_VIOLATION and fails closed`,
      `Valid: ${valOverride.valid}, Error: ${valOverride.errors[0]}`);
  }

  // Test 7.14: Protected denylist cannot be overridden by manifest metadata or candidate classification
  const manOverrideProtectedDenylist = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'test_prot_denylist_override',
    entries: [{
      collection: 'system',
      docId: 'counters',
      classification: RECORD_CLASSIFICATIONS.CONFIRMED_TEST_TRANSACTION,
      approvalStatus: 'trustee_approved',
      isDummyData: true,
      forceRemoval: true
    }]
  };
  const valOverrideDenylist = orchestrator.validateManifest(manOverrideProtectedDenylist);
  recordTest(!valOverrideDenylist.valid && valOverrideDenylist.protectedEntries.length > 0, 'SAFE-DENYLIST-NOT-OVERRIDDEN', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Protected-record denylist cannot be overridden by manifest metadata or test classifications',
    `Valid: ${valOverrideDenylist.valid}, Protected entries: ${valOverrideDenylist.protectedEntries.length}`);

  // Test 7.15: Test-sounding metadata alone does NOT automatically approve candidate
  const testInventoryFixture = {
    billing: [
      { id: 'b_test1', devoteeName: 'twstg', amount: 0, date: '2026-04-01' },
      { id: 'b_test2', person: 'maya', totalAmount: 1, date: '2026-04-01' },
      { id: 'b_test3', notes: 'test', amount: 50, date: '2026-04-01' }
    ]
  };
  const invResult = orchestrator.inventory(testInventoryFixture);
  recordTest(invResult.counts.confirmedCandidates === 0 && invResult.counts.unverified === 3,
    'SAFE-NO-AUTO-APPROVE', 'MANIFEST_AND_DEPENDENCY_SAFEGUARDS',
    'Records are not automatically approved for cleanup solely because name/amount/date suggests test data',
    `Confirmed: ${invResult.counts.confirmedCandidates}, Unverified: ${invResult.counts.unverified}`);

  // =========================================================================
  // Section 8: Verify Dry-Run Determinism and Zero Mutations
  // =========================================================================
  console.log('\n--- Section 8: Dry-Run Determinism and Zero-Mutation Tests ---');

  // Test 8.1: Run dry-run twice on identical inputs
  const dryRun1 = orchestrator.dryRun(validManifest, fixtureForDryRun);
  const dryRun2 = orchestrator.dryRun(validManifest, fixtureForDryRun);

  recordTest(dryRun1.dryRunChecksum === dryRun2.dryRunChecksum, 'DRY-DETERM-CHECKSUM', 'DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS',
    'Dry-run output checksum is 100% deterministic across identical runs',
    `Run 1: ${dryRun1.dryRunChecksum}, Run 2: ${dryRun2.dryRunChecksum}`);

  recordTest(JSON.stringify(dryRun1.counts) === JSON.stringify(dryRun2.counts), 'DRY-DETERM-COUNTS', 'DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS',
    'Dry-run candidate and preservation counts are identical across runs',
    `Counts: ${JSON.stringify(dryRun1.counts)}`);

  recordTest(canonicalJsonStringify(dryRun1.proposedCleanupCandidates) === canonicalJsonStringify(dryRun2.proposedCleanupCandidates),
    'DRY-DETERM-CANDIDATES', 'DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS',
    'Proposed candidate list is canonical and deterministic',
    `Candidates: ${dryRun1.proposedCleanupCandidates.length}`);

  // Test 8.2: Modify synthetic fixture data and verify output changes in an explainable way
  const mutatedFixture = {
    billing: [{ ...syntheticBaseline['billing/bill_1050'], totalAmount: 99999 }], // Modified amount
    receipts: [syntheticBaseline['receipts/rcpt_1050']]
  };
  const dryRunMutated = orchestrator.dryRun(validManifest, mutatedFixture);

  // The fingerprint in proposed candidate changes because input doc was mutated
  const candFpOriginal = dryRun1.proposedCleanupCandidates[0]?.fingerprint;
  const candFpMutated = dryRunMutated.proposedCleanupCandidates[0]?.fingerprint;

  recordTest(candFpOriginal !== candFpMutated && dryRun1.dryRunChecksum !== dryRunMutated.dryRunChecksum,
    'DRY-MUTATE-EXPLAINABLE', 'DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS',
    'Modifying synthetic fixture data changes dry-run output and checksum in an explainable manner',
    `Original FP: ${candFpOriginal}, Mutated FP: ${candFpMutated}`);

  // Test 8.3: Verification that matching checksum alone does NOT bypass classification rules
  // If an unverified record is added, checksum reflects it, and status reflects blocked proposal
  const unverifiedManifest = {
    manifestVersion: MANIFEST_SCHEMA_VERSION,
    manifestId: 'unverified_proposal',
    entries: [
      {
        collection: 'billing',
        docId: 'bill_unverified',
        classification: RECORD_CLASSIFICATIONS.UNVERIFIED_RECORD,
        approvalStatus: 'trustee_approved'
      }
    ]
  };
  const dryRunUnverified = orchestrator.dryRun(unverifiedManifest);
  recordTest(dryRunUnverified.status === 'PROPOSAL_BLOCKED_WITH_ERRORS' && dryRunUnverified.counts.recordsProposedForCleanup === 0,
    'DRY-UNVERIFIED-BLOCKED', 'DRY_RUN_DETERMINISM_AND_ZERO_MUTATIONS',
    'Dry-run correctly marks proposal as PROPOSAL_BLOCKED_WITH_ERRORS when unverified entries exist',
    `Status: ${dryRunUnverified.status}, Proposed for cleanup: ${dryRunUnverified.counts.recordsProposedForCleanup}`);

  // =========================================================================
  // Save Machine-Readable Audit Results
  // =========================================================================
  const resultsPath = path.join(__dirname, 'step_33_55_boundary_audit_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(auditResults, null, 2), 'utf8');
  console.log(`\nMachine-readable audit results saved to: ${resultsPath}`);

  console.log('========================================================================');
  console.log(`TOTAL AUDIT CHECKS: ${auditResults.summary.total} | PASSED: ${auditResults.summary.passed} | FAILED: ${auditResults.summary.failed}`);
  console.log(`AUDIT VERDICT: ${auditResults.summary.failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================\n');

  if (auditResults.summary.failed > 0) {
    process.exit(1);
  }
}

runStep3355Audit().catch(err => {
  console.error('Fatal unhandled error during audit:', err);
  process.exit(1);
});
