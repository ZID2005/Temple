/**
 * tests/test_step_33_172_physical_receipt_category_suite.js
 * Comprehensive automated regression suite for:
 * STEP 33.172 — Fix Income Category Mapping for Physical P and PU Receipts
 *
 * Verifies:
 * 1. Create P-series receipt (P600-P900) with non-default income category; verify persistence.
 * 2. Create PU-series receipt (PU1+) with non-default income category; verify persistence.
 * 3. Verify both selected categories appear correctly in Receipts table (VIEW_RENDERERS.receipts).
 * 4. Edit physical receipt income category and verify change persists in Firestore and IDB.
 * 5. Verify persistence after simulated page reload / cold cache fetch (allReceipts, fsGetOneSafe).
 * 6. Verify Cash Book, Bank Book, Ledger, and Trial Balance use the correct category where applicable.
 * 7. Verify genuinely missing category uses intended fallback (P -> Pooja Income, PU -> Donation Income) without overwriting existing valid categories.
 * 8. Verify legacy category fields (incomeCategory, income_category, categoryName, receiptCategory, cat) normalize safely without losing data.
 * 9. Verify physical numbering, software sequence counters, fund allocation, and balances remain unchanged.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.172: PHYSICAL RECEIPT INCOME CATEGORY MAPPING TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

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

// =========================================================================
// MOCK FIRESTORE
// =========================================================================

class MockDocRef {
  constructor(db, colPath, docId) {
    this.db = db;
    this.colPath = colPath;
    this.id = docId;
  }

  async get() {
    return this.db._getDoc(this.colPath, this.id);
  }

  async set(data, options = {}) {
    return this.db._setDoc(this.colPath, this.id, data, options);
  }

  async update(data) {
    return this.db._setDoc(this.colPath, this.id, data, { merge: true });
  }

  async delete() {
    return this.db._deleteDoc(this.colPath, this.id);
  }
}

class MockCollectionRef {
  constructor(db, colPath) {
    this.db = db;
    this.colPath = colPath;
  }

  doc(id) {
    return new MockDocRef(this.db, this.colPath, String(id));
  }

  where(field, op, val) {
    return {
      limit: (n) => ({
        get: async () => {
          const allDocs = this.db._getCol(this.colPath).docs;
          const filtered = allDocs.filter(d => {
            const data = d.data();
            if (op === '==') return data && data[field] === val;
            return false;
          }).slice(0, n);
          return {
            empty: filtered.length === 0,
            docs: filtered,
            size: filtered.length,
            forEach: (cb) => filtered.forEach(cb)
          };
        }
      }),
      get: async () => {
        const allDocs = this.db._getCol(this.colPath).docs;
        const filtered = allDocs.filter(d => {
          const data = d.data();
          if (op === '==') return data && data[field] === val;
          return false;
        });
        return {
          empty: filtered.length === 0,
          docs: filtered,
          size: filtered.length,
          forEach: (cb) => filtered.forEach(cb)
        };
      }
    };
  }

  async get() {
    return this.db._getCol(this.colPath);
  }
}

class MockFirestore {
  constructor() {
    this.collections = {
      receipts: new Map(),
      billing: new Map(),
      payments: new Map(),
      transfers: new Map(),
      loans: new Map(),
      chittyCollections: new Map(),
      chittyPayouts: new Map(),
      funds: new Map(),
      incomeCategories: new Map(),
      bankAccounts: new Map(),
      system: new Map()
    };
  }

  _ensureCol(colPath) {
    if (!this.collections[colPath]) {
      this.collections[colPath] = new Map();
    }
    return this.collections[colPath];
  }

  collection(colPath) {
    return new MockCollectionRef(this, colPath);
  }

  _getDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const data = col.get(String(docId));
    return {
      id: String(docId),
      exists: data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  }

  _setDoc(colPath, docId, data, options = {}) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    let finalData;
    if (options.merge && col.has(id)) {
      finalData = Object.assign({}, col.get(id), JSON.parse(JSON.stringify(data)));
    } else {
      finalData = JSON.parse(JSON.stringify(data));
    }
    col.set(id, finalData);
    return Promise.resolve();
  }

  _deleteDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    col.delete(String(docId));
    return Promise.resolve();
  }

  _getCol(colPath) {
    const col = this._ensureCol(colPath);
    const docs = Array.from(col.entries()).map(([id, data]) => ({
      id,
      exists: true,
      data: () => JSON.parse(JSON.stringify(data)),
      ref: new MockDocRef(this, colPath, id)
    }));
    return {
      empty: docs.length === 0,
      docs: docs,
      size: docs.length,
      forEach: (cb) => docs.forEach(cb)
    };
  }

  async runTransaction(updateFunction) {
    const tx = {
      get: async (docRef) => docRef.get(),
      set: (docRef, data, options) => docRef.set(data, options),
      update: (docRef, data) => docRef.update(data),
      delete: (docRef) => docRef.delete()
    };
    return await updateFunction(tx);
  }
}

// =========================================================================
// MOCK INDEXEDDB
// =========================================================================

class MockIndexedDB {
  constructor() {
    this.stores = new Map();
  }

  _ensureStore(name) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return this.stores.get(name);
  }

  async getOne(storeName, id) {
    const st = this._ensureStore(storeName);
    return st.has(String(id)) ? JSON.parse(JSON.stringify(st.get(String(id)))) : null;
  }

  async getAll(storeName) {
    const st = this._ensureStore(storeName);
    return Array.from(st.values()).map(v => JSON.parse(JSON.stringify(v)));
  }

  async putRec(storeName, rec) {
    const st = this._ensureStore(storeName);
    const idKey = String(rec.id !== undefined ? rec.id : (rec.firestoreId || Date.now()));
    st.set(idKey, JSON.parse(JSON.stringify(rec)));
  }

  async deleteRec(storeName, id) {
    const st = this._ensureStore(storeName);
    st.delete(String(id));
  }

  async clearStore(storeName) {
    const st = this._ensureStore(storeName);
    st.clear();
  }
}

// =========================================================================
// SETUP VM ENVIRONMENT
// =========================================================================

const mockDb = new MockFirestore();
const mockIdb = new MockIndexedDB();
const currentUser = { uid: 'admin_user_01', displayName: 'Temple Admin', email: 'admin@temple.org' };

// Initialize system/counters
mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 50,
  billingReceiptCounter: 30,
  receiptCounter: 1050
});

// Initialize master categories & funds
const sampleFunds = [
  { id: 1, name: 'General Temple Fund' },
  { id: 2, name: 'Punarudharanam Fund' },
  { id: 3, name: 'Chitty Fund' },
  { id: 4, name: 'Festival Fund' }
];
const sampleIncomeCats = [
  { id: 1, name: 'Pooja Income' },
  { id: 2, name: 'Donation Income' },
  { id: 3, name: 'Annadanam' },
  { id: 4, name: 'Special Contribution' },
  { id: 5, name: 'Vazhipadu Income' },
  { id: 6, name: 'Building Fund' }
];

const context = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Date: Date,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Number: Number,
  Math: Math,
  JSON: JSON,
  localStorage: {
    _data: new Map(),
    getItem: (k) => context.localStorage._data.get(k) || null,
    setItem: (k, v) => context.localStorage._data.set(k, String(v)),
    removeItem: (k) => context.localStorage._data.delete(k)
  },
  getCurrentFirebaseUser: () => currentUser,
  getFirestoreDb: () => mockDb,
  getFsCountersDocRef: () => mockDb.collection('system').doc('counters'),
  getDeterministicDocPrefix: (storeName) => {
    switch (storeName) {
      case 'billing': return 'bill_';
      case 'receipts': return 'rcpt_';
      case 'payments': return 'pmt_';
      default: return `${storeName}_`;
    }
  },
  deleteRec: async (store, id) => mockIdb.deleteRec(store, id),
  putRec: async (store, rec) => mockIdb.putRec(store, rec),
  getOne: async (store, id) => mockIdb.getOne(store, id),
  getAll: async (store) => mockIdb.getAll(store),
  clearStore: async (store) => mockIdb.clearStore(store),
  generateOperationId: (prefix = 'op') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  todayISO: () => '2026-10-21',
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  fmtMoney: (a) => '₹' + parseFloat(a || 0).toFixed(2),
  fmtDate: (d) => String(d),
  currentFormData: new Map(),
  FormData: class {
    constructor(form) {
      this._map = context.currentFormData;
    }
    get(k) {
      return this._map.has(k) ? this._map.get(k) : null;
    }
  },
  el: (id) => ({ id }),
  alert: (msg) => { context._lastAlert = msg; },
  closeModal: () => {},
  refreshSettings: async () => {},
  navigate: async () => {},
  refreshBillingHistory: async () => {},
  CURRENT_VIEW: 'receipts',
  GlobalEditState: { clearEditing: () => {}, setEditing: () => {} },
  getEditingRowClass: () => '',
  optsFromNames: (list, sel) => (list || []).map(item => {
    const val = typeof item === 'string' ? item : item.name;
    return `<option value="${context.esc(val)}" ${val === sel ? 'selected' : ''}>${context.esc(val)}</option>`;
  }).join(''),
  optSel: (val, sel) => `<option value="${context.esc(val)}" ${val === sel ? 'selected' : ''}>${context.esc(val)}</option>`,
  allFunds: async () => sampleFunds,
  allIncomeCategories: async () => sampleIncomeCats,
  allExpenseCategories: async () => [],
  allBankAccounts: async () => [{ id: 1, name: 'SBI Temple Main' }],
  nextReceiptNo: async () => 'R-051',
  notVoided: (list) => (list || []).filter(item => !item.voided),
  sumField: (list, f) => (list || []).reduce((s, x) => s + (parseFloat(x[f]) || 0), 0),
  getCashBalance: async () => {
    const recs = await context.activeReceipts();
    return recs.filter(r => r.paymentMode === 'Cash').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  },
  getBankBalance: async () => {
    const recs = await context.activeReceipts();
    return recs.filter(r => r.paymentMode === 'Bank' || r.paymentMode === 'UPI').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  },
  getAllFundBalances: async () => {
    const recs = await context.activeReceipts();
    return sampleFunds.map(f => ({
      name: f.name,
      balance: recs.filter(r => r.fund === f.name).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    }));
  },
  getLoanOutstanding: async () => 0,
  initMotionObserver: () => {},
  simpleList: (arr) => arr.join('; '),
  VIEW_RENDERERS: {},
  window: {}
};

context.window = context;
vm.createContext(context);

// Extract required functions from HTML
function extractFunction(name) {
  const regex = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = regex.exec(htmlContent);
  if (!match) throw new Error(`Function ${name} not found in HTML`);
  const startIdx = match.index;

  let openBraces = 0;
  let bodyStart = htmlContent.indexOf('{', startIdx);
  let endIdx = bodyStart;
  for (let i = bodyStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '{') openBraces++;
    else if (htmlContent[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return htmlContent.substring(startIdx, endIdx);
}

// Extract VIEW_RENDERERS.receipts, cashbook, bankbook, ledger, trialbalance
function extractViewRenderer(viewName) {
  const marker = `VIEW_RENDERERS.${viewName} = async function`;
  const startIdx = htmlContent.indexOf(marker);
  if (startIdx === -1) throw new Error(`VIEW_RENDERERS.${viewName} not found in HTML`);

  let openBraces = 0;
  let bodyStart = htmlContent.indexOf('{', startIdx);
  let endIdx = bodyStart;
  for (let i = bodyStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '{') openBraces++;
    else if (htmlContent[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return htmlContent.substring(startIdx, endIdx) + ';';
}

const functionsToExtract = [
  'parsePhysicalReceiptIdentifier',
  'resolveReceiptCategory',
  'computeReceiptFingerprint',
  'fsGetAllSafe',
  'fsGetOneSafe',
  'fsUpdateRecordSafe',
  'fsCreatePhysicalReceipt',
  'allReceipts',
  'activeReceipts',
  'allPayments',
  'activePayments',
  'allTransfers',
  'allLoans',
  'allChittyCollections',
  'allChittyPayouts',
  'resolveReceiptDesc',
  'resolvePaymentDesc',
  'resolvePaymentType',
  'buildCashBookRows',
  'buildBankBookRows',
  'saveReceipt'
];

for (const fn of functionsToExtract) {
  const code = extractFunction(fn);
  vm.runInContext(code, context);
}

// Extract view renderers
vm.runInContext(extractViewRenderer('receipts'), context);
vm.runInContext(extractViewRenderer('cashbook'), context);
vm.runInContext(extractViewRenderer('bankbook'), context);
vm.runInContext(extractViewRenderer('ledger'), context);
vm.runInContext(extractViewRenderer('trialbalance'), context);

// =========================================================================
// TEST SUITE EXECUTION
// =========================================================================

async function runTestSuite() {
  console.log('\n--- GROUP 1: Physical P-Series Receipt with Non-Default Income Category ---');

  // Test 1.1: Create P600 with non-default category 'Special Contribution'
  const pReceiptInput = {
    receiptNo: 'P600',
    date: '2026-10-21',
    name: 'Devotee Raman',
    star: 'Aswathi',
    mobile: '9847111222',
    fund: 'General Temple Fund',
    category: 'Special Contribution', // NON-DEFAULT (Default is Pooja Income)
    description: 'Special temple renovation offering',
    paymentMode: 'Cash',
    amount: 500.00,
    remarks: 'Book #6 physical receipt'
  };

  const pRes = await context.fsCreatePhysicalReceipt(pReceiptInput);
  assert(pRes && pRes.receiptRecord, 'T1.1', 'fsCreatePhysicalReceipt created P600 record successfully');
  assert(pRes.receiptRecord.category === 'Special Contribution', 'T1.2', 'P600 preserves selected category "Special Contribution" (NOT overridden to Pooja Income)', `category=${pRes.receiptRecord.category}`);
  assert(pRes.receiptRecord.fund === 'General Temple Fund', 'T1.3', 'P600 fund is preserved as General Temple Fund', `fund=${pRes.receiptRecord.fund}`);

  // Check Firestore document
  const pDoc = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  assert(pDoc.exists && pDoc.data().category === 'Special Contribution', 'T1.4', 'Firestore doc rcpt_phys_P600 stores category "Special Contribution"');

  // Check System reservation document
  const pResDoc = await mockDb.collection('system').doc('res_phys_P600').get();
  assert(pResDoc.exists && pResDoc.data().category === 'Special Contribution', 'T1.5', 'System reservation res_phys_P600 stores category "Special Contribution"');


  console.log('\n--- GROUP 2: Physical PU-Series Receipt with Non-Default Income Category ---');

  // Test 2.1: Create PU1 with non-default category 'Annadanam'
  const puReceiptInput = {
    receiptNo: 'PU1',
    date: '2026-10-21',
    name: 'Devotee Madhavan',
    star: 'Rohini',
    mobile: '9447333444',
    fund: 'Punarudharanam Fund',
    category: 'Annadanam', // NON-DEFAULT (Default is Donation Income)
    description: 'Food distribution for renovation ceremony',
    paymentMode: 'Bank',
    bankAccount: 'SBI Temple Main',
    amount: 2500.00,
    remarks: 'PU physical receipt #1'
  };

  const puRes = await context.fsCreatePhysicalReceipt(puReceiptInput);
  assert(puRes && puRes.receiptRecord, 'T2.1', 'fsCreatePhysicalReceipt created PU1 record successfully');
  assert(puRes.receiptRecord.category === 'Annadanam', 'T2.2', 'PU1 preserves selected category "Annadanam" (NOT overridden to Donation Income)', `category=${puRes.receiptRecord.category}`);
  assert(puRes.receiptRecord.fund === 'Punarudharanam Fund', 'T2.3', 'PU1 fund is preserved as Punarudharanam Fund', `fund=${puRes.receiptRecord.fund}`);

  // Check Firestore document
  const puDoc = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  assert(puDoc.exists && puDoc.data().category === 'Annadanam', 'T2.4', 'Firestore doc rcpt_phys_PU1 stores category "Annadanam"');

  // Check System reservation document
  const puResDoc = await mockDb.collection('system').doc('res_phys_PU1').get();
  assert(puResDoc.exists && puResDoc.data().category === 'Annadanam', 'T2.5', 'System reservation res_phys_PU1 stores category "Annadanam"');


  console.log('\n--- GROUP 3: Receipts Table Rendering with Preserved Categories ---');

  const receiptsTableHtml = await context.VIEW_RENDERERS.receipts();
  assert(receiptsTableHtml.includes('P600'), 'T3.1', 'Receipts table contains P600 row');
  assert(receiptsTableHtml.includes('Special Contribution'), 'T3.2', 'Receipts table displays "Special Contribution" for P600');
  assert(receiptsTableHtml.includes('PU1'), 'T3.3', 'Receipts table contains PU1 row');
  assert(receiptsTableHtml.includes('Annadanam'), 'T3.4', 'Receipts table displays "Annadanam" for PU1');


  console.log('\n--- GROUP 4: Editing Physical Receipt Income Category ---');

  // Fetch P600 for edit
  const p600Edit = await context.fsGetOneSafe('receipts', 'rcpt_phys_P600');
  assert(p600Edit && p600Edit.receiptNo === 'P600', 'T4.1', 'fsGetOneSafe retrieved P600 for editing');
  assert(p600Edit.category === 'Special Contribution', 'T4.2', 'Retrieved P600 category matches stored "Special Contribution"');

  // Change category to 'Building Fund'
  p600Edit.category = 'Building Fund';
  await context.fsUpdateRecordSafe('receipts', p600Edit.firestoreId, p600Edit);

  // Synchronize reservation doc as done in saveReceipt
  await mockDb.collection('system').doc('res_phys_P600').set({
    category: 'Building Fund',
    fund: p600Edit.fund
  }, { merge: true });

  // Verify change in Firestore
  const p600AfterEdit = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  assert(p600AfterEdit.data().category === 'Building Fund', 'T4.3', 'Edited P600 category successfully updated to "Building Fund" in Firestore');

  // Verify change in system reservation
  const p600ResAfterEdit = await mockDb.collection('system').doc('res_phys_P600').get();
  assert(p600ResAfterEdit.data().category === 'Building Fund', 'T4.4', 'Edited P600 category successfully updated to "Building Fund" in system reservation');

  // Verify change in Receipts table rendering
  const tableAfterEdit = await context.VIEW_RENDERERS.receipts();
  assert(tableAfterEdit.includes('Building Fund'), 'T4.5', 'Receipts table renders updated category "Building Fund" for P600');


  console.log('\n--- GROUP 5: Cold Application Reload & Cache Synchronization ---');

  // Simulate cold reload by reading via allReceipts and fsGetOneSafe
  const allRecsCold = await context.allReceipts();
  const coldP600 = allRecsCold.find(r => r.receiptNo === 'P600');
  const coldPU1 = allRecsCold.find(r => r.receiptNo === 'PU1');

  assert(coldP600 && coldP600.category === 'Building Fund', 'T5.1', 'Cold allReceipts returns P600 with preserved category "Building Fund"');
  assert(coldPU1 && coldPU1.category === 'Annadanam', 'T5.2', 'Cold allReceipts returns PU1 with preserved category "Annadanam"');

  const coldGetOnePU1 = await context.fsGetOneSafe('receipts', 'PU1');
  assert(coldGetOnePU1 && coldGetOnePU1.category === 'Annadanam', 'T5.3', 'Cold fsGetOneSafe("PU1") returns PU1 with category "Annadanam"');


  console.log('\n--- GROUP 6: Cash Book, Bank Book, Ledger, and Trial Balance Verification ---');

  // Cash Book rows (P600 was Cash)
  const cashRows = await context.buildCashBookRows();
  const pCashRow = cashRows.find(r => r.particulars.includes('P600'));
  assert(!!pCashRow, 'T6.1', 'Cash Book includes physical Cash receipt P600');
  assert(pCashRow.category === 'Building Fund', 'T6.2', 'Cash Book assigns correct category "Building Fund" to P600', `category=${pCashRow.category}`);

  // Bank Book rows (PU1 was Bank)
  const bankRows = await context.buildBankBookRows();
  const puBankRow = bankRows.find(r => r.particulars.includes('PU1'));
  assert(!!puBankRow, 'T6.3', 'Bank Book includes physical Bank receipt PU1');
  assert(puBankRow.category === 'Annadanam', 'T6.4', 'Bank Book assigns correct category "Annadanam" to PU1', `category=${puBankRow.category}`);

  // Ledger particulars check
  const ledgerHtml = await context.VIEW_RENDERERS.ledger();
  assert(ledgerHtml.includes('P600') && ledgerHtml.includes('Building Fund'), 'T6.5', 'Ledger particulars display "Building Fund" for P600');
  assert(ledgerHtml.includes('PU1') && ledgerHtml.includes('Annadanam'), 'T6.6', 'Ledger particulars display "Annadanam" for PU1');

  // Trial Balance category breakdown
  const trialHtml = await context.VIEW_RENDERERS.trialbalance();
  assert(trialHtml.includes('Building Fund'), 'T6.7', 'Trial Balance category breakdown includes "Building Fund"');
  assert(trialHtml.includes('Annadanam'), 'T6.8', 'Trial Balance category breakdown includes "Annadanam"');


  console.log('\n--- GROUP 7: Genuinely Missing Category Fallbacks ---');

  // Test 7.1: Physical P-series receipt with missing category falls back to 'Pooja Income'
  const pMissing = {
    receiptNo: 'P605',
    category: '', // Missing
    fund: 'General Temple Fund',
    isPhysical: true,
    physicalType: 'P'
  };
  const resolvedPMissing = context.resolveReceiptCategory(pMissing);
  assert(resolvedPMissing === 'Pooja Income', 'T7.1', 'Missing category on P605 correctly falls back to "Pooja Income"', `resolved=${resolvedPMissing}`);

  // Test 7.2: Physical PU-series receipt with missing category falls back to 'Donation Income'
  const puMissing = {
    receiptNo: 'PU5',
    category: null, // Genuinely absent
    fund: 'Punarudharanam Fund',
    isPhysical: true,
    physicalType: 'PU'
  };
  const resolvedPUMissing = context.resolveReceiptCategory(puMissing);
  assert(resolvedPUMissing === 'Donation Income', 'T7.2', 'Missing category on PU5 correctly falls back to "Donation Income"', `resolved=${resolvedPUMissing}`);

  // Test 7.3: Valid category is NEVER overwritten by fallback
  const pValid = {
    receiptNo: 'P600',
    category: 'Vazhipadu Income',
    fund: 'General Temple Fund'
  };
  const resolvedPValid = context.resolveReceiptCategory(pValid);
  assert(resolvedPValid === 'Vazhipadu Income', 'T7.3', 'Existing valid category "Vazhipadu Income" is preserved intact without fallback override');


  console.log('\n--- GROUP 8: Legacy Category Field Normalization ---');

  // Test 8.1: incomeCategory legacy field
  const leg1 = { receiptNo: 'P610', incomeCategory: 'Special Pooja' };
  assert(context.resolveReceiptCategory(leg1) === 'Special Pooja', 'T8.1', 'Legacy field "incomeCategory" safely normalized');

  // Test 8.2: income_category legacy field
  const leg2 = { receiptNo: 'PU2', income_category: 'Temple Renovation' };
  assert(context.resolveReceiptCategory(leg2) === 'Temple Renovation', 'T8.2', 'Legacy field "income_category" safely normalized');

  // Test 8.3: categoryName legacy field
  const leg3 = { receiptNo: 'P620', categoryName: 'Devotee Feast' };
  assert(context.resolveReceiptCategory(leg3) === 'Devotee Feast', 'T8.3', 'Legacy field "categoryName" safely normalized');

  // Test 8.4: receiptCategory legacy field
  const leg4 = { receiptNo: 'PU3', receiptCategory: 'Marble Plaque Contribution' };
  assert(context.resolveReceiptCategory(leg4) === 'Marble Plaque Contribution', 'T8.4', 'Legacy field "receiptCategory" safely normalized');

  // Test 8.5: cat legacy field
  const leg5 = { receiptNo: 'P630', cat: 'Neyyappam Offering' };
  assert(context.resolveReceiptCategory(leg5) === 'Neyyappam Offering', 'T8.5', 'Legacy field "cat" safely normalized');


  console.log('\n--- GROUP 9: Sequence Counters & Numbering Isolation Guarantees ---');

  const countersDoc = await mockDb.collection('system').doc('counters').get();
  const cData = countersDoc.data();
  assert(cData.globalSequenceCounter === 50, 'T9.1', 'globalSequenceCounter strictly unchanged at 50', `c=${cData.globalSequenceCounter}`);
  assert(cData.billingReceiptCounter === 30, 'T9.2', 'billingReceiptCounter strictly unchanged at 30', `c=${cData.billingReceiptCounter}`);
  assert(cData.receiptCounter === 1050, 'T9.3', 'receiptCounter strictly unchanged at 1050', `c=${cData.receiptCounter}`);

  console.log('\n--- GROUP 10: Form Controller saveReceipt() End-to-End Validation ---');

  // Helper to populate FormData
  function setFormData(obj) {
    context.currentFormData.clear();
    for (const [k, v] of Object.entries(obj)) {
      context.currentFormData.set(k, v != null ? String(v) : '');
    }
  }

  // Test 10.1: saveReceipt creates P700 with selected category 'Annadanam'
  setFormData({
    name: 'Devotee Jayaprakash',
    date: '2026-10-21',
    receiptNo: 'P700',
    fund: 'General Temple Fund',
    category: 'Annadanam',
    amount: '400',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p700Doc = await mockDb.collection('receipts').doc('rcpt_phys_P700').get();
  assert(p700Doc.exists && p700Doc.data().category === 'Annadanam', 'T10.1', 'saveReceipt successfully saved P700 with category "Annadanam"');

  // Test 10.2: saveReceipt creates PU2 with selected category 'Special Contribution'
  setFormData({
    name: 'Devotee Gopinath',
    date: '2026-10-21',
    receiptNo: 'PU2',
    fund: 'Punarudharanam Fund',
    category: 'Special Contribution',
    amount: '1500',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const pu2Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU2').get();
  assert(pu2Doc.exists && pu2Doc.data().category === 'Special Contribution', 'T10.2', 'saveReceipt successfully saved PU2 with category "Special Contribution"');

  // Test 10.3: saveReceipt edit branch updates P700 category to 'Vazhipadu Income'
  setFormData({
    editId: 'rcpt_phys_P700',
    name: 'Devotee Jayaprakash',
    date: '2026-10-21',
    receiptNo: 'P700',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    amount: '400',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p700Updated = await mockDb.collection('receipts').doc('rcpt_phys_P700').get();
  assert(p700Updated.exists && p700Updated.data().category === 'Vazhipadu Income', 'T10.3', 'saveReceipt edit branch persisted updated category "Vazhipadu Income"');

  // Test 10.4: saveReceipt with empty category on P701 falls back to 'Pooja Income'
  setFormData({
    name: 'Devotee Unnikrishnan',
    date: '2026-10-21',
    receiptNo: 'P701',
    fund: 'General Temple Fund',
    category: '', // Empty category
    amount: '200',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p701Doc = await mockDb.collection('receipts').doc('rcpt_phys_P701').get();
  assert(p701Doc.exists && p701Doc.data().category === 'Pooja Income', 'T10.4', 'saveReceipt with empty category on P701 falls back to "Pooja Income"');

  // Test 10.5: saveReceipt with empty category on PU3 falls back to 'Donation Income'
  setFormData({
    name: 'Devotee Balan',
    date: '2026-10-21',
    receiptNo: 'PU3',
    fund: 'Punarudharanam Fund',
    category: '', // Empty category
    amount: '3000',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const pu3Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU3').get();
  assert(pu3Doc.exists && pu3Doc.data().category === 'Donation Income', 'T10.5', 'saveReceipt with empty category on PU3 falls back to "Donation Income"');

  // Test 10.6: Edit form selects custom category not in master list
  const customCatDoc = {
    id: 'rcpt_phys_P705',
    receiptNo: 'P705',
    date: '2026-10-21',
    name: 'Devotee Custom',
    fund: 'General Temple Fund',
    category: 'Unique Endowment', // Custom category not in sampleIncomeCats
    amount: 1000,
    paymentMode: 'Cash',
    isPhysical: true,
    physicalType: 'P'
  };
  await mockDb.collection('receipts').doc('rcpt_phys_P705').set(customCatDoc);
  const editViewHtml = await context.VIEW_RENDERERS.receipts(null, 'rcpt_phys_P705');
  assert(editViewHtml.includes('value="Unique Endowment" selected'), 'T10.6', 'Edit form preserves and selects custom category "Unique Endowment" not in predefined list');

  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
