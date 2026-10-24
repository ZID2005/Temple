/**
 * STEP 33.183 VALIDATION SUITE: LEDGER BALANCE ROW, TOTALS, AND PAYMENT MODE FILTERING
 *
 * Verifies:
 * 1. Ledger Table Schema: 8 columns (Date, Voucher/Receipt No., Particulars, Description, Fund, Debit, Credit, Balance).
 * 2. Opening Balance row in tbody with proper accounting opening balance (openingCash + openingBank).
 * 3. Running Balance calculation per row (credit - debit running continuity).
 * 4. Closing balance banner at top showing normal closing ledger balance.
 * 5. Payment mode filter dropdown (Cash, Bank, UPI, All Payment Modes).
 * 6. Opening Balance row remains visible when Cash, Bank, UPI, or All Payment Modes is selected.
 * 7. Balance column retains original chronological running balance regardless of filtering.
 * 8. Totals row recalculation accurately sums visible Debit and Credit.
 * 9. Filtered totals clearly distinguished from normal closing balance in banner (never replacing or resetting it).
 * 10. Date and Fund filtering stability.
 * 11. Clear Filters restores default view, inputs, and totals.
 * 12. Empty state handling when no transactions match.
 * 13. CSV and PDF export compatibility without regressions.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_FILE = path.resolve('d:/Temple/Temple_Accounts-1.html');
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, testId, message, details = '') {
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${testId}: ${message}${details ? ' (' + details + ')' : ''}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ [FAIL] ${testId}: ${message}${details ? ' — ' + details : ''}`);
  }
}

console.log('='.repeat(80));
console.log('STEP 33.183: LEDGER BALANCE ROW & ACCOUNTING STANDARDIZATION TEST SUITE');
console.log('='.repeat(80));

// =========================================================================
// GROUP 1: Static Source & Table Schema Audit
// =========================================================================
console.log('\n--- GROUP 1: Static Source & Table Schema Audit ---');

assert(htmlContent.includes('id="ledgerModeFilter"'), 'G1.1', 'Payment mode filter dropdown exists in Ledger toolbar');
assert(htmlContent.includes('id="ledgerClosingBanner"'), 'G1.2', 'Closing ledger balance banner element exists');
assert(htmlContent.includes('data-category="Opening Balance"'), 'G1.3', 'Opening Balance row markup defined with data-category');
assert(htmlContent.includes('<tfoot id="ledgerTFoot">'), 'G1.4', 'Semantic <tfoot id="ledgerTFoot"> exists');
assert(htmlContent.includes('id="ledgerTotalRow"'), 'G1.5', 'Totals row #ledgerTotalRow exists');
assert(htmlContent.includes('id="ledgerTotalDebit"'), 'G1.6', '#ledgerTotalDebit cell exists');
assert(htmlContent.includes('id="ledgerTotalCredit"'), 'G1.7', '#ledgerTotalCredit cell exists');
assert(htmlContent.includes('id="ledgerTotalBalance"'), 'G1.8', '#ledgerTotalBalance cell exists');

// Verify 8-column table header
const thMatch = htmlContent.match(/<table id="ledgerTable">\s*<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(thMatch !== null, 'G1.9', 'Found <table id="ledgerTable"> <thead> structure');
if (thMatch) {
  const ths = Array.from(thMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(ths.length === 8, 'G1.10', 'Ledger table has exactly 8 columns', ths.join(', '));
  assert(ths[0] === 'Date', 'G1.11', 'Col 1 is Date');
  assert(ths[1] === 'Voucher/Receipt No.', 'G1.12', 'Col 2 is Voucher/Receipt No.');
  assert(ths[2] === 'Particulars', 'G1.13', 'Col 3 is Particulars');
  assert(ths[3] === 'Description', 'G1.14', 'Col 4 is Description');
  assert(ths[4] === 'Fund', 'G1.15', 'Col 5 is Fund');
  assert(ths[5] === 'Debit', 'G1.16', 'Col 6 is Debit');
  assert(ths[6] === 'Credit', 'G1.17', 'Col 7 is Credit');
  assert(ths[7] === 'Balance', 'G1.18', 'Col 8 is Balance');
}

// Verify CSS right-alignment for columns 6, 7, 8
assert(htmlContent.includes('#ledgerTable th:nth-child(8)'), 'G1.19', 'CSS aligns Ledger column 8 (Balance)');
assert(htmlContent.includes('#ledgerTable td:nth-child(8)'), 'G1.20', 'CSS aligns Ledger column 8 td');

// =========================================================================
// GROUP 2: In-Memory VM Sandbox Setup
// =========================================================================
console.log('\n--- GROUP 2: In-Memory VM Sandbox Setup ---');

const mockSettings = {
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 12000.00,
  openingBank: 28000.00,
  templeName: 'Sree Krishna Temple'
};

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
      outerHTML: '',
      children: [],
      value: '',
      appendChild(child) { this.children.push(child); return child; },
      remove() { this._removed = true; this.style.display = 'none'; }
    };
    elements[id] = elObj;
    return elObj;
  }

  const sandbox = {
    window: { APP_SETTINGS: mockSettings },
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => makeEl('', tag),
      querySelectorAll: (sel) => {
        if (sel === '#ledgerTable tbody tr') return sandbox._tbodyRows || [];
        return [];
      }
    },
    el: (id) => elements[id] || null,
    qs: (sel) => elements['ledgerEmptyRow'] || null,
    qsa: (sel, root) => {
      if (root && sel === 'td') return root.children || [];
      if (sel === '#ledgerTable tbody tr') return sandbox._tbodyRows || [];
      if (sel === '#ledgerTable thead th') return [
        { textContent: 'Date' }, { textContent: 'Voucher/Receipt No.' }, { textContent: 'Particulars' },
        { textContent: 'Description' }, { textContent: 'Fund' }, { textContent: 'Debit' },
        { textContent: 'Credit' }, { textContent: 'Balance' }
      ];
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
    esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    todayISO: () => '2026-04-15',
    downloadCSV: (rows, filename) => { sandbox._lastCSV = { rows, filename }; },
    VIEW_RENDERERS: {},
    allFunds: async () => [{ name: 'General Fund' }, { name: 'Annadanam Fund' }],
    activeReceipts: async () => initialData.receipts || [],
    activePayments: async () => initialData.payments || [],
    _tbodyRows: [],
    _elements: elements,
    makeEl,
    console
  };

  vm.createContext(sandbox);

  const startIdx = htmlContent.indexOf('/* ===================== LEDGER ===================== */');
  const endIdx = htmlContent.indexOf('/* ===================== FUND TRANSFERS ===================== */');
  const ledgerCode = htmlContent.slice(startIdx, endIdx);
  vm.runInContext(ledgerCode, sandbox);

  return sandbox;
}

