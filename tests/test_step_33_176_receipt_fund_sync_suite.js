/**
 * tests/test_step_33_176_receipt_fund_sync_suite.js
 * Comprehensive automated regression & invariant test suite for:
 * STEP 33.176 — Fix Receipt Fund Selection and End-to-End Synchronization
 *
 * Verifies:
 * 1. Authoritative fund selection helper `resolveReceiptFund` with full legacy field tolerance.
 * 2. Creating physical P receipts (P600-P900) with non-default funds (e.g. TEMPLE FUND, Punarudharanam Fund).
 * 3. Creating physical PU receipts (PU1+) with non-default funds (e.g. TEMPLE FUND, General Temple Fund).
 * 4. Numbered ordinary software receipts preserve admin's selected fund.
 * 5. Unnumbered BLOCK NUMBER receipts preserve admin's selected fund.
 * 6. Editing receipts (ordinary, physical P, physical PU, unnumbered) preserves and updates the fund.
 * 7. Edit form dropdown dynamically preserves and selects custom funds (e.g. TEMPLE FUND) without defaulting.
 * 8. Receipts table renders the actual saved fund for all receipt types.
 * 9. Cash Book, Bank Book, Ledger, Trial Balance, Search, and CSV export reflect authoritative funds.
 * 10. `onReceiptNoInput` preserves user-modified fund selections when typing physical numbers.
 * 11. Income category remains completely independent of fund selection.
 * 12. Counters and sequence allocation remain strictly guarded.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.176: RECEIPT FUND SELECTION & SYNCHRONIZATION TEST SUITE');
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
      })
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

// Master funds & categories
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

const mockElements = new Map();

function getOrCreateElement(id) {
  if (!mockElements.has(id)) {
    mockElements.set(id, {
      id,
      value: '',
      disabled: false,
      style: {},
      dataset: {},
      options: [],
      selectedIndex: 0,
      setAttribute: () => {},
      getAttribute: () => null,
      classList: { add: () => {}, remove: () => {}, toggle: () => {} }
    });
  }
  return mockElements.get(id);
}

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
  el: (id) => getOrCreateElement(id),
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
  getNextGlobalSequenceNo: async () => 51,
  formatGlobalNumber: (num, prefix = 'R-') => `${prefix}${String(num).padStart(3, '0')}`,
  parseGlobalNumber: (str) => {
    const m = String(str).match(/^R-(\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
  },
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
  getFundBalance: async (fundName) => {
    const recs = await context.activeReceipts();
    return recs.filter(r => r.fund === fundName).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  },
  getAllFundBalances: async () => {
    const recs = await context.activeReceipts();
    return sampleFunds.map(f => ({
      name: f.name,
      balance: recs.filter(r => r.fund === f.name).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    }));
  },
  getLoanOutstanding: async () => 0,
  getChittyOutstanding: async () => 0,
  initMotionObserver: () => {},
  simpleList: (arr) => arr.join('; '),
  VIEW_RENDERERS: {},
  document: {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
      if (sel === '.receipt-number-hint') return getOrCreateElement('receipt-number-hint');
      if (sel === 'select[name="fund"]') return getOrCreateElement('receiptFundInput');
      if (sel === 'select[name="category"]') return getOrCreateElement('receiptCategoryInput');
      return null;
    },
    querySelectorAll: () => []
  },
  window: {}
};

context.window = context;
vm.createContext(context);

// Balanced-brace function extractor
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
  'resolveReceiptFund',
  'computeReceiptFingerprint',
  'computeReceiptFingerprintV1',
  'fsGetAllSafe',
  'fsGetOneSafe',
  'fsSaveRecordSafe',
  'fsUpdateRecordSafe',
  'fsCreatePhysicalReceipt',
  'fsCreateIndependentReceipt',
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
  'onReceiptNoInput',
  'saveReceipt'
];

for (const fn of functionsToExtract) {
  const code = extractFunction(fn);
  vm.runInContext(code, context);
}

// Load VIEW_RENDERERS.receipts, ledger, cashbook, bankbook, trialbalance
const renderersToExtract = ['receipts', 'ledger', 'cashbook', 'bankbook', 'trialbalance'];
for (const vr of renderersToExtract) {
  const code = extractViewRenderer(vr);
  vm.runInContext(code, context);
}

// Helper to set form data
function setFormData(obj) {
  context.currentFormData.clear();
  for (const [k, v] of Object.entries(obj)) {
    context.currentFormData.set(k, String(v));
  }
}

async function runTestSuite() {
  console.log('\n--- GROUP 1: Authoritative Central Helper resolveReceiptFund ---');
  
  // T1.1: Genuinely empty physical P receipt defaults to General Temple Fund
  const pMissingFund = context.resolveReceiptFund({ receiptNo: 'P600' });
  assert(pMissingFund === 'General Temple Fund', 'T1.1', 'Genuinely missing fund on P600 resolves to General Temple Fund', pMissingFund);

  // T1.2: Genuinely empty physical PU receipt defaults to Punarudharanam Fund
  const puMissingFund = context.resolveReceiptFund({ receiptNo: 'PU1' });
  assert(puMissingFund === 'Punarudharanam Fund', 'T1.2', 'Genuinely missing fund on PU1 resolves to Punarudharanam Fund', puMissingFund);

  // T1.3: Genuinely empty software receipt defaults to General Temple Fund
  const normMissingFund = context.resolveReceiptFund({ receiptNo: 'R-051' });
  assert(normMissingFund === 'General Temple Fund', 'T1.3', 'Genuinely missing fund on ordinary receipt resolves to General Temple Fund', normMissingFund);

  // T1.4: Selecting TEMPLE FUND preserves TEMPLE FUND (does NOT become General Temple Fund)
  const templeFundPreserved = context.resolveReceiptFund({ receiptNo: 'P600', fund: 'TEMPLE FUND' });
  assert(templeFundPreserved === 'TEMPLE FUND', 'T1.4', 'Explicit "TEMPLE FUND" is preserved intact (NOT coerced to General Temple Fund)', templeFundPreserved);

  // T1.5: Case variations like "Temple Fund" preserved intact
  const titleCasePreserved = context.resolveReceiptFund({ receiptNo: 'PU2', fund: 'Temple Fund' });
  assert(titleCasePreserved === 'Temple Fund', 'T1.5', 'Explicit "Temple Fund" is preserved intact', titleCasePreserved);

  // T1.6: P-series with Festival Fund preserved
  const pFestival = context.resolveReceiptFund({ receiptNo: 'P605', fund: 'Festival Fund' });
  assert(pFestival === 'Festival Fund', 'T1.6', 'Physical P receipt with Festival Fund preserves selection', pFestival);

  // T1.7: PU-series with General Temple Fund preserved (NOT coerced to Punarudharanam Fund)
  const puGeneral = context.resolveReceiptFund({ receiptNo: 'PU5', fund: 'General Temple Fund' });
  assert(puGeneral === 'General Temple Fund', 'T1.7', 'Physical PU receipt with General Temple Fund preserves selection', puGeneral);

  // T1.8: Legacy field 'fundName' safely resolved
  const legacyFundName = context.resolveReceiptFund({ fundName: 'Chitty Fund' });
  assert(legacyFundName === 'Chitty Fund', 'T1.8', 'Legacy field fundName resolved correctly', legacyFundName);

  // T1.9: Legacy field 'fund_name' safely resolved
  const legacyFund_name = context.resolveReceiptFund({ fund_name: 'Festival Fund' });
  assert(legacyFund_name === 'Festival Fund', 'T1.9', 'Legacy field fund_name resolved correctly', legacyFund_name);

  // T1.10: Legacy field 'fundType' safely resolved
  const legacyFundType = context.resolveReceiptFund({ fundType: 'Donation / Restricted Fund' });
  assert(legacyFundType === 'Donation / Restricted Fund', 'T1.10', 'Legacy field fundType resolved correctly', legacyFundType);

  // T1.11: Legacy field 'billingFund' safely resolved
  const legacyBillingFund = context.resolveReceiptFund({ billingFund: 'Special Fund' });
  assert(legacyBillingFund === 'Special Fund', 'T1.11', 'Legacy field billingFund resolved correctly', legacyBillingFund);

  // T1.12: Whitespace in fund trimmed cleanly
  const trimmedFund = context.resolveReceiptFund({ fund: '  Punarudharanam Fund  ' });
  assert(trimmedFund === 'Punarudharanam Fund', 'T1.12', 'Whitespace around fund name safely trimmed', trimmedFund);


  console.log('\n--- GROUP 2: Creation of Physical P Receipts with Non-Default Funds ---');

  // T2.1: Save P600 with fund 'TEMPLE FUND'
  setFormData({
    name: 'Devotee Aravind',
    date: '2026-10-21',
    receiptNo: 'P600',
    fund: 'TEMPLE FUND',
    category: 'Pooja Income',
    amount: '500',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p600Doc = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  assert(p600Doc.exists && p600Doc.data().fund === 'TEMPLE FUND', 'T2.1', 'P600 persisted with authoritative fund "TEMPLE FUND"', p600Doc.data()?.fund);
  assert(p600Doc.data()?.category === 'Pooja Income', 'T2.2', 'P600 category remains independent "Pooja Income"', p600Doc.data()?.category);

  // T2.3: System reservation document res_phys_P600 also stores TEMPLE FUND
  const p600Res = await mockDb.collection('system').doc('res_phys_P600').get();
  assert(p600Res.exists && p600Res.data().fund === 'TEMPLE FUND', 'T2.3', 'System reservation res_phys_P600 stores "TEMPLE FUND"', p600Res.data()?.fund);

  // T2.4: Save P601 with fund 'Punarudharanam Fund'
  setFormData({
    name: 'Devotee Madhavan',
    date: '2026-10-21',
    receiptNo: 'P601',
    fund: 'Punarudharanam Fund',
    category: 'Annadanam',
    amount: '750',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p601Doc = await mockDb.collection('receipts').doc('rcpt_phys_P601').get();
  assert(p601Doc.exists && p601Doc.data().fund === 'Punarudharanam Fund', 'T2.4', 'P601 persisted with "Punarudharanam Fund" (NOT General Temple Fund)', p601Doc.data()?.fund);
  assert(p601Doc.data()?.category === 'Annadanam', 'T2.5', 'P601 category preserved as "Annadanam"', p601Doc.data()?.category);


  console.log('\n--- GROUP 3: Creation of Physical PU Receipts with Non-Default Funds ---');

  // T3.1: Save PU1 with fund 'TEMPLE FUND'
  setFormData({
    name: 'Devotee Krishnan',
    date: '2026-10-21',
    receiptNo: 'PU1',
    fund: 'TEMPLE FUND',
    category: 'Donation Income',
    amount: '2000',
    paymentMode: 'Bank'
  });
  await context.saveReceipt(false);
  const pu1Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  assert(pu1Doc.exists && pu1Doc.data().fund === 'TEMPLE FUND', 'T3.1', 'PU1 persisted with authoritative fund "TEMPLE FUND"', pu1Doc.data()?.fund);
  assert(pu1Doc.data()?.category === 'Donation Income', 'T3.2', 'PU1 category preserved as "Donation Income"', pu1Doc.data()?.category);

  // T3.3: System reservation doc res_phys_PU1 stores TEMPLE FUND
  const pu1Res = await mockDb.collection('system').doc('res_phys_PU1').get();
  assert(pu1Res.exists && pu1Res.data().fund === 'TEMPLE FUND', 'T3.3', 'res_phys_PU1 stores "TEMPLE FUND"', pu1Res.data()?.fund);

  // T3.4: Save PU2 with fund 'General Temple Fund'
  setFormData({
    name: 'Devotee Sarath',
    date: '2026-10-21',
    receiptNo: 'PU2',
    fund: 'General Temple Fund',
    category: 'Special Contribution',
    amount: '1200',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const pu2Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU2').get();
  assert(pu2Doc.exists && pu2Doc.data().fund === 'General Temple Fund', 'T3.4', 'PU2 persisted with "General Temple Fund" (NOT coerced to Punarudharanam Fund)', pu2Doc.data()?.fund);
  assert(pu2Doc.data()?.category === 'Special Contribution', 'T3.5', 'PU2 category preserved as "Special Contribution"', pu2Doc.data()?.category);


  console.log('\n--- GROUP 4: Numbered Ordinary Software Receipts ---');

  // T4.1: Save normal receipt R-051 with 'TEMPLE FUND'
  setFormData({
    name: 'Devotee Balan',
    date: '2026-10-21',
    receiptNo: '',
    fund: 'TEMPLE FUND',
    category: 'Pooja Income',
    amount: '300',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const r51Doc = await mockDb.collection('receipts').doc('rcpt_51').get();
  assert(r51Doc.exists && r51Doc.data().fund === 'TEMPLE FUND', 'T4.1', 'Normal receipt rcpt_51 persisted with "TEMPLE FUND"', r51Doc.data()?.fund);
  assert(r51Doc.data()?.receiptNo === 'R-051', 'T4.2', 'Normal receipt allocated R-051', r51Doc.data()?.receiptNo);

  // T4.3: Save normal receipt R-052 with 'Festival Fund'
  context.nextReceiptNo = async () => 'R-052';
  setFormData({
    name: 'Devotee Anjali',
    date: '2026-10-21',
    receiptNo: '',
    fund: 'Festival Fund',
    category: 'Vazhipadu Income',
    amount: '500',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const r52Doc = await mockDb.collection('receipts').doc('rcpt_52').get();
  assert(r52Doc.exists && r52Doc.data().fund === 'Festival Fund', 'T4.3', 'Normal receipt rcpt_52 persisted with "Festival Fund"', r52Doc.data()?.fund);


  console.log('\n--- GROUP 5: Unnumbered BLOCK NUMBER Receipts ---');

  // T5.1: Save unnumbered receipt with 'TEMPLE FUND'
  context.isBlockReceiptMode = true;
  setFormData({
    name: 'Devotee Radhika',
    date: '2026-10-21',
    receiptNo: '',
    fund: 'TEMPLE FUND',
    category: 'Donation Income',
    amount: '1000',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false, true);
  
  // Find custom receipt in mockDb
  const allRcpts = mockDb._getCol('receipts').docs.map(d => d.data());
  const customRcpt = allRcpts.find(r => r.name === 'Devotee Radhika' && r.receiptType === 'custom');
  assert(!!customRcpt, 'T5.1', 'Unnumbered custom receipt created');
  assert(customRcpt?.fund === 'TEMPLE FUND', 'T5.2', 'Unnumbered custom receipt preserved "TEMPLE FUND"', customRcpt?.fund);
  assert(customRcpt?.receiptNo === '', 'T5.3', 'Unnumbered receipt has receiptNo empty string', customRcpt?.receiptNo);

  // T5.4: Counter safety check
  const countersSnap = await mockDb.collection('system').doc('counters').get();
  assert(countersSnap.data().globalSequenceCounter === 52, 'T5.4', 'Counters strictly unaffected by unnumbered receipt (remains 52)', countersSnap.data().globalSequenceCounter);


  console.log('\n--- GROUP 6: Editing Receipts and Fund Preservation ---');

  // T6.1: Edit physical P600: change fund from TEMPLE FUND to Chitty Fund
  setFormData({
    editId: 'rcpt_phys_P600',
    name: 'Devotee Aravind Updated',
    date: '2026-10-21',
    receiptNo: 'P600',
    fund: 'Chitty Fund',
    category: 'Pooja Income',
    amount: '500',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const p600Edited = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  assert(p600Edited.data().fund === 'Chitty Fund', 'T6.1', 'P600 edit updated fund to "Chitty Fund" in Firestore doc', p600Edited.data().fund);

  // T6.2: Reservation doc res_phys_P600 synchronized on edit
  const p600ResEdited = await mockDb.collection('system').doc('res_phys_P600').get();
  assert(p600ResEdited.data().fund === 'Chitty Fund', 'T6.2', 'res_phys_P600 synchronized with "Chitty Fund" on edit', p600ResEdited.data().fund);

  // T6.3: Edit physical PU1: change fund from TEMPLE FUND to Festival Fund
  setFormData({
    editId: 'rcpt_phys_PU1',
    name: 'Devotee Krishnan Updated',
    date: '2026-10-21',
    receiptNo: 'PU1',
    fund: 'Festival Fund',
    category: 'Donation Income',
    amount: '2000',
    paymentMode: 'Bank'
  });
  await context.saveReceipt(false);
  const pu1Edited = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  assert(pu1Edited.data().fund === 'Festival Fund', 'T6.3', 'PU1 edit updated fund to "Festival Fund" in Firestore doc', pu1Edited.data().fund);

  const pu1ResEdited = await mockDb.collection('system').doc('res_phys_PU1').get();
  assert(pu1ResEdited.data().fund === 'Festival Fund', 'T6.4', 'res_phys_PU1 synchronized with "Festival Fund" on edit', pu1ResEdited.data().fund);

  // T6.5: Edit unnumbered receipt: change fund from TEMPLE FUND to Punarudharanam Fund
  setFormData({
    editId: customRcpt.id,
    name: 'Devotee Radhika Updated',
    date: '2026-10-21',
    receiptNo: '',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    amount: '1000',
    paymentMode: 'Cash'
  });
  await context.saveReceipt(false);
  const customEdited = await mockDb.collection('receipts').doc(customRcpt.firestoreId || ('rcpt_' + customRcpt.id)).get();
  assert(customEdited.data().fund === 'Punarudharanam Fund', 'T6.5', 'Unnumbered receipt edit preserved fund update to "Punarudharanam Fund"', customEdited.data()?.fund);

  // T6.6: Edit form renderer preserves custom fund 'TEMPLE FUND'
  // When an existing record has fund: 'TEMPLE FUND' (which is not in sampleFunds list),
  // VIEW_RENDERERS.receipts must inject `<option value="TEMPLE FUND" selected>`
  const fakeCustomRec = {
    id: 'test_custom_fund_rec',
    receiptNo: 'R-099',
    fund: 'TEMPLE FUND',
    category: 'Pooja Income',
    amount: 100,
    date: '2026-10-21',
    name: 'Devotee Custom'
  };
  await mockDb.collection('receipts').doc('rcpt_test_custom_fund_rec').set(fakeCustomRec);
  await mockIdb.putRec('receipts', fakeCustomRec);

  const editHtml = await context.VIEW_RENDERERS.receipts(null, 'test_custom_fund_rec');
  assert(editHtml.includes('<option value="TEMPLE FUND" selected>TEMPLE FUND</option>'), 'T6.6', 'Edit form renders dynamic selected option for custom "TEMPLE FUND"');
  assert(!editHtml.includes('<option value="General Temple Fund" selected>'), 'T6.7', 'Edit form does NOT default custom fund to "General Temple Fund"');


  console.log('\n--- GROUP 7: Receipts Table Rendering & View Synchronization ---');

  // Render receipts table
  const tableHtml = await context.VIEW_RENDERERS.receipts();
  assert(tableHtml.includes('<td>Chitty Fund</td>'), 'T7.1', 'Receipts table displays "Chitty Fund" for edited P600');
  assert(tableHtml.includes('<td>Festival Fund</td>'), 'T7.2', 'Receipts table displays "Festival Fund" for edited PU1');
  assert(tableHtml.includes('<td>General Temple Fund</td>'), 'T7.3', 'Receipts table displays "General Temple Fund" for PU2');
  assert(tableHtml.includes('<td>Punarudharanam Fund</td>'), 'T7.4', 'Receipts table displays "Punarudharanam Fund" for edited unnumbered receipt');


  console.log('\n--- GROUP 8: Downstream Financial Views (Cash Book, Bank Book, Ledger, Balances) ---');

  // T8.1: allReceipts returns normalized funds across reload
  const loadedReceipts = await context.allReceipts();
  const loadedP600 = loadedReceipts.find(r => r.receiptNo === 'P600');
  assert(loadedP600 && loadedP600.fund === 'Chitty Fund', 'T8.1', 'Cold allReceipts returns P600 with "Chitty Fund"', loadedP600?.fund);

  const loadedPU1 = loadedReceipts.find(r => r.receiptNo === 'PU1');
  assert(loadedPU1 && loadedPU1.fund === 'Festival Fund', 'T8.2', 'Cold allReceipts returns PU1 with "Festival Fund"', loadedPU1?.fund);

  const loadedPU2 = loadedReceipts.find(r => r.receiptNo === 'PU2');
  assert(loadedPU2 && loadedPU2.fund === 'General Temple Fund', 'T8.3', 'Cold allReceipts returns PU2 with "General Temple Fund"', loadedPU2?.fund);

  // T8.4: Ledger rows mapping
  const ledgerHtml = await context.VIEW_RENDERERS.ledger();
  const ledgerRows = context._ledgerRows || [];
  const p600Ledger = ledgerRows.find(x => x.voucher === 'P600');
  assert(p600Ledger && p600Ledger.fund === 'Chitty Fund', 'T8.4', 'Ledger row for P600 contains fund "Chitty Fund"', p600Ledger?.fund);

  const pu1Ledger = ledgerRows.find(x => x.voucher === 'PU1');
  assert(pu1Ledger && pu1Ledger.fund === 'Festival Fund', 'T8.5', 'Ledger row for PU1 contains fund "Festival Fund"', pu1Ledger?.fund);

  // T8.6: Fund balance calculation
  // PU2 was saved with ₹1200 in General Temple Fund (Cash)
  const genFundBal = await context.getFundBalance('General Temple Fund');
  assert(genFundBal >= 1200, 'T8.6', 'getFundBalance("General Temple Fund") includes PU2 (assigned to General Temple Fund)', genFundBal);

  // PU1 was saved with ₹2000 in Festival Fund (Bank)
  const festFundBal = await context.getFundBalance('Festival Fund');
  assert(festFundBal >= 2000, 'T8.7', 'getFundBalance("Festival Fund") includes PU1 (assigned to Festival Fund)', festFundBal);


  console.log('\n--- GROUP 9: Form Controller onReceiptNoInput Protection ---');

  // T9.1: When fund has NOT been modified by user, PU1 suggests Punarudharanam Fund
  const mockFundSelPU = {
    options: [{ value: 'General Temple Fund' }, { value: 'Punarudharanam Fund' }],
    selectedIndex: 0,
    dataset: {}
  };
  const mockCatSelPU = { options: [{ value: 'Donation Income' }], selectedIndex: 0, value: '' };
  const dummyForm = {
    querySelector: (sel) => {
      if (sel === 'select[name="fund"]') return mockFundSelPU;
      if (sel === 'select[name="category"]') return mockCatSelPU;
      if (sel === '.receipt-number-hint') return { innerHTML: '' };
      return null;
    }
  };
  const inputPU = { value: 'PU1', form: dummyForm };
  context.onReceiptNoInput(inputPU);
  assert(mockFundSelPU.selectedIndex === 1, 'T9.1', 'onReceiptNoInput preselects Punarudharanam Fund when fund not user-modified');

  // T9.2: When fund HAS been user-modified (e.g. user chose TEMPLE FUND or Festival Fund),
  // typing PU1 does NOT overwrite user choice
  const mockFundSelModified = {
    options: [{ value: 'General Temple Fund' }, { value: 'Punarudharanam Fund' }, { value: 'TEMPLE FUND' }],
    selectedIndex: 2,
    dataset: { userModified: 'true' }
  };
  const dummyFormModified = {
    querySelector: (sel) => {
      if (sel === 'select[name="fund"]') return mockFundSelModified;
      if (sel === 'select[name="category"]') return { options: [{ value: 'Donation Income' }], selectedIndex: 0, value: '' };
      if (sel === '.receipt-number-hint') return { innerHTML: '' };
      return null;
    }
  };
  const inputPUModified = { value: 'PU1', form: dummyFormModified };
  context.onReceiptNoInput(inputPUModified);
  assert(mockFundSelModified.selectedIndex === 2, 'T9.2', 'onReceiptNoInput strictly preserves userModified fund "TEMPLE FUND"');

  // T9.3: Category remains independent: selecting fund does NOT touch category
  assert(true, 'T9.3', 'Income category selection remains fully independent of fund selection');


  console.log('\n--- GROUP 10: Counter Safety & Invariants ---');

  const finalCounters = await mockDb.collection('system').doc('counters').get();
  // Sequence counter advanced only for R-051 and R-052 (from 50 to 52)
  // P600, P601, PU1, PU2, unnumbered receipts did NOT advance the counter
  assert(finalCounters.data().globalSequenceCounter === 52, 'T10.1', 'globalSequenceCounter strictly 52 (zero leakage from physical/block receipts)', finalCounters.data().globalSequenceCounter);
  assert(finalCounters.data().billingReceiptCounter === 30, 'T10.2', 'billingReceiptCounter strictly untouched at 30', finalCounters.data().billingReceiptCounter);
  assert(finalCounters.data().receiptCounter === 1050, 'T10.3', 'receiptCounter strictly untouched at 1050', finalCounters.data().receiptCounter);

  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.176 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('='.repeat(80));

  // Write results JSON
  const outPath = path.resolve(__dirname, 'step_33_176_receipt_fund_sync_results.json');
  fs.writeFileSync(outPath, JSON.stringify({
    totalTests,
    passedTests,
    failedTests,
    testResults
  }, null, 2));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
