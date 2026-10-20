/**
 * tests/test_step_33_167_payment_description_suite.js
 * Comprehensive automated regression suite for:
 * STEP 33.167 — Add Description Column to Payments Table
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.167: ADD DESCRIPTION COLUMN TO PAYMENTS TABLE TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const BACKUP_FILE = path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_167_PaymentDescriptionColumn_Backup_20261020_235700.html');

const PRE_CHANGE_HASH = '3F141EE874A2FD607E44ED5AC8AA5962189FA44D7686A9345AF190F50CBB08B7';
const PRE_CHANGE_SIZE = 1224038;

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

const hasNthChild8 = htmlContent.includes('#paymentTable th:nth-child(8)') && htmlContent.includes('#paymentTable td:nth-child(8)');
assert(hasNthChild8, 'G2.1', '#paymentTable Amount column right-aligned at nth-child(8)');

const noOldNthChild7 = !htmlContent.includes('#paymentTable th:nth-child(7)') && !htmlContent.includes('#paymentTable td:nth-child(7)');
assert(noOldNthChild7, 'G2.2', 'Old #paymentTable nth-child(7) selector removed');

const hasDescWrapping = htmlContent.includes('#paymentTable th:nth-child(4)') && htmlContent.includes('#paymentTable td:nth-child(4)');
assert(hasDescWrapping, 'G2.3', '#paymentTable Description column (col 4) included in text-wrapping & min/max width rule');

// =========================================================================
// GROUP 3: Table Header & Column Schema
// =========================================================================
console.log('\n--- GROUP 3: Table Header & Column Schema ---');

// Extract paymentTable thead
const theadMatch = htmlContent.match(/<table id="paymentTable">\s*<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(theadMatch !== null, 'G3.1', 'Found <table id="paymentTable"> <thead> structure');

if (theadMatch) {
  const thMatches = Array.from(theadMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(thMatches.length === 10, 'G3.2', `paymentTable has exactly 10 columns (found ${thMatches.length})`, thMatches.join(', '));
  assert(thMatches[0] === 'Voucher No', 'G3.3', 'Column 1 is Voucher No');
  assert(thMatches[1] === 'Date', 'G3.4', 'Column 2 is Date');
  assert(thMatches[2] === 'Paid To', 'G3.5', 'Column 3 is Paid To');
  assert(thMatches[3] === 'Description', 'G3.6', 'Column 4 is Description (positioned immediately after Paid To and before Fund)');
  assert(thMatches[4] === 'Fund', 'G3.7', 'Column 5 is Fund');
  assert(thMatches[5] === 'Category', 'G3.8', 'Column 6 is Category');
  assert(thMatches[6] === 'Mode', 'G3.9', 'Column 7 is Mode');
  assert(thMatches[7] === 'Amount', 'G3.10', 'Column 8 is Amount');
  assert(thMatches[8] === 'Status', 'G3.11', 'Column 9 is Status');
  assert(thMatches[9] === 'Actions', 'G3.12', 'Column 10 is Actions');
}

// =========================================================================
// GROUP 4: In-Memory VM Sandbox: Data Rendering & Formatting
// =========================================================================
console.log('\n--- GROUP 4: Data Rendering & Edge Cases in VM Sandbox ---');

// Setup minimal sandbox extracting esc, fmtDate, fmtMoney, getEditingRowClass
function runRendererWithPayments(paymentsList) {
  const sandbox = {
    list: paymentsList,
    window: {
      APP_SETTINGS: { templeName: 'Test Temple', address: 'Test Address' }
    },
    esc(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    fmtDate(d) { return d ? d.split('-').reverse().join('/') : ''; },
    fmtMoney(amt) { return '₹' + Number(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }); },
    getEditingRowClass(scope, id) { return ''; },
    resultHtml: ''
  };

  // Extract the map expression from Temple_Accounts-1.html
  const mapCodeMatch = htmlContent.match(/\$\{list\.map\(p\s*=>\s*`([\s\S]*?)`\)\.join\(''\)\}/);
  if (!mapCodeMatch) throw new Error('Could not extract list.map template from HTML');

  const code = `
    resultHtml = list.map(p => \`${mapCodeMatch[1]}\`).join('');
  `;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.resultHtml;
}

const mockPayments = [
  {
    id: 1,
    voucherNo: 'V-001',
    date: '2026-10-20',
    paidTo: 'Kerala Electricals',
    description: 'Stage lighting cables & switches for festival',
    fund: 'General Temple Fund',
    category: 'Electricity / Power',
    paymentMode: 'Bank',
    amount: 14500.00,
    voided: false
  },
  {
    id: 2,
    voucherNo: 'V-002',
    date: '2026-10-20',
    paidTo: 'Narayanan Namboothiri',
    description: '', // Empty string description
    fund: 'Puja Fund',
    category: 'Remuneration',
    paymentMode: 'Cash',
    amount: 5000.00,
    voided: false
  },
  {
    id: 3,
    voucherNo: 'V-003',
    date: '2026-10-20',
    paidTo: 'Suresh Kumar',
    description: null, // Null description
    fund: 'General Temple Fund',
    category: 'Miscellaneous',
    paymentMode: 'UPI',
    amount: 1200.00,
    voided: false
  },
  {
    id: 4,
    voucherNo: 'V-004',
    date: '2026-10-20',
    paidTo: 'Sree Krishna Sweets',
    description: '   ', // Whitespace-only description
    fund: 'Prasadam Fund',
    category: 'Food / Prasadam',
    paymentMode: 'Cash',
    amount: 3250.00,
    voided: false
  },
  {
    id: 5,
    voucherNo: 'V-005',
    date: '2026-10-20',
    paidTo: 'Security Systems',
    description: '<script>alert("XSS")</script> & "CCTV" maintenance', // HTML special characters
    fund: 'General Temple Fund',
    category: 'Maintenance',
    paymentMode: 'Bank',
    amount: 8000.00,
    voided: true
  }
];

const renderedRowsHtml = runRendererWithPayments(mockPayments);

// Parse rows from renderedRowsHtml
const trMatches = Array.from(renderedRowsHtml.matchAll(/<tr([\s\S]*?)<\/tr>/g)).map(m => m[0]);
assert(trMatches.length === 5, 'G4.1', `Rendered exactly 5 table rows for 5 records (found ${trMatches.length})`);

function getRowCells(trHtml) {
  return Array.from(trHtml.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/g)).map(m => m[1].trim());
}

// Row 1: Valid populated description
const cellsRow1 = getRowCells(trMatches[0]);
assert(cellsRow1.length === 10, 'G4.2', 'Row 1 has 10 cells');
assert(cellsRow1[0] === 'V-001', 'G4.3', 'Row 1 Voucher No is V-001');
assert(cellsRow1[2] === 'Kerala Electricals', 'G4.4', 'Row 1 Paid To is Kerala Electricals');
assert(cellsRow1[3] === 'Stage lighting cables &amp; switches for festival', 'G4.5', 'Row 1 Description displays correctly with HTML escaping', cellsRow1[3]);
assert(cellsRow1[4] === 'General Temple Fund', 'G4.6', 'Row 1 Fund is General Temple Fund');

// Row 2: Empty string description -> should display em-dash
const cellsRow2 = getRowCells(trMatches[1]);
assert(cellsRow2[3] === '—', 'G4.7', 'Row 2 with empty string description displays "—"', cellsRow2[3]);

// Row 3: Null description -> should display em-dash
const cellsRow3 = getRowCells(trMatches[2]);
assert(cellsRow3[3] === '—', 'G4.8', 'Row 3 with null description displays "—"', cellsRow3[3]);

// Row 4: Whitespace-only description -> should display em-dash
const cellsRow4 = getRowCells(trMatches[3]);
assert(cellsRow4[3] === '—', 'G4.9', 'Row 4 with whitespace-only description displays "—"', cellsRow4[3]);

// Row 5: HTML injection & special character neutralization
const cellsRow5 = getRowCells(trMatches[4]);
assert(!cellsRow5[3].includes('<script>'), 'G4.10', 'Row 5 does NOT contain unescaped <script> tag');
assert(cellsRow5[3] === '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;CCTV&quot; maintenance', 'G4.11', 'Row 5 safely escaped HTML entities', cellsRow5[3]);

// Check voided styling and actions preserved
assert(trMatches[4].includes('class="voided'), 'G4.12', 'Row 5 has voided row class preserved');
// Amount and Status column checks
assert(cellsRow1[7] === '₹14,500.00', 'G4.13a', 'Row 1 Amount cell displays ₹14,500.00');
assert(cellsRow5[7] === '₹8,000.00', 'G4.13b', 'Row 5 Amount cell displays ₹8,000.00');
assert(cellsRow5[8] === 'Voided', 'G4.13', 'Row 5 Status cell displays Voided');
assert(cellsRow1[8] === 'Active', 'G4.14', 'Row 1 Status cell displays Active');

// Actions column check
assert(cellsRow1[9].includes('reprintPayment(\'1\')'), 'G4.15', 'Row 1 has Print button');
assert(cellsRow1[9].includes('navigate(\'payments\', null, \'1\')'), 'G4.16', 'Row 1 has Edit button');
assert(cellsRow1[9].includes('voidRecord(\'payments\', \'1\')'), 'G4.17', 'Row 1 has Void button');
assert(cellsRow1[9].includes('deletePayment(\'1\')'), 'G4.18', 'Row 1 has Delete button');

// Row 5 voided actions: Void and Edit are hidden, Delete and Print remain
assert(!cellsRow5[9].includes('voidRecord(\'payments\', \'5\')'), 'G4.19', 'Voided Row 5 does NOT have Void button');
assert(!cellsRow5[9].includes('navigate(\'payments\', null, \'5\')'), 'G4.20', 'Voided Row 5 does NOT have Edit button');
assert(cellsRow5[9].includes('deletePayment(\'5\')'), 'G4.21', 'Voided Row 5 still has Delete button');

// =========================================================================
// GROUP 5: Form Handling, Edit Update & Persistence Verification
// =========================================================================
console.log('\n--- GROUP 5: Form Handling & Edit Persistence Verification ---');

// Verify form contains name="description"
assert(htmlContent.includes('<div class="form-group"><label>Description</label><input type="text" name="description" value="${esc(editRec ? editRec.description : \'\')}"></div>'),
  'G5.1', 'Payment form input for description reads existing editRec.description');

// Verify savePayment extracts description
assert(htmlContent.includes("description: fd.get('description') || ''"),
  'G5.2', 'savePayment reads fd.get(\'description\')');

// Verify editing flow: edit updating description updates record in mock store and table re-render
{
  const testStore = {
    1: { id: 1, voucherNo: 'V-001', date: '2026-10-20', paidTo: 'Vendor A', description: 'Original Description', fund: 'General', category: 'Supplies', amount: 100 }
  };

  // Simulate updating description
  const updatedDesc = 'Updated Description for Vendor A';
  testStore[1].description = updatedDesc;

  const updatedRowsHtml = runRendererWithPayments(Object.values(testStore));
  const updatedCells = getRowCells(updatedRowsHtml);
  assert(updatedCells[3] === updatedDesc, 'G5.3', 'Editing payment updates description in table row', updatedCells[3]);

  // Simulate updating to empty
  testStore[1].description = '';
  const clearedRowsHtml = runRendererWithPayments(Object.values(testStore));
  const clearedCells = getRowCells(clearedRowsHtml);
  assert(clearedCells[3] === '—', 'G5.4', 'Clearing description on edit displays "—"', clearedCells[3]);
}

// =========================================================================
// GROUP 6: Filter, Search & Export Verification
// =========================================================================
console.log('\n--- GROUP 6: Filter, Search & Export Verification ---');

// Filter table function checks tr.textContent
assert(htmlContent.includes("qsa('#paymentTable tbody tr').forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });"),
  'G6.1', 'filterPaymentTable searches entire tr.textContent including new Description column');

// exportCSV contains Description
assert(htmlContent.includes("const rows = [['VoucherNo', 'Date', 'PaidTo', 'Fund', 'Category', 'Description', 'PaymentMode', 'BankAccount', 'Amount', 'BillNo', 'Remarks', 'Status']];"),
  'G6.2', 'exportCSV(\'payments\') contains Description in CSV header');
assert(htmlContent.includes('p.voucherNo, p.date, p.paidTo, p.fund, p.category, p.description, p.paymentMode'),
  'G6.3', 'exportCSV(\'payments\') exports p.description in CSV rows');

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
console.log('='.repeat(80));

const resultsJson = {
  step: '33.167',
  timestamp: new Date().toISOString(),
  totalTests,
  passedTests,
  failedTests,
  preChangeHash: PRE_CHANGE_HASH,
  postChangeHash: postHash,
  backupHash,
  testResults
};

fs.writeFileSync(path.resolve(__dirname, 'step_33_167_test_results.json'), JSON.stringify(resultsJson, null, 2), 'utf8');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