// =========================================================================
// GROUP 3: Accounting Integrity & Running Balance Calculations
// =========================================================================
console.log('\n--- GROUP 3: Accounting Integrity & Running Balance Calculations ---');

(async function runGroup3() {
  const receipts = [
    { receiptNo: 'R01', date: '2026-04-02', name: 'Devotee 1', category: 'Archana', description: 'Special archana', fund: 'General Fund', amount: 3000, paymentMode: 'Cash' },
    { receiptNo: 'R02', date: '2026-04-05', name: 'Devotee 2', category: 'Annadanam', description: 'Rice donation', fund: 'Annadanam Fund', amount: 5000, paymentMode: 'UPI' },
    { receiptNo: 'R03', date: '2026-04-10', name: 'Devotee 3', category: 'Kanikka', description: '', fund: 'General Fund', amount: 2000, paymentMode: 'Bank' }
  ];
  const payments = [
    { voucherNo: 'V01', date: '2026-04-03', paidTo: 'Priest', category: 'Remuneration', description: 'Pooja fees', fund: 'General Fund', amount: 1500, paymentMode: 'Cash' },
    { voucherNo: 'V02', date: '2026-04-08', paidTo: 'Merchant', category: 'Provisions', description: 'Vegetables', fund: 'Annadanam Fund', amount: 2500, paymentMode: 'Bank' }
  ];

  const sb = createSandbox({ receipts, payments });
  const html = await sb.VIEW_RENDERERS.ledger();

  // 1. Opening Balance Calculation (Cash + Bank = 12000 + 28000 = 40000)
  assert(sb.window._ledgerOpeningBalance === 40000, 'G3.1', 'Opening balance equals openingCash + openingBank', '₹40,000.00');
  assert(html.includes('₹40,000.00'), 'G3.2', 'Opening balance rendered in table');

  // 2. Chronological Running Balance Verification:
  // Initial: 40000
  // 04-02: R01 (+3000) -> 43000
  // 04-03: V01 (-1500) -> 41500
  // 04-05: R02 (+5000) -> 46500
  // 04-08: V02 (-2500) -> 44000
  // 04-10: R03 (+2000) -> 46000
  const rows = sb.window._ledgerRows;
  assert(rows.length === 5, 'G3.3', 'Combined rows count is 5', `length: ${rows.length}`);
  assert(rows[0].date === '2026-04-02' && rows[0].balance === 43000, 'G3.4', 'Row 1 balance correct (43000)');
  assert(rows[1].date === '2026-04-03' && rows[1].balance === 41500, 'G3.5', 'Row 2 balance correct (41500)');
  assert(rows[2].date === '2026-04-05' && rows[2].balance === 46500, 'G3.6', 'Row 3 balance correct (46500)');
  assert(rows[3].date === '2026-04-08' && rows[3].balance === 44000, 'G3.7', 'Row 4 balance correct (44000)');
  assert(rows[4].date === '2026-04-10' && rows[4].balance === 46000, 'G3.8', 'Row 5 balance correct (46000)');

  // 3. Closing Balance Invariant
  assert(sb.window._ledgerClosingBalance === 46000, 'G3.9', 'Closing balance is 46000', '₹46,000.00');
  assert(html.includes('Closing Ledger Balance: ₹46,000.00'), 'G3.10', 'Closing ledger banner displays ₹46,000.00');

  // 4. Totals row verification (Total Debit: 4000, Total Credit: 10000)
  assert(html.includes('₹4,000.00'), 'G3.11', 'Total Debit ₹4,000.00 rendered');
  assert(html.includes('₹10,000.00'), 'G3.12', 'Total Credit ₹10,000.00 rendered');

// =========================================================================
// GROUP 4: Payment Mode Filtering & Balance Row Display
// =========================================================================
  console.log('\n--- GROUP 4: Payment Mode Filtering & Balance Row Display ---');

  // Build simulated DOM elements
  const filterFrom = sb.makeEl('ledgerFrom');
  const filterTo = sb.makeEl('ledgerTo');
  const filterFund = sb.makeEl('ledgerFundFilter');
  const filterMode = sb.makeEl('ledgerModeFilter');
  const totDebitEl = sb.makeEl('ledgerTotalDebit');
  const totCreditEl = sb.makeEl('ledgerTotalCredit');
  const totBalEl = sb.makeEl('ledgerTotalBalance');
  const closingBanner = sb.makeEl('ledgerClosingBanner');

  const domRows = [
    { id: 'ob', dataset: { category: 'Opening Balance' }, style: { display: '' } },
    ...rows.map(r => ({
      id: '',
      dataset: { date: r.date, fund: r.fund, debit: r.debit, credit: r.credit, paymentMode: r.paymentMode },
      style: { display: '' },
      balance: r.balance
    }))
  ];
  sb._tbodyRows = domRows;

  // 1. Filter by Mode: 'Cash'
  filterMode.value = 'Cash';
  filterFrom.value = '';
  filterTo.value = '';
  filterFund.value = '';
  sb.applyLedgerFilter();

  // Opening balance row MUST be visible!
  assert(domRows[0].style.display === '', 'G4.1', 'Normal Opening Balance row remains visible when Cash mode is selected');
  assert(domRows[1].style.display === '', 'G4.2', 'Cash receipt row visible');
  assert(domRows[2].style.display === '', 'G4.3', 'Cash payment row visible');
  assert(domRows[3].style.display === 'none', 'G4.4', 'UPI row hidden in Cash mode');
  assert(domRows[4].style.display === 'none', 'G4.5', 'Bank payment hidden in Cash mode');
  assert(domRows[5].style.display === 'none', 'G4.6', 'Bank receipt hidden in Cash mode');

  // Check Totals: Debit = 1500, Credit = 3000
  assert(totDebitEl.innerHTML.includes('₹1,500.00'), 'G4.7', 'Cash filtered debit total is ₹1,500.00');
  assert(totCreditEl.innerHTML.includes('₹3,000.00'), 'G4.8', 'Cash filtered credit total is ₹3,000.00');

  // Check Banner: Shows normal closing balance AND clearly distinguished filtered totals
  assert(closingBanner.innerHTML.includes('Closing Ledger Balance: <b>₹46,000.00</b>'), 'G4.9', 'Normal ledger balance preserved in banner when filtered');
  assert(closingBanner.innerHTML.includes('Filtered Totals: Debit ₹1,500.00 | Credit ₹3,000.00'), 'G4.10', 'Filtered totals clearly distinguished in banner');

  // 2. Filter by Mode: 'Bank'
  filterMode.value = 'Bank';
  sb.applyLedgerFilter();
  assert(domRows[0].style.display === '', 'G4.11', 'Normal Opening Balance row remains visible when Bank mode is selected');
  assert(domRows[4].style.display === '', 'G4.12', 'Bank payment row visible');
  assert(domRows[5].style.display === '', 'G4.13', 'Bank receipt row visible');
  assert(totDebitEl.innerHTML.includes('₹2,500.00'), 'G4.14', 'Bank filtered debit total is ₹2,500.00');
  assert(totCreditEl.innerHTML.includes('₹2,000.00'), 'G4.15', 'Bank filtered credit total is ₹2,000.00');

  // 3. Filter by Mode: 'UPI'
  filterMode.value = 'UPI';
  sb.applyLedgerFilter();
  assert(domRows[0].style.display === '', 'G4.16', 'Normal Opening Balance row remains visible when UPI mode is selected');
  assert(domRows[3].style.display === '', 'G4.17', 'UPI receipt row visible');
  assert(totDebitEl.innerHTML.includes('₹0.00'), 'G4.18', 'UPI filtered debit total is ₹0.00');
  assert(totCreditEl.innerHTML.includes('₹5,000.00'), 'G4.19', 'UPI filtered credit total is ₹5,000.00');

  // 4. Filter by All Payment Modes ('')
  filterMode.value = '';
  sb.applyLedgerFilter();
  assert(domRows[0].style.display === '', 'G4.20', 'Opening Balance row visible when All Payment Modes selected');
  assert(domRows.every(r => r.style.display === ''), 'G4.21', 'All transaction rows visible in All Payment Modes view');
  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G4.22', 'Full debit total ₹4,000.00 restored');
  assert(totCreditEl.innerHTML.includes('₹10,000.00'), 'G4.23', 'Full credit total ₹10,000.00 restored');
  assert(closingBanner.innerHTML === 'Closing Ledger Balance: ₹46,000.00', 'G4.24', 'Unfiltered banner shows clean closing balance');

// =========================================================================
// GROUP 5: Date, Fund, and Clear Filters Verification
// =========================================================================
  console.log('\n--- GROUP 5: Date, Fund, and Clear Filters Verification ---');

  // 1. Date Range: 2026-04-03 to 2026-04-08
  filterFrom.value = '2026-04-03';
  filterTo.value = '2026-04-08';
  filterFund.value = '';
  filterMode.value = '';
  sb.applyLedgerFilter();

  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G5.1', 'Date filtered debit total is ₹4,000.00');
  assert(totCreditEl.innerHTML.includes('₹5,000.00'), 'G5.2', 'Date filtered credit total is ₹5,000.00');
  assert(domRows[1].style.display === 'none', 'G5.3', 'Row before From date is hidden');
  assert(domRows[5].style.display === 'none', 'G5.4', 'Row after To date is hidden');

  // 2. Fund Filter: 'Annadanam Fund'
  filterFrom.value = '';
  filterTo.value = '';
  filterFund.value = 'Annadanam Fund';
  sb.applyLedgerFilter();
  assert(totDebitEl.innerHTML.includes('₹2,500.00'), 'G5.5', 'Annadanam Fund debit total is ₹2,500.00');
  assert(totCreditEl.innerHTML.includes('₹5,000.00'), 'G5.6', 'Annadanam Fund credit total is ₹5,000.00');

  // 3. Clear Filters
  sb.clearLedgerFilter();
  assert(filterFrom.value === '', 'G5.7', 'clearLedgerFilter cleared From date');
  assert(filterTo.value === '', 'G5.8', 'clearLedgerFilter cleared To date');
  assert(filterFund.value === '', 'G5.9', 'clearLedgerFilter cleared Fund filter');
  assert(filterMode.value === '', 'G5.10', 'clearLedgerFilter cleared Payment Mode filter');
  assert(domRows.every(r => r.style.display === ''), 'G5.11', 'clearLedgerFilter restored visibility of all rows');
  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G5.12', 'clearLedgerFilter restored full debit total');
  assert(totCreditEl.innerHTML.includes('₹10,000.00'), 'G5.13', 'clearLedgerFilter restored full credit total');

  // 4. Non-matching filter (empty state)
  filterFund.value = 'NonExistentFund';
  sb.applyLedgerFilter();
  assert(totDebitEl.innerHTML.includes('₹0.00'), 'G5.14', 'Non-matching filter gives ₹0.00 debit');
  assert(totCreditEl.innerHTML.includes('₹0.00'), 'G5.15', 'Non-matching filter gives ₹0.00 credit');

// =========================================================================
// GROUP 6: CSV & PDF Export Compatibility
// =========================================================================
  console.log('\n--- GROUP 6: CSV & PDF Export Compatibility ---');

  // 1. CSV Export
  sb.clearLedgerFilter();
  sb.exportLedgerCSV();
  assert(sb._lastCSV && sb._lastCSV.filename === 'Ledger', 'G6.1', 'exportLedgerCSV triggered downloadCSV');
  const csvRows = sb._lastCSV.rows;
  assert(csvRows[0].includes('Balance'), 'G6.2', 'CSV export header contains Balance column');
  assert(csvRows.length === 7, 'G6.3', 'CSV contains header + opening balance + 5 transactions = 7 rows', `count: ${csvRows.length}`);

  // 2. PDF Filter Records
  filterMode.value = 'Cash';
  const pdfRecords = sb.getFilteredLedgerRecords();
  assert(pdfRecords.length === 2, 'G6.4', 'getFilteredLedgerRecords returned 2 records for Cash mode');
  assert(pdfRecords.every(r => r.paymentMode === 'Cash'), 'G6.5', 'All PDF records belong to Cash mode');

  filterMode.value = '';

// =========================================================================
// SUMMARY
// =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL ASSERTIONS: ${passedAssertions + failedAssertions} | PASSED: ${passedAssertions} | FAILED: ${failedAssertions}`);
  console.log('='.repeat(80));

  if (failedAssertions > 0) {
    console.error('❌ SUITE FAILED!');
    process.exit(1);
  } else {
    console.log('✨ ALL STEP 33.183 LEDGER BALANCE ROW VERIFICATION TESTS PASSED! ✨\n');
  }
})();
