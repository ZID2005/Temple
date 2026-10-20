/**
 * STEP 33.166 — Browser E2E Test: Full Editing of Billing-Linked Receipts UI & Form Synchronization
 * Location: tests/test_step_33_166_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.166: BROWSER E2E TEST — BILLING-LINKED RECEIPT EDITING & UI SYNC');
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

function startServer(port = 3017) {
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

  async start(port = 3017) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9227',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-166',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9227...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9227/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9227');

    const tabsRes = await fetch('http://127.0.0.1:9227/json');
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
  const server = await startServer(3017);
  const session = new BrowserSession();

  let pass = 0;
  let fail = 0;
  function report(ok, name, details = '') {
    const mark = ok ? '✅ [PASS]' : '❌ [FAIL]';
    if (ok) pass++; else fail++;
    console.log(`  ${mark} ${name}${details ? ` (${details})` : ''}`);
  }

  try {
    await session.start(3017);

    // Wait 3 seconds for scripts and auth initialization
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n--- 1. Window Exports Verification ---');
    const exports = await session.eval(`({
      fsUpdateBillingLinkedReceipt: typeof window.fsUpdateBillingLinkedReceipt,
      onBillingLinkedFieldsChanged: typeof window.onBillingLinkedFieldsChanged,
      onBillingAmountInput: typeof window.onBillingAmountInput,
      saveReceipt: typeof window.saveReceipt,
      VIEW_RENDERERS_receipts: typeof VIEW_RENDERERS.receipts
    })`);

    report(exports.fsUpdateBillingLinkedReceipt === 'function', 'window.fsUpdateBillingLinkedReceipt is exported function', exports.fsUpdateBillingLinkedReceipt);
    report(exports.onBillingLinkedFieldsChanged === 'function', 'window.onBillingLinkedFieldsChanged is exported function', exports.onBillingLinkedFieldsChanged);
    report(exports.onBillingAmountInput === 'function', 'window.onBillingAmountInput is exported function', exports.onBillingAmountInput);
    report(exports.VIEW_RENDERERS_receipts === 'function', 'VIEW_RENDERERS.receipts is available', exports.VIEW_RENDERERS_receipts);

    console.log('\n--- 2. Form Rendering for Billing-Linked Receipt ---');
    const linkedFormTest = await session.eval(`(async () => {
      // Mock dummy linked receipt in IndexedDB
      const dummyRcpt = {
        id: 201,
        receiptNo: 'R-201',
        date: '2026-10-20',
        name: 'Gopakumar',
        star: 'Makayiram',
        mobile: '9447123456',
        fund: 'General Temple Fund',
        category: 'Vazhipadu Income',
        description: 'Pushpanjali (Qty: 2) | Star: Makayiram',
        amount: 100,
        paymentMode: 'Cash',
        bankAccount: '',
        remarks: 'Billing Receipt: BILL-201',
        source: 'billing',
        billingId: 201,
        billingFirestoreId: 'bill_201',
        billingReceiptNo: 'BILL-201'
      };
      const dummyBill = {
        id: 201,
        receiptNo: 'BILL-201',
        date: '20/10/2026',
        devoteeName: 'Gopakumar',
        star: 'Makayiram',
        fund: 'General Temple Fund',
        incomeCategory: 'Vazhipadu Income',
        category: 'വഴിപാട്',
        item: 'Pushpanjali',
        quantity: 2,
        unitPrice: 50,
        totalAmount: 100,
        paymentMode: 'Cash',
        accountingReceiptId: 'rcpt_201',
        accountingReceiptNo: 'R-201'
      };

      if (typeof openDB === 'function' && typeof db !== 'undefined' && !db) { await openDB(); }
      if (typeof putRec === 'function') {
        await putRec('receipts', dummyRcpt);
        await putRec('billing', dummyBill);
      }

      // Render receipts view with editId 201
      const html = await VIEW_RENDERERS.receipts(null, 201);
      const container = document.createElement('div');
      container.innerHTML = html;

      const title = container.querySelector('h3')?.textContent || '';
      const hasLinkedBadge = title.includes('BILLING-LINKED') && title.includes('BILL-201');
      const hasBanner = !!container.querySelector('.billing-linked-sync-banner');

      const isLinkedHidden = container.querySelector('input[name=\"isBillingLinked\"]')?.value;
      const linkedBillIdHidden = container.querySelector('input[name=\"linkedBillId\"]')?.value;
      const receiptNoInp = container.querySelector('input[name=\"receiptNo\"]');
      const isRcptNoReadonly = !!receiptNoInp?.readOnly;

      const itemInp = container.querySelector('input[name=\"billingItem\"]');
      const qtyInp = container.querySelector('input[name=\"billingQuantity\"]');
      const priceInp = container.querySelector('input[name=\"billingUnitPrice\"]');
      const amtInp = container.querySelector('input[name=\"amount\"]');
      const nameInp = container.querySelector('input[name=\"name\"]');

      return {
        hasLinkedBadge,
        hasBanner,
        isLinkedHidden,
        linkedBillIdHidden,
        isRcptNoReadonly,
        itemVal: itemInp?.value,
        qtyVal: qtyInp?.value,
        priceVal: priceInp?.value,
        amtVal: amtInp?.value,
        nameVal: nameInp?.value
      };
    })()`);

    report(linkedFormTest.hasLinkedBadge, 'Receipt form title displays BILLING-LINKED badge with Bill number');
    report(linkedFormTest.hasBanner, 'Receipt form renders bidirectional sync informative banner');
    report(linkedFormTest.isLinkedHidden === '1', 'Hidden input isBillingLinked is set to 1');
    report(linkedFormTest.linkedBillIdHidden === '201', 'Hidden input linkedBillId points to linked bill');
    report(linkedFormTest.isRcptNoReadonly, 'Receipt number is read-only to prevent identifier modification');
    report(linkedFormTest.itemVal === 'Pushpanjali', 'Item field populated from linked bill (Pushpanjali)', linkedFormTest.itemVal);
    report(linkedFormTest.qtyVal === '2', 'Quantity field populated from linked bill (2)', linkedFormTest.qtyVal);
    report(linkedFormTest.priceVal === '50', 'UnitPrice field populated from linked bill (₹50)', linkedFormTest.priceVal);
    report(linkedFormTest.amtVal === '100', 'Amount field populated with bill total (₹100)', linkedFormTest.amtVal);
    report(linkedFormTest.nameVal === 'Gopakumar', 'Devotee Name populated (Gopakumar)', linkedFormTest.nameVal);

    console.log('\n--- 3. Form Rendering for Independent Receipt ---');
    const indFormTest = await session.eval(`(async () => {
      const dummyInd = {
        id: 301,
        receiptNo: 'R-301',
        date: '2026-10-20',
        name: 'Suresh Kumar',
        star: 'Rohini',
        fund: 'General Temple Fund',
        category: 'Donation Income',
        description: 'Temple renovation donation',
        amount: 1000,
        paymentMode: 'Cash',
        source: 'receipts'
      };

      if (typeof putRec === 'function') {
        await putRec('receipts', dummyInd);
      }

      const html = await VIEW_RENDERERS.receipts(null, 301);
      const container = document.createElement('div');
      container.innerHTML = html;

      const title = container.querySelector('h3')?.textContent || '';
      const hasLinkedBadge = title.includes('BILLING-LINKED');
      const hasBanner = !!container.querySelector('.billing-linked-sync-banner');
      const isLinkedHidden = container.querySelector('input[name=\"isBillingLinked\"]')?.value;
      const itemInp = container.querySelector('input[name=\"billingItem\"]');
      const qtyInp = container.querySelector('input[name=\"billingQuantity\"]');

      return {
        hasLinkedBadge,
        hasBanner,
        isLinkedHidden,
        hasBillingItemInput: !!itemInp,
        hasBillingQtyInput: !!qtyInp
      };
    })()`);

    report(!indFormTest.hasLinkedBadge, 'Independent receipt form does NOT show billing-linked badge');
    report(!indFormTest.hasBanner, 'Independent receipt form does NOT show billing sync banner');
    report(indFormTest.isLinkedHidden === '0', 'Hidden input isBillingLinked is set to 0');
    report(!indFormTest.hasBillingItemInput, 'Independent receipt form does not render separate billingItem input');
    report(!indFormTest.hasBillingQtyInput, 'Independent receipt form does not render separate billingQuantity input');

    console.log('\n--- 4. Client-Side Interactive Recalculations ---');
    const recalcTest = await session.eval(`(async () => {
      // Put form into DOM
      const html = await VIEW_RENDERERS.receipts(null, 201);
      const main = document.getElementById('app-main');
      main.innerHTML = html;

      const qtyInp = document.getElementById('receiptBillingQuantityInput');
      const priceInp = document.getElementById('receiptBillingUnitPriceInput');
      const amtInp = document.getElementById('receiptAmountInput');
      const descInp = document.getElementById('receiptDescriptionInput');
      const itemInp = document.getElementById('receiptBillingItemInput');

      // Test 1: Change quantity and trigger recalculation
      qtyInp.value = '4';
      priceInp.focus(); // simulate active focus on price
      onBillingLinkedFieldsChanged();
      const amtAfterQty = amtInp.value; // 4 * 50 = 200

      // Test 2: Auto-description update
      itemInp.value = 'Neyyvilakku';
      onBillingLinkedFieldsChanged();
      const descAfterItem = descInp.value; // "Neyyvilakku (Qty: 4) | Star: Makayiram"

      // Test 3: Change amount directly
      amtInp.value = '300';
      onBillingAmountInput();
      const priceAfterAmt = priceInp.value; // 300 / 4 = 75

      return {
        amtAfterQty,
        descAfterItem,
        priceAfterAmt
      };
    })()`);

    report(recalcTest.amtAfterQty === '200.00', 'Changing quantity auto-calculates total amount (4 * ₹50 = ₹200.00)', recalcTest.amtAfterQty);
    report(recalcTest.descAfterItem.includes('Neyyvilakku (Qty: 4)'), 'Updating item and quantity auto-composes receipt description', recalcTest.descAfterItem);
    report(recalcTest.priceAfterAmt === '75.00', 'Directly typing amount auto-calculates unit price (₹300 / 4 = ₹75.00)', recalcTest.priceAfterAmt);

    console.log('\n' + '='.repeat(80));
    console.log(`BROWSER E2E RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log('='.repeat(80));

    if (fail > 0) process.exit(1);
  } finally {
    await session.stop();
    server.close();
  }
}

runBrowserTests().catch(err => {
  console.error('[BROWSER E2E FATAL]', err);
  process.exit(1);
});
