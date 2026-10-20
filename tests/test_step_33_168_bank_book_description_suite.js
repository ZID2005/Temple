/**
 * tests/test_step_33_168_bank_book_description_suite.js
 * Comprehensive automated regression suite for:
 * STEP 33.168 — Add Description Column to Bank Book Table
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.168: ADD DESCRIPTION COLUMN TO BANK BOOK TABLE TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const BACKUP_FILE = path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_168_BankBookDescriptionColumn_Backup_20261021_001000.html');

const PRE_CHANGE_HASH = '4A4159CFFE56771C2D6B6522DCEA085380419FA520AAA8A894568CB4B3F75599';
const PRE_CHANGE_SIZE = 1224246;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, description, details = '') {
  totalTests++;
  const passed = !!condition;
  if (passed) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testId}: ${description}${details ? ' (' + details + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}${details ? ' | ' + details : ''}`);
  }
  testResults.push({ id: testId, description, status: passed ? 'PASS' : 'FAIL', details });
}

// Read HTML content
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

// =========================================================================
// GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- GROUP 1: Cryptographic Invariants & Backup Verification ---');

const backupBuf = fs.readFileSync(BACKUP_FILE);
const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();

assert(backupBuf.length === PRE_CHANGE_SIZE, 'G1.1', 'Backup file size matches pre-change baseline byte-for-byte', `${backupBuf.length} bytes`);
assert(backupHash === PRE_CHANGE_HASH, 'G1.2', 'Backup SHA-256 matches pre-change baseline hash exactly', backupHash);

const postBuf = fs.readFileSync(HTML_FILE);
const postHash = crypto.createHash('sha256').update(postBuf).digest('hex').toUpperCase();

assert(postBuf.length > PRE_CHANGE_SIZE, 'G1.3', 'Post-change file reflects surgical byte additions', `Size: ${postBuf.length} bytes (delta: +${postBuf.length - PRE_CHANGE_SIZE})`);
assert(postHash !== PRE_CHANGE_HASH, 'G1.4', 'Post-change hash updated', postHash);

// =========================================================================
// GROUP 2: CSS Rules and Tabular Numeric Alignment
// =========================================================================
console.log('\n--- GROUP 2: CSS Rules and Tabular Alignment ---');

const hasNthChild456 = htmlContent.includes('#bankBookTable th:nth-child(4)') &&
  htmlContent.includes('#bankBookTable td:nth-child(4)') &&
  htmlContent.includes('#bankBookTable th:nth-child(5)') &&
  htmlContent.includes('#bankBookTable td:nth-child(5)') &&
  htmlContent.includes('#bankBookTable th:nth-child(6)') &&
  htmlContent.includes('#bankBookTable td:nth-child(6)');
assert(hasNthChild456, 'G2.1', '#bankBookTable Deposit, Withdrawal, Balance right-aligned at nth-child(4..6)');

// In tabular-nums right alignment, child(3) must NOT be present
const tabNumsSection = htmlContent.match(/#cashBookTable td:nth-child\(8\)[\s\S]*?text-align:\s*right;[\s\S]*?font-variant-numeric:\s*tabular-nums;/);
const oldNthChild3InTabNums = tabNumsSection && (tabNumsSection[0].includes('#bankBookTable th:nth-child(3)') || tabNumsSection[0].includes('#bankBookTable td:nth-child(3)'));
assert(!oldNthChild3InTabNums, 'G2.2', 'Old #bankBookTable nth-child(3) removed from numeric right-alignment');

const hasDescWrapping = htmlContent.includes('#bankBookTable th:nth-child(3)') && htmlContent.includes('#bankBookTable td:nth-child(3)');
assert(hasDescWrapping, 'G2.3', '#bankBookTable Description column (col 3) included in text-wrapping & min/max width rule');

// =========================================================================
// GROUP 3: Table Header & Column Schema
// =========================================================================
console.log('\n--- GROUP 3: Table Header & Column Schema ---');

// Extract bankBookTable thead
const theadMatch = htmlContent.match(/<table id="bankBookTable">\s*<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(theadMatch !== null, 'G3.1', 'Found <table id="bankBookTable"> <thead> structure');

if (theadMatch) {
  const thMatches = Array.from(theadMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(thMatches.length === 6, 'G3.2', `bankBookTable has exactly 6 columns (found ${thMatches.length})`, thMatches.join(', '));
  assert(thMatches[0] === 'Date', 'G3.3', 'Column 1 is Date');
  assert(thMatches[1] === 'Particulars', 'G3.4', 'Column 2 is Particulars');
  assert(thMatches[2] === 'Description', 'G3.5', 'Column 3 is Description (positioned immediately after Particulars and before Deposit)');
  assert(thMatches[3] === 'Deposit', 'G3.6', 'Column 4 is Deposit');
  assert(thMatches[4] === 'Withdrawal', 'G3.7', 'Column 5 is Withdrawal');
  assert(thMatches[5] === 'Balance', 'G3.8', 'Column 6 is Balance');
}

// =========================================================================
// GROUP 4: Opening Balance & TFoot Schema
// =========================================================================
console.log('\n--- GROUP 4: Opening Balance Row & TFoot Totals Schema ---');

const tbodyMatch = htmlContent.match(/<table id="bankBookTable">[\s\S]*?<tbody>\s*<tr>([\s\S]*?)<\/tr>/);
assert(tbodyMatch !== null, 'G4.1', 'Found opening balance row in <tbody>');
if (tbodyMatch) {
  const opCells = Array.from(tbodyMatch[1].matchAll(/<td>([\s\S]*?)<\/td>/g)).map(m => m[1].trim());
  assert(opCells.length === 6, 'G4.2', `Opening Balance row has exactly 6 cells (found ${opCells.length})`);
  assert(opCells[0].includes('startDate'), 'G4.3', 'Opening Balance col 1 contains startDate');
  assert(opCells[1].includes('Opening Balance'), 'G4.4', 'Opening Balance col 2 contains Opening Balance text');
  assert(opCells[2] === '—', 'G4.5', 'Opening Balance col 3 (Description) displays em-dash "—"');
  assert(opCells[3] === '-', 'G4.6', 'Opening Balance col 4 (Deposit) displays "-"');
  assert(opCells[4] === '-', 'G4.7', 'Opening Balance col 5 (Withdrawal) displays "-"');
  assert(opCells[5].includes('openingBank'), 'G4.8', 'Opening Balance col 6 (Balance) contains openingBank balance');
}

const tfootMatch = htmlContent.match(/<tfoot id="bankBookTFoot">\s*<tr id="bankBookTotalRow"[\s\S]*?>([\s\S]*?)<\/tr>\s*<\/tfoot>/);
assert(tfootMatch !== null, 'G4.9', 'Found <tfoot id="bankBookTFoot"> totals row structure');
if (tfootMatch) {
  const tfCells = Array.from(tfootMatch[1].matchAll(/<td([\s\S]*?)>([\s\S]*?)<\/td>/g));
  assert(tfCells.length === 6, 'G4.10', `TFoot row has exactly 6 cells (found ${tfCells.length})`);
  assert(tfCells[0][2].includes('TOTAL'), 'G4.11', 'TFoot col 1 is TOTAL label');
  assert(tfCells[1][2].includes('—'), 'G4.12', 'TFoot col 2 is "—" (Particulars)');
  assert(tfCells[2][2].includes('—'), 'G4.13', 'TFoot col 3 is "—" (Description)');
  assert(tfCells[3][1].includes('id="bankBookTotalDeposit"'), 'G4.14', 'TFoot col 4 has id="bankBookTotalDeposit"');
  assert(tfCells[4][1].includes('id="bankBookTotalWithdrawal"'), 'G4.15', 'TFoot col 5 has id="bankBookTotalWithdrawal"');
  assert(tfCells[5][2].includes('—'), 'G4.16', 'TFoot col 6 is "—" (Balance)');
}

// =========================================================================
// GROUP 5: In-Memory VM Sandbox Data Rendering Across All Transaction Types
// =========================================================================
console.log('\n--- GROUP 5: In-Memory VM Sandbox Data Rendering Across All Transaction Types ---');

// Extract Bank Book implementation block for sandbox execution
const startIdx = htmlContent.indexOf('/* ===================== CASH BOOK / BANK BOOK ===================== */');
const endIdx = htmlContent.indexOf('/* ===================== LEDGER ===================== */');
const bankBookSource = htmlContent.substring(startIdx, endIdx);

