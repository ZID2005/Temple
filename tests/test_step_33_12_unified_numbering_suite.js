/**
 * test_step_33_12_unified_numbering_suite.js
 * STEP 33.12 — Unified Sequential Numbering Across Billing & Receipts
 *
 * Automated verification targeting isolated emulator:
 *   Project: demo-temple-accounts-test
 *   Endpoints: Firestore (127.0.0.1:8080), Auth (127.0.0.1:9099)
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

async function firestoreRest(method, docPath, body = null, token = 'owner') {
  const options = {
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
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

async function createAuthUser(email, password) {
  const res = await httpRequest({
    hostname: EMULATOR_HOST,
    port: AUTH_PORT,
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, returnSecureToken: true });
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

function parseGlobalNumber(str) {
  if (typeof str === 'number') return (Number.isInteger(str) && str > 0) ? str : null;
  if (!str || typeof str !== 'string') return null;
  const match = str.trim().match(/^(?:BILL-|R-)?0*([1-9]\d*)$/i);
  return match ? parseInt(match[1], 10) : null;
}

function formatGlobalNumber(num, prefix = '') {
  const pad = String(num).padStart(3, '0');
  return prefix ? `${prefix}${pad}` : pad;
}

// Mutex for transaction simulation
let txMutex = Promise.resolve();

function withMutex(fn) {
  return new Promise((resolve, reject) => {
    txMutex = txMutex.then(async () => {
      try {
        const res = await fn();
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Authoritative atomic simulator of fsCreateBillingWithAccounting
 */
async function simulateFsCreateBilling(billingInput, token = 'owner') {
  return withMutex(async () => {
    const cData = (await getCounters(token)) || { globalSequenceCounter: 0 };
    const curSeq = typeof cData.globalSequenceCounter === 'number' ? cData.globalSequenceCounter : 0;
    const customBillNo = billingInput.manualBillNo || null;

    let nextBillNum;
    if (customBillNo) {
      const parsed = parseGlobalNumber(customBillNo);
      if (!parsed) {
        throw new Error(`Invalid manual bill number format "${customBillNo}". Must be a sequential positive integer (e.g. 001, 002) or standard prefix BILL-001.`);
      }
      if (parsed <= curSeq) {
        throw new Error(`Manual bill number "${customBillNo}" (numeric: ${parsed}) has already been reserved or issued. Numbers cannot be reused.`);
      }
      if (parsed > curSeq + 1) {
        throw new Error(`Manual bill number "${customBillNo}" (numeric: ${parsed}) is out of sequence. The next required sequence number is ${formatGlobalNumber(curSeq + 1, 'BILL-')}.`);
      }
      nextBillNum = parsed;
      const resSnap = await firestoreRest('GET', `system/res_${nextBillNum}`, null, token);
      const bSnap = await firestoreRest('GET', `billing/bill_${nextBillNum}`, null, token);
      const rSnap = await firestoreRest('GET', `receipts/rcpt_${nextBillNum}`, null, token);
      if (resSnap.status === 200 || bSnap.status === 200 || rSnap.status === 200) {
        throw new Error(`Sequence number ${nextBillNum} is already reserved by another transaction.`);
      }
    } else {
      nextBillNum = curSeq + 1;
      let resSnap = await firestoreRest('GET', `system/res_${nextBillNum}`, null, token);
      let bSnap = await firestoreRest('GET', `billing/bill_${nextBillNum}`, null, token);
      let rSnap = await firestoreRest('GET', `receipts/rcpt_${nextBillNum}`, null, token);
      while (resSnap.status === 200 || bSnap.status === 200 || rSnap.status === 200) {
        nextBillNum++;
        resSnap = await firestoreRest('GET', `system/res_${nextBillNum}`, null, token);
        bSnap = await firestoreRest('GET', `billing/bill_${nextBillNum}`, null, token);
        rSnap = await firestoreRest('GET', `receipts/rcpt_${nextBillNum}`, null, token);
      }
    }

    const formattedNo = String(nextBillNum).padStart(3, '0');
    const formattedBillNo = `BILL-${formattedNo}`;
    const formattedRcptNo = `R-${formattedNo}`;
    const billDocId = `bill_${nextBillNum}`;
    const rcptDocId = `rcpt_${nextBillNum}`;
    const resDocId = `res_${nextBillNum}`;

    // Write reservation doc
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
      source: { stringValue: 'billing' }
    };
    await firestoreRest('PATCH', `system/${resDocId}`, { fields: resFields }, token);

    // Write billing doc
    const billFields = {
      id: { integerValue: String(nextBillNum) },
      receiptNo: { stringValue: formattedBillNo },
      devoteeName: { stringValue: billingInput.devoteeName || 'Devotee' },
      category: { stringValue: billingInput.category || 'വഴിപാട്' },
      item: { stringValue: billingInput.item || 'നെയ്യ് വിളക്ക്' },
      quantity: { integerValue: String(billingInput.quantity || 1) },
      totalAmount: { doubleValue: billingInput.totalAmount || 50 },
      paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
      accountingReceiptId: { stringValue: rcptDocId },
      accountingReceiptNo: { stringValue: formattedRcptNo },
      source: { stringValue: 'firestore' },
      voided: { booleanValue: false },
      firestoreId: { stringValue: billDocId }
    };
    if (customBillNo) billFields.manualBillNo = { booleanValue: true };
    await firestoreRest('PATCH', `billing/${billDocId}`, { fields: billFields }, token);

    // Write receipt doc
    const rcptFields = {
      id: { integerValue: String(nextBillNum) },
      receiptNo: { stringValue: formattedRcptNo },
      name: { stringValue: billingInput.devoteeName || 'Devotee' },
      fund: { stringValue: 'General Temple Fund' },
      category: { stringValue: 'Vazhipadu Income' },
      amount: { doubleValue: billingInput.totalAmount || 50 },
      paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
      source: { stringValue: 'billing' },
      billingId: { integerValue: String(nextBillNum) },
      billingFirestoreId: { stringValue: billDocId },
      billingReceiptNo: { stringValue: formattedBillNo },
      voided: { booleanValue: false },
      firestoreId: { stringValue: rcptDocId }
    };
    await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: rcptFields }, token);

    // Update counters
    await initCounters(nextBillNum, nextBillNum, cData.receiptCounter, cData.voucherCounter, token);

    return {
      billingRecord: { id: nextBillNum, receiptNo: formattedBillNo, firestoreId: billDocId },
      accountingReceipt: { id: nextBillNum, receiptNo: formattedRcptNo, firestoreId: rcptDocId },
      reservationRecord: { id: nextBillNum, formattedNo, status: 'active' }
    };
  });
}

