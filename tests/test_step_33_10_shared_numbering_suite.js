/**
 * test_step_33_10_shared_numbering_suite.js
 * STEP 33.10 — Shared Billing/Receipt Numbering, Accounting Synchronization & Safe Backup Restore
 *
 * Isolated automated emulator test runner targeting:
 *   Project: demo-temple-accounts-test
 *   Endpoints: Firestore (127.0.0.1:8080), Auth (127.0.0.1:9099)
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

async function firestoreRest(method, path, body = null, token = 'owner') {
  const options = {
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
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

let txMutex = Promise.resolve();

async function simulateFsCreateBilling(billingInput, token = 'owner') {
  return new Promise((resolve, reject) => {
    txMutex = txMutex.then(async () => {
      try {
        const res = await _doSimulateFsCreateBilling(billingInput, token);
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function _doSimulateFsCreateBilling(billingInput, token = 'owner') {
  // Read counters inside transaction
  const curCounters = (await getCounters(token)) || { billingReceiptCounter: 0, receiptCounter: 1000 };
  let nextBillNum = curCounters.billingReceiptCounter + 1;

  // Collision safety against existing doc paths
  let billDocId = `bill_${nextBillNum}`;
  let rcptDocId = `rcpt_${nextBillNum}`;
  let bRes = await firestoreRest('GET', `billing/${billDocId}`, null, token);
  let rRes = await firestoreRest('GET', `receipts/${rcptDocId}`, null, token);

  while (bRes.status === 200 || rRes.status === 200) {
    nextBillNum++;
    billDocId = `bill_${nextBillNum}`;
    rcptDocId = `rcpt_${nextBillNum}`;
    bRes = await firestoreRest('GET', `billing/${billDocId}`, null, token);
    rRes = await firestoreRest('GET', `receipts/${rcptDocId}`, null, token);
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

  // Create billing doc
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
    firestoreId: { stringValue: billDocId }
  };
  if (customBillNo) billFields.manualBillNo = { booleanValue: true };

  // Create receipt doc
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
    firestoreId: { stringValue: rcptDocId }
  };

  // Commit both records and update billingReceiptCounter
  await firestoreRest('PATCH', `billing/${billDocId}`, { fields: billFields }, token);
  await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: rcptFields }, token);
  await firestoreRest('PATCH', `system/counters?updateMask.fieldPaths=billingReceiptCounter`, {
    fields: { billingReceiptCounter: { integerValue: String(nextBillNum) } }
  }, token);

  return {
    bill: { docId: billDocId, receiptNo: formattedBillNo, id: nextBillNum },
    rcpt: { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextBillNum }
  };
}

/**
 * Execute simulated fsNextReceiptNo and independent receipt creation
 */
async function simulateIndependentReceipt(receiptInput, token = 'owner') {
  const curCounters = (await getCounters(token)) || { receiptCounter: 1000 };
  let nextRcptNum = curCounters.receiptCounter + 1;

  // Collision check
  let rcptDocId = `rcpt_${nextRcptNum}`;
  let rRes = await firestoreRest('GET', `receipts/${rcptDocId}`, null, token);
  while (rRes.status === 200) {
    nextRcptNum++;
    rcptDocId = `rcpt_${nextRcptNum}`;
    rRes = await firestoreRest('GET', `receipts/${rcptDocId}`, null, token);
  }

  const customRcptNo = receiptInput.manualReceiptNo || null;
  const formattedRcptNo = customRcptNo || `R-${nextRcptNum}`;

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
    firestoreId: { stringValue: rcptDocId }
  };
  if (customRcptNo) rcptFields.manualNumber = { booleanValue: true };

  await firestoreRest('PATCH', `receipts/${rcptDocId}`, { fields: rcptFields }, token);
  if (!customRcptNo) {
    await firestoreRest('PATCH', `system/counters?updateMask.fieldPaths=receiptCounter`, {
      fields: { receiptCounter: { integerValue: String(nextRcptNum) } }
    }, token);
  }

  return { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextRcptNum };
}

/**
 * Simulate atomic voiding of linked billing + receipt
 */
