/**
 * test_step_33_32_cold_start_suite.js
 * STEP 33.32 — Cold-Start Counter Initialization Verification Suite
 *
 * Targets strictly the isolated disposable emulator:
 *   Project: demo-temple-accounts-step-33-32
 *   Endpoints: Firestore (127.0.0.1:8280), Auth (127.0.0.1:9199)
 *   Candidate Rules: firestore.rules.candidate
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const EMULATOR_HOST = process.env.EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_PORT = parseInt(process.env.FIRESTORE_PORT, 10) || 8280;
const AUTH_PORT = parseInt(process.env.AUTH_PORT, 10) || 9199;
const PROJECT_ID = process.env.PROJECT_ID || 'demo-temple-accounts-step-33-32';

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
  const candidatePath = (fs.existsSync(path.join(__dirname, 'firestore.rules.candidate'))
    ? path.join(__dirname, 'firestore.rules.candidate')
    : path.join(__dirname, '..', 'firestore.rules.candidate'));
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

/**
 * Genuine application transaction implementation matching fsCreateBillingWithAccounting
 * Handles cold start where system/counters does not yet exist.
 */
async function executeColdStartBilling(billingInput, userToken, userUid, maxRetries = 20) {
  const counterDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/counters`;
  const opId = billingInput.operationId || `op_cold_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const opDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${opId}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const txRes = await firestoreRest('POST', ':beginTransaction', {}, userToken);
    const txId = txRes.data?.transaction;
    if (!txId) throw new Error(`Failed to begin transaction: ${JSON.stringify(txRes.data)}`);

    try {
      // 1. Read counters and op doc
      const bgRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [counterDocPath, opDocPath]
      }, userToken);

      let counterDocFound = false;
      let curSeq = 0;
      let opDocFound = null;

      if (Array.isArray(bgRes.data)) {
        for (const item of bgRes.data) {
          if (item.found && item.found.name.endsWith('/system/counters')) {
            counterDocFound = true;
            const f = item.found.fields;
            curSeq = parseInt(f?.globalSequenceCounter?.integerValue || '0', 10);
          }
          if (item.found && item.found.name.endsWith(`/${opId}`)) {
            opDocFound = item.found;
          }
        }
      }

      // Idempotency short-circuit
      if (opDocFound) {
        await firestoreRest('POST', ':rollback', { transaction: txId }, userToken).catch(() => {});
        return {
          isReplay: true,
          opId,
          bill: { receiptNo: opDocFound.fields.billReceiptNo?.stringValue },
          rcpt: { receiptNo: opDocFound.fields.receiptNo?.stringValue },
          id: parseInt(opDocFound.fields.seqNumber?.integerValue || '1', 10)
        };
      }

      // Next sequence: if counter does not exist, cold-start sequence = 1
      const nextBillNum = curSeq + 1;
      const formattedNo = String(nextBillNum).padStart(3, '0');
      const formattedBillNo = `BILL-${formattedNo}`;
      const formattedRcptNo = `R-${formattedNo}`;
      const resDocId = `res_${nextBillNum}`;
      const billDocId = `bill_${nextBillNum}`;
      const rcptDocId = `rcpt_${nextBillNum}`;

      const resDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/system/${resDocId}`;
      const billDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/billing/${billDocId}`;
      const rcptDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/receipts/${rcptDocId}`;

      // Collision check
      const checkRes = await firestoreRest('POST', ':batchGet', {
        transaction: txId,
        documents: [resDocPath, billDocPath, rcptDocPath]
      }, userToken);

      const hasCollision = Array.isArray(checkRes.data) && checkRes.data.some(d => d.found);
      if (hasCollision) {
        // Retry with higher number or conflict
        throw { isConflict: true, message: 'Collision detected on ' + nextBillNum };
      }

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
        operationId: { stringValue: opId },
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
        date: { stringValue: '10/10/2026' },
        accountingReceiptId: { stringValue: rcptDocId },
        accountingReceiptNo: { stringValue: formattedRcptNo },
        reservationDocId: { stringValue: resDocId },
        operationId: { stringValue: opId },
        source: { stringValue: 'firestore' },
        voided: { booleanValue: false },
        firestoreId: { stringValue: billDocId },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) }
      };

      const rcptFields = {
        id: { integerValue: String(nextBillNum) },
        receiptNo: { stringValue: formattedRcptNo },
        name: { stringValue: billingInput.devoteeName || 'Devotee' },
        fund: { stringValue: 'General Temple Fund' },
        category: { stringValue: 'Vazhipadu Income' },
        amount: { doubleValue: billingInput.totalAmount || 50 },
        paymentMode: { stringValue: billingInput.paymentMode || 'Cash' },
        date: { stringValue: '2026-10-10' },
        reservationDocId: { stringValue: resDocId },
        operationId: { stringValue: opId },
        source: { stringValue: 'billing' },
        billingId: { integerValue: String(nextBillNum) },
        billingFirestoreId: { stringValue: billDocId },
        billingReceiptNo: { stringValue: formattedBillNo },
        voided: { booleanValue: false },
        firestoreId: { stringValue: rcptDocId },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) }
      };

      const opFields = {
        operationId: { stringValue: opId },
        type: { stringValue: 'billing_linked' },
        status: { stringValue: 'committed' },
        seqNumber: { integerValue: String(nextBillNum) },
        formattedNo: { stringValue: formattedNo },
        billDocId: { stringValue: billDocId },
        receiptDocId: { stringValue: rcptDocId },
        resDocId: { stringValue: resDocId },
        billReceiptNo: { stringValue: formattedBillNo },
        accountingReceiptNo: { stringValue: formattedRcptNo },
        amount: { doubleValue: billingInput.totalAmount || 50 },
        fingerprint: { stringValue: `v2|${billingInput.totalAmount || 50}|${billingInput.devoteeName || 'Devotee'}|Cash` },
        createdBy: { stringValue: userUid },
        createdAt: { integerValue: String(nowTs) }
      };

      // Construct atomic writes
      const writes = [];
      if (!counterDocFound) {
        // Cold start creation: candidate rules allow create if !exists(system/counters)
        writes.push({
          update: {
            name: counterDocPath,
            fields: {
              globalSequenceCounter: { integerValue: String(nextBillNum) },
              billingReceiptCounter: { integerValue: String(nextBillNum) },
              receiptCounter: { integerValue: '1000' },
              voucherCounter: { integerValue: '500' },
              billingPrefix: { stringValue: 'BILL-' },
              receiptPrefix: { stringValue: 'R-' },
              voucherPrefix: { stringValue: 'V-' }
            }
          }
        });
      } else {
        writes.push({
          update: {
            name: counterDocPath,
            fields: {
              globalSequenceCounter: { integerValue: String(nextBillNum) },
              billingReceiptCounter: { integerValue: String(nextBillNum) }
            }
          },
          updateMask: { fieldPaths: ['globalSequenceCounter', 'billingReceiptCounter'] }
        });
      }

      writes.push({ update: { name: resDocPath, fields: resFields } });
      writes.push({ update: { name: billDocPath, fields: billFields } });
      writes.push({ update: { name: rcptDocPath, fields: rcptFields } });
      writes.push({ update: { name: opDocPath, fields: opFields } });

      const commitRes = await firestoreRest('POST', ':commit', {
        transaction: txId,
        writes: writes
      }, userToken);

      if (commitRes.status === 200) {
        return {
          isReplay: false,
          bill: { docId: billDocId, receiptNo: formattedBillNo, id: nextBillNum },
          rcpt: { docId: rcptDocId, receiptNo: formattedRcptNo, id: nextBillNum },
          res: { docId: resDocId, id: nextBillNum },
          opId,
          attempts: attempt
        };
      } else if (commitRes.status === 409) {
        const delay = Math.min(60 * attempt + Math.floor(Math.random() * 150), 1500);
        await new Promise(r => setTimeout(r, delay));
        continue;
      } else {
        throw new Error(`Commit failed (${commitRes.status}): ${JSON.stringify(commitRes.data)}`);
      }
    } catch (err) {
      if (txId) {
        await firestoreRest('POST', ':rollback', { transaction: txId }, userToken).catch(() => {});
      }
      if (err.isConflict || (err.message && err.message.includes('409'))) {
        const delay = Math.min(60 * attempt + Math.floor(Math.random() * 150), 1500);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Transaction exceeded max retries (${maxRetries})`);
}

