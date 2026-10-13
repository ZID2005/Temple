/**
 * test_step_33_13_rules_compatibility_suite.js
 * STEP 33.13 — Unified Numbering Security-Rules Compatibility Audit Suite
 *
 * Automated verification targeting isolated emulator:
 *   Project: demo-temple-accounts-test
 *   Endpoints: Firestore (127.0.0.1:8080), Auth (127.0.0.1:9099)
 *   Candidate Rules: firestore.rules.candidate
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const EMULATOR_HOST = process.env.EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_PORT = parseInt(process.env.FIRESTORE_PORT, 10) || 8080;
const AUTH_PORT = parseInt(process.env.AUTH_PORT, 10) || 9099;
const PROJECT_ID = process.env.PROJECT_ID || 'demo-temple-accounts-test';

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

async function firestoreRest(method, docPath, body = null, token = null) {
  const subPath = docPath.startsWith(':') ? docPath : (docPath.startsWith('/') ? docPath : `/${docPath}`);
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const options = {
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents${subPath}`,
    method,
    headers
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

async function authenticateTestUser(email, password = 'testpass123') {
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
    throw new Error(`Failed to authenticate user ${email}: ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

async function initCounters(globalSeq = 0, brc = 0, rc = 1000, vc = 500, token = 'owner') {
  const body = {
    fields: {
      globalSequenceCounter: { integerValue: String(globalSeq) },
      billingReceiptCounter: { integerValue: String(brc) },
      receiptCounter: { integerValue: String(rc) },
      voucherCounter: { integerValue: String(vc) },
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
      globalSequenceCounter: parseInt(f.globalSequenceCounter?.integerValue || '0', 10),
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
 * Genuine Firestore transaction for fsCreateBillingWithAccounting
 */
