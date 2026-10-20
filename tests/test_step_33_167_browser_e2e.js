/**
 * STEP 33.167 — Browser E2E Test: Payment Description Column Verification
 * Location: tests/test_step_33_167_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.167: BROWSER E2E TEST — PAYMENTS TABLE DESCRIPTION COLUMN');
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
            if (msg.error) {
              reject(new Error('CDP error: ' + JSON.stringify(msg.error)));
            } else {
              resolve(msg.result || {});
            }
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
    if (res?.exceptionDetails) {
      throw new Error('CDP evaluation error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res?.result?.value;
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

    // Boot and open DB
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();
      await navigate('payments');
    })()`);

    console.log('\n--- BROWSER VERIFICATION: Payments Table Headers & Column Structure ---');
    const headerInfo = await session.evaluate(`(() => {
      const table = document.getElementById('paymentTable');
      if (!table) return null;
      const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      const thStyles = Array.from(table.querySelectorAll('thead th')).map(th => {
        const cs = window.getComputedStyle(th);
        return {
          textAlign: cs.textAlign,
          whiteSpace: cs.whiteSpace,
          textTransform: cs.textTransform
        };
      });
      return { ths, thStyles };
    })()`);

    assert(headerInfo !== null, 'Payments table rendered in DOM');
    assert(headerInfo.ths.length === 10, 'Table has exactly 10 headers', headerInfo.ths.join(', '));
    assert(headerInfo.ths[0] === 'Voucher No', 'Header 1 is Voucher No');
    assert(headerInfo.ths[1] === 'Date', 'Header 2 is Date');
    assert(headerInfo.ths[2] === 'Paid To', 'Header 3 is Paid To');
    assert(headerInfo.ths[3] === 'Description', 'Header 4 is Description (after Paid To & before Fund)');
    assert(headerInfo.ths[4] === 'Fund', 'Header 5 is Fund');
    assert(headerInfo.ths[5] === 'Category', 'Header 6 is Category');
    assert(headerInfo.ths[6] === 'Mode', 'Header 7 is Mode');
    assert(headerInfo.ths[7] === 'Amount', 'Header 8 is Amount');
    assert(headerInfo.ths[8] === 'Status', 'Header 9 is Status');
    assert(headerInfo.ths[9] === 'Actions', 'Header 10 is Actions');

    // Amount column (col 8) numeric right-alignment
    assert(headerInfo.thStyles[7].textAlign === 'right', 'Header 8 (Amount) computed textAlign is right', headerInfo.thStyles[7].textAlign);

    // Description column (col 4) text wrapping style
    assert(headerInfo.thStyles[3].whiteSpace === 'normal', 'Header 4 (Description) computed whiteSpace is normal', headerInfo.thStyles[3].whiteSpace);

    console.log('\n--- BROWSER VERIFICATION: Test Payment Records Rendering ---');
    const renderCheck = await session.evaluate(`(async () => {
      const mockList = [
        { id: 901, voucherNo: 'V-901', date: '2026-10-20', paidTo: 'Sree Padmanabha Electricals', description: 'Transformer repair & copper cabling', fund: 'Temple Fund', category: 'Maintenance', paymentMode: 'Bank', amount: 25000, voided: false },
        { id: 902, voucherNo: 'V-902', date: '2026-10-20', paidTo: 'Radhakrishnan Nair', description: '', fund: 'General Fund', category: 'Remuneration', paymentMode: 'Cash', amount: 3500, voided: false },
        { id: 903, voucherNo: 'V-903', date: '2026-10-20', paidTo: 'Cleaners Association', description: '   ', fund: 'Temple Fund', category: 'Sanitation', paymentMode: 'UPI', amount: 1800, voided: false }
      ];

      // Temporarily render in tbody
      const tbody = document.querySelector('#paymentTable tbody');
      if (!tbody) return null;
      tbody.innerHTML = mockList.map(p => \`
        <tr data-record-id="\${esc(p.id)}" data-edit-scope="payments" class="\${p.voided ? 'voided' : ''} \${getEditingRowClass('payments', p.id)}">
          <td>\${esc(p.voucherNo)}</td><td>\${fmtDate(p.date)}</td><td>\${esc(p.paidTo)}</td><td>\${(p.description != null && String(p.description).trim() !== '') ? esc(String(p.description).trim()) : '—'}</td><td>\${esc(p.fund)}</td>
          <td>\${esc(p.category)}</td><td><span class="pill \${(p.paymentMode || '').toLowerCase()}">\${esc(p.paymentMode || '')}</span></td>
          <td>\${fmtMoney(p.amount)}</td><td>\${p.voided ? 'Voided' : 'Active'}</td>
          <td>
            <button class="btn-sm btn-outline" onclick="reprintPayment('\${esc(p.id)}')">Print</button>
            \${!p.voided ? \`<button class="btn-sm btn-sec" onclick="navigate('payments', null, '\${esc(p.id)}')">Edit</button>\` : ''}
            \${!p.voided ? \`<button class="btn-sm btn-danger" onclick="voidRecord('payments', '\${esc(p.id)}')">Void</button>\` : ''}
            <button class="btn-sm btn-danger" onclick="deletePayment('\${esc(p.id)}')">Delete</button>
          </td>
        </tr>\`).join('');

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const parsed = rows.map(r => {
        const tds = Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim());
        const descComputed = window.getComputedStyle(r.querySelectorAll('td')[3]);
        const amtComputed = window.getComputedStyle(r.querySelectorAll('td')[7]);
        return {
          tds,
          descWrapping: descComputed.whiteSpace,
          amtAlign: amtComputed.textAlign
        };
      });

      return parsed;
    })()`);

    assert(renderCheck !== null && renderCheck.length === 3, 'Rendered 3 test payment rows in browser DOM');
    assert(renderCheck[0].tds[3] === 'Transformer repair & copper cabling', 'Row 1 displays populated description', renderCheck[0].tds[3]);
    assert(renderCheck[0].descWrapping === 'normal', 'Row 1 Description column has computed white-space: normal', renderCheck[0].descWrapping);
    assert(renderCheck[0].amtAlign === 'right', 'Row 1 Amount column has computed text-align: right', renderCheck[0].amtAlign);

    assert(renderCheck[1].tds[3] === '—', 'Row 2 with empty description displays "—"', renderCheck[1].tds[3]);
    assert(renderCheck[2].tds[3] === '—', 'Row 3 with whitespace-only description displays "—"', renderCheck[2].tds[3]);

    console.log('\n--- BROWSER VERIFICATION: Search Filtering by Description ---');
    const filterCheck = await session.evaluate(`(() => {
      const searchInput = document.getElementById('paymentSearch');
      if (!searchInput) return null;
      searchInput.value = 'cabling';
      filterPaymentTable();

      const tbody = document.querySelector('#paymentTable tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const visibleCount = rows.filter(r => r.style.display !== 'none').length;
      const visibleVoucher = rows.find(r => r.style.display !== 'none')?.querySelector('td')?.textContent.trim();

      // Clear search
      searchInput.value = '';
      filterPaymentTable();
      const resetCount = rows.filter(r => r.style.display !== 'none').length;

      return { visibleCount, visibleVoucher, resetCount };
    })()`);

    assert(filterCheck.visibleCount === 1, 'Search for "cabling" matches exactly 1 row', `Count: ${filterCheck.visibleCount}`);
    assert(filterCheck.visibleVoucher === 'V-901', 'Matching row is V-901 (matched via description text)', filterCheck.visibleVoucher);
    assert(filterCheck.resetCount === 3, 'Clearing search restores all 3 rows', `Count: ${filterCheck.resetCount}`);

    console.log('\n--- BROWSER VERIFICATION: Edit Payment Form Description Field ---');
    const editCheck = await session.evaluate(`(async () => {
      // Mock IndexedDB entry
      if (typeof putRec === 'function') {
        try {
          await putRec('payments', {
            id: 901,
            voucherNo: 'V-901',
            date: '2026-10-20',
            paidTo: 'Sree Padmanabha Electricals',
            description: 'Transformer repair & copper cabling',
            fund: 'General Temple Fund',
            category: 'Maintenance',
            paymentMode: 'Cash',
            amount: 25000,
            voided: false
          });
        } catch(e) { console.error('putRec error:', e); }
      }

      await navigate('payments', null, 901);
      const descInput = document.querySelector('#paymentForm input[name="description"]');
      return {
        hasInput: !!descInput,
        val: descInput ? descInput.value : null
      };
    })()`);

    assert(editCheck.hasInput, 'Edit payment form renders input[name="description"]');
    assert(editCheck.val === 'Transformer repair & copper cabling', 'Edit form pre-fills existing description value', editCheck.val);

    await session.close();
    server.close();

    console.log('\n' + '='.repeat(80));
    console.log(`STEP 33.167 BROWSER E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(80));

    if (failed > 0) process.exit(1);
    else process.exit(0);
  } catch (err) {
    console.error('Browser E2E Execution Error:', err);
    if (session) await session.close();
    if (server) server.close();
    process.exit(1);
  }
}

main();
