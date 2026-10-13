const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('STEP 33.16 VALIDATION SUITE: BANK BOOK FUND TRANSFER PARTICULARS');
console.log('================================================================\n');

const htmlPath = path.resolve('d:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  FAIL: ${message}`);
    failedTests++;
  }
}

// ================================================================
// TEST SUITE 1: Source Code Static Inspection
// ================================================================
console.log('--- TEST SUITE 1: Source Code Static Verification ---');

// Check that old redundant phrases are gone
assert(!html.includes('`Withdrawal to Cash via'), 'Old template `Withdrawal to Cash via` is removed');
assert(!html.includes('`Deposit from Cash via'), 'Old template `Deposit from Cash via` is removed');

// Check that clean new templates are present
assert(html.includes('Cash Withdrawal${t.reason'), 'New template `Cash Withdrawal${t.reason...` is present');
assert(html.includes('Cash Deposit${t.reason'), 'New template `Cash Deposit${t.reason...` is present');

// Verify that Cash Book implementation was NOT mutated
assert(html.includes('Transfer to Bank via ${t.mode||\'Cash\'}'), 'Cash Book retains original transfer particulars logic');
assert(html.includes('Transfer from Bank via ${t.mode||\'Cash\'}'), 'Cash Book retains original transfer particulars logic');

// ================================================================
// Sandbox Setup
// ================================================================
const mockSettings = {
  templeName: 'Sree Bhagavathi Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingBank: 50000.00,
  openingCash: 20000.00
};

const sandbox = {
  window: { APP_SETTINGS: mockSettings, print: () => {} },
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
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  VIEW_RENDERERS: {},
  _elements: {
    'print-area': {
      className: '',
      innerHTML: '',
      style: {}
    }
  },
  _queryAll: () => [],
  _queryOne: () => null,
  _bankBookRows: [],
  _cashBookRows: [],
  console
};

vm.createContext(sandbox);

// Extract Cash Book & Bank Book code block from Temple_Accounts-1.html
const startIdx = html.indexOf('function resolvePaymentType(');
const endIdx = html.indexOf('/* ===================== LEDGER ===================== */');
const codeBlock = html.slice(startIdx, endIdx);

try {
  vm.runInContext(codeBlock, sandbox);
  assert(true, 'Cash Book and Bank Book code blocks executed cleanly in VM sandbox');
} catch (err) {
  assert(false, `Syntax/Execution error in VM sandbox: ${err.message}`);
}

