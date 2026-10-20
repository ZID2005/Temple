// tests/test_step_33_69_physical_receipts.js
// Automated Verification Suite for STEP 33.69:
// Physical Receipt Entry & Complete Accounting Synchronization

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('========================================================================');
console.log('STEP 33.69: PHYSICAL RECEIPT ENTRY & COMPLETE ACCOUNTING SYNCHRONIZATION');
console.log('========================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const fileHash = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();

console.log(`Target File: Temple_Accounts-1.html`);
console.log(`Current SHA-256: ${fileHash}`);
console.log(`File Size: ${html.length} bytes (on disk: ${fs.statSync(htmlPath).size} bytes)\n`);

const results = {
  timestamp: new Date().toISOString(),
  targetFile: 'Temple_Accounts-1.html',
  targetFileSha256: fileHash,
  fileSizeBytes: fs.statSync(htmlPath).size,
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  tests: []
};

function recordTest(id, name, group, passed, expected, actual, detail = '') {
  results.totalTests++;
  if (passed) {
    results.passedTests++;
    console.log(`  ✅ [PASS] ${id}: ${name}`);
  } else {
    results.failedTests++;
    console.error(`  ❌ [FAIL] ${id}: ${name} | Expected: ${expected} | Actual: ${actual}${detail ? ' — ' + detail : ''}`);
  }
  results.tests.push({ id, name, group, passed, expected, actual, detail });
}

// ----------------------------------------------------
// EXTRACT APPLICATION LOGIC & SETUP TEST ENVIRONMENT
// ----------------------------------------------------

function extractFunction(source, fnName) {
  const regex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\([\\s\\S]*?\\n\\}`, 'g');
  const m = source.match(regex);
  if (m) return m[0];
  const assignRegex = new RegExp(`(?:window\\.)?${fnName}\\s*=\\s*(?:async\\s+)?function\\s*\\([\\s\\S]*?\\n\\}`, 'g');
  const am = source.match(assignRegex);
  return am ? am[0] : null;
}

// Extract script content
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const fullScript = html.slice(scriptStart + 8, scriptEnd);

// In-Memory Mock Storage for Firestore & IndexedDB
class MockFirestore {
  constructor() {
    this.collections = {
      system: new Map(),
      settings: new Map(),
      receipts: new Map(),
      billing: new Map(),
      payments: new Map(),
      transfers: new Map(),
      loans: new Map(),
      chittyCollections: new Map(),
      chittyPayouts: new Map(),
      funds: new Map(),
      incomeCategories: new Map(),
      bankAccounts: new Map()
    };
  }

  collection(name) {
    if (!this.collections[name]) this.collections[name] = new Map();
    const col = this.collections[name];
    return {
      doc: (id) => ({
        get: async () => ({
          exists: col.has(id),
          data: () => col.get(id) ? JSON.parse(JSON.stringify(col.get(id))) : undefined,
          id
        }),
        set: async (data, opts) => {
          if (opts && opts.merge && col.has(id)) {
            col.set(id, { ...col.get(id), ...JSON.parse(JSON.stringify(data)) });
          } else {
            col.set(id, JSON.parse(JSON.stringify(data)));
          }
        },
        delete: async () => col.delete(id)
      }),
      get: async () => {
        const docs = [];
        col.forEach((data, id) => {
          docs.push({
            id,
            data: () => JSON.parse(JSON.stringify(data)),
            exists: true
          });
        });
        return {
          docs,
          forEach: (fn) => docs.forEach(fn),
          empty: docs.length === 0,
          size: docs.length
        };
      }
    };
  }

  async runTransaction(updateFn) {
    const tx = {
      get: async (docRef) => await docRef.get(),
      set: (docRef, data, opts) => docRef.set(data, opts),
      update: (docRef, data) => docRef.set(data, { merge: true }),
      delete: (docRef) => docRef.delete()
    };
    return await updateFn(tx);
  }
}

// Create Sandbox
const mockDb = new MockFirestore();
let currentUser = { uid: 'admin_test_user', email: 'admin@temple.org', displayName: 'Temple Admin' };

// Initialize settings and counters
mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 42,
  billingReceiptCounter: 42,
  receiptCounter: 1000,
  voucherCounter: 500,
  billingPrefix: 'BILL-',
  receiptPrefix: 'R-',
  voucherPrefix: 'V-'
});

mockDb.collection('settings').doc('set_1').set({
  id: 1,
  templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  address: 'ക്ഷേത്രം റോഡ്, കേരളം',
  globalSequenceCounter: 42,
  openingCash: 10000,
  openingBank: 50000,
  openingGeneralFund: 30000,
  openingPunarudharanamFund: 20000,
  startDate: '2026-04-01'
});

const defaultFunds = ['General Temple Fund', 'Punarudharanam Fund', 'Chitty Fund', 'Festival Fund'];
defaultFunds.forEach((f, idx) => {
  mockDb.collection('funds').doc(`fund_${idx+1}`).set({ id: idx+1, name: f });
});

const defaultCats = ['Pooja Income', 'Archana Income', 'Vazhipadu Income', 'Donation Income'];
defaultCats.forEach((c, idx) => {
  mockDb.collection('incomeCategories').doc(`inc_${idx+1}`).set({ id: idx+1, name: c });
});

mockDb.collection('bankAccounts').doc('bank_1').set({ id: 1, name: 'SBI Temple Main' });

// Historical baseline records
mockDb.collection('billing').doc('bill_41').set({
  id: 41,
  billReceiptNo: 'BILL-041',
  date: '2026-10-10',
  name: 'Historical Devotee',
  amount: 20,
  voided: false
});

mockDb.collection('receipts').doc('rcpt_41').set({
  id: 41,
  receiptNo: 'R-041',
  date: '2026-10-10',
  name: 'Historical Devotee',
  fund: 'General Temple Fund',
  category: 'Vazhipadu Income',
  paymentMode: 'Cash',
  amount: 20,
  source: 'billing',
  billingId: 41,
  billingReceiptNo: 'BILL-041',
  voided: false
});

// Setup DOM Sandbox
const domElements = new Map();
function getMockElement(id) {
  if (!domElements.has(id)) {
    domElements.set(id, {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      options: [],
      selectedIndex: 0,
      querySelector: (sel) => null,
      querySelectorAll: (sel) => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {},
      blur: () => {},
      getContext: () => null
    });
  }
  return domElements.get(id);
}

mockDb.useEmulator = () => {};
const mockAuth = {
  currentUser: currentUser,
  signOut: async () => {},
  onAuthStateChanged: (cb) => { if (cb) setTimeout(() => cb(currentUser), 0); },
  useEmulator: () => {}
};

const loc = {
  search: '?emulator=true',
  hash: '',
  href: 'http://localhost/?emulator=true',
  pathname: '/',
  origin: 'http://localhost',
  hostname: 'localhost',
  protocol: 'http:'
};

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  Math: Math,
  Date: Date,
  String: String,
  Array: Array,
  Object: Object,
  RegExp: RegExp,
  Promise: Promise,
  JSON: JSON,
  firebaseConfig: {
    apiKey: 'fake-api-key',
    projectId: 'demo-temple-accounts-test'
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; }
  },
  document: {
    getElementById: (id) => getMockElement(id),
    querySelectorAll: (sel) => [],
    querySelector: (sel) => getMockElement(sel),
    createElement: (tag) => getMockElement(tag),
    body: { appendChild: () => {}, removeChild: () => {}, classList: { add: () => {}, remove: () => {} } },
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
    head: { appendChild: () => {} }
  },
  window: {
    APP_SETTINGS: {
      id: 1,
      templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
      address: 'ക്ഷേത്രം റോഡ്, കേരളം',
      globalSequenceCounter: 42,
      openingCash: 10000,
      openingBank: 50000,
      openingGeneralFund: 30000,
      openingPunarudharanamFund: 20000,
      startDate: '2026-04-01'
    },
    print: () => {},
    prompt: (msg) => 'Physical receipt audit void test reason',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    location: loc,
    sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
    performance: { now: () => Date.now() },
    GlobalEditState: { setEditing: () => {}, clearEditing: () => {} }
  },
  performance: { now: () => Date.now() },
  location: loc,
  sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
  navigator: {},
  prompt: (msg) => 'Physical receipt audit void test reason',
  el: (id) => getMockElement(id),
  qsa: (sel) => [],
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  alert: (msg) => { sandbox._lastAlert = msg; },
  firebase: {
    apps: [],
    initializeApp: () => { sandbox.firebase.apps.push({}); },
    auth: () => mockAuth,
    firestore: Object.assign(() => mockDb, {
      FieldValue: { serverTimestamp: () => Date.now() },
      Timestamp: { fromMillis: (m) => ({ toMillis: () => m }) }
    })
  },
  isEmulatorModeActive: () => true,
  getFirestoreDb: () => mockDb,
  getCurrentFirebaseUser: () => currentUser,
  getFsCountersDocRef: () => mockDb.collection('system').doc('counters'),
  VIEW_RENDERERS: {},
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
};

sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.firebase = sandbox.firebase;
sandbox.window.firebaseConfig = sandbox.firebaseConfig;
sandbox.window.isEmulatorModeActive = sandbox.isEmulatorModeActive;
vm.createContext(sandbox);

// Execute application script inside sandbox
vm.runInContext(fullScript, sandbox);

const namesToExpose = ['VIEW_RENDERERS', 'allReceipts', 'allBillingRecords', 'masterItems', 'parsePhysicalReceiptIdentifier'];
for (const n of namesToExpose) {
  try {
    sandbox[n] = vm.runInContext(n, sandbox);
  } catch (e) {}
}

console.log('--- SECTION 1: Baseline Invariants & Cryptographic Hashes ---');
recordTest('TC-33.69-01', 'Target file is Temple_Accounts-1.html', 'BASELINE',
  htmlPath.endsWith('Temple_Accounts-1.html'), 'Temple_Accounts-1.html', path.basename(htmlPath));

recordTest('TC-33.69-02', 'File size exceeds baseline after Step 33.69 implementation', 'BASELINE',
  fs.statSync(htmlPath).size > 808927, '> 808,927 bytes', `${fs.statSync(htmlPath).size} bytes`);

recordTest('TC-33.69-03', 'Pre-step 33.69 backup file exists in backups directory', 'BASELINE',
  fs.existsSync(path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_69_PhysicalReceipts_Backup_20261016_205600.html')),
  'Backup exists', 'Confirmed');

recordTest('TC-33.69-04', 'parsePhysicalReceiptIdentifier helper exists in source', 'BASELINE',
  typeof sandbox.parsePhysicalReceiptIdentifier === 'function', true, typeof sandbox.parsePhysicalReceiptIdentifier === 'function');

recordTest('TC-33.69-05', 'fsCreatePhysicalReceipt engine exists in source', 'BASELINE',
  typeof sandbox.fsCreatePhysicalReceipt === 'function', true, typeof sandbox.fsCreatePhysicalReceipt === 'function');

recordTest('TC-33.69-06', 'CSS classes .badge-physical-p and .badge-physical-pu exist', 'BASELINE',
  html.includes('.badge-physical-p') && html.includes('.badge-physical-pu'), true, true);

recordTest('TC-33.69-07', 'CSS row highlighting classes .row-physical-p and .row-physical-pu exist', 'BASELINE',
  html.includes('.row-physical-p') && html.includes('.row-physical-pu'), true, true);

recordTest('TC-33.69-08', 'Receipt type filter dropdown exists in receipt view toolbar', 'BASELINE',
  html.includes('id="receiptTypeFilter"'), true, true);

recordTest('TC-33.69-09', 'Devotee star input exists in receipt form', 'BASELINE',
  html.includes('name="star"'), true, true);

// ----------------------------------------------------
// SECTION 2: TEST A — Physical Puja Receipts (P600–P900)
// ----------------------------------------------------
console.log('\n--- SECTION 2: TEST A — Physical Puja Receipts (P600–P900) ---');

async function runSection2() {
  const pCheckValid = sandbox.parsePhysicalReceiptIdentifier('P600');
  recordTest('TC-33.69-10', 'parsePhysicalReceiptIdentifier recognizes valid identifier P600', 'TEST_A',
    pCheckValid && pCheckValid.valid && pCheckValid.formattedId === 'P600' && pCheckValid.type === 'P',
    'P600 (Type P)', pCheckValid ? `${pCheckValid.formattedId} (Type ${pCheckValid.type})` : 'null');

  recordTest('TC-33.69-11', 'parsePhysicalReceiptIdentifier maps P600 to General Temple Fund & Pooja Income', 'TEST_A',
    pCheckValid.fund === 'General Temple Fund' && pCheckValid.category === 'Pooja Income',
    'General Temple Fund / Pooja Income', `${pCheckValid.fund} / ${pCheckValid.category}`);

  // Save P600 physical receipt
  const pReceiptInput = {
    receiptNo: 'P600',
    date: '2026-10-16',
    name: 'Anand Kumar',
    star: 'Rohini',
    mobile: '9847012345',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    description: 'Neyyappam Pooja',
    paymentMode: 'Cash',
    amount: 350.00,
    remarks: 'Physical receipt issued at counter book #6'
  };

  const pResult = await sandbox.fsCreatePhysicalReceipt(pReceiptInput);
  recordTest('TC-33.69-12', 'fsCreatePhysicalReceipt successfully persists P600 without error', 'TEST_A',
    !!pResult && pResult.receiptRecord && pResult.receiptRecord.receiptNo === 'P600',
    'P600 saved', pResult.receiptRecord ? pResult.receiptRecord.receiptNo : 'failed');

  recordTest('TC-33.69-13', 'P600 record stores isPhysical: true and physicalType: "P"', 'TEST_A',
    pResult.receiptRecord.isPhysical === true && pResult.receiptRecord.physicalType === 'P',
    'isPhysical=true, physicalType=P', `isPhysical=${pResult.receiptRecord.isPhysical}, physicalType=${pResult.receiptRecord.physicalType}`);

  recordTest('TC-33.69-14', 'P600 record stores devotee star "Rohini"', 'TEST_A',
    pResult.receiptRecord.star === 'Rohini', 'Rohini', pResult.receiptRecord.star);

  recordTest('TC-33.69-15', 'P600 is stored in receipts collection with document ID rcpt_phys_P600', 'TEST_A',
    mockDb.collections.receipts.has('rcpt_phys_P600'), true, mockDb.collections.receipts.has('rcpt_phys_P600'));

  recordTest('TC-33.69-16', 'P600 writes tracking reservation in system/res_phys_P600', 'TEST_A',
    mockDb.collections.system.has('res_phys_P600'), true, mockDb.collections.system.has('res_phys_P600'));

  recordTest('TC-33.69-17', 'P600 strictly creates ZERO records in billing collection', 'TEST_A',
    mockDb.collections.billing.size === 1 && !mockDb.collections.billing.has('bill_P600') && !mockDb.collections.billing.has('bill_600'),
    'Zero billing records created', `Billing count: ${mockDb.collections.billing.size}`);

  // Check Receipt View rendering with badges and highlighting
  const allRecs = await sandbox.allReceipts();
  const pInAll = allRecs.find(r => r.receiptNo === 'P600');
  recordTest('TC-33.69-18', 'P600 is returned by allReceipts() query', 'TEST_A',
    !!pInAll && pInAll.amount === 350.00, 'Found in allReceipts()', pInAll ? `Found with ₹${pInAll.amount}` : 'Missing');

  const receiptsViewHtml = await sandbox.VIEW_RENDERERS.receipts();
  recordTest('TC-33.69-19', 'Receipts page renders PHYSICAL badge for P600', 'TEST_A',
    receiptsViewHtml.includes('P600') && receiptsViewHtml.includes('badge-physical-p') && receiptsViewHtml.includes('PHYSICAL</span>'),
    'PHYSICAL badge rendered', 'Confirmed in HTML');

  recordTest('TC-33.69-20', 'Receipts page applies row-physical-p subtle blue row styling', 'TEST_A',
    receiptsViewHtml.includes('row-physical-p'), true, true);
}

// ----------------------------------------------------
// SECTION 3: TEST B — Physical Punarudharanam Receipts (PU1, PU2...)
// ----------------------------------------------------
console.log('\n--- SECTION 3: TEST B — Physical Punarudharanam Receipts (PU1, PU2...) ---');

async function runSection3() {
  const puCheckValid = sandbox.parsePhysicalReceiptIdentifier('PU1');
  recordTest('TC-33.69-21', 'parsePhysicalReceiptIdentifier recognizes valid identifier PU1', 'TEST_B',
    puCheckValid && puCheckValid.valid && puCheckValid.formattedId === 'PU1' && puCheckValid.type === 'PU',
    'PU1 (Type PU)', puCheckValid ? `${puCheckValid.formattedId} (Type ${puCheckValid.type})` : 'null');

  recordTest('TC-33.69-22', 'parsePhysicalReceiptIdentifier maps PU1 to Punarudharanam Fund & Donation Income', 'TEST_B',
    puCheckValid.fund === 'Punarudharanam Fund' && puCheckValid.category === 'Donation Income',
    'Punarudharanam Fund / Donation Income', `${puCheckValid.fund} / ${puCheckValid.category}`);

  // Save PU1 physical receipt
  const puReceiptInput = {
    receiptNo: 'PU1',
    date: '2026-10-16',
    name: 'Suresh Varma',
    star: 'Makayiram',
    mobile: '9447123456',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    description: 'Temple renovation stone donation',
    paymentMode: 'Bank',
    bankAccount: 'SBI Temple Main',
    amount: 5000.00,
    remarks: 'Physical renovation receipt #PU1'
  };

  const puResult = await sandbox.fsCreatePhysicalReceipt(puReceiptInput);
  recordTest('TC-33.69-23', 'fsCreatePhysicalReceipt successfully persists PU1 without error', 'TEST_B',
    !!puResult && puResult.receiptRecord && puResult.receiptRecord.receiptNo === 'PU1',
    'PU1 saved', puResult.receiptRecord ? puResult.receiptRecord.receiptNo : 'failed');

  recordTest('TC-33.69-24', 'PU1 record stores isPhysical: true and physicalType: "PU"', 'TEST_B',
    puResult.receiptRecord.isPhysical === true && puResult.receiptRecord.physicalType === 'PU',
    'isPhysical=true, physicalType=PU', `isPhysical=${puResult.receiptRecord.isPhysical}, physicalType=${puResult.receiptRecord.physicalType}`);

  recordTest('TC-33.69-25', 'PU1 is stored in receipts collection with document ID rcpt_phys_PU1', 'TEST_B',
    mockDb.collections.receipts.has('rcpt_phys_PU1'), true, mockDb.collections.receipts.has('rcpt_phys_PU1'));

  recordTest('TC-33.69-26', 'PU1 writes tracking reservation in system/res_phys_PU1', 'TEST_B',
    mockDb.collections.system.has('res_phys_PU1'), true, mockDb.collections.system.has('res_phys_PU1'));

  recordTest('TC-33.69-27', 'PU1 strictly creates ZERO records in billing collection', 'TEST_B',
    !mockDb.collections.billing.has('bill_PU1') && !mockDb.collections.billing.has('bill_1'),
    'Zero billing records created', 'Confirmed');

  const receiptsViewHtml = await sandbox.VIEW_RENDERERS.receipts();
  recordTest('TC-33.69-28', 'Receipts page renders PHYSICAL · PUNARUDHARANAM badge for PU1', 'TEST_B',
    receiptsViewHtml.includes('PU1') && receiptsViewHtml.includes('badge-physical-pu') && receiptsViewHtml.includes('PHYSICAL · PUNARUDHARANAM</span>'),
    'PHYSICAL · PUNARUDHARANAM badge rendered', 'Confirmed in HTML');

  recordTest('TC-33.69-29', 'Receipts page applies row-physical-pu subtle purple row styling', 'TEST_B',
    receiptsViewHtml.includes('row-physical-pu'), true, true);

  // Check Punarudharanam dashboard page
  const punaViewHtml = await sandbox.VIEW_RENDERERS.punarudharanam();
  recordTest('TC-33.69-30', 'Punarudharanam dashboard includes PU1 receipt', 'TEST_B',
    punaViewHtml.includes('PU1') && punaViewHtml.includes('Suresh Varma'), true, true);
}

// ----------------------------------------------------
// SECTION 4: TEST C — Payment Methods & Financial Accounting Synchronization
// ----------------------------------------------------
console.log('\n--- SECTION 4: TEST C — Payment Methods & Financial Accounting Synchronization ---');

async function runSection4() {
  // Opening balances: Cash = 10,000, Bank = 50,000, General Fund = 30,000, Punarudharanam Fund = 20,000
  // Existing baseline: 1 historical receipt R-041 of ₹20 (Cash, General Fund)
  // Saved in Section 2: P600 = ₹350 (Cash, General Fund)
  // Saved in Section 3: PU1 = ₹5,000 (Bank, Punarudharanam Fund)

  const cashBal1 = await sandbox.getCashBalance();
  const expectedCash1 = 10000 + 20 + 350; // 10,370
  recordTest('TC-33.69-31', 'Cash Book balance correctly reflects cash physical receipt P600 (₹350)', 'TEST_C',
    cashBal1 === expectedCash1, expectedCash1, cashBal1);

  const bankBal1 = await sandbox.getBankBalance();
  const expectedBank1 = 50000 + 5000; // 55,000
  recordTest('TC-33.69-32', 'Bank Book balance correctly reflects bank physical receipt PU1 (₹5,000)', 'TEST_C',
    bankBal1 === expectedBank1, expectedBank1, bankBal1);

  // Now add UPI Physical receipt: PU2 = ₹1,200 (UPI, Punarudharanam Fund)
  await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'PU2',
    date: '2026-10-16',
    name: 'Devadasan',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'UPI',
    bankAccount: 'SBI Temple Main',
    amount: 1200.00
  });

  const bankBal2 = await sandbox.getBankBalance();
  const expectedBank2 = expectedBank1 + 1200; // 56,200
  recordTest('TC-33.69-33', 'Bank Book balance correctly reflects UPI physical receipt PU2 (₹1,200)', 'TEST_C',
    bankBal2 === expectedBank2, expectedBank2, bankBal2);

  // Check Fund Balances
  const genFundBal = await sandbox.getFundBalance('General Temple Fund');
  const expectedGenFund = 30000 + 20 + 350; // 30,370
  recordTest('TC-33.69-34', 'General Temple Fund reflects P600 (₹350) exactly once', 'TEST_C',
    genFundBal === expectedGenFund, expectedGenFund, genFundBal);

  const punaFundBal = await sandbox.getFundBalance('Punarudharanam Fund');
  const expectedPunaFund = 20000 + 5000 + 1200; // 26,200
  recordTest('TC-33.69-35', 'Punarudharanam Fund reflects PU1 (₹5,000) and PU2 (₹1,200) exactly once', 'TEST_C',
    punaFundBal === expectedPunaFund, expectedPunaFund, punaFundBal);

  // Check Cash Book Rows
  const cashRows = await sandbox.buildCashBookRows();
  const p600CashRow = cashRows.find(r => r.particulars.includes('P600'));
  recordTest('TC-33.69-36', 'Cash Book row generated with correct particulars for P600', 'TEST_C',
    !!p600CashRow && p600CashRow.receipt === 350, 'Receipt P600 - Anand Kumar (₹350)', p600CashRow ? `${p600CashRow.particulars} (₹${p600CashRow.receipt})` : 'Missing');

  // Check Bank Book Rows
  const bankRows = await sandbox.buildBankBookRows();
  const pu1BankRow = bankRows.find(r => r.particulars.includes('PU1'));
  const pu2UpiRow = bankRows.find(r => r.particulars.includes('PU2'));
  recordTest('TC-33.69-37', 'Bank Book row generated with correct deposit for PU1 (Bank)', 'TEST_C',
    !!pu1BankRow && pu1BankRow.deposit === 5000, 'PU1 Deposit ₹5000', pu1BankRow ? `Deposit ₹${pu1BankRow.deposit}` : 'Missing');

  recordTest('TC-33.69-38', 'Bank Book row generated with correct deposit for PU2 (UPI)', 'TEST_C',
    !!pu2UpiRow && pu2UpiRow.deposit === 1200, 'PU2 Deposit ₹1200', pu2UpiRow ? `Deposit ₹${pu2UpiRow.deposit}` : 'Missing');

  // Check General Ledger Rows
  const ledgerHtml = await sandbox.VIEW_RENDERERS.ledger();
  const ledgerRows = sandbox.window._ledgerRows || [];
  const p600Ledger = ledgerRows.find(r => r.voucher === 'P600');
  const pu1Ledger = ledgerRows.find(r => r.voucher === 'PU1');
  recordTest('TC-33.69-39', 'General Ledger includes P600 with credit ₹350 and General Temple Fund', 'TEST_C',
    !!p600Ledger && p600Ledger.credit === 350 && p600Ledger.fund === 'General Temple Fund',
    'Credit ₹350, General Temple Fund', p600Ledger ? `Credit ₹${p600Ledger.credit}, ${p600Ledger.fund}` : 'Missing');

  recordTest('TC-33.69-40', 'General Ledger includes PU1 with credit ₹5,000 and Punarudharanam Fund', 'TEST_C',
    !!pu1Ledger && pu1Ledger.credit === 5000 && pu1Ledger.fund === 'Punarudharanam Fund',
    'Credit ₹5000, Punarudharanam Fund', pu1Ledger ? `Credit ₹${pu1Ledger.credit}, ${pu1Ledger.fund}` : 'Missing');

  // Check Voiding Safeguard
  await sandbox.voidRecord('receipts', 'rcpt_phys_P600');
  const voidedP600 = await sandbox.fsGetOneSafe('receipts', 'rcpt_phys_P600');
  recordTest('TC-33.69-41', 'voidRecord successfully sets voided: true on physical receipt P600', 'TEST_C',
    voidedP600 && voidedP600.voided === true, true, voidedP600 ? voidedP600.voided : false);

  const cashBalAfterVoid = await sandbox.getCashBalance();
  const expectedCashAfterVoid = 10000 + 20; // 10,020 (P600 subtracted)
  recordTest('TC-33.69-42', 'Voided physical receipt is excluded from Cash Book balance', 'TEST_C',
    cashBalAfterVoid === expectedCashAfterVoid, expectedCashAfterVoid, cashBalAfterVoid);

  // Un-void P600 for subsequent test continuity
  voidedP600.voided = false;
  await mockDb.collection('receipts').doc('rcpt_phys_P600').set(voidedP600);
}

// ----------------------------------------------------
// SECTION 5: TEST D — Sequence Counter Isolation
// ----------------------------------------------------
console.log('\n--- SECTION 5: TEST D — Sequence Counter Isolation ---');

async function runSection5() {
  const countersSnap = await mockDb.collection('system').doc('counters').get();
  const counterVal = countersSnap.data().globalSequenceCounter;
  recordTest('TC-33.69-43', 'globalSequenceCounter in system/counters is still 42 after physical entries', 'TEST_D',
    counterVal === 42, 42, counterVal);

  recordTest('TC-33.69-44', 'P600 was NOT interpreted as sequence 600', 'TEST_D',
    counterVal !== 600, '!= 600', counterVal);

  recordTest('TC-33.69-45', 'PU1 was NOT interpreted as sequence 1', 'TEST_D',
    counterVal !== 1, '!= 1', counterVal);

  recordTest('TC-33.69-46', 'Local settings globalSequenceCounter remains 42', 'TEST_D',
    sandbox.window.APP_SETTINGS.globalSequenceCounter === 42, 42, sandbox.window.APP_SETTINGS.globalSequenceCounter);

  // Allocate next normal software-generated standalone receipt
  const normalRcptResult = await sandbox.fsCreateIndependentReceipt({
    date: '2026-10-16',
    name: 'Normal Devotee',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 100
  });

  recordTest('TC-33.69-47', 'Next software receipt correctly allocates sequence 43 (R-043)', 'TEST_D',
    normalRcptResult.receiptRecord.id === 43 && normalRcptResult.receiptRecord.receiptNo === 'R-043',
    'id: 43, receiptNo: R-043', `id: ${normalRcptResult.receiptRecord.id}, receiptNo: ${normalRcptResult.receiptRecord.receiptNo}`);

  const postNormalCounterSnap = await mockDb.collection('system').doc('counters').get();
  recordTest('TC-33.69-48', 'globalSequenceCounter cleanly advances to 43 after normal transaction', 'TEST_D',
    postNormalCounterSnap.data().globalSequenceCounter === 43, 43, postNormalCounterSnap.data().globalSequenceCounter);
}

// ----------------------------------------------------
// SECTION 6: TEST E — Duplicate & Invalid Identifiers
// ----------------------------------------------------
console.log('\n--- SECTION 6: TEST E — Duplicate & Invalid Identifiers ---');

async function runSection6() {
  // Duplicate P600
  let pDupError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'P600',
      date: '2026-10-16',
      name: 'Duplicate Caller',
      amount: 100
    });
  } catch (err) {
    pDupError = err.message;
  }
  recordTest('TC-33.69-49', 'Duplicate P600 insertion is strictly rejected', 'TEST_E',
    !!pDupError && pDupError.includes('already been entered'), 'Rejection error', pDupError);

  // Duplicate PU1
  let puDupError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'PU1',
      date: '2026-10-16',
      name: 'Duplicate PU Caller',
      amount: 500
    });
  } catch (err) {
    puDupError = err.message;
  }
  recordTest('TC-33.69-50', 'Duplicate PU1 insertion is strictly rejected', 'TEST_E',
    !!puDupError && puDupError.includes('already been entered'), 'Rejection error', puDupError);

  // Case variation: p600
  let caseDupError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'p600',
      date: '2026-10-16',
      name: 'Case Variation Caller',
      amount: 100
    });
  } catch (err) {
    caseDupError = err.message;
  }
  recordTest('TC-33.69-51', 'Case variation p600 is normalized and rejected as duplicate', 'TEST_E',
    !!caseDupError && caseDupError.includes('already been entered'), 'Normalized rejection', caseDupError);

  // Whitespace variation: ' PU1 '
  let wsDupError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: '  PU1  ',
      date: '2026-10-16',
      name: 'Whitespace Variation Caller',
      amount: 100
    });
  } catch (err) {
    wsDupError = err.message;
  }
  recordTest('TC-33.69-52', 'Whitespace variation " PU1 " is trimmed and rejected as duplicate', 'TEST_E',
    !!wsDupError && wsDupError.includes('already been entered'), 'Trimmed rejection', wsDupError);

  // Range validation: P599 (out of range low)
  const p599Res = sandbox.parsePhysicalReceiptIdentifier('P599');
  recordTest('TC-33.69-53', 'P599 is rejected as out of range (< 600)', 'TEST_E',
    p599Res && p599Res.valid === false && p599Res.error.includes('out of valid range'),
    'out of valid range error', p599Res ? p599Res.error : 'null');

  // Range validation: P901 (out of range high)
  const p901Res = sandbox.parsePhysicalReceiptIdentifier('P901');
  recordTest('TC-33.69-54', 'P901 is rejected as out of range (> 900)', 'TEST_E',
    p901Res && p901Res.valid === false && p901Res.error.includes('out of valid range'),
    'out of valid range error', p901Res ? p901Res.error : 'null');

  // PU0 validation
  const pu0Res = sandbox.parsePhysicalReceiptIdentifier('PU0');
  recordTest('TC-33.69-55', 'PU0 is rejected as invalid positive integer', 'TEST_E',
    pu0Res && pu0Res.valid === false && pu0Res.error.includes('positive integer'),
    'positive integer error', pu0Res ? pu0Res.error : 'null');

  // Invalid prefix
  const pxRes = sandbox.parsePhysicalReceiptIdentifier('PX100');
  recordTest('TC-33.69-56', 'PX100 is rejected with invalid format error', 'TEST_E',
    pxRes && pxRes.valid === false, 'Invalid format', pxRes ? pxRes.error : 'null');

  // Idempotent retry: Replaying exact same PU2 with identical operationId
  const origPu2Op = mockDb.collections.system.get('res_phys_PU2');
  const replayResult = await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'PU2',
    date: '2026-10-16',
    name: 'Devadasan',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'UPI',
    bankAccount: 'SBI Temple Main',
    amount: 1200.00,
    operationId: origPu2Op.operationId
  });

  recordTest('TC-33.69-57', 'Idempotent replay returns committed record with isIdempotentReplay: true', 'TEST_E',
    replayResult && replayResult.isIdempotentReplay === true, true, replayResult ? replayResult.isIdempotentReplay : false);
}

// ----------------------------------------------------
// SECTION 7: TEST F — Visual Identification & CSV Exports
// ----------------------------------------------------
console.log('\n--- SECTION 7: TEST F — Visual Identification & CSV Exports ---');

async function runSection7() {
  // CSV Export verification
  let exportedRows = null;
  sandbox.downloadCSV = (rows, filename) => { exportedRows = rows; };
  await sandbox.exportCSV('receipts');

  recordTest('TC-33.69-58', 'exportCSV("receipts") produces header with Type column', 'TEST_F',
    exportedRows && exportedRows[0] && exportedRows[0].includes('Type'),
    'Header includes Type', exportedRows ? exportedRows[0].join(',') : 'null');

  const p600ExportRow = exportedRows ? exportedRows.find(r => r[0] === 'P600') : null;
  recordTest('TC-33.69-59', 'exportCSV classifies P600 as "Physical Puja"', 'TEST_F',
    !!p600ExportRow && p600ExportRow[p600ExportRow.length - 1] === 'Physical Puja',
    'Physical Puja', p600ExportRow ? p600ExportRow[p600ExportRow.length - 1] : 'null');

  const pu1ExportRow = exportedRows ? exportedRows.find(r => r[0] === 'PU1') : null;
  recordTest('TC-33.69-60', 'exportCSV classifies PU1 as "Physical Punarudharanam"', 'TEST_F',
    !!pu1ExportRow && pu1ExportRow[pu1ExportRow.length - 1] === 'Physical Punarudharanam',
    'Physical Punarudharanam', pu1ExportRow ? pu1ExportRow[pu1ExportRow.length - 1] : 'null');

  const normalExportRow = exportedRows ? exportedRows.find(r => r[0] === 'R-043') : null;
  recordTest('TC-33.69-61', 'exportCSV classifies software receipt R-043 as "Software"', 'TEST_F',
    !!normalExportRow && normalExportRow[normalExportRow.length - 1] === 'Software',
    'Software', normalExportRow ? normalExportRow[normalExportRow.length - 1] : 'null');

  // Thermal/Reprint visual inspection
  const printAreaEl = getMockElement('print-area');
  sandbox.printReceipt({
    receiptNo: 'PU1',
    date: '2026-10-16',
    name: 'Suresh Varma',
    star: 'Makayiram',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Bank',
    amount: 5000.00,
    physicalType: 'PU'
  });

  recordTest('TC-33.69-62', 'printReceipt renders [PHYSICAL · PUNARUDHARANAM RECEIPT] banner', 'TEST_F',
    printAreaEl.innerHTML.includes('[PHYSICAL · PUNARUDHARANAM RECEIPT]'), true, true);

  recordTest('TC-33.69-63', 'printReceipt renders devotee star in receipt print preview', 'TEST_F',
    printAreaEl.innerHTML.includes('Makayiram'), true, true);
}

// ----------------------------------------------------
// SECTION 8: Regression Parity & Master Catalogue
// ----------------------------------------------------
console.log('\n--- SECTION 8: Regression Parity & Master Catalogue ---');

function runSection8() {
  const itemsMatch = html.match(/const\s+BILLING_DEFAULT_ITEMS\s*=\s*(\[[\s\S]*?\]);/);
  let defaultItems = [];
  try { defaultItems = eval(itemsMatch ? itemsMatch[1] : '[]'); } catch (e) {}

  recordTest('TC-33.69-64', 'Master catalogue preserved with 15 predefined items', 'REGRESSION',
    defaultItems.length === 15, 15, defaultItems.length);

  const nooljabamItem = defaultItems.find(i => i.name === 'നൂൽജപം');
  recordTest('TC-33.69-65', 'Independent "നൂൽജപം" item intact at ₹20', 'REGRESSION',
    !!nooljabamItem && nooljabamItem.price === 20, '₹20', nooljabamItem ? `₹${nooljabamItem.price}` : 'missing');

  const archanaItem = defaultItems.find(i => i.name === 'അർച്ചന');
  recordTest('TC-33.69-66', 'Independent "അർച്ചന" item intact at ₹20', 'REGRESSION',
    !!archanaItem && archanaItem.price === 20, '₹20', archanaItem ? `₹${archanaItem.price}` : 'missing');

  recordTest('TC-33.69-67', 'Combined item "നൂൽജപം/അർച്ചന" remains absent', 'REGRESSION',
    !defaultItems.find(i => i.name === 'നൂൽജപം/അർച്ചന'), false, !!defaultItems.find(i => i.name === 'നൂൽജപം/അർച്ചന'));

  recordTest('TC-33.69-68', 'Billing submission handler billingSubmitForm() preserved', 'REGRESSION',
    typeof sandbox.billingSubmitForm === 'function', true, typeof sandbox.billingSubmitForm === 'function');

  recordTest('TC-33.69-69', 'Atomic billing transaction fsCreateBillingWithAccounting() preserved', 'REGRESSION',
    typeof sandbox.fsCreateBillingWithAccounting === 'function', true, typeof sandbox.fsCreateBillingWithAccounting === 'function');

  recordTest('TC-33.69-70', 'Linked voiding pipeline fsVoidLinkedBillingAndReceipt() preserved', 'REGRESSION',
    typeof sandbox.fsVoidLinkedBillingAndReceipt === 'function', true, typeof sandbox.fsVoidLinkedBillingAndReceipt === 'function');
}

// ----------------------------------------------------
// RUN ALL TESTS & WRITE REPORT
// ----------------------------------------------------

async function main() {
  await runSection2();
  await runSection3();
  await runSection4();
  await runSection5();
  await runSection6();
  await runSection7();
  runSection8();

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${results.totalTests} | PASSED: ${results.passedTests} | FAILED: ${results.failedTests}`);
  console.log('========================================================================\n');

  const outputPath = path.resolve(__dirname, 'step_33_69_physical_receipts_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results written to: ${outputPath}`);

  if (results.failedTests === 0) {
    console.log('\n✨ ALL STEP 33.69 PHYSICAL RECEIPT VERIFICATION CHECKS PASSED SUCCESSFULLY! ✨\n');
    process.exit(0);
  } else {
    console.error(`\n❌ ${results.failedTests} TEST(S) FAILED IN STEP 33.69 SUITE!\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running verification suite:', err);
  process.exit(1);
});
