/**
 * STEP 33.164 — Browser E2E Test: Billing & Receipts Permanent Deletion UI, Modals, and Actions
 * Location: tests/test_step_33_164_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.164: BROWSER E2E TEST — BILLING & RECEIPTS DELETE ACTIONS & MODALS');
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

function startServer(port = 3016) {
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
      console.log(`[SERVER] Running on http://127.0.0.1:${port}`);
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

  async start(port = 3016) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9226',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9226...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9226/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9226');

    const tabsRes = await fetch('http://127.0.0.1:9226/json');
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

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async stop() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this.chromeProc) {
      try { this.chromeProc.kill('SIGKILL'); } catch (e) {}
    }
  }
}

async function runBrowserTests() {
  const server = await startServer(3016);
  const session = new BrowserSession();

  let pass = 0;
  let fail = 0;
  function report(ok, name, details = '') {
    const mark = ok ? '✅ [PASS]' : '❌ [FAIL]';
    if (ok) pass++; else fail++;
    console.log(`  ${mark} ${name}${details ? ` (${details})` : ''}`);
  }

  try {
    await session.start(3016);

    // Wait 3 seconds for scripts and auth initialization
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n--- 1. Window Exports Verification ---');
    const exports = await session.eval(`({
      deleteBillingRecord: typeof window.deleteBillingRecord,
      showDeleteBillingModal: typeof window.showDeleteBillingModal,
      fsDeleteBillingRecord: typeof window.fsDeleteBillingRecord,
      deleteReceiptRecord: typeof window.deleteReceiptRecord,
      deleteReceipt: typeof window.deleteReceipt,
      showDeleteReceiptModal: typeof window.showDeleteReceiptModal,
      fsDeleteReceiptRecord: typeof window.fsDeleteReceiptRecord
    })`);

    report(exports.deleteBillingRecord === 'function', 'window.deleteBillingRecord is exported function', exports.deleteBillingRecord);
    report(exports.showDeleteBillingModal === 'function', 'window.showDeleteBillingModal is exported function', exports.showDeleteBillingModal);
    report(exports.fsDeleteBillingRecord === 'function', 'window.fsDeleteBillingRecord is exported function', exports.fsDeleteBillingRecord);
    report(exports.deleteReceiptRecord === 'function', 'window.deleteReceiptRecord is exported function', exports.deleteReceiptRecord);
    report(exports.deleteReceipt === 'function', 'window.deleteReceipt alias is exported function', exports.deleteReceipt);
    report(exports.showDeleteReceiptModal === 'function', 'window.showDeleteReceiptModal is exported function', exports.showDeleteReceiptModal);
    report(exports.fsDeleteReceiptRecord === 'function', 'window.fsDeleteReceiptRecord is exported function', exports.fsDeleteReceiptRecord);

    console.log('\n--- 2. Billing Deletion Confirmation Modal ---');
    const billingModalTest = await session.eval(`(async () => {
      const dummyBill = {
        id: 10,
        receiptNo: 'BILL-010',
        date: '2026-10-20',
        devoteeName: 'Anantha Padmanabhan',
        star: 'Thiruvonam',
        item: 'Kootupayasam',
        fund: 'General Temple Fund',
        totalAmount: 250,
        accountingReceiptNo: 'R-010'
      };
      showDeleteBillingModal(dummyBill, 'bill_10');

      const modalEl = document.getElementById('delete-billing-modal');
      const hasModal = !!modalEl;
      const text = modalEl ? modalEl.innerText : '';
      const confirmBtn = document.getElementById('btn-confirm-delete-billing');
      const cancelBtn = document.getElementById('btn-cancel-delete-billing');

      const hasBillNo = text.includes('BILL-010');
      const hasDate = text.includes('20-10-2026') || text.includes('20/10/2026') || text.includes('2026-10-20');
      const hasDevotee = text.includes('Anantha Padmanabhan');
      const hasAmount = text.includes('250');
      const hasLinkedNotice = text.includes('R-010');

      // Close modal
      closeModal();
      const modalClosed = !document.getElementById('delete-billing-modal');

      return {
        hasModal,
        hasBillNo,
        hasDate,
        hasDevotee,
        hasAmount,
        hasLinkedNotice,
        hasConfirmBtn: !!confirmBtn,
        hasCancelBtn: !!cancelBtn,
        modalClosed
      };
    })()`);

    report(billingModalTest.hasModal, 'showDeleteBillingModal creates modal dialog in modal-root');
    report(billingModalTest.hasBillNo, 'Modal displays Bill Number BILL-010');
    report(billingModalTest.hasDate, 'Modal displays Date');
    report(billingModalTest.hasDevotee, 'Modal displays Devotee Name (Anantha Padmanabhan)');
    report(billingModalTest.hasAmount, 'Modal displays Amount (₹250)');
    report(billingModalTest.hasLinkedNotice, 'Modal alerts about linked Accounting Receipt R-010');
    report(billingModalTest.hasConfirmBtn && billingModalTest.hasCancelBtn, 'Modal has Confirm and Cancel buttons');
    report(billingModalTest.modalClosed, 'closeModal() cleans up modal overlay');

    console.log('\n--- 3. Receipts Deletion Confirmation Modal ---');
    const receiptModalTest = await session.eval(`(async () => {
      const dummyReceipt = {
        id: 15,
        receiptNo: 'R-015',
        date: '2026-10-20',
        name: 'Savitri Amma',
        fund: 'Punarudharanam Fund',
        category: 'Temple Renovation',
        amount: 5000,
        source: 'billing',
        billingReceiptNo: 'BILL-015'
      };
      showDeleteReceiptModal(dummyReceipt, 'rcpt_15');

      const modalEl = document.getElementById('delete-receipt-modal');
      const hasModal = !!modalEl;
      const text = modalEl ? modalEl.innerText : '';
      const confirmBtn = document.getElementById('btn-confirm-delete-receipt');
      const cancelBtn = document.getElementById('btn-cancel-delete-receipt');

      const hasRcptNo = text.includes('R-015');
      const hasDate = text.includes('20-10-2026') || text.includes('20/10/2026') || text.includes('2026-10-20');
      const hasDevotee = text.includes('Savitri Amma');
      const hasFund = text.includes('Punarudharanam Fund');
      const hasAmount = text.includes('5000') || text.includes('5,000');
      const hasLinkedBillNotice = text.includes('BILL-015');

      closeModal();
      const modalClosed = !document.getElementById('delete-receipt-modal');

      return {
        hasModal,
        hasRcptNo,
        hasDate,
        hasDevotee,
        hasFund,
        hasAmount,
        hasLinkedBillNotice,
        hasConfirmBtn: !!confirmBtn,
        hasCancelBtn: !!cancelBtn,
        modalClosed
      };
    })()`);

    report(receiptModalTest.hasModal, 'showDeleteReceiptModal creates modal dialog in modal-root');
    report(receiptModalTest.hasRcptNo, 'Modal displays Receipt Number R-015');
    report(receiptModalTest.hasDate, 'Modal displays Date');
    report(receiptModalTest.hasDevotee, 'Modal displays Devotee Name (Savitri Amma)');
    report(receiptModalTest.hasFund, 'Modal displays Fund/Category (Punarudharanam Fund)');
    report(receiptModalTest.hasAmount, 'Modal displays Amount (₹5,000)');
    report(receiptModalTest.hasLinkedBillNotice, 'Modal alerts about linked Bill BILL-015');
    report(receiptModalTest.hasConfirmBtn && receiptModalTest.hasCancelBtn, 'Modal has Confirm and Cancel buttons');
    report(receiptModalTest.modalClosed, 'closeModal() cleans up modal overlay');

    console.log('\n--- 4. Rendered Table Buttons & Navigation ---');
    const tableButtons = await session.eval(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();

      await navigate('billing');
      const billingForm = document.getElementById('billingForm');
      const billingTable = document.getElementById('billingHistoryTableWrap');
      const billingHasDeleteFunc = typeof window.deleteBillingRecord === 'function';

      await navigate('receipts');
      const rcptForm = document.getElementById('receiptForm');
      const rcptTable = document.getElementById('receiptTable');
      const rcptHasDeleteFunc = typeof window.deleteReceiptRecord === 'function';

      return {
        hasBillingForm: !!billingForm,
        hasBillingTable: !!billingTable,
        billingHasDeleteFunc,
        hasRcptForm: !!rcptForm,
        hasRcptTable: !!rcptTable,
        rcptHasDeleteFunc
      };
    })()`);

    report(tableButtons.hasBillingForm, 'Billing form rendered upon navigate("billing")');
    report(tableButtons.hasBillingTable, 'Billing history table rendered');
    report(tableButtons.billingHasDeleteFunc, 'Billing delete controller active');
    report(tableButtons.hasRcptForm, 'Receipts form rendered upon navigate("receipts")');
    report(tableButtons.hasRcptTable, 'Receipts table rendered');
    report(tableButtons.rcptHasDeleteFunc, 'Receipts delete controller active');

    console.log('\n' + '='.repeat(80));
    console.log(`BROWSER E2E TESTS: ${pass} PASSED, ${fail} FAILED out of ${pass + fail} assertions`);
    console.log('='.repeat(80));

    if (fail > 0) process.exit(1);

  } finally {
    await session.stop();
    server.close();
  }
}

runBrowserTests().catch(err => {
  console.error('Fatal Browser E2E error:', err);
  process.exit(1);
});