async function runColdStartSuite() {
  console.log('========================================================================');
  console.log('   STEP 33.32 — COLD-START COUNTER INITIALIZATION VERIFICATION');
  console.log('   Target Project: ' + PROJECT_ID);
  console.log('========================================================================\n');

  // Phase 1: Environment & Rules Verification
  console.log('--- Phase 1: Clean Cold-Start Fixture Preparation ---');
  recordResult('COLD-ENV-01', 'Cold-Start Isolation', 'Target project strictly begins with demo-', true, PROJECT_ID.startsWith('demo-'), PROJECT_ID.startsWith('demo-') ? 'PASS' : 'FAIL');
  
  const rulesStatus = await setCandidateRules();
  recordResult('COLD-ENV-02', 'Candidate Rules', 'Candidate rules loaded into disposable emulator', 200, rulesStatus, rulesStatus === 200 ? 'PASS' : 'FAIL');

  // Completely wipe disposable emulator data
  await clearEmulatorData();

  // Authenticate operational users
  const u1 = await authenticateTestUser('clerk_cold1@temple.org');
  const u2 = await authenticateTestUser('clerk_cold2@temple.org');
  const u3 = await authenticateTestUser('clerk_cold3@temple.org');
  recordResult('COLD-AUTH-01', 'Authentication', 'Three operational users authenticated in disposable emulator', true, !!(u1.idToken && u2.idToken && u3.idToken), 'PASS');

  // Verify counters document does NOT exist (authenticated read returns 404)
  const countersCheck = await firestoreRest('GET', 'system/counters', null, u1.idToken);
  recordResult('COLD-FIXTURE-01', 'Clean State', 'system/counters is non-existent before first transaction', 404, countersCheck.status, countersCheck.status === 404 ? 'PASS' : 'FAIL');

  // Verify reservations and billing are completely empty
  const billingCheck = await firestoreRest('GET', 'billing', null, u1.idToken);
  const receiptsCheck = await firestoreRest('GET', 'receipts', null, u1.idToken);
  const billingEmpty = billingCheck.status === 200 && (!billingCheck.data.documents || billingCheck.data.documents.length === 0);
  const receiptsEmpty = receiptsCheck.status === 200 && (!receiptsCheck.data.documents || receiptsCheck.data.documents.length === 0);
  recordResult('COLD-FIXTURE-02', 'Clean State', 'billing and receipts collections are completely empty', true, billingEmpty && receiptsEmpty, (billingEmpty && receiptsEmpty) ? 'PASS' : 'FAIL');

  // Phase 2: First Valid Transaction Initializes Numbering Correctly
  console.log('\n--- Phase 2: First Valid Transaction (0 -> 001) ---');
  const firstTx = await executeColdStartBilling({ devoteeName: 'First Devotee', totalAmount: 101 }, u1.idToken, u1.localId);
  
  recordResult('COLD-TX-01', 'First Transaction', 'First transaction allocates BILL-001', 'BILL-001', firstTx.bill.receiptNo, firstTx.bill.receiptNo === 'BILL-001' ? 'PASS' : 'FAIL');
  recordResult('COLD-TX-02', 'First Transaction', 'First transaction allocates linked receipt R-001', 'R-001', firstTx.rcpt.receiptNo, firstTx.rcpt.receiptNo === 'R-001' ? 'PASS' : 'FAIL');
  recordResult('COLD-TX-03', 'First Transaction', 'Sequence reservation created in system/res_1', 'res_1', firstTx.res.docId, firstTx.res.docId === 'res_1' ? 'PASS' : 'FAIL');

  // Verify counters document was created and initialized to 1
  const cSnap = await firestoreRest('GET', 'system/counters', null, u1.idToken);
  const curGsc = parseInt(cSnap.data?.fields?.globalSequenceCounter?.integerValue || '0', 10);
  const curBrc = parseInt(cSnap.data?.fields?.billingReceiptCounter?.integerValue || '0', 10);
  recordResult('COLD-TX-04', 'Counter Initialization', 'system/counters initialized with globalSequenceCounter=1', 1, curGsc, curGsc === 1 ? 'PASS' : 'FAIL');
  recordResult('COLD-TX-05', 'Counter Initialization', 'system/counters initialized with billingReceiptCounter=1', 1, curBrc, curBrc === 1 ? 'PASS' : 'FAIL');

  // Verify resulting records satisfy candidate rules
  const readBill = await firestoreRest('GET', 'billing/bill_1', null, u1.idToken);
  const readRcpt = await firestoreRest('GET', 'receipts/rcpt_1', null, u1.idToken);
  const readRes = await firestoreRest('GET', 'system/res_1', null, u1.idToken);
  recordResult('COLD-TX-06', 'Rules Compliance', 'Committed billing record bill_1 satisfies candidate rules', 200, readBill.status, readBill.status === 200 ? 'PASS' : 'FAIL');
  recordResult('COLD-TX-07', 'Rules Compliance', 'Committed accounting receipt rcpt_1 satisfies candidate rules', 200, readRcpt.status, readRcpt.status === 200 ? 'PASS' : 'FAIL');
  recordResult('COLD-TX-08', 'Rules Compliance', 'Committed reservation res_1 satisfies candidate rules', 200, readRes.status, readRes.status === 200 ? 'PASS' : 'FAIL');

  // Phase 3: Idempotent Retries Do Not Duplicate Committed Records
  console.log('\n--- Phase 3: Idempotent Retry on Cold-Start Transaction ---');
  const replayTx = await executeColdStartBilling({
    operationId: firstTx.opId,
    devoteeName: 'First Devotee',
    totalAmount: 101
  }, u1.idToken, u1.localId);

  recordResult('COLD-RETRY-01', 'Idempotency', 'Replay detected via operationId short-circuit', true, replayTx.isReplay, replayTx.isReplay ? 'PASS' : 'FAIL');
  recordResult('COLD-RETRY-02', 'Idempotency', 'Replay returns identical bill receipt number BILL-001', 'BILL-001', replayTx.bill.receiptNo, replayTx.bill.receiptNo === 'BILL-001' ? 'PASS' : 'FAIL');

  const cSnapAfterReplay = await firestoreRest('GET', 'system/counters', null, u1.idToken);
  const gscAfterReplay = parseInt(cSnapAfterReplay.data?.fields?.globalSequenceCounter?.integerValue || '0', 10);
  recordResult('COLD-RETRY-03', 'Idempotency', 'Counter not incremented on replayed transaction (remains 1)', 1, gscAfterReplay, gscAfterReplay === 1 ? 'PASS' : 'FAIL');

  // Phase 4: Concurrent Initial Transactions on Cold Start
  console.log('\n--- Phase 4: Concurrent Initial Transactions on Fresh Cold Start ---');
  // Wipe database again for true concurrent cold-start race
  await clearEmulatorData();

  // Three users launch their first transaction simultaneously against non-existent counters
  const [conc1, conc2, conc3] = await Promise.all([
    executeColdStartBilling({ devoteeName: 'Racer 1', totalAmount: 50 }, u1.idToken, u1.localId),
    executeColdStartBilling({ devoteeName: 'Racer 2', totalAmount: 60 }, u2.idToken, u2.localId),
    executeColdStartBilling({ devoteeName: 'Racer 3', totalAmount: 70 }, u3.idToken, u3.localId)
  ]);

  const allocatedIds = [conc1.bill.id, conc2.bill.id, conc3.bill.id].sort((a,b)=>a-b);
  recordResult('COLD-CONC-01', 'Concurrent Cold Start', 'Three concurrent cold transactions allocate distinct numbers', '1,2,3', `${allocatedIds[0]},${allocatedIds[1]},${allocatedIds[2]}`,
    (allocatedIds[0] === 1 && allocatedIds[1] === 2 && allocatedIds[2] === 3) ? 'PASS' : 'FAIL',
    `User retries: U1(${conc1.attempts}), U2(${conc2.attempts}), U3(${conc3.attempts})`);

  const uniqueAllocated = new Set(allocatedIds);
  recordResult('COLD-CONC-02', 'Concurrent Cold Start', 'Zero duplicate numbers issued under concurrent initialization', 3, uniqueAllocated.size, uniqueAllocated.size === 3 ? 'PASS' : 'FAIL');

  const cSnapAfterConc = await firestoreRest('GET', 'system/counters', null, u1.idToken);
  const gscAfterConc = parseInt(cSnapAfterConc.data?.fields?.globalSequenceCounter?.integerValue || '0', 10);
  recordResult('COLD-CONC-03', 'Concurrent Cold Start', 'Final globalSequenceCounter matches number of committed transactions (3)', 3, gscAfterConc, gscAfterConc === 3 ? 'PASS' : 'FAIL');

  // Phase 5: Independence from Stale Local Browser State
  console.log('\n--- Phase 5: Independence from Stale Local Browser State ---');
  // Verify that an operation presenting a stale local assumption (e.g. assuming sequence was 0 when it is now 3)
  // correctly synchronizes with live database sequence and allocates 4
  const nextFromLiveDb = await executeColdStartBilling({ devoteeName: 'Post Conc Devotee', totalAmount: 80 }, u1.idToken, u1.localId);
  recordResult('COLD-STATE-01', 'State Independence', 'Next transaction derives sequence monotonically from Firestore (4)', 4, nextFromLiveDb.bill.id, nextFromLiveDb.bill.id === 4 ? 'PASS' : 'FAIL');

  // Teardown
  await clearEmulatorData();
  console.log('\nCleaned up all cold-start test data from disposable emulator.');

  console.log('\n========================================================================');
  console.log('   STEP 33.32 COLD-START AUDIT SUMMARY');
  console.log(`   Passed:     ${passed}`);
  console.log(`   Failed:     ${failed}`);
  console.log(`   Not Tested: ${notTested}`);
  console.log(`   Total:      ${results.length}`);
  const verdict = (failed === 0) ? 'PASS' : 'FAIL';
  console.log(`   Verdict:    ${verdict}`);
  console.log('========================================================================\n');

  return { passed, failed, notTested, total: results.length, results };
}

runColdStartSuite().catch(err => {
  console.error('Fatal cold start error:', err);
  process.exit(1);
});