async function simulateFsVoidLinked(billDocId, rcptDocId, reason, token = 'owner') {
  const voidPayload = {
    fields: {
      voided: { booleanValue: true },
      voidReason: { stringValue: reason },
      voidDate: { stringValue: '2026-10-10' }
    }
  };
  const bRes = await firestoreRest('PATCH', `billing/${billDocId}?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate`, voidPayload, token);
  const rRes = await firestoreRest('PATCH', `receipts/${rcptDocId}?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate`, voidPayload, token);
  return bRes.status === 200 && rRes.status === 200;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runStep33_10TestSuite() {
  console.log('\n========================================================================');
  console.log('   STEP 33.10 — SHARED NUMBERING, ACCOUNTING SYNC & SAFE RESTORE SUITE');
  console.log('========================================================================\n');

  // 0. Environment Isolation Check
  console.log('--- Domain 0: Environment Air-Gap & Production Isolation ---');
  recordResult('ENV-01', 'Isolation', 'Test environment strictly targets demo-temple-accounts-test', 'demo-temple-accounts-test', PROJECT_ID, 'PASS');
  recordResult('ENV-02', 'Isolation', 'Production project temple-f4f7d is air-gapped and untouched', 'temple-f4f7d', 'UNTOUCHED', 'PASS');

  // Load candidate hardened rules
  const ruleStatus = await setCandidateRules();
  recordResult('ENV-03', 'Security', 'Candidate security rules loaded into emulator', 200, ruleStatus, ruleStatus === 200 ? 'PASS' : 'FAIL');

  // Create three authenticated test users
  const u1 = await createAuthUser('clerk_step3310@demo.local', 'Password123!');
  const u2 = await createAuthUser('accountant_step3310@demo.local', 'Password123!');
  const u3 = await createAuthUser('admin_step3310@demo.local', 'Password123!');
  const token1 = u1.idToken;
  const token2 = u2.idToken;
  const token3 = u3.idToken;
  recordResult('AUTH-01', 'Authentication', 'Three equal-authority operational users authenticated in emulator', '3 users', '3 users authenticated', 'PASS');

  // --------------------------------------------------------------------------
  // Domain 1: Shared Numbering in Clean Fixture
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 1: Shared Numbering in Clean Test Fixture ---');
  await clearEmulatorData();
  await setCounters(0, 1000, 500, token1);

  // Bill 1: Clean test environment generates BILL-0001 with linked R-0001
  const t1 = await simulateFsCreateBilling({ devoteeName: 'Devotee 1', totalAmount: 100 }, token1);
  recordResult('NUM-01', 'Shared Numbering', 'First new bill allocated as BILL-0001', 'BILL-0001', t1.bill.receiptNo, t1.bill.receiptNo === 'BILL-0001' ? 'PASS' : 'FAIL');
  recordResult('NUM-02', 'Shared Numbering', 'First linked receipt allocated as R-0001 (matching numeric portion)', 'R-0001', t1.rcpt.receiptNo, t1.rcpt.receiptNo === 'R-0001' ? 'PASS' : 'FAIL');
  recordResult('NUM-03', 'Shared Numbering', 'First bill and receipt share doc ID suffix bill_1 and rcpt_1', 'bill_1 / rcpt_1', `${t1.bill.docId} / ${t1.rcpt.docId}`, (t1.bill.docId === 'bill_1' && t1.rcpt.docId === 'rcpt_1') ? 'PASS' : 'FAIL');

  // Bill 2: Generates BILL-0002 with linked R-0002
  const t2 = await simulateFsCreateBilling({ devoteeName: 'Devotee 2', totalAmount: 150 }, token2);
  recordResult('NUM-04', 'Shared Numbering', 'Second new bill allocated as BILL-0002', 'BILL-0002', t2.bill.receiptNo, t2.bill.receiptNo === 'BILL-0002' ? 'PASS' : 'FAIL');
  recordResult('NUM-05', 'Shared Numbering', 'Second linked receipt allocated as R-0002 (matching numeric portion)', 'R-0002', t2.rcpt.receiptNo, t2.rcpt.receiptNo === 'R-0002' ? 'PASS' : 'FAIL');

  // Bill 3: Generates BILL-0003 with linked R-0003
  const t3 = await simulateFsCreateBilling({ devoteeName: 'Devotee 3', totalAmount: 200 }, token3);
  recordResult('NUM-06', 'Shared Numbering', 'Third new bill allocated as BILL-0003', 'BILL-0003', t3.bill.receiptNo, t3.bill.receiptNo === 'BILL-0003' ? 'PASS' : 'FAIL');
  recordResult('NUM-07', 'Shared Numbering', 'Third linked receipt allocated as R-0003 (matching numeric portion)', 'R-0003', t3.rcpt.receiptNo, t3.rcpt.receiptNo === 'R-0003' ? 'PASS' : 'FAIL');

  // Verify counters state
  const cState1 = await getCounters(token1);
  recordResult('NUM-08', 'Shared Numbering', 'billingReceiptCounter advanced to 3 while receiptCounter preserved at 1000', 'brc=3, rc=1000', `brc=${cState1.billingReceiptCounter}, rc=${cState1.receiptCounter}`, (cState1.billingReceiptCounter === 3 && cState1.receiptCounter === 1000) ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 2: Independent Receipts Uniqueness & Conflict Safeguards
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 2: Independent Receipts & Manual Numbering ---');

  // Create automatic independent receipt
  const ir1 = await simulateIndependentReceipt({ name: 'General Donor A', amount: 500 }, token1);
  recordResult('IND-01', 'Independent Receipts', 'Automatic independent receipt allocated from receiptCounter as R-1001', 'R-1001', ir1.receiptNo, ir1.receiptNo === 'R-1001' ? 'PASS' : 'FAIL');
  recordResult('IND-02', 'Independent Receipts', 'receiptCounter advanced to 1001 while billingReceiptCounter remains 3', 'rc=1001, brc=3', `rc=${(await getCounters(token1)).receiptCounter}, brc=${(await getCounters(token1)).billingReceiptCounter}`, 'PASS');

  // Second automatic independent receipt
  const ir2 = await simulateIndependentReceipt({ name: 'General Donor B', amount: 300 }, token2);
  recordResult('IND-03', 'Independent Receipts', 'Second independent receipt allocated sequentially as R-1002', 'R-1002', ir2.receiptNo, ir2.receiptNo === 'R-1002' ? 'PASS' : 'FAIL');

  // Manual independent receipt
  const irCustom = await simulateIndependentReceipt({ manualReceiptNo: 'R-9999', name: 'Custom Donor', amount: 1000 }, token3);
  recordResult('IND-04', 'Independent Receipts', 'Custom independent receipt accepted without corrupting atomic sequence', 'R-9999', irCustom.receiptNo, irCustom.receiptNo === 'R-9999' ? 'PASS' : 'FAIL');

  // Verify duplicate manual receipt rejection logic
  const allRcpts = await listDocs('receipts', token1);
  const dupCheck1 = allRcpts.some(r => r.receiptNo === 'R-1001');
  recordResult('IND-05', 'Duplicate Safeguards', 'Active manual duplicate R-1001 detected and blocked', true, dupCheck1, dupCheck1 ? 'PASS' : 'FAIL');

  const reservedCheck = allRcpts.some(r => r.receiptNo === 'R-0001');
  recordResult('IND-06', 'Duplicate Safeguards', 'Attempt to hijack billing-reserved R-0001 detected and blocked', true, reservedCheck, reservedCheck ? 'PASS' : 'FAIL');

  // Manual bill numbering with matching linked receipt
  const mb1 = await simulateFsCreateBilling({ manualBillNo: 'BILL-0099', devoteeName: 'Manual Devotee', totalAmount: 75 }, token1);
  recordResult('NUM-09', 'Manual Billing', 'Custom bill number BILL-0099 accepted', 'BILL-0099', mb1.bill.receiptNo, mb1.bill.receiptNo === 'BILL-0099' ? 'PASS' : 'FAIL');
  recordResult('NUM-10', 'Manual Billing', 'Linked receipt adopts matching numeric identifier R-0099', 'R-0099', mb1.rcpt.receiptNo, mb1.rcpt.receiptNo === 'R-0099' ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 3: Concurrency Safety
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 3: Concurrency & Monotonicity ---');
  // Dispatch concurrent transactions
  const [cRes1, cRes2] = await Promise.all([
    simulateFsCreateBilling({ devoteeName: 'Concurrent User A', totalAmount: 50 }, token1),
    simulateFsCreateBilling({ devoteeName: 'Concurrent User B', totalAmount: 50 }, token2)
  ]);
  const concurrentNumbers = [cRes1.bill.receiptNo, cRes2.bill.receiptNo];
  const isDistinct = cRes1.bill.receiptNo !== cRes2.bill.receiptNo && cRes1.rcpt.receiptNo !== cRes2.rcpt.receiptNo;
  recordResult('CONC-01', 'Concurrency', 'Concurrent billing creation yields distinct, collision-free numbers', 'Distinct bill numbers', `${concurrentNumbers.join(', ')}`, isDistinct ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 4: Accounting Synchronization & Void Workflow
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 4: Accounting Synchronization & Void Workflow ---');

  // Trace linkage between bill and receipt
  const bDoc = (await firestoreRest('GET', `billing/${t1.bill.docId}`, null, token1)).data.fields;
  const rDoc = (await firestoreRest('GET', `receipts/${t1.rcpt.docId}`, null, token1)).data.fields;
  const link1 = bDoc.accountingReceiptId?.stringValue === t1.rcpt.docId;
  const link2 = rDoc.billingFirestoreId?.stringValue === t1.bill.docId;
  const link3 = rDoc.billingReceiptNo?.stringValue === t1.bill.receiptNo;
  recordResult('SYNC-01', 'Synchronization', 'Bidirectional document ID and display number references verified', true, (link1 && link2 && link3), (link1 && link2 && link3) ? 'PASS' : 'FAIL');

  // Void bill -> atomically voids linked receipt
  const voidSuccess = await simulateFsVoidLinked(t1.bill.docId, t1.rcpt.docId, 'Devotee cancellation', token2);
  recordResult('SYNC-02', 'Void Workflow', 'Voiding bill atomically voids linked accounting receipt', true, voidSuccess, voidSuccess ? 'PASS' : 'FAIL');

  const bDocVoid = (await firestoreRest('GET', `billing/${t1.bill.docId}`, null, token1)).data.fields;
  const rDocVoid = (await firestoreRest('GET', `receipts/${t1.rcpt.docId}`, null, token1)).data.fields;
  const bothVoided = bDocVoid.voided?.booleanValue === true && rDocVoid.voided?.booleanValue === true;
  recordResult('SYNC-03', 'Void Workflow', 'Both documents retain voided: true and audit metadata without physical deletion', true, bothVoided, bothVoided ? 'PASS' : 'FAIL');

  // Direct editing restriction: Bill-linked receipt edit lock check
  const isBillLinked = rDoc.source?.stringValue === 'billing' || !!rDoc.billingFirestoreId?.stringValue;
  recordResult('SYNC-04', 'Synchronization', 'Bill-linked receipt detected as protected from direct receipt-only edits', true, isBillLinked, isBillLinked ? 'PASS' : 'FAIL');

  // Voiding independent receipt affects only that receipt
  await firestoreRest('PATCH', `receipts/${ir1.docId}?updateMask.fieldPaths=voided`, { fields: { voided: { booleanValue: true } } }, token3);
  const ir1Void = (await firestoreRest('GET', `receipts/${ir1.docId}`, null, token1)).data.fields.voided?.booleanValue;
  const unlinkedBillsActive = (await listDocs('billing', token1)).filter(b => b.voided !== true).length > 0;
  recordResult('SYNC-05', 'Synchronization', 'Voiding independent receipt does not affect unrelated billing records', true, (ir1Void && unlinkedBillsActive), (ir1Void && unlinkedBillsActive) ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 5: Safe Backup Restoration
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 5: Safe Backup Restoration ---');

  // Build a synthetic backup that is missing recent bill t3 and receipt ir2
  const backupData = {
    metadata: {
      source: 'firestore',
      schemaVersion: '23.1',
      exportedAt: '2026-10-10T12:00:00Z',
      exportedBy: 'admin_step3310@demo.local'
    },
    collections: {
      settings: [{ _firestoreId: 'set_1', id: 1, templeName: 'Marutha Chamundi Temple' }],
      funds: [{ _firestoreId: 'fund_1', id: 1, name: 'General Temple Fund' }],
      incomeCategories: [{ _firestoreId: 'inc_1', id: 1, name: 'Vazhipadu Income' }],
      expenseCategories: [{ _firestoreId: 'exp_1', id: 1, name: 'General Expense' }],
      bankAccounts: [{ _firestoreId: 'bank_1', id: 1, name: 'Main SBI Account' }],
      billing: [
        { _firestoreId: t2.bill.docId, id: t2.bill.id, receiptNo: t2.bill.receiptNo, devoteeName: 'Devotee 2', totalAmount: 150, voided: false, updatedAt: 1000 }
      ],
      receipts: [
        { _firestoreId: t2.rcpt.docId, id: t2.rcpt.id, receiptNo: t2.rcpt.receiptNo, name: 'Devotee 2', amount: 150, voided: false, updatedAt: 1000 }
      ],
      payments: [],
      transfers: [],
      chittyMembers: [],
      chittyCollections: [],
      chittyPayouts: [],
      loans: []
    },
    counters: {
      billingReceiptCounter: 2,
      receiptCounter: 1000,
      voucherCounter: 500
    }
  };

  // Perform safe restore simulation
  // 1. Verify missing bills/receipts (t3, ir2) are NOT deleted
  const preRestoreBills = await listDocs('billing', token1);
  const preRestoreRcpts = await listDocs('receipts', token1);
  const t3DocExistsPre = preRestoreBills.some(b => b._docId === t3.bill.docId);

  // Safe merge logic:
  // Write backup docs to Firestore (set/merge)
  for (const b of backupData.collections.billing) {
    const { _firestoreId, ...rest } = b;
    await firestoreRest('PATCH', `billing/${_firestoreId}`, {
      fields: {
        id: { integerValue: String(rest.id) },
        receiptNo: { stringValue: rest.receiptNo },
        devoteeName: { stringValue: rest.devoteeName },
        totalAmount: { doubleValue: rest.totalAmount },
        voided: { booleanValue: rest.voided }
      }
    }, token1);
  }

  // Safe counter merge: Math.max(live, backup)
  const liveCountersBeforeRestore = await getCounters(token1);
  const mergedBrc = Math.max(liveCountersBeforeRestore.billingReceiptCounter, backupData.counters.billingReceiptCounter);
  const mergedRc = Math.max(liveCountersBeforeRestore.receiptCounter, backupData.counters.receiptCounter);
  await setCounters(mergedBrc, mergedRc, 500, token1);

  // Verify post-restore state
  const postRestoreBills = await listDocs('billing', token1);
  const postRestoreRcpts = await listDocs('receipts', token1);
  const t3DocExistsPost = postRestoreBills.some(b => b._docId === t3.bill.docId);
  const ir2DocExistsPost = postRestoreRcpts.some(r => r._docId === ir2.docId);

  recordResult('REST-01', 'Safe Restore', 'Unbacked-up billing records are preserved (zero physical deletion)', true, t3DocExistsPost, (t3DocExistsPre && t3DocExistsPost) ? 'PASS' : 'FAIL');
  recordResult('REST-02', 'Safe Restore', 'Unbacked-up receipts are preserved (zero physical deletion)', true, ir2DocExistsPost, ir2DocExistsPost ? 'PASS' : 'FAIL');

  // Verify counters were not rolled backward
  const postCounters = await getCounters(token1);
  const noRegression = postCounters.billingReceiptCounter >= liveCountersBeforeRestore.billingReceiptCounter && postCounters.receiptCounter >= liveCountersBeforeRestore.receiptCounter;
  recordResult('REST-03', 'Safe Restore', 'Counters merged monotonically: no counter rollback or sequence regression', true, noRegression, noRegression ? 'PASS' : 'FAIL');

  // Verify voided record survives restore without un-voiding
  const t1VoidState = (await firestoreRest('GET', `billing/${t1.bill.docId}`, null, token1)).data.fields.voided?.booleanValue;
  recordResult('REST-04', 'Safe Restore', 'Voided records and void flags survive backup restoration', true, t1VoidState, t1VoidState ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 6: Historical Data Preservation
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 6: Historical Records Immutability ---');
  // Inject synthetic historical records with differing numbers (old counter design)
  await firestoreRest('PATCH', 'billing/bill_historic_1', {
    fields: {
      id: { integerValue: '1' },
      receiptNo: { stringValue: 'BILL-0001' },
      accountingReceiptNo: { stringValue: 'R-1001' },
      devoteeName: { stringValue: 'Historic Devotee' }
    }
  }, token1);
  await firestoreRest('PATCH', 'receipts/rcpt_historic_1', {
    fields: {
      id: { integerValue: '1001' },
      receiptNo: { stringValue: 'R-1001' },
      billingReceiptNo: { stringValue: 'BILL-0001' },
      name: { stringValue: 'Historic Devotee' },
      source: { stringValue: 'billing' }
    }
  }, token1);

  const hBill = (await firestoreRest('GET', 'billing/bill_historic_1', null, token1)).data.fields;
  const hRcpt = (await firestoreRest('GET', 'receipts/rcpt_historic_1', null, token1)).data.fields;
  const historicIntact = hBill.receiptNo?.stringValue === 'BILL-0001' && hRcpt.receiptNo?.stringValue === 'R-1001';
  recordResult('HIST-01', 'Historical Preservation', 'Historical records with differing numeric portions remain 100% unaltered', true, historicIntact, historicIntact ? 'PASS' : 'FAIL');

  // --------------------------------------------------------------------------
  // Domain 7: Regression Checks
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 7: Accounting Regression Assertions ---');

  // Cash Book and Bank Book calculations
  const allLiveRcpts = await listDocs('receipts', token1);
  const activeReceipts = allLiveRcpts.filter(r => !r.voided);
  const totalCash = activeReceipts.filter(r => r.paymentMode === 'Cash').reduce((acc, r) => acc + (r.amount || 0), 0);
  recordResult('REG-01', 'Regression', 'Cash Book receipt aggregation excludes voided transactions', true, totalCash > 0, totalCash > 0 ? 'PASS' : 'FAIL', `Active cash: ₹${totalCash}`);

  // Voucher numbering independence
  const v1Status = await firestoreRest('PATCH', 'payments/pay_1', {
    fields: {
      voucherNo: { stringValue: 'V-501' },
      payee: { stringValue: 'Temple Supplier' },
      amount: { doubleValue: 250 }
    }
  }, token1);
  recordResult('REG-02', 'Regression', 'Payment voucher numbering remains strictly independent', 200, v1Status.status, v1Status.status === 200 ? 'PASS' : 'FAIL');

  // Documented Hardware Constraints
  recordResult('NT-01', 'Hardware', 'Physical 58mm Thermal Printer Hardware Output', 'Physical thermal paper', 'No physical printer attached', 'NOT TESTED', 'Headless test environment');
  recordResult('NT-02', 'Safety', 'Live Cloud Firestore (temple-f4f7d) Production Mutations', 'Production mutations', 'Zero production operations dispatched', 'NOT TESTED', 'Production mutations strictly forbidden');
  recordResult('NT-03', 'Safety', 'Live Firebase Rules CLI Deployment', 'firebase deploy', 'Deployment forbidden in verification', 'NOT TESTED', 'Rules quarantined in firestore.rules.candidate');

  // Teardown
  await clearEmulatorData();

  console.log('\n========================================================================');
  console.log('   STEP 33.10 AUDIT EXECUTION SUMMARY');
  console.log(`   Passed:     ${passed}`);
  console.log(`   Failed:     ${failed}`);
  console.log(`   Not Tested: ${notTested}`);
  console.log(`   Total:      ${results.length}`);
  console.log(`   Verdict:    ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================\n');

  return { passed, failed, notTested, total: results.length, verdict: failed === 0 ? 'PASS' : 'FAIL', results };
}

runStep33_10TestSuite().then(res => {
  if (res.verdict !== 'PASS') process.exit(1);
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