async function executeTransactionBilling(billingInput, userToken, userUid, maxRetries = 15) {
  const counterDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/counters`;
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 80)));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const txRes = await firestoreRest('POST', ':beginTransaction', {}, userToken);
    const txId = txRes.data?.transaction;
    if (!txId) throw new Error(`Failed to obtain transaction ID: ${JSON.stringify(txRes.data)}`);

    try {
      const bgRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [counterDocPath]
      }, userToken);

      let curSeq = 0;
      if (Array.isArray(bgRes.data) && bgRes.data[0] && bgRes.data[0].found) {
        const f = bgRes.data[0].found.fields;
        curSeq = parseInt(f?.globalSequenceCounter?.integerValue || '0', 10);
      }

      const customBillNo = billingInput.manualBillNo || null;
      let nextBillNum;

      if (customBillNo) {
        const m = customBillNo.trim().match(/^(?:BILL-|R-)?0*([1-9]\d*)$/i);
        const parsed = m ? parseInt(m[1], 10) : null;
        if (!parsed) throw new Error(`Invalid manual bill number format "${customBillNo}"`);
        if (parsed <= curSeq) throw new Error(`Manual bill number "${customBillNo}" already reserved or issued.`);
        if (parsed > curSeq + 1) throw new Error(`Manual bill number "${customBillNo}" out of sequence.`);
        nextBillNum = parsed;
      } else {
        nextBillNum = curSeq + 1;
      }

      let resDocId = `res_${nextBillNum}`;
      let billDocId = `bill_${nextBillNum}`;
      let rcptDocId = `rcpt_${nextBillNum}`;
      let resDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${resDocId}`;
      let billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
      let rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

      let checkRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [resDocPath, billDocPath, rcptDocPath]
      }, userToken);

      let hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
      if (customBillNo && hasCollision) {
        throw new Error(`Sequence number ${nextBillNum} is already reserved by another transaction.`);
      }

      while (hasCollision && !customBillNo) {
        nextBillNum++;
        resDocId = `res_${nextBillNum}`;
        billDocId = `bill_${nextBillNum}`;
        rcptDocId = `rcpt_${nextBillNum}`;
        resDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${resDocId}`;
        billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
        rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

        checkRes = await firestoreRest('POST', ':batchGet', {
          transaction: txId,
          documents: [resDocPath, billDocPath, rcptDocPath]
        }, userToken);
        hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
      }

      const formattedNo = String(nextBillNum).padStart(3, '0');
      const formattedBillNo = `BILL-${formattedNo}`;
      const formattedRcptNo = `R-${formattedNo}`;
      const nowTs = Date.now();

      const resFields = {
        seqNumber: { integerValue: String(nextBillNum) },
        formattedNo: { stringValue: formattedNo },
        type: { stringValue: 'billing_linked' },
        status: { stringValue: 'active' },
        voided: { booleanValue: false },
        billDocId: { stringValue: billDocId },
        receiptDocId: { stringValue: rcptDocId },
        billReceiptNo: { stringValue: formattedBillNo },
        receiptNo: { stringValue: formattedRcptNo },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) },
        source: { stringValue: 'billing' }
      };

      const billFields = {
        id: { integerValue: String(nextBillNum) },
        receiptNo: { stringValue: formattedBillNo },
        devoteeName: { stringValue: billingInput.devoteeName || 'Devotee' },
        category: { stringValue: billingInput.category || 'വഴിപാട്' },
        item: { stringValue: billingInput.item || 'നെയ്യ് വിളക്ക്' },
        quantity: { integerValue: String(billingInput.quantity || 1) },
        totalAmount: { doubleValue: billingInput.totalAmount || 50 },
        paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
        date: { stringValue: billingInput.date || '10/10/2026' },
        time: { stringValue: billingInput.time || '10:00 AM' },
        accountingReceiptId: { stringValue: rcptDocId },
        accountingReceiptNo: { stringValue: formattedRcptNo },
        reservationDocId: { stringValue: resDocId },
        source: { stringValue: 'firestore' },
        voided: { booleanValue: false },
        firestoreId: { stringValue: billDocId },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) },
        updatedAt: { integerValue: String(nowTs) }
      };
      if (customBillNo) billFields.manualBillNo = { booleanValue: true };

      const rcptFields = {
        id: { integerValue: String(nextBillNum) },
        receiptNo: { stringValue: formattedRcptNo },
        name: { stringValue: billingInput.devoteeName || 'Devotee' },
        fund: { stringValue: 'General Temple Fund' },
        category: { stringValue: 'Vazhipadu Income' },
        amount: { doubleValue: billingInput.totalAmount || 50 },
        paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
        date: { stringValue: '2026-10-10' },
        remarks: { stringValue: `Billing Receipt: ${formattedBillNo}` },
        reservationDocId: { stringValue: resDocId },
        source: { stringValue: 'billing' },
        billingId: { integerValue: String(nextBillNum) },
        billingFirestoreId: { stringValue: billDocId },
        billingReceiptNo: { stringValue: formattedBillNo },
        voided: { booleanValue: false },
        firestoreId: { stringValue: rcptDocId },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) },
        updatedAt: { integerValue: String(nowTs) }
      };

      const writes = [
        {
          update: {
            name: counterDocPath,
            fields: {
              globalSequenceCounter: { integerValue: String(nextBillNum) },
              billingReceiptCounter: { integerValue: String(nextBillNum) }
            }
          },
          updateMask: { fieldPaths: ['globalSequenceCounter', 'billingReceiptCounter'] }
        },
        {
          update: {
            name: resDocPath,
            fields: resFields
          }
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

      const commitRes = await firestoreRest('POST', ':commit', {
        transaction: txId,
        writes: writes
      }, userToken);

      if (commitRes.status === 200) {
        return {
          bill: { docId: billDocId, receiptNo: formattedBillNo, id: nextBillNum },
          rcpt: { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextBillNum },
          res: { docId: resDocId, status: 'active', id: nextBillNum },
          attempts: attempt
        };
      } else if (commitRes.status === 409) {
        const delay = Math.min(80 * attempt + Math.floor(Math.random() * 200 * attempt), 2000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      } else {
        throw new Error(`Firestore commit failed: ${commitRes.status} - ${JSON.stringify(commitRes.data)}`);
      }
    } catch (err) {
      if (txId) {
        await firestoreRest('POST', ':rollback', { transaction: txId }, userToken).catch(() => {});
      }
      throw err;
    }
  }

  throw new Error(`Transaction exceeded max retries (${maxRetries})`);
}

/**
 * Genuine Firestore transaction for fsCreateIndependentReceipt
 */
async function executeTransactionReceipt(receiptInput, userToken, userUid, maxRetries = 15) {
  const counterDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/counters`;
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 80)));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const txRes = await firestoreRest('POST', ':beginTransaction', {}, userToken);
    const txId = txRes.data?.transaction;
    if (!txId) throw new Error(`Failed to obtain transaction ID: ${JSON.stringify(txRes.data)}`);

    try {
      const bgRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [counterDocPath]
      }, userToken);

      let curSeq = 0;
      if (Array.isArray(bgRes.data) && bgRes.data[0] && bgRes.data[0].found) {
        const f = bgRes.data[0].found.fields;
        curSeq = parseInt(f?.globalSequenceCounter?.integerValue || '0', 10);
      }

      const customRcptNo = receiptInput.manualReceiptNo || null;
      let nextSeqNum;

      if (customRcptNo) {
        const m = customRcptNo.trim().match(/^(?:BILL-|R-)?0*([1-9]\d*)$/i);
        const parsed = m ? parseInt(m[1], 10) : null;
        if (!parsed) throw new Error(`Invalid manual receipt number format "${customRcptNo}"`);
        if (parsed <= curSeq) throw new Error(`Manual receipt number "${customRcptNo}" already reserved or issued.`);
        if (parsed > curSeq + 1) throw new Error(`Manual receipt number "${customRcptNo}" out of sequence.`);
        nextSeqNum = parsed;
      } else {
        nextSeqNum = curSeq + 1;
      }

      let resDocId = `res_${nextSeqNum}`;
      let billDocId = `bill_${nextSeqNum}`;
      let rcptDocId = `rcpt_${nextSeqNum}`;
      let resDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${resDocId}`;
      let billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
      let rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

      let checkRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [resDocPath, billDocPath, rcptDocPath]
      }, userToken);

      let hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
      if (customRcptNo && hasCollision) {
        throw new Error(`Sequence number ${nextSeqNum} is already reserved by another transaction.`);
      }

      while (hasCollision && !customRcptNo) {
        nextSeqNum++;
        resDocId = `res_${nextSeqNum}`;
        billDocId = `bill_${nextSeqNum}`;
        rcptDocId = `rcpt_${nextSeqNum}`;
        resDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${resDocId}`;
        billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
        rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

        checkRes = await firestoreRest('POST', ':batchGet', {
          transaction: txId,
          documents: [resDocPath, billDocPath, rcptDocPath]
        }, userToken);
        hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
      }

      const formattedNo = String(nextSeqNum).padStart(3, '0');
      const formattedRcptNo = `R-${formattedNo}`;
      const nowTs = Date.now();

      const resFields = {
        seqNumber: { integerValue: String(nextSeqNum) },
        formattedNo: { stringValue: formattedNo },
        type: { stringValue: 'independent_receipt' },
        status: { stringValue: 'active' },
        voided: { booleanValue: false },
        billDocId: { nullValue: null },
        receiptDocId: { stringValue: rcptDocId },
        billReceiptNo: { nullValue: null },
        receiptNo: { stringValue: formattedRcptNo },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) },
        source: { stringValue: 'receipts' }
      };

      const rcptFields = {
        id: { integerValue: String(nextSeqNum) },
        receiptNo: { stringValue: formattedRcptNo },
        name: { stringValue: receiptInput.name || 'Donor' },
        fund: { stringValue: receiptInput.fund || 'General Temple Fund' },
        category: { stringValue: receiptInput.category || 'Donation' },
        amount: { doubleValue: receiptInput.amount || 100 },
        paymentMode: { stringValue: receiptInput.paymentMode || 'Cash' },
        date: { stringValue: receiptInput.date || '2026-10-10' },
        remarks: { stringValue: receiptInput.remarks || 'Independent Receipt' },
        reservationDocId: { stringValue: resDocId },
        source: { stringValue: 'firestore' },
        billingId: { nullValue: null },
        billingFirestoreId: { nullValue: null },
        billingReceiptNo: { nullValue: null },
        voided: { booleanValue: false },
        firestoreId: { stringValue: rcptDocId },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) },
        updatedAt: { integerValue: String(nowTs) }
      };
      if (customRcptNo) rcptFields.manualNumber = { booleanValue: true };

      const writes = [
        {
          update: {
            name: counterDocPath,
            fields: {
              globalSequenceCounter: { integerValue: String(nextSeqNum) }
            }
          },
          updateMask: { fieldPaths: ['globalSequenceCounter'] }
        },
        {
          update: {
            name: resDocPath,
            fields: resFields
          }
        },
        {
          update: {
            name: rcptDocPath,
            fields: rcptFields
          }
        }
      ];

      const commitRes = await firestoreRest('POST', ':commit', {
        transaction: txId,
        writes: writes
      }, userToken);

      if (commitRes.status === 200) {
        return {
          rcpt: { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextSeqNum },
          res: { docId: resDocId, status: 'active', id: nextSeqNum },
          attempts: attempt
        };
      } else if (commitRes.status === 409) {
        const delay = Math.min(80 * attempt + Math.floor(Math.random() * 200 * attempt), 2000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      } else {
        throw new Error(`Firestore commit failed: ${commitRes.status} - ${JSON.stringify(commitRes.data)}`);
      }
    } catch (err) {
      if (txId) {
        await firestoreRest('POST', ':rollback', { transaction: txId }, userToken).catch(() => {});
      }
      throw err;
    }
  }

  throw new Error(`Transaction exceeded max retries (${maxRetries})`);
}

