/**
 * STEP 33.160 — SAFELY COMMISSION THE FIRST BILLING SEQUENCE
 * Location: scripts/step_33_160_commission_first_bill.js
 *
 * Implements an authenticated, fail-closed atomic transaction runner to commission
 * the global sequence counters in Cloud Firestore (temple-f4f7d) for Temple Accounts.
 *
 * INVARIANTS ENFORCED:
 * 1. Authenticated administrator session: vibu@gmail.com (UID: rFvStQNfiINnPor66OzXuE1O9Lm1).
 * 2. Strict Preconditions:
 *    - system/counters baseline: globalSequenceCounter=100, billingReceiptCounter=100,
 *      voucherCounter=502, receiptCounter=1020.
 *    - billing/bill_1, receipts/rcpt_1, system/res_1 do NOT exist.
 *    - Collections billing, receipts, payments, system (res_*, op_*) are 0 count.
 *    - Master data collections (84 docs) remain intact.
 * 3. Atomic Transaction:
 *    - Checks all preconditions inside db.runTransaction.
 *    - Updates ONLY globalSequenceCounter=0 and billingReceiptCounter=0 with commissioning metadata.
 *    - Preserves voucherCounter=502 and receiptCounter=1020.
 *    - Preserves all prefixes and unrelated fields.
 * 4. Post-Verification:
 *    - Verifies counters read back zero for billing/receipts and 502 for vouchers.
 *    - Verifies zero records created by commissioning.
 *    - Verifies commissioning guard in fsCreateIndependentReceipt blocks sequence 1.
 *    - Verifies Billing UI next-number preview (BILL-001) and manual validation accept BILL-001.
 * 5. Zero test records created.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function startServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/' || reqPath === '') reqPath = '/Temple_Accounts-1.html';
      const filePath = path.normalize(path.join('D:\\Temple', reqPath));

      if (!filePath.startsWith('D:\\Temple') || path.basename(filePath).startsWith('.') || reqPath.startsWith('/backups')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.on('error', reject);

    server.listen(port, '127.0.0.1', () => {
      console.log(`[SERVER] Internal server running on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

class BrowserSession {
  constructor() {
    this.chromeProc = null;
    this.ws = null;
    this.msgId = 1;
  }

  async start(port = 3000) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9222...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9222');

    const tabsRes = await fetch('http://127.0.0.1:9222/json');
    const tabs = await tabsRes.json();
    const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
    if (!appTab) throw new Error('Could not find Temple_Accounts-1.html tab in Chrome');

    this.ws = new WebSocket(appTab.webSocketDebuggerUrl);
    await new Promise(r => this.ws.onopen = r);
    console.log('[BROWSER] Connected to application tab via CDP.');

    for (let i = 0; i < 40; i++) {
      try {
        const res = await this.send('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true
        });
        if (res.result?.value === 'complete') break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = this.msgId++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          this.ws.removeEventListener('message', h);
          if (d.error) reject(d.error);
          else resolve(d.result);
        }
      };
      this.ws.addEventListener('message', h);
      this.ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  async evaluate(asyncJsFunctionStr) {
    const res = await this.send('Runtime.evaluate', {
      expression: asyncJsFunctionStr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('CDP evaluation error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.chromeProc) {
      try { this.chromeProc.kill(); } catch (e) {}
      this.chromeProc = null;
    }
    console.log('[BROWSER] Session closed.');
  }
}

async function main() {
  console.log('========================================================================');
  console.log('  STEP 33.160 — SAFELY COMMISSION THE FIRST BILLING SEQUENCE');
  console.log('========================================================================\n');

  let server = null;
  const session = new BrowserSession();

  try {
    server = await startServer(3000);
    await session.start(3000);

    // ========================================================================
    // PHASE 1: Authenticate and Wait for App Readiness
    // ========================================================================
    console.log('\n--- PHASE 1: Authentication & App Readiness ---');
    const authState = await session.evaluate(`(async () => {
      for (let i = 0; i < 60; i++) {
        try {
          if (typeof initializeFirebase === 'function' && typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
            initializeFirebase();
          }
          if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth) {
            const cur = firebase.auth().currentUser;
            if (cur && cur.email) break;
          }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 250));
      }
      const u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      if (!u) return { authenticated: false };
      return {
        authenticated: true,
        email: u.email,
        uid: u.uid
      };
    })()`);

    console.log('Authenticated User:', JSON.stringify(authState, null, 2));
    if (!authState.authenticated || authState.email !== 'vibu@gmail.com') {
      throw new Error(`Authentication failed: expected vibu@gmail.com, got ${authState.email || 'null'}`);
    }

    // ========================================================================
    // PHASE 2: Pre-Commissioning Read-Only Baseline Checks
    // ========================================================================
    console.log('\n--- PHASE 2: Pre-Commissioning Baseline Checks ---');
    const preCheck = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();

      const [cSnap, b1Snap, r1Snap, res1Snap] = await Promise.all([
        db.collection('system').doc('counters').get(),
        db.collection('billing').doc('bill_1').get(),
        db.collection('receipts').doc('rcpt_1').get(),
        db.collection('system').doc('res_1').get()
      ]);

      const [billingCol, receiptsCol, paymentsCol, systemCol] = await Promise.all([
        db.collection('billing').get(),
        db.collection('receipts').get(),
        db.collection('payments').get(),
        db.collection('system').get()
      ]);

      const resDocs = systemCol.docs.filter(d => d.id.startsWith('res_')).map(d => d.id);
      const opDocs = systemCol.docs.filter(d => d.id.startsWith('op_')).map(d => d.id);

      const [settingsCol, fundsCol, incCol, expCol, bankCol, chittyCol] = await Promise.all([
        db.collection('settings').get(),
        db.collection('funds').get(),
        db.collection('incomeCategories').get(),
        db.collection('expenseCategories').get(),
        db.collection('bankAccounts').get(),
        db.collection('chittyMembers').get()
      ]);

      return {
        countersExists: cSnap.exists,
        counters: cSnap.exists ? cSnap.data() : null,
        b1Exists: b1Snap.exists,
        r1Exists: r1Snap.exists,
        res1Exists: res1Snap.exists,
        counts: {
          billing: billingCol.size,
          receipts: receiptsCol.size,
          payments: paymentsCol.size,
          systemTotal: systemCol.size,
          systemReservations: resDocs.length,
          systemOperations: opDocs.length
        },
        resDocs,
        opDocs,
        masterCounts: {
          settings: settingsCol.size,
          funds: fundsCol.size,
          incomeCategories: incCol.size,
          expenseCategories: expCol.size,
          bankAccounts: bankCol.size,
          chittyMembers: chittyCol.size,
          totalMasterDocs: settingsCol.size + fundsCol.size + incCol.size + expCol.size + bankCol.size + chittyCol.size
        }
      };
    })()`);

    console.log('Pre-Commissioning State:', JSON.stringify(preCheck, null, 2));

    // Assertions
    if (!preCheck.countersExists || !preCheck.counters) {
      throw new Error('Precondition FAILED: system/counters document not found');
    }
    const c = preCheck.counters;
    if (c.globalSequenceCounter !== 100) {
      throw new Error(`Precondition FAILED: expected globalSequenceCounter=100, got ${c.globalSequenceCounter}`);
    }
    if (c.billingReceiptCounter !== 100) {
      throw new Error(`Precondition FAILED: expected billingReceiptCounter=100, got ${c.billingReceiptCounter}`);
    }
    if (c.voucherCounter !== 502) {
      throw new Error(`Precondition FAILED: expected voucherCounter=502, got ${c.voucherCounter}`);
    }
    if (c.receiptCounter !== 1020) {
      throw new Error(`Precondition FAILED: expected receiptCounter=1020, got ${c.receiptCounter}`);
    }
    if (preCheck.b1Exists) {
      throw new Error('Precondition FAILED: billing/bill_1 already exists!');
    }
    if (preCheck.r1Exists) {
      throw new Error('Precondition FAILED: receipts/rcpt_1 already exists!');
    }
    if (preCheck.res1Exists) {
      throw new Error('Precondition FAILED: system/res_1 already exists!');
    }
    if (preCheck.counts.billing !== 0 || preCheck.counts.receipts !== 0 || preCheck.counts.payments !== 0) {
      throw new Error(`Precondition FAILED: transaction collections not clean: ${JSON.stringify(preCheck.counts)}`);
    }
    if (preCheck.counts.systemReservations !== 0 || preCheck.counts.systemOperations !== 0) {
      throw new Error(`Precondition FAILED: system reservations/ops not clean: ${JSON.stringify(preCheck.counts)}`);
    }
    if (preCheck.masterCounts.totalMasterDocs !== 84) {
      throw new Error(`Precondition FAILED: master data altered: expected 84, got ${preCheck.masterCounts.totalMasterDocs}`);
    }
    console.log('✅ ALL PRECONDITIONS VERIFIED SUCCESSFULLY.');

    // ========================================================================
    // PHASE 3: Atomic Counter Commissioning Transaction
    // ========================================================================
    console.log('\n--- PHASE 3: Executing Atomic Commissioning Transaction ---');
    const txResult = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();
      const user = firebase.auth().currentUser;
      if (!user || user.email !== 'vibu@gmail.com') {
        throw new Error('Unauthorized: Must be authenticated as vibu@gmail.com');
      }

      const counterRef = db.collection('system').doc('counters');
      const b1Ref = db.collection('billing').doc('bill_1');
      const r1Ref = db.collection('receipts').doc('rcpt_1');
      const res1Ref = db.collection('system').doc('res_1');

      return await db.runTransaction(async (tx) => {
        // 1. Transactional reads before any writes
        const [cSnap, b1Snap, r1Snap, res1Snap] = await Promise.all([
          tx.get(counterRef),
          tx.get(b1Ref),
          tx.get(r1Ref),
          tx.get(res1Ref)
        ]);

        // 2. Strict precondition assertions inside the transaction boundary
        if (!cSnap.exists) {
          throw new Error('system/counters document does not exist.');
        }
        if (b1Snap.exists) {
          throw new Error('Precondition failed inside tx: billing/bill_1 exists!');
        }
        if (r1Snap.exists) {
          throw new Error('Precondition failed inside tx: receipts/rcpt_1 exists!');
        }
        if (res1Snap.exists) {
          throw new Error('Precondition failed inside tx: system/res_1 exists!');
        }

        const cData = cSnap.data() || {};
        if (cData.globalSequenceCounter !== 100 || cData.billingReceiptCounter !== 100) {
          throw new Error('Precondition failed inside tx: sequence counters changed concurrently! globalSequenceCounter=' + cData.globalSequenceCounter);
        }
        if (cData.voucherCounter !== 502 || cData.receiptCounter !== 1020) {
          throw new Error('Precondition failed inside tx: voucher/receipt counters changed concurrently!');
        }

        const serverTs = firebase.firestore.FieldValue.serverTimestamp();

        // 3. Construct minimal update payload (modifies ONLY approved fields)
        const updatePayload = {
          globalSequenceCounter: 0,
          billingReceiptCounter: 0,
          commissionedAt: serverTs,
          commissionedBy: user.uid,
          commissionedUser: user.email,
          commissioningStatus: 'READY_FOR_FIRST_BILL',
          commissioningNote: 'STEP 33.160: Commission sequence counters to zero. Enables first production bill to issue BILL-001.',
          updatedAt: serverTs
        };

        // 4. Commit atomic update with merge: true to strictly preserve all other fields
        tx.set(counterRef, updatePayload, { merge: true });

        return {
          status: 'COMMISSIONED',
          previousGlobalSequence: cData.globalSequenceCounter,
          previousBillingCounter: cData.billingReceiptCounter,
          newGlobalSequence: 0,
          newBillingCounter: 0,
          preservedVoucherCounter: cData.voucherCounter,
          preservedReceiptCounter: cData.receiptCounter,
          preservedBillingPrefix: cData.billingPrefix || 'BILL-',
          preservedReceiptPrefix: cData.receiptPrefix || 'R-',
          preservedVoucherPrefix: cData.voucherPrefix || 'V-'
        };
      });
    })()`);

    console.log('Commissioning Transaction Result:', JSON.stringify(txResult, null, 2));
    if (txResult.status !== 'COMMISSIONED') {
      throw new Error('Commissioning transaction failed to return COMMISSIONED status');
    }
    console.log('✅ ATOMIC COMMISSIONING TRANSACTION COMMITTED SUCCESSFULLY.');

    // ========================================================================
    // PHASE 4: Post-Commissioning Direct Database Verification
    // ========================================================================
    console.log('\n--- PHASE 4: Post-Commissioning Read-Back Verification ---');
    const postCheck = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();

      const [cSnap, b1Snap, r1Snap, res1Snap] = await Promise.all([
        db.collection('system').doc('counters').get(),
        db.collection('billing').doc('bill_1').get(),
        db.collection('receipts').doc('rcpt_1').get(),
        db.collection('system').doc('res_1').get()
      ]);

      const [billingCol, receiptsCol, paymentsCol, systemCol] = await Promise.all([
        db.collection('billing').get(),
        db.collection('receipts').get(),
        db.collection('payments').get(),
        db.collection('system').get()
      ]);

      const resDocs = systemCol.docs.filter(d => d.id.startsWith('res_')).map(d => d.id);
      const opDocs = systemCol.docs.filter(d => d.id.startsWith('op_')).map(d => d.id);

      return {
        counters: cSnap.data(),
        b1Exists: b1Snap.exists,
        r1Exists: r1Snap.exists,
        res1Exists: res1Snap.exists,
        counts: {
          billing: billingCol.size,
          receipts: receiptsCol.size,
          payments: paymentsCol.size,
          systemTotal: systemCol.size,
          systemReservations: resDocs.length,
          systemOperations: opDocs.length
        }
      };
    })()`);

    console.log('Post-Commissioning Read-Back:', JSON.stringify(postCheck, null, 2));

    const postC = postCheck.counters;
    if (postC.globalSequenceCounter !== 0) {
      throw new Error(`Verification FAILED: globalSequenceCounter is ${postC.globalSequenceCounter}, expected 0`);
    }
    if (postC.billingReceiptCounter !== 0) {
      throw new Error(`Verification FAILED: billingReceiptCounter is ${postC.billingReceiptCounter}, expected 0`);
    }
    if (postC.voucherCounter !== 502) {
      throw new Error(`Verification FAILED: voucherCounter altered! Value is ${postC.voucherCounter}, expected 502`);
    }
    if (postC.receiptCounter !== 1020) {
      throw new Error(`Verification FAILED: receiptCounter altered! Value is ${postC.receiptCounter}, expected 1020`);
    }
    if (postCheck.b1Exists || postCheck.r1Exists || postCheck.res1Exists) {
      throw new Error('Verification FAILED: spurious documents created during commissioning!');
    }
    if (postCheck.counts.billing !== 0 || postCheck.counts.receipts !== 0 || postCheck.counts.payments !== 0) {
      throw new Error('Verification FAILED: unexpected records present in financial collections!');
    }
    if (postCheck.counts.systemReservations !== 0 || postCheck.counts.systemOperations !== 0) {
      throw new Error('Verification FAILED: unexpected reservations or operations created!');
    }
    console.log('✅ POST-COMMISSIONING DATABASE CHECKS PASSED.');

    // ========================================================================
    // PHASE 5: Commissioning Guard & Invariant Verification
    // ========================================================================
    console.log('\n--- PHASE 5: Commissioning Guard & Invariant Verification ---');
    const guardCheck = await session.evaluate(`(async () => {
      let guardTriggered = false;
      let guardMessage = '';

      try {
        // Attempt to create an independent receipt when curSeq === 0
        // This must be blocked by the commissioning guard (Line 22504)
        await fsCreateIndependentReceipt({
          date: '2026-10-20',
          name: 'Prohibited Test Devotee',
          mobile: '9999999999',
          fund: 'General Temple Fund',
          category: 'Pooja Income',
          description: 'Attempt to consume sequence 1 before billing',
          paymentMode: 'Cash',
          amount: 10
        });
      } catch (err) {
        guardTriggered = true;
        guardMessage = err.message || String(err);
      }

      // Check if any receipt was written
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();
      const r1Snap = await db.collection('receipts').doc('rcpt_1').get();
      const receiptsCol = await db.collection('receipts').get();

      return {
        guardTriggered,
        guardMessage,
        rcpt1Exists: r1Snap.exists,
        receiptsCount: receiptsCol.size
      };
    })()`);

    console.log('Commissioning Guard Test:', JSON.stringify(guardCheck, null, 2));
    if (!guardCheck.guardTriggered) {
      throw new Error('CRITICAL FAILURE: Commissioning guard did NOT block independent receipt at curSeq=0!');
    }
    if (!guardCheck.guardMessage.includes('The accounting sequence has not been commissioned yet')) {
      throw new Error(`Unexpected guard error message: ${guardCheck.guardMessage}`);
    }
    if (guardCheck.rcpt1Exists || guardCheck.receiptsCount !== 0) {
      throw new Error('CRITICAL FAILURE: Document written despite commissioning guard!');
    }
    console.log('✅ COMMISSIONING GUARD VERIFIED: Independent receipts are strictly prohibited from consuming sequence 1.');

    // ========================================================================
    // PHASE 6: Application UI Next-Number Preview & Validation Check
    // ========================================================================
    console.log('\n--- PHASE 6: UI Next-Number Preview & Manual Validation Check ---');
    const uiCheck = await session.evaluate(`(async () => {
      // 1. Refresh settings in client memory from Firestore
      await refreshSettings();

      // 2. Query helper functions
      const nextGlobalSeq = await getNextGlobalSequenceNo();
      const nextBillingNo = await getNextBillingReceiptNo();
      const nextRcptNo = await fsNextReceiptNo();

      // 3. Navigate to billing view
      await navigate('billing');

      const manualBillNoInput = document.getElementById('manualBillNo');
      const manualBillNoFeedback = document.getElementById('manualBillNoFeedback');
      const manualBillNoPreview = document.getElementById('manualBillNoPreview');

      const placeholder = manualBillNoInput ? manualBillNoInput.placeholder : null;
      const previewText = manualBillNoPreview ? manualBillNoPreview.textContent : null;

      // 4. Test input '001'
      manualBillNoInput.value = '001';
      await validateManualBillNoInput(manualBillNoInput);
      const test001 = {
        feedbackVisible: manualBillNoFeedback.style.display !== 'none',
        feedbackText: manualBillNoFeedback.textContent,
        feedbackColor: manualBillNoFeedback.style.color,
        feedbackBg: manualBillNoFeedback.style.backgroundColor || manualBillNoFeedback.style.background
      };

      // 5. Test input 'BILL-001'
      manualBillNoInput.value = 'BILL-001';
      await validateManualBillNoInput(manualBillNoInput);
      const testBill001 = {
        feedbackVisible: manualBillNoFeedback.style.display !== 'none',
        feedbackText: manualBillNoFeedback.textContent,
        feedbackColor: manualBillNoFeedback.style.color
      };

      // 6. Test input '002' (out of sequence)
      manualBillNoInput.value = '002';
      await validateManualBillNoInput(manualBillNoInput);
      const test002 = {
        feedbackVisible: manualBillNoFeedback.style.display !== 'none',
        feedbackText: manualBillNoFeedback.textContent
      };

      // 7. Clean up input field
      manualBillNoInput.value = '';
      await validateManualBillNoInput(manualBillNoInput);

      return {
        nextGlobalSeq,
        nextBillingNo,
        nextRcptNo,
        placeholder,
        previewText,
        test001,
        testBill001,
        test002
      };
    })()`);

    console.log('Billing UI Verification:', JSON.stringify(uiCheck, null, 2));

    if (uiCheck.nextGlobalSeq !== 1) {
      throw new Error(`UI Check FAILED: nextGlobalSeq is ${uiCheck.nextGlobalSeq}, expected 1`);
    }
    if (uiCheck.nextBillingNo !== 'BILL-001') {
      throw new Error(`UI Check FAILED: nextBillingNo is ${uiCheck.nextBillingNo}, expected BILL-001`);
    }
    if (uiCheck.nextRcptNo !== 'R-001') {
      throw new Error(`UI Check FAILED: nextRcptNo is ${uiCheck.nextRcptNo}, expected R-001`);
    }
    if (!uiCheck.test001.feedbackText.includes('✓ Valid next sequential number: BILL-001')) {
      throw new Error(`UI Check FAILED: '001' validation rejected: ${uiCheck.test001.feedbackText}`);
    }
    if (!uiCheck.testBill001.feedbackText.includes('✓ Valid next sequential number: BILL-001')) {
      throw new Error(`UI Check FAILED: 'BILL-001' validation rejected: ${uiCheck.testBill001.feedbackText}`);
    }
    if (!uiCheck.test002.feedbackText.includes('out of sequence')) {
      throw new Error(`UI Check FAILED: '002' did not trigger out of sequence warning: ${uiCheck.test002.feedbackText}`);
    }
    console.log('✅ BILLING UI & VALIDATION CONFIRMED: BILL-001 is accepted as the valid next sequential number.');

    // ========================================================================
    // PHASE 7: Save Machine-Readable Audit Report
    // ========================================================================
    const auditRecord = {
      step: 'STEP 33.160',
      title: 'Safely Commission the First Billing Sequence',
      executedAt: new Date().toISOString(),
      authenticatedUser: authState.email,
      authenticatedUid: authState.uid,
      preCommissioning: {
        globalSequenceCounter: preCheck.counters.globalSequenceCounter,
        billingReceiptCounter: preCheck.counters.billingReceiptCounter,
        voucherCounter: preCheck.counters.voucherCounter,
        receiptCounter: preCheck.counters.receiptCounter,
        billingPrefix: preCheck.counters.billingPrefix,
        receiptPrefix: preCheck.counters.receiptPrefix,
        voucherPrefix: preCheck.counters.voucherPrefix,
        bill1Exists: preCheck.b1Exists,
        rcpt1Exists: preCheck.r1Exists,
        res1Exists: preCheck.res1Exists,
        collectionCounts: preCheck.counts,
        masterCounts: preCheck.masterCounts
      },
      transaction: txResult,
      postCommissioning: {
        globalSequenceCounter: postCheck.counters.globalSequenceCounter,
        billingReceiptCounter: postCheck.counters.billingReceiptCounter,
        voucherCounter: postCheck.counters.voucherCounter,
        receiptCounter: postCheck.counters.receiptCounter,
        billingPrefix: postCheck.counters.billingPrefix,
        receiptPrefix: postCheck.counters.receiptPrefix,
        voucherPrefix: postCheck.counters.voucherPrefix,
        commissioningStatus: postCheck.counters.commissioningStatus,
        commissionedBy: postCheck.counters.commissionedBy,
        commissionedUser: postCheck.counters.commissionedUser,
        commissioningNote: postCheck.counters.commissioningNote,
        bill1Exists: postCheck.b1Exists,
        rcpt1Exists: postCheck.r1Exists,
        res1Exists: postCheck.res1Exists,
        collectionCounts: postCheck.counts
      },
      commissioningGuard: guardCheck,
      uiVerification: uiCheck,
      finalStatus: 'SUCCESS_COMMISSIONED_READY_FOR_OPERATOR'
    };

    const auditPath = path.join('D:\\Temple', 'plans', 'step_33_160_commissioning_audit.json');
    fs.writeFileSync(auditPath, JSON.stringify(auditRecord, null, 2), 'utf8');
    console.log(`\nAudit record saved to: ${auditPath}`);

    console.log('\n========================================================================');
    console.log('  COMMISSIONING COMPLETE — FIRST BILL BILL-001 IS FULLY READY');
    console.log('========================================================================\n');

  } finally {
    await session.close();
    if (server) {
      server.close();
      console.log('[SERVER] Server closed.');
    }
  }
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR DURING COMMISSIONING:', err);
  process.exit(1);
});
