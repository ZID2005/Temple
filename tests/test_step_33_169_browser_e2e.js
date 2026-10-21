/**
 * STEP 33.169 — Browser Headless E2E Test: Cash Book & Bank Book Filter Standardization
 * Location: tests/test_step_33_169_browser_e2e.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.169: BROWSER HEADLESS E2E TEST — CASH & BANK BOOK FILTERS');
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

function startServer(port = 3019) {
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

  async start(port = 3019) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9227',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-filters',
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
    if (res.exceptionDetails) {
      throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this.chromeProc) {
      this.chromeProc.kill('SIGKILL');
    }
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}${details ? ' (' + details + ')' : ''}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${message}${details ? ' — ' + details : ''}`);
  }
}

(async () => {
  let server = null;
  const session = new BrowserSession();

  try {
    server = await startServer(3019);
    await session.start(3019);

    // Boot and open DB
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function' && typeof openDB === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (typeof openDB === 'function') await openDB();
      if (typeof seedIfNeeded === 'function') await seedIfNeeded();
    })()`);

    // Setup Synthetic Test Data in Browser Tab
    await session.evaluate(`(async () => {
      window.activeReceipts = async () => [
        { id: 'r1', receiptNo: 'R-101', name: 'Devotee A', paymentMode: 'Cash', category: 'masavari', amount: 500, date: '2026-04-02', description: 'Masavari cash', voided: false },
        { id: 'r2', receiptNo: 'R-102', name: 'Devotee B', paymentMode: 'Cash', category: 'Vazhipadu', amount: 1500, date: '2026-04-03', description: 'Archana cash', voided: false },
        { id: 'r3', receiptNo: 'R-201', name: 'Devotee C', paymentMode: 'Bank', category: 'Vazhipadu', amount: 2000, date: '2026-04-04', description: 'Pushpanjali online', voided: false },
        { id: 'r4', receiptNo: 'R-202', name: 'Devotee D', paymentMode: 'UPI', category: 'Annadanam', amount: 3000, date: '2026-04-05', description: 'Annadanam UPI', voided: false }
      ];
      window.activePayments = async () => [
        { id: 'p1', voucherNo: 'V-101', paidTo: 'Flower Vendor', paymentMode: 'Cash', category: 'Flower', amount: 400, date: '2026-04-03', description: 'Garlands cash', voided: false },
        { id: 'p2', voucherNo: 'V-102', paidTo: 'Oil Merchant', paymentMode: 'Cash', category: 'Puja Items', amount: 600, date: '2026-04-04', description: 'Oil cash', voided: false },
        { id: 'p3', voucherNo: 'V-201', paidTo: 'Electrician', paymentMode: 'Bank', category: 'Maintenance', amount: 1200, date: '2026-04-05', description: 'Generator bank', voided: false },
        { id: 'p4', voucherNo: 'V-202', paidTo: 'Painter', paymentMode: 'UPI', category: 'Maintenance', amount: 1800, date: '2026-04-06', description: 'Paint UPI', voided: false }
      ];
      window.activeTransfers = async () => [
        { id: 't1', date: '2026-04-07', fromAcc: 'Cash', toAcc: 'Bank', amount: 1000, mode: 'Cash', reason: 'Deposit cash to bank', description: 'Cash deposit', voided: false },
        { id: 't2', date: '2026-04-08', fromAcc: 'Bank', toAcc: 'Cash', amount: 500, mode: 'Cash', reason: 'ATM Withdrawal', description: 'ATM cash', voided: false }
      ];
      window.allLoans = async () => [];
      window.activeChittyCollections = async () => [];
      window.activeChittyPayouts = async () => [];
    })()`);

    // =======================================================================
    // 1. CASH BOOK FILTER VERIFICATION
    // =======================================================================
    console.log('\n--- BROWSER VERIFICATION: Cash Book Filtering ---');

    await session.evaluate(`(async () => { await navigate('cashbook'); })()`);

    const cbInitial = await session.evaluate(`(() => {
      const catSelect = document.getElementById('cashBookCategoryFilter');
      const typeSelect = document.getElementById('cashBookTypeFilter');
      const clearBtn = Array.from(document.querySelectorAll('.toolbar button')).find(b => b.textContent.includes('Clear Filters'));
      const trs = Array.from(document.querySelectorAll('#cashBookTable tbody tr'));
      const recTotal = document.getElementById('cashBookTotalReceipt')?.textContent.trim();
      const payTotal = document.getElementById('cashBookTotalPayment')?.textContent.trim();
      return {
        catOptions: Array.from(catSelect.options).map(o => o.value),
        typeOptions: Array.from(typeSelect.options).map(o => o.value),
        hasClearBtn: !!clearBtn,
        rowCount: trs.length,
        recTotal,
        payTotal
      };
    })()`);

    assert(cbInitial.catOptions.includes(''), 'Cash Book has All Categories option');
    assert(cbInitial.catOptions.includes('masavari'), 'Cash Book category dropdown includes masavari');
    assert(cbInitial.catOptions.includes('Flower'), 'Cash Book category dropdown includes Flower');
    assert(cbInitial.typeOptions.join(',') === ',receipt,payment', 'Cash Book type dropdown has All, Receipts Only, Payments Only');
    assert(cbInitial.hasClearBtn, 'Cash Book has Clear Filters button');
    assert(cbInitial.rowCount === 7, 'Cash Book has 7 rows (1 opening + 6 cash transactions)', `Count: ${cbInitial.rowCount}`);

    // Filter by Category: 'masavari'
    const cbCatFiltered = await session.evaluate(`(() => {
      const catSelect = document.getElementById('cashBookCategoryFilter');
      catSelect.value = 'masavari';
      catSelect.dispatchEvent(new Event('change'));
      const trs = Array.from(document.querySelectorAll('#cashBookTable tbody tr'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const recTotal = document.getElementById('cashBookTotalReceipt')?.textContent.trim();
      const payTotal = document.getElementById('cashBookTotalPayment')?.textContent.trim();
      return { visibleCount: visible.length, recTotal, payTotal };
    })()`);

    assert(cbCatFiltered.visibleCount === 1, 'Filtering by masavari displays exactly 1 row', `Visible: ${cbCatFiltered.visibleCount}`);
    assert(cbCatFiltered.recTotal.includes('500.00'), 'Category filter updates Receipt total to ₹500.00');
    assert(cbCatFiltered.payTotal.includes('0.00'), 'Category filter updates Payment total to ₹0.00');

    // Filter by Type: 'receipt' (combined with masavari)
    const cbCombined1 = await session.evaluate(`(() => {
      const typeSelect = document.getElementById('cashBookTypeFilter');
      typeSelect.value = 'receipt';
      typeSelect.dispatchEvent(new Event('change'));
      const trs = Array.from(document.querySelectorAll('#cashBookTable tbody tr'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      return { visibleCount: visible.length };
    })()`);

    assert(cbCombined1.visibleCount === 1, 'Combined masavari + Receipts Only displays 1 row');

    // Combined Filter: Payments Only + 'Flower'
    const cbCombined2 = await session.evaluate(`(() => {
      const catSelect = document.getElementById('cashBookCategoryFilter');
      const typeSelect = document.getElementById('cashBookTypeFilter');
      catSelect.value = 'Flower';
      typeSelect.value = 'payment';
      catSelect.dispatchEvent(new Event('change'));
      const trs = Array.from(document.querySelectorAll('#cashBookTable tbody tr'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const payTotal = document.getElementById('cashBookTotalPayment')?.textContent.trim();
      return { visibleCount: visible.length, payTotal };
    })()`);

    assert(cbCombined2.visibleCount === 1, 'Combined Flower + Payments Only displays 1 row');
    assert(cbCombined2.payTotal.includes('400.00'), 'Combined Flower payment total is ₹400.00');

    // Test Empty State
    const cbEmptyTest = await session.evaluate(`(() => {
      const catSelect = document.getElementById('cashBookCategoryFilter');
      catSelect.value = 'Flower';
      const typeSelect = document.getElementById('cashBookTypeFilter');
      typeSelect.value = 'receipt'; // Flower has NO receipts!
      catSelect.dispatchEvent(new Event('change'));
      const emptyRow = document.getElementById('cashBookEmptyRow');
      const visibleDataRows = Array.from(document.querySelectorAll('#cashBookTable tbody tr:not(#cashBookEmptyRow)')).filter(r => r.style.display !== 'none');
      return {
        hasEmptyRow: !!emptyRow && emptyRow.style.display !== 'none',
        emptyText: emptyRow ? emptyRow.textContent.trim() : '',
        visibleDataCount: visibleDataRows.length
      };
    })()`);

    assert(cbEmptyTest.hasEmptyRow, 'Empty state row displayed when no transactions match');
    assert(cbEmptyTest.emptyText.includes('No transactions match the selected filters'), 'Empty row contains correct message');
    assert(cbEmptyTest.visibleDataCount === 0, 'Zero data rows visible during empty state');

    // Clear Filters
    const cbCleared = await session.evaluate(`(() => {
      clearCashBookFilters();
      const trs = Array.from(document.querySelectorAll('#cashBookTable tbody tr:not(#cashBookEmptyRow)'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const catSelect = document.getElementById('cashBookCategoryFilter');
      const typeSelect = document.getElementById('cashBookTypeFilter');
      const emptyRow = document.getElementById('cashBookEmptyRow');
      return {
        visibleCount: visible.length,
        catVal: catSelect.value,
        typeVal: typeSelect.value,
        emptyRowHidden: !emptyRow || emptyRow.style.display === 'none'
      };
    })()`);

    assert(cbCleared.visibleCount === 7, 'clearCashBookFilters restores all 7 rows');
    assert(cbCleared.catVal === '' && cbCleared.typeVal === '', 'clearCashBookFilters resets dropdown selections to All');
    assert(cbCleared.emptyRowHidden, 'Empty row is removed or hidden after clearing filters');

    // =======================================================================
    // 2. BANK BOOK FILTER VERIFICATION
    // =======================================================================
    console.log('\n--- BROWSER VERIFICATION: Bank Book Filtering ---');

    await session.evaluate(`(async () => { await navigate('bankbook'); })()`);

    const bbInitial = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      const typeSelect = document.getElementById('bankBookTypeFilter');
      const clearBtn = Array.from(document.querySelectorAll('.toolbar button')).find(b => b.textContent.includes('Clear Filters'));
      const trs = Array.from(document.querySelectorAll('#bankBookTable tbody tr'));
      const depTotal = document.getElementById('bankBookTotalDeposit')?.textContent.trim();
      const wdrTotal = document.getElementById('bankBookTotalWithdrawal')?.textContent.trim();
      return {
        catOptions: Array.from(catSelect.options).map(o => o.value),
        typeOptions: Array.from(typeSelect.options).map(o => o.value),
        hasClearBtn: !!clearBtn,
        rowCount: trs.length,
        depTotal,
        wdrTotal
      };
    })()`);

    assert(bbInitial.catOptions.includes(''), 'Bank Book has All Categories option');
    assert(bbInitial.catOptions.includes('Vazhipadu'), 'Bank Book category dropdown includes Vazhipadu');
    assert(bbInitial.catOptions.includes('Maintenance'), 'Bank Book category dropdown includes Maintenance');
    assert(bbInitial.typeOptions.join(',') === ',receipt,payment', 'Bank Book type dropdown has All, Receipts Only, Payments Only');
    assert(bbInitial.hasClearBtn, 'Bank Book has Clear Filters button');
    assert(bbInitial.rowCount === 7, 'Bank Book has 7 rows (1 opening + 6 bank transactions)', `Count: ${bbInitial.rowCount}`);

    // Combined Filter in Bank Book: Receipts Only + 'Vazhipadu'
    const bbCombined1 = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      const typeSelect = document.getElementById('bankBookTypeFilter');
      catSelect.value = 'Vazhipadu';
      typeSelect.value = 'receipt';
      catSelect.dispatchEvent(new Event('change'));
      const trs = Array.from(document.querySelectorAll('#bankBookTable tbody tr'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const depTotal = document.getElementById('bankBookTotalDeposit')?.textContent.trim();
      const wdrTotal = document.getElementById('bankBookTotalWithdrawal')?.textContent.trim();
      return { visibleCount: visible.length, depTotal, wdrTotal };
    })()`);

    assert(bbCombined1.visibleCount === 1, 'Bank Book Vazhipadu + Receipts Only displays 1 row');
    assert(bbCombined1.depTotal.includes('2,000.00'), 'Bank Book deposit total is ₹2,000.00');
    assert(bbCombined1.wdrTotal.includes('0.00'), 'Bank Book withdrawal total is ₹0.00');

    // Combined Filter in Bank Book: Payments Only + 'Maintenance'
    const bbCombined2 = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      const typeSelect = document.getElementById('bankBookTypeFilter');
      catSelect.value = 'Maintenance';
      typeSelect.value = 'payment';
      catSelect.dispatchEvent(new Event('change'));
      const trs = Array.from(document.querySelectorAll('#bankBookTable tbody tr'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const depTotal = document.getElementById('bankBookTotalDeposit')?.textContent.trim();
      const wdrTotal = document.getElementById('bankBookTotalWithdrawal')?.textContent.trim();
      return { visibleCount: visible.length, depTotal, wdrTotal };
    })()`);

    assert(bbCombined2.visibleCount === 2, 'Bank Book Maintenance + Payments Only displays 2 rows (Generator + Painter)');
    assert(bbCombined2.wdrTotal.includes('3,000.00'), 'Bank Book withdrawal total is ₹3,000.00 (1200 + 1800)');
    assert(bbCombined2.depTotal.includes('0.00'), 'Bank Book deposit total is ₹0.00');

    // Bank Book Empty State
    const bbEmptyTest = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      catSelect.value = 'Maintenance';
      const typeSelect = document.getElementById('bankBookTypeFilter');
      typeSelect.value = 'receipt'; // Maintenance has NO receipts!
      catSelect.dispatchEvent(new Event('change'));
      const emptyRow = document.getElementById('bankBookEmptyRow');
      const visibleDataRows = Array.from(document.querySelectorAll('#bankBookTable tbody tr:not(#bankBookEmptyRow)')).filter(r => r.style.display !== 'none');
      return {
        hasEmptyRow: !!emptyRow && emptyRow.style.display !== 'none',
        emptyText: emptyRow ? emptyRow.textContent.trim() : '',
        visibleDataCount: visibleDataRows.length
      };
    })()`);

    assert(bbEmptyTest.hasEmptyRow, 'Bank Book displays empty row when 0 rows match');
    assert(bbEmptyTest.emptyText.includes('No transactions match the selected filters'), 'Bank Book empty message is correct');
    assert(bbEmptyTest.visibleDataCount === 0, 'Zero bank data rows visible during empty state');

    // Bank Book Clear Filters
    const bbCleared = await session.evaluate(`(() => {
      clearBankBookFilters();
      const trs = Array.from(document.querySelectorAll('#bankBookTable tbody tr:not(#bankBookEmptyRow)'));
      const visible = trs.filter(tr => tr.style.display !== 'none');
      const catSelect = document.getElementById('bankBookCategoryFilter');
      const typeSelect = document.getElementById('bankBookTypeFilter');
      const emptyRow = document.getElementById('bankBookEmptyRow');
      return {
        visibleCount: visible.length,
        catVal: catSelect.value,
        typeVal: typeSelect.value,
        emptyRowHidden: !emptyRow || emptyRow.style.display === 'none'
      };
    })()`);

    assert(bbCleared.visibleCount === 7, 'clearBankBookFilters restores all 7 rows');
    assert(bbCleared.catVal === '' && bbCleared.typeVal === '', 'clearBankBookFilters resets dropdowns');
    assert(bbCleared.emptyRowHidden, 'Empty row is removed/hidden after clearing bank filters');

    // Verify Print Output with active filter
    const printTest = await session.evaluate(`(() => {
      const catSelect = document.getElementById('bankBookCategoryFilter');
      catSelect.value = 'Maintenance';
      catSelect.dispatchEvent(new Event('change'));
      
      const printArea = document.getElementById('print-area');
      // Call printGenericTable
      printGenericTable('Bank Book', document.getElementById('bankBookTable'));
      return {
        printHasPrTable: printArea.innerHTML.includes('class="pr-table"'),
        printTitle: printArea.textContent.includes('Bank Book'),
        printHasHeaders: printArea.innerHTML.includes('Description'),
        printHasMaintenance: printArea.innerHTML.includes('Electrician')
      };
    })()`);

    assert(printTest.printHasPrTable, 'Print area includes table with class="pr-table"');
    assert(printTest.printTitle, 'Print area includes title "Bank Book"');
    assert(printTest.printHasHeaders, 'Print area includes Description column');
    assert(printTest.printHasMaintenance, 'Print area includes filtered Maintenance transaction');

    console.log('\n' + '='.repeat(80));
    console.log(`BROWSER E2E SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(80));

    if (failed > 0) process.exit(1);

  } catch (err) {
    console.error('Fatal Browser E2E Error:', err);
    process.exit(1);
  } finally {
    await session.close();
    if (server) server.close();
    console.log('[BROWSER] Session closed.\n[SERVER] Stopped.');
  }
})();
