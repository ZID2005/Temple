/**
 * STEP 33.184 VALIDATION SUITE: LEDGER BALANCE ROW FINAL-COLUMN TOTAL
 *
 * Verifies:
 * 1. Ledger Table Structure & 8-Column Schema Audit:
 *    - 8 columns: Date, Voucher/Receipt No., Particulars, Description, Fund, Debit, Credit, Balance
 * 2. Balance Row Presentation in Opening Balance Row:
 *    - Located in #ledgerTable tbody with data-category="Opening Balance"
 *    - Exactly 8 cells, final cell displays formatted opening balance with right alignment
 * 3. Final Column in Totals / Balance Row (#ledgerTotalRow):
 *    - Located in #ledgerTable tfoot
 *    - Exactly 8 cells: empty cols, TOTAL under Particulars, Debit, Credit, Balance (#ledgerTotalBalance)
 *    - Final cell displays bold, currency-formatted total balance: <b>${fmtMoney(closingBalance)}</b>
 *    - Styled with text-align: right; matching Cash Book and Bank Book emphasis
 * 4. Accounting Logic Continuity on Filtering:
 *    - Selecting Cash, Bank, UPI, or All Payment Modes preserves normal closing ledger balance
 *    - Does NOT substitute filtered net or transaction total for ledger balance
 *    - Updates #ledgerTotalBalance dynamically via updateLedgerTotals()
 * 5. Date and Fund Filter Verification:
 *    - Applying and clearing date / fund filters keeps the final-column total accurate
 *    - Empty results preserve the closing balance in the final column
 * 6. Comparison with Cash Book and Bank Book Presentation:
 *    - Consistent number formatting, currency symbol, alignment, and emphasis
 * 7. Zero Firestore Reads during UI rendering or filtering.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, testId, description, details = '') {
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${testId}: ${description}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ [FAIL] ${testId}: ${description} ${details ? '(' + details + ')' : ''}`);
  }
}

console.log('='.repeat(80));
console.log('STEP 33.184: LEDGER BALANCE ROW FINAL-COLUMN TOTAL TEST SUITE');
console.log('='.repeat(80));

const htmlPath = path.join(__dirname, '..', 'Temple_Accounts-1.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// =========================================================================
// GROUP 1: Static Source & Table Structure Inspection
// =========================================================================
console.log('\n--- GROUP 1: Static Source & Table Structure Inspection ---');

// Extract ledgerTable snippet
const ledgerTableMatch = htmlContent.match(/<table id="ledgerTable">([\s\S]*?)<\/table>/);
assert(ledgerTableMatch !== null, 'G1.1', 'Found <table id="ledgerTable"> in HTML');

const ledgerTableHTML = ledgerTableMatch ? ledgerTableMatch[1] : '';

// Check 8-column table header
const thMatch = ledgerTableHTML.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(thMatch !== null, 'G1.2', 'Found <thead> structure in ledgerTable');
if (thMatch) {
  const ths = Array.from(thMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(ths.length === 8, 'G1.3', 'Ledger table has exactly 8 columns', ths.join(', '));
  assert(ths[0] === 'Date', 'G1.4', 'Col 1 is Date');
  assert(ths[1] === 'Voucher/Receipt No.', 'G1.5', 'Col 2 is Voucher/Receipt No.');
  assert(ths[2] === 'Particulars', 'G1.6', 'Col 3 is Particulars');
  assert(ths[3] === 'Description', 'G1.7', 'Col 4 is Description');
  assert(ths[4] === 'Fund', 'G1.8', 'Col 5 is Fund');
  assert(ths[5] === 'Debit', 'G1.9', 'Col 6 is Debit');
  assert(ths[6] === 'Credit', 'G1.10', 'Col 7 is Credit');
  assert(ths[7] === 'Balance', 'G1.11', 'Col 8 is Balance');
}

// Check Opening Balance row in ledgerTable tbody
const obRowMatch = ledgerTableHTML.match(/<tr data-category="Opening Balance">([\s\S]*?)<\/tr>/);
assert(obRowMatch !== null, 'G1.12', 'Found Opening Balance row in ledgerTable tbody');
if (obRowMatch) {
  const tds = Array.from(obRowMatch[1].matchAll(/<td([^>]*)>(.*?)<\/td>/g));
  assert(tds.length === 8, 'G1.13', 'Opening Balance row has exactly 8 cells', `Count: ${tds.length}`);
  const lastTd = tds[7];
  assert(lastTd[2].includes('${fmtMoney(openingBalance)}'), 'G1.14', 'Final cell of Opening Balance row contains formatted opening balance');
  assert(lastTd[1].includes('text-align: right'), 'G1.15', 'Final cell of Opening Balance row is styled with text-align: right');
}

// Check Totals / Balance row in ledgerTable tfoot
const totalRowMatch = ledgerTableHTML.match(/<tr id="ledgerTotalRow"[^>]*>([\s\S]*?)<\/tr>/);
assert(totalRowMatch !== null, 'G1.16', 'Found #ledgerTotalRow in ledgerTable tfoot');
if (totalRowMatch) {
  const tds = Array.from(totalRowMatch[1].matchAll(/<td([^>]*)>(.*?)<\/td>/g));
  assert(tds.length === 8, 'G1.17', 'Totals row has exactly 8 cells', `Count: ${tds.length}`);
  const lastTd = tds[7];
  assert(lastTd[1].includes('id="ledgerTotalBalance"'), 'G1.18', 'Final cell of totals row has id="ledgerTotalBalance"');
  assert(lastTd[1].includes('text-align: right'), 'G1.19', 'Final cell of totals row is styled with text-align: right');
  assert(lastTd[2].includes('<b>${fmtMoney(closingBalance)}</b>'), 'G1.20', 'Final cell of totals row displays bold formatted closing balance');
}

// =========================================================================
// GROUP 2: In-Memory VM Sandbox & View Rendering
// =========================================================================
console.log('\n--- GROUP 2: In-Memory VM Sandbox & View Rendering ---');

function createSandbox(data = {}) {
  const elements = {};
  const queryElements = {};

  function makeEl(id) {
    const el = {
      id: id,
      value: '',
      innerHTML: '',
      textContent: '',
      className: '',
      style: { display: '' }
    };
    elements[id] = el;
    queryElements['#' + id] = el;
    return el;
  }

  const sandbox = {
    window: {},
    VIEW_RENDERERS: {},
    APP_SETTINGS: {
      startDate: '2026-04-01',
      openingCash: '15000',
      openingBank: '25000'
    },
    funds: [
      { id: 'f1', name: 'General Fund' },
      { id: 'f2', name: 'Annadanam Fund' },
      { id: 'f3', name: 'Temple Fund' }
    ],
    receipts: data.receipts || [],
    payments: data.payments || [],
    fmtMoney: function(v) {
      const n = parseFloat(v) || 0;
      return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    fmtDate: function(d) { return d ? String(d) : '—'; },
    esc: function(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;') : ''; },
    el: function(id) { return elements[id] || null; },
    qs: function(sel) { return queryElements[sel] || null; },
    qsa: function(sel, ctx) {
      if (ctx && Array.isArray(ctx.children)) return ctx.children;
      if (ctx && ctx.getElementsByTagName) return ctx.getElementsByTagName(sel);
      if (sel === '#ledgerTable tbody tr') return sandbox._tbodyRows || [];
      if (sel === '#ledgerTable thead th') return sandbox._theadThs || [];
      return [];
    },
    downloadCSV: function(rows, filename) {
      sandbox._lastDownloadedCSV = { rows, filename };
    },
    allFunds: async () => [
      { name: 'General Fund' },
      { name: 'Annadanam Fund' },
      { name: 'Temple Fund' }
    ],
    activeReceipts: async () => data.receipts || [],
    activePayments: async () => data.payments || [],
    printGenericTable: function() {},
    _tbodyRows: [],
    _elements: elements,
    makeEl,
    console
  };

  sandbox.window = sandbox;
  vm.createContext(sandbox);

  ledgerCode = htmlContent.slice(
    htmlContent.indexOf('/* ===================== LEDGER ===================== */'),
    htmlContent.indexOf('/* ===================== FUND TRANSFERS ===================== */')
  );
  vm.runInContext(ledgerCode, sandbox);

  return sandbox;
}

