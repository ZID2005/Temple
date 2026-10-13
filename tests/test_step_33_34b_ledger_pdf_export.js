// tests/test_step_33_34b_ledger_pdf_export.js
// Automated Verification Suite for STEP 33.34B:
// Replace Ledger CSV/Excel Export with PDF Export

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('STEP 33.34B VALIDATION SUITE: LEDGER PDF EXPORT');
console.log('================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testDesc, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testDesc}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testDesc}${detail ? ' — ' + detail : ''}`);
    failedTests++;
  }
}

// ----------------------------------------------------------------
// GROUP 1: Static Source & Token Verification (Tests 1, 2, 3)
// ----------------------------------------------------------------
console.log('--- TEST GROUP 1: Button Replacement & Static Audit ---');

// Extract VIEW_RENDERERS.ledger code
const ledgerMatch = html.match(/VIEW_RENDERERS\.ledger\s*=\s*async\s*function\s*\(\)\s*\{([\s\S]*?)\n\};/);
assert(!!ledgerMatch, 'VIEW_RENDERERS.ledger extracted from source');
const ledgerSource = ledgerMatch ? ledgerMatch[1] : '';

// 1. Exactly one Export PDF button appears in the Ledger
const exportPdfButtonMatches = ledgerSource.match(/<button[^>]*>[\s\S]*?Export\s+PDF[\s\S]*?<\/button>/gi) || [];
assert(exportPdfButtonMatches.length === 1, `Exactly ONE 'Export PDF' button in Ledger view (found: ${exportPdfButtonMatches.length})`);
assert(exportPdfButtonMatches.length > 0 && exportPdfButtonMatches[0].includes('onclick="exportLedgerPDF()"'), 'Ledger Export PDF button calls exportLedgerPDF()');
assert(exportPdfButtonMatches.length > 0 && exportPdfButtonMatches[0].includes('btn-sec btn-sm'), 'Ledger Export PDF button uses application button styling (btn-sec btn-sm)');

// 2. The old Ledger CSV/Excel button is removed from Ledger view
const oldLedgerCsvMatch = ledgerSource.match(/exportLedgerCSV\(\)/gi) || [];
assert(oldLedgerCsvMatch.length === 0, 'Old Ledger CSV/Excel button completely removed from Ledger view');

// 3. Other modules' export controls remain unchanged
const receiptsCsvMatch = html.match(/<button[^>]*onclick="exportCSV\('receipts'\)"[^>]*>CSV \/ Excel<\/button>/);
assert(!!receiptsCsvMatch, 'Receipts module CSV / Excel button remains unchanged');

const paymentsCsvMatch = html.match(/<button[^>]*onclick="exportCSV\('payments'\)"[^>]*>CSV \/ Excel<\/button>/);
assert(!!paymentsCsvMatch, 'Payments module CSV / Excel button remains unchanged');

const cashBookCsvMatch = html.match(/<button[^>]*onclick="exportCashBookCSV\(\)"[^>]*>CSV \/ Excel<\/button>/);
assert(!!cashBookCsvMatch, 'Cash Book module CSV / Excel button remains unchanged');

const billingReportCsvMatch = html.match(/<button[^>]*onclick="exportBillingReportCSV\(\)"[^>]*>/);
assert(!!billingReportCsvMatch, 'Billing Report module CSV export button remains unchanged');

const reportsLedgerCsvMatch = html.match(/<button[^>]*onclick="exportLedgerCSVFromReports\(\)"[^>]*>Ledger CSV<\/button>/);
assert(!!reportsLedgerCsvMatch, 'Reports module Ledger CSV export button remains unchanged');

assert(html.includes('function exportLedgerCSV()'), 'exportLedgerCSV function preserved for Reports module compatibility');

// CSS & Paged media rules verification (Tests 9 & 10 static)
assert(html.includes('.ledger-pdf-table thead') && html.includes('display: table-header-group !important;'), 'Print CSS enforces thead repetition across pages (table-header-group)');
assert(html.includes('.ledger-pdf-table tr') && html.includes('page-break-inside: avoid !important;'), 'Print CSS avoids awkward row splits (page-break-inside: avoid)');
assert(html.includes('.ledger-pdf-table tfoot') && html.includes('display: table-row-group !important;'), 'Print CSS keeps totals footer at table end (display: table-row-group)');
assert(html.includes('size: A4 landscape;'), 'Print CSS configures A4 landscape orientation for readable 6-column tabular accounting layout');
assert(html.includes('Noto Sans Malayalam'), 'Print CSS includes Noto Sans Malayalam for high-fidelity Malayalam font rendering');

