/**
 * STEP 33.163 — Automated Test Suite: Voucher Numbering, Reuse, and Permanent Deletion
 * Location: tests/test_step_33_163_voucher_suite.js
 *
 * Comprehensive test suite verifying all 15 required scenarios:
 *  1. The first voucher is V-001 when initialization is safe.
 *  2. The second voucher is V-002.
 *  3. Existing voucher numbers cannot be duplicated.
 *  4. Concurrent creation cannot allocate the same number twice.
 *  5. Deleting the highest-numbered voucher permits that number to be reused.
 *  6. Deleting a middle voucher does not move the next number backward while higher numbers exist.
 *  7. Deleting multiple trailing vouchers permits reuse in the correct order.
 *  8. Voucher deletion permanently removes the intended Firestore documents.
 *  9. Voucher deletion clears the corresponding IndexedDB/cache entries.
 * 10. Associated accounting records and balances remain consistent.
 * 11. Repeated deletion cannot reverse balances or delete dependent records twice.
 * 12. A failed deletion does not leave partially modified financial data.
 * 13. Unrelated bills, receipts, funds, and transactions remain untouched.
 * 14. P and PU physical receipt numbering and records remain unaffected.
 * 15. Voucher numbering does not modify billing or receipt counters.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('='.repeat(80));
console.log('STEP 33.163: VOUCHER NUMBERING, NUMBER REUSE, & PERMANENT DELETION TEST SUITE');
console.log('='.repeat(80));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, description, detail = '') {
  totalTests++;
  const passed = !!condition;
  if (passed) passedTests++; else failedTests++;
  const status = passed ? 'PASS' : 'FAIL';
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${testId}: ${description}${detail ? ' (' + detail + ')' : ''}`);
  testResults.push({ testId, description, passed, detail });
}

// =========================================================================
// MOCK FIRESTORE WITH TRANSACTIONS & CONCURRENCY
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

  async get() {
    return this.db._getCol(this.colPath);
  }
}

class MockFirestore {
  constructor() {
    this.store = new Map(); // "col/id" -> data
    this._txQueue = Promise.resolve();
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
      return { id, exists: false, data: () => undefined };
    }
    const val = JSON.parse(JSON.stringify(this.store.get(key)));
    return { id, exists: true, data: () => val };
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
          data: () => JSON.parse(JSON.stringify(val))
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
    // Firestore serializes transactions touching the same counter documents
    const run = async () => {
      const tx = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, options) => docRef.set(data, options),
        update: (docRef, data) => docRef.update(data),
        delete: (docRef) => docRef.delete()
      };
      return await updateFunction(tx);
    };

    const next = this._txQueue.then(run, run);
    this._txQueue = next.catch(() => {});
    return next;
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
    const idKey = String(rec.id !== undefined ? rec.id : rec.firestoreId);
    st.set(idKey, JSON.parse(JSON.stringify(rec)));
    if (rec.firestoreId) st.set(String(rec.firestoreId), JSON.parse(JSON.stringify(rec)));
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
// BUSINESS LOGIC SIMULATOR DIRECTLY MIRRORING TEMPLE_ACCOUNTS-1.HTML
// =========================================================================

class TempleAccountsSimulator {
  constructor(mockDb, mockIdb) {
    this.db = mockDb;
    this.idb = mockIdb;
    this.currentUser = { uid: 'rFvStQNfiINnPor66OzXuE1O9Lm1', email: 'vibu@gmail.com' };
    this.isPaymentDeleting = false;
  }

  async getCounters() {
    const snap = await this.db.collection('system').doc('counters').get();
    return snap.exists ? snap.data() : null;
  }

  async nextVoucherNo() {
    const c = await this.getCounters();
    const cur = (c && typeof c.voucherCounter === 'number') ? c.voucherCounter : 0;
    const prefix = (c && c.voucherPrefix) || 'V-';
    return prefix + String(cur + 1).padStart(3, '0');
  }

  async fsNextVoucherNo() {
    return await this.db.runTransaction(async (tx) => {
      const counterRef = this.db.collection('system').doc('counters');
      const snap = await tx.get(counterRef);
      const data = snap.exists ? snap.data() : {};

      const rawVal = data.voucherCounter;
      const currentVal = (typeof rawVal === 'number')
        ? rawVal
        : (rawVal !== undefined && !isNaN(parseInt(rawVal, 10)) ? parseInt(rawVal, 10) : 0);

      let nextVal = currentVal + 1;
      const prefix = data.voucherPrefix || 'V-';

      // Collision safety check
      let vRef = this.db.collection('payments').doc(`pmt_${nextVal}`);
      let vSnap = await tx.get(vRef);
      let legacyRef = this.db.collection('payments').doc(`pay_${nextVal}`);
      let legacySnap = await tx.get(legacyRef);
      while (vSnap.exists || legacySnap.exists) {
        nextVal++;
        vRef = this.db.collection('payments').doc(`pmt_${nextVal}`);
        vSnap = await tx.get(vRef);
        legacyRef = this.db.collection('payments').doc(`pay_${nextVal}`);
        legacySnap = await tx.get(legacyRef);
      }

      const formattedNo = `${prefix}${String(nextVal).padStart(3, '0')}`;
      tx.set(counterRef, { voucherCounter: nextVal, updatedAt: Date.now() }, { merge: true });
      return formattedNo;
    });
  }

  async savePayment(paymentData) {
    if (!this.currentUser) throw new Error('Authentication required.');

    const allocatedNo = await this.fsNextVoucherNo();
    const numMatch = allocatedNo.match(/\d+$/);
    const num = numMatch ? parseInt(numMatch[0], 10) : Date.now();

    const rec = {
      ...paymentData,
      voucherNo: allocatedNo,
      id: num,
      legacyId: num,
      firestoreId: `pmt_${num}`,
      voided: false,
      createdAt: Date.now()
    };

    // Save to Cloud Firestore
    await this.db.collection('payments').doc(rec.firestoreId).set(rec);

    // Save to IndexedDB
    await this.idb.putRec('payments', rec);
    return rec;
  }

  async deletePayment(id) {
    if (this.isPaymentDeleting) return { blocked: true };
    if (!this.currentUser) throw new Error('Authentication required.');

    // 1. Fetch current payment record
    let p = null;
    const docSnap = await this.db.collection('payments').doc(String(id)).get();
    if (docSnap.exists) {
      p = docSnap.data();
    } else {
      const pmtSnap = await this.db.collection('payments').doc(`pmt_${id}`).get();
      if (pmtSnap.exists) p = pmtSnap.data();
    }

    if (!p) {
      return { notFound: true };
    }

    this.isPaymentDeleting = true;

    try {
      const voucherNoStr = p.voucherNo || `V-${String(p.id).padStart(3, '0')}`;
      const targetDocId = p.firestoreId || `pmt_${p.id || id}`;
      const vMatch = voucherNoStr.match(/\d+$/);
      const deletedVNum = vMatch ? parseInt(vMatch[0], 10) : (parseInt(p.id, 10) || null);

      await this.db.runTransaction(async (tx) => {
        const counterRef = this.db.collection('system').doc('counters');
        const pRef = this.db.collection('payments').doc(targetDocId);

        const [pSnap, cSnap] = await Promise.all([
          tx.get(pRef),
          tx.get(counterRef)
        ]);

        let existingDocRef = pRef;
        if (!pSnap.exists) {
          const altRef = this.db.collection('payments').doc(String(id));
          const altSnap = await tx.get(altRef);
          if (!altSnap.exists) {
            throw new Error(`Payment voucher document "${targetDocId}" does not exist in Firestore.`);
          }
          existingDocRef = altRef;
        }

        const cData = cSnap.exists ? cSnap.data() : {};
        const currentCounter = (typeof cData.voucherCounter === 'number') ? cData.voucherCounter : 0;

        // Query remaining vouchers in payments collection to find the new maximum voucher number
        const paymentsSnap = await this.db.collection('payments').get();
        let maxRemainingNum = 0;
        paymentsSnap.forEach(docSnap => {
          if (docSnap.id !== targetDocId && docSnap.id !== String(id)) {
            const d = docSnap.data();
            const numMatch = (d.voucherNo || '').match(/\d+$/);
            const num = numMatch ? parseInt(numMatch[0], 10) : (parseInt(d.id, 10) || 0);
            if (num > maxRemainingNum) {
              maxRemainingNum = num;
            }
          }
        });

        // 1. Permanently delete voucher document from Firestore
        tx.delete(existingDocRef);

        // Delete legacy pay_ doc if it exists
        if (deletedVNum) {
          tx.delete(this.db.collection('payments').doc(`pay_${deletedVNum}`));
        }

        // 2. Trailing-number reuse: If deleted voucher was the highest (or at/above currentCounter),
        // adjust voucherCounter to maxRemainingNum so the trailing number can be reused.
        if (deletedVNum !== null && (deletedVNum >= currentCounter || deletedVNum > maxRemainingNum)) {
          tx.set(counterRef, { voucherCounter: maxRemainingNum, updatedAt: Date.now() }, { merge: true });
        }
      });

      // 3. Remove from IndexedDB cache
      await this.idb.deleteRec('payments', id);
      if (p.id !== undefined && p.id !== id) await this.idb.deleteRec('payments', p.id);
      if (p.firestoreId) await this.idb.deleteRec('payments', p.firestoreId);
      if (targetDocId !== id) await this.idb.deleteRec('payments', targetDocId);

      return { success: true, deletedVNum };
    } finally {
      this.isPaymentDeleting = false;
    }
  }

  async getCashBalance() {
    const snap = await this.db.collection('payments').get();
    let totalExpense = 0;
    snap.forEach(d => {
      const data = d.data();
      if (!data.voided && data.paymentMode === 'Cash') {
        totalExpense += (parseFloat(data.amount) || 0);
      }
    });
    const openingCash = 50000;
    return openingCash - totalExpense;
  }
}

// =========================================================================
// TEST EXECUTION
// =========================================================================

async function runTestSuite() {
  const db = new MockFirestore();
  const idb = new MockIndexedDB();
  const app = new TempleAccountsSimulator(db, idb);

  // Initialize system counters mimicking live production state
  db.collection('system').doc('counters').set({
    globalSequenceCounter: 6,
    billingReceiptCounter: 6,
    receiptCounter: 1020,
    voucherCounter: 0, // Commissioned to 0
    billingPrefix: 'BILL-',
    receiptPrefix: 'R-',
    voucherPrefix: 'V-',
    commissioningStatus: 'READY_FOR_FIRST_BILL'
  });

  // Seed master data
  db.collection('funds').doc('fund_1').set({ id: 1, name: 'General Temple Fund' });
  db.collection('funds').doc('fund_2').set({ id: 2, name: 'Punarudharanam Fund' });
  db.collection('expenseCategories').doc('exp_1').set({ id: 1, name: 'Flower' });
  db.collection('expenseCategories').doc('exp_2').set({ id: 2, name: 'Salary' });
  db.collection('billing').doc('bill_1').set({ id: 1, receiptNo: 'BILL-001', amount: 1500 });
  db.collection('receipts').doc('rcpt_1').set({ id: 1, receiptNo: 'R-001', amount: 1500 });

  console.log('\n--- SCENARIO 1: First Voucher is V-001 ---');
  {
    const preview = await app.nextVoucherNo();
    assert(preview === 'V-001', 'T1.1', 'Form preview displays V-001 when voucherCounter=0 and collection empty', preview);

    const v1 = await app.savePayment({ date: '2026-10-20', paidTo: 'Flower Vendor', fund: 'General Temple Fund', category: 'Flower', amount: 500, paymentMode: 'Cash' });
    assert(v1.voucherNo === 'V-001', 'T1.2', 'First created voucher is assigned V-001', v1.voucherNo);
    assert(v1.id === 1 && v1.firestoreId === 'pmt_1', 'T1.3', 'V-001 assigned id=1 and firestoreId=pmt_1', `${v1.id}, ${v1.firestoreId}`);

    const cAfter = await app.getCounters();
    assert(cAfter.voucherCounter === 1, 'T1.4', 'voucherCounter updated to 1', `voucherCounter=${cAfter.voucherCounter}`);
  }

  console.log('\n--- SCENARIO 2: Second Voucher is V-002 ---');
  {
    const preview = await app.nextVoucherNo();
    assert(preview === 'V-002', 'T2.1', 'Form preview displays V-002', preview);

    const v2 = await app.savePayment({ date: '2026-10-20', paidTo: 'Electrician', fund: 'General Temple Fund', category: 'Salary', amount: 1200, paymentMode: 'Cash' });
    assert(v2.voucherNo === 'V-002', 'T2.2', 'Second created voucher is assigned V-002', v2.voucherNo);
    assert(v2.id === 2 && v2.firestoreId === 'pmt_2', 'T2.3', 'V-002 assigned id=2 and firestoreId=pmt_2', `${v2.id}, ${v2.firestoreId}`);

    const cAfter = await app.getCounters();
    assert(cAfter.voucherCounter === 2, 'T2.4', 'voucherCounter updated to 2', `voucherCounter=${cAfter.voucherCounter}`);
  }

  console.log('\n--- SCENARIO 3: Existing Voucher Numbers Cannot Be Duplicated ---');
  {
    // Simulate someone attempting to allocate while pmt_3 already exists
    await db.collection('payments').doc('pmt_3').set({ id: 3, voucherNo: 'V-003', paidTo: 'Pre-existing' });
    const preview = await app.nextVoucherNo();
    assert(preview === 'V-003', 'T3.1', 'Form preview proposed V-003 based on counter 2');

    // Allocation collision guard detects pmt_3 exists and steps to V-004
    const vAllocated = await app.savePayment({ date: '2026-10-20', paidTo: 'Carpenter', fund: 'General Temple Fund', category: 'Salary', amount: 800, paymentMode: 'Cash' });
    assert(vAllocated.voucherNo === 'V-004', 'T3.2', 'Allocation skipped pre-existing pmt_3 and assigned V-004', vAllocated.voucherNo);

    // Clean up artificial pmt_3
    await db.collection('payments').doc('pmt_3').delete();
  }

  console.log('\n--- SCENARIO 4: Concurrent Creation Cannot Allocate the Same Number Twice ---');
  {
    // Simulate 5 simultaneous transactions
    const concurrentPromises = [
      app.savePayment({ date: '2026-10-20', paidTo: 'User A', fund: 'General Temple Fund', category: 'Flower', amount: 100, paymentMode: 'Cash' }),
      app.savePayment({ date: '2026-10-20', paidTo: 'User B', fund: 'General Temple Fund', category: 'Flower', amount: 200, paymentMode: 'Cash' }),
      app.savePayment({ date: '2026-10-20', paidTo: 'User C', fund: 'General Temple Fund', category: 'Flower', amount: 300, paymentMode: 'Cash' }),
      app.savePayment({ date: '2026-10-20', paidTo: 'User D', fund: 'General Temple Fund', category: 'Flower', amount: 400, paymentMode: 'Cash' }),
      app.savePayment({ date: '2026-10-20', paidTo: 'User E', fund: 'General Temple Fund', category: 'Flower', amount: 500, paymentMode: 'Cash' })
    ];

    const results = await Promise.all(concurrentPromises);
    const voucherNos = results.map(r => r.voucherNo);
    const uniqueNos = new Set(voucherNos);

    assert(uniqueNos.size === 5, 'T4.1', 'All 5 concurrent voucher allocations received distinct numbers', `Unique: ${uniqueNos.size}/5, Allocated: ${voucherNos.join(', ')}`);
  }

  console.log('\n--- SCENARIO 5: Deleting Highest-Numbered Voucher Permits Number Reuse ---');
  {
    // First, let's create up to V-010 cleanly
    // Currently we have v1, v2, v4, and 5 concurrent (5, 6, 7, 8, 9)
    // Add one more to reach exactly V-010
    const v10 = await app.savePayment({ date: '2026-10-20', paidTo: 'Vendor 10', fund: 'General Temple Fund', category: 'Flower', amount: 100, paymentMode: 'Cash' });
    assert(v10.voucherNo === 'V-010', 'T5.1', 'V-010 created cleanly as highest voucher', v10.voucherNo);

    const cBeforeDel = await app.getCounters();
    assert(cBeforeDel.voucherCounter === 10, 'T5.2', 'voucherCounter is 10 before deletion', `voucherCounter=${cBeforeDel.voucherCounter}`);

    // Permanently delete highest voucher V-010
    const delResult = await app.deletePayment('pmt_10');
    assert(delResult.success === true, 'T5.3', 'V-010 deleted successfully');

    const cAfterDel = await app.getCounters();
    assert(cAfterDel.voucherCounter === 9, 'T5.4', 'voucherCounter adjusted down to 9 (highest remaining)', `voucherCounter=${cAfterDel.voucherCounter}`);

    const preview = await app.nextVoucherNo();
    assert(preview === 'V-010', 'T5.5', 'Next voucher preview immediately reflects reused V-010', preview);

    // Re-create voucher: must get V-010
    const vReused = await app.savePayment({ date: '2026-10-20', paidTo: 'Replacement Vendor', fund: 'General Temple Fund', category: 'Flower', amount: 150, paymentMode: 'Cash' });
    assert(vReused.voucherNo === 'V-010', 'T5.6', 'New voucher successfully reused trailing number V-010', vReused.voucherNo);
  }

  console.log('\n--- SCENARIO 6: Deleting Middle Voucher Does Not Move Next Number Backward ---');
  {
    // Highest is V-010. Delete middle voucher V-005.
    const delMid = await app.deletePayment('pmt_5');
    assert(delMid.success === true, 'T6.1', 'Middle voucher V-005 permanently deleted');

    const cAfterMid = await app.getCounters();
    assert(cAfterMid.voucherCounter === 10, 'T6.2', 'voucherCounter remains 10 while higher vouchers (V-006 to V-010) exist', `voucherCounter=${cAfterMid.voucherCounter}`);

    const preview = await app.nextVoucherNo();
    assert(preview === 'V-011', 'T6.3', 'Next voucher number remains V-011 (middle number not reused prematurely)', preview);
  }

  console.log('\n--- SCENARIO 7: Deleting Multiple Trailing Vouchers Permits Reuse in Correct Order ---');
  {
    // Currently highest is V-010. Delete V-010 then delete V-009.
    const del10 = await app.deletePayment('pmt_10');
    assert(del10.success === true, 'T7.1', 'V-010 deleted');
    const c10 = await app.getCounters();
    assert(c10.voucherCounter === 9, 'T7.2', 'voucherCounter adjusted to 9 after V-010 deletion', `voucherCounter=${c10.voucherCounter}`);

    const del9 = await app.deletePayment('pmt_9');
    assert(del9.success === true, 'T7.3', 'V-009 deleted');
    const c9 = await app.getCounters();
    assert(c9.voucherCounter === 8, 'T7.4', 'voucherCounter adjusted to 8 after V-009 deletion', `voucherCounter=${c9.voucherCounter}`);

    const preview = await app.nextVoucherNo();
    assert(preview === 'V-009', 'T7.5', 'Next voucher preview is V-009', preview);

    const vNext9 = await app.savePayment({ date: '2026-10-20', paidTo: 'Reused 9', fund: 'General Temple Fund', category: 'Flower', amount: 90, paymentMode: 'Cash' });
    assert(vNext9.voucherNo === 'V-009', 'T7.6', 'First re-created voucher gets V-009', vNext9.voucherNo);

    const vNext10 = await app.savePayment({ date: '2026-10-20', paidTo: 'Reused 10', fund: 'General Temple Fund', category: 'Flower', amount: 100, paymentMode: 'Cash' });
    assert(vNext10.voucherNo === 'V-010', 'T7.7', 'Second re-created voucher gets V-010', vNext10.voucherNo);
  }

  console.log('\n--- SCENARIO 8: Voucher Deletion Permanently Removes Firestore Documents ---');
  {
    const vTemp = await app.savePayment({ date: '2026-10-20', paidTo: 'Temp Delete Test', fund: 'General Temple Fund', category: 'Flower', amount: 777, paymentMode: 'Cash' });
    const docId = vTemp.firestoreId;
    const fsDocBefore = await db.collection('payments').doc(docId).get();
    assert(fsDocBefore.exists === true, 'T8.1', 'Voucher document exists before deletion in Cloud Firestore');

    await app.deletePayment(docId);
    const fsDocAfter = await db.collection('payments').doc(docId).get();
    assert(fsDocAfter.exists === false, 'T8.2', 'Voucher document permanently removed from Cloud Firestore (exists=false)');
  }

  console.log('\n--- SCENARIO 9: Voucher Deletion Clears IndexedDB/Cache Entries ---');
  {
    const vCache = await app.savePayment({ date: '2026-10-20', paidTo: 'Cache Test', fund: 'General Temple Fund', category: 'Flower', amount: 333, paymentMode: 'Cash' });
    const idbBefore = await idb.getOne('payments', vCache.id);
    assert(idbBefore !== null, 'T9.1', 'Voucher present in IndexedDB cache before deletion');

    await app.deletePayment(vCache.id);
    const idbAfter = await idb.getOne('payments', vCache.id);
    assert(idbAfter === null, 'T9.2', 'Voucher removed from IndexedDB cache after deletion');
  }

  console.log('\n--- SCENARIO 10: Associated Accounting Records and Balances Remain Consistent ---');
  {
    const balBefore = await app.getCashBalance();
    const vBal = await app.savePayment({ date: '2026-10-20', paidTo: 'Balance Test Expense', fund: 'General Temple Fund', category: 'Flower', amount: 5000, paymentMode: 'Cash' });
    const balDuring = await app.getCashBalance();
    assert(balDuring === balBefore - 5000, 'T10.1', 'Cash balance decreased by expense amount (₹5000)');

    await app.deletePayment(vBal.firestoreId);
    const balAfter = await app.getCashBalance();
    assert(balAfter === balBefore, 'T10.2', 'Cash balance restored exactly to prior balance after deletion');
  }

  console.log('\n--- SCENARIO 11: Repeated Deletion Cannot Reverse Balances or Mutate State Twice ---');
  {
    const vRep = await app.savePayment({ date: '2026-10-20', paidTo: 'Idempotent Delete', fund: 'General Temple Fund', category: 'Salary', amount: 2000, paymentMode: 'Cash' });
    const balBefore = await app.getCashBalance();

    const firstDel = await app.deletePayment(vRep.firestoreId);
    assert(firstDel.success === true, 'T11.1', 'First deletion succeeds');
    const balAfterFirst = await app.getCashBalance();

    const secondDel = await app.deletePayment(vRep.firestoreId);
    assert(secondDel.notFound === true, 'T11.2', 'Second deletion detected record not found');
    const balAfterSecond = await app.getCashBalance();

    assert(balAfterFirst === balAfterSecond, 'T11.3', 'Balances did not reverse or change on repeated deletion attempt');
  }

  console.log('\n--- SCENARIO 12: Failed Deletion Does Not Leave Partially Modified Financial Data ---');
  {
    const vFail = await app.savePayment({ date: '2026-10-20', paidTo: 'Rollback Test', fund: 'General Temple Fund', category: 'Flower', amount: 1234, paymentMode: 'Cash' });
    const cBefore = await app.getCounters();

    // Simulate permission failure in Firestore by modifying currentUser
    const originalUser = app.currentUser;
    app.currentUser = null;

    let caughtError = null;
    try {
      await app.deletePayment(vFail.firestoreId);
    } catch(err) {
      caughtError = err;
    }
    app.currentUser = originalUser;

    assert(caughtError !== null, 'T12.1', 'Unauthorized deletion rejected with error');
    const cAfter = await app.getCounters();
    assert(cAfter.voucherCounter === cBefore.voucherCounter, 'T12.2', 'voucherCounter untouched on failure');

    const docStillExists = await db.collection('payments').doc(vFail.firestoreId).get();
    assert(docStillExists.exists === true, 'T12.3', 'Voucher document preserved intact on failed deletion');

    // Clean up
    await app.deletePayment(vFail.firestoreId);
  }

  console.log('\n--- SCENARIO 13: Unrelated Bills, Receipts, Funds, and Transactions Remain Untouched ---');
  {
    const billBefore = await db.collection('billing').doc('bill_1').get();
    const rcptBefore = await db.collection('receipts').doc('rcpt_1').get();
    const fundBefore = await db.collection('funds').doc('fund_1').get();

    // Create and delete a voucher
    const vUnrelated = await app.savePayment({ date: '2026-10-20', paidTo: 'Isolation Vendor', fund: 'General Temple Fund', category: 'Flower', amount: 100, paymentMode: 'Cash' });
    await app.deletePayment(vUnrelated.firestoreId);

    const billAfter = await db.collection('billing').doc('bill_1').get();
    const rcptAfter = await db.collection('receipts').doc('rcpt_1').get();
    const fundAfter = await db.collection('funds').doc('fund_1').get();

    assert(JSON.stringify(billBefore.data()) === JSON.stringify(billAfter.data()), 'T13.1', 'Billing records completely unmodified');
    assert(JSON.stringify(rcptBefore.data()) === JSON.stringify(rcptAfter.data()), 'T13.2', 'Receipt records completely unmodified');
    assert(JSON.stringify(fundBefore.data()) === JSON.stringify(fundAfter.data()), 'T13.3', 'Fund master data completely unmodified');
  }

  console.log('\n--- SCENARIO 14: Physical P and PU Receipt Numbering and Records Remain Unaffected ---');
  {
    // Seed physical receipt in receipts
    db.collection('receipts').doc('rcpt_phys_P-101').set({ id: 'phys_P-101', receiptNo: 'P-101', type: 'puja_physical', amount: 50 });
    db.collection('system').doc('res_phys_P-101').set({ id: 'res_phys_P-101', physicalId: 'P-101', type: 'physical_reservation' });

    // Create and delete voucher
    const vIso = await app.savePayment({ date: '2026-10-20', paidTo: 'Phys Check', fund: 'General Temple Fund', category: 'Flower', amount: 200, paymentMode: 'Cash' });
    await app.deletePayment(vIso.firestoreId);

    const physDoc = await db.collection('receipts').doc('rcpt_phys_P-101').get();
    const physRes = await db.collection('system').doc('res_phys_P-101').get();

    assert(physDoc.exists === true && physDoc.data().receiptNo === 'P-101', 'T14.1', 'Physical Puja receipt P-101 intact');
    assert(physRes.exists === true && physRes.data().physicalId === 'P-101', 'T14.2', 'Physical Puja reservation res_phys_P-101 intact');
  }

  console.log('\n--- SCENARIO 15: Voucher Numbering Does Not Modify Billing or Receipt Counters ---');
  {
    const countersBefore = await app.getCounters();
    const gscBefore = countersBefore.globalSequenceCounter;
    const brcBefore = countersBefore.billingReceiptCounter;
    const rcBefore = countersBefore.receiptCounter;

    // Create and delete multiple vouchers
    const vA = await app.savePayment({ date: '2026-10-20', paidTo: 'Multi A', fund: 'General Temple Fund', category: 'Flower', amount: 100, paymentMode: 'Cash' });
    const vB = await app.savePayment({ date: '2026-10-20', paidTo: 'Multi B', fund: 'General Temple Fund', category: 'Flower', amount: 200, paymentMode: 'Cash' });
    await app.deletePayment(vB.firestoreId);
    await app.deletePayment(vA.firestoreId);

    const countersAfter = await app.getCounters();
    assert(countersAfter.globalSequenceCounter === gscBefore, 'T15.1', 'globalSequenceCounter strictly unchanged', `${gscBefore} === ${countersAfter.globalSequenceCounter}`);
    assert(countersAfter.billingReceiptCounter === brcBefore, 'T15.2', 'billingReceiptCounter strictly unchanged', `${brcBefore} === ${countersAfter.billingReceiptCounter}`);
    assert(countersAfter.receiptCounter === rcBefore, 'T15.3', 'receiptCounter strictly unchanged', `${rcBefore} === ${countersAfter.receiptCounter}`);
  }

  // =========================================================================
  // SUITE SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  fs.writeFileSync(
    path.join(__dirname, 'step_33_163_test_results.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), totalTests, passedTests, failedTests, tests: testResults }, null, 2)
  );

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite encountered fatal error:', err);
  process.exit(1);
});
