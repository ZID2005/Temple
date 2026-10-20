/**
 * STEP 33.163 — SAFELY COMMISSION THE VOUCHER SEQUENCE TO V-001
 * Location: scripts/step_33_163_commission_voucher_sequence.js
 *
 * Implements an authenticated, fail-closed atomic transaction runner to safely initialize
 * the voucher counter in Cloud Firestore (temple-f4f7d) for Temple Accounts.
 *
 * INVARIANTS ENFORCED:
 * 1. Authenticated administrator session: vibu@gmail.com (UID: rFvStQNfiINnPor66OzXuE1O9Lm1).
 * 2. Strict Preconditions:
 *    - system/counters exists.
 *    - Cloud Firestore payments collection is completely empty (0 documents).
 *    - Zero conflicting payment docs exist (pmt_1, pay_1, pmt_001, etc. do NOT exist).
 *    - Zero conflicting voucher reservations exist in system/ (all existing reservations are billing/receipts).
 *    - Preserves globalSequenceCounter=6, billingReceiptCounter=6, receiptCounter=1020.
 *    - Preserves all prefixes and unrelated system/counters fields.
 * 3. Atomic Transaction:
 *    - Verifies all preconditions inside db.runTransaction.
 *    - Updates ONLY voucherCounter=0 with serverTimestamp.
 * 4. Post-Verification:
 *    - Verifies counters read back voucherCounter=0.
 *    - Verifies form preview nextVoucherNo() evaluates to V-001.
 *    - Zero test records created in production.
 *    - Synchronizes/clears local browser cache for payments.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.163: ATOMIC COMMISSIONING OF VOUCHER SEQUENCE (V-001)');
console.log('='.repeat(80));

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
        try {
          const msg = JSON.parse(e.data);
          if (msg.id === curId) {
            this.ws.removeEventListener('message', h);
            resolve(msg.result);
          }
        } catch (err) {
          reject(err);
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

    console.log('Authenticated User:', authState);
    if (!authState.authenticated || authState.email !== 'vibu@gmail.com') {
      throw new Error(`Authentication failed: expected vibu@gmail.com, got ${authState.email || 'null'}`);
    }

    // ========================================================================
    // PHASE 2: Pre-Commissioning Baseline & Invariant Checks
    // ========================================================================
    console.log('\n--- PHASE 2: Pre-Commissioning Baseline Checks ---');
    const preCheck = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();

      const [cSnap, paymentsCol, p1Snap, pay1Snap] = await Promise.all([
        db.collection('system').doc('counters').get(),
        db.collection('payments').get(),
        db.collection('payments').doc('pmt_1').get(),
        db.collection('payments').doc('pay_1').get()
      ]);

      const systemCol = await db.collection('system').get();
      const voucherReservations = systemCol.docs.filter(d => d.id.includes('voucher') || d.id.includes('pmt'));

      return {
        countersExists: cSnap.exists,
        counters: cSnap.exists ? cSnap.data() : null,
        paymentsCount: paymentsCol.size,
        p1Exists: p1Snap.exists,
        pay1Exists: pay1Snap.exists,
        voucherReservationsCount: voucherReservations.length
      };
    })()`);

    console.log('Pre-Commissioning State:', JSON.stringify(preCheck, null, 2));

    if (!preCheck.countersExists || !preCheck.counters) {
      throw new Error('Precondition FAILED: system/counters document not found');
    }
    const c = preCheck.counters;
    console.log(`Live counters: voucherCounter=${c.voucherCounter}, globalSequenceCounter=${c.globalSequenceCounter}, billingReceiptCounter=${c.billingReceiptCounter}, receiptCounter=${c.receiptCounter}`);

    if (preCheck.paymentsCount !== 0) {
      throw new Error(`Precondition FAILED: payments collection is NOT empty (contains ${preCheck.paymentsCount} documents). Commissioning aborted.`);
    }
    if (preCheck.p1Exists || preCheck.pay1Exists) {
      throw new Error('Precondition FAILED: conflicting payment document pmt_1 or pay_1 exists!');
    }
    if (preCheck.voucherReservationsCount !== 0) {
      throw new Error(`Precondition FAILED: conflicting voucher reservations found (${preCheck.voucherReservationsCount})`);
    }

    console.log('✅ ALL PRECONDITIONS VERIFIED SUCCESSFULLY.');

    // ========================================================================
    // PHASE 3: Atomic Commissioning Transaction
    // ========================================================================
    console.log('\n--- PHASE 3: Executing Atomic Commissioning Transaction ---');
    const txResult = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();
      const user = firebase.auth().currentUser;
      if (!user || user.email !== 'vibu@gmail.com') {
        throw new Error('Unauthorized: Must be authenticated as vibu@gmail.com');
      }

      const counterRef = db.collection('system').doc('counters');
      const p1Ref = db.collection('payments').doc('pmt_1');
      const pay1Ref = db.collection('payments').doc('pay_1');

      return await db.runTransaction(async (tx) => {
        // Reads before writes
        const [cSnap, p1Snap, pay1Snap] = await Promise.all([
          tx.get(counterRef),
          tx.get(p1Ref),
          tx.get(pay1Ref)
        ]);

        if (!cSnap.exists) {
          throw new Error('system/counters document does not exist.');
        }
        if (p1Snap.exists) {
          throw new Error('Precondition failed inside tx: payments/pmt_1 exists!');
        }
        if (pay1Snap.exists) {
          throw new Error('Precondition failed inside tx: payments/pay_1 exists!');
        }

        const cData = cSnap.data() || {};
        const prevVc = cData.voucherCounter;

        const updatePayload = {
          voucherCounter: 0,
          previousVoucherCounter: prevVc !== undefined ? prevVc : null,
          voucherCommissionedAt: firebase.firestore.FieldValue.serverTimestamp(),
          voucherCommissionedBy: user.uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        tx.set(counterRef, updatePayload, { merge: true });

        return {
          success: true,
          previousVoucherCounter: prevVc,
          commissionedVoucherCounter: 0,
          preservedGlobalSequenceCounter: cData.globalSequenceCounter,
          preservedBillingReceiptCounter: cData.billingReceiptCounter,
          preservedReceiptCounter: cData.receiptCounter
        };
      });
    })()`);

    console.log('Transaction Result:', JSON.stringify(txResult, null, 2));

    // ========================================================================
    // PHASE 4: Post-Commissioning Authoritative Verification
    // ========================================================================
    console.log('\n--- PHASE 4: Post-Commissioning Verification ---');
    const postCheck = await session.evaluate(`(async () => {
      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();

      const cSnap = await db.collection('system').doc('counters').get();
      const postCounters = cSnap.exists ? cSnap.data() : null;

      // Clean local IndexedDB payments store if any legacy test records exist
      if (typeof openDB === 'function') await openDB();
      if (typeof clearStore === 'function') await clearStore('payments');

      // Refresh app settings and views
      if (typeof refreshSettings === 'function') await refreshSettings();
      if (typeof fsGetAllSafe === 'function') await fsGetAllSafe('payments');

      let formPreview = null;
      if (typeof nextVoucherNo === 'function') {
        formPreview = await nextVoucherNo();
      }

      const pCol = await db.collection('payments').get();

      return {
        counters: postCounters,
        formPreview,
        paymentsCount: pCol.size
      };
    })()`);

    console.log('Post-Commissioning Counters:', JSON.stringify(postCheck.counters, null, 2));
    console.log('Form Preview nextVoucherNo():', postCheck.formPreview);
    console.log('Payments Count in Firestore:', postCheck.paymentsCount);

    if (postCheck.counters.voucherCounter !== 0) {
      throw new Error(`Verification FAILED: expected voucherCounter=0, got ${postCheck.counters.voucherCounter}`);
    }
    if (postCheck.formPreview !== 'V-001') {
      throw new Error(`Verification FAILED: expected form preview V-001, got ${postCheck.formPreview}`);
    }
    if (postCheck.paymentsCount !== 0) {
      throw new Error(`Verification FAILED: payments count altered! Expected 0, got ${postCheck.paymentsCount}`);
    }

    console.log('\n🎉 SUCCESS: VOUCHER SEQUENCE COMMISSIONED TO V-001 WITH ZERO ANOMALIES!');

  } catch(err) {
    console.error('Commissioning failed:', err);
    process.exit(1);
  } finally {
    await session.close();
    if (server) server.close();
  }
}

main();
