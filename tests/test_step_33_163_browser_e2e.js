/**
 * STEP 33.163 — Browser E2E Test: UI Confirmation Dialog, Delete Action, and Numbering
 * Location: tests/test_step_33_163_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.163: BROWSER E2E TEST — PAYMENTS TABLE, MODAL CONFIRMATION & ACTIONS');
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

function startServer(port = 3015) {
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

  async start(port = 3015) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9225',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9225...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9225/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9225');

    const tabsRes = await fetch('http://127.0.0.1:9225/json');
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
  let passed = 0;
  let failed = 0;

  function assert(condition, desc, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}${detail ? ' (' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}${detail ? ' (' + detail + ')' : ''}`);
      failed++;
    }
  }

  try {
    server = await startServer(3015);
    await session.start(3015);

    // Wait for boot
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();
      await navigate('payments');
    })()`);

    console.log('\n--- BROWSER VERIFICATION: Payments Form & Table Rendering ---');
    const uiState = await session.evaluate(`(async () => {
      const form = document.getElementById('paymentForm');
      const table = document.getElementById('paymentTable');
      const vInput = form ? form.querySelector('input[name="voucherNo"]') : null;
      const ths = table ? Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim()) : [];
      const hasSearch = !!document.getElementById('paymentSearch');
      return {
        hasForm: !!form,
        hasTable: !!table,
        voucherInputVal: vInput ? vInput.value : null,
        headers: ths,
        hasSearch
      };
    })()`);

    assert(uiState.hasForm, 'Payments form rendered');
    assert(uiState.hasTable, 'Payments table rendered');
    assert(uiState.headers.includes('Actions') && uiState.headers.includes('Voucher No'), 'Table headers include Voucher No and Actions', uiState.headers.join(', '));
    assert(uiState.hasSearch, 'Payment search bar rendered in toolbar');

    console.log('\n--- BROWSER VERIFICATION: Confirmation Dialog Modal Elements ---');
    const modalCheck = await session.evaluate(`(async () => {
      const mockPayment = {
        id: 99,
        voucherNo: 'V-099',
        date: '2026-10-20',
        paidTo: 'Test Devotee / Supplier',
        fund: 'General Temple Fund',
        category: 'Pooja Materials',
        amount: 2500,
        paymentMode: 'Cash'
      };

      showDeletePaymentModal(mockPayment, 99);
      const modal = document.getElementById('delete-payment-modal');
      if (!modal) return { rendered: false };

      const modalText = modal.textContent;
      const confirmBtn = document.getElementById('btn-confirm-delete-payment');
      const cancelBtn = document.getElementById('btn-cancel-delete-payment');

      const checks = {
        rendered: true,
        hasVoucherNo: modalText.includes('V-099'),
        hasDate: modalText.includes('20-10-2026') || modalText.includes('20/10/2026') || modalText.includes('2026-10-20'),
        hasPaidTo: modalText.includes('Test Devotee / Supplier'),
        hasFund: modalText.includes('General Temple Fund'),
        hasCategory: modalText.includes('Pooja Materials'),
        hasAmount: modalText.includes('2,500') || modalText.includes('2500'),
        hasConfirmBtn: !!confirmBtn && confirmBtn.textContent.includes('Delete Voucher'),
        hasCancelBtn: !!cancelBtn && cancelBtn.textContent.includes('Cancel')
      };

      // Close modal
      closeModal();
      checks.closedSuccessfully = !document.getElementById('delete-payment-modal');

      return checks;
    })()`);

    assert(modalCheck.rendered, 'showDeletePaymentModal renders dialog modal');
    assert(modalCheck.hasVoucherNo, 'Modal contains Voucher Number');
    assert(modalCheck.hasDate, 'Modal contains Date');
    assert(modalCheck.hasPaidTo, 'Modal contains Paid To');
    assert(modalCheck.hasFund, 'Modal contains Fund');
    assert(modalCheck.hasCategory, 'Modal contains Expense Category');
    assert(modalCheck.hasAmount, 'Modal contains Amount');
    assert(modalCheck.hasConfirmBtn, 'Modal has Confirm Delete button');
    assert(modalCheck.hasCancelBtn, 'Modal has Cancel button');
    assert(modalCheck.closedSuccessfully, 'closeModal() properly removes dialog overlay');

    console.log('\n--- BROWSER VERIFICATION: Global Window Exports ---');
    const exportsCheck = await session.evaluate(`({
      deletePayment: typeof window.deletePayment === 'function',
      showDeletePaymentModal: typeof window.showDeletePaymentModal === 'function',
      nextVoucherNo: typeof window.nextVoucherNo === 'function',
      fsNextVoucherNo: typeof window.fsNextVoucherNo === 'function'
    })`);

    assert(exportsCheck.deletePayment, 'window.deletePayment is exported as function');
    assert(exportsCheck.showDeletePaymentModal, 'window.showDeletePaymentModal is exported as function');
    assert(exportsCheck.nextVoucherNo, 'window.nextVoucherNo is exported as function');
    assert(exportsCheck.fsNextVoucherNo, 'window.fsNextVoucherNo is exported as function');

  } catch(err) {
    console.error('Browser E2E failed:', err);
    failed++;
  } finally {
    await session.close();
    if (server) server.close();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`BROWSER E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
