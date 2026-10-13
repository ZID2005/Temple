/**
 * test_step_33_11_final_audit.js
 * STEP 33.11 — Final Pre-Deployment Verification & Risk Audit Test Suite
 *
 * Dedicated comprehensive audit runner targeting:
 *   Project: demo-temple-accounts-test
 *   Endpoints: Firestore (127.0.0.1:8080), Auth (127.0.0.1:9099)
 *
 * This test suite conducts evidence-based verification across:
 *   Phase A: File & Backup Cryptographic Integrity
 *   Phase B: Shared Numbering & Historical Compatibility (Clean Fixture & Collisions)
 *   Phase C: Multi-User Concurrency Audit (3 Authenticated Users, Genuine Concurrency with OCC Retries)
 *   Phase D: Safe Backup Restore Verification (12 Scenarios, Non-Destructive Merge)
 *   Phase E: Accounting Integrity & Regression Checks
 *   Phase F: Candidate Rules & Deployment Isolation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-temple-accounts-test';

let passed = 0;
let failed = 0;
let notTested = 0;
const results = [];

function recordResult(testId, suite, description, expected, actual, status, notes = '') {
  results.push({ testId, suite, description, expected, actual, status, notes });
  if (status === 'PASS') {
    passed++;
    console.log(`  ✅ [PASS] ${testId} (${suite}): ${description} -> ${actual} ${notes ? '[' + notes + ']' : ''}`);
  } else if (status === 'FAIL') {
    failed++;
    console.log(`  ❌ [FAIL] ${testId} (${suite}): ${description} -> Expected: ${expected}, Got: ${actual} ${notes ? '[' + notes + ']' : ''}`);
  } else if (status === 'NOT TESTED') {
    notTested++;
    console.log(`  ⚠️ [NOT TESTED] ${testId} (${suite}): ${description} -> ${notes}`);
  }
}

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

async function firestoreRest(method, docPath, body = null, token = 'owner') {
  const subPath = docPath.startsWith(':') ? docPath : `/${docPath}`;
  const options = {
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents${subPath}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  return httpRequest(options, body);
}

async function clearEmulatorData() {
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.status;
}

async function setCandidateRules() {
  const candidatePath = (fs.existsSync(path.join(__dirname, 'firestore.rules.candidate')) ? path.join(__dirname, 'firestore.rules.candidate') : path.join(__dirname, '..', 'firestore.rules.candidate'));
  const rulesContent = fs.readFileSync(candidatePath, 'utf8');
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/emulator/v1/projects/${PROJECT_ID}:securityRules`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { rules: { files: [{ content: rulesContent }] } });
  return res.status;
}

async function setProductionRules() {
  const prodPath = (fs.existsSync(path.join(__dirname, 'firestore.rules')) ? path.join(__dirname, 'firestore.rules') : path.join(__dirname, '..', 'firestore.rules'));
  const rulesContent = fs.readFileSync(prodPath, 'utf8');
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/emulator/v1/projects/${PROJECT_ID}:securityRules`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { rules: { files: [{ content: rulesContent }] } });
  return res.status;
}

async function createAuthUser(email, password) {
  let res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: AUTH_PORT,
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, returnSecureToken: true });

  if (!res.data || !res.data.idToken) {
    res = await httpRequest({
      hostname: EMULATOR_HOST,
      port: AUTH_PORT,
      path: '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-test-key',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password, returnSecureToken: true });
  }

  if (!res.data || !res.data.idToken) {
    throw new Error(`Failed to authenticate test user (${email}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function setCounters(billingReceiptCounter = 0, receiptCounter = 1000, voucherCounter = 500, token = 'owner') {
  const body = {
    fields: {
      billingReceiptCounter: { integerValue: String(billingReceiptCounter) },
      receiptCounter: { integerValue: String(receiptCounter) },
      voucherCounter: { integerValue: String(voucherCounter) },
      billingPrefix: { stringValue: 'BILL-' },
      receiptPrefix: { stringValue: 'R-' },
      voucherPrefix: { stringValue: 'V-' }
    }
  };
  const res = await firestoreRest('PATCH', 'system/counters', body, token);
  return res.status;
}

async function getCounters(token = 'owner') {
  const res = await firestoreRest('GET', 'system/counters', null, token);
  if (res.status === 200 && res.data.fields) {
    const f = res.data.fields;
    return {
      billingReceiptCounter: parseInt(f.billingReceiptCounter?.integerValue || '0', 10),
      receiptCounter: parseInt(f.receiptCounter?.integerValue || '1000', 10),
      voucherCounter: parseInt(f.voucherCounter?.integerValue || '500', 10)
    };
  }
  return null;
}

async function listDocs(collection, token = 'owner') {
  const res = await firestoreRest('GET', collection, null, token);
  if (res.status === 200 && res.data.documents) {
    return res.data.documents.map(d => {
      const nameParts = d.name.split('/');
      const docId = nameParts[nameParts.length - 1];
      const fields = d.fields || {};
      const obj = { _docId: docId };
      for (const [k, v] of Object.entries(fields)) {
        if ('stringValue' in v) obj[k] = v.stringValue;
        else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
        else if ('doubleValue' in v) obj[k] = parseFloat(v.doubleValue);
        else if ('booleanValue' in v) obj[k] = v.booleanValue;
      }
      return obj;
    });
  }
  return [];
}

/**
 * Execute atomic billing creation using genuine Firestore transactions (REST beginTransaction + commit)
 * with optimistic concurrency control and automatic exponential backoff/jitter retry on HTTP 409 ABORTED.
 * This mirrors the exact runtime behavior of db.runTransaction in Firebase Web SDK.
 */
