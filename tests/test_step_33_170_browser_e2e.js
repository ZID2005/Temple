/**
 * STEP 33.170 — Browser Headless E2E Test: Fix Payment Description Mapping in Cash Book and Bank Book
 * Location: tests/test_step_33_170_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.170: BROWSER HEADLESS E2E TEST — PAYMENT DESCRIPTION MAPPING');
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

function startServer(port = 3020) {
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

  async start(port = 3020) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9228',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-pmtdesc',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9228...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9228/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9228');

    const tabsRes = await fetch('http://127.0.0.1:9228/json');
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
    server = await startServer(3020);
    await session.start(3020);

    // Boot and open DB
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();
      if (typeof seedIfNeeded === 'function') await seedIfNeeded();
    })()`);

    // Setup mock transactions in the browser window
    await session.evaluate(`(async () => {
      window._mockPayments = [
        { id: 501, voucherNo: 'V-501', paidTo: 'Temple Electrician', paymentMode: 'Cash', category: 'Maintenance', amount: 3500, date: '2026-04-10', description: 'Sanctum sanctorum brass lamp wiring & LED driver', voided: false },
        { id: 502, voucherNo: 'V-502', paidTo: 'Flower Supplier', paymentMode: 'Cash', category: 'Flower', amount: 900, date: '2026-04-11', description: '', voided: false },
        { id: 503, voucherNo: 'V-503', paidTo: 'Generator Diesel Co', paymentMode: 'Bank', category: 'Generator', amount: 15000, date: '2026-04-12', description: 'Festival 600L diesel delivery', voided: false },
        { id: 504, voucherNo: 'V-504', paidTo: 'Water Works', paymentMode: 'UPI', category: 'Utilities', amount: 1800, date: '2026-04-13', description: '   ', voided: false }
      ];
      window._mockReceipts = [
        { id: 601, receiptNo: 'R-601', name: 'Ravi Verma', paymentMode: 'Cash', category: 'Vazhipadu', amount: 2000, date: '2026-04-10', description: 'Ganapathi Homam offering', voided: false },
        { id: 602, receiptNo: 'R-602', name: 'Suresh Kumar', paymentMode: 'Bank', category: 'Donation', amount: 10000, date: '2026-04-11', description: '', voided: false }
      ];

      window.activePayments = async () => window._mockPayments.filter(p => !p.voided);
      window.allPayments = async () => window._mockPayments;
      window.activeReceipts = async () => window._mockReceipts.filter(r => !r.voided);
      window.allReceipts = async () => window._mockReceipts;
      window.activeTransfers = async () => [];
      window.allTransfers = async () => [];
      window.allLoans = async () => [];
      window.activeChittyCollections = async () => [];
      window.activeChittyPayouts = async () => [];
    })()`);

    console.log('\n--- BROWSER VERIFICATION: Cash Book Payment Description Rendering ---');
    await session.evaluate(`navigate('cashbook')`);

    const cbData = await session.evaluate(`(() => {
      const table = document.getElementById('cashBookTable');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return {
          category: tr.dataset.category || '',
          txType: tr.dataset.txType || '',
          date: tds[0] || '',
          particulars: tds[1] || '',
          description: tds[2] || '',
          receipt: tds[5] || '',
          payment: tds[6] || ''
        };
      });
      return { rowCount: rows.length, rows };
    })()`);

    assert(cbData !== null, 'Cash Book table rendered in DOM');
    assert(cbData.rowCount === 4, `Cash Book has 4 rows (1 opening + 1 receipt + 2 cash payments)`, `Count: ${cbData.rowCount}`);

    // Opening balance row
    const opRow = cbData.rows[0];
    assert(opRow.particulars.includes('Opening Balance'), 'Row 0 is Opening Balance');
    assert(opRow.description === '', 'Opening Balance row Description cell is blank', `"${opRow.description}"`);

    // Receipt R-601
    const rRow = cbData.rows.find(r => r.particulars.includes('R-601'));
    assert(rRow !== undefined, 'Receipt R-601 found in Cash Book');
    assert(rRow.description === 'Ganapathi Homam offering', 'Receipt description displayed correctly', rRow.description);

    // Payment V-501 (with description)
    const p1Row = cbData.rows.find(r => r.particulars.includes('V-501'));
    assert(p1Row !== undefined, 'Payment V-501 found in Cash Book');
    assert(p1Row.description === 'Sanctum sanctorum brass lamp wiring & LED driver', 'Payment V-501 Description column displays description from payment record', p1Row.description);
    assert(p1Row.particulars === 'Payment V-501 - Temple Electrician', 'Payment V-501 Particulars column preserved separately without description suffix', p1Row.particulars);

    // Payment V-502 (empty description)
    const p2Row = cbData.rows.find(r => r.particulars.includes('V-502'));
    assert(p2Row !== undefined, 'Payment V-502 found in Cash Book');
    assert(p2Row.description === '—', 'Payment V-502 with empty description displays em-dash "—"', p2Row.description);

    console.log('\n--- BROWSER VERIFICATION: Bank Book Payment Description Rendering ---');
    await session.evaluate(`navigate('bankbook')`);

    const bbData = await session.evaluate(`(() => {
      const table = document.getElementById('bankBookTable');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return {
          category: tr.dataset.category || '',
          txType: tr.dataset.txType || '',
          date: tds[0] || '',
          particulars: tds[1] || '',
          description: tds[2] || '',
          deposit: tds[3] || '',
          withdrawal: tds[4] || ''
        };
      });
      return { rowCount: rows.length, rows };
    })()`);

    assert(bbData !== null, 'Bank Book table rendered in DOM');
    assert(bbData.rowCount === 4, `Bank Book has 4 rows (1 opening + 1 bank receipt + 2 bank payments)`, `Count: ${bbData.rowCount}`);

    // Opening balance row in Bank Book
    const bbOpRow = bbData.rows[0];
    assert(bbOpRow.particulars.includes('Opening Balance'), 'Row 0 is Bank Opening Balance');
    assert(bbOpRow.description === '—', 'Bank Opening Balance row Description cell displays "—"', bbOpRow.description);

    // Bank Payment V-503 (with description)
    const bp1Row = bbData.rows.find(r => r.particulars.includes('V-503'));
    assert(bp1Row !== undefined, 'Bank Payment V-503 found in Bank Book');
    assert(bp1Row.description === 'Festival 600L diesel delivery', 'Bank Payment V-503 displays description from payment record', bp1Row.description);
    assert(bp1Row.particulars === 'Payment V-503 - Generator Diesel Co (Bank)', 'Bank Payment V-503 Particulars is intact', bp1Row.particulars);

    // UPI Payment V-504 (whitespace description)
    const bp2Row = bbData.rows.find(r => r.particulars.includes('V-504'));
    assert(bp2Row !== undefined, 'UPI Payment V-504 found in Bank Book');
    assert(bp2Row.description === '—', 'UPI Payment V-504 with whitespace description displays em-dash "—"', bp2Row.description);

    // Bank Receipt R-602 (empty description)
    const brRow = bbData.rows.find(r => r.particulars.includes('R-602'));
    assert(brRow !== undefined, 'Bank Receipt R-602 found in Bank Book');
    assert(brRow.description === '—', 'Bank Receipt R-602 with empty description displays em-dash "—"', brRow.description);

    console.log('\n--- BROWSER VERIFICATION: Payment Edit & Live Book Refreshes ---');
    // Simulate updating payment description and refreshing both books
    await session.evaluate(`(async () => {
      // Edit payment V-501 description
      const p1 = window._mockPayments.find(p => p.id === 501);
      if (p1) p1.description = 'UPDATED: Sanctum LED driver replacement with surge protection';

      // Edit payment V-503 description
      const p3 = window._mockPayments.find(p => p.id === 503);
      if (p3) p3.description = 'UPDATED: 600L diesel with delivery challan #8841';

      await navigate('cashbook');
    })()`);

    const updatedCbDesc = await session.evaluate(`(() => {
      const p1Row = Array.from(document.querySelectorAll('#cashBookTable tbody tr')).find(tr => tr.textContent.includes('V-501'));
      return p1Row ? p1Row.querySelectorAll('td')[2].textContent.trim() : null;
    })()`);

    assert(updatedCbDesc === 'UPDATED: Sanctum LED driver replacement with surge protection', 'Cash Book reflects updated payment description after edit and refresh', updatedCbDesc);

    await session.evaluate(`navigate('bankbook')`);

    const updatedBbDesc = await session.evaluate(`(() => {
      const p3Row = Array.from(document.querySelectorAll('#bankBookTable tbody tr')).find(tr => tr.textContent.includes('V-503'));
      return p3Row ? p3Row.querySelectorAll('td')[2].textContent.trim() : null;
    })()`);

    assert(updatedBbDesc === 'UPDATED: 600L diesel with delivery challan #8841', 'Bank Book reflects updated payment description after edit and refresh', updatedBbDesc);

    console.log('\n--- BROWSER VERIFICATION: Filter Integration & CSV Export ---');
    // Check filter preservation
    const filterWorkedTest = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      const typeSelect = document.getElementById('bankBookTypeFilter');
      if (!catSelect || !typeSelect) return false;
      catSelect.value = 'Generator';
      typeSelect.value = 'payment';
      applyBankBookFilter();

      const visibleRows = Array.from(document.querySelectorAll('#bankBookTable tbody tr')).filter(tr => tr.style.display !== 'none');
      const p3Row = visibleRows.find(tr => tr.textContent.includes('V-503'));
      const descCell = p3Row ? p3Row.querySelectorAll('td')[2].textContent.trim() : null;
      return {
        visibleCount: visibleRows.length,
        hasP3: !!p3Row,
        descCell
      };
    })()`);

    assert(filterWorkedTest.visibleCount === 1, 'Filtering Bank Book displays filtered payment row', `Visible: ${filterWorkedTest.visibleCount}`);
    assert(filterWorkedTest.descCell === 'UPDATED: 600L diesel with delivery challan #8841', 'Filtered Bank Book row retains correct Description column data');

  } catch (err) {
    console.error('Fatal error during E2E test:', err);
    failed++;
  } finally {
    await session.close();
    if (server) {
      server.close();
      console.log('[SERVER] Stopped.');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`BROWSER E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

main();