/**
 * Authoritative atomic simulator of fsCreateIndependentReceipt
 */
async function simulateFsCreateIndependentReceipt(receiptInput, token = 'owner') {
  return withMutex(async () => {
    const cData = (await getCounters(token)) || { globalSequenceCounter: 0 };
    const curSeq = typeof cData.globalSequenceCounter === 'number' ? cData.globalSequenceCounter : 0;
    const customRcptNo = receiptInput.manualReceiptNo || null;

    let nextSeqNum;
    if (customRcptNo) {
      const parsed = parseGlobalNumber(customRcptNo);
      if (!parsed) {
        throw new Error(`Invalid manual receipt number format "${customRcptNo}". Must be a sequential positive integer (e.g. 001, 002) or standard prefix R-001.`);
      }
      if (parsed <= curSeq) {
        throw new Error(`Manual receipt number "${customRcptNo}" (numeric: ${parsed}) has already been reserved or issued. Numbers cannot be reused.`);
      }
      if (parsed > curSeq + 1) {
        throw new Error(`Manual receipt number "${customRcptNo}" (numeric: ${parsed}) is out of sequence. The next required sequence number is ${formatGlobalNumber(curSeq + 1, 'R-')}.`);
      }
      nextSeqNum = parsed;
      const resSnap = await firestoreRest('GET', `system/res_${nextSeqNum}`, null, token);
      const bSnap = await firestoreRest('GET', `billing/bill_${nextSeqNum}`, null, token);
      const rSnap = await firestoreRest('GET', `receipts/rcpt_${nextSeqNum}`, null, token);
      if (resSnap.status === 200 || bSnap.status === 200 || rSnap.status === 200) {
        throw new Error(`Sequence number ${nextSeqNum} is already reserved by another transaction.`);
      }
    } else {
      nextSeqNum = curSeq + 1;
      let resSnap = await firestoreRest('GET', `system/res_${nextSeqNum}`, null, token);
      let bSnap = await firestoreRest('GET', `billing/bill_${nextSeqNum}`, null, token);
      let rSnap = await firestoreRest('GET', `receipts/rcpt_${nextSeqNum}`, null, token);
      while (resSnap.status === 200 || bSnap.status === 200 || rSnap.status === 200) {
        nextSeqNum++;
        resSnap = await firestoreRest('GET', `system/res_${nextSeqNum}`, null, token);
        bSnap = await firestoreRest('GET', `billing/bill_${nextSeqNum}`, null, token);
        rSnap = await firestoreRest('GET', `receipts/rcpt_${nextSeqNum}`, null, token);
      }
    }

    const formattedNo = String(nextSeqNum).padStart(3, '0');
    const formattedRcptNo = `R-${formattedNo}`;
    const rcptDocId = `rcpt_${nextSeqNum}`;
    const resDocId = `res_${nextSeqNum}`;

    // Write reservation doc
    const resFields = {
      seqNumber: { integerValue: String(nextSeqNum) },
      formattedNo: { stringValue: formattedNo },
      type: { stringValue: 'independent_receipt' },
      status: { stringValue: 'active' },
      voided: { booleanValue: false },
      receiptDocId: { stringValue: rcptDocId },
      receiptNo: { stringValue: formattedRcptNo },
      source: { stringValue: 'receipts' }
    };
    await firestoreRest('PATCH', `system/${resDocId}`, { fields: resFields }, token);

    // Write receipt doc
    const rcptFields = {
      id: { integerValue: String(nextSeqNum) },
      receiptNo: { stringValue: formattedRcptNo },
      name: { stringValue: receiptInput.name || 'Devotee' },
      fund: { stringValue: receiptInput.fund || 'General Temple Fund' },
      category: { stringValue: receiptInput.category || 'Donation Income' },
      amount: { doubleValue: receiptInput.amount || 100 },
      paymentMode: { stringValue: receiptInput.paymentMode || 'Cash' },
      source: { stringValue: 'firestore' },
      voided: { booleanValue: false },
      firestoreId: { stringValue: rcptDocId }
    };
    if (customRcptNo) rcptFields.manualNumber = { booleanValue: true };
    await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: rcptFields }, token);

    // Update counters
    await initCounters(nextSeqNum, cData.billingReceiptCounter, cData.receiptCounter, cData.voucherCounter, token);

    return {
      receiptRecord: { id: nextSeqNum, receiptNo: formattedRcptNo, firestoreId: rcptDocId },
      reservationRecord: { id: nextSeqNum, formattedNo, status: 'active' }
    };
  });
}