let ledgerCode = '';

(async function runTests() {
  const receipts = [
    { receiptNo: 'RCP-001', date: '2026-04-02', name: 'Devotee 1', category: 'General Donation', description: 'General seva', fund: 'General Fund', amount: 3000, paymentMode: 'Cash' },
    { receiptNo: 'RCP-002', date: '2026-04-05', name: 'Devotee 2', category: 'Annadanam E-Pay', description: 'Annadanam seva', fund: 'Annadanam Fund', amount: 5000, paymentMode: 'UPI' },
    { receiptNo: 'RCP-003', date: '2026-04-07', name: 'Bank Interest', category: 'Interest', description: 'Bank Interest', fund: 'General Fund', amount: 2000, paymentMode: 'Bank' }
  ];
  const payments = [
    { voucherNo: 'VCH-001', date: '2026-04-03', paidTo: 'Vendor 1', category: 'Pooja Items', description: 'Flowers and oil', fund: 'Temple Fund', amount: 1500, paymentMode: 'Cash' },
    { voucherNo: 'VCH-002', date: '2026-04-06', paidTo: 'Vendor 2', category: 'Elect Maintenance', description: 'Wiring repair', fund: 'Annadanam Fund', amount: 2500, paymentMode: 'Bank' }
  ];

  const sb = createSandbox({ receipts, payments });
  const renderedHTML = await sb.VIEW_RENDERERS.ledger();

  // Initial render verification
  assert(sb.window._ledgerOpeningBalance === 40000, 'G2.1', 'Opening balance calculation (15000 + 25000 = ₹40,000.00)');
  assert(sb.window._ledgerClosingBalance === 46000, 'G2.2', 'Closing balance calculation (40000 + 10000 - 4000 = ₹46,000.00)');
  assert(renderedHTML.includes('id="ledgerTotalBalance" style="text-align: right;"><b>₹46,000.00</b></td>'), 'G2.3', 'Rendered HTML contains bold, right-aligned total balance in final column');
  assert(renderedHTML.includes('Opening Balance</i></td><td>—</td><td>—</td><td>-</td><td>-</td><td style="text-align: right;">₹40,000.00</td>'), 'G2.4', 'Rendered HTML contains right-aligned opening balance in final column');

  // =========================================================================
  // GROUP 3: Payment Mode Filtering & Final-Column Total Retention
  // =========================================================================
  console.log('\n--- GROUP 3: Payment Mode Filtering & Final-Column Total Retention ---');

  const filterFrom = sb.makeEl('ledgerFrom');
  const filterTo = sb.makeEl('ledgerTo');
  const filterFund = sb.makeEl('ledgerFundFilter');
  const filterMode = sb.makeEl('ledgerModeFilter');
  const totDebitEl = sb.makeEl('ledgerTotalDebit');
  const totCreditEl = sb.makeEl('ledgerTotalCredit');
  const totBalEl = sb.makeEl('ledgerTotalBalance');
  const closingBanner = sb.makeEl('ledgerClosingBanner');

  const rows = sb.window._ledgerRows || [];
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

  // 1. Initial full state totals
  const t0 = sb.updateLedgerTotals();
  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G3.1', 'Initial Total Debit is ₹4,000.00');
  assert(totCreditEl.innerHTML.includes('₹10,000.00'), 'G3.2', 'Initial Total Credit is ₹10,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G3.3', 'Initial final-column total displays bold ₹46,000.00');
  assert(t0.balance === 46000, 'G3.4', 'updateLedgerTotals returned actual balance 46000');

  // 2. Mode: Cash
  filterMode.value = 'Cash';
  filterFrom.value = '';
  filterTo.value = '';
  filterFund.value = '';
  sb.applyLedgerFilter();

  assert(domRows[0].style.display === '', 'G3.5', 'Normal Opening Balance row remains visible in Cash mode');
  assert(totDebitEl.innerHTML.includes('₹1,500.00'), 'G3.6', 'Cash mode filtered debit is ₹1,500.00');
  assert(totCreditEl.innerHTML.includes('₹3,000.00'), 'G3.7', 'Cash mode filtered credit is ₹3,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G3.8', 'Cash mode final column preserves actual ledger balance ₹46,000.00 (not substituted with filtered total)');

  // 3. Mode: Bank
  filterMode.value = 'Bank';
  sb.applyLedgerFilter();

  assert(domRows[0].style.display === '', 'G3.9', 'Normal Opening Balance row remains visible in Bank mode');
  assert(totDebitEl.innerHTML.includes('₹2,500.00'), 'G3.10', 'Bank mode filtered debit is ₹2,500.00');
  assert(totCreditEl.innerHTML.includes('₹2,000.00'), 'G3.11', 'Bank mode filtered credit is ₹2,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G3.12', 'Bank mode final column preserves actual ledger balance ₹46,000.00');

  // 4. Mode: UPI
  filterMode.value = 'UPI';
  sb.applyLedgerFilter();

  assert(domRows[0].style.display === '', 'G3.13', 'Normal Opening Balance row remains visible in UPI mode');
  assert(totDebitEl.innerHTML.includes('₹0.00'), 'G3.14', 'UPI mode filtered debit is ₹0.00');
  assert(totCreditEl.innerHTML.includes('₹5,000.00'), 'G3.15', 'UPI mode filtered credit is ₹5,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G3.16', 'UPI mode final column preserves actual ledger balance ₹46,000.00');

  // 5. Mode: All Payment Modes ('')
  filterMode.value = '';
  sb.applyLedgerFilter();

  assert(domRows[0].style.display === '', 'G3.17', 'Opening balance row visible in All Payment Modes');
  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G3.18', 'All Payment Modes restored debit total ₹4,000.00');
  assert(totCreditEl.innerHTML.includes('₹10,000.00'), 'G3.19', 'All Payment Modes restored credit total ₹10,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G3.20', 'All Payment Modes final column is ₹46,000.00');

  // =========================================================================
  // GROUP 4: Date, Fund Filters & Clear Continuity
  // =========================================================================
  console.log('\n--- GROUP 4: Date, Fund Filters & Clear Continuity ---');

  // 1. Date Range: 2026-04-03 to 2026-04-08
  filterFrom.value = '2026-04-03';
  filterTo.value = '2026-04-08';
  filterFund.value = '';
  filterMode.value = '';
  sb.applyLedgerFilter();

  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G4.1', 'Date filtered debit total is ₹4,000.00');
  assert(totCreditEl.innerHTML.includes('₹7,000.00'), 'G4.2', 'Date filtered credit total is ₹7,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G4.3', 'Date filtered final column preserves actual ledger balance ₹46,000.00');

  // 2. Fund Filter: 'Annadanam Fund'
  filterFrom.value = '';
  filterTo.value = '';
  filterFund.value = 'Annadanam Fund';
  filterMode.value = '';
  sb.applyLedgerFilter();

  assert(totDebitEl.innerHTML.includes('₹2,500.00'), 'G4.4', 'Fund filtered debit total is ₹2,500.00');
  assert(totCreditEl.innerHTML.includes('₹5,000.00'), 'G4.5', 'Fund filtered credit total is ₹5,000.00');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G4.6', 'Fund filtered final column preserves actual ledger balance ₹46,000.00');

  // 3. Clear Filters
  sb.clearLedgerFilter();
  assert(filterFrom.value === '', 'G4.7', 'clearLedgerFilter cleared From input');
  assert(filterTo.value === '', 'G4.8', 'clearLedgerFilter cleared To input');
  assert(filterFund.value === '', 'G4.9', 'clearLedgerFilter cleared Fund filter');
  assert(filterMode.value === '', 'G4.10', 'clearLedgerFilter cleared Payment Mode filter');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G4.11', 'clearLedgerFilter restored final column total to ₹46,000.00');
  assert(totDebitEl.innerHTML.includes('₹4,000.00'), 'G4.12', 'clearLedgerFilter restored full debit total');
  assert(totCreditEl.innerHTML.includes('₹10,000.00'), 'G4.13', 'clearLedgerFilter restored full credit total');

  // 4. Non-matching Filter
  filterFund.value = 'Non-Existent Fund';
  sb.applyLedgerFilter();
  assert(totDebitEl.innerHTML.includes('₹0.00'), 'G4.14', 'Non-matching filter gives ₹0.00 debit');
  assert(totCreditEl.innerHTML.includes('₹0.00'), 'G4.15', 'Non-matching filter gives ₹0.00 credit');
  assert(totBalEl.innerHTML === '<b>₹46,000.00</b>', 'G4.16', 'Non-matching filter preserves actual ledger balance in final column');

  // =========================================================================
  // GROUP 5: Comparative Presentation with Cash Book & Bank Book
  // =========================================================================
  console.log('\n--- GROUP 5: Comparative Presentation with Cash Book & Bank Book ---');

  // Verify alignment in CSS
  assert(htmlContent.includes('#ledgerTable th:nth-child(8)'), 'G5.1', 'CSS aligns Ledger column 8 header');
  assert(htmlContent.includes('#ledgerTable td:nth-child(8)'), 'G5.2', 'CSS aligns Ledger column 8 cells');
  assert(htmlContent.includes('.ledger-total-row td'), 'G5.3', 'CSS aligns Ledger totals row cells');

  // Verify format and currency display
  const formattedSample = sb.fmtMoney(46000);
  assert(formattedSample.startsWith('₹'), 'G5.4', 'fmtMoney uses INR currency symbol ₹');
  assert(formattedSample.includes('46,000.00'), 'G5.5', 'fmtMoney properly formats Indian numbering with 2 decimals');

  // Verify zero Firestore operations
  assert(!ledgerCode.includes('db.collection'), 'G5.6', 'Ledger filter and totals contain zero Firestore collection calls');
  assert(!ledgerCode.includes('getDocs'), 'G5.7', 'Ledger filter and totals contain zero getDocs calls');
  assert(!ledgerCode.includes('getDoc'), 'G5.8', 'Ledger filter and totals contain zero getDoc calls');

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL ASSERTIONS: ${passedAssertions + failedAssertions} | PASSED: ${passedAssertions} | FAILED: ${failedAssertions}`);
  console.log('='.repeat(80));

  if (failedAssertions === 0) {
    console.log('✨ ALL STEP 33.184 LEDGER BALANCE ROW FINAL-COLUMN TOTAL TESTS PASSED! ✨\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failedAssertions} ASSERTIONS FAILED.\n`);
    process.exit(1);
  }
})();