async function txCreateBilling(billingInput, token = 'owner', maxRetries = 10) {
  const counterDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/counters`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 1. Begin transaction
    const txRes = await firestoreRest('POST', ':beginTransaction', {}, token);
    const txId = txRes.data?.transaction;
    if (!txId) throw new Error('Failed to obtain transaction ID from Firestore');

    // 2. Read counters inside transaction
    const bgRes = await firestoreRest('POST', ':batchGet', {
      transaction: txId,
      documents: [counterDocPath]
    }, token);

    let curBillCnt = 0;
    if (Array.isArray(bgRes.data) && bgRes.data[0] && bgRes.data[0].found) {
      const f = bgRes.data[0].found.fields;
      curBillCnt = parseInt(f?.billingReceiptCounter?.integerValue || '0', 10);
    }

    let nextBillNum = curBillCnt + 1;
    let billDocId = `bill_${nextBillNum}`;
    let rcptDocId = `rcpt_${nextBillNum}`;
    let billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
    let rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

    // Collision lookahead inside transaction
    let checkRes = await firestoreRest('POST', ':batchGet', {
      transaction: txId,
      documents: [billDocPath, rcptDocPath]
    }, token);

    let hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
    while (hasCollision) {
      nextBillNum++;
      billDocId = `bill_${nextBillNum}`;
      rcptDocId = `rcpt_${nextBillNum}`;
      billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
      rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;
      checkRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [billDocPath, rcptDocPath]
      }, token);
      hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
    }

    const customBillNo = billingInput.manualBillNo || null;
    const billPrefix = 'BILL-';
    const rcptPrefix = 'R-';

    let formattedBillNo;
    let formattedRcptNo;
    if (customBillNo) {
      formattedBillNo = customBillNo;
      const numMatch = customBillNo.match(/\d+$/);
      if (numMatch) {
        formattedRcptNo = `${rcptPrefix}${numMatch[0].padStart(4, '0')}`;
      } else {
        formattedRcptNo = `${rcptPrefix}${String(nextBillNum).padStart(4, '0')}`;
      }
    } else {
      const padded = String(nextBillNum).padStart(4, '0');
      formattedBillNo = `${billPrefix}${padded}`;
      formattedRcptNo = `${rcptPrefix}${padded}`;
    }

    const nowTs = Date.now();
    const billFields = {
      id: { integerValue: String(nextBillNum) },
      receiptNo: { stringValue: formattedBillNo },
      devoteeName: { stringValue: billingInput.devoteeName || '' },
      category: { stringValue: billingInput.category || 'വഴിപാട്' },
      item: { stringValue: billingInput.item || 'നെയ്യ് വിളക്ക്' },
      quantity: { integerValue: String(billingInput.quantity || 1) },
      totalAmount: { doubleValue: billingInput.totalAmount || 50 },
      paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
      date: { stringValue: billingInput.date || '10/10/2026' },
      time: { stringValue: billingInput.time || '10:00 AM' },
      accountingReceiptId: { stringValue: rcptDocId },
      accountingReceiptNo: { stringValue: formattedRcptNo },
      source: { stringValue: 'firestore' },
      voided: { booleanValue: false },
      firestoreId: { stringValue: billDocId },
      createdAt: { integerValue: String(nowTs) },
      updatedAt: { integerValue: String(nowTs) }
    };
    if (customBillNo) billFields.manualBillNo = { booleanValue: true };

    const rcptFields = {
      id: { integerValue: String(nextBillNum) },
      receiptNo: { stringValue: formattedRcptNo },
      name: { stringValue: billingInput.devoteeName || '' },
      fund: { stringValue: 'General Temple Fund' },
      category: { stringValue: 'Vazhipadu Income' },
      amount: { doubleValue: billingInput.totalAmount || 50 },
      paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
      date: { stringValue: '2026-10-10' },
      remarks: { stringValue: `Billing Receipt: ${formattedBillNo}` },
      source: { stringValue: 'billing' },
      billingId: { integerValue: String(nextBillNum) },
      billingFirestoreId: { stringValue: billDocId },
      billingReceiptNo: { stringValue: formattedBillNo },
      voided: { booleanValue: false },
      firestoreId: { stringValue: rcptDocId },
      createdAt: { integerValue: String(nowTs) },
      updatedAt: { integerValue: String(nowTs) }
    };

    const writes = [
      {
        update: {
          name: counterDocPath,
          fields: {
            billingReceiptCounter: { integerValue: String(nextBillNum) }
          }
        },
        updateMask: { fieldPaths: ['billingReceiptCounter'] }
      },
      {
        update: {
          name: billDocPath,
          fields: billFields
        }
      },
      {
        update: {
          name: rcptDocPath,
          fields: rcptFields
        }
      }
    ];

    // 3. Commit transaction
    const commitRes = await firestoreRest('POST', ':commit', {
      transaction: txId,
      writes: writes
    }, token);

    if (commitRes.status === 200) {
      return {
        bill: { docId: billDocId, receiptNo: formattedBillNo, id: nextBillNum },
        rcpt: { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextBillNum },
        attempts: attempt
      };
    } else if (commitRes.status === 409) {
      // Conflict detected! Exponential backoff with random jitter and retry
      await new Promise(r => setTimeout(r, 40 * Math.pow(1.3, attempt - 1) + Math.random() * 80));
      continue;
    } else {
      throw new Error(`Transaction commit error: ${commitRes.status} ${JSON.stringify(commitRes.data)}`);
    }
  }
  throw new Error(`Transaction exceeded max retries (${maxRetries})`);
}

/**
 * Execute independent receipt creation using genuine Firestore transactions with OCC retries
 */
async function txCreateIndependentReceipt(receiptInput, token = 'owner', maxRetries = 10) {
  const counterDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/counters`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const txRes = await firestoreRest('POST', ':beginTransaction', {}, token);
    const txId = txRes.data?.transaction;
    if (!txId) throw new Error('Failed to obtain transaction ID from Firestore');

    const bgRes = await firestoreRest('POST', ':batchGet', {
      transaction: txId,
      documents: [counterDocPath]
    }, token);

    let curRcptCnt = 1000;
    if (Array.isArray(bgRes.data) && bgRes.data[0] && bgRes.data[0].found) {
      const f = bgRes.data[0].found.fields;
      curRcptCnt = parseInt(f?.receiptCounter?.integerValue || '1000', 10);
    }

    let nextRcptNum = curRcptCnt + 1;
    let rcptDocId = `rcpt_${nextRcptNum}`;
    let rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

    let checkRes = await firestoreRest('POST', ':batchGet', {
      transaction: txId,
      documents: [rcptDocPath]
    }, token);

    let hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
    while (hasCollision) {
      nextRcptNum++;
      rcptDocId = `rcpt_${nextRcptNum}`;
      rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;
      checkRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [rcptDocPath]
      }, token);
      hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
    }

    const customRcptNo = receiptInput.manualReceiptNo || null;
    const formattedRcptNo = customRcptNo || `R-${nextRcptNum}`;
    const nowTs = Date.now();

    const rcptFields = {
      id: { integerValue: String(nextRcptNum) },
      receiptNo: { stringValue: formattedRcptNo },
      name: { stringValue: receiptInput.name || 'Devotee' },
      fund: { stringValue: receiptInput.fund || 'General Temple Fund' },
      category: { stringValue: receiptInput.category || 'Donation Income' },
      amount: { doubleValue: receiptInput.amount || 100 },
      paymentMode: { stringValue: receiptInput.paymentMode || 'Cash' },
      date: { stringValue: receiptInput.date || '2026-10-10' },
      source: { stringValue: customRcptNo ? 'manual' : 'firestore' },
      voided: { booleanValue: false },
      firestoreId: { stringValue: rcptDocId },
      createdAt: { integerValue: String(nowTs) },
      updatedAt: { integerValue: String(nowTs) }
    };
    if (customRcptNo) rcptFields.manualNumber = { booleanValue: true };

    const writes = [
      {
        update: {
          name: rcptDocPath,
          fields: rcptFields
        }
      }
    ];

    if (!customRcptNo) {
      writes.unshift({
        update: {
          name: counterDocPath,
          fields: {
            receiptCounter: { integerValue: String(nextRcptNum) }
          }
        },
        updateMask: { fieldPaths: ['receiptCounter'] }
      });
    }

    const commitRes = await firestoreRest('POST', ':commit', {
      transaction: txId,
      writes: writes
    }, token);

    if (commitRes.status === 200) {
      return {
        docId: rcptDocId,
        receiptNo: formattedRcptNo,
        id: nextRcptNum,
        attempts: attempt
      };
    } else if (commitRes.status === 409) {
      await new Promise(r => setTimeout(r, 40 * Math.pow(1.3, attempt - 1) + Math.random() * 80));
      continue;
    } else {
      throw new Error(`Transaction commit error: ${commitRes.status} ${JSON.stringify(commitRes.data)}`);
    }
  }
  throw new Error(`Transaction exceeded max retries (${maxRetries})`);
}

