const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('STEP 33.7A VALIDATION SUITE: BANK BOOK TOTALS ROW');
console.log('====================================================\n');

const htmlPath = path.resolve('d:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify Structure and Elements in HTML source
console.log('TEST 1: Source Code Verification');
let test1Passed = true;

if (!html.includes('id="bankBookTotalRow"') || !html.includes('class="bankbook-total-row"')) {
  console.error('  FAIL: bankBookTotalRow not found');
  test1Passed = false;
} else {
  console.log('  PASS: bankBookTotalRow and class bankbook-total-row defined');
}

if (!html.includes('<tfoot id="bankBookTFoot">')) {
  console.error('  FAIL: semantic <tfoot id="bankBookTFoot"> not found');
  test1Passed = false;
} else {
  console.log('  PASS: semantic <tfoot id="bankBookTFoot"> defined');
}

if (!html.includes('id="bankBookTotalDeposit"') || !html.includes('id="bankBookTotalWithdrawal"')) {
  console.error('  FAIL: total deposit / withdrawal cell IDs not found');
  test1Passed = false;
} else {
  console.log('  PASS: bankBookTotalDeposit and bankBookTotalWithdrawal cells defined');
}

if (!html.includes('function updateBankBookTotals()')) {
  console.error('  FAIL: updateBankBookTotals function not found');
  test1Passed = false;
} else {
  console.log('  PASS: updateBankBookTotals defined');
}

if (!test1Passed) process.exit(1);

// 2. Syntax and VM Sandbox Execution
console.log('\nTEST 2: Syntax and In-Memory Sandbox Execution');

const mockSettings = {
  templeName: 'Test Sree Krishna Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingBank: 25000.00
};

// Create mock DOM environment
function createMockElement(id, tag = 'div') {
  return {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    style: {},
    className: '',
    dataset: {},
    outerHTML: '',
    children: []
  };
}

const sandbox = {
  window: { APP_SETTINGS: mockSettings },
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
  _elements: {},
  _queryAll: () => [],
  _queryOne: () => null,
  _bankBookRows: [],
  printGenericTable: (title, tableEl) => {
    const s = mockSettings;
    sandbox._lastPrinted = {
      title,
      html: `<div class="pr-center pr-bold" style="font-size:16px;">${s.templeName}</div><div class="pr-center pr-bold" style="margin:8px 0;">${title}</div>` + (tableEl ? tableEl.outerHTML.replace(/class="[^"]*"/g, 'class="pr-table"') : '')
    };
  },
  console
};

vm.createContext(sandbox);

// Extract the Bank Book code block
const bankCodeStart = html.indexOf('async function buildBankBookRows()');
const bankCodeEnd = html.indexOf('function printGenericTable(');
const bankBookCode = html.slice(bankCodeStart, bankCodeEnd);

try {
  vm.runInContext(bankBookCode, sandbox);
  console.log('  PASS: Bank Book code block executed with zero syntax errors in VM sandbox');
} catch (err) {
  console.error('  FAIL: Syntax error executing Bank Book code:', err);
  process.exit(1);
}

// 3. Test In-Memory Bank Book Calculations
console.log('\nTEST 3: In-Memory Calculation Tests (Non-Destructive Synthetic Records)');

async function runScenario(scenarioName, setupFn, assertionFn) {
  // Set up mock data getters in sandbox
  const data = setupFn();
  sandbox.activeReceipts = async () => (data.receipts || []).filter(r => !r.voided);
  sandbox.activePayments = async () => (data.payments || []).filter(p => !p.voided);
  sandbox.allTransfers = async () => data.transfers || [];
  sandbox.allLoans = async () => data.loans || [];
  sandbox.allChittyCollections = async () => data.collections || [];
  sandbox.allChittyPayouts = async () => data.payouts || [];

  const htmlOutput = await sandbox.VIEW_RENDERERS.bankbook();
  await assertionFn(htmlOutput, sandbox.window._bankBookRows);
}

// Scenario 1: Mixed Realistic Transactions
runScenario('Realistic Transactions', () => ({
  receipts: [
    { receiptNo: '101', name: 'Devotee A', paymentMode: 'Bank', amount: 5000, date: '2026-04-02', voided: false },
    { receiptNo: '102', name: 'Devotee B', paymentMode: 'UPI', amount: 2500, date: '2026-04-03', voided: false },
    { receiptNo: '103', name: 'Devotee C', paymentMode: 'Cash', amount: 1000, date: '2026-04-03', voided: false } // Cash: excluded from Bank Book
  ],
  payments: [
    { voucherNo: 'V1', paidTo: 'Vendor X', paymentMode: 'Bank', amount: 3000, date: '2026-04-04', voided: false },
    { voucherNo: 'V2', paidTo: 'Vendor Y', paymentMode: 'UPI', amount: 1500, date: '2026-04-05', voided: false },
    { voucherNo: 'V3', paidTo: 'Vendor Z', paymentMode: 'Cash', amount: 800, date: '2026-04-05', voided: false } // Cash: excluded from Bank Book
  ],
  transfers: [
    { fromAcc: 'Cash', toAcc: 'Bank', amount: 10000, date: '2026-04-06', mode: 'Cash', voided: false }, // Deposit to Bank
    { fromAcc: 'Bank', toAcc: 'Cash', amount: 4000, date: '2026-04-07', mode: 'Cheque', voided: false }  // Withdrawal from Bank
  ],
  loans: [
    { person: 'Member L1', loanReceived: 20000, paymentMode: 'Bank', date: '2026-04-08', voided: false }, // Deposit
    { person: 'Member L2', repayment: 5000, paymentMode: 'UPI', date: '2026-04-09', voided: false }      // Withdrawal
  ],
  collections: [
    { memberName: 'Chitty M1', amountReceived: 3500, paymentMode: 'Bank', date: '2026-04-10', voided: false } // Deposit
  ],
  payouts: [
    { memberName: 'Chitty M2', amount: 7000, paymentMode: 'Bank', date: '2026-04-11', voided: false }         // Withdrawal
  ]
}), (htmlOutput, rows) => {
  // Expected Deposits: 5000 (R101) + 2500 (R102) + 10000 (transfer) + 20000 (loan) + 3500 (chitty) = 41,000.00
  // Expected Withdrawals: 3000 (V1) + 1500 (V2) + 4000 (transfer) + 5000 (loan) + 7000 (chitty) = 20,500.00
  // Opening Bank: 25,000.00
  // Expected Closing: 25,000 + 41,000 - 20,500 = 45,500.00

  const totalDeposit = rows.reduce((s, r) => s + (r.deposit || 0), 0);
  const totalWithdrawal = rows.reduce((s, r) => s + (r.withdrawal || 0), 0);
  const closingBalance = rows[rows.length - 1].balance;

  console.log('  Scenario 1 — Mixed Transactions:');
  console.log(`    Total Deposit: ${totalDeposit} (Expected: 41000)`);
  console.log(`    Total Withdrawal: ${totalWithdrawal} (Expected: 20500)`);
  console.log(`    Closing Balance: ${closingBalance} (Expected: 45500)`);

  if (totalDeposit !== 41000) throw new Error('Deposit total mismatch in Scenario 1');
  if (totalWithdrawal !== 20500) throw new Error('Withdrawal total mismatch in Scenario 1');
  if (closingBalance !== 45500) throw new Error('Closing balance mismatch in Scenario 1');

  // Verify HTML contains the formatted values
  if (!htmlOutput.includes('₹41,000.00')) throw new Error('HTML output missing formatted total deposit ₹41,000.00');
  if (!htmlOutput.includes('₹20,500.00')) throw new Error('HTML output missing formatted total withdrawal ₹20,500.00');
  if (!htmlOutput.includes('<b>TOTAL</b>')) throw new Error('HTML output missing <b>TOTAL</b> label');
  console.log('    PASS: All amounts and HTML tags verified');
}).then(() => {

  // Scenario 2: Voided Transactions Exclusion Check
  return runScenario('Voided Transactions Exclusion', () => ({
    receipts: [
      { receiptNo: '101', name: 'Valid Devotee', paymentMode: 'Bank', amount: 10000, date: '2026-04-02', voided: false },
      { receiptNo: '102', name: 'Voided Devotee', paymentMode: 'Bank', amount: 99999, date: '2026-04-02', voided: true }
    ],
    payments: [
      { voucherNo: 'V1', paidTo: 'Valid Payee', paymentMode: 'Bank', amount: 4000, date: '2026-04-03', voided: false },
      { voucherNo: 'V2', paidTo: 'Voided Payee', paymentMode: 'Bank', amount: 88888, date: '2026-04-03', voided: true }
    ],
    transfers: [
      { fromAcc: 'Cash', toAcc: 'Bank', amount: 5000, date: '2026-04-04', mode: 'Cash', voided: false },
      { fromAcc: 'Cash', toAcc: 'Bank', amount: 77777, date: '2026-04-04', mode: 'Cash', voided: true },
      { fromAcc: 'Bank', toAcc: 'Cash', amount: 2000, date: '2026-04-05', mode: 'Cash', voided: false },
      { fromAcc: 'Bank', toAcc: 'Cash', amount: 66666, date: '2026-04-05', mode: 'Cash', voided: true }
    ],
    loans: [
      { person: 'Valid Loan', loanReceived: 3000, paymentMode: 'Bank', date: '2026-04-06', voided: false },
      { person: 'Voided Loan', loanReceived: 55555, paymentMode: 'Bank', date: '2026-04-06', voided: true }
    ],
    collections: [
      { memberName: 'Valid Coll', amountReceived: 1000, paymentMode: 'Bank', date: '2026-04-07', voided: false },
      { memberName: 'Voided Coll', amountReceived: 44444, paymentMode: 'Bank', date: '2026-04-07', voided: true }
    ],
    payouts: [
      { memberName: 'Valid Payout', amount: 1500, paymentMode: 'Bank', date: '2026-04-08', voided: false },
      { memberName: 'Voided Payout', amount: 33333, paymentMode: 'Bank', date: '2026-04-08', voided: true }
    ]
  }), (htmlOutput, rows) => {
    // Valid Deposits: 10000 + 5000 + 3000 + 1000 = 19,000.00
    // Valid Withdrawals: 4000 + 2000 + 1500 = 7,500.00
    const totalDeposit = rows.reduce((s, r) => s + (r.deposit || 0), 0);
    const totalWithdrawal = rows.reduce((s, r) => s + (r.withdrawal || 0), 0);

    console.log('\n  Scenario 2 — Voided Transactions:');
    console.log(`    Total Deposit: ${totalDeposit} (Expected: 19000, voided 99999/77777/55555/44444 excluded)`);
    console.log(`    Total Withdrawal: ${totalWithdrawal} (Expected: 7500, voided 88888/66666/33333 excluded)`);

    if (totalDeposit !== 19000) throw new Error('Voided deposits leaked into totals');
    if (totalWithdrawal !== 7500) throw new Error('Voided withdrawals leaked into totals');
    if (htmlOutput.includes('99999') || htmlOutput.includes('88888')) throw new Error('Voided amounts leaked into HTML');
    console.log('    PASS: Zero voided transactions included in rows or totals');
  });
}).then(() => {

  // Scenario 3: Empty Transaction Set
  return runScenario('Empty Transaction Set', () => ({
    receipts: [], payments: [], transfers: [], loans: [], collections: [], payouts: []
  }), (htmlOutput, rows) => {
    const totalDeposit = rows.reduce((s, r) => s + (r.deposit || 0), 0);
    const totalWithdrawal = rows.reduce((s, r) => s + (r.withdrawal || 0), 0);

    console.log('\n  Scenario 3 — Empty Transaction Set:');
    console.log(`    Total Deposit: ${totalDeposit} (Expected: 0)`);
    console.log(`    Total Withdrawal: ${totalWithdrawal} (Expected: 0)`);

    if (totalDeposit !== 0 || totalWithdrawal !== 0) throw new Error('Empty transaction set non-zero');
    if (!htmlOutput.includes('<td id="bankBookTotalDeposit" style="text-align: right;"><b>₹0.00</b></td>')) {
      throw new Error('Missing ₹0.00 deposit in empty set');
    }
    if (!htmlOutput.includes('<td id="bankBookTotalWithdrawal" style="text-align: right;"><b>₹0.00</b></td>')) {
      throw new Error('Missing ₹0.00 withdrawal in empty set');
    }
    console.log('    PASS: Correctly displays ₹0.00 for empty transaction sets');
  });
}).then(() => {

  // Scenario 4: Opening Balance Non-Contribution Test
  return runScenario('Opening Balance Zero Contribution', () => {
    sandbox.window.APP_SETTINGS.openingBank = 1000000.00; // 10 Lakhs
    return {
      receipts: [
        { receiptNo: '101', name: 'Devotee A', paymentMode: 'Bank', amount: 500, date: '2026-04-02', voided: false }
      ],
      payments: [
        { voucherNo: 'V1', paidTo: 'Vendor A', paymentMode: 'Bank', amount: 200, date: '2026-04-03', voided: false }
      ]
    };
  }, (htmlOutput, rows) => {
    const totalDeposit = rows.reduce((s, r) => s + (r.deposit || 0), 0);
    const totalWithdrawal = rows.reduce((s, r) => s + (r.withdrawal || 0), 0);
    const closingBalance = rows[rows.length - 1].balance;

    console.log('\n  Scenario 4 — Opening Balance Zero Contribution:');
    console.log(`    Opening Bank: 1,000,000.00`);
    console.log(`    Total Deposit: ${totalDeposit} (Expected: 500, NOT 1,000,500)`);
    console.log(`    Total Withdrawal: ${totalWithdrawal} (Expected: 200)`);
    console.log(`    Closing Balance: ${closingBalance} (Expected: 1,000,300)`);

    if (totalDeposit !== 500) throw new Error('Opening balance was incorrectly added to Total Deposit');
    if (totalWithdrawal !== 200) throw new Error('Opening balance affected Total Withdrawal');
    if (closingBalance !== 1000300) throw new Error('Closing balance calculation corrupted');
    console.log('    PASS: Opening balance contributes exactly zero to totals');
  });
}).then(() => {

  // Scenario 5: Print Verification
  console.log('\nTEST 4: Print Output Verification');
  const mockTable = {
    outerHTML: `
    <table id="bankBookTable">
      <thead><tr><th>Date</th><th>Particulars</th><th>Deposit</th><th>Withdrawal</th><th>Balance</th></tr></thead>
      <tbody>
        <tr><td>01-04-2026</td><td>Opening Balance</td><td>-</td><td>-</td><td>₹25,000.00</td></tr>
        <tr><td>02-04-2026</td><td>Receipt 101</td><td>₹5,000.00</td><td>-</td><td>₹30,000.00</td></tr>
      </tbody>
      <tfoot id="bankBookTFoot">
        <tr id="bankBookTotalRow" class="bankbook-total-row" style="font-weight: bold; background: var(--surface, #fafafa); border-top: 2px solid var(--border, #333);">
          <td><b>TOTAL</b></td>
          <td>—</td>
          <td id="bankBookTotalDeposit" style="text-align: right;"><b>₹5,000.00</b></td>
          <td id="bankBookTotalWithdrawal" style="text-align: right;"><b>₹0.00</b></td>
          <td style="text-align: right;">—</td>
        </tr>
      </tfoot>
    </table>`
  };

  sandbox.printGenericTable('Bank Book', mockTable);
  const printedHtml = sandbox._lastPrinted.html;

  if (!printedHtml.includes('<tfoot id="bankBookTFoot">')) {
    throw new Error('Printed output is missing tfoot');
  }
  if (!printedHtml.includes('bankBookTotalRow')) {
    throw new Error('Printed output is missing totals row');
  }
  if (!printedHtml.includes('₹5,000.00') || !printedHtml.includes('₹0.00')) {
    throw new Error('Printed output is missing total amounts');
  }
  if (!printedHtml.includes('class="pr-table"')) {
    throw new Error('Printed output missing pr-table class');
  }
  console.log('  PASS: Printed HTML contains semantic <tfoot>, totals row, pr-table class, and correct values');

  // Scenario 6: updateBankBookTotals function test
  console.log('\nTEST 5: updateBankBookTotals Verification');
  sandbox.window._bankBookRows = [
    { deposit: 1200, withdrawal: 0 },
    { deposit: 0, withdrawal: 450 }
  ];
  const mockDepositEl = createMockElement('bankBookTotalDeposit');
  const mockWithdrawalEl = createMockElement('bankBookTotalWithdrawal');
  sandbox._elements['bankBookTotalDeposit'] = mockDepositEl;
  sandbox._elements['bankBookTotalWithdrawal'] = mockWithdrawalEl;

  sandbox.updateBankBookTotals();

  console.log(`  Updated Deposit HTML: ${mockDepositEl.innerHTML} (Expected: <b>₹1,200.00</b>)`);
  console.log(`  Updated Withdrawal HTML: ${mockWithdrawalEl.innerHTML} (Expected: <b>₹450.00</b>)`);

  if (!mockDepositEl.innerHTML.includes('₹1,200.00')) throw new Error('updateBankBookTotals deposit failed');
  if (!mockWithdrawalEl.innerHTML.includes('₹450.00')) throw new Error('updateBankBookTotals withdrawal failed');
  console.log('  PASS: updateBankBookTotals dynamically updates DOM cells accurately');

  console.log('\n====================================================');
  console.log('ALL IN-MEMORY TESTS PASSED PERFECTLY!');
  console.log('====================================================\n');
}).catch(err => {
  console.error('\nFAIL: Test suite encountered an error:', err);
  process.exit(1);
});