const mockSettings = {
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingBank: 50000.00,
  openingCash: 20000.00,
  templeName: 'Sree Bhagavathi Temple'
};

const sandbox = {
  window: {
    APP_SETTINGS: mockSettings,
    billingAllRecords: [],
    print: () => {}
  },
  document: {
    getElementById: (id) => sandbox._elements[id] || null,
    querySelectorAll: (sel) => sandbox._queryAll(sel)
  },
  el: (id) => sandbox._elements[id] || null,
  qs: (sel) => sandbox._queryOne(sel),
  qsa: (sel) => sandbox._queryAll(sel),
  fmtMoney: (n) => {
    const s = mockSettings;
    const sym = (s && s.currencySymbol) || '₹';
    const v = parseFloat(n) || 0;
    return sym + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  fmtDate: (iso) => {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  },
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  VIEW_RENDERERS: {},
  _elements: {},
  _queryAll: () => [],
  _queryOne: () => null,
  _bankBookRows: [],
  console
};

vm.createContext(sandbox);

try {
  vm.runInContext(bankBookSource, sandbox);
  assert(typeof sandbox.buildBankBookRows === 'function', 'G5.1', 'buildBankBookRows executed without syntax errors');
  assert(typeof sandbox.VIEW_RENDERERS.bankbook === 'function', 'G5.2', 'VIEW_RENDERERS.bankbook defined in sandbox');
} catch (err) {
  assert(false, 'G5.1', 'Sandbox initialization failed', err.message);
}

async function runSandboxTest() {
  sandbox.window.billingAllRecords = [
    {
      id: 99,
      firestoreId: 'bill_99',
      receiptNo: 'BILL-0099',
      item: 'Palpayasam',
      quantity: 3,
      star: 'Aswathi',
      totalAmount: 450
    }
  ];

  sandbox.activeReceipts = async () => [
    { id: 1, receiptNo: 'R-101', name: 'Devotee One', paymentMode: 'Bank', amount: 1000, date: '2026-04-02', description: 'Neyyvilakku for health', voided: false },
    { id: 2, receiptNo: 'R-102', name: 'Devotee Two', paymentMode: 'UPI', amount: 500, date: '2026-04-03', description: '', voided: false },
    { id: 3, receiptNo: 'R-103', name: 'Devotee Three', paymentMode: 'Bank', amount: 1500, date: '2026-04-04', source: 'billing', billingFirestoreId: 'bill_30', description: 'Archana | Star: Makam', voided: false },
    { id: 4, receiptNo: 'R-104', name: 'Devotee Four', paymentMode: 'UPI', amount: 450, date: '2026-04-05', source: 'billing', billingFirestoreId: 'bill_99', description: '', voided: false },
    { id: 5, receiptNo: 'R-105', name: 'Devotee Five', paymentMode: 'Bank', amount: 200, date: '2026-04-06', description: '<script>alert("XSS")</script> & "Special"', voided: false },
    { id: 6, receiptNo: 'R-106', name: 'Devotee Six', paymentMode: 'Cash', amount: 300, date: '2026-04-07', description: 'Cash offering', voided: false },
    { id: 7, receiptNo: 'R-107', name: 'Devotee Seven', paymentMode: 'Bank', amount: 9999, date: '2026-04-08', description: 'Voided offering', voided: true }
  ];

  sandbox.activePayments = async () => [
    { id: 1, voucherNo: 'V-001', paidTo: 'Kerala Electricals', paymentMode: 'Bank', amount: 2500, date: '2026-04-03', description: 'Temple lighting cables', voided: false },
    { id: 2, voucherNo: 'V-002', paidTo: 'Pooja Stores', paymentMode: 'UPI', amount: 1200, date: '2026-04-05', description: null, voided: false },
    { id: 3, voucherNo: 'V-003', paidTo: 'Cash Vendor', paymentMode: 'Cash', amount: 800, date: '2026-04-06', description: 'Cash purchase', voided: false },
    { id: 4, voucherNo: 'V-004', paidTo: 'Voided Payee', paymentMode: 'Bank', amount: 8888, date: '2026-04-07', description: 'Voided payment', voided: true }
  ];

  sandbox.allTransfers = async () => [
    { id: 1, fromAcc: 'Cash', toAcc: 'Bank', amount: 8000, date: '2026-04-04', mode: 'Cash', reason: 'Hundi deposit', description: 'Hundi collections for April', voided: false },
    { id: 2, fromAcc: 'Bank', toAcc: 'Cash', amount: 3000, date: '2026-04-08', mode: 'Cheque', reason: 'Petty cash', refNo: 'CHQ-1234', voided: false }
  ];

  sandbox.allLoans = async () => [
    { id: 1, person: 'Temple Trustee A', loanReceived: 10000, repayment: 0, paymentMode: 'Bank', date: '2026-04-02', description: 'Interest-free temple advance', voided: false },
    { id: 2, person: 'Temple Trustee B', loanReceived: 0, repayment: 4000, paymentMode: 'UPI', date: '2026-04-09', voided: false }
  ];

  sandbox.allChittyCollections = async () => [
    { id: 1, memberName: 'Rajan K', amountReceived: 2000, paymentMode: 'Bank', date: '2026-04-06', description: 'Chitty installment 5', voided: false }
  ];

  sandbox.allChittyPayouts = async () => [
    { id: 1, memberName: 'Soman P', amount: 5000, paymentMode: 'Bank', date: '2026-04-10', voided: false }
  ];

  const rows = await sandbox.buildBankBookRows();
  assert(rows.length === 13, 'G5.3', `buildBankBookRows produced exactly 13 active bank transactions (found ${rows.length})`);

  // Verify Cash and Voided transactions are strictly excluded
  const hasCash = rows.some(r => r.particulars.includes('Devotee Six') || r.particulars.includes('Cash Vendor'));
  assert(!hasCash, 'G5.4', 'Cash transactions are strictly excluded from Bank Book');
  const hasVoided = rows.some(r => r.particulars.includes('Devotee Seven') || r.particulars.includes('Voided Payee'));
  assert(!hasVoided, 'G5.5', 'Voided transactions are strictly excluded from Bank Book');

  // Verify receipt with description
  const r1 = rows.find(r => r.particulars.includes('Receipt R-101'));
  assert(r1 && r1.description === 'Neyyvilakku for health', 'G5.6', 'Receipt R-101 populated with its description');

  // Verify receipt with empty description
  const r2 = rows.find(r => r.particulars.includes('Receipt R-102'));
  assert(r2 && r2.description === '', 'G5.7', 'Receipt R-102 has empty description string for "—" fallback');

  // Verify billing-linked receipt with direct description
  const r3 = rows.find(r => r.particulars.includes('Receipt R-103'));
  assert(r3 && r3.description === 'Archana | Star: Makam', 'G5.8', 'Billing-linked Receipt R-103 populated with synchronized description');

  // Verify billing-linked receipt resolved from window.billingAllRecords fallback
  const r4 = rows.find(r => r.particulars.includes('Receipt R-104'));
  assert(r4 && r4.description.includes('Palpayasam') && r4.description.includes('Qty: 3'), 'G5.9', 'Billing-linked Receipt R-104 resolved description from linked bill', r4 ? r4.description : 'null');

  // Verify payment with description
  const p1 = rows.find(r => r.particulars.includes('Payment V-001'));
  assert(p1 && p1.description === 'Temple lighting cables', 'G5.10', 'Payment V-001 populated with payment description');

  // Verify payment without description
  const p2 = rows.find(r => r.particulars.includes('Payment V-002'));
  assert(p2 && p2.description === '', 'G5.11', 'Payment V-002 has empty description for "—" fallback');

  // Verify loan with description
  const l1 = rows.find(r => r.particulars.includes('Loan Received'));
  assert(l1 && l1.description === 'Interest-free temple advance', 'G5.12', 'Loan Received populated with loan description');

  // Verify loan without description
  const l2 = rows.find(r => r.particulars.includes('Loan Repayment'));
  assert(l2 && l2.description === '', 'G5.13', 'Loan Repayment has empty description for "—" fallback');

  // Verify chitty collection with description
  const c1 = rows.find(r => r.particulars.includes('Chitty Collection'));
  assert(c1 && c1.description === 'Chitty installment 5', 'G5.14', 'Chitty Collection populated with description');

  // Verify chitty payout without description
  const pay1 = rows.find(r => r.particulars.includes('Chitty Payout'));
  assert(pay1 && pay1.description === '', 'G5.15', 'Chitty Payout has empty description for "—" fallback');

  // Verify fund transfer with description
  const t1 = rows.find(r => r.particulars.includes('Cash Deposit'));
  assert(t1 && t1.description === 'Hundi collections for April', 'G5.16', 'Cash Deposit populated with transfer description');

  // Verify fund transfer without description
  const t2 = rows.find(r => r.particulars.includes('Cash Withdrawal'));
  assert(t2 && t2.description === '', 'G5.17', 'Cash Withdrawal has empty description for "—" fallback');

  // Render the full HTML view
  const htmlView = await sandbox.VIEW_RENDERERS.bankbook();

  // Verify row rendering and fallback
  assert(htmlView.includes('<td>Neyyvilakku for health</td>'), 'G5.18', 'HTML view contains rendered receipt description');
  assert(htmlView.includes('<td>Temple lighting cables</td>'), 'G5.19', 'HTML view contains rendered payment description');
  assert(htmlView.includes('<td>Palpayasam (Qty: 3) | Star: Aswathi</td>'), 'G5.20', 'HTML view contains rendered billing-linked description');
  assert(htmlView.includes('<td>—</td>'), 'G5.21', 'HTML view renders em-dash "—" for rows without description');

  // Verify safe HTML escaping (no raw <script>)
  assert(!htmlView.includes('<script>alert("XSS")</script>'), 'G5.22', 'HTML view does NOT contain unescaped script tag');
  assert(htmlView.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;Special&quot;'), 'G5.23', 'HTML view contains safely escaped character entities');

  // =========================================================================
  // GROUP 6: Financial Calculations, Totals & Invariants
  // =========================================================================
  console.log('\n--- GROUP 6: Financial Calculations, Totals & Invariants ---');

  const expectedTotalDeposit = 23650.00;
  const expectedTotalWithdrawal = 15700.00;
  const expectedClosingBank = 57950.00;

  const actualTotalDeposit = rows.reduce((s, r) => s + (parseFloat(r.deposit) || 0), 0);
  const actualTotalWithdrawal = rows.reduce((s, r) => s + (parseFloat(r.withdrawal) || 0), 0);
  const actualClosingBank = rows[rows.length - 1].balance;

  assert(actualTotalDeposit === expectedTotalDeposit, 'G6.1', `Deposit total calculation unchanged: ${actualTotalDeposit} (Expected: ${expectedTotalDeposit})`);
  assert(actualTotalWithdrawal === expectedTotalWithdrawal, 'G6.2', `Withdrawal total calculation unchanged: ${actualTotalWithdrawal} (Expected: ${expectedTotalWithdrawal})`);
  assert(actualClosingBank === expectedClosingBank, 'G6.3', `Closing balance calculation unchanged: ${actualClosingBank} (Expected: ${expectedClosingBank})`);

  // Verify running balance continuity
  let running = mockSettings.openingBank;
  let allContinuous = true;
  for (const r of rows) {
    running += (r.deposit - r.withdrawal);
    if (Math.abs(r.balance - running) > 0.001) {
      allContinuous = false;
      break;
    }
  }
  assert(allContinuous, 'G6.4', 'Running balance mathematical continuity holds 100% across all rows');

  // Verify banner and tfoot amounts in rendered HTML
  assert(htmlView.includes('Closing Bank Balance: ₹57,950.00'), 'G6.5', 'Rendered HTML contains correct Closing Bank Balance banner');
  assert(htmlView.includes('id="bankBookTotalDeposit" style="text-align: right;"><b>₹23,650.00</b>'), 'G6.6', 'Rendered HTML contains correct formatted total deposit in tfoot');
  assert(htmlView.includes('id="bankBookTotalWithdrawal" style="text-align: right;"><b>₹15,700.00</b>'), 'G6.7', 'Rendered HTML contains correct formatted total withdrawal in tfoot');

  // Test updateBankBookTotals
  const mockDepEl = { innerHTML: '' };
  const mockWdrEl = { innerHTML: '' };
  sandbox._elements['bankBookTotalDeposit'] = mockDepEl;
  sandbox._elements['bankBookTotalWithdrawal'] = mockWdrEl;
  sandbox._queryAll = () => []; // No hidden rows

  sandbox.updateBankBookTotals();
  assert(mockDepEl.innerHTML.includes('₹23,650.00'), 'G6.8', 'updateBankBookTotals updates deposit total correctly');
  assert(mockWdrEl.innerHTML.includes('₹15,700.00'), 'G6.9', 'updateBankBookTotals updates withdrawal total correctly');

  // =========================================================================
  // GROUP 7: Print Functionality Verification
  // =========================================================================
  console.log('\n--- GROUP 7: Print Functionality Verification ---');

  sandbox._elements['print-area'] = {
    className: '',
    innerHTML: '',
    style: {}
  };

  const mockTableEl = {
    outerHTML: `
    <table id="bankBookTable" class="table">
      <thead><tr><th>Date</th><th>Particulars</th><th>Description</th><th>Deposit</th><th>Withdrawal</th><th>Balance</th></tr></thead>
      <tbody>
        <tr><td>01-04-2026</td><td>Opening Balance</td><td>—</td><td>-</td><td>-</td><td>₹50,000.00</td></tr>
        <tr><td>02-04-2026</td><td>Receipt R-101</td><td>Neyyvilakku for health</td><td>₹1,000.00</td><td>-</td><td>₹51,000.00</td></tr>
      </tbody>
      <tfoot id="bankBookTFoot">
        <tr id="bankBookTotalRow">
          <td><b>TOTAL</b></td><td>—</td><td>—</td>
          <td id="bankBookTotalDeposit"><b>₹1,000.00</b></td>
          <td id="bankBookTotalWithdrawal"><b>₹0.00</b></td>
          <td>—</td>
        </tr>
      </tfoot>
    </table>`
  };

  sandbox.printGenericTable('Bank Book', mockTableEl);
  const pArea = sandbox._elements['print-area'];

  assert(pArea.className === 'a4-print', 'G7.1', 'Print area has class "a4-print"');
  assert(pArea.innerHTML.includes('Bank Book'), 'G7.2', 'Print area includes title "Bank Book"');
  assert(pArea.innerHTML.includes('<th>Description</th>'), 'G7.3', 'Print area table includes Description header column');
  assert(pArea.innerHTML.includes('<td>Neyyvilakku for health</td>'), 'G7.4', 'Print area table includes Description cell data');
  assert(pArea.innerHTML.includes('class="pr-table"'), 'G7.5', 'Print area table has class="pr-table" applied');

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSandboxTest().catch(err => {
  console.error('\nFatal error running sandbox tests:', err);
  process.exit(1);
});