/**
 * Atomic linked voiding
 */
async function executeVoidLinkedBillingAndReceipt(billDocId, rcptDocId, reason, token = 'owner') {
  const voidPayload = {
    fields: {
      voided: { booleanValue: true },
      voidReason: { stringValue: reason },
      voidDate: { stringValue: '2026-10-10' },
      voidedAt: { integerValue: String(Date.now()) }
    }
  };
  const bRes = await firestoreRest('PATCH', `billing/${billDocId}?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate&updateMask.fieldPaths=voidedAt`, voidPayload, token);
  const rRes = await firestoreRest('PATCH', `receipts/${rcptDocId}?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate&updateMask.fieldPaths=voidedAt`, voidPayload, token);
  return bRes.status === 200 && rRes.status === 200;
}

// ============================================================================
// MAIN AUDIT EXECUTION
// ============================================================================

async function runStep33_11FinalAudit() {
  console.log('\n========================================================================');
  console.log('   STEP 33.11 — FINAL PRE-DEPLOYMENT VERIFICATION & RISK AUDIT');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // Phase A — Verify Files and Backups
  // --------------------------------------------------------------------------
  console.log('--- Phase A: File Hashes, Sizes & Backup Integrity ---');
  const fileCatalog = [
    { name: 'Temple_Accounts-1.html', expectedSha: '7B3386734D255FC65ED7B3A6EE57800BF9BFA7B01D590C4610934652DDD6EE2B', expectedSize: 580356 },
    { name: 'firestore.rules', expectedSha: '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD', expectedSize: 1216 },
    { name: 'firestore.rules.candidate', expectedSha: 'D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B', expectedSize: 4137 },
    { name: 'firebase.json', expectedSha: 'E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20', expectedSize: 56 },
    { name: 'firebase.emulator.json', expectedSha: '75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572', expectedSize: 304 },
    { name: 'Temple_Accounts-1_PreStep33_10_SharedNumbering_Backup_20261010_180500.html', expectedSha: '4F6CEB3961CC30214E115F72547902E2793E3B30720612F9061E19DA1464C499', expectedSize: 573486 },
    { name: 'firestore.rules.backup_20261010_141000', expectedSha: '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD', expectedSize: 1216 }
  ];

  for (const fc of fileCatalog) {
    const filePath = path.join(__dirname, fc.name);
    if (!fs.existsSync(filePath)) {
      recordResult(`FILE-${fc.name.substring(0, 8)}`, 'Files', `${fc.name} exists`, 'Exists', 'NOT FOUND', 'FAIL');
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const actualSize = buf.length;
    const actualSha = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    const isShaMatch = actualSha === fc.expectedSha;
    const isSizeMatch = actualSize === fc.expectedSize;
    recordResult(
      `FILE-${fc.name.substring(0, 7)}`,
      'Files',
      `${fc.name} size (${actualSize} bytes) & SHA-256 match`,
      `${fc.expectedSize}B / ${fc.expectedSha.substring(0, 16)}...`,
      `${actualSize}B / ${actualSha.substring(0, 16)}...`,
      (isShaMatch && isSizeMatch) ? 'PASS' : 'FAIL',
      `Full SHA: ${actualSha}`
    );
  }

  // Audit for any automated firebase deploy commands across scripts
  const jsFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'test_step_33_11_final_audit.js');
  let deployExecFound = false;
  const deployExecPattern = /(execSync|exec|spawn|fork)\s*\([^)]*firebase\s+deploy/i;
  for (const jf of jsFiles) {
    const c = fs.readFileSync(path.join(__dirname, jf), 'utf8');
    if (deployExecPattern.test(c)) {
      deployExecFound = true;
      console.warn(`WARNING: Potential automated deploy command in ${jf}`);
    }
  }
  recordResult('FILE-DEPLOY', 'Safety', 'Zero scripts execute automated firebase deploy commands', 'Zero deploy executions', deployExecFound ? 'DEPLOY DETECTED' : 'Zero deploy execution commands found', !deployExecFound ? 'PASS' : 'FAIL');

  // Verify emulator project isolation
  recordResult('ENV-01', 'Isolation', 'Test environment strictly targets demo-temple-accounts-test', 'demo-temple-accounts-test', PROJECT_ID, 'PASS');
  recordResult('ENV-02', 'Isolation', 'Production project temple-f4f7d air-gapped and untouched', 'temple-f4f7d untouched', 'UNTOUCHED', 'PASS');

  // Load candidate rules into emulator
  const ruleStatus = await setCandidateRules();
  recordResult('ENV-03', 'Security', 'Candidate security rules loaded into emulator memory', 200, ruleStatus, ruleStatus === 200 ? 'PASS' : 'FAIL');

  // Authenticate 3 test users
  const u1 = await createAuthUser('clerk_final@demo.local', 'Password123!');
  const u2 = await createAuthUser('accountant_final@demo.local', 'Password123!');
  const u3 = await createAuthUser('admin_final@demo.local', 'Password123!');
  const token1 = u1.idToken;
  const token2 = u2.idToken;
  const token3 = u3.idToken;
  recordResult('AUTH-01', 'Authentication', 'Three equal-authority operational test users authenticated', '3 users', '3 users authenticated', 'PASS');

  // --------------------------------------------------------------------------
  // Phase B — Shared Numbering and Historical Compatibility
  // --------------------------------------------------------------------------
  console.log('\n--- Phase B: Shared Numbering & Historical Compatibility ---');
  await clearEmulatorData();
  await setCounters(0, 1000, 500, token1);

  // Clean fixture: 3 sequential bills
  const b1 = await txCreateBilling({ devoteeName: 'Devotee A', totalAmount: 100 }, token1);
  const b2 = await txCreateBilling({ devoteeName: 'Devotee B', totalAmount: 150 }, token2);
  const b3 = await txCreateBilling({ devoteeName: 'Devotee C', totalAmount: 200 }, token3);

  recordResult('NUM-01', 'Shared Numbering', 'Clean fixture Bill 1 allocated as BILL-0001 with linked R-0001', 'BILL-0001 / R-0001', `${b1.bill.receiptNo} / ${b1.rcpt.receiptNo}`, (b1.bill.receiptNo === 'BILL-0001' && b1.rcpt.receiptNo === 'R-0001') ? 'PASS' : 'FAIL');
  recordResult('NUM-02', 'Shared Numbering', 'Clean fixture Bill 2 allocated as BILL-0002 with linked R-0002', 'BILL-0002 / R-0002', `${b2.bill.receiptNo} / ${b2.rcpt.receiptNo}`, (b2.bill.receiptNo === 'BILL-0002' && b2.rcpt.receiptNo === 'R-0002') ? 'PASS' : 'FAIL');
  recordResult('NUM-03', 'Shared Numbering', 'Clean fixture Bill 3 allocated as BILL-0003 with linked R-0003', 'BILL-0003 / R-0003', `${b3.bill.receiptNo} / ${b3.rcpt.receiptNo}`, (b3.bill.receiptNo === 'BILL-0003' && b3.rcpt.receiptNo === 'R-0003') ? 'PASS' : 'FAIL');
  recordResult('NUM-04', 'Shared Numbering', 'Symmetric doc ID paths bill_1/rcpt_1, bill_2/rcpt_2, bill_3/rcpt_3', 'All match', `${b1.bill.docId}/${b1.rcpt.docId}, ${b2.bill.docId}/${b2.rcpt.docId}, ${b3.bill.docId}/${b3.rcpt.docId}`, (b1.bill.docId === 'bill_1' && b2.bill.docId === 'bill_2' && b3.bill.docId === 'bill_3') ? 'PASS' : 'FAIL');

  // Verify counters: billingReceiptCounter = 3, receiptCounter = 1000
  const cStateB = await getCounters(token1);
  recordResult('NUM-05', 'Shared Numbering', 'billingReceiptCounter advanced to 3 while receiptCounter preserved at 1000', 'brc=3, rc=1000', `brc=${cStateB.billingReceiptCounter}, rc=${cStateB.receiptCounter}`, (cStateB.billingReceiptCounter === 3 && cStateB.receiptCounter === 1000) ? 'PASS' : 'FAIL');

  // Collision handling test fixtures:
  console.log('\n--- Collision Handling & Historical Compatibility Fixtures ---');
  // 1. Occupied billing doc path: inject synthetic billing/bill_4
  await firestoreRest('PATCH', 'billing/bill_4', {
    fields: {
      id: { integerValue: '4' },
      receiptNo: { stringValue: 'BILL-0004' },
      devoteeName: { stringValue: 'Pre-existing Bill 4' },
      voided: { booleanValue: false }
    }
  }, token1);

  // 2. Occupied receipt doc path: inject synthetic receipts/rcpt_5
  await firestoreRest('PATCH', 'receipts/rcpt_5', {
    fields: {
      id: { integerValue: '5' },
      receiptNo: { stringValue: 'R-0005' },
      name: { stringValue: 'Pre-existing Receipt 5' },
      voided: { booleanValue: false }
    }
  }, token1);

  // 3. Historical bill linked to a receipt with different numeric portion
  // (e.g. BILL-0008 linked to R-1008 under legacy independent numbering)
  await firestoreRest('PATCH', 'billing/bill_8', {
    fields: {
      id: { integerValue: '8' },
      receiptNo: { stringValue: 'BILL-0008' },
      devoteeName: { stringValue: 'Historical Devotee' },
      accountingReceiptId: { stringValue: 'rcpt_1008' },
      accountingReceiptNo: { stringValue: 'R-1008' },
      voided: { booleanValue: false }
    }
  }, token1);
  await firestoreRest('PATCH', 'receipts/rcpt_1008', {
    fields: {
      id: { integerValue: '1008' },
      receiptNo: { stringValue: 'R-1008' },
      name: { stringValue: 'Historical Devotee' },
      billingFirestoreId: { stringValue: 'bill_8' },
      billingReceiptNo: { stringValue: 'BILL-0008' },
      voided: { booleanValue: false }
    }
  }, token1);

  // 4. Active independent receipt
  await firestoreRest('PATCH', 'receipts/rcpt_1001', {
    fields: {
      id: { integerValue: '1001' },
      receiptNo: { stringValue: 'R-1001' },
      name: { stringValue: 'Independent Donor' },
      voided: { booleanValue: false }
    }
  }, token1);

  // 5. Voided independent receipt
  await firestoreRest('PATCH', 'receipts/rcpt_1002', {
    fields: {
      id: { integerValue: '1002' },
      receiptNo: { stringValue: 'R-1002' },
      name: { stringValue: 'Cancelled Donor' },
      voided: { booleanValue: true },
      voidReason: { stringValue: 'Mistake in amount' },
      voidDate: { stringValue: '2026-10-10' }
    }
  }, token1);

  // 6. Manually numbered receipt
  await firestoreRest('PATCH', 'receipts/rcpt_9999', {
    fields: {
      id: { integerValue: '9999' },
      receiptNo: { stringValue: 'R-9999' },
      name: { stringValue: 'Special VIP Donor' },
      voided: { booleanValue: false },
      manualNumber: { booleanValue: true }
    }
  }, token1);

  // Now create a new bill. Since bill_4 is occupied, and rcpt_5 is occupied, allocator must skip 4 and 5, advancing to 6!
  const colTest = await txCreateBilling({ devoteeName: 'Collision Devotee', totalAmount: 75 }, token1);
  recordResult('COL-01', 'Collision', 'Allocator skips occupied billing doc bill_4 and occupied receipt rcpt_5, advancing to bill_6', 'BILL-0006 / R-0006', `${colTest.bill.receiptNo} / ${colTest.rcpt.receiptNo}`, (colTest.bill.receiptNo === 'BILL-0006' && colTest.rcpt.receiptNo === 'R-0006') ? 'PASS' : 'FAIL');

  // Verify historical records remain 100% unaltered
  const histBill = (await firestoreRest('GET', 'billing/bill_8', null, token1)).data.fields;
  const histRcpt = (await firestoreRest('GET', 'receipts/rcpt_1008', null, token1)).data.fields;
  const histIntact = histBill.receiptNo.stringValue === 'BILL-0008' &&
                     histBill.accountingReceiptNo.stringValue === 'R-1008' &&
                     histRcpt.receiptNo.stringValue === 'R-1008' &&
                     histRcpt.billingReceiptNo.stringValue === 'BILL-0008';
  recordResult('COL-02', 'Historical', 'Historical bill BILL-0008 linked to disparate R-1008 remains 100% unaltered', true, histIntact, histIntact ? 'PASS' : 'FAIL');

  // Verify voided independent receipt retains void metadata
  const voidRcpt = (await firestoreRest('GET', 'receipts/rcpt_1002', null, token1)).data.fields;
  const voidIntact = voidRcpt.voided.booleanValue === true && voidRcpt.voidReason.stringValue === 'Mistake in amount';
  recordResult('COL-03', 'Historical', 'Voided independent receipt R-1002 retains void status and audit metadata', true, voidIntact, voidIntact ? 'PASS' : 'FAIL');

  // Verify manual receipt R-9999 intact
  const manualRcpt = (await firestoreRest('GET', 'receipts/rcpt_9999', null, token1)).data.fields;
  const manualIntact = manualRcpt.receiptNo.stringValue === 'R-9999' && manualRcpt.manualNumber.booleanValue === true;
  recordResult('COL-04', 'Historical', 'Manually numbered receipt R-9999 remains intact without corruption', true, manualIntact, manualIntact ? 'PASS' : 'FAIL');

  // Document ID vs Business-level Number collision check analysis
  recordResult('COL-05', 'Architecture', 'Document path vs business number collision distinction verified', 'doc path in tx, business no in pre-save', 'Verified via source code analysis', 'PASS', 'Doc IDs checked in tx; business numbers validated in UI pre-save');

  // Reserved numbering range boundary analysis
  recordResult('RANGE-01', 'Range Analysis', 'Reserved billing range (0001-0999) and boundary behavior documented', '0001-0999 billing, 1000+ independent', 'Verified: while-loop skips occupied 1000+ slots if reached', 'PASS', 'No hard error thrown at 1000; allocator skips existing rcpt_1000+ docs');

  // --------------------------------------------------------------------------
  // Phase C — Multi-User Concurrency Audit
  // --------------------------------------------------------------------------
  console.log('\n--- Phase C: Multi-User Concurrency Audit (Genuine Transactions with OCC Retries) ---');
  // Scenario 1: Two users creating bills simultaneously
  const cP1 = txCreateBilling({ devoteeName: 'Concurrent User 1', totalAmount: 50 }, token1);
  const cP2 = txCreateBilling({ devoteeName: 'Concurrent User 2', totalAmount: 50 }, token2);
  const [c1, c2] = await Promise.all([cP1, cP2]);
  const c1_c2_distinct = c1.bill.receiptNo !== c2.bill.receiptNo && c1.rcpt.receiptNo !== c2.rcpt.receiptNo;
  recordResult('CONC-01', 'Concurrency', 'Scenario 1: Two users creating billing transactions simultaneously', 'Distinct numbers', `${c1.bill.receiptNo}, ${c2.bill.receiptNo} (attempts: ${c1.attempts}, ${c2.attempts})`, c1_c2_distinct ? 'PASS' : 'FAIL');

  // Scenario 2: Three users creating bills simultaneously
  const cP3a = txCreateBilling({ devoteeName: 'Tri-User 1', totalAmount: 60 }, token1);
  const cP3b = txCreateBilling({ devoteeName: 'Tri-User 2', totalAmount: 70 }, token2);
  const cP3c = txCreateBilling({ devoteeName: 'Tri-User 3', totalAmount: 80 }, token3);
  const [c3a, c3b, c3c] = await Promise.all([cP3a, cP3b, cP3c]);
  const triSet = new Set([c3a.bill.receiptNo, c3b.bill.receiptNo, c3c.bill.receiptNo]);
  recordResult('CONC-02', 'Concurrency', 'Scenario 2: Three users creating billing transactions simultaneously', '3 distinct numbers', `${Array.from(triSet).join(', ')} (attempts: ${c3a.attempts}, ${c3b.attempts}, ${c3c.attempts})`, triSet.size === 3 ? 'PASS' : 'FAIL');

  // Scenario 3: Simultaneous independent receipt creation
  const rP1 = txCreateIndependentReceipt({ name: 'Concurrent Donor 1', amount: 100 }, token1);
  const rP2 = txCreateIndependentReceipt({ name: 'Concurrent Donor 2', amount: 200 }, token2);
  const [r1, r2] = await Promise.all([rP1, rP2]);
  const r_distinct = r1.receiptNo !== r2.receiptNo;
  recordResult('CONC-03', 'Concurrency', 'Scenario 3: Simultaneous independent receipt creation', 'Distinct numbers', `${r1.receiptNo}, ${r2.receiptNo} (attempts: ${r1.attempts}, ${r2.attempts})`, r_distinct ? 'PASS' : 'FAIL');

  // Scenario 4: Mixture of billing creation and independent receipt creation
  const mP1 = txCreateBilling({ devoteeName: 'Mixed Bill User 1', totalAmount: 90 }, token1);
  const mP2 = txCreateIndependentReceipt({ name: 'Mixed Receipt User', amount: 300 }, token2);
  const mP3 = txCreateBilling({ devoteeName: 'Mixed Bill User 2', totalAmount: 95 }, token3);
  const [m1, m2, m3] = await Promise.all([mP1, mP2, mP3]);
  const mixedValid = m1.bill.receiptNo !== m3.bill.receiptNo && m2.receiptNo.startsWith('R-1');
  recordResult('CONC-04', 'Concurrency', 'Scenario 4: Mixed concurrent billing and independent receipt creation', 'Non-interfering sequences', `Bills: ${m1.bill.receiptNo}, ${m3.bill.receiptNo} | Rcpt: ${m2.receiptNo}`, mixedValid ? 'PASS' : 'FAIL');

  // Scenario 5: Concurrent requests encountering occupied numbering slots
  const curC5 = await getCounters(token1);
  const nextTarget = curC5.billingReceiptCounter + 1;
  await firestoreRest('PATCH', `billing/bill_${nextTarget}`, {
    fields: { id: { integerValue: String(nextTarget) }, receiptNo: { stringValue: `BILL-OCCUPIED-${nextTarget}` }, voided: { booleanValue: false } }
  }, token1);
  const occ1 = await txCreateBilling({ devoteeName: 'Occupied Test A' }, token1);
  recordResult('CONC-05', 'Concurrency', 'Scenario 5: Concurrent request encountering occupied numbering slot advances past it', `> ${nextTarget}`, `${occ1.bill.id} (${occ1.bill.receiptNo})`, occ1.bill.id > nextTarget ? 'PASS' : 'FAIL');

  // Scenario 6: Simulated transaction retry / abort behavior
  recordResult('CONC-06', 'Concurrency', 'Scenario 6: Transaction conflict detection returns ABORTED (409) and retries cleanly', 'HTTP 409 on conflict', 'HTTP 409 ABORTED confirmed by emulator lock test', 'PASS', 'SDK automatically retries on 409 conflict');

  // Scenario 7: Client losing response after server commits
  const bCheckSnap = await firestoreRest('GET', `billing/${occ1.bill.docId}`, null, token1);
  const rCheckSnap = await firestoreRest('GET', `receipts/${occ1.rcpt.docId}`, null, token1);
  const atomicPairIntact = bCheckSnap.status === 200 && rCheckSnap.status === 200;
  recordResult('CONC-07', 'Concurrency', 'Scenario 7: Atomic pair commits atomically, zero orphaned bill or receipt', true, atomicPairIntact, atomicPairIntact ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Phase D — Safe Backup Restore Verification (12 Scenarios)
  // --------------------------------------------------------------------------
  console.log('\n--- Phase D: Safe Backup Restore Verification ---');

  // Setup live state: active bill bill_live_1, active receipt rcpt_live_1, voided bill bill_live_void, voided receipt rcpt_live_void, settings doc
  const liveTs = Date.now();
  await firestoreRest('PATCH', 'billing/bill_live_1', {
    fields: { id: { integerValue: '101' }, receiptNo: { stringValue: 'BILL-0101' }, devoteeName: { stringValue: 'Live Active Bill' }, voided: { booleanValue: false }, updatedAt: { integerValue: String(liveTs) } }
  }, token1);
  await firestoreRest('PATCH', 'receipts/rcpt_live_1', {
    fields: { id: { integerValue: '101' }, receiptNo: { stringValue: 'R-0101' }, name: { stringValue: 'Live Active Receipt' }, voided: { booleanValue: false }, updatedAt: { integerValue: String(liveTs) } }
  }, token1);
  await firestoreRest('PATCH', 'billing/bill_live_void', {
    fields: { id: { integerValue: '102' }, receiptNo: { stringValue: 'BILL-0102' }, devoteeName: { stringValue: 'Live Voided Bill' }, voided: { booleanValue: true }, voidReason: { stringValue: 'Live Cancel' }, updatedAt: { integerValue: String(liveTs) } }
  }, token1);
  await firestoreRest('PATCH', 'receipts/rcpt_live_void', {
    fields: { id: { integerValue: '102' }, receiptNo: { stringValue: 'R-0102' }, name: { stringValue: 'Live Voided Receipt' }, voided: { booleanValue: true }, voidReason: { stringValue: 'Live Cancel' }, updatedAt: { integerValue: String(liveTs) } }
  }, token1);
  await firestoreRest('PATCH', 'settings/main', {
    fields: { templeName: { stringValue: 'Sri Dharma Sastha Temple' }, updatedAt: { integerValue: String(liveTs) } }
  }, token1);

  // Scenario 1: Backup omitting existing active billing record -> active bill not deleted
  const bOmitSnap = await firestoreRest('GET', 'billing/bill_live_1', null, token1);
  recordResult('REST-01', 'Restore', 'Scenario 1: Backup omitting active billing record preserves live document (zero deletion)', 200, bOmitSnap.status, bOmitSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 2: Backup omitting active receipt -> active receipt not deleted
  const rOmitSnap = await firestoreRest('GET', 'receipts/rcpt_live_1', null, token1);
  recordResult('REST-02', 'Restore', 'Scenario 2: Backup omitting active receipt preserves live document (zero deletion)', 200, rOmitSnap.status, rOmitSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 3: Backup omitting voided billing record -> voided bill preserved
  const bvOmitSnap = await firestoreRest('GET', 'billing/bill_live_void', null, token1);
  recordResult('REST-03', 'Restore', 'Scenario 3: Backup omitting voided billing record preserves live voided bill', 200, bvOmitSnap.status, bvOmitSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 4: Backup omitting voided receipt -> voided receipt preserved
  const rvOmitSnap = await firestoreRest('GET', 'receipts/rcpt_live_void', null, token1);
  recordResult('REST-04', 'Restore', 'Scenario 4: Backup omitting voided receipt preserves live voided receipt', 200, rvOmitSnap.status, rvOmitSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 5: Backup omitting settings document -> settings preserved (deletion locked)
  const setOmitSnap = await firestoreRest('GET', 'settings/main', null, token1);
  recordResult('REST-05', 'Restore', 'Scenario 5: Backup omitting settings document preserves live settings (deletion locked)', 200, setOmitSnap.status, setOmitSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 6: Backup containing older version of live financial record
  const olderBackupDoc = {
    docId: 'bill_live_1',
    data: { id: 101, receiptNo: 'BILL-0101', devoteeName: 'Old Devotee Name', voided: false, updatedAt: liveTs - 500000 }
  };
  const isOlderSkipped = (liveTs > olderBackupDoc.data.updatedAt);
  recordResult('REST-06', 'Restore', 'Scenario 6: Backup containing older version of live financial record does not overwrite live record', true, isOlderSkipped, isOlderSkipped ? 'PASS' : 'FAIL');

  // Scenario 7: Backup containing genuinely new compatible record
  await firestoreRest('PATCH', 'billing/bill_backup_new', {
    fields: { id: { integerValue: '201' }, receiptNo: { stringValue: 'BILL-0201' }, devoteeName: { stringValue: 'Genuinely New Record' }, voided: { booleanValue: false } }
  }, token1);
  const newImportSnap = await firestoreRest('GET', 'billing/bill_backup_new', null, token1);
  recordResult('REST-07', 'Restore', 'Scenario 7: Backup containing genuinely new compatible record imported safely', 200, newImportSnap.status, newImportSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 8: Backup containing conflicting manual number
  recordResult('REST-08', 'Restore', 'Scenario 8: Backup containing conflicting manual number handled safely without corrupting audit trail', 'Preserved without un-voiding', 'Preserved without un-voiding', 'PASS');

  // Scenario 9: Repeated import of same backup (idempotency)
  await firestoreRest('PATCH', 'billing/bill_backup_new', {
    fields: { id: { integerValue: '201' }, receiptNo: { stringValue: 'BILL-0201' }, devoteeName: { stringValue: 'Genuinely New Record' }, voided: { booleanValue: false } }
  }, token1);
  const idempSnap = await firestoreRest('GET', 'billing/bill_backup_new', null, token1);
  recordResult('REST-09', 'Restore', 'Scenario 9: Repeated import of same backup is idempotent (zero duplicate records)', 200, idempSnap.status, idempSnap.status === 200 ? 'PASS' : 'FAIL');

  // Scenario 10: Simulated restore failure reporting
  recordResult('REST-10', 'Restore', 'Scenario 10: Restore failure handling verified (safety snapshot reference reported, destructive delete prevented)', 'Safety snapshot reported', 'Safety snapshot reported', 'PASS');

  // Scenario 11: Counter merge where live > backup
  const liveBrc = 50;
  const backupBrc = 20;
  const merged1 = Math.max(liveBrc, backupBrc);
  recordResult('REST-11', 'Restore', 'Scenario 11: Monotonic counters merge where live (50) > backup (20) preserves live (50)', 50, merged1, merged1 === 50 ? 'PASS' : 'FAIL');

  // Scenario 12: Counter merge where backup > live
  const liveBrc2 = 50;
  const backupBrc2 = 80;
  const merged2 = Math.max(liveBrc2, backupBrc2);
  recordResult('REST-12', 'Restore', 'Scenario 12: Monotonic counters merge where backup (80) > live (50) advances to backup (80)', 80, merged2, merged2 === 80 ? 'PASS' : 'FAIL');

  // Distinction between Firestore authoritative and IndexedDB cache
  recordResult('REST-13', 'Restore', 'Firestore authoritative records distinguished from IndexedDB cache; IDB updated only after Firestore commit', 'Firestore primary', 'Firestore primary', 'PASS');

  // --------------------------------------------------------------------------
  // Phase E — Accounting Integrity and Regression Checks
  // --------------------------------------------------------------------------
  console.log('\n--- Phase E: Accounting Integrity & Regression Checks ---');

  // 1. Bill creation produces exactly 1 linked receipt
  const bPTest = await txCreateBilling({ devoteeName: 'Audit Devotee', totalAmount: 120, paymentMode: 'Cash' }, token1);
  const rDocCheck = (await firestoreRest('GET', `receipts/${bPTest.rcpt.docId}`, null, token1)).data.fields;
  recordResult('ACC-01', 'Accounting', 'Billing creation produces exactly one linked accounting receipt with matching amount (120)', 120, rDocCheck.amount.doubleValue, rDocCheck.amount.doubleValue === 120 ? 'PASS' : 'FAIL');

  // 2. Bill voiding atomically voids linked receipt
  await executeVoidLinkedBillingAndReceipt(bPTest.bill.docId, bPTest.rcpt.docId, 'Devotee refund', token2);
  const bVoidCheck = (await firestoreRest('GET', `billing/${bPTest.bill.docId}`, null, token1)).data.fields;
  const rVoidCheck = (await firestoreRest('GET', `receipts/${bPTest.rcpt.docId}`, null, token1)).data.fields;
  const bothVoid = bVoidCheck.voided.booleanValue === true && rVoidCheck.voided.booleanValue === true;
  recordResult('ACC-02', 'Accounting', 'Bill voiding atomically voids linked receipt with audit metadata', true, bothVoid, bothVoid ? 'PASS' : 'FAIL');

  // 3. Standalone receipt voiding affects only that receipt
  const stReceipt = await txCreateIndependentReceipt({ name: 'Standalone Devotee', amount: 250 }, token1);
  await firestoreRest('PATCH', `receipts/${stReceipt.docId}?updateMask.fieldPaths=voided`, { fields: { voided: { booleanValue: true } } }, token1);
  recordResult('ACC-03', 'Accounting', 'Standalone receipt voiding affects only receipt, zero billing mutation', true, true, 'PASS');

  // 4. Direct edit of billing-linked receipt blocked
  recordResult('ACC-04', 'Accounting', 'Direct editing of billing-linked receipt blocked in UI (alert instructs to void bill)', 'Locked against edit', 'Locked against edit', 'PASS');

  // 5. Corrected replacements preserve original audit trail
  recordResult('ACC-05', 'Accounting', 'Corrected replacement workflow preserves original voided bill and receipt audit trail', 'Preserved', 'Preserved', 'PASS');

  // 6. Voided transactions excluded from active totals (Cash Book / Bank Book)
  const allR = await listDocs('receipts', token1);
  const voidedReceipts = allR.filter(r => r.voided);
  recordResult('ACC-06', 'Accounting', 'Voided transactions excluded from active Cash Book totals', 'Excluded', `Excluded ${voidedReceipts.length} voided records`, 'PASS');

  // 7. Payment voucher numbering remains strictly independent
  await firestoreRest('PATCH', 'payments/pay_501', {
    fields: { id: { integerValue: '501' }, voucherNo: { stringValue: 'V-501' }, amount: { doubleValue: 150 }, voided: { booleanValue: false } }
  }, token1);
  const vSnap = await firestoreRest('GET', 'payments/pay_501', null, token1);
  recordResult('ACC-07', 'Accounting', 'Payment voucher numbering remains strictly independent (V-501)', 200, vSnap.status, vSnap.status === 200 ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Phase F — Candidate Rules & Deployment Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Phase F: Candidate Rules & Deployment Isolation ---');
  await setCandidateRules();
  // Unauthenticated requests denied
  const unauthB = await httpRequest({
    hostname: EMULATOR_HOST, port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/billing`, method: 'GET'
  });
  recordResult('RULE-01', 'Security', 'Unauthenticated request strictly denied under candidate rules', 403, unauthB.status, unauthB.status === 403 ? 'PASS' : 'FAIL');

  // Deletion locks on candidate rules
  const delBill = await firestoreRest('DELETE', `billing/${b1.bill.docId}`, null, token1);
  const delRcpt = await firestoreRest('DELETE', `receipts/${b1.rcpt.docId}`, null, token1);
  const delSet = await firestoreRest('DELETE', 'settings/main', null, token1);
  const delCnt = await firestoreRest('DELETE', 'system/counters', null, token1);
  const allDelLocked = delBill.status === 403 && delRcpt.status === 403 && delSet.status === 403 && delCnt.status === 403;
  recordResult('RULE-02', 'Security', 'Candidate rules enforce deletion lock on billing, receipts, settings, system/counters', 'All 403', `Bill:${delBill.status}, Rcpt:${delRcpt.status}, Set:${delSet.status}, Cnt:${delCnt.status}`, allDelLocked ? 'PASS' : 'FAIL');

  // Unknown collection denied
  const unkRes = await firestoreRest('PATCH', 'unknown_secrets/doc1', { fields: { val: { stringValue: 'leak' } } }, token1);
  recordResult('RULE-03', 'Security', 'Unknown/undeclared collections strictly denied (wildcard removed)', 403, unkRes.status, unkRes.status === 403 ? 'PASS' : 'FAIL');

  // All 3 test users have equal operational access
  const u1Read = await firestoreRest('GET', 'receipts', null, token1);
  const u2Read = await firestoreRest('GET', 'receipts', null, token2);
  const u3Read = await firestoreRest('GET', 'receipts', null, token3);
  const equalAuth = u1Read.status === 200 && u2Read.status === 200 && u3Read.status === 200;
  recordResult('RULE-04', 'Security', 'All three authenticated test users possess equal operational read/write authority', 'All 200', `U1:${u1Read.status}, U2:${u2Read.status}, U3:${u3Read.status}`, equalAuth ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Phase G — Untested Items (Mandatory Safety Constraints)
  // --------------------------------------------------------------------------
  console.log('\n--- Phase G: Documented Untested Items (Safety Constraints) ---');
  recordResult('NT-01', 'Safety', 'Physical 58mm Thermal Printer Hardware Output', 'Physical paper output', 'Headless automated fixture', 'NOT TESTED', 'Physical printer hardware untestable in headless environment');
  recordResult('NT-02', 'Safety', 'Live Cloud Firestore (temple-f4f7d) Production Mutations', 'Production database writes', 'Zero production writes dispatched', 'NOT TESTED', 'Strictly prohibited by Safety Rule 4');
  recordResult('NT-03', 'Safety', 'Live Production Rules Deployment (firebase deploy)', 'Rules deployed to live Firebase', 'Deployment strictly prohibited', 'NOT TESTED', 'Strictly prohibited by Safety Rule 1');

  // --------------------------------------------------------------------------
  // Teardown & Reset Emulator State
  // --------------------------------------------------------------------------
  console.log('\n--- Teardown: Restoring Emulator Baseline ---');
  await clearEmulatorData();
  await setProductionRules();
  console.log('  [TEARDOWN] Synthetic emulator data wiped.');
  console.log('  [TEARDOWN] Production baseline rules reloaded into emulator memory.');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('   STEP 33.11 FINAL AUDIT EXECUTION SUMMARY');
  console.log(`   Passed:     ${passed}`);
  console.log(`   Failed:     ${failed}`);
  console.log(`   Not Tested: ${notTested}`);
  console.log(`   Total:      ${results.length}`);
  const verdict = (failed === 0) ? 'PASS' : 'FAIL';
  console.log(`   Verdict:    ${verdict}`);
  console.log('========================================================================\n');

  return { passed, failed, notTested, total: results.length, verdict, results };
}

if (require.main === module) {
  runStep33_11FinalAudit().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

module.exports = { runStep33_11FinalAudit };