async function runTestExecution() {
  // ================================================================
  // TEST SUITE 2: Fund Transfer Descriptions Across Modes
  // ================================================================
  console.log('\n--- TEST SUITE 2: Fund Transfer Descriptions Across Modes ---');

  const transferModes = ['Cash', 'Cheque', 'Online', 'Other'];

  for (const mode of transferModes) {
    // Test Cash -> Bank (Deposit)
    const depositData = {
      receipts: [], payments: [], loans: [], collections: [], payouts: [],
      transfers: [
        { fromAcc: 'Cash', toAcc: 'Bank', amount: 5000, date: '2026-04-05', mode, voided: false }
      ]
    };

    sandbox.activeReceipts = async () => depositData.receipts;
    sandbox.activePayments = async () => depositData.payments;
    sandbox.allTransfers = async () => depositData.transfers;
    sandbox.allLoans = async () => depositData.loans;
    sandbox.allChittyCollections = async () => depositData.collections;
    sandbox.allChittyPayouts = async () => depositData.payouts;

    let rows = await sandbox.buildBankBookRows();
    assert(rows.length === 1, `Cash -> Bank with mode '${mode}' produces exactly 1 row`);
    assert(rows[0].particulars === 'Cash Deposit', `Cash -> Bank with mode '${mode}' displays exactly 'Cash Deposit' (got: '${rows[0].particulars}')`);
    assert(!rows[0].particulars.includes(`via ${mode}`), `Cash -> Bank with mode '${mode}' does not include 'via ${mode}'`);
    assert(rows[0].deposit === 5000, `Cash -> Bank with mode '${mode}' has deposit 5000`);
    assert(rows[0].withdrawal === 0, `Cash -> Bank with mode '${mode}' has withdrawal 0`);

    // Test Bank -> Cash (Withdrawal)
    const withdrawalData = {
      receipts: [], payments: [], loans: [], collections: [], payouts: [],
      transfers: [
        { fromAcc: 'Bank', toAcc: 'Cash', amount: 3000, date: '2026-04-06', mode, voided: false }
      ]
    };

    sandbox.allTransfers = async () => withdrawalData.transfers;
    rows = await sandbox.buildBankBookRows();
    assert(rows.length === 1, `Bank -> Cash with mode '${mode}' produces exactly 1 row`);
    assert(rows[0].particulars === 'Cash Withdrawal', `Bank -> Cash with mode '${mode}' displays exactly 'Cash Withdrawal' (got: '${rows[0].particulars}')`);
    assert(!rows[0].particulars.includes(`via ${mode}`), `Bank -> Cash with mode '${mode}' does not include 'via ${mode}'`);
    assert(rows[0].deposit === 0, `Bank -> Cash with mode '${mode}' has deposit 0`);
    assert(rows[0].withdrawal === 3000, `Bank -> Cash with mode '${mode}' has withdrawal 3000`);
  }

  // ================================================================
  // TEST SUITE 3: Reason and Reference Suffix Preservation
  // ================================================================
  console.log('\n--- TEST SUITE 3: Reason and Reference Suffix Preservation ---');

  const transferWithMetadata = {
    receipts: [], payments: [], loans: [], collections: [], payouts: [],
    transfers: [
      {
        fromAcc: 'Cash',
        toAcc: 'Bank',
        amount: 15000,
        date: '2026-04-07',
        mode: 'Cheque',
        reason: 'Hundi collections deposit',
        refNo: 'CHQ-10492',
        voided: false
      },
      {
        fromAcc: 'Bank',
        toAcc: 'Cash',
        amount: 8000,
        date: '2026-04-08',
        mode: 'Online',
        reason: 'Petty cash refill',
        refNo: 'IMPS-9921',
        voided: false
      }
    ]
  };

  sandbox.allTransfers = async () => transferWithMetadata.transfers;
  const metaRows = await sandbox.buildBankBookRows();

  assert(metaRows[0].particulars === 'Cash Deposit (Hundi collections deposit) - Ref CHQ-10492',
    `Cash -> Bank with metadata displays 'Cash Deposit (reason) - Ref refNo' (got: '${metaRows[0].particulars}')`);
  assert(!metaRows[0].particulars.includes('via Cheque') && !metaRows[0].particulars.includes('via Cash'),
    'Cash -> Bank metadata entry does not have redundant via suffixes');

  assert(metaRows[1].particulars === 'Cash Withdrawal (Petty cash refill) - Ref IMPS-9921',
    `Bank -> Cash with metadata displays 'Cash Withdrawal (reason) - Ref refNo' (got: '${metaRows[1].particulars}')`);
  assert(!metaRows[1].particulars.includes('via Online') && !metaRows[1].particulars.includes('via Cash'),
    'Bank -> Cash metadata entry does not have redundant via suffixes');

  // ================================================================
  // TEST SUITE 4: Ordinary Bank Transactions Non-Reclassification
  // ================================================================
  console.log('\n--- TEST SUITE 4: Ordinary Bank Transactions Invariance ---');

  const ordinaryData = {
    receipts: [
      { receiptNo: 'RCP-101', name: 'Narayanan Namboothiri', paymentMode: 'Bank', amount: 10000, date: '2026-04-02', voided: false },
      { receiptNo: 'RCP-102', name: 'Radha Devi', paymentMode: 'UPI', amount: 2500, date: '2026-04-03', voided: false },
      { receiptNo: 'RCP-103', name: 'Cash Devotee', paymentMode: 'Cash', amount: 500, date: '2026-04-03', voided: false } // Cash: excluded from Bank Book
    ],
    payments: [
      { voucherNo: 'VCH-001', paidTo: 'Temple Oil Supplies', paymentMode: 'Bank', amount: 4500, date: '2026-04-04', voided: false },
      { voucherNo: 'VCH-002', paidTo: 'Electrical Maintenance', paymentMode: 'UPI', amount: 1200, date: '2026-04-05', voided: false },
      { voucherNo: 'VCH-003', paidTo: 'Cleaning Cash', paymentMode: 'Cash', amount: 300, date: '2026-04-05', voided: false } // Cash: excluded from Bank Book
    ],
    transfers: [
      { fromAcc: 'Cash', toAcc: 'Bank', amount: 6000, date: '2026-04-06', mode: 'Cash', voided: false },
      { fromAcc: 'Bank', toAcc: 'Cash', amount: 2000, date: '2026-04-07', mode: 'Cheque', voided: false }
    ],
    loans: [
      { person: 'K. Vasudevan', loanReceived: 25000, repayment: 0, paymentMode: 'Bank', date: '2026-04-08', voided: false },
      { person: 'M. Padmanabhan', loanReceived: 0, repayment: 5000, paymentMode: 'UPI', date: '2026-04-09', voided: false }
    ],
    collections: [
      { memberName: 'Suresh Kumar', amountReceived: 3000, paymentMode: 'Bank', date: '2026-04-10', voided: false }
    ],
    payouts: [
      { memberName: 'Anand Mohan', amount: 15000, paymentMode: 'UPI', date: '2026-04-11', voided: false }
    ]
  };

  sandbox.activeReceipts = async () => ordinaryData.receipts.filter(r => !r.voided);
  sandbox.activePayments = async () => ordinaryData.payments.filter(p => !p.voided);
  sandbox.allTransfers = async () => ordinaryData.transfers.filter(t => !t.voided);
  sandbox.allLoans = async () => ordinaryData.loans.filter(l => !l.voided);
  sandbox.allChittyCollections = async () => ordinaryData.collections.filter(c => !c.voided);
  sandbox.allChittyPayouts = async () => ordinaryData.payouts.filter(p => !p.voided);

  const mixedRows = await sandbox.buildBankBookRows();

  // 1. Ordinary receipts must NOT be reclassified as Fund Transfers or 'UPI Deposit'
  const rcpBankRow = mixedRows.find(r => r.particulars.includes('RCP-101'));
  assert(rcpBankRow && rcpBankRow.particulars === 'Receipt RCP-101 - Narayanan Namboothiri (Bank)',
    `Bank Receipt retains exact particulars: '${rcpBankRow ? rcpBankRow.particulars : 'not found'}'`);

  const rcpUpiRow = mixedRows.find(r => r.particulars.includes('RCP-102'));
  assert(rcpUpiRow && rcpUpiRow.particulars === 'Receipt RCP-102 - Radha Devi (UPI)',
    `UPI Receipt retains exact particulars (not reclassified to 'UPI Deposit'): '${rcpUpiRow ? rcpUpiRow.particulars : 'not found'}'`);

  // 2. Ordinary payments must NOT be reclassified as Fund Transfers or 'UPI Withdrawal'
  const vchBankRow = mixedRows.find(r => r.particulars.includes('VCH-001'));
  assert(vchBankRow && vchBankRow.particulars === 'Payment VCH-001 - Temple Oil Supplies (Bank)',
    `Bank Payment retains exact particulars: '${vchBankRow ? vchBankRow.particulars : 'not found'}'`);

  const vchUpiRow = mixedRows.find(r => r.particulars.includes('VCH-002'));
  assert(vchUpiRow && vchUpiRow.particulars === 'Payment VCH-002 - Electrical Maintenance (UPI)',
    `UPI Payment retains exact particulars (not reclassified): '${vchUpiRow ? vchUpiRow.particulars : 'not found'}'`);

  // 3. Loans must NOT be reclassified
  const loanRecRow = mixedRows.find(r => r.particulars.includes('Vasudevan'));
  assert(loanRecRow && loanRecRow.particulars === 'Loan Received - K. Vasudevan',
    `Loan Received retains exact particulars: '${loanRecRow ? loanRecRow.particulars : 'not found'}'`);

  const loanRepayRow = mixedRows.find(r => r.particulars.includes('Padmanabhan'));
  assert(loanRepayRow && loanRepayRow.particulars === 'Loan Repayment - M. Padmanabhan',
    `Loan Repayment retains exact particulars: '${loanRepayRow ? loanRepayRow.particulars : 'not found'}'`);

  // 4. Chitties must NOT be reclassified
  const chittyCollRow = mixedRows.find(r => r.particulars.includes('Suresh Kumar'));
  assert(chittyCollRow && chittyCollRow.particulars === 'Chitty Collection - Suresh Kumar',
    `Chitty Collection retains exact particulars: '${chittyCollRow ? chittyCollRow.particulars : 'not found'}'`);

  const chittyPayoutRow = mixedRows.find(r => r.particulars.includes('Anand Mohan'));
  assert(chittyPayoutRow && chittyPayoutRow.particulars === 'Chitty Payout - Anand Mohan',
    `Chitty Payout retains exact particulars: '${chittyPayoutRow ? chittyPayoutRow.particulars : 'not found'}'`);

  // 5. Fund Transfers in the mixed set must be correctly labeled
  const transferDepRow = mixedRows.find(r => r.particulars === 'Cash Deposit');
  assert(transferDepRow && transferDepRow.deposit === 6000 && transferDepRow.withdrawal === 0,
    `Cash -> Bank Fund Transfer correctly labeled 'Cash Deposit' with deposit 6000`);

  const transferWdrRow = mixedRows.find(r => r.particulars === 'Cash Withdrawal');
  assert(transferWdrRow && transferWdrRow.deposit === 0 && transferWdrRow.withdrawal === 2000,
    `Bank -> Cash Fund Transfer correctly labeled 'Cash Withdrawal' with withdrawal 2000`);

  // ================================================================
  // TEST SUITE 5: Financial Accounting Integrity & Balance Invariance
  // ================================================================
  console.log('\n--- TEST SUITE 5: Financial Accounting Integrity & Balance Invariance ---');

  // Total Deposits: 10000 (R1) + 2500 (R2) + 6000 (transfer) + 25000 (loan) + 3000 (chitty) = 46,500
  // Total Withdrawals: 4500 (V1) + 1200 (V2) + 2000 (transfer) + 5000 (loan) + 15000 (chitty) = 27,700
  // Opening Bank: 50,000
  // Closing Bank: 50,000 + 46,500 - 27,700 = 68,800

  const totalDeposit = mixedRows.reduce((s, r) => s + (r.deposit || 0), 0);
  const totalWithdrawal = mixedRows.reduce((s, r) => s + (r.withdrawal || 0), 0);
  const closingBalance = mixedRows[mixedRows.length - 1].balance;

  assert(totalDeposit === 46500, `Total Deposit strictly preserved at ₹46,500.00 (got: ${totalDeposit})`);
  assert(totalWithdrawal === 27700, `Total Withdrawal strictly preserved at ₹27,700.00 (got: ${totalWithdrawal})`);
  assert(closingBalance === 68800, `Closing Bank Balance strictly preserved at ₹68,800.00 (got: ${closingBalance})`);

  // Verify running balance continuity on every row
  let expectedRunning = mockSettings.openingBank;
  let runningBalOk = true;
  mixedRows.forEach(r => {
    expectedRunning += (r.deposit - r.withdrawal);
    if (r.balance !== expectedRunning) runningBalOk = false;
  });
  assert(runningBalOk, 'Running balance mathematical continuity holds 100% across all rows');

  // ================================================================
  // TEST SUITE 6: Cash Book Isolation & Invariance
  // ================================================================
  console.log('\n--- TEST SUITE 6: Cash Book Isolation & Invariance ---');

  const cashRows = await sandbox.buildCashBookRows();
  assert(cashRows.length > 0, `Cash Book rows built successfully (count: ${cashRows.length})`);

  // Verify Cash Book transfer descriptions remain untouched:
  // e.g. "Transfer to Bank via Cash" and "Transfer from Bank via Cheque"
  const cbTransferToBank = cashRows.find(r => r.particulars.includes('Transfer to Bank'));
  assert(cbTransferToBank && cbTransferToBank.particulars === 'Transfer to Bank via Cash',
    `Cash Book transfer to bank retains original particulars: '${cbTransferToBank ? cbTransferToBank.particulars : 'not found'}'`);

  const cbTransferFromBank = cashRows.find(r => r.particulars.includes('Transfer from Bank'));
  assert(cbTransferFromBank && cbTransferFromBank.particulars === 'Transfer from Bank via Cheque',
    `Cash Book transfer from bank retains original particulars: '${cbTransferFromBank ? cbTransferFromBank.particulars : 'not found'}'`);

  // ================================================================
  // TEST SUITE 7: UI Rendering, Print, and DOM Updates
  // ================================================================
  console.log('\n--- TEST SUITE 7: UI Rendering, Print, and DOM Updates ---');

  const htmlOutput = await sandbox.VIEW_RENDERERS.bankbook();

  assert(htmlOutput.includes('Cash Deposit'), 'Rendered Bank Book HTML table contains `Cash Deposit`');
  assert(htmlOutput.includes('Cash Withdrawal'), 'Rendered Bank Book HTML table contains `Cash Withdrawal`');
  assert(!htmlOutput.includes('Withdrawal to Cash via'), 'Rendered Bank Book HTML table does NOT contain `Withdrawal to Cash via`');
  assert(!htmlOutput.includes('Deposit from Cash via'), 'Rendered Bank Book HTML table does NOT contain `Deposit from Cash via`');
  assert(htmlOutput.includes('₹46,500.00'), 'Rendered Bank Book HTML contains formatted total deposit ₹46,500.00');
  assert(htmlOutput.includes('₹27,700.00'), 'Rendered Bank Book HTML contains formatted total withdrawal ₹27,700.00');
  assert(htmlOutput.includes('Closing Bank Balance: ₹68,800.00'), 'Rendered Bank Book banner contains Closing Bank Balance: ₹68,800.00');

  // Mock DOM print test
  const mockTable = {
    outerHTML: '<table id="bankBookTable"><tbody><tr><td>Cash Deposit</td></tr></tbody></table>'
  };
  sandbox.printGenericTable('Bank Book', mockTable);
  assert(sandbox._elements['print-area'].innerHTML.includes('Cash Deposit'),
    'printGenericTable preserves clean `Cash Deposit` in print view');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('ALL STEP 33.16 TESTS COMPLETED WITH 100% SUCCESS!');
  }
}

runTestExecution().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
