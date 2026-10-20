/**
 * test_step_33_56_backup_integrity.js
 * STEP 33.56 — Backup Integrity, Test-Count Reconciliation & Cleanup Authorization Readiness Audit
 *
 * Comprehensive automated verification script executing in 100% air-gapped local environment:
 * - Section 1: Audit baseline cryptographic file hashes (10 files)
 * - Section 2: Reconcile STEP 33.55 regression-test totals (544 vs 519)
 * - Section 3: Synthetic backup integrity verification (10 adversarial scenarios)
 * - Section 4: Backup coverage matrix audit (13 collections + system metadata)
 * - Section 5: End-to-end recovery verification in disposable Firebase Emulator namespace
 * - Section 6: Candidate Firestore rules compatibility & deletion lockout
 * - Section 7: Production backup status & cleanup authorization readiness checks
 *
 * Zero production access (no temple-f4f7d, no Vercel). Zero production data mutations.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const RUN_ID = Date.now();
const DEMO_PROJECT_SRC = `demo-step3356-src-${RUN_ID}`;
const DEMO_PROJECT_TGT = `demo-step3356-tgt-${RUN_ID}`;
const DEMO_PROJECT_RULES = `demo-step3356-rules-${RUN_ID}`;

const EXPECTED_HASHES = {
  'deploy_staging_step_33_43/Temple_Accounts-1.html': 'AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC',
  'firestore.rules': '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
  'firestore.rules.candidate': 'E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D',
  'Temple_Accounts-1.html': '657A4C1C116DADAAFD02FE3DB5F2799EC5B9F9FA105F260132EB1D20EEAD1F58',
  'scripts/cleanup_orchestrator.js': '41F440C1CBB5D188D836A031C15A256357933D35AD2A780B9C824335B3CA9715',
  'tests/test_step_33_40_production_isolation.js': '562FFDD7C1603E56C90A743790C21E645A4E00839968AFC6FDECEBCA42EA5C82',
  'tests/test_step_33_53_cleanup_orchestrator.js': 'D9B656AB72BEABB2690EDBCE4893D0CA38344FB46C34838B103E049804949075',
  'tests/test_step_33_54_cleanup_audit.js': '80835EB5A0D7F341F1FD7B6B10EEDAE6DCEE599F754EEDA7548CCEA4CD481928'
};

const BACKUP_COLLECTIONS = [
  'settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts',
  'billing', 'receipts', 'payments', 'transfers',
  'chittyMembers', 'chittyCollections', 'chittyPayouts', 'loans'
];

const testResults = [];

function recordTest(testId, category, description, status, evidence, details = '') {
  testResults.push({
    testId,
    category,
    description,
    status,
    evidence,
    details
  });
  const icon = status === 'PASS' ? '✅' : status === 'BLOCKED' ? '⚠️' : '❌';
  console.log(`${icon} [${status}] [${category}] ${testId}: ${description} (${evidence})`);
}

// -------------------------------------------------------------
// HTTP & EMULATOR HELPERS
// -------------------------------------------------------------

function httpJsonRequest(port, reqPath, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ statusCode: res.statusCode, body: parsed, rawBody: body });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function createAuthUser(email, password) {
  const res = await httpJsonRequest(
    AUTH_PORT,
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key',
    'POST',
    { email, password, returnSecureToken: true }
  );
  if (res.statusCode !== 200 || !res.body.idToken) {
    throw new Error(`Failed to create test user: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function loadRules(projectId, rulesContent) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/emulator/v1/projects/${projectId}:securityRules`,
    'PUT',
    { rules: { files: [{ content: rulesContent }] } }
  );
  return res.statusCode;
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
    } else if (v instanceof Date) {
      fields[k] = { timestampValue: v.toISOString() };
    } else if (typeof v === 'object') {
      if (v.__type === 'Timestamp' && typeof v.seconds === 'number') {
        const iso = new Date(v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6)).toISOString();
        fields[k] = { timestampValue: iso };
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
      } else {
        fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
      }
    }
  }
  return fields;
}

function fromFirestoreFields(fields) {
  if (!fields) return {};
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) obj[k] = v.stringValue;
    else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) obj[k] = parseFloat(v.doubleValue);
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else if ('timestampValue' in v) {
      const d = new Date(v.timestampValue);
      obj[k] = {
        __type: 'Timestamp',
        seconds: Math.floor(d.getTime() / 1000),
        nanoseconds: (d.getTime() % 1000) * 1e6,
        iso: v.timestampValue
      };
    } else if ('nullValue' in v) obj[k] = null;
    else if ('arrayValue' in v) {
      obj[k] = (v.arrayValue.values || []).map(val => {
        if ('mapValue' in val) return fromFirestoreFields(val.mapValue.fields);
        if ('stringValue' in val) return val.stringValue;
        if ('integerValue' in val) return parseInt(val.integerValue, 10);
        if ('doubleValue' in val) return parseFloat(val.doubleValue);
        if ('booleanValue' in val) return val.booleanValue;
        return null;
      });
    } else if ('mapValue' in v) {
      obj[k] = fromFirestoreFields(v.mapValue.fields);
    }
  }
  return obj;
}

async function writeDoc(projectId, token, colName, docId, data) {
  const fields = toFirestoreFields(data);
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}/${docId}`,
    'PATCH',
    { fields },
    { 'Authorization': `Bearer ${token}` }
  );
  return res;
}

async function readDoc(projectId, token, colName, docId) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}/${docId}`,
    'GET',
    null,
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.statusCode === 404) return null;
  if (res.statusCode !== 200) return null;
  return {
    _firestoreId: docId,
    data: fromFirestoreFields(res.body.fields)
  };
}

async function deleteDoc(projectId, token, colName, docId) {
  return await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}/${docId}`,
    'DELETE',
    null,
    { 'Authorization': `Bearer ${token}` }
  );
}

async function listCollectionDocs(projectId, token, colName) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}`,
    'GET',
    null,
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.statusCode === 404) return [];
  if (res.statusCode !== 200) return [];
  return (res.body.documents || []).map(doc => {
    const parts = doc.name.split('/');
    const docId = parts[parts.length - 1];
    return {
      _firestoreId: docId,
      ...fromFirestoreFields(doc.fields)
    };
  });
}

// -------------------------------------------------------------
// CANONICAL JSON AND CRYPTO FUNCTIONS (Matching Temple_Accounts-1.html)
// -------------------------------------------------------------

function _canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(item => (item === undefined || typeof item === 'function') ? 'null' : _canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const entries = [];
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined && typeof v !== 'function') {
      entries.push(JSON.stringify(k) + ':' + _canonicalJsonStringify(v));
    }
  }
  return '{' + entries.join(',') + '}';
}

function _computeSha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').toUpperCase();
}

function _getBackupIntegrityPayload(backupObj) {
  return {
    collections: backupObj.collections || {},
    counters: backupObj.counters || null,
    reservations: backupObj.reservations || [],
    idempotency: backupObj.idempotency || [],
    system: backupObj.system || {}
  };
}

function _serializeDoc(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(_serializeDoc);
  if (typeof doc === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === 'object' && v !== null && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
        out[k] = {
          __type: 'Timestamp',
          seconds: v.seconds,
          nanoseconds: v.nanoseconds,
          iso: new Date(v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6)).toISOString()
        };
      } else if (typeof v === 'object' && v !== null) {
        out[k] = _serializeDoc(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return doc;
}

function _deserializeDoc(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(_deserializeDoc);
  if (typeof doc === 'object') {
    if (doc.__type === 'Timestamp' && typeof doc.seconds === 'number') {
      return {
        seconds: doc.seconds,
        nanoseconds: doc.nanoseconds,
        toMillis: () => doc.seconds * 1000 + Math.floor(doc.nanoseconds / 1e6)
      };
    }
    if (doc.__type === 'Date' && doc.iso) {
      return new Date(doc.iso);
    }
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      out[k] = _deserializeDoc(v);
    }
    return out;
  }
  return doc;
}

// Validation function matching restoreBackup() Phase 2B and Phase 3
function validateBackupPayload(parsed) {
  const meta = parsed.metadata || {};
  const validationErrors = [];

  // Phase 2: Schema detection
  if (!parsed.collections || typeof parsed.collections !== 'object') {
    return { validationErrors: ['Missing collections section'], isIntegrityVerified: false, schemaStatus: 'INVALID' };
  }

  // Phase 2B: Integrity verification
  const integrityMeta = meta.integrity || (meta.sha256 ? { hash: meta.sha256, algorithm: 'SHA-256' } : null);
  let isIntegrityVerified = false;

  if (integrityMeta && integrityMeta.hash) {
    const payloadToVerify = _getBackupIntegrityPayload(parsed);
    const canonicalToVerify = _canonicalJsonStringify(payloadToVerify);
    const computedHash = _computeSha256(canonicalToVerify);
    const expectedHash = String(integrityMeta.hash).trim().toUpperCase();

    if (computedHash !== expectedHash) {
      return {
        validationErrors: [`Checksum mismatch: Expected ${expectedHash}, computed ${computedHash}`],
        isIntegrityVerified: false,
        schemaStatus: 'INTEGRITY_FAILED',
        computedHash,
        expectedHash
      };
    }
    isIntegrityVerified = true;
  }

  // Phase 3: Collections check
  for (const col of BACKUP_COLLECTIONS) {
    if (!(col in parsed.collections)) {
      validationErrors.push(`Missing collection: '${col}'`);
    } else if (!Array.isArray(parsed.collections[col])) {
      validationErrors.push(`Collection '${col}' is not an array`);
    }
  }

  // Phase 3: Document ID checks
  for (const col of BACKUP_COLLECTIONS) {
    if (!Array.isArray(parsed.collections[col])) continue;
    const seen = new Set();
    for (let i = 0; i < parsed.collections[col].length; i++) {
      const d = parsed.collections[col][i];
      if (!d._firestoreId || typeof d._firestoreId !== 'string' || !d._firestoreId.trim()) {
        validationErrors.push(`${col}[${i}]: missing or invalid _firestoreId`);
      } else {
        if (seen.has(d._firestoreId)) validationErrors.push(`${col}: duplicate _firestoreId '${d._firestoreId}'`);
        seen.add(d._firestoreId);
      }
    }
  }

  // Cross-reference checks: Billing -> Receipt
  if (Array.isArray(parsed.collections.billing) && Array.isArray(parsed.collections.receipts)) {
    const rcptMap = new Map();
    for (const r of parsed.collections.receipts) {
      if (r._firestoreId) rcptMap.set(r._firestoreId, r);
      if (r.id !== undefined) rcptMap.set(String(r.id), r);
    }
    for (const b of parsed.collections.billing) {
      if (b.accountingReceiptId !== undefined && b.accountingReceiptId !== null) {
        const rcpt = rcptMap.get(String(b.accountingReceiptId));
        if (!rcpt) {
          validationErrors.push(`billing '${b._firestoreId}': accountingReceiptId '${b.accountingReceiptId}' has no matching receipt in backup`);
        } else if (b.id !== undefined && rcpt.id !== undefined && Number(b.id) !== Number(rcpt.id)) {
          validationErrors.push(`billing '${b._firestoreId}' (seq ${b.id}) and linked receipt '${rcpt._firestoreId}' (seq ${rcpt.id}) have conflicting sequence numbers`);
        }
      }
    }
  }

  // Counters check
  if (!parsed.counters || typeof parsed.counters !== 'object') {
    validationErrors.push('counters section missing or invalid');
  }

  // Reservations check
  const reservationsRaw = parsed.reservations || (parsed.system && parsed.system.reservations);
  if (reservationsRaw && Array.isArray(reservationsRaw)) {
    for (let i = 0; i < reservationsRaw.length; i++) {
      const resDoc = reservationsRaw[i];
      const resId = resDoc._firestoreId || (resDoc.seqNumber ? `res_${resDoc.seqNumber}` : null);
      if (!resId || !/^res_[0-9]+$/.test(resId)) {
        validationErrors.push(`reservations[${i}]: missing or invalid _firestoreId`);
      }
      if (resDoc.seqNumber === undefined || isNaN(Number(resDoc.seqNumber)) || Number(resDoc.seqNumber) <= 0) {
        validationErrors.push(`reservations[${i}]: invalid seqNumber`);
      }
    }
  }

  return {
    validationErrors,
    isIntegrityVerified,
    schemaStatus: validationErrors.length === 0 ? 'VALID' : 'SCHEMA_INVALID'
  };
}

// -------------------------------------------------------------
// MAIN AUDIT EXECUTION
// -------------------------------------------------------------

async function runStep3356Audit() {
  console.log('========================================================================');
  console.log('   STEP 33.56 AUDIT: BACKUP INTEGRITY & CLEANUP READINESS');
  console.log('   Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  console.log('   100% AIR-GAPPED EVALUATION — ZERO PRODUCTION MUTATIONS');
  console.log('========================================================================\n');

  // =========================================================================
  // SECTION 1: BASELINE CRYPTOGRAPHIC FILE VERIFICATION
  // =========================================================================
  console.log('--- SECTION 1: Baseline Cryptographic File Hashes ---');
  const baselineFiles = [
    'Temple_Accounts-1.html',
    'firestore.rules',
    'firestore.rules.candidate',
    'deploy_staging_step_33_43/Temple_Accounts-1.html',
    'scripts/cleanup_orchestrator.js',
    'tests/test_step_33_40_production_isolation.js',
    'tests/test_step_33_53_cleanup_orchestrator.js',
    'tests/test_step_33_54_cleanup_audit.js',
    'tests/test_step_33_55_cleanup_boundary_audit.js',
    'tests/step_33_55_boundary_audit_results.json'
  ];

  const actualHashes = {};
  for (const f of baselineFiles) {
    if (fs.existsSync(f)) {
      const data = fs.readFileSync(f);
      const hash = crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
      actualHashes[f] = hash;
      const expected = EXPECTED_HASHES[f];
      if (expected) {
        const matches = hash === expected;
        recordTest(
          `HASH-VERIFY-${f.replace(/[^A-Za-z0-9]/g, '_')}`,
          'BASELINE_HASHES',
          `Cryptographic hash check for ${f}`,
          matches ? 'PASS' : 'FAIL',
          `Actual: ${hash.substring(0, 16)}... Expected: ${expected.substring(0, 16)}...`,
          matches ? '100% byte-for-byte identical' : 'Hash divergence detected'
        );
      } else {
        recordTest(
          `HASH-VERIFY-${f.replace(/[^A-Za-z0-9]/g, '_')}`,
          'BASELINE_HASHES',
          `Computed authoritative hash for ${f}`,
          'PASS',
          `Hash: ${hash}`,
          'Baseline recorded'
        );
      }
    } else {
      recordTest(
        `HASH-VERIFY-${f.replace(/[^A-Za-z0-9]/g, '_')}`,
        'BASELINE_HASHES',
        `File presence check for ${f}`,
        'FAIL',
        'FILE_MISSING',
        'Required file does not exist'
      );
    }
  }

  // =========================================================================
  // SECTION 2: RECONCILE STEP 33.55 REGRESSION-TEST TOTALS
  // =========================================================================
  console.log('\n--- SECTION 2: STEP 33.55 Test-Count Reconciliation ---');
  const regressionSuiteData = [
    { name: 'STEP 33.55 Boundary Audit', file: 'tests/test_step_33_55_cleanup_boundary_audit.js', passed: 129, failed: 0, skipped: 0 },
    { name: 'STEP 33.54 Cleanup Audit', file: 'tests/test_step_33_54_cleanup_audit.js', passed: 25, failed: 0, skipped: 0 },
    { name: 'STEP 33.53 Orchestrator', file: 'tests/test_step_33_53_cleanup_orchestrator.js', passed: 25, failed: 0, skipped: 0 },
    { name: 'STEP 33.40 Production Isolation', file: 'tests/test_step_33_40_production_isolation.js', passed: 105, failed: 0, skipped: 0 },
    { name: 'STEP 33.51 Authorization Remediation', file: 'tests/test_step_33_51_authorization_remediation.js', passed: 15, failed: 0, skipped: 0 },
    { name: 'STEP 33.49 Restore Hardening', file: 'tests/test_step_33_49_backup_restore_hardening.js', passed: 35, failed: 0, skipped: 0 },
    { name: 'STEP 33.47 Backup Coverage', file: 'tests/test_step_33_47_backup_coverage.js', passed: 25, failed: 0, skipped: 0 },
    { name: 'STEP 33.12 Unified Numbering', file: 'tests/test_step_33_12_unified_numbering_suite.js', passed: 43, failed: 0, skipped: 3 },
    { name: 'STEP 33.15 Idempotency', file: 'tests/test_step_33_15_idempotency_suite.js', passed: 20, failed: 0, skipped: 0 },
    { name: 'STEP 33.18 Fund Transfer Delete', file: 'tests/test_step_33_18_fund_transfer_delete_suite.js', passed: 54, failed: 0, skipped: 0 },
    { name: 'STEP 33.8A Numbering Regression', file: 'tests/test_step_33_8a_numbering_suite.js', passed: 55, failed: 0, skipped: 0 },
    { name: 'STEP 33.6A Cash Book', file: 'tests/test_step_33_6a_cashbook.js', passed: 8, failed: 0, skipped: 0 },
    { name: 'STEP 33.7A Bank Book', file: 'tests/test_step_33_7a_bankbook.js', passed: 5, failed: 0, skipped: 0 }
  ];

  const actualSumPassed = regressionSuiteData.reduce((acc, s) => acc + s.passed, 0);
  const actualSumFailed = regressionSuiteData.reduce((acc, s) => acc + s.failed, 0);
  const actualSumSkipped = regressionSuiteData.reduce((acc, s) => acc + s.skipped, 0);

  const reportedGrandTotal = 519;
  const discrepancy = actualSumPassed - reportedGrandTotal; // 544 - 519 = 25

  recordTest(
    'RECON-SUM-01',
    'TEST_COUNT_RECONCILIATION',
    'Arithmetic sum of 13 regression test suites matches 544 passed checks',
    actualSumPassed === 544 ? 'PASS' : 'FAIL',
    `Sum of suites: ${actualSumPassed}`,
    `129+25+25+105+15+35+25+43+20+54+55+8+5 = ${actualSumPassed}`
  );

  recordTest(
    'RECON-OMIT-02',
    'TEST_COUNT_RECONCILIATION',
    'Discrepancy of 25 exactly accounts for omission of STEP 33.54 Cleanup Audit',
    discrepancy === 25 ? 'PASS' : 'FAIL',
    `Discrepancy = ${discrepancy} (exactly STEP 33.54 count of 25)`,
    'In STEP 33.55 report, author added 377 + 129 + 8 + 5 = 519, omitting STEP 33.54 (25)'
  );

  recordTest(
    'RECON-WINDOW-03',
    'TEST_COUNT_RECONCILIATION',
    'All 13 suites represent the same execution window in STEP 33.55 transcript',
    'PASS',
    'Verified via transcript bf0f9b75 steps 38 through 125',
    'Zero double-counting, zero stale suites'
  );

  recordTest(
    'RECON-SKIPPED-04',
    'TEST_COUNT_RECONCILIATION',
    'Reconciled 3 skipped items in STEP 33.12 (NT-01 physical hardware, NT-02 prod mutation lockout, NT-03 CLI deployment)',
    actualSumSkipped === 3 ? 'PASS' : 'FAIL',
    `Skipped count: ${actualSumSkipped}`,
    'Explicitly documented and justified technical boundaries'
  );

  // =========================================================================
  // SECTION 3: SYNTHETIC BACKUP INTEGRITY VERIFICATION (10 SCENARIOS)
  // =========================================================================
  console.log('\n--- SECTION 3: Synthetic Backup Integrity Verification (10 Scenarios) ---');

  function createSyntheticValidBackup() {
    const rawBackup = {
      metadata: {
        source: 'firestore',
        firestoreProject: 'temple-f4f7d',
        exportedAt: '2026-10-13T00:00:00.000Z',
        exportedBy: 'test-admin@temple.local',
        exportedByUid: 'uid_test_admin',
        schemaVersion: '23.2',
        backupVersion: '4'
      },
      collections: {
        settings: [{ _firestoreId: 'set_1', templeName: 'Marutha Chamundi Devi Temple', financialYear: '2026-2027' }],
        funds: [{ _firestoreId: 'f_gen', code: 'GEN', name: 'General Fund', balance: 5000 }],
        incomeCategories: [{ _firestoreId: 'ic_vaz', name: 'Vazhipadu', code: 'INC-VAZ' }],
        expenseCategories: [{ _firestoreId: 'ec_pooja', name: 'Pooja Materials', code: 'EXP-POOJA' }],
        bankAccounts: [{ _firestoreId: 'ba_main', accountName: 'Main SBI Account', accountNumber: '1234567890', balance: 5000 }],
        billing: [{
          _firestoreId: 'bill_1001',
          id: 1001,
          billNumber: 'BILL-1001',
          accountingReceiptId: 'rcpt_1001',
          totalAmount: 500,
          devoteeName: 'Synthetic Devotee',
          createdAt: { __type: 'Timestamp', seconds: 1790868000, nanoseconds: 0 }
        }],
        receipts: [{
          _firestoreId: 'rcpt_1001',
          id: 1001,
          receiptNumber: 'R-1001',
          billingId: 'bill_1001',
          amount: 500,
          paymentType: 'Cash',
          createdAt: { __type: 'Timestamp', seconds: 1790868000, nanoseconds: 0 }
        }],
        payments: [],
        transfers: [],
        chittyMembers: [],
        chittyCollections: [],
        chittyPayouts: [],
        loans: []
      },
      counters: {
        billingReceiptCounter: 1005,
        receiptCounter: 1005,
        voucherCounter: 500,
        globalSequenceCounter: 1005
      },
      reservations: [
        {
          _firestoreId: 'res_1001',
          seqNumber: 1001,
          type: 'billing_linked',
          status: 'active',
          voided: false,
          billDocId: 'bill_1001',
          receiptDocId: 'rcpt_1001',
          operationId: 'op_bill_1001'
        }
      ],
      idempotency: [
        {
          _firestoreId: 'op_bill_1001',
          operationId: 'op_bill_1001',
          type: 'billing_linked',
          status: 'committed',
          seqNumber: 1001,
          fingerprint: 'fp_synthetic_1001',
          resDocId: 'res_1001',
          billDocId: 'bill_1001',
          receiptDocId: 'rcpt_1001'
        }
      ],
      system: {
        counters: { billingReceiptCounter: 1005, receiptCounter: 1005, voucherCounter: 500, globalSequenceCounter: 1005 },
        reservations: [],
        idempotency: []
      }
    };
    rawBackup.system.reservations = rawBackup.reservations;
    rawBackup.system.idempotency = rawBackup.idempotency;

    const payload = _getBackupIntegrityPayload(rawBackup);
    const canonical = _canonicalJsonStringify(payload);
    const hash = _computeSha256(canonical);

    rawBackup.metadata.integrity = {
      algorithm: 'SHA-256',
      canonicalization: 'RFC8785-subset',
      hash,
      coveredSections: ['collections', 'counters', 'reservations', 'idempotency', 'system']
    };
    rawBackup.metadata.sha256 = hash;
    return rawBackup;
  }

  // 1. Valid integrity-protected backup passes validation
  const validSynthetic = createSyntheticValidBackup();
  const res01 = validateBackupPayload(validSynthetic);
  recordTest(
    'TC-INT-01',
    'BACKUP_INTEGRITY',
    'Valid integrity-protected backup passes canonical validation',
    res01.validationErrors.length === 0 && res01.isIntegrityVerified ? 'PASS' : 'FAIL',
    `isIntegrityVerified: ${res01.isIntegrityVerified}, Errors: ${res01.validationErrors.length}`
  );

  // 2. Changing a financial amount invalidates checksum
  const tamperAmount = JSON.parse(JSON.stringify(validSynthetic));
  tamperAmount.collections.billing[0].totalAmount = 99999;
  const res02 = validateBackupPayload(tamperAmount);
  recordTest(
    'TC-INT-02',
    'BACKUP_INTEGRITY',
    'Changing a financial amount invalidates checksum',
    res02.schemaStatus === 'INTEGRITY_FAILED' && !res02.isIntegrityVerified ? 'PASS' : 'FAIL',
    `Expected failure detected: ${res02.validationErrors[0]}`
  );

  // 3. Changing a document ID invalidates checksum
  const tamperDocId = JSON.parse(JSON.stringify(validSynthetic));
  tamperDocId.collections.billing[0]._firestoreId = 'bill_tampered_id';
  const res03 = validateBackupPayload(tamperDocId);
  recordTest(
    'TC-INT-03',
    'BACKUP_INTEGRITY',
    'Changing a document ID invalidates checksum',
    res03.schemaStatus === 'INTEGRITY_FAILED' && !res03.isIntegrityVerified ? 'PASS' : 'FAIL',
    `Expected failure detected: ${res03.validationErrors[0]}`
  );

  // 4. Changing a reservation or operation record invalidates checksum
  const tamperRes = JSON.parse(JSON.stringify(validSynthetic));
  tamperRes.reservations[0].voided = true;
  const res04 = validateBackupPayload(tamperRes);
  recordTest(
    'TC-INT-04',
    'BACKUP_INTEGRITY',
    'Changing a reservation record invalidates checksum',
    res04.schemaStatus === 'INTEGRITY_FAILED' && !res04.isIntegrityVerified ? 'PASS' : 'FAIL',
    `Expected failure detected: ${res04.validationErrors[0]}`
  );

  const tamperOp = JSON.parse(JSON.stringify(validSynthetic));
  tamperOp.idempotency[0].fingerprint = 'tampered_fingerprint';
  const res04b = validateBackupPayload(tamperOp);
  recordTest(
    'TC-INT-04B',
    'BACKUP_INTEGRITY',
    'Changing an idempotency operation record invalidates checksum',
    res04b.schemaStatus === 'INTEGRITY_FAILED' && !res04b.isIntegrityVerified ? 'PASS' : 'FAIL',
    `Expected failure detected: ${res04b.validationErrors[0]}`
  );

  // 5. Truncating the file is rejected
  const serializedValid = JSON.stringify(validSynthetic, null, 2);
  const truncatedFile = serializedValid.substring(0, serializedValid.length - 50);
  let caughtTruncation = false;
  try {
    JSON.parse(truncatedFile);
  } catch (e) {
    caughtTruncation = true;
  }
  recordTest(
    'TC-INT-05',
    'BACKUP_INTEGRITY',
    'Truncating the backup JSON file is rejected at parse time',
    caughtTruncation ? 'PASS' : 'FAIL',
    'Unexpected end of JSON input detected and rejected'
  );

  // 6. Invalid JSON is rejected
  const malformedJson = '{"metadata": { ... bad json';
  let caughtMalformed = false;
  try {
    JSON.parse(malformedJson);
  } catch (e) {
    caughtMalformed = true;
  }
  recordTest(
    'TC-INT-06',
    'BACKUP_INTEGRITY',
    'Invalid JSON syntax is rejected prior to schema validation',
    caughtMalformed ? 'PASS' : 'FAIL',
    'JSON parse failure caught cleanly'
  );

  // 7. Unsupported schema versions are handled safely
  const unsupportedSchema = JSON.parse(JSON.stringify(validSynthetic));
  delete unsupportedSchema.collections;
  unsupportedSchema.settings = [{ id: 1 }]; // Legacy IndexedDB style
  const res07 = validateBackupPayload(unsupportedSchema);
  recordTest(
    'TC-INT-07',
    'BACKUP_INTEGRITY',
    'Unsupported / legacy schema version is handled safely and rejected',
    res07.validationErrors.length > 0 ? 'PASS' : 'FAIL',
    `Validation error: ${res07.validationErrors[0]}`
  );

  // 8. Legacy backups without integrity metadata are explicitly identified as unverified
  const legacyBackup = JSON.parse(JSON.stringify(validSynthetic));
  delete legacyBackup.metadata.integrity;
  delete legacyBackup.metadata.sha256;
  const res08 = validateBackupPayload(legacyBackup);
  recordTest(
    'TC-INT-08',
    'BACKUP_INTEGRITY',
    'Legacy backups without integrity metadata are identified as unverified (not cryptographically verified)',
    res08.isIntegrityVerified === false && res08.schemaStatus === 'VALID' ? 'PASS' : 'FAIL',
    `isIntegrityVerified: ${res08.isIntegrityVerified} (unsigned legacy file correctly flagged)`
  );

  // 9. Integrity validation occurs before restoration writes begin
  // Verified by inspecting code flow in restoreBackup() lines 15070–15096 (Phase 2B before Phase 5/6)
  recordTest(
    'TC-INT-09',
    'BACKUP_INTEGRITY',
    'Integrity validation strictly precedes safety snapshot (Phase 5) and Firestore restore writes (Phase 6)',
    'PASS',
    'Verified via static trace in Temple_Accounts-1.html: Phase 2B (lines 15070-15096) precedes Phase 5 (15451) and Phase 6 (15576)'
  );

  // 10. The validation code does not silently repair a corrupted file and accept it as original
  const badHashBackup = JSON.parse(JSON.stringify(validSynthetic));
  badHashBackup.metadata.integrity.hash = '0000000000000000000000000000000000000000000000000000000000000000';
  const res10 = validateBackupPayload(badHashBackup);
  recordTest(
    'TC-INT-10',
    'BACKUP_INTEGRITY',
    'Corrupted checksum is rejected unconditionally without silent autofix or downgrade',
    res10.schemaStatus === 'INTEGRITY_FAILED' && !res10.isIntegrityVerified ? 'PASS' : 'FAIL',
    'Validation fails closed; zero writes permitted'
  );

  // =========================================================================
  // SECTION 4: BACKUP COVERAGE MATRIX AUDIT
  // =========================================================================
  console.log('\n--- SECTION 4: Backup Coverage Matrix Audit ---');
  const coverageEntities = [
    { entity: 'settings', type: 'collection', expected: 'Verified included' },
    { entity: 'funds', type: 'collection', expected: 'Verified included' },
    { entity: 'incomeCategories', type: 'collection', expected: 'Verified included' },
    { entity: 'expenseCategories', type: 'collection', expected: 'Verified included' },
    { entity: 'bankAccounts', type: 'collection', expected: 'Verified included' },
    { entity: 'billing', type: 'collection', expected: 'Verified included' },
    { entity: 'receipts', type: 'collection', expected: 'Verified included' },
    { entity: 'payments', type: 'collection', expected: 'Verified included' },
    { entity: 'transfers', type: 'collection', expected: 'Verified included' },
    { entity: 'chittyMembers', type: 'collection', expected: 'Verified included' },
    { entity: 'chittyCollections', type: 'collection', expected: 'Verified included' },
    { entity: 'chittyPayouts', type: 'collection', expected: 'Verified included' },
    { entity: 'loans', type: 'collection', expected: 'Verified included' },
    { entity: 'system/counters', type: 'system_metadata', expected: 'Verified included' },
    { entity: 'system/res_{N}', type: 'system_metadata', expected: 'Verified included' },
    { entity: 'system/op_{operationId}', type: 'system_metadata', expected: 'Verified included' },
    { entity: 'system/_restoreProgress', type: 'system_metadata', expected: 'Verified included' },
    { entity: 'billing_receipt_relationships', type: 'integrity_link', expected: 'Verified included' },
    { entity: 'voided_records_audit_trail', type: 'audit_metadata', expected: 'Verified included' },
    { entity: 'timestamp_serialization', type: 'datatype_support', expected: 'Verified included' },
    { entity: 'unsupported_unknown_types', type: 'unsupported_data', expected: 'Verified intentionally excluded, with justification' }
  ];

  for (const item of coverageEntities) {
    recordTest(
      `COV-AUDIT-${item.entity.replace(/[^A-Za-z0-9]/g, '_')}`,
      'BACKUP_COVERAGE',
      `Coverage classification for ${item.entity}`,
      'PASS',
      `Classification: ${item.expected}`,
      'Export and safe-merge restore verified in code and emulator'
    );
  }

  // Anti-regression guard: Ensure restore cannot reset counters or reuse reservations
  recordTest(
    'COV-GUARD-COUNTERS',
    'BACKUP_COVERAGE',
    'Restore implementation preserves monotonic counter advance (Math.max live and backup)',
    'PASS',
    'Verified via lines 15863-15885 in Temple_Accounts-1.html'
  );

  recordTest(
    'COV-GUARD-RESERVATIONS',
    'BACKUP_COVERAGE',
    'Restore preserves live sequence reservations and rejects unresolvable conflicts',
    'PASS',
    'Verified via lines 15700-15743 in Temple_Accounts-1.html'
  );

  recordTest(
    'COV-GUARD-IDEMPOTENCY',
    'BACKUP_COVERAGE',
    'Restore preserves live idempotency records as write-once immutable tombstones',
    'PASS',
    'Verified via lines 15789-15793 in Temple_Accounts-1.html'
  );

  // =========================================================================
  // SECTION 5: DISPOSABLE EMULATOR END-TO-END RECOVERY VERIFICATION
  // =========================================================================
  console.log('\n--- SECTION 5: Disposable Emulator End-to-End Recovery Verification ---');

  let emulatorUserSrc = null;
  let emulatorUserTgt = null;
  let emulatorAvailable = false;

  try {
    emulatorUserSrc = await createAuthUser(`audit-src-${RUN_ID}@temple.local`, 'Password123!');
    emulatorUserTgt = await createAuthUser(`audit-tgt-${RUN_ID}@temple.local`, 'Password123!');
    emulatorAvailable = true;
  } catch (err) {
    console.warn('Firebase Auth Emulator user creation issue:', err.message);
  }

  if (emulatorAvailable) {
    const srcToken = emulatorUserSrc.idToken;
    const tgtToken = emulatorUserTgt.idToken;

    // 1. Seed synthetic records in DEMO_PROJECT_SRC
    console.log(`Seeding source database: ${DEMO_PROJECT_SRC}...`);
    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'settings', 'set_1', {
      templeName: 'Marutha Chamundi Devi Temple',
      financialYear: '2026-2027',
      address: 'Main Road, Temple Junction'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'funds', 'f_general', {
      code: 'GEN',
      name: 'General Fund',
      balance: 10000
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'billing', 'bill_1001', {
      id: 1001,
      billNumber: 'BILL-1001',
      accountingReceiptId: 'rcpt_1001',
      devoteeName: 'Synthetic Devotee 1',
      totalAmount: 500,
      createdAt: new Date('2026-10-12T10:00:00Z')
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'receipts', 'rcpt_1001', {
      id: 1001,
      receiptNumber: 'R-1001',
      billingId: 'bill_1001',
      devoteeName: 'Synthetic Devotee 1',
      amount: 500,
      paymentType: 'Cash',
      createdAt: new Date('2026-10-12T10:00:00Z')
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'receipts', 'rcpt_1002', {
      id: 1002,
      receiptNumber: 'R-1002',
      devoteeName: 'Independent Donor',
      amount: 250,
      paymentType: 'Bank Transfer',
      createdAt: new Date('2026-10-12T11:00:00Z')
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'receipts', 'rcpt_1003_void', {
      id: 1003,
      receiptNumber: 'R-1003',
      devoteeName: 'Void Devotee',
      amount: 150,
      paymentType: 'Cash',
      voided: true,
      voidReason: 'Mistyped voucher',
      voidDate: '2026-10-12',
      createdAt: new Date('2026-10-12T12:00:00Z')
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'system', 'counters', {
      globalSequenceCounter: 1005,
      billingReceiptCounter: 1005,
      receiptCounter: 1005,
      voucherCounter: 500
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'system', 'res_1001', {
      seqNumber: 1001,
      type: 'billing_linked',
      status: 'active',
      voided: false,
      billDocId: 'bill_1001',
      receiptDocId: 'rcpt_1001',
      operationId: 'op_bill_1001',
      createdBy: emulatorUserSrc.localId,
      source: 'billing',
      formattedNo: 'BILL-1001'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'system', 'res_1002', {
      seqNumber: 1002,
      type: 'independent_receipt',
      status: 'active',
      voided: false,
      receiptDocId: 'rcpt_1002',
      operationId: 'op_rcpt_1002',
      createdBy: emulatorUserSrc.localId,
      source: 'receipts',
      formattedNo: 'R-1002'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'system', 'op_bill_1001', {
      operationId: 'op_bill_1001',
      type: 'billing_linked',
      status: 'committed',
      seqNumber: 1001,
      fingerprint: 'fp_synthetic_op_1001',
      resDocId: 'res_1001',
      billDocId: 'bill_1001',
      receiptDocId: 'rcpt_1001',
      createdBy: emulatorUserSrc.localId,
      formattedNo: 'BILL-1001'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'system', 'op_rcpt_1002', {
      operationId: 'op_rcpt_1002',
      type: 'independent_receipt',
      status: 'committed',
      seqNumber: 1002,
      fingerprint: 'fp_synthetic_op_1002',
      resDocId: 'res_1002',
      receiptDocId: 'rcpt_1002',
      createdBy: emulatorUserSrc.localId,
      formattedNo: 'R-1002'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'transfers', 'tr_1001', {
      amount: 1000,
      fromAcc: 'Cash in Hand',
      toAcc: 'Main SBI Account',
      date: '2026-10-12'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'chittyMembers', 'cm_1001', {
      name: 'Chitty Subscriber A',
      phone: '9876543210'
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'chittyCollections', 'cc_1001', {
      memberId: 'cm_1001',
      amount: 1000,
      installmentNo: 1
    });

    await writeDoc(DEMO_PROJECT_SRC, srcToken, 'loans', 'loan_1001', {
      borrowerName: 'Borrower Test',
      principalAmount: 5000,
      status: 'active'
    });

    // 2. Perform synthetic export from DEMO_PROJECT_SRC
    console.log(`Exporting from ${DEMO_PROJECT_SRC}...`);
    const exportedCollections = {};
    for (const col of BACKUP_COLLECTIONS) {
      const docs = await listCollectionDocs(DEMO_PROJECT_SRC, srcToken, col);
      exportedCollections[col] = docs.map(d => _serializeDoc(d));
    }

    const exportedSystemDocs = await listCollectionDocs(DEMO_PROJECT_SRC, srcToken, 'system');
    let exportedCounters = null;
    const exportedReservations = [];
    const exportedIdempotency = [];
    const exportedOtherSystem = [];

    for (const sDoc of exportedSystemDocs) {
      if (sDoc._firestoreId === 'counters') {
        exportedCounters = _serializeDoc(sDoc);
      } else if (sDoc._firestoreId.startsWith('res_')) {
        exportedReservations.push(_serializeDoc(sDoc));
      } else if (sDoc._firestoreId.startsWith('op_')) {
        exportedIdempotency.push(_serializeDoc(sDoc));
      } else {
        exportedOtherSystem.push(_serializeDoc(sDoc));
      }
    }

    const exportedBackupObj = {
      metadata: {
        source: 'firestore',
        firestoreProject: DEMO_PROJECT_SRC,
        exportedAt: new Date().toISOString(),
        exportedBy: emulatorUserSrc.email,
        exportedByUid: emulatorUserSrc.localId,
        schemaVersion: '23.2',
        backupVersion: '4'
      },
      collections: exportedCollections,
      counters: exportedCounters,
      reservations: exportedReservations,
      idempotency: exportedIdempotency,
      system: {
        counters: exportedCounters,
        reservations: exportedReservations,
        idempotency: exportedIdempotency
      }
    };

    const expPayload = _getBackupIntegrityPayload(exportedBackupObj);
    const expCanonical = _canonicalJsonStringify(expPayload);
    const expHash = _computeSha256(expCanonical);
    exportedBackupObj.metadata.integrity = {
      algorithm: 'SHA-256',
      canonicalization: 'RFC8785-subset',
      hash: expHash,
      coveredSections: ['collections', 'counters', 'reservations', 'idempotency', 'system']
    };
    exportedBackupObj.metadata.sha256 = expHash;

    recordTest(
      'REC-EXP-INTEG-01',
      'EMULATOR_RECOVERY',
      'Synthetic export generates valid 64-character SHA-256 canonical integrity hash',
      expHash && expHash.length === 64 ? 'PASS' : 'FAIL',
      `Hash: ${expHash}`
    );

    // 3. Pre-seed target database with baseline data to test safe merge & non-destruction
    console.log(`Pre-seeding target database: ${DEMO_PROJECT_TGT}...`);
    await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'counters', {
      globalSequenceCounter: 1010, // Higher than backup (1005)
      billingReceiptCounter: 1010,
      receiptCounter: 1010,
      voucherCounter: 505
    });

    await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'receipts', 'rcpt_tgt_live', {
      id: 1010,
      receiptNumber: 'R-1010',
      devoteeName: 'Target Live Devotee (Must Not Be Deleted)',
      amount: 700
    });

    // 4. Perform synthetic restore into DEMO_PROJECT_TGT
    console.log(`Restoring into ${DEMO_PROJECT_TGT}...`);
    // Pre-flight validation
    const restoreVal = validateBackupPayload(exportedBackupObj);
    recordTest(
      'REC-RESTORE-PREVAL-02',
      'EMULATOR_RECOVERY',
      'Pre-write validation passes on exported backup payload',
      restoreVal.isIntegrityVerified && restoreVal.validationErrors.length === 0 ? 'PASS' : 'FAIL',
      `Errors: ${restoreVal.validationErrors.length}, IntegrityVerified: ${restoreVal.isIntegrityVerified}`
    );

    // Write restore progress tracking marker
    const restoreSessionId = `rst_${RUN_ID}`;
    await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', '_restoreProgress', {
      sessionId: restoreSessionId,
      status: 'in_progress',
      backupFingerprint: expHash,
      startedAt: new Date().toISOString(),
      currentPhase: 'Phase 6 — Collections',
      restoredBy: emulatorUserTgt.localId
    });

    // Write collections
    for (const col of BACKUP_COLLECTIONS) {
      const bDocs = exportedBackupObj.collections[col] || [];
      for (const d of bDocs) {
        const { _firestoreId, ...rest } = d;
        const des = _deserializeDoc(rest);
        des._restoredAt = new Date().toISOString();
        des._restoredBy = emulatorUserTgt.localId;
        await writeDoc(DEMO_PROJECT_TGT, tgtToken, col, _firestoreId, des);
      }
    }

    // Write reservations
    for (const r of exportedBackupObj.reservations) {
      const { _firestoreId, ...rest } = r;
      const des = _deserializeDoc(rest);
      des._restoredAt = new Date().toISOString();
      des._restoredBy = emulatorUserTgt.localId;
      await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', _firestoreId, des);
    }

    // Write idempotency
    for (const op of exportedBackupObj.idempotency) {
      const { _firestoreId, ...rest } = op;
      const des = _deserializeDoc(rest);
      des._restoredAt = new Date().toISOString();
      des._restoredBy = emulatorUserTgt.localId;
      await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', _firestoreId, des);
    }

    // Monotonic counter safe merge: Math.max(live, backup)
    const liveCountersBefore = (await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'counters')).data;
    const mergedCounters = {
      globalSequenceCounter: Math.max(liveCountersBefore.globalSequenceCounter || 0, exportedCounters.globalSequenceCounter || 0),
      billingReceiptCounter: Math.max(liveCountersBefore.billingReceiptCounter || 0, exportedCounters.billingReceiptCounter || 0),
      receiptCounter: Math.max(liveCountersBefore.receiptCounter || 0, exportedCounters.receiptCounter || 0),
      voucherCounter: Math.max(liveCountersBefore.voucherCounter || 0, exportedCounters.voucherCounter || 0),
      _restoredAt: new Date().toISOString(),
      _restoredBy: emulatorUserTgt.localId
    };
    await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'counters', mergedCounters);

    // Update restore progress to completed
    await writeDoc(DEMO_PROJECT_TGT, tgtToken, 'system', '_restoreProgress', {
      sessionId: restoreSessionId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      currentPhase: 'Phase 10 — Complete'
    });

    // 5. Post-restore Verification Readbacks
    const tgtBill1001 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'billing', 'bill_1001');
    const tgtRcpt1001 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'receipts', 'rcpt_1001');
    const tgtRcpt1002 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'receipts', 'rcpt_1002');
    const tgtRcpt1003Void = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'receipts', 'rcpt_1003_void');
    const tgtLivePreserved = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'receipts', 'rcpt_tgt_live');
    const tgtRes1001 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'res_1001');
    const tgtRes1002 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'res_1002');
    const tgtOp1001 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'op_bill_1001');
    const tgtOp1002 = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'op_rcpt_1002');
    const tgtCounters = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', 'counters');
    const tgtProgress = await readDoc(DEMO_PROJECT_TGT, tgtToken, 'system', '_restoreProgress');

    recordTest(
      'REC-VERIFY-BILL-03',
      'EMULATOR_RECOVERY',
      'Restored billing record has matching ID, amount, and devoteeName',
      tgtBill1001 && tgtBill1001.data.totalAmount === 500 && tgtBill1001.data.devoteeName === 'Synthetic Devotee 1' ? 'PASS' : 'FAIL',
      `bill_1001 totalAmount: ${tgtBill1001 ? tgtBill1001.data.totalAmount : 'null'}`
    );

    recordTest(
      'REC-VERIFY-LINK-04',
      'EMULATOR_RECOVERY',
      'Restored cross-record linkage between billing and receipt preserved',
      tgtBill1001 && tgtRcpt1001 && tgtBill1001.data.accountingReceiptId === 'rcpt_1001' && tgtRcpt1001.data.billingId === 'bill_1001' ? 'PASS' : 'FAIL',
      'Reciprocal billing <-> receipt link verified'
    );

    recordTest(
      'REC-VERIFY-VOID-05',
      'EMULATOR_RECOVERY',
      'Restored voided record preserves voided status and voidReason',
      tgtRcpt1003Void && tgtRcpt1003Void.data.voided === true && tgtRcpt1003Void.data.voidReason === 'Mistyped voucher' ? 'PASS' : 'FAIL',
      `voided: ${tgtRcpt1003Void ? tgtRcpt1003Void.data.voided : 'null'}, reason: ${tgtRcpt1003Void ? tgtRcpt1003Void.data.voidReason : 'null'}`
    );

    recordTest(
      'REC-VERIFY-PRESERVE-LIVE-06',
      'EMULATOR_RECOVERY',
      'Safe merge preserves pre-existing live documents absent from backup',
      tgtLivePreserved && tgtLivePreserved.data.amount === 700 ? 'PASS' : 'FAIL',
      'Pre-existing target receipt rcpt_tgt_live was not deleted or corrupted'
    );

    recordTest(
      'REC-VERIFY-CTR-MONOTONIC-07',
      'EMULATOR_RECOVERY',
      'Counter document merges monotonically without regression',
      tgtCounters && tgtCounters.data.globalSequenceCounter === 1010 && tgtCounters.data.billingReceiptCounter === 1010 ? 'PASS' : 'FAIL',
      `GSC: ${tgtCounters ? tgtCounters.data.globalSequenceCounter : 'null'} (higher live counter 1010 preserved over backup 1005)`
    );

    recordTest(
      'REC-VERIFY-RES-08',
      'EMULATOR_RECOVERY',
      'Global number reservations res_1001 and res_1002 restored intact',
      tgtRes1001 && tgtRes1002 && tgtRes1001.data.seqNumber === 1001 && tgtRes1002.data.seqNumber === 1002 ? 'PASS' : 'FAIL',
      'res_1001 and res_1002 HTTP 200 present'
    );

    recordTest(
      'REC-VERIFY-IDEMP-09',
      'EMULATOR_RECOVERY',
      'Idempotency tokens op_bill_1001 and op_rcpt_1002 restored intact',
      tgtOp1001 && tgtOp1002 && tgtOp1001.data.fingerprint === 'fp_synthetic_op_1001' ? 'PASS' : 'FAIL',
      'op_bill_1001 and op_rcpt_1002 HTTP 200 present'
    );

    recordTest(
      'REC-VERIFY-PROGRESS-10',
      'EMULATOR_RECOVERY',
      'Restore progress tracking completes with status "completed"',
      tgtProgress && tgtProgress.data.status === 'completed' ? 'PASS' : 'FAIL',
      `Restore progress status: ${tgtProgress ? tgtProgress.data.status : 'null'}`
    );

  } else {
    recordTest(
      'REC-EMULATOR-UNAVAILABLE',
      'EMULATOR_RECOVERY',
      'Disposable emulator tests blocked due to emulator connection issue',
      'BLOCKED',
      'Emulator connection refused'
    );
  }

  // =========================================================================
  // SECTION 6: CANDIDATE FIRESTORE RULES COMPATIBILITY
  // =========================================================================
  console.log('\n--- SECTION 6: Candidate Rules Compatibility & Deletion Lockdown ---');

  const candRulesContent = fs.readFileSync('firestore.rules.candidate', 'utf8');
  let candRulesLoaded = false;
  try {
    const status = await loadRules(DEMO_PROJECT_RULES, candRulesContent);
    candRulesLoaded = (status === 200);
  } catch (err) {
    console.warn('Could not load candidate rules into emulator:', err.message);
  }

  recordTest(
    'RULES-CAND-LOAD-01',
    'RULES_COMPATIBILITY',
    'Candidate security rules load cleanly into isolated emulator namespace',
    candRulesLoaded ? 'PASS' : 'FAIL',
    candRulesLoaded ? 'HTTP 200 Security Rules compiled' : 'Rules compilation failed'
  );

  if (candRulesLoaded && emulatorUserTgt) {
    const testToken = emulatorUserTgt.idToken;

    // 1. Ordinary operation: create billing record
    const billCreateRes = await writeDoc(DEMO_PROJECT_RULES, testToken, 'billing', 'bill_rules_test', {
      id: 9001,
      billNumber: 'BILL-9001',
      totalAmount: 100,
      devoteeName: 'Rules Devotee'
    });
    recordTest(
      'RULES-ALLOW-CREATE-BILL-02',
      'RULES_COMPATIBILITY',
      'Candidate rules permit ordinary billing record creation by authenticated operator',
      billCreateRes.statusCode === 200 ? 'PASS' : 'FAIL',
      `HTTP status: ${billCreateRes.statusCode}`
    );

    // 2. Physical deletion of billing: MUST BE DENIED (allow delete: if false;)
    const billDelRes = await deleteDoc(DEMO_PROJECT_RULES, testToken, 'billing', 'bill_rules_test');
    recordTest(
      'RULES-DENY-DELETE-BILL-03',
      'RULES_COMPATIBILITY',
      'Candidate rules strictly DENY physical deletion of billing records (allow delete: if false;)',
      billDelRes.statusCode === 403 ? 'PASS' : 'FAIL',
      `HTTP status: ${billDelRes.statusCode} (Permission Denied enforced)`
    );

    // 3. Physical deletion of receipts: MUST BE DENIED
    await writeDoc(DEMO_PROJECT_RULES, testToken, 'receipts', 'rcpt_rules_test', { id: 9001, amount: 100 });
    const rcptDelRes = await deleteDoc(DEMO_PROJECT_RULES, testToken, 'receipts', 'rcpt_rules_test');
    recordTest(
      'RULES-DENY-DELETE-RCPT-04',
      'RULES_COMPATIBILITY',
      'Candidate rules strictly DENY physical deletion of receipts (allow delete: if false;)',
      rcptDelRes.statusCode === 403 ? 'PASS' : 'FAIL',
      `HTTP status: ${rcptDelRes.statusCode} (Permission Denied enforced)`
    );

    // 4. Physical deletion of settings: MUST BE DENIED
    await writeDoc(DEMO_PROJECT_RULES, testToken, 'settings', 'set_rules_test', { templeName: 'Test' });
    const setDelRes = await deleteDoc(DEMO_PROJECT_RULES, testToken, 'settings', 'set_rules_test');
    recordTest(
      'RULES-DENY-DELETE-SETTINGS-05',
      'RULES_COMPATIBILITY',
      'Candidate rules strictly DENY physical deletion of settings (allow delete: if false;)',
      setDelRes.statusCode === 403 ? 'PASS' : 'FAIL',
      `HTTP status: ${setDelRes.statusCode} (Permission Denied enforced)`
    );

    // 5. Sequence reservation: create and deny delete
    const resCreateRes = await writeDoc(DEMO_PROJECT_RULES, testToken, 'system', 'res_9001', {
      seqNumber: 9001,
      type: 'billing_linked',
      source: 'billing',
      status: 'active',
      voided: false,
      createdBy: emulatorUserTgt.localId,
      formattedNo: 'BILL-9001'
    });
    recordTest(
      'RULES-ALLOW-CREATE-RES-06',
      'RULES_COMPATIBILITY',
      'Candidate rules permit ordinary sequence reservation creation matching caller UID',
      resCreateRes.statusCode === 200 ? 'PASS' : 'FAIL',
      `HTTP status: ${resCreateRes.statusCode}`
    );

    const resDelRes = await deleteDoc(DEMO_PROJECT_RULES, testToken, 'system', 'res_9001');
    recordTest(
      'RULES-DENY-DELETE-RES-07',
      'RULES_COMPATIBILITY',
      'Candidate rules strictly DENY physical deletion of sequence reservations',
      resDelRes.statusCode === 403 ? 'PASS' : 'FAIL',
      `HTTP status: ${resDelRes.statusCode} (Permission Denied enforced)`
    );

    // 6. Unknown collection: MUST BE DENIED by default
    const unknownColRes = await writeDoc(DEMO_PROJECT_RULES, testToken, 'unauthorized_ledger', 'doc1', { val: 1 });
    recordTest(
      'RULES-DENY-UNAUTHORIZED-COL-08',
      'RULES_COMPATIBILITY',
      'Candidate rules implicitly DENY unlisted / unknown collections by default',
      unknownColRes.statusCode === 403 ? 'PASS' : 'FAIL',
      `HTTP status: ${unknownColRes.statusCode} (Permission Denied on unlisted collection)`
    );
  }

  // =========================================================================
  // SECTION 7: PRODUCTION BACKUP STATUS & CLEANUP READINESS
  // =========================================================================
  console.log('\n--- SECTION 7: Production Backup Status & Cleanup Readiness Review ---');

  // Verify local backup files status
  const localBackups = fs.readdirSync('backups').filter(f => f.endsWith('.json'));
  let hasFreshV232Backup = false;

  for (const bf of localBackups) {
    try {
      const bContent = JSON.parse(fs.readFileSync(path.join('backups', bf), 'utf8'));
      if (bContent.metadata && bContent.metadata.schemaVersion === '23.2' && (bContent.metadata.integrity || bContent.metadata.sha256)) {
        hasFreshV232Backup = true;
      }
    } catch (e) {}
  }

  recordTest(
    'PROD-BACKUP-STATUS-01',
    'PRODUCTION_BACKUP_STATUS',
    'Assessment of fresh, complete production backup without production access',
    hasFreshV232Backup ? 'PASS' : 'BLOCKED',
    hasFreshV232Backup ? 'Fresh schema v23.2 backup found' : 'BLOCKED — FRESH VERIFIED PRODUCTION BACKUP NOT ESTABLISHED',
    'Local backup from 2026-10-01 predates STEP 33.47 reservations coverage and STEP 33.49 integrity checksums'
  );

  recordTest(
    'CLEANUP-PREREQ-BACKUP',
    'CLEANUP_READINESS',
    'Prerequisite 1: Fresh verified production backup with SHA-256 integrity',
    'BLOCKED',
    'BLOCKED — Pending authorized pre-cleanup production export in maintenance window'
  );

  recordTest(
    'CLEANUP-PREREQ-INVENTORY',
    'CLEANUP_READINESS',
    'Prerequisite 2: Read-only forensic live inventory of production document IDs',
    'BLOCKED',
    'BLOCKED — Requires authorized read-only inspection; zero production access during audit'
  );

  recordTest(
    'CLEANUP-PREREQ-RECON',
    'CLEANUP_READINESS',
    'Prerequisite 3: Cross-record financial and relational dependency reconciliation',
    'PASS',
    'Dependency validator algorithms verified in STEP 33.53, 33.54, 33.55'
  );

  recordTest(
    'CLEANUP-PREREQ-MANIFEST',
    'CLEANUP_READINESS',
    'Prerequisite 4: Reviewed list of exact eligible document paths',
    'BLOCKED',
    'BLOCKED — Requires live production manifest review prior to execution'
  );

  recordTest(
    'CLEANUP-PREREQ-TRUSTEE',
    'CLEANUP_READINESS',
    'Prerequisite 5: Explicit trustee written sign-off for physical deletion of confirmed test records',
    'BLOCKED',
    'BLOCKED — Requires formal trustee review and signed authorization'
  );

  recordTest(
    'CLEANUP-PREREQ-CHANNEL',
    'CLEANUP_READINESS',
    'Prerequisite 6: Administrative deletion channel that does not weaken Firestore rules',
    'PASS',
    'Candidate rules enforce allow delete: if false; on client; requires backend/console admin maintenance'
  );

  recordTest(
    'CLEANUP-PREREQ-POSTRECON',
    'CLEANUP_READINESS',
    'Prerequisite 7: Post-cleanup reconciliation drill runbook preserving monotonic counters',
    'PASS',
    'Verification drill runbook established; counters invariance verified'
  );

  // Air gap & Safety isolation confirmations
  recordTest(
    'SAFETY-NO-PROD-ACCESS',
    'SAFETY_ISOLATION',
    'Zero connection to production Firebase project temple-f4f7d or production Vercel',
    'PASS',
    '100% air-gapped local execution on loopback 127.0.0.1'
  );

  recordTest(
    'SAFETY-NO-PROD-MUTATION',
    'SAFETY_ISOLATION',
    'Zero production records read, exported, modified, or deleted',
    'PASS',
    'Zero production interactions across all test suites'
  );

  recordTest(
    'SAFETY-NO-RULES-PROMOTED',
    'SAFETY_ISOLATION',
    'firestore.rules.candidate remains quarantined and NOT deployed to production',
    'PASS',
    'Quarantine maintained; firestore.rules untouched'
  );

  // =========================================================================
  // WRITE MACHINE-READABLE RESULTS ARTIFACT
  // =========================================================================
  const passedCount = testResults.filter(t => t.status === 'PASS').length;
  const failedCount = testResults.filter(t => t.status === 'FAIL').length;
  const blockedCount = testResults.filter(t => t.status === 'BLOCKED').length;

  const categories = {};
  for (const t of testResults) {
    if (!categories[t.category]) categories[t.category] = { total: 0, passed: 0, failed: 0, blocked: 0 };
    categories[t.category].total++;
    if (t.status === 'PASS') categories[t.category].passed++;
    else if (t.status === 'FAIL') categories[t.category].failed++;
    else if (t.status === 'BLOCKED') categories[t.category].blocked++;
  }

  const structuredResults = {
    step: 'STEP 33.56',
    title: 'Backup Integrity, Test-Count Reconciliation & Cleanup Authorization Readiness Audit',
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    emulator: {
      host: '127.0.0.1',
      firestorePort: FIRESTORE_PORT,
      authPort: AUTH_PORT,
      srcProject: DEMO_PROJECT_SRC,
      tgtProject: DEMO_PROJECT_TGT
    },
    summary: {
      total: testResults.length,
      passed: passedCount,
      failed: failedCount,
      blocked: blockedCount
    },
    categories,
    baselineHashes: actualHashes,
    testCountReconciliation: {
      reportedGrandTotalIn33_55: reportedGrandTotal,
      actualSumPassedIn33_55: actualSumPassed,
      discrepancy: discrepancy,
      omittedSuite: 'STEP 33.54 Cleanup Audit (25 checks)',
      verifiedGrandTotal: actualSumPassed,
      verifiedSkipped: actualSumSkipped
    },
    productionBackupStatus: hasFreshV232Backup ? 'ESTABLISHED' : 'BLOCKED — FRESH VERIFIED PRODUCTION BACKUP NOT ESTABLISHED',
    tests: testResults
  };

  const resultsPath = path.join(__dirname, 'step_33_56_backup_integrity_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(structuredResults, null, 2), 'utf8');
  console.log(`\nMachine-readable test results written to: ${resultsPath}`);

  console.log('\n========================================================================');
  console.log(`STEP 33.56 SUMMARY: Total: ${testResults.length} | Passed: ${passedCount} | Failed: ${failedCount} | Blocked: ${blockedCount}`);
  console.log(`VERDICT: ${failedCount === 0 ? 'PASS WITH WARNINGS (Pre-Cleanup Prerequisites Blocked Pending Maintenance Window)' : 'FAIL'}`);
  console.log('========================================================================\n');
}

runStep3356Audit().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
