/**
 * tests/test_step_33_171_physical_receipt_delete_suite.js
 * Comprehensive automated regression suite for:
 * STEP 33.171 — Fix Firestore Transaction Read-Before-Write Error for Physical Receipt Deletion
 *
 * Verifies:
 * 1. Delete physical P-series receipt (P600-P900).
 * 2. Delete physical PU-series receipt (PU1+).
 * 3. Verify physical deletion does not alter software counters.
 * 4. Delete normal software-generated independent receipt.
 * 5. Delete bill-linked receipt (bilateral atomic deletion).
 * 6. Verify highest-number reuse for eligible software receipts vs middle gap preservation.
 * 7. Verify failed transactions do not remove local records.
 * 8. Verify Firestore transaction callbacks perform all reads before writes (strict fail-on-read-after-write).
 * 9. Verify physical receipt re-entry after deletion without duplicate collision.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.171: PHYSICAL RECEIPT DELETION TRANSACTION ORDERING TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const BACKUP_FILE = path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_171_PhysicalReceiptDelete_Backup_20261021_154000.html');

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

// Read HTML
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

// =========================================================================
// MOCK FIRESTORE WITH STRICT TRANSACTION READ-BEFORE-WRITE ENFORCEMENT
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
            docs: filtered,
            size: filtered.length,
            empty: filtered.length === 0,
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
    this.store = new Map();
    this.txLogs = []; // Records every transaction execution trace
    this.failNextTransaction = false;
  }

  collection(colPath) {
    return new MockCollectionRef(this, colPath);
  }

  _key(col, id) {
    return `${col}/${id}`;
  }

  _getDoc(col, id) {
    const key = this._key(col, id);
    if (!this.store.has(key)) {
      return { id, exists: false, data: () => undefined, ref: new MockDocRef(this, col, id) };
    }
    const val = JSON.parse(JSON.stringify(this.store.get(key)));
    return { id, exists: true, data: () => val, ref: new MockDocRef(this, col, id) };
  }

  _setDoc(col, id, data, options = {}) {
    const key = this._key(col, id);
    if (options.merge && this.store.has(key)) {
      const existing = this.store.get(key);
      const merged = { ...existing, ...JSON.parse(JSON.stringify(data)) };
      this.store.set(key, merged);
    } else {
      this.store.set(key, JSON.parse(JSON.stringify(data)));
    }
  }

  _deleteDoc(col, id) {
    const key = this._key(col, id);
    this.store.delete(key);
  }

  _getCol(col) {
    const docs = [];
    for (const [key, val] of this.store.entries()) {
      if (key.startsWith(col + '/')) {
        const docId = key.slice(col.length + 1);
        docs.push({
          id: docId,
          exists: true,
          data: () => JSON.parse(JSON.stringify(val)),
          ref: new MockDocRef(this, col, docId)
        });
      }
    }
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: (cb) => docs.forEach(cb)
    };
  }

  async runTransaction(updateFunction) {
    if (this.failNextTransaction) {
      this.failNextTransaction = false;
      throw new Error('Simulated Firestore transaction network failure.');
    }

    const txTrace = {
      operations: [],
      writesQueued: false,
      readAfterWriteDetected: false,
      success: false
    };

    const pendingWrites = [];

    const tx = {
      get: async (docRef) => {
        if (!docRef) return null;
        txTrace.operations.push({ op: 'get', col: docRef.colPath, id: docRef.id });
        if (txTrace.writesQueued) {
          txTrace.readAfterWriteDetected = true;
          throw new Error('Firestore transactions require all reads to be executed before all writes.');
        }
        return docRef.get();
      },
      set: (docRef, data, options) => {
        txTrace.writesQueued = true;
        txTrace.operations.push({ op: 'set', col: docRef.colPath, id: docRef.id });
        pendingWrites.push(() => docRef.set(data, options));
      },
      update: (docRef, data) => {
        txTrace.writesQueued = true;
        txTrace.operations.push({ op: 'update', col: docRef.colPath, id: docRef.id });
        pendingWrites.push(() => docRef.update(data));
      },
      delete: (docRef) => {
        txTrace.writesQueued = true;
        txTrace.operations.push({ op: 'delete', col: docRef.colPath, id: docRef.id });
        pendingWrites.push(() => docRef.delete());
      }
    };

    try {
      const result = await updateFunction(tx);
      // If user function succeeded without error, commit all pending writes
      for (const writeAction of pendingWrites) {
        await writeAction();
      }
      txTrace.success = true;
      this.txLogs.push(txTrace);
      return result;
    } catch (err) {
      txTrace.success = false;
      txTrace.error = err.message;
      this.txLogs.push(txTrace);
      throw err;
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
// SETUP VM ENVIRONMENT WITH FUNCTIONS EXTRACTED FROM Temple_Accounts-1.html
// =========================================================================

const mockDb = new MockFirestore();
const mockIdb = new MockIndexedDB();
const currentUser = { uid: 'admin_test_user', displayName: 'Admin User', email: 'admin@temple.org' };

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
  computeReceiptFingerprint: (r) => `fp_${r.receiptNo || r.manualReceiptNo}_${r.amount}`,
  todayISO: () => '2026-10-21',
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  fmtMoney: (a) => '₹' + parseFloat(a || 0).toFixed(2),
  fmtDate: (d) => String(d),
  el: (id) => null,
  closeModal: () => {},
  refreshSettings: async () => {},
  navigate: async () => {},
  refreshBillingHistory: async () => {},
  CURRENT_VIEW: 'receipts',
  GlobalEditState: { clearEditing: () => {} },
  window: {}
};

// Bind circular window refs
context.window = context;

vm.createContext(context);

// Extract functions from htmlContent
function extractFunction(name) {
  const marker = `function ${name}`;
  const asyncMarker = `async function ${name}`;
  let startIdx = htmlContent.indexOf(asyncMarker);
  if (startIdx === -1) startIdx = htmlContent.indexOf(marker);
  if (startIdx === -1) throw new Error(`Function ${name} not found in HTML`);

  // Simple brace matcher to extract full function
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

// Evaluate extracted functions in VM context
vm.runInContext(extractFunction('parsePhysicalReceiptIdentifier'), context);
vm.runInContext(extractFunction('fsDeleteBillingRecord'), context);
vm.runInContext(extractFunction('fsDeleteReceiptRecord'), context);
vm.runInContext(extractFunction('fsCreatePhysicalReceipt'), context);
vm.runInContext(extractFunction('deleteReceiptRecord'), context);

// Helper to seed counters
async function seedCounters(globalSeq = 10, billCounter = 5, rcptCounter = 1000, voucherCounter = 20) {
  await mockDb.collection('system').doc('counters').set({
    globalSequenceCounter: globalSeq,
    billingReceiptCounter: billCounter,
    receiptCounter: rcptCounter,
    voucherCounter: voucherCounter,
    updatedAt: Date.now()
  });
}

async function getCounters() {
  const snap = await mockDb.collection('system').doc('counters').get();
  return snap.exists ? snap.data() : {};
}

// =========================================================================
// RUN TEST SUITE
// =========================================================================

async function runTests() {
  // --- TEST GROUP 1: Physical P-series receipt deletion ---
  console.log('\n--- GROUP 1: Physical P-Series Receipt Deletion (e.g. P600) ---');
  {
    await seedCounters(20, 10, 1020, 5);
    const initialTxCount = mockDb.txLogs.length;

    // Seed physical receipt P600
    const p600Data = {
      id: 'rcpt_phys_P600',
      firestoreId: 'rcpt_phys_P600',
      legacyId: 'rcpt_phys_P600',
      receiptNo: 'P600',
      fund: 'General Temple Fund',
      category: 'Pooja Income',
      amount: 150,
      source: 'physical',
      isPhysical: true,
      operationId: 'op_phys_p600'
    };
    await mockDb.collection('receipts').doc('rcpt_phys_P600').set(p600Data);
    await mockDb.collection('system').doc('res_phys_P600').set({
      formattedNo: 'P600',
      physicalId: 'P600',
      receiptDocId: 'rcpt_phys_P600',
      status: 'active'
    });
    await mockDb.collection('system').doc('op_phys_p600').set({
      operationId: 'op_phys_p600',
      type: 'physical_receipt'
    });
    await mockIdb.putRec('receipts', p600Data);
    await mockIdb.putRec('receipts', { id: 'P600', receiptNo: 'P600', amount: 150 });

    // Execute deletion using 'rcpt_phys_P600'
    const result = await context.fsDeleteReceiptRecord('rcpt_phys_P600');
    assert(result && result.success && result.isPhysical, 'T1.1', 'fsDeleteReceiptRecord succeeded for physical receipt P600', JSON.stringify(result));

    // Verify transaction ordering
    const latestTx = mockDb.txLogs[mockDb.txLogs.length - 1];
    assert(!latestTx.readAfterWriteDetected, 'T1.2', 'Transaction executed strictly with all reads before writes (NO read-after-write)');
    
    // Check operation order
    let writeSeen = false;
    let readAfterWrite = false;
    for (const op of latestTx.operations) {
      if (['delete', 'set', 'update'].includes(op.op)) writeSeen = true;
      if (op.op === 'get' && writeSeen) readAfterWrite = true;
    }
    assert(!readAfterWrite, 'T1.3', 'Trace verifies 100% of tx.get() executed prior to any tx.delete()');

    // Verify Firestore deletion
    const rSnap = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
    const resSnap = await mockDb.collection('system').doc('res_phys_P600').get();
    const opSnap = await mockDb.collection('system').doc('op_phys_p600').get();
    assert(!rSnap.exists, 'T1.4', 'rcpt_phys_P600 deleted from receipts collection');
    assert(!resSnap.exists, 'T1.5', 'res_phys_P600 deleted from system collection');
    assert(!opSnap.exists, 'T1.6', 'op_phys_p600 deleted from system collection');

    // Verify IDB eviction
    const idb1 = await mockIdb.getOne('receipts', 'rcpt_phys_P600');
    const idb2 = await mockIdb.getOne('receipts', 'P600');
    assert(!idb1 && !idb2, 'T1.7', 'Physical receipt P600 evicted from local IDB cache');

    // Verify software counters strictly untouched
    const counters = await getCounters();
    assert(counters.globalSequenceCounter === 20, 'T1.8', 'globalSequenceCounter strictly untouched (c=20)', `c=${counters.globalSequenceCounter}`);
    assert(counters.billingReceiptCounter === 10, 'T1.9', 'billingReceiptCounter strictly untouched (c=10)', `c=${counters.billingReceiptCounter}`);
    assert(counters.receiptCounter === 1020, 'T1.10', 'receiptCounter strictly untouched (c=1020)', `c=${counters.receiptCounter}`);
  }

  // --- TEST GROUP 2: Physical PU-series receipt deletion (PU1, ₹500, Punarudharanam Fund) ---
  console.log('\n--- GROUP 2: Physical PU-Series Receipt Deletion (e.g. PU1) ---');
  {
    await seedCounters(35, 20, 1035, 10);

    // Seed physical receipt PU1 (as reported in problem description)
    const pu1Data = {
      id: 'rcpt_phys_PU1',
      firestoreId: 'rcpt_phys_PU1',
      legacyId: 'rcpt_phys_PU1',
      receiptNo: 'PU1',
      fund: 'Punarudharanam Fund',
      category: 'Donation Income',
      amount: 500,
      date: '2026-10-21',
      source: 'physical',
      isPhysical: true,
      operationId: 'op_phys_pu1'
    };
    await mockDb.collection('receipts').doc('rcpt_phys_PU1').set(pu1Data);
    await mockDb.collection('system').doc('res_phys_PU1').set({
      formattedNo: 'PU1',
      physicalId: 'PU1',
      physicalType: 'PU',
      status: 'active',
      receiptDocId: 'rcpt_phys_PU1'
    });
    await mockDb.collection('system').doc('op_phys_pu1').set({
      operationId: 'op_phys_pu1',
      type: 'physical_receipt'
    });
    await mockIdb.putRec('receipts', pu1Data);
    await mockIdb.putRec('receipts', { id: 'PU1', receiptNo: 'PU1', amount: 500 });

    // Call deletion using raw 'PU1' (user reported invocation format from UI)
    const result = await context.fsDeleteReceiptRecord('PU1');
    assert(result && result.success && result.isPhysical && result.physId === 'PU1', 'T2.1', 'fsDeleteReceiptRecord resolved raw "PU1" and deleted successfully', JSON.stringify(result));

    // Verify transaction ordering
    const latestTx = mockDb.txLogs[mockDb.txLogs.length - 1];
    assert(!latestTx.readAfterWriteDetected, 'T2.2', 'Transaction executed strictly with all reads before writes (NO "Firestore transactions require all reads to be executed before all writes" error)');

    // Verify Firestore deletion
    const rSnap = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
    const resSnap = await mockDb.collection('system').doc('res_phys_PU1').get();
    const opSnap = await mockDb.collection('system').doc('op_phys_pu1').get();
    assert(!rSnap.exists, 'T2.3', 'rcpt_phys_PU1 deleted from Firestore receipts');
    assert(!resSnap.exists, 'T2.4', 'res_phys_PU1 deleted from Firestore system');
    assert(!opSnap.exists, 'T2.5', 'op_phys_pu1 deleted from Firestore system');

    // Verify IDB eviction
    const idb1 = await mockIdb.getOne('receipts', 'rcpt_phys_PU1');
    const idb2 = await mockIdb.getOne('receipts', 'PU1');
    assert(!idb1 && !idb2, 'T2.6', 'PU1 evicted from local cache');

    // Verify software counters strictly untouched
    const counters = await getCounters();
    assert(counters.globalSequenceCounter === 35, 'T2.7', 'globalSequenceCounter strictly untouched (c=35)', `c=${counters.globalSequenceCounter}`);
    assert(counters.billingReceiptCounter === 20, 'T2.8', 'billingReceiptCounter strictly untouched (c=20)', `c=${counters.billingReceiptCounter}`);
  }

  // --- TEST GROUP 3: Physical receipt re-entry after deletion ---
  console.log('\n--- GROUP 3: Physical Receipt Re-Entry After Deletion ---');
  {
    // Re-create PU1 via fsCreatePhysicalReceipt to verify reservation/receipt docs are cleanly cleared
    const newPU1 = await context.fsCreatePhysicalReceipt({
      manualReceiptNo: 'PU1',
      name: 'Re-entered Devotee',
      amount: 500,
      paymentMode: 'Cash'
    });
    assert(newPU1 && newPU1.receiptRecord && newPU1.receiptRecord.receiptNo === 'PU1', 'T3.1', 'PU1 can be cleanly re-entered after deletion without duplicate collision');

    // Clean up PU1 again
    await context.fsDeleteReceiptRecord('PU1');
    const rSnap = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
    assert(!rSnap.exists, 'T3.2', 'Re-entered PU1 successfully deleted again');
  }

  // --- TEST GROUP 4: Normal Software-Generated Independent Receipt Deletion ---
  console.log('\n--- GROUP 4: Normal Independent Receipt Deletion & Sequence Reuse ---');
  {
    await seedCounters(40, 20, 1040, 10);

    // Seed prior sequence records so max remaining sequence is 39
    await mockDb.collection('receipts').doc('rcpt_39').set({ id: 39, receiptNo: 'R-039', amount: 500, source: 'receipt' });
    await mockDb.collection('system').doc('res_39').set({ seqNumber: 39, status: 'active' });

    // Seed independent receipt 40 (highest allocated)
    const rcpt40 = {
      id: 40,
      receiptNo: 'R-040',
      amount: 1000,
      name: 'Software Devotee',
      fund: 'General Temple Fund',
      source: 'receipt',
      operationId: 'op_rcpt_40'
    };
    await mockDb.collection('receipts').doc('rcpt_40').set(rcpt40);
    await mockDb.collection('system').doc('res_40').set({ seqNumber: 40, status: 'active' });
    await mockDb.collection('system').doc('op_rcpt_40').set({ operationId: 'op_rcpt_40' });
    await mockIdb.putRec('receipts', rcpt40);

    // Delete highest independent receipt
    const result = await context.fsDeleteReceiptRecord('rcpt_40');
    assert(result && result.success && result.isIndependent, 'T4.1', 'Independent receipt rcpt_40 deleted successfully');

    // Verify transaction ordering
    const latestTx = mockDb.txLogs[mockDb.txLogs.length - 1];
    assert(!latestTx.readAfterWriteDetected, 'T4.2', 'Independent deletion executed strictly with all reads before writes');

    // Verify highest-number reuse
    const counters = await getCounters();
    assert(counters.globalSequenceCounter === 39, 'T4.3', 'globalSequenceCounter adjusted down to 39 for highest sequence reuse', `c=${counters.globalSequenceCounter}`);

    // Verify deletion in Firestore & IDB
    const rSnap = await mockDb.collection('receipts').doc('rcpt_40').get();
    const resSnap = await mockDb.collection('system').doc('res_40').get();
    assert(!rSnap.exists, 'T4.4', 'rcpt_40 removed from Firestore');
    assert(!resSnap.exists, 'T4.5', 'res_40 removed from Firestore');
    const idbSnap = await mockIdb.getOne('receipts', 'rcpt_40');
    assert(!idbSnap, 'T4.6', 'rcpt_40 evicted from IDB cache');
  }

  // --- TEST GROUP 5: Bill-Linked Receipt Deletion ---
  console.log('\n--- GROUP 5: Bill-Linked Receipt Deletion (Atomic Bilateral Deletion) ---');
  {
    await seedCounters(39, 20, 1040, 10);

    // Seed prior bill 38 so max remaining sequence is 38 and max remaining bill is 19
    await mockDb.collection('billing').doc('bill_38').set({ id: 38, receiptNo: 'BILL-019', totalAmount: 400 });
    await mockDb.collection('receipts').doc('rcpt_38').set({ id: 38, receiptNo: 'R-038', billingId: 38 });
    await mockDb.collection('system').doc('res_38').set({ seqNumber: 38, status: 'active' });

    // Seed bill 39 with linked receipt rcpt_39
    const bill39 = {
      id: 39,
      receiptNo: 'BILL-020',
      accountingReceiptId: 'rcpt_39',
      totalAmount: 750,
      devoteeName: 'Bill Linked Devotee',
      source: 'billing',
      reservationDocId: 'res_39',
      operationId: 'op_bill_39'
    };
    const rcpt39 = {
      id: 39,
      receiptNo: 'R-039',
      billingId: 39,
      billingReceiptNo: 'BILL-020',
      billingFirestoreId: 'bill_39',
      amount: 750,
      source: 'billing',
      reservationDocId: 'res_39',
      operationId: 'op_bill_39'
    };

    await mockDb.collection('billing').doc('bill_39').set(bill39);
    await mockDb.collection('receipts').doc('rcpt_39').set(rcpt39);
    await mockDb.collection('system').doc('res_39').set({ seqNumber: 39, status: 'active' });
    await mockDb.collection('system').doc('op_bill_39').set({ operationId: 'op_bill_39' });
    await mockIdb.putRec('billing', bill39);
    await mockIdb.putRec('receipts', rcpt39);

    // Delete via receipt record: fsDeleteReceiptRecord('rcpt_39')
    const result = await context.fsDeleteReceiptRecord('rcpt_39');
    assert(result && result.success, 'T5.1', 'Bill-linked receipt deleted successfully via fsDeleteReceiptRecord');

    // Verify transaction ordering
    const latestTx = mockDb.txLogs[mockDb.txLogs.length - 1];
    assert(!latestTx.readAfterWriteDetected, 'T5.2', 'fsDeleteBillingRecord transaction performed all reads before writes');

    // Verify both bill and receipt deleted
    const bSnap = await mockDb.collection('billing').doc('bill_39').get();
    const rSnap = await mockDb.collection('receipts').doc('rcpt_39').get();
    const resSnap = await mockDb.collection('system').doc('res_39').get();
    assert(!bSnap.exists, 'T5.3', 'bill_39 permanently removed from Firestore');
    assert(!rSnap.exists, 'T5.4', 'rcpt_39 permanently removed from Firestore');
    assert(!resSnap.exists, 'T5.5', 'res_39 permanently removed from Firestore');

    // Verify both evicted from cache
    const idbBill = await mockIdb.getOne('billing', 'bill_39');
    const idbRcpt = await mockIdb.getOne('receipts', 'rcpt_39');
    assert(!idbBill, 'T5.6', 'bill_39 evicted from cache');
    assert(!idbRcpt, 'T5.7', 'rcpt_39 evicted from cache');

    // Verify counter reuse
    const counters = await getCounters();
    assert(counters.globalSequenceCounter === 38, 'T5.8', 'globalSequenceCounter adjusted down to 38 for trailing bill reuse', `c=${counters.globalSequenceCounter}`);
    assert(counters.billingReceiptCounter === 38, 'T5.9', 'billingReceiptCounter adjusted down to 38 for trailing bill reuse', `c=${counters.billingReceiptCounter}`);
  }

  // --- TEST GROUP 6: Middle Gap Preservation vs Highest Reuse ---
  console.log('\n--- GROUP 6: Middle Gap Preservation ---');
  {
    await seedCounters(38, 19, 1040, 10);

    // Seed middle receipt 15 (while highest is 38)
    const rcpt15 = {
      id: 15,
      receiptNo: 'R-015',
      amount: 250,
      source: 'receipt',
      reservationDocId: 'res_15'
    };
    await mockDb.collection('receipts').doc('rcpt_15').set(rcpt15);
    await mockDb.collection('system').doc('res_15').set({ seqNumber: 15 });
    await mockIdb.putRec('receipts', rcpt15);

    // Delete middle receipt
    await context.fsDeleteReceiptRecord('rcpt_15');

    // Verify counter is NOT decremented (gap preserved)
    const counters = await getCounters();
    assert(counters.globalSequenceCounter === 38, 'T6.1', 'globalSequenceCounter remains 38 after middle receipt deletion (gap preserved)', `c=${counters.globalSequenceCounter}`);
  }

  // --- TEST GROUP 7: Failed Transactions Preserve Local Records ---
  console.log('\n--- GROUP 7: Failed Transactions Preserve Local Records (Rollback & Fail-Closed) ---');
  {
    // Seed physical receipt P700
    const p700Data = {
      id: 'rcpt_phys_P700',
      receiptNo: 'P700',
      amount: 300,
      source: 'physical',
      isPhysical: true
    };
    await mockDb.collection('receipts').doc('rcpt_phys_P700').set(p700Data);
    await mockDb.collection('system').doc('res_phys_P700').set({ formattedNo: 'P700' });
    await mockIdb.putRec('receipts', p700Data);

    // Configure mock to fail transaction
    mockDb.failNextTransaction = true;

    let threwError = false;
    try {
      await context.fsDeleteReceiptRecord('rcpt_phys_P700');
    } catch (e) {
      threwError = true;
    }
    assert(threwError, 'T7.1', 'fsDeleteReceiptRecord correctly propagated failure on transaction abort');

    // Verify records preserved in Firestore and IDB
    const rSnap = await mockDb.collection('receipts').doc('rcpt_phys_P700').get();
    const resSnap = await mockDb.collection('system').doc('res_phys_P700').get();
    const idbRec = await mockIdb.getOne('receipts', 'rcpt_phys_P700');
    assert(rSnap.exists, 'T7.2', 'Firestore receipt record preserved intact after failed transaction');
    assert(resSnap.exists, 'T7.3', 'Firestore reservation record preserved intact after failed transaction');
    assert(idbRec !== null, 'T7.4', 'Local IndexedDB cache preserved intact after failed transaction');
  }

  // --- TEST GROUP 8: Audit of All Recorded Transactions ---
  console.log('\n--- GROUP 8: Global Transaction Ordering Audit ---');
  {
    let totalTransactions = mockDb.txLogs.length;
    let transactionsWithReadAfterWrite = mockDb.txLogs.filter(tx => tx.readAfterWriteDetected).length;

    assert(totalTransactions >= 6, 'T8.1', `Multiple transactions audited across test suite (total: ${totalTransactions})`);
    assert(transactionsWithReadAfterWrite === 0, 'T8.2', `Zero transactions violated read-before-write invariant (violations: ${transactionsWithReadAfterWrite})`);

    // Verify all successful transactions followed exact read-then-write pattern
    let allFollowedOrder = true;
    for (const tx of mockDb.txLogs) {
      if (!tx.success) continue;
      let firstWriteIdx = -1;
      for (let i = 0; i < tx.operations.length; i++) {
        if (['delete', 'set', 'update'].includes(tx.operations[i].op)) {
          if (firstWriteIdx === -1) firstWriteIdx = i;
        } else if (tx.operations[i].op === 'get') {
          if (firstWriteIdx !== -1 && i > firstWriteIdx) {
            allFollowedOrder = false;
          }
        }
      }
    }
    assert(allFollowedOrder, 'T8.3', '100% of successful transactions strictly performed all reads before any write/delete');
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
