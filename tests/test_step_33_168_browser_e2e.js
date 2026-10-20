/**
 * STEP 33.168 — Browser E2E Test: Bank Book Description Column Verification
 * Location: tests/test_step_33_168_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.168: BROWSER E2E TEST — BANK BOOK DESCRIPTION COLUMN');
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

function startServer(port = 3018) {
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

  async start(port = 3018) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9226',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-bb',
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
    server = await startServer(3018);
    await session.start(3018);

    // Boot and open DB
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();
      if (typeof seedIfNeeded === 'function') await seedIfNeeded();
      await navigate('bankbook');
    })()`);

    console.log('\n--- BROWSER VERIFICATION: Bank Book Table Headers & Column Structure ---');
    const headerInfo = await session.evaluate(`(() => {
      const table = document.getElementById('bankBookTable');
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

    assert(headerInfo !== null, 'Bank Book table rendered in DOM');
    assert(headerInfo.ths.length === 6, 'Table has exactly 6 headers', headerInfo.ths.join(', '));
    assert(headerInfo.ths[0] === 'Date', 'Header 1 is Date');
    assert(headerInfo.ths[1] === 'Particulars', 'Header 2 is Particulars');
    assert(headerInfo.ths[2] === 'Description', 'Header 3 is Description (immediately after Particulars and before Deposit)');
    assert(headerInfo.ths[3] === 'Deposit', 'Header 4 is Deposit');
    assert(headerInfo.ths[4] === 'Withdrawal', 'Header 5 is Withdrawal');
    assert(headerInfo.ths[5] === 'Balance', 'Header 6 is Balance');

    // Computed style assertions
    assert(headerInfo.thStyles[2].whiteSpace === 'normal', 'Description header has text-wrapping (whiteSpace: normal)');
    assert(headerInfo.thStyles[3].textAlign === 'right', 'Deposit header is right-aligned');
    assert(headerInfo.thStyles[4].textAlign === 'right', 'Withdrawal header is right-aligned');
    assert(headerInfo.thStyles[5].textAlign === 'right', 'Balance header is right-aligned');

    console.log('\n--- BROWSER VERIFICATION: Opening Balance & Totals Footer Structure ---');
    const tableStructure = await session.evaluate(`(() => {
      const table = document.getElementById('bankBookTable');
      const opRow = table.querySelector('tbody tr:first-child');
      const opCells = opRow ? Array.from(opRow.querySelectorAll('td')).map(td => td.textContent.trim()) : [];
      
      const tfRow = table.querySelector('tfoot tr');
      const tfCells = tfRow ? Array.from(tfRow.querySelectorAll('td')).map(td => ({
        text: td.textContent.trim(),
        id: td.id,
        align: window.getComputedStyle(td).textAlign
      })) : [];

      return { opCells, tfCells };
    })()`);

    assert(tableStructure.opCells.length === 6, 'Opening balance row has exactly 6 cells');
    assert(tableStructure.opCells[1] === 'Opening Balance', 'Opening balance row col 2 is "Opening Balance"');
    assert(tableStructure.opCells[2] === '—', 'Opening balance row col 3 (Description) displays "—"');
    assert(tableStructure.opCells[3] === '-', 'Opening balance row col 4 (Deposit) displays "-"');
    assert(tableStructure.opCells[4] === '-', 'Opening balance row col 5 (Withdrawal) displays "-"');

    assert(tableStructure.tfCells.length === 6, 'TFoot row has exactly 6 cells');
    assert(tableStructure.tfCells[0].text === 'TOTAL', 'TFoot col 1 is "TOTAL"');
    assert(tableStructure.tfCells[1].text === '—', 'TFoot col 2 (Particulars) is "—"');
    assert(tableStructure.tfCells[2].text === '—', 'TFoot col 3 (Description) is "—"');
    assert(tableStructure.tfCells[3].id === 'bankBookTotalDeposit', 'TFoot col 4 is bankBookTotalDeposit');
    assert(tableStructure.tfCells[3].align === 'right', 'TFoot col 4 is right-aligned');
    assert(tableStructure.tfCells[4].id === 'bankBookTotalWithdrawal', 'TFoot col 5 is bankBookTotalWithdrawal');
    assert(tableStructure.tfCells[4].align === 'right', 'TFoot col 5 is right-aligned');
    assert(tableStructure.tfCells[5].text === '—', 'TFoot col 6 (Balance) is "—"');

    console.log('\n--- BROWSER VERIFICATION: Live Transaction Rendering in DOM ---');
    // Inject realistic test records into sandbox state and render bankbook
    const liveDataTest = await session.evaluate(`(async () => {
      window.activeReceipts = async () => [
        { id: 'r1', receiptNo: 'R-201', name: 'Gopalan Nair', paymentMode: 'Bank', amount: 5000, date: '2026-04-10', description: 'Annadanam Sponsorship', voided: false },
        { id: 'r2', receiptNo: 'R-202', name: 'Lakshmi Amma', paymentMode: 'UPI', amount: 1500, date: '2026-04-11', description: '', voided: false },
        { id: 'r3', receiptNo: 'R-203', name: 'Narayanan', paymentMode: 'Bank', amount: 2000, date: '2026-04-12', source: 'billing', billingFirestoreId: 'bill_77', description: 'Sahasranamam | Star: Rohini', voided: false }
      ];
      window.activePayments = async () => [
        { id: 'p1', voucherNo: 'V-101', paidTo: 'Temple Flora', paymentMode: 'Bank', amount: 3000, date: '2026-04-11', description: 'Flower garlands for festival', voided: false },
        { id: 'p2', voucherNo: 'V-102', paidTo: 'Manoj Audio', paymentMode: 'UPI', amount: 1000, date: '2026-04-12', description: '   ', voided: false }
      ];
      window.activeTransfers = async () => [
        { id: 't1', fromAcc: 'Cash', toAcc: 'Bank', amount: 7000, date: '2026-04-13', mode: 'Cash', reason: 'Sunday collections', description: 'Sunday counter collection deposit', voided: false }
      ];
      window.allLoans = async () => [];
      window.activeChittyCollections = async () => [];
      window.activeChittyPayouts = async () => [];

      await navigate('bankbook');

      const trs = Array.from(document.querySelectorAll('#bankBookTable tbody tr'));
      return trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        const descTd = tr.querySelectorAll('td')[2];
        const descCs = descTd ? window.getComputedStyle(descTd) : {};
        return {
          tds,
          descWhiteSpace: descCs.whiteSpace,
          descWordBreak: descCs.wordBreak
        };
      });
    })()`);

    assert(liveDataTest.length === 7, 'Rendered 7 rows (1 opening balance + 6 live transactions)', `Count: ${liveDataTest.length}`);

    // Row 1: Opening balance
    assert(liveDataTest[0].tds[1] === 'Opening Balance', 'Row 1 is Opening Balance');
    assert(liveDataTest[0].tds[2] === '—', 'Row 1 Description is "—"');

    // Row 2: Gopalan Nair with description
    const r1Row = liveDataTest.find(r => r.tds[1].includes('R-201'));
    assert(r1Row && r1Row.tds[2] === 'Annadanam Sponsorship', 'Receipt R-201 Description is "Annadanam Sponsorship"');
    assert(r1Row && r1Row.descWhiteSpace === 'normal', 'Receipt R-201 Description cell has whiteSpace: normal');

    // Row 3: Lakshmi Amma with empty description
    const r2Row = liveDataTest.find(r => r.tds[1].includes('R-202'));
    assert(r2Row && r2Row.tds[2] === '—', 'Receipt R-202 with empty description renders "—"');

    // Row 4: Temple Flora payment with description
    const p1Row = liveDataTest.find(r => r.tds[1].includes('V-101'));
    assert(p1Row && p1Row.tds[2] === 'Flower garlands for festival', 'Payment V-101 Description is "Flower garlands for festival"');

    // Row 5: Manoj Audio with whitespace-only description
    const p2Row = liveDataTest.find(r => r.tds[1].includes('V-102'));
    assert(p2Row && p2Row.tds[2] === '—', 'Payment V-102 with whitespace-only description renders "—"');

    // Row 6: Billing-linked receipt with description
    const r3Row = liveDataTest.find(r => r.tds[1].includes('R-203'));
    assert(r3Row && r3Row.tds[2] === 'Sahasranamam | Star: Rohini', 'Billing-linked Receipt R-203 Description is "Sahasranamam | Star: Rohini"');

    // Row 7: Sunday transfer with description
    const t1Row = liveDataTest.find(r => r.tds[1].includes('Sunday collections'));
    assert(t1Row && t1Row.tds[2] === 'Sunday counter collection deposit', 'Fund Transfer Description is "Sunday counter collection deposit"');

    console.log('\n--- BROWSER VERIFICATION: Print Generic Table Output ---');
    const printTest = await session.evaluate(`(() => {
      window.print = () => {}; // Stub native print dialog
      const table = document.getElementById('bankBookTable');
      printGenericTable('Bank Book', table);
      const printArea = document.getElementById('print-area');
      const prThs = Array.from(printArea.querySelectorAll('table thead th')).map(th => th.textContent.trim());
      const prRows = Array.from(printArea.querySelectorAll('table tbody tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );
      return {
        hasPrTable: !!printArea.querySelector('.pr-table'),
        prThs,
        prRowsCount: prRows.length,
        hasAnnadanam: prRows.some(r => r[2] === 'Annadanam Sponsorship'),
        hasEmDash: prRows.some(r => r[2] === '—')
      };
    })()`);

    assert(printTest.hasPrTable, 'Print area contains table with class "pr-table"');
    assert(printTest.prThs.length === 6, 'Print area table has 6 headers', printTest.prThs.join(', '));
    assert(printTest.prThs[2] === 'Description', 'Print area table has Description as column 3');
    assert(printTest.hasAnnadanam, 'Print area includes rendered transaction descriptions');
    assert(printTest.hasEmDash, 'Print area includes "—" for missing descriptions');

    console.log('\n' + '='.repeat(80));
    console.log(`BROWSER E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(80));

    if (failed > 0) process.exit(1);

  } catch (err) {
    console.error('Browser E2E Execution failed:', err);
    process.exit(1);
  } finally {
    await session.close();
    if (server) {
      server.close();
      console.log('[SERVER] Stopped.');
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