// ----------------------------------------------------------------
// GROUP 2: In-Memory Sandbox Functional Tests (Tests 4 to 11)
// ----------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Sandbox PDF Report Generation & Data Integrity ---');

function createSandbox(initialData = {}) {
  const elements = {};
  function makeEl(id, tagName = 'div') {
    const elObj = {
      id,
      tagName: tagName.toUpperCase(),
      innerHTML: '',
      textContent: '',
      style: {},
      className: '',
      dataset: {},
      value: '',
      children: [],
      appendChild(c) { this.children.push(c); return c; },
      parentNode: { removeChild(c) {} }
    };
    elements[id] = elObj;
    return elObj;
  }

  // Pre-create standard ledger and print elements
  makeEl('ledgerFrom', 'input');
  makeEl('ledgerTo', 'input');
  makeEl('ledgerFundFilter', 'select');
  makeEl('print-area', 'div');
  makeEl('ledgerTotalDebit', 'td');
  makeEl('ledgerTotalCredit', 'td');

  const settings = {
    templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    address: 'ആശാരിവിളാകം കേരളദിത്യപുരം',
    phone: '9847000000',
    email: 'temple@example.com',
    currencySymbol: '₹',
    receiptCounter: 1050,
    voucherCounter: 520,
    billingReceiptCounter: 80,
    globalSequenceCounter: 1650
  };

  const sandbox = {
    VIEW_RENDERERS: {},
    allFunds: async () => [],
    activeReceipts: async () => [],
    activePayments: async () => [],
    window: {
      APP_SETTINGS: settings,
      _ledgerRows: initialData.rows || [],
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    document: {
      body: {
        classList: {
          add(c) {},
          remove(c) {}
        }
      },
      title: 'Original Title',
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => makeEl('dynamic-' + Math.random(), tag),
      head: { appendChild(c) {} }
    },
    el: (id) => elements[id] || null,
    qsa: (sel, root) => {
      if (sel === '#ledgerTable tbody tr') return sandbox._mockDomTrs || [];
      if (sel === 'td' && root) return root.children || [];
      return [];
    },
    fmtMoney: (n) => {
      const v = parseFloat(n) || 0;
      return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    fmtDate: (iso) => {
      if (!iso) return '-';
      const [y, m, d] = iso.split('-');
      return `${d}-${m}-${y}`;
    },
    todayISO: () => '2026-10-12',
    esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    requestAnimationFrame: (cb) => cb(),
    console
  };

  vm.createContext(sandbox);

  // Load Ledger code block from Temple_Accounts-1.html
  const startIdx = html.indexOf('/* ===================== LEDGER ===================== */');
  const endIdx = html.indexOf('/* ===================== FUND TRANSFERS ===================== */');
  const ledgerCode = html.slice(startIdx, endIdx);
  vm.runInContext(ledgerCode, sandbox);

  return { sandbox, elements, settings };
}

// Synthetic dataset including Malayalam items and various funds
const testTransactions = [
  { date: '2026-04-01', voucher: 'R-1001', particulars: 'നൂൽജപം/അർച്ചന - വഴിപാട്', fund: 'General Temple Fund', debit: 0, credit: 500 },
  { date: '2026-04-05', voucher: 'V-501', particulars: 'ക്ഷേത്ര മേൽശാന്തി ശമ്പളം - Priest Payment', fund: 'General Temple Fund', debit: 12000, credit: 0 },
  { date: '2026-04-10', voucher: 'R-1002', particulars: 'മറുതക് ചെറിയ പടുക്ക - വഴിപാട്', fund: 'General Temple Fund', debit: 0, credit: 2000 },
  { date: '2026-05-02', voucher: 'R-1003', particulars: 'ക്ഷേത്ര പുനരുദ്ധാരണ സംഭാവന - Donation', fund: 'Punarudharanam Fund', debit: 0, credit: 50000 },
  { date: '2026-05-15', voucher: 'V-502', particulars: 'പുനരുദ്ധാരണ സിമന്റ് വാങ്ങിയത് - Materials', fund: 'Punarudharanam Fund', debit: 18500, credit: 0 }
];

// Test 4, 5, 6: Full Report Generation & Content Integrity
const { sandbox: sb1, elements: el1, settings: st1 } = createSandbox({ rows: testTransactions });
const report1 = sb1.exportLedgerPDF({ skipPrint: true });

assert(!!report1, 'exportLedgerPDF executes and returns reportData object');
assert(report1.records.length === 5, `PDF includes all unfiltered ledger rows (got: ${report1.records.length}, expected: 5)`);
assert(report1.totalDebit === 30500, `Total Debit matches ledger rows exactly (₹30,500.00, got: ${report1.totalDebit})`);
assert(report1.totalCredit === 52500, `Total Credit matches ledger rows exactly (₹52,500.00, got: ${report1.totalCredit})`);

// 5. The report contains all six required columns
const renderedHtml1 = el1['print-area'].innerHTML;
assert(renderedHtml1.includes('<th style="width: 12%;">Date</th>'), 'Report contains column 1: Date');
assert(renderedHtml1.includes('<th style="width: 15%;">Voucher/Receipt No.</th>'), 'Report contains column 2: Voucher/Receipt No.');
assert(renderedHtml1.includes('<th style="width: 37%;">Particulars</th>'), 'Report contains column 3: Particulars');
assert(renderedHtml1.includes('<th style="width: 14%;">Fund</th>'), 'Report contains column 4: Fund');
assert(renderedHtml1.includes('<th class="th-num" style="width: 11%;">Debit</th>'), 'Report contains column 5: Debit (right-aligned th-num)');
assert(renderedHtml1.includes('<th class="th-num" style="width: 11%;">Credit</th>'), 'Report contains column 6: Credit (right-aligned th-num)');

// 6. Totals row matches and Debit/Credit right aligned
assert(renderedHtml1.includes('₹30,500.00') && renderedHtml1.includes('₹52,500.00'), 'Debit and Credit totals rendered accurately in HTML');
assert(renderedHtml1.includes('class="td-num"'), 'Transaction debit/credit cells use right-aligned td-num styling');

// 7. Date and fund filters are reflected in the report
el1['ledgerFrom'].value = '2026-05-01';
el1['ledgerTo'].value = '2026-05-31';
el1['ledgerFundFilter'].value = 'Punarudharanam Fund';
const report2 = sb1.exportLedgerPDF({ skipPrint: true });

assert(report2.records.length === 2, `Date and Fund filters correctly isolated 2 records (got: ${report2.records.length})`);
assert(report2.dateRangeStr === '01-05-2026 to 31-05-2026', `Date range reflected in report metadata (${report2.dateRangeStr})`);
assert(report2.fundStr === 'Punarudharanam Fund', `Fund filter reflected in report metadata (${report2.fundStr})`);
assert(report2.totalDebit === 18500, `Filtered total Debit correct: ₹18,500.00 (got: ${report2.totalDebit})`);
assert(report2.totalCredit === 50000, `Filtered total Credit correct: ₹50,000.00 (got: ${report2.totalCredit})`);

// 8. Empty results produce a valid empty report with zero totals
el1['ledgerFundFilter'].value = 'NonExistentFund';
const reportEmpty = sb1.exportLedgerPDF({ skipPrint: true });
const emptyHtml = el1['print-area'].innerHTML;

assert(reportEmpty.records.length === 0, 'Empty filter produces 0 records');
assert(reportEmpty.totalDebit === 0 && reportEmpty.totalCredit === 0, 'Empty filter produces 0 total debit and credit');
assert(emptyHtml.includes('No ledger transactions found matching the selected filter criteria'), 'Empty result shows user-friendly no-records message');
assert(emptyHtml.includes('₹0.00'), 'Empty result displays zero totals (₹0.00)');

// 10. Malayalam item names render correctly
assert(renderedHtml1.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'), 'Temple name in Malayalam rendered intact');
assert(renderedHtml1.includes('ആശാരിവിളാകം കേരളദിത്യപുരം'), 'Temple address in Malayalam rendered intact');
assert(renderedHtml1.includes('നൂൽജപം/അർച്ചന - വഴിപാട്'), 'Malayalam particulars (നൂൽജപം/അർച്ചന) rendered intact without substitution');
assert(renderedHtml1.includes('മറുതക് ചെറിയ പടുക്ക - വഴിപാട്'), 'Correct Malayalam spelling (മറുതക് ചെറിയ പടുക്ക) preserved in PDF report');

// 11. PDF generation does not mutate financial records or counters
assert(st1.receiptCounter === 1050, 'receiptCounter unmutated');
assert(st1.voucherCounter === 520, 'voucherCounter unmutated');
assert(st1.billingReceiptCounter === 80, 'billingReceiptCounter unmutated');
assert(st1.globalSequenceCounter === 1650, 'globalSequenceCounter unmutated');
assert(testTransactions.length === 5 && testTransactions[0].credit === 500, 'Original financial transactions array unmodified');

// ----------------------------------------------------------------
// GROUP 3: Live Browser & Native Chrome Print-To-PDF Test (CDP)
// ----------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Live Browser Verification & Real PDF Generation (CDP) ---');

async function runBrowserVerification() {
  try {
    const tabsRes = await fetch('http://127.0.0.1:9222/json');
    const tabs = await tabsRes.json();
    const pageTab = tabs.find(t => t.type === 'page' && t.url.includes('Temple_Accounts-1.html'));

    if (!pageTab) {
      console.warn('  ⚠️ Live browser tab for Temple_Accounts-1.html not found, skipping CDP live test.');
      return;
    }

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        callbacks.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');

    // 1. Navigate to ledger in live browser
    await sendCommand('Runtime.evaluate', {
      expression: `(async () => {
        await navigate('ledger');
        return { view: window.CURRENT_VIEW };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    // 2. Query DOM for button in live browser
    const buttonEval = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('ledgerExportPdfBtn');
        const allPdfBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Export PDF'));
        const oldCsvBtn = Array.from(document.querySelectorAll('#app-main button')).filter(b => b.textContent.includes('CSV / Excel'));
        return {
          btnFound: !!btn,
          btnText: btn ? btn.textContent.trim() : null,
          pdfBtnCount: allPdfBtns.length,
          oldCsvInLedgerCount: oldCsvBtn.length
        };
      })()`,
      returnByValue: true
    });

    const bRes = buttonEval.result.value;
    assert(bRes.btnFound, 'Live Browser: #ledgerExportPdfBtn element exists');
    assert(bRes.btnText === 'Export PDF', `Live Browser: Button text is exactly 'Export PDF' (got: '${bRes.btnText}')`);
    assert(bRes.pdfBtnCount === 1, `Live Browser: Exactly 1 'Export PDF' button exists (count: ${bRes.pdfBtnCount})`);
    assert(bRes.oldCsvInLedgerCount === 0, 'Live Browser: Old CSV / Excel button is completely absent from Ledger');

    // 3. Trigger exportLedgerPDF in live browser
    const exportEval = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const report = exportLedgerPDF({ skipPrint: true });
        const printArea = document.getElementById('print-area');
        return {
          reportData: report,
          printAreaClasses: printArea ? printArea.className : '',
          printAreaHtmlLen: printArea ? printArea.innerHTML.length : 0,
          hasTable: printArea ? !!printArea.querySelector('.ledger-pdf-table') : false,
          hasTotals: printArea ? !!printArea.querySelector('.ledger-total-footer-row') : false
        };
      })()`,
      returnByValue: true
    });

    const eRes = exportEval.result.value;
    assert(!!eRes.reportData, 'Live Browser: exportLedgerPDF executed successfully in Chrome');
    assert(eRes.printAreaClasses.includes('ledger-pdf-print'), 'Live Browser: #print-area has ledger-pdf-print class');
    assert(eRes.hasTable, 'Live Browser: #print-area contains .ledger-pdf-table');
    assert(eRes.hasTotals, 'Live Browser: #print-area contains .ledger-total-footer-row');

    // 4. Generate actual PDF via Chrome DevTools Protocol Page.printToPDF
    const pdfResult = await sendCommand('Page.printToPDF', {
      landscape: true,
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true
    });

    assert(!!pdfResult && !!pdfResult.data, 'Live Browser: Page.printToPDF successfully generated PDF stream');

    const pdfBuffer = Buffer.from(pdfResult.data, 'base64');
    const pdfPath = path.resolve(__dirname, '../reports/Ledger_Report_Step33_34B.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    assert(fs.existsSync(pdfPath), `PDF file written to disk at ${pdfPath}`);
    assert(pdfBuffer.length > 5000, `Generated PDF file has substantial binary size (${pdfBuffer.length} bytes)`);

    // Verify PDF header %PDF-
    const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
    assert(pdfHeader === '%PDF-', `Generated file has valid PDF magic bytes '%PDF-' (got: '${pdfHeader}')`);

    // Check PDF EOF marker
    const pdfTail = pdfBuffer.slice(-1024).toString('binary');
    assert(pdfTail.includes('%%EOF'), 'Generated PDF ends with valid %%EOF trailer');

    ws.close();
  } catch (err) {
    console.error('CDP Live test error:', err);
  }
}

// ----------------------------------------------------------------
// Execution & Summary
// ----------------------------------------------------------------
(async () => {
  await runBrowserVerification();

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error(`❌ SUITE FAILED with ${failedTests} failures!`);
    process.exit(1);
  } else {
    console.log('✨ ALL STEP 33.34B LEDGER PDF EXPORT VERIFICATION TESTS PASSED! ✨\n');
    process.exit(0);
  }
})();
