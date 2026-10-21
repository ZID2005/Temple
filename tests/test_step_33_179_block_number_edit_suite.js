/**
 * tests/test_step_33_179_block_number_edit_suite.js
 * Comprehensive automated regression & invariant test suite for:
 * STEP 33.179 — Allow BLOCK NUMBER Mode When Editing Existing Receipts
 *
 * Target: Temple_Accounts-1.html
 *
 * Verifies:
 * 1. UI rendering: BLOCK NUMBER button shown during edit mode, banner displays, input styling/placeholders.
 * 2. In-place editing of unnumbered receipts preserves their unnumbered status (receiptType: 'custom', receiptNo: '').
 * 3. Conversion of ordinary numbered receipts (R-XXX) to unnumbered mode:
 *    - Saves canonical unnumbered receipt schema (receiptType: 'custom', receiptNo: '', id: 'c_...').
 *    - Atomically deletes old numbered document (rcpt_N) and reservation (res_N) from Firestore & IndexedDB.
 *    - No duplicate active receipts or lingering reservations.
 *    - Preserves audit history (convertedFromReceiptNo, convertedFromId, convertedAt).
 *    - Strictly preserves sequence counters without rolling back or decrementing.
 * 4. Conversion of unnumbered receipts to numbered mode:
 *    - Safely allocates next available sequential number using Math.max forward progression.
 *    - Creates system reservation and operation doc.
 *    - Atomically deletes old unnumbered document from Firestore & IndexedDB.
 *    - Preserves audit history (convertedFromUnnumberedId, convertedAt).
 *    - Monotonically advances globalSequenceCounter without rollback.
 * 5. Skipping occupied numbers / concurrency simulation during conversion.
 * 6. Guarding physical receipts (P600-P900, PU1+): rejected with clear alert, identifiers cannot be modified.
 * 7. Guarding billing-linked receipts: rejected with clear alert, linked billing never deleted or corrupted.
 * 8. Guarding voided receipts: cannot be edited or converted.
 * 9. Preservation and independence of all financial/donor fields (fund, category, devotee, amount, etc.).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.179: ALLOW BLOCK NUMBER MODE WHEN EDITING EXISTING RECEIPTS TEST SUITE');
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
    this.id = String(docId);
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
            size: filtered.length
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
    this.collections = new Map();
    this.versionMap = new Map();
    this._globalVersion = 0;
  }

  _key(colPath, docId) {
    return `${colPath}/${docId}`;
  }

  _ensureCol(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  collection(name) {
    return new MockCollectionRef(this, name);
  }

  _getDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    const data = col.get(id);
    return {
      id,
      exists: col.has(id),
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
    this._globalVersion++;
    this.versionMap.set(this._key(colPath, id), this._globalVersion);
    return Promise.resolve();
  }

  _deleteDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    col.delete(id);
    this._globalVersion++;
    this.versionMap.set(this._key(colPath, id), this._globalVersion);
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
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const readVersions = new Map();
      const writeOps = [];

      const tx = {
        get: async (docRef) => {
          const k = this._key(docRef.colPath, docRef.id);
          readVersions.set(k, this.versionMap.get(k) || 0);
          return this._getDoc(docRef.colPath, docRef.id);
        },
        set: (docRef, data, options = {}) => {
          writeOps.push({ type: 'set', docRef, data, options });
        },
        update: (docRef, data) => {
          writeOps.push({ type: 'update', docRef, data });
        },
        delete: (docRef) => {
          writeOps.push({ type: 'delete', docRef });
        }
      };

      try {
        const result = await updateFunction(tx);

        let hasConflict = false;
        for (const [k, v] of readVersions.entries()) {
          const currentVer = this.versionMap.get(k) || 0;
          if (currentVer !== v) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) {
          if (attempts >= maxAttempts) {
            throw new Error(`Firestore concurrency conflict: exceeded max retry attempts (${maxAttempts}).`);
          }
          await new Promise(r => setTimeout(r, 5 * attempts));
          continue;
        }

        for (const op of writeOps) {
          if (op.type === 'set') {
            await op.docRef.set(op.data, op.options);
          } else if (op.type === 'update') {
            await op.docRef.update(op.data);
          } else if (op.type === 'delete') {
            await op.docRef.delete();
          }
        }

        return result;
      } catch (err) {
        if (attempts >= maxAttempts) throw err;
        await new Promise(r => setTimeout(r, 5 * attempts));
      }
    }
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

// Initial system counters
mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 50,
  billingReceiptCounter: 30,
  receiptCounter: 1050
});

const sampleFunds = [
  { id: 1, name: 'General Temple Fund' },
  { id: 2, name: 'Punarudharanam Fund' },
  { id: 3, name: 'Festival Fund' }
];

const sampleIncomeCats = [
  { id: 1, name: 'Pooja Income' },
  { id: 2, name: 'Donation Income' },
  { id: 3, name: 'Annadanam' }
];

const mockElements = new Map();

function getOrCreateElement(id) {
  if (!mockElements.has(id)) {
    mockElements.set(id, {
      id,
      value: '',
      disabled: false,
      readOnly: false,
      placeholder: '',
      innerHTML: '',
      style: {},
      dataset: {},
      options: [],
      selectedIndex: 0,
      setAttribute: function (k, v) { this[k] = v; },
      getAttribute: function (k) { return this[k] || null; },
      removeAttribute: function (k) { delete this[k]; },
      classList: {
        _classes: new Set(),
        add: function (c) { this._classes.add(c); },
        remove: function (c) { this._classes.delete(c); },
        contains: function (c) { return this._classes.has(c); },
        toggle: function (c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
      },
      querySelector: function (sel) {
        if (sel === '.rg-text') return { textContent: '' };
        return null;
      },
      closest: function () {
        return {
          querySelector: function () { return getOrCreateElement('receiptNoLabel'); }
        };
      }
    });
  }
  const created = mockElements.get(id);
  if (id === 'receiptForm') {
    created.querySelector = (childSel) => {
      if (childSel === 'input[name="editId"]') return getOrCreateElement('editIdInput');
      if (childSel === 'input[name="isBillingLinked"]') return getOrCreateElement('isBillingLinkedInput');
      if (childSel === 'input[name="isPhysical"]') return getOrCreateElement('isPhysicalInput');
      if (childSel === 'input[name="originalReceiptNo"]') return getOrCreateElement('originalReceiptNoInput');
      if (childSel === 'input[name="originalReceiptType"]') return getOrCreateElement('originalReceiptTypeInput');
      if (childSel === 'input[name="blockModeAction"]') return getOrCreateElement('blockModeActionInput');
      if (childSel === 'input[name="isBlockReceiptMode"]') return getOrCreateElement('isBlockReceiptModeInput');
      if (childSel === '.receipt-number-hint') return getOrCreateElement('receipt-number-hint');
      if (childSel === 'input[name="receiptNo"]') return getOrCreateElement('receiptNo');
      return null;
    };
  }
  return created;
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
  _lastAlert: null,
  alert: (msg) => { context._lastAlert = msg; },
  closeModal: () => {},
  refreshSettings: async () => {},
  navigate: async () => {},
  refreshBillingHistory: async () => {},
  printReceipt: () => {},
  reprintReceipt: () => {},
  CURRENT_VIEW: 'receipts',
  GlobalEditState: {
    _editing: new Map(),
    isEditing: (mod) => context.GlobalEditState._editing.has(mod),
    getEditState: (mod) => context.GlobalEditState._editing.get(mod),
    setEditing: (mod, id, data = {}) => context.GlobalEditState._editing.set(mod, { id, ...data }),
    clearEditing: (mod) => context.GlobalEditState._editing.delete(mod)
  },
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
  initMotionObserver: () => {},
  simpleList: (arr) => arr.join('; '),
  VIEW_RENDERERS: {},
  document: {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
      if (sel === '.receipt-number-hint') return getOrCreateElement('receipt-number-hint');
      if (sel === '#block-receipt-banner') return getOrCreateElement('block-receipt-banner');
      if (sel === '#btn-block-receipt') return getOrCreateElement('btn-block-receipt');
      if (sel === 'input[name="editId"]') return getOrCreateElement('editIdInput');
      if (sel === 'input[name="isBillingLinked"]') return getOrCreateElement('isBillingLinkedInput');
      if (sel === 'input[name="isPhysical"]') return getOrCreateElement('isPhysicalInput');
      if (sel === 'input[name="originalReceiptNo"]') return getOrCreateElement('originalReceiptNoInput');
      if (sel === 'input[name="originalReceiptType"]') return getOrCreateElement('originalReceiptTypeInput');
      if (sel === 'input[name="blockModeAction"]') return getOrCreateElement('blockModeActionInput');
      if (sel === 'input[name="isBlockReceiptMode"]') return getOrCreateElement('isBlockReceiptModeInput');
      if (sel === '#receiptForm') {
        const formEl = getOrCreateElement('receiptForm');
        formEl.querySelector = (childSel) => {
          if (childSel === 'input[name="editId"]') return getOrCreateElement('editIdInput');
          if (childSel === 'input[name="isBillingLinked"]') return getOrCreateElement('isBillingLinkedInput');
          if (childSel === 'input[name="isPhysical"]') return getOrCreateElement('isPhysicalInput');
          if (childSel === 'input[name="originalReceiptNo"]') return getOrCreateElement('originalReceiptNoInput');
          if (childSel === 'input[name="originalReceiptType"]') return getOrCreateElement('originalReceiptTypeInput');
          if (childSel === 'input[name="blockModeAction"]') return getOrCreateElement('blockModeActionInput');
          if (childSel === 'input[name="isBlockReceiptMode"]') return getOrCreateElement('isBlockReceiptModeInput');
          if (childSel === '.receipt-number-hint') return getOrCreateElement('receipt-number-hint');
          if (childSel === 'input[name="receiptNo"]') return getOrCreateElement('receiptNo');
          return null;
        };
        return formEl;
      }
      return null;
    },
    querySelectorAll: () => []
  },
  qsa: () => [],
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
  const argListStart = htmlContent.indexOf('(', startIdx);
  let openParens = 0;
  let argsEnd = argListStart;
  for (let i = argListStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '(') openParens++;
    else if (htmlContent[i] === ')') {
      openParens--;
      if (openParens === 0) {
        argsEnd = i;
        break;
      }
    }
  }

  let openBraces = 0;
  let bodyStart = htmlContent.indexOf('{', argsEnd);
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
  'fsConvertNumberedReceiptToUnnumbered',
  'fsConvertUnnumberedReceiptToNumbered',
  'cancelReceiptForm',
  'setBlockReceiptMode',
  'toggleBlockReceiptMode',
  'updateReceiptNoPreview',
  'saveReceipt',
  'allReceipts',
  'activeReceipts'
];

for (const fn of functionsToExtract) {
  const code = extractFunction(fn);
  vm.runInContext(code, context);
}

// Load VIEW_RENDERERS.receipts
vm.runInContext(extractViewRenderer('receipts'), context);

function setFormData(obj) {
  context.currentFormData.clear();
  for (const [k, v] of Object.entries(obj)) {
    context.currentFormData.set(k, String(v));
  }
  // Also reflect in mock element values
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'editId') getOrCreateElement('editIdInput').value = String(v);
    if (k === 'isBillingLinked') getOrCreateElement('isBillingLinkedInput').value = String(v);
    if (k === 'isPhysical') getOrCreateElement('isPhysicalInput').value = String(v);
    if (k === 'originalReceiptNo') getOrCreateElement('originalReceiptNoInput').value = String(v);
    if (k === 'originalReceiptType') getOrCreateElement('originalReceiptTypeInput').value = String(v);
    if (k === 'blockModeAction') getOrCreateElement('blockModeActionInput').value = String(v);
    if (k === 'isBlockReceiptMode') getOrCreateElement('isBlockReceiptModeInput').value = String(v);
    if (k === 'receiptNo') getOrCreateElement('receiptNo').value = String(v);
  }
}

async function runTestSuite() {
  console.log('\n--- GROUP 1: Code Inspection & Removal of Old Restriction ---');

  // T1.1: Verify old restriction string is removed
  const hasOldAlert = htmlContent.includes('Existing numbered receipts cannot be converted to unnumbered block receipts.');
  assert(!hasOldAlert, 'T1.1', 'Old restriction alert "Existing numbered receipts cannot be converted..." is safely removed');

  // T1.2: Check BLOCK NUMBER button exists in VIEW_RENDERERS.receipts
  assert(htmlContent.includes('id="btn-block-receipt"'), 'T1.2', 'BLOCK NUMBER button exists with id="btn-block-receipt"');

  // T1.3: Check hidden fields for conversion state tracking
  assert(htmlContent.includes('name="blockModeAction"'), 'T1.3', 'Hidden input blockModeAction exists for tracking explicit conversion actions');
  assert(htmlContent.includes('name="originalReceiptNo"'), 'T1.4', 'Hidden input originalReceiptNo exists for caching original identifier');
  assert(htmlContent.includes('name="originalReceiptType"'), 'T1.5', 'Hidden input originalReceiptType exists for tracking original type');

  // T1.6: Check conversion functions are exported
  assert(typeof context.fsConvertNumberedReceiptToUnnumbered === 'function', 'T1.6', 'fsConvertNumberedReceiptToUnnumbered is defined and exported');
  assert(typeof context.fsConvertUnnumberedReceiptToNumbered === 'function', 'T1.7', 'fsConvertUnnumberedReceiptToNumbered is defined and exported');

  console.log('\n--- GROUP 2: In-place Editing of Existing Unnumbered Receipts ---');

  // Create an initial unnumbered receipt in Firestore & IDB
  const customId = 'c_initial_test_01';
  const customDocId = `rcpt_${customId}`;
  const initialCustomRec = {
    id: customId,
    firestoreId: customDocId,
    receiptNo: '',
    receiptType: 'custom',
    date: '2026-10-21',
    name: 'Devotee Ananya',
    mobile: '9876543210',
    star: 'Rohini',
    fund: 'General Temple Fund',
    category: 'Donation Income',
    amount: 1500,
    paymentMode: 'Cash',
    bankAccount: '',
    remarks: 'Original unnumbered donation',
    voided: false,
    createdAt: Date.now() - 10000,
    createdBy: currentUser.uid
  };
  await mockDb.collection('receipts').doc(customDocId).set(initialCustomRec);
  await mockIdb.putRec('receipts', initialCustomRec);

  // Edit in place: update fund, devotee name, amount
  setFormData({
    editId: customId,
    name: 'Devotee Ananya Updated',
    mobile: '9876543210',
    star: 'Rohini',
    date: '2026-10-21',
    receiptNo: '',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    amount: '2000',
    paymentMode: 'Cash',
    remarks: 'Updated remarks for unnumbered'
  });

  await context.saveReceipt(false);

  const editedCustomDoc = await mockDb.collection('receipts').doc(customDocId).get();
  assert(editedCustomDoc.exists, 'T2.1', 'Edited unnumbered receipt document still exists at original doc ID');
  assert(editedCustomDoc.data().receiptNo === '', 'T2.2', 'Edited unnumbered receipt preserved empty receiptNo', editedCustomDoc.data().receiptNo);
  assert(editedCustomDoc.data().receiptType === 'custom', 'T2.3', 'Edited unnumbered receipt preserved receiptType: "custom"', editedCustomDoc.data().receiptType);
  assert(editedCustomDoc.data().fund === 'Punarudharanam Fund', 'T2.4', 'Fund updated to "Punarudharanam Fund"', editedCustomDoc.data().fund);
  assert(editedCustomDoc.data().amount === 2000, 'T2.5', 'Amount updated to 2000', editedCustomDoc.data().amount);

  const cSnap = await mockDb.collection('system').doc('counters').get();
  assert(cSnap.data().globalSequenceCounter === 50, 'T2.6', 'globalSequenceCounter strictly untouched (remains 50)', cSnap.data().globalSequenceCounter);

  console.log('\n--- GROUP 3: Converting Ordinary Numbered Receipt (R-050) to Unnumbered Mode ---');

  // Seed an ordinary numbered receipt R-050
  const seq50 = 50;
  const rcpt50DocId = 'rcpt_50';
  const res50DocId = 'res_50';
  const initialNumberedRec = {
    id: seq50,
    legacyId: seq50,
    firestoreId: rcpt50DocId,
    receiptNo: 'R-050',
    receiptType: 'independent',
    reservationDocId: res50DocId,
    operationId: 'op_rcpt_seed_50',
    date: '2026-10-21',
    name: 'Devotee Ramesh',
    mobile: '9845012345',
    star: 'Ashwini',
    description: 'Pooja Seva',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: 500,
    paymentMode: 'Cash',
    bankAccount: '',
    remarks: 'Original numbered receipt',
    voided: false,
    createdAt: Date.now() - 50000,
    createdBy: currentUser.uid
  };
  await mockDb.collection('receipts').doc(rcpt50DocId).set(initialNumberedRec);
  await mockDb.collection('system').doc(res50DocId).set({
    seqNumber: seq50,
    formattedNo: '050',
    type: 'independent_receipt',
    receiptNo: 'R-050',
    receiptDocId: rcpt50DocId,
    status: 'active'
  });
  await mockDb.collection('system').doc('op_rcpt_seed_50').set({
    operationId: 'op_rcpt_seed_50',
    seqNumber: seq50,
    receiptNo: 'R-050',
    status: 'committed'
  });
  await mockIdb.putRec('receipts', initialNumberedRec);

  // Admin edits receipt 50 and toggles BLOCK NUMBER mode ON
  context.isBlockReceiptMode = true;
  context.isBlockNumberMode = true;
  setFormData({
    editId: seq50,
    name: 'Devotee Ramesh Converted',
    mobile: '9845012345',
    star: 'Ashwini',
    date: '2026-10-21',
    receiptNo: '',
    originalReceiptNo: 'R-050',
    originalReceiptType: 'independent',
    blockModeAction: 'convertToUnnumbered',
    isBlockReceiptMode: '1',
    fund: 'Festival Fund',
    category: 'Pooja Income',
    amount: '750',
    paymentMode: 'Cash',
    remarks: 'Converted to unnumbered block receipt'
  });

  await context.saveReceipt(false);

  // Verify old numbered doc rcpt_50 is deleted
  const oldRcptDoc = await mockDb.collection('receipts').doc(rcpt50DocId).get();
  assert(!oldRcptDoc.exists, 'T3.1', 'Old numbered receipt doc "rcpt_50" atomically deleted from Firestore');

  // Verify old reservation res_50 is deleted
  const oldResDoc = await mockDb.collection('system').doc(res50DocId).get();
  assert(!oldResDoc.exists, 'T3.2', 'Old reservation doc "res_50" atomically deleted from Firestore');

  // Verify old operation doc op_rcpt_seed_50 is deleted
  const oldOpDoc = await mockDb.collection('system').doc('op_rcpt_seed_50').get();
  assert(!oldOpDoc.exists, 'T3.3', 'Old operation doc "op_rcpt_seed_50" atomically deleted from Firestore');

  // Verify old doc is evicted from IDB cache
  const oldIdbRec = await mockIdb.getOne('receipts', seq50);
  assert(!oldIdbRec, 'T3.4', 'Old numbered receipt evicted from IndexedDB cache');

  // Find newly converted unnumbered receipt
  const allRcptsAfterConv = (await mockDb.collection('receipts').get()).docs.map(d => d.data());
  const convertedUnnumbered = allRcptsAfterConv.find(r => r.name === 'Devotee Ramesh Converted');
  assert(!!convertedUnnumbered, 'T3.5', 'New canonical unnumbered receipt exists in Firestore');
  assert(convertedUnnumbered.receiptNo === '', 'T3.6', 'Converted receipt has receiptNo empty string', convertedUnnumbered?.receiptNo);
  assert(convertedUnnumbered.receiptType === 'custom', 'T3.7', 'Converted receipt has receiptType: "custom"', convertedUnnumbered?.receiptType);
  assert(String(convertedUnnumbered.id).startsWith('c_'), 'T3.8', 'Converted receipt ID follows canonical "c_..." format', convertedUnnumbered?.id);
  assert(convertedUnnumbered.convertedFromReceiptNo === 'R-050', 'T3.9', 'Audit trail preserved: convertedFromReceiptNo is "R-050"', convertedUnnumbered?.convertedFromReceiptNo);
  assert(convertedUnnumbered.convertedFromId === 50, 'T3.10', 'Audit trail preserved: convertedFromId is 50', convertedUnnumbered?.convertedFromId);
  assert(convertedUnnumbered.fund === 'Festival Fund', 'T3.11', 'Financial field fund preserved as "Festival Fund"', convertedUnnumbered?.fund);
  assert(convertedUnnumbered.amount === 750, 'T3.12', 'Amount correctly saved as 750', convertedUnnumbered?.amount);

  // Counter check: counters must NEVER roll back
  const cSnapAfterConv = await mockDb.collection('system').doc('counters').get();
  assert(cSnapAfterConv.data().globalSequenceCounter === 50, 'T3.13', 'globalSequenceCounter strictly NOT decremented or reset (remains 50)', cSnapAfterConv.data().globalSequenceCounter);

  console.log('\n--- GROUP 4: Converting Unnumbered Receipt to Numbered Mode ---');

  // Now, convert the unnumbered receipt back to numbered mode
  // Admin toggles BLOCK NUMBER OFF
  context.isBlockReceiptMode = false;
  context.isBlockNumberMode = false;
  context._explicitBlockModeDisabled = true;
  setFormData({
    editId: convertedUnnumbered.id,
    name: 'Devotee Ramesh Back to Numbered',
    mobile: '9845012345',
    star: 'Ashwini',
    date: '2026-10-21',
    receiptNo: '',
    originalReceiptNo: '',
    originalReceiptType: 'custom',
    blockModeAction: 'convertToNumbered',
    isBlockReceiptMode: '0',
    fund: 'Festival Fund',
    category: 'Pooja Income',
    amount: '800',
    paymentMode: 'Cash',
    remarks: 'Re-converted from unnumbered to numbered'
  });

  await context.saveReceipt(false);

  // Old unnumbered doc must be deleted
  const oldUnnumberedDoc = await mockDb.collection('receipts').doc(convertedUnnumbered.firestoreId).get();
  assert(!oldUnnumberedDoc.exists, 'T4.1', 'Old unnumbered document atomically deleted from Firestore');

  // Old unnumbered doc evicted from IDB
  const oldUnnumberedIdb = await mockIdb.getOne('receipts', convertedUnnumbered.id);
  assert(!oldUnnumberedIdb, 'T4.2', 'Old unnumbered document evicted from IndexedDB cache');

  // New numbered document created with sequential number
  const newNumberedDoc = await mockDb.collection('receipts').doc('rcpt_51').get();
  assert(newNumberedDoc.exists, 'T4.3', 'New numbered document "rcpt_51" created in Firestore');
  assert(newNumberedDoc.data().id === 51, 'T4.4', 'New numbered document assigned sequential id 51', newNumberedDoc.data().id);
  assert(newNumberedDoc.data().receiptNo === 'R-051', 'T4.5', 'New numbered document assigned receiptNo "R-051"', newNumberedDoc.data().receiptNo);
  assert(newNumberedDoc.data().receiptType === 'independent', 'T4.6', 'New receiptType is "independent"', newNumberedDoc.data().receiptType);
  assert(newNumberedDoc.data().reservationDocId === 'res_51', 'T4.7', 'reservationDocId set to "res_51"', newNumberedDoc.data().reservationDocId);
  assert(newNumberedDoc.data().convertedFromUnnumberedId === convertedUnnumbered.id, 'T4.8', 'Audit trail preserved: convertedFromUnnumberedId recorded', newNumberedDoc.data().convertedFromUnnumberedId);

  // Reservation res_51 exists
  const newResDoc = await mockDb.collection('system').doc('res_51').get();
  assert(newResDoc.exists, 'T4.9', 'Reservation doc "res_51" created in Firestore');
  assert(newResDoc.data().receiptNo === 'R-051', 'T4.10', 'Reservation doc holds receiptNo "R-051"', newResDoc.data().receiptNo);

  // Counter advanced forward to 51
  const cSnapAfterNumbered = await mockDb.collection('system').doc('counters').get();
  assert(cSnapAfterNumbered.data().globalSequenceCounter === 51, 'T4.11', 'globalSequenceCounter monotonically advanced to 51', cSnapAfterNumbered.data().globalSequenceCounter);

  console.log('\n--- GROUP 5: Sequence Collision & Reservation Skipping During Conversion ---');

  // Pre-seed an occupied reservation res_52 and billing doc bill_53
  await mockDb.collection('system').doc('res_52').set({ seqNumber: 52, status: 'active', receiptNo: 'R-052' });
  await mockDb.collection('billing').doc('bill_53').set({ id: 53, receiptNo: 'BILL-053' });

  // Create another unnumbered receipt
  const unnumbered2Id = 'c_test_collision_02';
  const unnumbered2DocId = `rcpt_${unnumbered2Id}`;
  await mockDb.collection('receipts').doc(unnumbered2DocId).set({
    id: unnumbered2Id,
    firestoreId: unnumbered2DocId,
    receiptNo: '',
    receiptType: 'custom',
    fund: 'General Temple Fund',
    category: 'Donation Income',
    amount: 100,
    name: 'Devotee Collision Test',
    date: '2026-10-21',
    voided: false
  });

  // Convert unnumbered2 to numbered: should skip occupied 52 (reservation) and 53 (bill) and allocate 54
  context.isBlockReceiptMode = false;
  context.isBlockNumberMode = false;
  context._explicitBlockModeDisabled = true;
  setFormData({
    editId: unnumbered2Id,
    name: 'Devotee Collision Test Numbered',
    date: '2026-10-21',
    receiptNo: '',
    originalReceiptNo: '',
    originalReceiptType: 'custom',
    blockModeAction: 'convertToNumbered',
    isBlockReceiptMode: '0',
    fund: 'General Temple Fund',
    category: 'Donation Income',
    amount: '100',
    paymentMode: 'Cash'
  });

  await context.saveReceipt(false);

  const allocatedDoc = await mockDb.collection('receipts').doc('rcpt_54').get();
  assert(allocatedDoc.exists, 'T5.1', 'Allocated receipt skipped occupied res_52 and bill_53 to reach sequence 54');
  assert(allocatedDoc.data().receiptNo === 'R-054', 'T5.2', 'Allocated receipt receiptNo is R-054', allocatedDoc.data().receiptNo);

  const cSnapCollision = await mockDb.collection('system').doc('counters').get();
  assert(cSnapCollision.data().globalSequenceCounter === 54, 'T5.3', 'globalSequenceCounter advanced to 54', cSnapCollision.data().globalSequenceCounter);

  console.log('\n--- GROUP 6: Physical Receipts Guarding (P600-P900 and PU1+) ---');

  // Seed Physical P receipt P600
  const physP600DocId = 'rcpt_phys_P600';
  await mockDb.collection('receipts').doc(physP600DocId).set({
    id: 'P600',
    firestoreId: physP600DocId,
    receiptNo: 'P600',
    isPhysical: true,
    physicalType: 'P',
    source: 'physical',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: 250,
    date: '2026-10-21',
    name: 'Devotee Phys P',
    voided: false
  });

  // Seed Physical PU receipt PU1
  const physPU1DocId = 'rcpt_phys_PU1';
  await mockDb.collection('receipts').doc(physPU1DocId).set({
    id: 'PU1',
    firestoreId: physPU1DocId,
    receiptNo: 'PU1',
    isPhysical: true,
    physicalType: 'PU',
    source: 'physical',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    amount: 1000,
    date: '2026-10-21',
    name: 'Devotee Phys PU',
    voided: false
  });

  // Test UI toggle guard on Physical P
  getOrCreateElement('editIdInput').value = 'P600';
  getOrCreateElement('isPhysicalInput').value = '1';
  getOrCreateElement('originalReceiptNoInput').value = 'P600';
  context._lastAlert = null;
  context.toggleBlockReceiptMode(true);
  assert(context._lastAlert && context._lastAlert.includes('Physical receipts (P / PU) have fixed counterfoil identifiers'), 'T6.1', 'toggleBlockReceiptMode rejects physical P receipt conversion with alert');

  // Test UI toggle guard on Physical PU
  getOrCreateElement('editIdInput').value = 'PU1';
  getOrCreateElement('isPhysicalInput').value = '1';
  getOrCreateElement('originalReceiptNoInput').value = 'PU1';
  context._lastAlert = null;
  context.toggleBlockReceiptMode(true);
  assert(context._lastAlert && context._lastAlert.includes('Physical receipts (P / PU) have fixed counterfoil identifiers'), 'T6.2', 'toggleBlockReceiptMode rejects physical PU receipt conversion with alert');

  // Test saveReceipt guard on Physical P
  setFormData({
    editId: 'P600',
    name: 'Devotee Phys P',
    date: '2026-10-21',
    receiptNo: 'P600',
    originalReceiptNo: 'P600',
    isPhysical: '1',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: '250',
    paymentMode: 'Cash'
  });
  context._lastAlert = null;
  await context.saveReceipt(false, true); // explicitly requesting block mode
  assert(context._lastAlert && context._lastAlert.includes('Physical receipts (P / PU) have fixed counterfoil identifiers'), 'T6.3', 'saveReceipt rejects physical receipt conversion to block receipt');

  // Verify P600 still exists and is unaltered
  const p600After = await mockDb.collection('receipts').doc(physP600DocId).get();
  assert(p600After.exists && p600After.data().receiptNo === 'P600', 'T6.4', 'Physical receipt P600 remains intact and uncorrupted');

  console.log('\n--- GROUP 7: Billing-Linked Receipts Guarding ---');

  // Seed billing-linked receipt
  const billDocId = 'bill_10';
  const billRcptDocId = 'rcpt_10';
  await mockDb.collection('billing').doc(billDocId).set({
    id: 10,
    receiptNo: 'BILL-010',
    devoteeName: 'Devotee Billing',
    totalAmount: 300,
    voided: false
  });
  await mockDb.collection('receipts').doc(billRcptDocId).set({
    id: 10,
    firestoreId: billRcptDocId,
    receiptNo: 'R-010',
    source: 'billing',
    billingId: 10,
    billingFirestoreId: billDocId,
    billingReceiptNo: 'BILL-010',
    amount: 300,
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    name: 'Devotee Billing',
    date: '2026-10-21',
    voided: false
  });

  // Test UI toggle guard on billing-linked receipt
  getOrCreateElement('editIdInput').value = '10';
  getOrCreateElement('isBillingLinkedInput').value = '1';
  context._lastAlert = null;
  context.toggleBlockReceiptMode(true);
  assert(context._lastAlert && context._lastAlert.includes('Billing-linked receipts cannot be converted'), 'T7.1', 'toggleBlockReceiptMode rejects billing-linked receipt conversion with alert');

  // Test saveReceipt guard on billing-linked receipt
  setFormData({
    editId: 10,
    isBillingLinked: '1',
    linkedBillFirestoreId: billDocId,
    name: 'Devotee Billing',
    date: '2026-10-21',
    receiptNo: 'R-010',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: '300',
    paymentMode: 'Cash'
  });
  context._lastAlert = null;
  await context.saveReceipt(false, true);
  assert(context._lastAlert && context._lastAlert.includes('Billing-linked receipts cannot be converted'), 'T7.2', 'saveReceipt rejects billing-linked receipt conversion with alert');

  // Verify bill_10 and rcpt_10 still exist intact
  const billAfter = await mockDb.collection('billing').doc(billDocId).get();
  const rcptAfter = await mockDb.collection('receipts').doc(billRcptDocId).get();
  assert(billAfter.exists && rcptAfter.exists, 'T7.3', 'Billing doc and accounting receipt remain intact, never deleted');

  console.log('\n--- GROUP 8: Voided Receipts Guarding ---');

  // Seed voided receipt
  const voidedDocId = 'rcpt_99';
  await mockDb.collection('receipts').doc(voidedDocId).set({
    id: 99,
    firestoreId: voidedDocId,
    receiptNo: 'R-099',
    voided: true,
    voidReason: 'Mistake in name',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: 100,
    name: 'Devotee Voided',
    date: '2026-10-21'
  });

  setFormData({
    editId: 99,
    name: 'Devotee Voided Attempt',
    date: '2026-10-21',
    receiptNo: 'R-099',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    amount: '100',
    paymentMode: 'Cash'
  });
  context._lastAlert = null;
  await context.saveReceipt(false);
  assert(context._lastAlert && context._lastAlert.includes('Voided receipts cannot be edited'), 'T8.1', 'saveReceipt rejects editing voided receipts');

  console.log('\n--- GROUP 9: Form Lifecycle, Preview, and Cancel Behaviors ---');

  // Test cancelReceiptForm resets all block mode states
  context.isBlockReceiptMode = true;
  context.isBlockNumberMode = true;
  context._cachedEditReceiptNo = 'R-050';
  context._explicitBlockModeDisabled = true;
  context._explicitBlockModeEnabled = true;
  context.cancelReceiptForm();
  assert(context.isBlockReceiptMode === false, 'T9.1', 'cancelReceiptForm resets isBlockReceiptMode to false');
  assert(context.isBlockNumberMode === false, 'T9.2', 'cancelReceiptForm resets isBlockNumberMode to false');
  assert(context._cachedEditReceiptNo === null, 'T9.3', 'cancelReceiptForm clears _cachedEditReceiptNo');
  assert(context._explicitBlockModeDisabled === false, 'T9.4', 'cancelReceiptForm resets _explicitBlockModeDisabled');
  assert(context._explicitBlockModeEnabled === false, 'T9.5', 'cancelReceiptForm resets _explicitBlockModeEnabled');

  // Test updateReceiptNoPreview does not alter field if block mode is active
  context.isBlockReceiptMode = true;
  getOrCreateElement('receiptNo').value = '';
  context.updateReceiptNoPreview('R-099');
  assert(getOrCreateElement('receiptNo').value === '', 'T9.6', 'updateReceiptNoPreview preserves blank input during block mode');
  context.isBlockReceiptMode = false;

  console.log('\n--- GROUP 10: Concurrency Simulation on Sequential Conversion ---');

  // Seed two unnumbered receipts
  const cConc1 = 'c_concurrent_01';
  const cConc2 = 'c_concurrent_02';
  await mockDb.collection('receipts').doc(`rcpt_${cConc1}`).set({
    id: cConc1,
    firestoreId: `rcpt_${cConc1}`,
    receiptNo: '',
    receiptType: 'custom',
    fund: 'General Temple Fund',
    category: 'Donation Income',
    amount: 100,
    name: 'Devotee Conc 1',
    date: '2026-10-21',
    voided: false
  });
  await mockDb.collection('receipts').doc(`rcpt_${cConc2}`).set({
    id: cConc2,
    firestoreId: `rcpt_${cConc2}`,
    receiptNo: '',
    receiptType: 'custom',
    fund: 'General Temple Fund',
    category: 'Donation Income',
    amount: 200,
    name: 'Devotee Conc 2',
    date: '2026-10-21',
    voided: false
  });

  // Call fsConvertUnnumberedReceiptToNumbered concurrently for both
  const [res1, res2] = await Promise.all([
    context.fsConvertUnnumberedReceiptToNumbered({
      prior: { id: cConc1, firestoreId: `rcpt_${cConc1}` },
      updatedFields: { name: 'Devotee Conc 1', amount: 100, fund: 'General Temple Fund', category: 'Donation Income', date: '2026-10-21' },
      user: currentUser
    }),
    context.fsConvertUnnumberedReceiptToNumbered({
      prior: { id: cConc2, firestoreId: `rcpt_${cConc2}` },
      updatedFields: { name: 'Devotee Conc 2', amount: 200, fund: 'General Temple Fund', category: 'Donation Income', date: '2026-10-21' },
      user: currentUser
    })
  ]);

  assert(res1 && res2, 'T10.1', 'Both concurrent conversions completed successfully');
  assert(res1.id !== res2.id, 'T10.2', 'Concurrent conversions received distinct IDs', `${res1.id} vs ${res2.id}`);
  assert(res1.receiptNo !== res2.receiptNo, 'T10.3', 'Concurrent conversions received distinct receipt numbers', `${res1.receiptNo} vs ${res2.receiptNo}`);
  assert([55, 56].includes(res1.id) && [55, 56].includes(res2.id), 'T10.4', 'Concurrent conversions allocated sequential numbers 55 and 56');

  console.log('\n--- GROUP 11: End-to-End Preservation of All 11 Financial & Donor Fields ---');

  // Test full field fidelity during numbered -> unnumbered conversion
  const seqFieldTest = 57;
  const rcptFieldDocId = `rcpt_${seqFieldTest}`;
  const resFieldDocId = `res_${seqFieldTest}`;
  await mockDb.collection('receipts').doc(rcptFieldDocId).set({
    id: seqFieldTest,
    firestoreId: rcptFieldDocId,
    receiptNo: 'R-057',
    receiptType: 'independent',
    reservationDocId: resFieldDocId,
    date: '2026-10-21',
    name: 'Devotee Eleven Fields',
    mobile: '9845112233',
    star: 'Revathi',
    description: 'Special Archana & Abhishekham',
    fund: 'Festival Fund',
    category: 'Pooja Income',
    paymentMode: 'Bank',
    bankAccount: 'SBI Temple Main',
    amount: 1500,
    remarks: 'Field preservation invariant check',
    voided: false
  });
  await mockDb.collection('system').doc(resFieldDocId).set({
    seqNumber: seqFieldTest,
    status: 'active',
    receiptNo: 'R-057'
  });

  context.isBlockReceiptMode = true;
  context.isBlockNumberMode = true;
  setFormData({
    editId: seqFieldTest,
    name: 'Devotee Eleven Fields Updated',
    mobile: '9845112233',
    star: 'Revathi',
    description: 'Special Archana & Abhishekham (Updated)',
    date: '2026-10-22',
    receiptNo: '',
    originalReceiptNo: 'R-057',
    originalReceiptType: 'independent',
    blockModeAction: 'convertToUnnumbered',
    isBlockReceiptMode: '1',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Bank',
    bankAccount: 'SBI Temple Main',
    amount: '1800',
    remarks: 'All 11 fields updated and preserved'
  });

  await context.saveReceipt(false);

  const converted11Doc = (await mockDb.collection('receipts').get()).docs.find(d => d.data().name === 'Devotee Eleven Fields Updated')?.data();
  assert(!!converted11Doc, 'T11.1', 'Converted document found in Firestore');
  assert(converted11Doc.date === '2026-10-22', 'T11.2', 'Date preserved', converted11Doc.date);
  assert(converted11Doc.name === 'Devotee Eleven Fields Updated', 'T11.3', 'Name preserved', converted11Doc.name);
  assert(converted11Doc.mobile === '9845112233', 'T11.4', 'Mobile preserved', converted11Doc.mobile);
  assert(converted11Doc.star === 'Revathi', 'T11.5', 'Star preserved', converted11Doc.star);
  assert(converted11Doc.description === 'Special Archana & Abhishekham (Updated)', 'T11.6', 'Description preserved', converted11Doc.description);
  assert(converted11Doc.fund === 'Punarudharanam Fund', 'T11.7', 'Fund preserved', converted11Doc.fund);
  assert(converted11Doc.category === 'Donation Income', 'T11.8', 'Category preserved', converted11Doc.category);
  assert(converted11Doc.paymentMode === 'Bank', 'T11.9', 'Payment mode preserved', converted11Doc.paymentMode);
  assert(converted11Doc.bankAccount === 'SBI Temple Main', 'T11.10', 'Bank account preserved', converted11Doc.bankAccount);
  assert(converted11Doc.amount === 1800, 'T11.11', 'Amount preserved', converted11Doc.amount);
  assert(converted11Doc.remarks === 'All 11 fields updated and preserved', 'T11.12', 'Remarks preserved', converted11Doc.remarks);
  assert(converted11Doc.fund !== converted11Doc.category, 'T11.13', 'Fund and category remain completely independent');

  console.log('\n--- GROUP 12: VIEW_RENDERERS.receipts Edit UI Inspection ---');

  // Seed sample records for rendering
  const rCustom = { id: 'c_render_01', firestoreId: 'rcpt_c_render_01', receiptType: 'custom', receiptNo: '', name: 'Devotee Unnum Render', amount: 500, date: '2026-10-21', fund: 'General Temple Fund' };
  const rNumbered = { id: 70, firestoreId: 'rcpt_70', receiptNo: 'R-070', receiptType: 'independent', name: 'Devotee Num Render', amount: 300, date: '2026-10-21', fund: 'General Temple Fund' };
  const rPhysP = { id: 'P700', firestoreId: 'rcpt_phys_P700', receiptNo: 'P700', isPhysical: true, physicalType: 'P', name: 'Devotee Phys P Render', amount: 200, date: '2026-10-21', fund: 'General Temple Fund' };
  const rPhysPU = { id: 'PU5', firestoreId: 'rcpt_phys_PU5', receiptNo: 'PU5', isPhysical: true, physicalType: 'PU', name: 'Devotee Phys PU Render', amount: 1000, date: '2026-10-21', fund: 'Punarudharanam Fund' };

  await mockDb.collection('receipts').doc('rcpt_c_render_01').set(rCustom);
  await mockDb.collection('receipts').doc('rcpt_70').set(rNumbered);
  await mockDb.collection('receipts').doc('rcpt_phys_P700').set(rPhysP);
  await mockDb.collection('receipts').doc('rcpt_phys_PU5').set(rPhysPU);

  await mockIdb.putRec('receipts', rCustom);
  await mockIdb.putRec('receipts', rNumbered);
  await mockIdb.putRec('receipts', rPhysP);
  await mockIdb.putRec('receipts', rPhysPU);

  const customEditHtml = await context.VIEW_RENDERERS.receipts(null, 'c_render_01');
  assert(customEditHtml.includes('Edit Receipt (Unnumbered)'), 'T12.1', 'Edit form title for unnumbered receipt is "Edit Receipt (Unnumbered)"');
  assert(customEditHtml.includes('id="block-receipt-banner"'), 'T12.2', 'Block receipt banner present in edit form');
  assert(customEditHtml.includes('Exit Block Number Mode'), 'T12.3', 'Exit Block Number Mode button rendered');
  assert(customEditHtml.includes('name="originalReceiptType" value="custom"'), 'T12.4', 'Hidden originalReceiptType is "custom"');

  const numberedEditHtml = await context.VIEW_RENDERERS.receipts(null, 70);
  assert(numberedEditHtml.includes('Edit Receipt R-070'), 'T12.5', 'Edit form title for numbered receipt includes "Edit Receipt R-070"');
  assert(numberedEditHtml.includes('name="originalReceiptNo" value="R-070"'), 'T12.6', 'Hidden originalReceiptNo is "R-070"');
  assert(numberedEditHtml.includes('id="btn-block-receipt"'), 'T12.7', 'BLOCK NUMBER button rendered in numbered edit form');

  const physPEditHtml = await context.VIEW_RENDERERS.receipts(null, 'P700');
  assert(physPEditHtml.includes('[PHYSICAL]'), 'T12.8', 'Edit form title for Physical P receipt includes "[PHYSICAL]"');

  const physPUEditHtml = await context.VIEW_RENDERERS.receipts(null, 'PU5');
  assert(physPUEditHtml.includes('[PHYSICAL · PUNARUDHARANAM]'), 'T12.9', 'Edit form title for Physical PU receipt includes "[PHYSICAL · PUNARUDHARANAM]"');

  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.179 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