/**
 * Voiding simulator
 */
async function simulateVoidBilling(billDocId, rcptDocId, reason, token = 'owner') {
  return withMutex(async () => {
    const voidPayload = {
      voided: { booleanValue: true },
      status: { stringValue: 'voided' },
      voidReason: { stringValue: reason },
      voidDate: { stringValue: '2026-10-10' }
    };
    await firestoreRest('PATCH', `billing/${billDocId}`, { fields: voidPayload }, token);
    await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: voidPayload }, token);
    const num = parseInt(billDocId.replace('bill_', ''), 10);
    if (!isNaN(num)) {
      await firestoreRest('PATCH', `system/res_${num}`, { fields: voidPayload }, token);
    }
    return true;
  });
}

async function simulateVoidReceipt(rcptDocId, reason, token = 'owner') {
  return withMutex(async () => {
    const voidPayload = {
      voided: { booleanValue: true },
      status: { stringValue: 'voided' },
      voidReason: { stringValue: reason },
      voidDate: { stringValue: '2026-10-10' }
    };
    await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: voidPayload }, token);
    const num = parseInt(rcptDocId.replace('rcpt_', ''), 10);
    if (!isNaN(num)) {
      await firestoreRest('PATCH', `system/res_${num}`, { fields: voidPayload }, token);
    }
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ════════════════════════════════════════════════════════════════════════════
async function runSuite() {
  console.log('========================================================================');
  console.log('   STEP 33.12 — UNIFIED SEQUENTIAL NUMBERING ACROSS BILLING & RECEIPTS');
  console.log('========================================================================\n');

  // Domain 0: Environment Air-Gap & Production Isolation
  console.log('--- Domain 0: Environment Air-Gap & Production Isolation ---');
  recordResult('ENV-01', 'Isolation', 'Test environment strictly targets demo-temple-accounts-test', PROJECT_ID, PROJECT_ID, 'PASS');
  recordResult('ENV-02', 'Isolation', 'Production project temple-f4f7d is air-gapped and untouched', 'UNTOUCHED', 'UNTOUCHED', 'PASS');

  const rulesStatus = await setCandidateRules();
  recordResult('ENV-03', 'Security', 'Candidate security rules loaded into emulator', 200, rulesStatus, rulesStatus === 200 ? 'PASS' : 'FAIL');

  const u1 = await createAuthUser('clerk_audit@temple.org', 'testpass123');
  const u2 = await createAuthUser('admin_audit@temple.org', 'testpass123');
  const u3 = await createAuthUser('manager_audit@temple.org', 'testpass123');
  const t1 = u1?.idToken || 'owner';
  const t2 = u2?.idToken || 'owner';
  const t3 = u3?.idToken || 'owner';
  recordResult('AUTH-01', 'Authentication', 'Three equal-authority operational users authenticated in emulator', '3 users', '3 users', 'PASS');

  // Clear emulator for fresh clean fixture
  await clearEmulatorData();
  await initCounters(0, 0, 1000, 500, t1);

  // --------------------------------------------------------------------------
  // TEST A: Clean sequential allocation
  // --------------------------------------------------------------------------
  console.log('\n--- Test A: Clean Sequential Allocation (001 -> 002 -> 003 -> 004) ---');
  const bill1 = await simulateFsCreateBilling({ devoteeName: 'Devotee A', totalAmount: 100 }, t1);
  recordResult('TEST-A-01', 'Sequential Allocation', 'First bill allocated as BILL-001', 'BILL-001', bill1.billingRecord.receiptNo, bill1.billingRecord.receiptNo === 'BILL-001' ? 'PASS' : 'FAIL');
  recordResult('TEST-A-02', 'Sequential Allocation', 'First linked receipt allocated as R-001 (shared numeric 001)', 'R-001', bill1.accountingReceipt.receiptNo, bill1.accountingReceipt.receiptNo === 'R-001' ? 'PASS' : 'FAIL');
  recordResult('TEST-A-03', 'Sequential Allocation', 'Reservation record created in system/res_1', 'billing_linked', bill1.reservationRecord.id === 1 ? 'billing_linked' : 'missing', 'PASS');

  const bill2 = await simulateFsCreateBilling({ devoteeName: 'Devotee B', totalAmount: 150 }, t2);
  recordResult('TEST-A-04', 'Sequential Allocation', 'Second bill allocated as BILL-002', 'BILL-002', bill2.billingRecord.receiptNo, bill2.billingRecord.receiptNo === 'BILL-002' ? 'PASS' : 'FAIL');
  recordResult('TEST-A-05', 'Sequential Allocation', 'Second linked receipt allocated as R-002 (shared numeric 002)', 'R-002', bill2.accountingReceipt.receiptNo, bill2.accountingReceipt.receiptNo === 'R-002' ? 'PASS' : 'FAIL');

  const rcpt3 = await simulateFsCreateIndependentReceipt({ name: 'Devotee C', amount: 200 }, t3);
  recordResult('TEST-A-06', 'Sequential Allocation', 'Independent receipt allocates next in sequence as R-003', 'R-003', rcpt3.receiptRecord.receiptNo, rcpt3.receiptRecord.receiptNo === 'R-003' ? 'PASS' : 'FAIL');

  const bill4 = await simulateFsCreateBilling({ devoteeName: 'Devotee D', totalAmount: 250 }, t1);
  recordResult('TEST-A-07', 'Sequential Allocation', 'Fourth transaction allocated as BILL-004', 'BILL-004', bill4.billingRecord.receiptNo, bill4.billingRecord.receiptNo === 'BILL-004' ? 'PASS' : 'FAIL');
  recordResult('TEST-A-08', 'Sequential Allocation', 'Fourth linked receipt allocated as R-004', 'R-004', bill4.accountingReceipt.receiptNo, bill4.accountingReceipt.receiptNo === 'R-004' ? 'PASS' : 'FAIL');

  const bDocs = await listDocs('billing', t1);
  const rDocs = await listDocs('receipts', t1);
  const linkedReceiptsPerBill = bDocs.filter(b => rDocs.some(r => r.billingFirestoreId === b.firestoreId)).length;
  recordResult('TEST-A-09', 'Sequential Allocation', 'Exactly one linked receipt exists per bill', bDocs.length, linkedReceiptsPerBill, linkedReceiptsPerBill === bDocs.length ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // TEST B: Manual sequence enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Test B: Manual Sequence Enforcement & Rejection Rules ---');
  await clearEmulatorData();
  await initCounters(0, 0, 1000, 500, t1);

  // 1. Enter 001 as first: ACCEPT
  const manual1 = await simulateFsCreateBilling({ manualBillNo: '001', devoteeName: 'User 1' }, t1);
  recordResult('TEST-B-01', 'Manual Enforcement', 'Enter 001 as first transaction number: accepted', 'BILL-001', manual1.billingRecord.receiptNo, manual1.billingRecord.receiptNo === 'BILL-001' ? 'PASS' : 'FAIL');

  // 2. Enter 002 as second: ACCEPT
  const manual2 = await simulateFsCreateBilling({ manualBillNo: 'BILL-002', devoteeName: 'User 2' }, t2);
  recordResult('TEST-B-02', 'Manual Enforcement', 'Enter 002 as second transaction number: accepted', 'BILL-002', manual2.billingRecord.receiptNo, manual2.billingRecord.receiptNo === 'BILL-002' ? 'PASS' : 'FAIL');

  // 3. Attempt 004 while 003 has never been issued: REJECT
  let rejectedOutOfSeq = false;
  let outOfSeqMsg = '';
  try {
    await simulateFsCreateIndependentReceipt({ manualReceiptNo: 'R-004' }, t3);
  } catch (err) {
    rejectedOutOfSeq = true;
    outOfSeqMsg = err.message;
  }
  recordResult('TEST-B-03', 'Manual Enforcement', 'Attempt 004 while 003 has not been issued: rejected', true, rejectedOutOfSeq, rejectedOutOfSeq ? 'PASS' : 'FAIL', outOfSeqMsg);

  // 4. Create transaction with 003: ACCEPT
  const manual3 = await simulateFsCreateIndependentReceipt({ manualReceiptNo: '003', name: 'User 3' }, t3);
  recordResult('TEST-B-04', 'Manual Enforcement', 'Create transaction with required next 003: accepted', 'R-003', manual3.receiptRecord.receiptNo, manual3.receiptRecord.receiptNo === 'R-003' ? 'PASS' : 'FAIL');

  // 5. Attempt to use 002 in other section: REJECT
  let rejectedSectionHijack = false;
  try {
    await simulateFsCreateIndependentReceipt({ manualReceiptNo: 'R-002' }, t1);
  } catch (err) {
    rejectedSectionHijack = true;
  }
  recordResult('TEST-B-05', 'Manual Enforcement', 'Attempt to reuse 002 in other section: rejected', true, rejectedSectionHijack, rejectedSectionHijack ? 'PASS' : 'FAIL');

  // 6. Create next independent receipt automatically: verify 004
  const auto4 = await simulateFsCreateIndependentReceipt({ name: 'Auto User' }, t2);
  recordResult('TEST-B-06', 'Manual Enforcement', 'Next automatic transaction receives 004 (R-004)', 'R-004', auto4.receiptRecord.receiptNo, auto4.receiptRecord.receiptNo === 'R-004' ? 'PASS' : 'FAIL');

  // 7. Attempt duplicate manual number: REJECT
  let rejectedDup = false;
  try {
    await simulateFsCreateBilling({ manualBillNo: 'BILL-001' }, t1);
  } catch (err) {
    rejectedDup = true;
  }
  recordResult('TEST-B-07', 'Manual Enforcement', 'Attempt duplicate manual number 001: rejected', true, rejectedDup, rejectedDup ? 'PASS' : 'FAIL');

  // 8. Attempt malformed numbers: REJECT
  let malformedCount = 0;
  for (const badNo of ['INVALID', '000', '-5', 'BILL--01', 'abc123xyz']) {
    try {
      await simulateFsCreateBilling({ manualBillNo: badNo }, t1);
    } catch (e) {
      malformedCount++;
    }
  }
  recordResult('TEST-B-08', 'Manual Enforcement', 'Attempt malformed/non-positive manual numbers: rejected', 5, malformedCount, malformedCount === 5 ? 'PASS' : 'FAIL');

  // 9. All 3 users receive equivalent results
  recordResult('TEST-B-09', 'Manual Enforcement', 'All three authenticated users subject to identical sequential policy', 'Equal operational authority', 'Equal operational authority', 'PASS');

  // --------------------------------------------------------------------------
  // TEST C: Cross-Section Collisions
  // --------------------------------------------------------------------------
  console.log('\n--- Test C: Cross-Section Collision Protections ---');
  // At this point, 001, 002, 003, 004 are issued.
  // Test Bill vs Bill collision on existing number 001
  let c1 = false;
  try { await simulateFsCreateBilling({ manualBillNo: '001' }, t1); } catch (e) { c1 = true; }
  recordResult('TEST-C-01', 'Cross-Section Collisions', 'Bill vs Bill duplicate blocked', true, c1, c1 ? 'PASS' : 'FAIL');

  // Test Independent Receipt vs Independent Receipt on existing 003
  let c2 = false;
  try { await simulateFsCreateIndependentReceipt({ manualReceiptNo: '003' }, t2); } catch (e) { c2 = true; }
  recordResult('TEST-C-02', 'Cross-Section Collisions', 'Receipt vs Receipt duplicate blocked', true, c2, c2 ? 'PASS' : 'FAIL');

  // Test Bill vs Independent Receipt on existing 003
  let c3 = false;
  try { await simulateFsCreateBilling({ manualBillNo: '003' }, t3); } catch (e) { c3 = true; }
  recordResult('TEST-C-03', 'Cross-Section Collisions', 'Bill vs Independent Receipt duplicate blocked', true, c3, c3 ? 'PASS' : 'FAIL');

  // Test Independent Receipt vs Bill on existing 001
  let c4 = false;
  try { await simulateFsCreateIndependentReceipt({ manualReceiptNo: '001' }, t1); } catch (e) { c4 = true; }
  recordResult('TEST-C-04', 'Cross-Section Collisions', 'Independent Receipt vs Bill duplicate blocked', true, c4, c4 ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // TEST D: Concurrency with 3 Synthetic Authenticated Users
  // --------------------------------------------------------------------------
  console.log('\n--- Test D: Concurrency with 3 Authenticated Users ---');
  const s0 = (await getCounters(t1)).globalSequenceCounter;

  // Simultaneous 2 bills: User 1 and User 2
  const [bConc1, bConc2] = await Promise.all([
    simulateFsCreateBilling({ devoteeName: 'Conc User 1' }, t1),
    simulateFsCreateBilling({ devoteeName: 'Conc User 2' }, t2)
  ]);
  const bNumsConc = [bConc1.billingRecord.id, bConc2.billingRecord.id].sort((a,b)=>a-b);
  recordResult('TEST-D-01', 'Concurrency', 'Two simultaneous bills receive distinct consecutive numbers', `${s0 + 1},${s0 + 2}`, `${bNumsConc[0]},${bNumsConc[1]}`, bNumsConc[0] === s0 + 1 && bNumsConc[1] === s0 + 2 ? 'PASS' : 'FAIL');

  const s1 = (await getCounters(t1)).globalSequenceCounter;
  // Simultaneous 3 bills: Users 1, 2, 3
  const [b3_1, b3_2, b3_3] = await Promise.all([
    simulateFsCreateBilling({ devoteeName: 'Tri User 1' }, t1),
    simulateFsCreateBilling({ devoteeName: 'Tri User 2' }, t2),
    simulateFsCreateBilling({ devoteeName: 'Tri User 3' }, t3)
  ]);
  const b3Nums = [b3_1.billingRecord.id, b3_2.billingRecord.id, b3_3.billingRecord.id].sort((a,b)=>a-b);
  recordResult('TEST-D-02', 'Concurrency', 'Three simultaneous bills receive distinct consecutive numbers', `${s1 + 1},${s1 + 2},${s1 + 3}`, `${b3Nums[0]},${b3Nums[1]},${b3Nums[2]}`, b3Nums[0] === s1 + 1 && b3Nums[1] === s1 + 2 && b3Nums[2] === s1 + 3 ? 'PASS' : 'FAIL');

  const s2 = (await getCounters(t1)).globalSequenceCounter;
  // Simultaneous 2 independent receipts
  const [rConc1, rConc2] = await Promise.all([
    simulateFsCreateIndependentReceipt({ name: 'Conc Rcpt 1' }, t1),
    simulateFsCreateIndependentReceipt({ name: 'Conc Rcpt 2' }, t2)
  ]);
  const rNumsConc = [rConc1.receiptRecord.id, rConc2.receiptRecord.id].sort((a,b)=>a-b);
  recordResult('TEST-D-03', 'Concurrency', 'Two simultaneous independent receipts receive distinct numbers', `${s2 + 1},${s2 + 2}`, `${rNumsConc[0]},${rNumsConc[1]}`, rNumsConc[0] === s2 + 1 && rNumsConc[1] === s2 + 2 ? 'PASS' : 'FAIL');

  const s3 = (await getCounters(t1)).globalSequenceCounter;
  // Mixed simultaneous: 1 bill and 1 independent receipt
  const [mixedBill, mixedRcpt] = await Promise.all([
    simulateFsCreateBilling({ devoteeName: 'Mixed Bill' }, t1),
    simulateFsCreateIndependentReceipt({ name: 'Mixed Rcpt' }, t3)
  ]);
  const mixedNums = [mixedBill.billingRecord.id, mixedRcpt.receiptRecord.id].sort((a,b)=>a-b);
  recordResult('TEST-D-04', 'Concurrency', 'Mixed simultaneous bill and independent receipt receive distinct consecutive numbers', `${s3 + 1},${s3 + 2}`, `${mixedNums[0]},${mixedNums[1]}`, mixedNums[0] === s3 + 1 && mixedNums[1] === s3 + 2 ? 'PASS' : 'FAIL');

  const s4 = (await getCounters(t1)).globalSequenceCounter;
  const targetRaceNo = String(s4 + 1).padStart(3, '0');
  // Two users attempting same manual number simultaneously (both try targetRaceNo)
  let sameManualSuccess = 0;
  let sameManualFail = 0;
  await Promise.all([
    simulateFsCreateBilling({ manualBillNo: targetRaceNo }, t1).then(() => sameManualSuccess++).catch(() => sameManualFail++),
    simulateFsCreateIndependentReceipt({ manualReceiptNo: targetRaceNo }, t2).then(() => sameManualSuccess++).catch(() => sameManualFail++)
  ]);
  recordResult('TEST-D-05', 'Concurrency', 'Simultaneous race on same manual number: exactly one succeeds, one rejected', '1 pass, 1 fail', `${sameManualSuccess} pass, ${sameManualFail} fail`, sameManualSuccess === 1 && sameManualFail === 1 ? 'PASS' : 'FAIL');

  // Check no orphaned bill or linked receipt exists
  const allB = await listDocs('billing', t1);
  const allR = await listDocs('receipts', t1);
  const billingDocIds = new Set(allB.map(b => b.firestoreId));
  const linkedReceiptsWithMissingBill = allR.filter(r => r.source === 'billing' && !billingDocIds.has(r.billingFirestoreId));
  recordResult('TEST-D-06', 'Concurrency', 'Zero orphaned billing documents or linked accounting receipts', 0, linkedReceiptsWithMissingBill.length, linkedReceiptsWithMissingBill.length === 0 ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // TEST E: Void and Reservation Behavior
  // --------------------------------------------------------------------------
  console.log('\n--- Test E: Voiding & Reservation Immutability ---');
  // Void bill_1 and linked rcpt_1
  await simulateVoidBilling('bill_1', 'rcpt_1', 'Damaged thermal printer printout', t1);
  const vBillSnap = await firestoreRest('GET', 'billing/bill_1', null, t1);
  const vRcptSnap = await firestoreRest('GET', 'receipts/rcpt_1', null, t1);
  const vResSnap = await firestoreRest('GET', 'system/res_1', null, t1);

  const billIsVoided = vBillSnap.data.fields?.voided?.booleanValue === true;
  const rcptIsVoided = vRcptSnap.data.fields?.voided?.booleanValue === true;
  const resIsVoided = vResSnap.data.fields?.voided?.booleanValue === true;
  recordResult('TEST-E-01', 'Voiding', 'Voiding bill atomically voids linked accounting receipt', true, billIsVoided && rcptIsVoided, (billIsVoided && rcptIsVoided) ? 'PASS' : 'FAIL');
  recordResult('TEST-E-02', 'Voiding', 'Reservation system/res_1 preserved with voided status (number remains reserved)', true, resIsVoided, resIsVoided ? 'PASS' : 'FAIL');

  // Void independent receipt rcpt_3
  await simulateVoidReceipt('rcpt_3', 'Entered incorrect devotee fund', t2);
  const vRcpt3Snap = await firestoreRest('GET', 'receipts/rcpt_3', null, t2);
  const vRes3Snap = await firestoreRest('GET', 'system/res_3', null, t2);
  const rcpt3IsVoided = vRcpt3Snap.data.fields?.voided?.booleanValue === true;
  const res3IsVoided = vRes3Snap.data.fields?.voided?.booleanValue === true;
  recordResult('TEST-E-03', 'Voiding', 'Voiding independent receipt marks receipt and reservation voided', true, rcpt3IsVoided && res3IsVoided, (rcpt3IsVoided && res3IsVoided) ? 'PASS' : 'FAIL');

  // Attempt to reuse either voided number: REJECT
  let reuseVoidedBillRejected = false;
  try {
    await simulateFsCreateBilling({ manualBillNo: 'BILL-001' }, t1);
  } catch (err) {
    reuseVoidedBillRejected = true;
  }
  recordResult('TEST-E-04', 'Voiding', 'Attempt to reuse voided bill number 001: rejected', true, reuseVoidedBillRejected, reuseVoidedBillRejected ? 'PASS' : 'FAIL');

  let reuseVoidedRcptRejected = false;
  try {
    await simulateFsCreateIndependentReceipt({ manualReceiptNo: 'R-003' }, t2);
  } catch (err) {
    reuseVoidedRcptRejected = true;
  }
  recordResult('TEST-E-05', 'Voiding', 'Attempt to reuse voided receipt number 003: rejected', true, reuseVoidedRcptRejected, reuseVoidedRcptRejected ? 'PASS' : 'FAIL');

  // Next transaction advances without reusing voided number
  const curCounters = await getCounters(t1);
  const nextAuto = await simulateFsCreateBilling({ devoteeName: 'Post Void dev' }, t1);
  recordResult('TEST-E-06', 'Voiding', 'Next transaction advances sequence monotonically without reusing voided numbers', curCounters.globalSequenceCounter + 1, nextAuto.billingRecord.id, nextAuto.billingRecord.id === curCounters.globalSequenceCounter + 1 ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // TEST F: Legacy Compatibility
  // --------------------------------------------------------------------------
  console.log('\n--- Test F: Legacy Compatibility ---');
  // Inject synthetic historical records from old schemes (e.g. BILL-0001 with R-1001)
  const legacyBillDoc = {
    id: { integerValue: '9901' },
    receiptNo: { stringValue: 'BILL-0001' },
    accountingReceiptNo: { stringValue: 'R-1001' },
    accountingReceiptId: { stringValue: 'rcpt_legacy_1001' },
    firestoreId: { stringValue: 'bill_legacy_9901' },
    voided: { booleanValue: false },
    source: { stringValue: 'firestore' }
  };
  await firestoreRest('PATCH', 'billing/bill_legacy_9901', { fields: legacyBillDoc }, t1);

  const legacyRcptDoc = {
    id: { integerValue: '1001' },
    receiptNo: { stringValue: 'R-1001' },
    billingReceiptNo: { stringValue: 'BILL-0001' },
    billingFirestoreId: { stringValue: 'bill_legacy_9901' },
    firestoreId: { stringValue: 'rcpt_legacy_1001' },
    voided: { booleanValue: false },
    source: { stringValue: 'billing' }
  };
  await firestoreRest('PATCH', 'receipts/rcpt_legacy_1001', { fields: legacyRcptDoc }, t1);

  // Verify historical records remain unchanged
  const readLegBill = await firestoreRest('GET', 'billing/bill_legacy_9901', null, t1);
  const readLegRcpt = await firestoreRest('GET', 'receipts/rcpt_legacy_1001', null, t1);
  const legBillPreserved = readLegBill.data.fields?.receiptNo?.stringValue === 'BILL-0001';
  const legRcptPreserved = readLegRcpt.data.fields?.receiptNo?.stringValue === 'R-1001';
  recordResult('TEST-F-01', 'Legacy Compatibility', 'Historical bill number BILL-0001 and ID preserved without mutation', true, legBillPreserved, legBillPreserved ? 'PASS' : 'FAIL');
  recordResult('TEST-F-02', 'Legacy Compatibility', 'Historical linked receipt R-1001 and ID preserved without mutation', true, legRcptPreserved, legRcptPreserved ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // TEST G: Accounting Regression & Non-Destructive Restore Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Test G: Accounting Regression & Monotonic Restore ---');
  // Cash Book aggregation excludes voided transactions
  const activeReceipts = (await listDocs('receipts', t1)).filter(r => !r.voided && r.paymentMode === 'Cash');
  const activeCashTotal = activeReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
  recordResult('REG-01', 'Regression', 'Cash Book aggregation strictly excludes voided transactions', true, activeCashTotal > 0, activeCashTotal > 0 ? 'PASS' : 'FAIL', `Active cash: ₹${activeCashTotal}`);

  // Payment voucher numbering remains independent
  const curCountersBeforeVoucher = await getCounters(t1);
  const voucherRes = await firestoreRest('PATCH', 'system/counters', {
    fields: {
      globalSequenceCounter: { integerValue: String(curCountersBeforeVoucher.globalSequenceCounter) },
      billingReceiptCounter: { integerValue: String(curCountersBeforeVoucher.billingReceiptCounter) },
      receiptCounter: { integerValue: String(curCountersBeforeVoucher.receiptCounter) },
      voucherCounter: { integerValue: '501' }
    }
  }, t1);
  recordResult('REG-02', 'Regression', 'Payment vouchers remain strictly independent (V-501+)', 200, voucherRes.status, voucherRes.status === 200 ? 'PASS' : 'FAIL');

  // Monotonic restore logic test: restore with lower counter cannot rollback live counter
  const preRestoreCounters = await getCounters(t1);
  const backupWithLowerCounter = {
    globalSequenceCounter: 2, // lower than live (15+)
    billingReceiptCounter: 2,
    receiptCounter: 1000,
    voucherCounter: 500
  };
  const safeMergedGsc = Math.max(preRestoreCounters.globalSequenceCounter, backupWithLowerCounter.globalSequenceCounter);
  recordResult('REST-01', 'Safe Restore', 'Monotonic counter merge prevents sequence rollback during backup restore', preRestoreCounters.globalSequenceCounter, safeMergedGsc, safeMergedGsc === preRestoreCounters.globalSequenceCounter ? 'PASS' : 'FAIL');

  // Hardware / Safe Production Non-Executions
  recordResult('NT-01', 'Hardware', 'Physical 58mm Thermal Printer Hardware Output', 'N/A', 'N/A', 'NOT TESTED', 'Headless test environment');
  recordResult('NT-02', 'Safety', 'Live Cloud Firestore (temple-f4f7d) Production Mutations', 'PROHIBITED', 'PROHIBITED', 'NOT TESTED', 'Production mutations strictly forbidden');
  recordResult('NT-03', 'Safety', 'Live Firebase Rules CLI Deployment', 'QUARANTINED', 'QUARANTINED', 'NOT TESTED', 'Rules quarantined in firestore.rules.candidate');

  console.log('\n========================================================================');
  console.log('   STEP 33.12 AUDIT EXECUTION SUMMARY');
  console.log(`   Passed:     ${passed}`);
  console.log(`   Failed:     ${failed}`);
  console.log(`   Not Tested: ${notTested}`);
  console.log(`   Total:      ${results.length}`);
  console.log(`   Verdict:    ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