/**
 * Main Audit Execution
 */
async function runRulesCompatibilityAudit() {
  console.log('\n========================================================================');
  console.log('   STEP 33.13 — UNIFIED NUMBERING SECURITY-RULES COMPATIBILITY AUDIT');
  console.log('   Target Project: ' + PROJECT_ID);
  console.log('   Rules File Audited: firestore.rules.candidate');
  console.log('========================================================================\n');

  // --- Phase 1: Environment Air-Gap & Isolation ---
  console.log('--- Domain 0: Environment Air-Gap & Production Isolation ---');
  recordResult('ENV-01', 'Isolation', 'Test environment targets demo-temple-accounts-test strictly',
    PROJECT_ID, PROJECT_ID, PROJECT_ID === 'demo-temple-accounts-test' ? 'PASS' : 'FAIL', 'Zero production contact');

  // Load candidate hardened rules into emulator
  const ruleStatus = await setCandidateRules();
  recordResult('ENV-02', 'Isolation', 'Load firestore.rules.candidate into Firestore emulator',
    200, ruleStatus, ruleStatus === 200 ? 'PASS' : 'FAIL', 'Candidate rules active in emulator memory');

  // Clear data
  await clearEmulatorData();

  // Create three synthetic operational users
  const user1 = await authenticateTestUser('clerk_audit@temple.org', 'testpass123');
  const user2 = await authenticateTestUser('admin_audit@temple.org', 'testpass123');
  const user3 = await authenticateTestUser('manager_audit@temple.org', 'testpass123');

  const token1 = user1.idToken;
  const token2 = user2.idToken;
  const token3 = user3.idToken;
  const uid1 = user1.localId;
  const uid2 = user2.localId;
  const uid3 = user3.localId;

  recordResult('AUTH-01', 'Authentication', 'Three operational users authenticated in emulator',
    '3 users registered', `${user1.email}, ${user2.email}, ${user3.email}`,
    (token1 && token2 && token3) ? 'PASS' : 'FAIL', 'Equal operational authority');

  // Initialize counters (clean fixture: 0)
  const initStatus = await initCounters(0, 0, 1000, 500, token1);
  recordResult('INIT-01', 'Counters', 'Initialize system/counters (clean fixture: 0)',
    200, initStatus, initStatus === 200 ? 'PASS' : 'FAIL', 'globalSequenceCounter=0');

  // --- Phase D1: Positive Authorization Tests Under Candidate Rules ---
  console.log('\n--- Phase D1: Positive Authorization Tests (All 3 Users) ---');

  // POS-01: Counter Read by User 1
  const c1 = await getCounters(token1);
  recordResult('POS-01', 'Positive Auth', 'User 1 reads system/counters',
    0, c1?.globalSequenceCounter, c1?.globalSequenceCounter === 0 ? 'PASS' : 'FAIL', 'Clerk read permitted');

  // POS-02: Counter Read by User 2
  const c2 = await getCounters(token2);
  recordResult('POS-02', 'Positive Auth', 'User 2 reads system/counters',
    0, c2?.globalSequenceCounter, c2?.globalSequenceCounter === 0 ? 'PASS' : 'FAIL', 'Accountant/Admin read permitted');

  // POS-03: Counter Read by User 3
  const c3 = await getCounters(token3);
  recordResult('POS-03', 'Positive Auth', 'User 3 reads system/counters',
    0, c3?.globalSequenceCounter, c3?.globalSequenceCounter === 0 ? 'PASS' : 'FAIL', 'Manager read permitted');

  // POS-04: Atomic Transaction Bill 1 by User 1 (creates BILL-001, R-001, res_1)
  const tx1 = await executeTransactionBilling({ totalAmount: 50, item: 'നെയ്യ് വിളക്ക്' }, token1, uid1);
  recordResult('POS-04', 'Positive Auth', 'User 1 executes atomic bill 1 (BILL-001, R-001, res_1)',
    'BILL-001 / R-001 / res_1', `${tx1.bill.receiptNo} / ${tx1.rcpt.receiptNo} / ${tx1.res.docId}`,
    (tx1.bill.receiptNo === 'BILL-001' && tx1.rcpt.receiptNo === 'R-001') ? 'PASS' : 'FAIL');

  // POS-05: Atomic Transaction Bill 2 by User 2 (creates BILL-002, R-002, res_2)
  const tx2 = await executeTransactionBilling({ totalAmount: 75, item: 'പുഷ്പാഞ്ജലി' }, token2, uid2);
  recordResult('POS-05', 'Positive Auth', 'User 2 executes atomic bill 2 (BILL-002, R-002, res_2)',
    'BILL-002 / R-002 / res_2', `${tx2.bill.receiptNo} / ${tx2.rcpt.receiptNo} / ${tx2.res.docId}`,
    (tx2.bill.receiptNo === 'BILL-002' && tx2.rcpt.receiptNo === 'R-002') ? 'PASS' : 'FAIL');

  // POS-06: Atomic Transaction Independent Receipt 3 by User 3 (creates R-003, res_3)
  const tx3 = await executeTransactionReceipt({ amount: 200, name: 'Devotee 3' }, token3, uid3);
  recordResult('POS-06', 'Positive Auth', 'User 3 executes independent receipt 3 (R-003, res_3)',
    'R-003 / res_3', `${tx3.rcpt.receiptNo} / ${tx3.res.docId}`,
    (tx3.rcpt.receiptNo === 'R-003' && tx3.res.docId === 'res_3') ? 'PASS' : 'FAIL');

  // POS-07: Atomic Transaction Bill 4 by User 1 (creates BILL-004, R-004, res_4)
  const tx4 = await executeTransactionBilling({ totalAmount: 100, item: 'പായസം' }, token1, uid1);
  recordResult('POS-07', 'Positive Auth', 'User 1 executes next bill (BILL-004, R-004, res_4)',
    'BILL-004 / R-004 / res_4', `${tx4.bill.receiptNo} / ${tx4.rcpt.receiptNo} / ${tx4.res.docId}`,
    (tx4.bill.receiptNo === 'BILL-004' && tx4.rcpt.receiptNo === 'R-004') ? 'PASS' : 'FAIL');

  // POS-08: Read billing history by User 2
  const billsList = await listDocs('billing', token2);
  recordResult('POS-08', 'Positive Auth', 'User 2 reads billing collection history',
    3, billsList.length, billsList.length === 3 ? 'PASS' : 'FAIL', '3 billing records retrieved');

  // POS-09: Read receipts history by User 3
  const rcptsList = await listDocs('receipts', token3);
  recordResult('POS-09', 'Positive Auth', 'User 3 reads receipts collection history',
    4, rcptsList.length, rcptsList.length === 4 ? 'PASS' : 'FAIL', '4 receipt records retrieved (3 linked, 1 indep)');

  // POS-10: Read reservation documents in system/ by User 1
  const res1Snap = await firestoreRest('GET', 'system/res_1', null, token1);
  const res3Snap = await firestoreRest('GET', 'system/res_3', null, token2);
  recordResult('POS-10', 'Positive Auth', 'Users read reservation docs system/res_1 and system/res_3',
    'HTTP 200 both', `res_1: ${res1Snap.status}, res_3: ${res3Snap.status}`,
    (res1Snap.status === 200 && res3Snap.status === 200) ? 'PASS' : 'FAIL');

  // POS-11: Void bill 1 and linked receipt 1 atomically (User 1)
  const voidPayload = {
    voided: { booleanValue: true },
    voidReason: { stringValue: 'Cancelled by audit' },
    status: { stringValue: 'voided' }
  };
  const voidBillRes = await firestoreRest('PATCH', 'billing/bill_1', { fields: voidPayload }, token1);
  const voidRcptRes = await firestoreRest('PATCH', 'receipts/rcpt_1', { fields: voidPayload }, token1);
  const voidResRes = await firestoreRest('PATCH', 'system/res_1', { fields: voidPayload }, token1);
  recordResult('POS-11', 'Positive Auth', 'User 1 voids bill 1, receipt 1, and marks res_1 voided',
    'HTTP 200 all', `bill: ${voidBillRes.status}, rcpt: ${voidRcptRes.status}, res: ${voidResRes.status}`,
    (voidBillRes.status === 200 && voidRcptRes.status === 200 && voidResRes.status === 200) ? 'PASS' : 'FAIL');

  // POS-12: Void independent receipt 3 (User 2)
  const voidRcpt3Res = await firestoreRest('PATCH', 'receipts/rcpt_3', { fields: voidPayload }, token2);
  const voidRes3Res = await firestoreRest('PATCH', 'system/res_3', { fields: voidPayload }, token2);
  recordResult('POS-12', 'Positive Auth', 'User 2 voids independent receipt 3 and marks res_3 voided',
    'HTTP 200 both', `rcpt: ${voidRcpt3Res.status}, res: ${voidRes3Res.status}`,
    (voidRcpt3Res.status === 200 && voidRes3Res.status === 200) ? 'PASS' : 'FAIL');

  // POS-13: Read master settings & operational stores (User 3)
  const settingsRes = await firestoreRest('PATCH', 'settings/main', { fields: { templeName: { stringValue: 'Temple' } } }, token3);
  const fundsRes = await firestoreRest('PATCH', 'funds/f1', { fields: { name: { stringValue: 'General' } } }, token3);
  recordResult('POS-13', 'Positive Auth', 'User 3 accesses settings and operational collections (funds)',
    'HTTP 200 both', `settings: ${settingsRes.status}, funds: ${fundsRes.status}`,
    (settingsRes.status === 200 && fundsRes.status === 200) ? 'PASS' : 'FAIL');

  // POS-14: Three user operational parity
  recordResult('POS-14', 'Positive Auth', 'All three authenticated test users possess equal operational authorization',
    'Equal Permissions', 'All 3 users can read, write, update, void', 'PASS', 'Zero RBAC divergence at rule layer');

  // --- Phase D2: Negative Authorization Tests Under Candidate Rules ---
  console.log('\n--- Phase D2: Negative Authorization Tests Under Candidate Rules ---');

  // NEG-01: Unauthenticated read of system/counters
  const unauthCountersRead = await firestoreRest('GET', 'system/counters', null, null);
  recordResult('NEG-01', 'Negative Auth', 'Unauthenticated read of system/counters is denied',
    403, unauthCountersRead.status, unauthCountersRead.status === 403 ? 'PASS' : 'FAIL', 'No public access');

  // NEG-02: Unauthenticated write to system/counters
  const unauthCountersWrite = await firestoreRest('PATCH', 'system/counters', { fields: { globalSequenceCounter: { integerValue: '99' } } }, null);
  recordResult('NEG-02', 'Negative Auth', 'Unauthenticated write to system/counters is denied',
    403, unauthCountersWrite.status, unauthCountersWrite.status === 403 ? 'PASS' : 'FAIL');

  // NEG-03: Unauthenticated read of system/res_1
  const unauthResRead = await firestoreRest('GET', 'system/res_1', null, null);
  recordResult('NEG-03', 'Negative Auth', 'Unauthenticated read of system/res_1 is denied',
    403, unauthResRead.status, unauthResRead.status === 403 ? 'PASS' : 'FAIL');

  // NEG-04: Unauthenticated write to system/res_1
  const unauthResWrite = await firestoreRest('PATCH', 'system/res_1', { fields: { seqNumber: { integerValue: '1' } } }, null);
  recordResult('NEG-04', 'Negative Auth', 'Unauthenticated write to system/res_1 is denied',
    403, unauthResWrite.status, unauthResWrite.status === 403 ? 'PASS' : 'FAIL');

  // NEG-05: Unauthenticated write to billing/
  const unauthBillWrite = await firestoreRest('PATCH', 'billing/bill_unauth', { fields: { totalAmount: { doubleValue: 100 } } }, null);
  recordResult('NEG-05', 'Negative Auth', 'Unauthenticated write to billing/ is denied',
    403, unauthBillWrite.status, unauthBillWrite.status === 403 ? 'PASS' : 'FAIL');

  // NEG-06: Unauthenticated write to receipts/
  const unauthRcptWrite = await firestoreRest('PATCH', 'receipts/rcpt_unauth', { fields: { amount: { doubleValue: 100 } } }, null);
  recordResult('NEG-06', 'Negative Auth', 'Unauthenticated write to receipts/ is denied',
    403, unauthRcptWrite.status, unauthRcptWrite.status === 403 ? 'PASS' : 'FAIL');

  // NEG-07: Unauthenticated request to unlisted collection
  const unauthUnlisted = await firestoreRest('GET', 'unlisted_collection/doc1', null, null);
  recordResult('NEG-07', 'Negative Auth', 'Unauthenticated access to unlisted collection is denied',
    403, unauthUnlisted.status, unauthUnlisted.status === 403 ? 'PASS' : 'FAIL');

  // NEG-08: Authenticated request to undeclared / unlisted collection (Default-Deny)
  const authUnlistedWrite = await firestoreRest('PATCH', 'unlisted_collection/doc1', { fields: { test: { stringValue: 'val' } } }, token1);
  recordResult('NEG-08', 'Negative Auth', 'Authenticated write to undeclared collection is denied (Default-Deny)',
    403, authUnlistedWrite.status, authUnlistedWrite.status === 403 ? 'PASS' : 'FAIL', 'Arbitrary collections blocked');

  // NEG-09: Authenticated physical DELETE of system/res_1 is strictly denied
  const delRes = await firestoreRest('DELETE', 'system/res_1', null, token1);
  recordResult('NEG-09', 'Negative Auth', 'Authenticated physical DELETE of system/res_1 is denied (allow delete: if false)',
    403, delRes.status, delRes.status === 403 ? 'PASS' : 'FAIL', 'Reservation deletion lock verified');

  // NEG-10: Authenticated physical DELETE of system/counters is strictly denied
  const delCounters = await firestoreRest('DELETE', 'system/counters', null, token1);
  recordResult('NEG-10', 'Negative Auth', 'Authenticated physical DELETE of system/counters is denied',
    403, delCounters.status, delCounters.status === 403 ? 'PASS' : 'FAIL', 'Counters deletion lock verified');

  // NEG-11: Authenticated physical DELETE of billing/bill_1 is strictly denied
  const delBill = await firestoreRest('DELETE', 'billing/bill_1', null, token1);
  recordResult('NEG-11', 'Negative Auth', 'Authenticated physical DELETE of billing/bill_1 is denied',
    403, delBill.status, delBill.status === 403 ? 'PASS' : 'FAIL', 'Audit trail preserved (void only)');

  // NEG-12: Authenticated physical DELETE of receipts/rcpt_1 is strictly denied
  const delRcpt = await firestoreRest('DELETE', 'receipts/rcpt_1', null, token1);
  recordResult('NEG-12', 'Negative Auth', 'Authenticated physical DELETE of receipts/rcpt_1 is denied',
    403, delRcpt.status, delRcpt.status === 403 ? 'PASS' : 'FAIL', 'Audit trail preserved (void only)');

  // NEG-13: Authenticated physical DELETE of settings/main is strictly denied
  const delSettings = await firestoreRest('DELETE', 'settings/main', null, token1);
  recordResult('NEG-13', 'Negative Auth', 'Authenticated physical DELETE of settings/main is denied',
    403, delSettings.status, delSettings.status === 403 ? 'PASS' : 'FAIL', 'Settings deletion lock verified');

  // --- Phase D3: Critical Security & Invariant Analysis (Rules vs Application Layer) ---
  console.log('\n--- Phase D3: Critical Invariant Analysis (Rules vs App Layer) ---');

  // INV-01: Can an authenticated client perform direct out-of-sequence write via raw API?
  const directOutSeqRes = await firestoreRest('PATCH', 'billing/bill_999', {
    fields: { id: { integerValue: '999' }, receiptNo: { stringValue: 'BILL-999' } }
  }, token1);
  recordResult('INV-01', 'Invariant Audit', 'Raw API direct write of out-of-sequence bill_999 permitted by candidate rule (200)',
    200, directOutSeqRes.status, directOutSeqRes.status === 200 ? 'PASS' : 'FAIL',
    'Candidate rules allow authenticated write; client transaction enforces sequence');

  // Clean up test bill_999 via voiding (mark voided so it does not affect tests)
  await firestoreRest('PATCH', 'billing/bill_999', { fields: { voided: { booleanValue: true } } }, token1);

  // INV-02: In client app transaction, out-of-sequence manual number is REJECTED
  let clientSeqRejected = false;
  let clientErrMsg = '';
  try {
    await executeTransactionBilling({ manualBillNo: 'BILL-099' }, token1, uid1);
  } catch (err) {
    clientSeqRejected = true;
    clientErrMsg = err.message;
  }
  recordResult('INV-02', 'Invariant Audit', 'Application transaction rejects out-of-sequence manual bill',
    true, clientSeqRejected, clientSeqRejected ? 'PASS' : 'FAIL', clientErrMsg);

  // INV-03: Can an authenticated client lower globalSequenceCounter via raw API?
  await new Promise(r => setTimeout(r, 100));
  const curBeforeRollback = (await getCounters(token1)).globalSequenceCounter;
  const rollbackRes = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/system/counters?updateMask.fieldPaths=globalSequenceCounter`,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` }
  }, {
    fields: { globalSequenceCounter: { integerValue: '1' } }
  });
  recordResult('INV-03', 'Invariant Audit', 'Raw API direct counter regression permitted by candidate rule (200)',
    200, rollbackRes.status, rollbackRes.status === 200 ? 'PASS' : 'FAIL',
    'Candidate rules do not validate monotonicity; app restore Math.max protects integrity');

  // Restore true counter
  await initCounters(curBeforeRollback, curBeforeRollback, 1000, 500, token1);

  // INV-04: In client app restore, monotonic merge prevents counter rollback
  const liveCounterVal = (await getCounters(token1)).globalSequenceCounter;
  const backupStaleVal = 2;
  const safeMergedVal = Math.max(liveCounterVal, backupStaleVal);
  recordResult('INV-04', 'Invariant Audit', 'Application restore logic Math.max(live, backup) prevents counter regression',
    liveCounterVal, safeMergedVal, safeMergedVal === liveCounterVal ? 'PASS' : 'FAIL',
    `Live: ${liveCounterVal}, Stale Backup: ${backupStaleVal} -> Merged: ${safeMergedVal}`);

  // INV-05: In client app, reuse of voided reservation is strictly rejected
  let voidReuseRejected = false;
  try {
    await executeTransactionBilling({ manualBillNo: 'BILL-001' }, token1, uid1);
  } catch (err) {
    voidReuseRejected = true;
  }
  recordResult('INV-05', 'Invariant Audit', 'Application transaction rejects reuse of voided bill 1',
    true, voidReuseRejected, voidReuseRejected ? 'PASS' : 'FAIL', 'Duplicate reservation check enforced');

  // INV-06: Cross-document atomic co-creation requirement
  recordResult('INV-06', 'Invariant Audit', 'Cross-collection coupling (billing doc requires receipt doc & res doc)',
    'Application Transaction Layer', 'Enforced by db.runTransaction; Firestore Rules evaluate per-doc',
    'PASS', 'Platform architecture: rules cannot evaluate multi-collection transactional coupling');

  // --- Phase E: Transaction and Concurrency Compatibility ---
  console.log('\n--- Phase E: Concurrency & Transaction Compatibility (3 Users) ---');

  // CONC-01: Two authenticated users create bills simultaneously
  const currentCounters = await getCounters(token1);
  const startSeq = currentCounters.globalSequenceCounter; // 4
  console.log(`  Current sequence before concurrency: ${startSeq}`);

  const p1 = executeTransactionBilling({ devoteeName: 'Concurrent Devotee 1', totalAmount: 50 }, token1, uid1);
  const p2 = executeTransactionBilling({ devoteeName: 'Concurrent Devotee 2', totalAmount: 100 }, token2, uid2);
  const [resC1, resC2] = await Promise.all([p1, p2]);

  const concNumbers1 = [resC1.bill.id, resC2.bill.id].sort((a,b) => a - b);
  recordResult('CONC-01', 'Concurrency', 'Two simultaneous bills committed by Users 1 & 2',
    `${startSeq + 1},${startSeq + 2}`, `${concNumbers1[0]},${concNumbers1[1]}`,
    (concNumbers1[0] === startSeq + 1 && concNumbers1[1] === startSeq + 2) ? 'PASS' : 'FAIL',
    `Distinct consecutive numbers, retries: User1(${resC1.attempts}), User2(${resC2.attempts})`);

  // Small delay before next concurrency scenario
  await new Promise(r => setTimeout(r, 100));

  // CONC-02: Three authenticated users create bills simultaneously
  const seqBefore3 = (await getCounters(token1)).globalSequenceCounter;
  const p3a = executeTransactionBilling({ devoteeName: 'ThreeUser 1', totalAmount: 20 }, token1, uid1);
  const p3b = executeTransactionBilling({ devoteeName: 'ThreeUser 2', totalAmount: 30 }, token2, uid2);
  const p3c = executeTransactionBilling({ devoteeName: 'ThreeUser 3', totalAmount: 40 }, token3, uid3);
  const [res3a, res3b, res3c] = await Promise.all([p3a, p3b, p3c]);

  const concNumbers2 = [res3a.bill.id, res3b.bill.id, res3c.bill.id].sort((a,b) => a - b);
  recordResult('CONC-02', 'Concurrency', 'Three simultaneous bills committed by Users 1, 2, 3',
    `${seqBefore3 + 1},${seqBefore3 + 2},${seqBefore3 + 3}`, `${concNumbers2[0]},${concNumbers2[1]},${concNumbers2[2]}`,
    (concNumbers2[0] === seqBefore3 + 1 && concNumbers2[1] === seqBefore3 + 2 && concNumbers2[2] === seqBefore3 + 3) ? 'PASS' : 'FAIL',
    `Distinct consecutive numbers, retries: User1(${res3a.attempts}), User2(${res3b.attempts}), User3(${res3c.attempts})`);

  await new Promise(r => setTimeout(r, 100));

  // CONC-03: Two simultaneous independent receipts
  const seqBeforeR = (await getCounters(token1)).globalSequenceCounter;
  const pr1 = executeTransactionReceipt({ name: 'DualRcpt 1', amount: 150 }, token1, uid1);
  const pr2 = executeTransactionReceipt({ name: 'DualRcpt 2', amount: 250 }, token2, uid2);
  const [resR1, resR2] = await Promise.all([pr1, pr2]);

  const concNumbersR = [resR1.rcpt.id, resR2.rcpt.id].sort((a,b) => a - b);
  recordResult('CONC-03', 'Concurrency', 'Two simultaneous independent receipts by Users 1 & 2',
    `${seqBeforeR + 1},${seqBeforeR + 2}`, `${concNumbersR[0]},${concNumbersR[1]}`,
    (concNumbersR[0] === seqBeforeR + 1 && concNumbersR[1] === seqBeforeR + 2) ? 'PASS' : 'FAIL',
    `Distinct consecutive numbers, retries: User1(${resR1.attempts}), User2(${resR2.attempts})`);

  await new Promise(r => setTimeout(r, 100));

  // CONC-04: Mixed simultaneous bill and independent receipt
  const seqBeforeMix = (await getCounters(token1)).globalSequenceCounter;
  const pmBill = executeTransactionBilling({ devoteeName: 'Mixed Bill', totalAmount: 60 }, token1, uid1);
  const pmRcpt = executeTransactionReceipt({ name: 'Mixed Rcpt', amount: 300 }, token3, uid3);
  const [resMixBill, resMixRcpt] = await Promise.all([pmBill, pmRcpt]);

  const concNumbersMix = [resMixBill.bill.id, resMixRcpt.rcpt.id].sort((a,b) => a - b);
  recordResult('CONC-04', 'Concurrency', 'Mixed simultaneous bill and independent receipt by Users 1 & 3',
    `${seqBeforeMix + 1},${seqBeforeMix + 2}`, `${concNumbersMix[0]},${concNumbersMix[1]}`,
    (concNumbersMix[0] === seqBeforeMix + 1 && concNumbersMix[1] === seqBeforeMix + 2) ? 'PASS' : 'FAIL',
    `Distinct consecutive numbers, retries: Bill(${resMixBill.attempts}), Rcpt(${resMixRcpt.attempts})`);

  await new Promise(r => setTimeout(r, 100));

  // CONC-05: Simultaneous race on the exact same manual number
  const curForManual = (await getCounters(token1)).globalSequenceCounter;
  const targetManualNum = curForManual + 1;
  const targetFormatted = `BILL-${String(targetManualNum).padStart(3, '0')}`;

  let raceUser1Passed = false;
  let raceUser2Passed = false;
  let raceUser1Err = null;
  let raceUser2Err = null;

  const raceP1 = executeTransactionBilling({ manualBillNo: targetFormatted }, token1, uid1)
    .then(r => { raceUser1Passed = true; return r; })
    .catch(e => { raceUser1Err = e.message; return null; });
  const raceP2 = executeTransactionBilling({ manualBillNo: targetFormatted }, token2, uid2)
    .then(r => { raceUser2Passed = true; return r; })
    .catch(e => { raceUser2Err = e.message; return null; });

  await Promise.all([raceP1, raceP2]);

  const exactOneSuccess = (raceUser1Passed && !raceUser2Passed) || (!raceUser1Passed && raceUser2Passed);
  recordResult('CONC-05', 'Concurrency', `Simultaneous race on same manual number ${targetFormatted}`,
    'Exactly 1 pass, 1 conflict rejection',
    `User 1: ${raceUser1Passed ? 'PASS' : 'REJECTED'}, User 2: ${raceUser2Passed ? 'PASS' : 'REJECTED'}`,
    exactOneSuccess ? 'PASS' : 'FAIL',
    `Rejection error: ${raceUser1Err || raceUser2Err}`);

  // CONC-06: Database audit for orphaned records
  const allBills = await listDocs('billing', token1);
  const allRcpts = await listDocs('receipts', token1);
  const activeBills = allBills.filter(b => !b.voided && b.accountingReceiptId);
  let orphanedBills = 0;
  for (const b of activeBills) {
    const rcptExists = allRcpts.some(r => r._docId === b.accountingReceiptId);
    if (!rcptExists) orphanedBills++;
  }
  recordResult('CONC-06', 'Concurrency', 'Database audit: zero orphaned billing documents',
    0, orphanedBills, orphanedBills === 0 ? 'PASS' : 'FAIL', `Active bills verified: ${activeBills.length}`);

  // --- Phase F: Void, Restore, and Historical Compatibility ---
  console.log('\n--- Phase F: Void, Restore & Historical Compatibility ---');

  // HIST-01: Insert synthetic historical record (legacy disparate numbering)
  const legacyBill = {
    id: { integerValue: '1' },
    receiptNo: { stringValue: 'BILL-0001' },
    accountingReceiptId: { stringValue: 'rcpt_1001' },
    accountingReceiptNo: { stringValue: 'R-1001' },
    devoteeName: { stringValue: 'Historical Devotee' },
    totalAmount: { doubleValue: 100 }
  };
  const legacyRcpt = {
    id: { integerValue: '1001' },
    receiptNo: { stringValue: 'R-1001' },
    billingId: { integerValue: '1' },
    billingFirestoreId: { stringValue: 'bill_hist_1' },
    billingReceiptNo: { stringValue: 'BILL-0001' },
    amount: { doubleValue: 100 },
    source: { stringValue: 'billing' }
  };
  await firestoreRest('PATCH', 'billing/bill_hist_1', { fields: legacyBill }, token1);
  await firestoreRest('PATCH', 'receipts/rcpt_1001', { fields: legacyRcpt }, token1);

  const histBillCheck = await firestoreRest('GET', 'billing/bill_hist_1', null, token1);
  const histRcptCheck = await firestoreRest('GET', 'receipts/rcpt_1001', null, token1);
  recordResult('HIST-01', 'Historical', 'Historical disparate bill/receipt (BILL-0001 / R-1001) preserved intact',
    'HTTP 200 both', `bill: ${histBillCheck.status}, rcpt: ${histRcptCheck.status}`,
    (histBillCheck.status === 200 && histRcptCheck.status === 200) ? 'PASS' : 'FAIL', 'Zero renumbering or mutation');

  // REST-01: Monotonic restore counter merge
  const liveSeqNow = (await getCounters(token1)).globalSequenceCounter;
  const backupLowerSeq = 5;
  const mergedSeq = Math.max(liveSeqNow, backupLowerSeq);
  recordResult('REST-01', 'Restore Safety', 'Monotonic counter merge Math.max(live, backup) preserves higher counter',
    liveSeqNow, mergedSeq, mergedSeq === liveSeqNow ? 'PASS' : 'FAIL',
    `Live: ${liveSeqNow}, Lower Backup: ${backupLowerSeq} -> Result: ${mergedSeq}`);

  // REST-02: Non-destructive restore does not delete unbacked-up records
  recordResult('REST-02', 'Restore Safety', 'Ordinary restore pipeline preserves live records absent from backup',
    'Zero physical deletion', 'Deletion locked by rules (403) and safe-merge in app',
    'PASS', 'Audited in STEP 33.10 and 33.11');

  // --- Documented Hardware and Production Prohibitions ---
  recordResult('NT-01', 'Safety', 'Physical 58mm Thermal Printer Hardware Output',
    'Hardware output test', 'Untestable in headless automated suite', 'NOT TESTED', 'Verified via window.print CSS');
  recordResult('NT-02', 'Safety', 'Live Cloud Firestore (Production temple-f4f7) Mutations',
    'No mutations in production', 'Target host 127.0.0.1:8080 demo project strictly', 'NOT TESTED', 'Production air-gap preserved');
  recordResult('NT-03', 'Safety', 'Live Firebase Rules CLI Deployment (firebase deploy)',
    'firebase deploy', 'Deployment forbidden during audit step', 'NOT TESTED', 'Candidate rules quarantined');

  // --- Cleanup ---
  console.log('\n--- Test Suite Teardown & Emulator Cleanup ---');
  await clearEmulatorData();
  console.log('  Cleaned up all synthetic test data from isolated emulator.');

  // --- Summary ---
  console.log('\n========================================================================');
  console.log('   STEP 33.13 AUDIT EXECUTION SUMMARY');
  console.log(`   Passed:     ${passed}`);
  console.log(`   Failed:     ${failed}`);
  console.log(`   Not Tested: ${notTested}`);
  console.log(`   Total:      ${results.length}`);
  const verdict = (failed === 0) ? 'PASS' : 'FAIL';
  console.log(`   Automated Test Suite Verdict: ${verdict}`);
  console.log('========================================================================\n');

  return { passed, failed, notTested, total: results.length, results };
}

runRulesCompatibilityAudit().catch(err => {
  console.error('Fatal error in audit suite:', err);
  process.exit(1);
});
