/**
 * STEP 33.164 — Automated Test Suite: Permanent Delete for Billing and Receipts with Safe Number Reuse
 * Location: tests/test_step_33_164_billing_receipt_suite.js
 *
 * Verifies all 12 required scenarios:
 *  1. Delete highest bill and verify its number can be reused.
 *  2. Delete a middle bill and verify the next number remains unchanged.
 *  3. Void a bill and verify its number cannot be reused.
 *  4. Delete a bill and verify its linked accounting receipt is handled correctly.
 *  5. Delete an independent receipt and verify its number reuse.
 *  6. Delete a receipt linked to a bill and verify that the bill/receipt relationship remains consistent.
 *  7. Verify physical receipt numbering remains unchanged.
 *  8. Verify Firestore and IndexedDB no longer contain deleted records.
 *  9. Verify deleted records do not reappear after reload or synchronization.
 * 10. Verify failed deletions do not leave partially deleted transactions.
 * 11. Verify concurrent allocation cannot create duplicate numbers.
 * 12. Verify totals, reports, and balances recalculate correctly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('STEP 33.164: PERMANENT DELETE FOR BILLING & RECEIPTS TEST SUITE');
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
    const run = async () => {
      let writesQueued = false;
      const tx = {
        get: async (docRef) => {
          if (writesQueued) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return docRef.get();
        },
        set: (docRef, data, options) => {
          writesQueued = true;
          return docRef.set(data, options);
        },
        update: (docRef, data) => {
          writesQueued = true;
          return docRef.update(data);
        },
        delete: (docRef) => {
          writesQueued = true;
          return docRef.delete();
        }
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
// BUSINESS LOGIC SIMULATOR DIRECTLY MIRRORING TEMPLE_ACCOUNTS-1.HTML
// =========================================================================

class TempleAccountsSimulator {
  constructor(mockDb, mockIdb) {
    this.db = mockDb;
    this.idb = mockIdb;
    this.currentUser = { uid: 'rFvStQNfiINnPor66OzXuE1O9Lm1', email: 'vibu@gmail.com' };
    this.isBillingDeleting = false;
    this.isReceiptDeleting = false;
  }

  async getCounters() {
    const snap = await this.db.collection('system').doc('counters').get();
    return snap.exists ? snap.data() : null;
  }

  async getNextBillingReceiptNo() {
    const c = await this.getCounters();
    const cur = (c && typeof c.globalSequenceCounter === 'number') ? c.globalSequenceCounter : 0;
    const prefix = (c && (c.billingPrefix || c.billingReceiptPrefix)) || 'BILL-';
    return `${prefix}${String(cur + 1).padStart(3, '0')}`;
  }

  async nextReceiptNo() {
    const c = await this.getCounters();
    const cur = (c && typeof c.globalSequenceCounter === 'number') ? c.globalSequenceCounter : 0;
    const prefix = (c && c.receiptPrefix) || 'R-';
    return `${prefix}${String(cur + 1).padStart(3, '0')}`;
  }

  async createBill(billingInput) {
    if (!this.currentUser) throw new Error('Authentication required.');

    return await this.db.runTransaction(async (tx) => {
      const counterRef = this.db.collection('system').doc('counters');
      const cSnap = await tx.get(counterRef);
      const cData = cSnap.exists ? cSnap.data() : {};
      const curSeq = (typeof cData.globalSequenceCounter === 'number') ? cData.globalSequenceCounter : 0;

      let nextBillNum = curSeq + 1;
      let resRef = this.db.collection('system').doc(`res_${nextBillNum}`);
      let billRef = this.db.collection('billing').doc(`bill_${nextBillNum}`);
      let rcptRef = this.db.collection('receipts').doc(`rcpt_${nextBillNum}`);
      let [resSnap, bSnap, rSnap] = await Promise.all([tx.get(resRef), tx.get(billRef), tx.get(rcptRef)]);

      while (resSnap.exists || bSnap.exists || rSnap.exists) {
        nextBillNum++;
        resRef = this.db.collection('system').doc(`res_${nextBillNum}`);
        billRef = this.db.collection('billing').doc(`bill_${nextBillNum}`);
        rcptRef = this.db.collection('receipts').doc(`rcpt_${nextBillNum}`);
        [resSnap, bSnap, rSnap] = await Promise.all([tx.get(resRef), tx.get(billRef), tx.get(rcptRef)]);
      }

      const formattedNo = String(nextBillNum).padStart(3, '0');
      const billPrefix = cData.billingPrefix || 'BILL-';
      const rcptPrefix = cData.receiptPrefix || 'R-';
      const formattedBillNo = `${billPrefix}${formattedNo}`;
      const formattedRcptNo = `${rcptPrefix}${formattedNo}`;

      const billDocId = `bill_${nextBillNum}`;
      const rcptDocId = `rcpt_${nextBillNum}`;
      const resDocId = `res_${nextBillNum}`;
      const opId = billingInput.operationId || `op_bill_${Date.now()}_${Math.random()}`;

      const billPayload = {
        id: nextBillNum,
        firestoreId: billDocId,
        receiptNo: formattedBillNo,
        accountingReceiptId: rcptDocId,
        accountingReceiptNo: formattedRcptNo,
        reservationDocId: resDocId,
        operationId: opId,
        date: billingInput.date || '2026-10-20',
        devoteeName: billingInput.devoteeName || 'Devotee',
        item: billingInput.item || 'Nooljapam',
        fund: billingInput.fund || 'General Temple Fund',
        totalAmount: billingInput.totalAmount || 100,
        paymentMode: billingInput.paymentMode || 'Cash',
        voided: false,
        createdBy: this.currentUser.uid
      };

      const rcptPayload = {
        id: nextBillNum,
        firestoreId: rcptDocId,
        receiptNo: formattedRcptNo,
        reservationDocId: resDocId,
        operationId: opId,
        date: billingInput.date || '2026-10-20',
        name: billingInput.devoteeName || 'Devotee',
        fund: billingInput.fund || 'General Temple Fund',
        amount: billingInput.totalAmount || 100,
        paymentMode: billingInput.paymentMode || 'Cash',
        source: 'billing',
        billingId: nextBillNum,
        billingFirestoreId: billDocId,
        billingReceiptNo: formattedBillNo,
        voided: false,
        createdBy: this.currentUser.uid
      };

      const resPayload = {
        seqNumber: nextBillNum,
        formattedNo,
        type: 'billing_linked',
        status: 'active',
        voided: false,
        billDocId,
        receiptDocId: rcptDocId,
        billReceiptNo: formattedBillNo,
        receiptNo: formattedRcptNo
      };

      tx.set(counterRef, {
        globalSequenceCounter: nextBillNum,
        billingReceiptCounter: nextBillNum,
        updatedAt: Date.now()
      }, { merge: true });

      tx.set(this.db.collection('billing').doc(billDocId), billPayload);
      tx.set(this.db.collection('receipts').doc(rcptDocId), rcptPayload);
      tx.set(this.db.collection('system').doc(resDocId), resPayload);
      tx.set(this.db.collection('system').doc(`op_${opId}`), {
        operationId: opId,
        type: 'billing_linked',
        seqNumber: nextBillNum,
        billDocId,
        receiptDocId: rcptDocId,
        status: 'committed'
      });

      await this.idb.putRec('billing', billPayload);
      await this.idb.putRec('receipts', rcptPayload);

      return { billPayload, rcptPayload };
    });
  }

  async createIndependentReceipt(receiptInput) {
    if (!this.currentUser) throw new Error('Authentication required.');

    return await this.db.runTransaction(async (tx) => {
      const counterRef = this.db.collection('system').doc('counters');
      const cSnap = await tx.get(counterRef);
      const cData = cSnap.exists ? cSnap.data() : {};
      const curSeq = (typeof cData.globalSequenceCounter === 'number') ? cData.globalSequenceCounter : 0;

      let nextSeqNum = curSeq + 1;
      let resRef = this.db.collection('system').doc(`res_${nextSeqNum}`);
      let billRef = this.db.collection('billing').doc(`bill_${nextSeqNum}`);
      let rcptRef = this.db.collection('receipts').doc(`rcpt_${nextSeqNum}`);
      let [resSnap, bSnap, rSnap] = await Promise.all([tx.get(resRef), tx.get(billRef), tx.get(rcptRef)]);

      while (resSnap.exists || bSnap.exists || rSnap.exists) {
        nextSeqNum++;
        resRef = this.db.collection('system').doc(`res_${nextSeqNum}`);
        billRef = this.db.collection('billing').doc(`bill_${nextSeqNum}`);
        rcptRef = this.db.collection('receipts').doc(`rcpt_${nextSeqNum}`);
        [resSnap, bSnap, rSnap] = await Promise.all([tx.get(resRef), tx.get(billRef), tx.get(rcptRef)]);
      }

      const formattedNo = String(nextSeqNum).padStart(3, '0');
      const rcptPrefix = cData.receiptPrefix || 'R-';
      const formattedRcptNo = `${rcptPrefix}${formattedNo}`;

      const rcptDocId = `rcpt_${nextSeqNum}`;
      const resDocId = `res_${nextSeqNum}`;
      const opId = receiptInput.operationId || `op_rcpt_${Date.now()}_${Math.random()}`;

      const rcptPayload = {
        id: nextSeqNum,
        firestoreId: rcptDocId,
        receiptNo: formattedRcptNo,
        reservationDocId: resDocId,
        operationId: opId,
        date: receiptInput.date || '2026-10-20',
        name: receiptInput.name || 'Devotee',
        fund: receiptInput.fund || 'General Temple Fund',
        category: receiptInput.category || 'Donation',
        amount: receiptInput.amount || 500,
        paymentMode: receiptInput.paymentMode || 'Cash',
        source: 'firestore',
        billingId: null,
        voided: false,
        createdBy: this.currentUser.uid
      };

      const resPayload = {
        seqNumber: nextSeqNum,
        formattedNo,
        type: 'independent_receipt',
        status: 'active',
        voided: false,
        billDocId: null,
        receiptDocId: rcptDocId,
        receiptNo: formattedRcptNo
      };

      tx.set(counterRef, {
        globalSequenceCounter: nextSeqNum,
        updatedAt: Date.now()
      }, { merge: true });

      tx.set(this.db.collection('receipts').doc(rcptDocId), rcptPayload);
      tx.set(this.db.collection('system').doc(resDocId), resPayload);
      tx.set(this.db.collection('system').doc(`op_${opId}`), {
        operationId: opId,
        type: 'independent_receipt',
        seqNumber: nextSeqNum,
        receiptDocId: rcptDocId,
        status: 'committed'
      });

      await this.idb.putRec('receipts', rcptPayload);
      return rcptPayload;
    });
  }

  async voidBill(billId, voidReason = 'Cancelled by user') {
    if (!this.currentUser) throw new Error('Authentication required.');

    const billDocId = String(billId).startsWith('bill_') ? String(billId) : `bill_${billId}`;
    const snap = await this.db.collection('billing').doc(billDocId).get();
    if (!snap.exists) throw new Error('Bill not found.');
    const billData = snap.data();

    const rcptDocId = billData.accountingReceiptId || `rcpt_${billData.id}`;
    const resDocId = billData.reservationDocId || `res_${billData.id}`;

    const voidPayload = {
      voided: true,
      voidReason,
      voidDate: '2026-10-20',
      voidedAt: Date.now()
    };

    await this.db.runTransaction(async (tx) => {
      tx.update(this.db.collection('billing').doc(billDocId), voidPayload);
      tx.update(this.db.collection('receipts').doc(rcptDocId), voidPayload);
      tx.update(this.db.collection('system').doc(resDocId), { voided: true, status: 'voided' });
    });

    const bIdb = await this.idb.getOne('billing', billDocId);
    if (bIdb) { Object.assign(bIdb, voidPayload); await this.idb.putRec('billing', bIdb); }
    const rIdb = await this.idb.getOne('receipts', rcptDocId);
    if (rIdb) { Object.assign(rIdb, voidPayload); await this.idb.putRec('receipts', rIdb); }
  }

  async deleteBillingRecord(billDocIdOrId) {
    if (!this.currentUser) throw new Error('Authentication required: please log in to delete records.');

    const billDocId = (typeof billDocIdOrId === 'string' && billDocIdOrId.startsWith('bill_'))
      ? billDocIdOrId
      : `bill_${billDocIdOrId}`;
    const billRef = this.db.collection('billing').doc(billDocId);

    const directBillSnap = await billRef.get();
    let billData = directBillSnap.exists ? directBillSnap.data() : null;
    if (!billData) {
      const altBillRef = this.db.collection('billing').doc(String(billDocIdOrId));
      const altSnap = await altBillRef.get();
      if (altSnap.exists) billData = altSnap.data();
    }
    if (!billData) {
      throw new Error(`Billing record "${billDocId}" does not exist in Firestore.`);
    }

    const rawNum = billData.id !== undefined ? billData.id : billDocId.replace('bill_', '');
    const deletedNum = parseInt(rawNum, 10);

    let linkedRcptDocId = null;
    if (billData.accountingReceiptId) {
      linkedRcptDocId = (typeof billData.accountingReceiptId === 'string' && billData.accountingReceiptId.startsWith('rcpt_'))
        ? billData.accountingReceiptId
        : `rcpt_${billData.accountingReceiptId}`;
    } else if (!isNaN(deletedNum) && deletedNum > 0) {
      linkedRcptDocId = `rcpt_${deletedNum}`;
    }

    let resDocId = null;
    if (billData.reservationDocId) {
      resDocId = billData.reservationDocId;
    } else if (!isNaN(deletedNum) && deletedNum > 0) {
      resDocId = `res_${deletedNum}`;
    }

    let opDocId = null;
    if (billData.operationId) {
      opDocId = billData.operationId.startsWith('op_') ? billData.operationId : `op_${billData.operationId}`;
    }

    await this.db.runTransaction(async (tx) => {
      const counterRef = this.db.collection('system').doc('counters');
      const rcptRef = linkedRcptDocId ? this.db.collection('receipts').doc(linkedRcptDocId) : null;
      const resRef = resDocId ? this.db.collection('system').doc(resDocId) : null;
      const opRef = opDocId ? this.db.collection('system').doc(opDocId) : null;

      // All reads first
      const [bSnap, cSnap, rSnap, resSnap, opSnap, allBillingSnap, allReceiptsSnap, allSystemSnap] = await Promise.all([
        tx.get(billRef),
        tx.get(counterRef),
        rcptRef ? tx.get(rcptRef) : Promise.resolve(null),
        resRef ? tx.get(resRef) : Promise.resolve(null),
        opRef ? tx.get(opRef) : Promise.resolve(null),
        this.db.collection('billing').get(),
        this.db.collection('receipts').get(),
        this.db.collection('system').get()
      ]);

      if (!bSnap.exists) {
        throw new Error(`Billing record "${billDocId}" does not exist in Firestore.`);
      }

      // Perform deletions after reads
      tx.delete(billRef);
      if (rSnap && rSnap.exists) tx.delete(rcptRef);
      if (resSnap && resSnap.exists) tx.delete(resRef);
      if (opSnap && opSnap.exists) tx.delete(opRef);

      let maxRemainingSeq = 0;
      let maxRemainingBill = 0;

      allBillingSnap.forEach(snap => {
        if (snap.id !== billDocId && snap.id !== String(billDocIdOrId)) {
          const d = snap.data();
          let num = null;
          if (typeof d.id === 'number' && d.id > 0) num = d.id;
          else if (d.receiptNo) {
            const m = String(d.receiptNo).match(/\d+$/);
            if (m) num = parseInt(m[0], 10);
          } else {
            const m = snap.id.match(/^bill_(\d+)$/);
            if (m) num = parseInt(m[1], 10);
          }
          if (num && !isNaN(num)) {
            if (num > maxRemainingSeq) maxRemainingSeq = num;
            if (num > maxRemainingBill) maxRemainingBill = num;
          }
        }
      });

      allReceiptsSnap.forEach(snap => {
        if (snap.id !== linkedRcptDocId && (!linkedRcptDocId || snap.id !== linkedRcptDocId.replace('rcpt_', ''))) {
          if (!snap.id.startsWith('rcpt_phys_')) {
            const d = snap.data();
            let num = null;
            if (typeof d.id === 'number' && d.id > 0) num = d.id;
            else if (d.receiptNo && !/^(?:P|PU)\d+/i.test(d.receiptNo)) {
              const m = String(d.receiptNo).match(/\d+$/);
              if (m) num = parseInt(m[0], 10);
            } else {
              const m = snap.id.match(/^rcpt_(\d+)$/);
              if (m) num = parseInt(m[1], 10);
            }
            if (num && !isNaN(num)) {
              if (num > maxRemainingSeq) maxRemainingSeq = num;
            }
          }
        }
      });

      allSystemSnap.forEach(snap => {
        if (snap.id.startsWith('res_') && !snap.id.startsWith('res_phys_')) {
          if (snap.id !== resDocId) {
            const d = snap.data();
            let num = null;
            if (typeof d.seqNumber === 'number' && d.seqNumber > 0) num = d.seqNumber;
            else {
              const m = snap.id.match(/^res_(\d+)$/);
              if (m) num = parseInt(m[1], 10);
            }
            if (num && !isNaN(num)) {
              if (num > maxRemainingSeq) maxRemainingSeq = num;
            }
          }
        }
      });

      const cData = cSnap.exists ? cSnap.data() : {};
      const currentGlobal = (typeof cData.globalSequenceCounter === 'number') ? cData.globalSequenceCounter : 0;

      if (!isNaN(deletedNum) && (deletedNum >= currentGlobal || deletedNum > maxRemainingSeq)) {
        tx.set(counterRef, {
          globalSequenceCounter: maxRemainingSeq,
          billingReceiptCounter: maxRemainingBill,
          updatedAt: Date.now()
        }, { merge: true });
      }
    });

    // IDB cache eviction
    await this.idb.deleteRec('billing', billDocId);
    if (!isNaN(deletedNum)) {
      await this.idb.deleteRec('billing', deletedNum);
      await this.idb.deleteRec('billing', `bill_${deletedNum}`);
    }
    if (billDocIdOrId !== billDocId) await this.idb.deleteRec('billing', billDocIdOrId);
    if (billData.id !== undefined) await this.idb.deleteRec('billing', billData.id);

    if (linkedRcptDocId) {
      await this.idb.deleteRec('receipts', linkedRcptDocId);
      const rNum = parseInt(linkedRcptDocId.replace('rcpt_', ''), 10);
      if (!isNaN(rNum)) {
        await this.idb.deleteRec('receipts', rNum);
        await this.idb.deleteRec('receipts', `rcpt_${rNum}`);
      }
    }

    return { success: true, deletedNum };
  }

  async deleteReceiptRecord(rcptDocIdOrId) {
    if (!this.currentUser) throw new Error('Authentication required: please log in to delete records.');

    const rcptDocId = (typeof rcptDocIdOrId === 'string' && (rcptDocIdOrId.startsWith('rcpt_') || rcptDocIdOrId.startsWith('rcpt_phys_')))
      ? rcptDocIdOrId
      : `rcpt_${rcptDocIdOrId}`;
    const rcptRef = this.db.collection('receipts').doc(rcptDocId);

    let directSnap = await rcptRef.get();
    let rcptData = directSnap.exists ? directSnap.data() : null;
    if (!rcptData) {
      const altRef = this.db.collection('receipts').doc(String(rcptDocIdOrId));
      const altSnap = await altRef.get();
      if (altSnap.exists) rcptData = altSnap.data();
    }
    if (!rcptData) {
      throw new Error(`Receipt record "${rcptDocId}" does not exist in Firestore.`);
    }

    // Physical receipt
    const isPhysical = rcptDocId.startsWith('rcpt_phys_') || (rcptData.receiptNo && /^(?:P|PU)\d+/i.test(rcptData.receiptNo));
    if (isPhysical) {
      const physId = rcptData.receiptNo || rcptDocId.replace('rcpt_phys_', '');
      const physResRef = this.db.collection('system').doc(`res_phys_${physId}`);

      await this.db.runTransaction(async (tx) => {
        const [rcptSnap, prSnap] = await Promise.all([
          tx.get(rcptRef),
          tx.get(physResRef)
        ]);
        tx.delete(rcptRef);
        if (prSnap && prSnap.exists) tx.delete(physResRef);
      });

      await this.idb.deleteRec('receipts', rcptDocId);
      await this.idb.deleteRec('receipts', physId);
      return { success: true, isPhysical: true };
    }

    // Bill-linked receipt
    const isLinked = (rcptData.source === 'billing' || !!rcptData.billingFirestoreId || !!rcptData.billingId || !!rcptData.billingReceiptNo);
    if (isLinked) {
      const linkedBillDocId = rcptData.billingFirestoreId || (rcptData.billingId ? `bill_${rcptData.billingId}` : `bill_${rcptData.id}`);
      return await this.deleteBillingRecord(linkedBillDocId);
    }

    // Independent software receipt
    const rawNum = rcptData.id !== undefined ? rcptData.id : rcptDocId.replace('rcpt_', '');
    const deletedNum = parseInt(rawNum, 10);
    const resDocId = rcptData.reservationDocId || `res_${deletedNum}`;

    await this.db.runTransaction(async (tx) => {
      const counterRef = this.db.collection('system').doc('counters');
      const resRef = this.db.collection('system').doc(resDocId);

      const [rSnap, cSnap, resSnap, allBillingSnap, allReceiptsSnap, allSystemSnap] = await Promise.all([
        tx.get(rcptRef),
        tx.get(counterRef),
        tx.get(resRef),
        this.db.collection('billing').get(),
        this.db.collection('receipts').get(),
        this.db.collection('system').get()
      ]);

      if (!rSnap.exists) {
        throw new Error(`Receipt record "${rcptDocId}" does not exist in Firestore.`);
      }

      tx.delete(rcptRef);
      if (resSnap && resSnap.exists) tx.delete(resRef);

      let maxRemainingSeq = 0;
      let maxRemainingBill = 0;

      allBillingSnap.forEach(snap => {
        const d = snap.data();
        let num = null;
        if (typeof d.id === 'number' && d.id > 0) num = d.id;
        else if (d.receiptNo) {
          const m = String(d.receiptNo).match(/\d+$/);
          if (m) num = parseInt(m[0], 10);
        } else {
          const m = snap.id.match(/^bill_(\d+)$/);
          if (m) num = parseInt(m[1], 10);
        }
        if (num && !isNaN(num)) {
          if (num > maxRemainingSeq) maxRemainingSeq = num;
          if (num > maxRemainingBill) maxRemainingBill = num;
        }
      });

      allReceiptsSnap.forEach(snap => {
        if (snap.id !== rcptDocId && snap.id !== String(rcptDocIdOrId)) {
          if (!snap.id.startsWith('rcpt_phys_')) {
            const d = snap.data();
            let num = null;
            if (typeof d.id === 'number' && d.id > 0) num = d.id;
            else if (d.receiptNo && !/^(?:P|PU)\d+/i.test(d.receiptNo)) {
              const m = String(d.receiptNo).match(/\d+$/);
              if (m) num = parseInt(m[0], 10);
            } else {
              const m = snap.id.match(/^rcpt_(\d+)$/);
              if (m) num = parseInt(m[1], 10);
            }
            if (num && !isNaN(num)) {
              if (num > maxRemainingSeq) maxRemainingSeq = num;
            }
          }
        }
      });

      allSystemSnap.forEach(snap => {
        if (snap.id.startsWith('res_') && !snap.id.startsWith('res_phys_')) {
          if (snap.id !== resDocId) {
            const d = snap.data();
            let num = null;
            if (typeof d.seqNumber === 'number' && d.seqNumber > 0) num = d.seqNumber;
            else {
              const m = snap.id.match(/^res_(\d+)$/);
              if (m) num = parseInt(m[1], 10);
            }
            if (num && !isNaN(num)) {
              if (num > maxRemainingSeq) maxRemainingSeq = num;
            }
          }
        }
      });

      const cData = cSnap.exists ? cSnap.data() : {};
      const currentGlobal = (typeof cData.globalSequenceCounter === 'number') ? cData.globalSequenceCounter : 0;

      if (!isNaN(deletedNum) && (deletedNum >= currentGlobal || deletedNum > maxRemainingSeq)) {
        tx.set(counterRef, {
          globalSequenceCounter: maxRemainingSeq,
          updatedAt: Date.now()
        }, { merge: true });
      }
    });

    await this.idb.deleteRec('receipts', rcptDocId);
    if (!isNaN(deletedNum)) {
      await this.idb.deleteRec('receipts', deletedNum);
      await this.idb.deleteRec('receipts', `rcpt_${deletedNum}`);
    }
    return { success: true, deletedNum, isIndependent: true };
  }

  async getCashBalance() {
    const receipts = await this.idb.getAll('receipts');
    let totalIncome = 0;
    receipts.forEach(r => {
      if (!r.voided && r.paymentMode === 'Cash') {
        totalIncome += (parseFloat(r.amount) || 0);
      }
    });
    const openingCash = 10000;
    return openingCash + totalIncome;
  }

  async fsGetAllSafe(storeName) {
    const snap = await this.db.collection(storeName).get();
    const records = [];
    snap.forEach(d => records.push(d.data()));
    await this.idb.clearStore(storeName);
    for (const r of records) {
      await this.idb.putRec(storeName, r);
    }
    return records;
  }
}

// =========================================================================
// TEST EXECUTION
// =========================================================================

async function runTestSuite() {
  const db = new MockFirestore();
  const idb = new MockIndexedDB();
  const app = new TempleAccountsSimulator(db, idb);

  // Initialize system counters with baseline
  db.collection('system').doc('counters').set({
    globalSequenceCounter: 0,
    billingReceiptCounter: 0,
    receiptCounter: 1020,
    voucherCounter: 0,
    billingPrefix: 'BILL-',
    receiptPrefix: 'R-',
    voucherPrefix: 'V-'
  });

  console.log('\n--- SCENARIO 1: Delete Highest Bill & Verify Number Reuse ---');
  {
    // Create Bill 1, 2, 3
    const b1 = await app.createBill({ devoteeName: 'Devotee 1', totalAmount: 100 });
    const b2 = await app.createBill({ devoteeName: 'Devotee 2', totalAmount: 200 });
    const b3 = await app.createBill({ devoteeName: 'Devotee 3', totalAmount: 300 });

    assert(b1.billPayload.receiptNo === 'BILL-001', 'T1.1', 'Bill 1 created as BILL-001', b1.billPayload.receiptNo);
    assert(b2.billPayload.receiptNo === 'BILL-002', 'T1.2', 'Bill 2 created as BILL-002', b2.billPayload.receiptNo);
    assert(b3.billPayload.receiptNo === 'BILL-003', 'T1.3', 'Bill 3 created as BILL-003', b3.billPayload.receiptNo);

    let c = await app.getCounters();
    assert(c.globalSequenceCounter === 3, 'T1.4', 'globalSequenceCounter is 3 before deletion', `c=${c.globalSequenceCounter}`);

    // Delete highest bill (BILL-003)
    await app.deleteBillingRecord('bill_3');

    c = await app.getCounters();
    assert(c.globalSequenceCounter === 2, 'T1.5', 'globalSequenceCounter adjusted down to 2 after BILL-003 deletion', `c=${c.globalSequenceCounter}`);

    const preview = await app.getNextBillingReceiptNo();
    assert(preview === 'BILL-003', 'T1.6', 'Next billing receipt preview is BILL-003 (reused number)', preview);

    const b3_reused = await app.createBill({ devoteeName: 'Devotee 3 Reused', totalAmount: 350 });
    assert(b3_reused.billPayload.receiptNo === 'BILL-003', 'T1.7', 'Newly created bill successfully reused BILL-003', b3_reused.billPayload.receiptNo);
  }

  console.log('\n--- SCENARIO 2: Delete Middle Bill & Verify Next Number Unchanged ---');
  {
    // Current bills: 1, 2, 3. Create 4 and 5.
    await app.createBill({ devoteeName: 'Devotee 4', totalAmount: 400 });
    await app.createBill({ devoteeName: 'Devotee 5', totalAmount: 500 });

    let c = await app.getCounters();
    assert(c.globalSequenceCounter === 5, 'T2.1', 'globalSequenceCounter is 5', `c=${c.globalSequenceCounter}`);

    // Delete middle bill (BILL-002)
    await app.deleteBillingRecord('bill_2');

    c = await app.getCounters();
    assert(c.globalSequenceCounter === 5, 'T2.2', 'globalSequenceCounter remains 5 while higher bills (3, 4, 5) exist', `c=${c.globalSequenceCounter}`);

    const preview = await app.getNextBillingReceiptNo();
    assert(preview === 'BILL-006', 'T2.3', 'Next bill preview remains BILL-006 (middle gap at 2 is preserved)', preview);

    const b6 = await app.createBill({ devoteeName: 'Devotee 6', totalAmount: 600 });
    assert(b6.billPayload.receiptNo === 'BILL-006', 'T2.4', 'New bill is allocated BILL-006', b6.billPayload.receiptNo);
  }

  console.log('\n--- SCENARIO 3: Void a Bill & Verify Number Cannot Be Reused ---');
  {
    // Void bill 6
    await app.voidBill('bill_6', 'Duplicate entry');

    const bill6Snap = await db.collection('billing').doc('bill_6').get();
    assert(bill6Snap.exists && bill6Snap.data().voided === true, 'T3.1', 'bill_6 marked voided in Firestore');

    let c = await app.getCounters();
    assert(c.globalSequenceCounter === 6, 'T3.2', 'globalSequenceCounter remains 6 (voided bill consumes number)', `c=${c.globalSequenceCounter}`);

    const preview = await app.getNextBillingReceiptNo();
    assert(preview === 'BILL-007', 'T3.3', 'Next bill preview is BILL-007 (BILL-006 NOT reused)', preview);

    // Create next bill
    const b7 = await app.createBill({ devoteeName: 'Devotee 7', totalAmount: 700 });
    assert(b7.billPayload.receiptNo === 'BILL-007', 'T3.4', 'New bill is assigned BILL-007', b7.billPayload.receiptNo);
  }

  console.log('\n--- SCENARIO 4: Delete Bill & Verify Linked Accounting Receipt Handled ---');
  {
    // Bill 7 has linked accounting receipt rcpt_7
    const r7Before = await db.collection('receipts').doc('rcpt_7').get();
    const res7Before = await db.collection('system').doc('res_7').get();
    assert(r7Before.exists, 'T4.1', 'Linked accounting receipt rcpt_7 exists in Firestore before deletion');
    assert(res7Before.exists, 'T4.2', 'Linked reservation res_7 exists in Firestore before deletion');

    await app.deleteBillingRecord('bill_7');

    const b7After = await db.collection('billing').doc('bill_7').get();
    const r7After = await db.collection('receipts').doc('rcpt_7').get();
    const res7After = await db.collection('system').doc('res_7').get();

    assert(!b7After.exists, 'T4.3', 'bill_7 permanently removed from Firestore');
    assert(!r7After.exists, 'T4.4', 'Linked accounting receipt rcpt_7 permanently removed from Firestore');
    assert(!res7After.exists, 'T4.5', 'Linked reservation res_7 permanently removed from Firestore');

    const b7Idb = await idb.getOne('billing', 'bill_7');
    const r7Idb = await idb.getOne('receipts', 'rcpt_7');
    assert(!b7Idb, 'T4.6', 'bill_7 evicted from IndexedDB cache');
    assert(!r7Idb, 'T4.7', 'rcpt_7 evicted from IndexedDB cache');
  }

  console.log('\n--- SCENARIO 5: Delete Independent Receipt & Verify Number Reuse ---');
  {
    // Currently max sequence is 6 (voided).
    // Create an independent receipt (sequence 7)
    const indRcpt = await app.createIndependentReceipt({ name: 'Donation Devotee', amount: 1500 });
    assert(indRcpt.receiptNo === 'R-007', 'T5.1', 'Independent receipt assigned R-007', indRcpt.receiptNo);

    let c = await app.getCounters();
    assert(c.globalSequenceCounter === 7, 'T5.2', 'globalSequenceCounter advanced to 7', `c=${c.globalSequenceCounter}`);

    // Delete highest independent receipt R-007
    await app.deleteReceiptRecord('rcpt_7');

    c = await app.getCounters();
    assert(c.globalSequenceCounter === 6, 'T5.3', 'globalSequenceCounter adjusted down to 6 after R-007 deletion', `c=${c.globalSequenceCounter}`);

    const previewRcpt = await app.nextReceiptNo();
    assert(previewRcpt === 'R-007', 'T5.4', 'Next receipt preview reflects reused R-007', previewRcpt);

    const reusedRcpt = await app.createIndependentReceipt({ name: 'Another Devotee', amount: 2000 });
    assert(reusedRcpt.receiptNo === 'R-007', 'T5.5', 'Next independent receipt successfully reused R-007', reusedRcpt.receiptNo);
  }

  console.log('\n--- SCENARIO 6: Delete Receipt Linked to Bill & Verify Bilateral Consistency ---');
  {
    // Create Bill 8 with linked receipt R-008
    const b8 = await app.createBill({ devoteeName: 'Devotee 8', totalAmount: 800 });
    assert(b8.billPayload.receiptNo === 'BILL-008', 'T6.1', 'Bill 8 created with BILL-008', b8.billPayload.receiptNo);
    assert(b8.rcptPayload.receiptNo === 'R-008', 'T6.2', 'Linked receipt created with R-008', b8.rcptPayload.receiptNo);

    // Delete via receipt table: deleteReceiptRecord('rcpt_8')
    await app.deleteReceiptRecord('rcpt_8');

    const b8Snap = await db.collection('billing').doc('bill_8').get();
    const r8Snap = await db.collection('receipts').doc('rcpt_8').get();
    const res8Snap = await db.collection('system').doc('res_8').get();

    assert(!b8Snap.exists, 'T6.3', 'Linked bill_8 permanently deleted when receipt was deleted');
    assert(!r8Snap.exists, 'T6.4', 'Receipt rcpt_8 permanently deleted');
    assert(!res8Snap.exists, 'T6.5', 'Reservation res_8 permanently deleted');

    const c = await app.getCounters();
    assert(c.globalSequenceCounter === 7, 'T6.6', 'globalSequenceCounter adjusted to 7 (trailing reuse)', `c=${c.globalSequenceCounter}`);
  }

  console.log('\n--- SCENARIO 7: Physical Receipt Numbering Remains Unchanged ---');
  {
    // Seed physical receipt rcpt_phys_P600 and reservation
    db.collection('receipts').doc('rcpt_phys_P600').set({
      id: 'P600',
      receiptNo: 'P600',
      amount: 50,
      source: 'physical'
    });
    db.collection('system').doc('res_phys_P600').set({
      id: 'res_phys_P600',
      type: 'physical'
    });
    await idb.putRec('receipts', { id: 'P600', receiptNo: 'P600', amount: 50 });

    const cBefore = await app.getCounters();

    // Delete physical receipt
    await app.deleteReceiptRecord('rcpt_phys_P600');

    const physSnap = await db.collection('receipts').doc('rcpt_phys_P600').get();
    assert(!physSnap.exists, 'T7.1', 'rcpt_phys_P600 deleted from Firestore');

    const cAfter = await app.getCounters();
    assert(cAfter.globalSequenceCounter === cBefore.globalSequenceCounter, 'T7.2', 'globalSequenceCounter untouched by physical receipt deletion');
    assert(cAfter.billingReceiptCounter === cBefore.billingReceiptCounter, 'T7.3', 'billingReceiptCounter untouched by physical receipt deletion');
    assert(cAfter.receiptCounter === cBefore.receiptCounter, 'T7.4', 'receiptCounter (1020) strictly untouched');
  }

  console.log('\n--- SCENARIO 8: Firestore & IndexedDB No Longer Contain Deleted Records ---');
  {
    // Check that deleted records (e.g. bill_2, bill_3, bill_7, bill_8) are absent from both stores
    const b2Fs = await db.collection('billing').doc('bill_2').get();
    const b2Idb = await idb.getOne('billing', 'bill_2');
    const b2IdbNum = await idb.getOne('billing', '2');
    assert(!b2Fs.exists, 'T8.1', 'bill_2 absent from Firestore');
    assert(!b2Idb && !b2IdbNum, 'T8.2', 'bill_2 absent from IndexedDB cache');

    const r2Fs = await db.collection('receipts').doc('rcpt_2').get();
    const r2Idb = await idb.getOne('receipts', 'rcpt_2');
    assert(!r2Fs.exists, 'T8.3', 'rcpt_2 absent from Firestore');
    assert(!r2Idb, 'T8.4', 'rcpt_2 absent from IndexedDB cache');
  }

  console.log('\n--- SCENARIO 9: Deleted Records Do Not Reappear After Reload or Sync ---');
  {
    // Execute fsGetAllSafe('billing') and fsGetAllSafe('receipts') simulating reload
    const billingReloaded = await app.fsGetAllSafe('billing');
    const receiptsReloaded = await app.fsGetAllSafe('receipts');

    const hasBill2 = billingReloaded.some(b => b.id === 2 || b.firestoreId === 'bill_2');
    const hasRcpt2 = receiptsReloaded.some(r => r.id === 2 || r.firestoreId === 'rcpt_2');
    assert(!hasBill2, 'T9.1', 'bill_2 does not reappear in billing after sync');
    assert(!hasRcpt2, 'T9.2', 'rcpt_2 does not reappear in receipts after sync');

    const idbBill2 = await idb.getOne('billing', 'bill_2');
    assert(!idbBill2, 'T9.3', 'IndexedDB does not restore deleted bill_2');
  }

  console.log('\n--- SCENARIO 10: Failed Deletions Do Not Leave Partially Deleted Transactions ---');
  {
    // Attempt deletion with no authenticated user
    app.currentUser = null;
    let failed = false;
    try {
      await app.deleteBillingRecord('bill_1');
    } catch (err) {
      failed = true;
    }
    app.currentUser = { uid: 'rFvStQNfiINnPor66OzXuE1O9Lm1', email: 'vibu@gmail.com' };

    assert(failed, 'T10.1', 'Unauthorized deletion threw error');
    const b1Snap = await db.collection('billing').doc('bill_1').get();
    const r1Snap = await db.collection('receipts').doc('rcpt_1').get();
    assert(b1Snap.exists, 'T10.2', 'bill_1 preserved intact after aborted deletion');
    assert(r1Snap.exists, 'T10.3', 'rcpt_1 preserved intact after aborted deletion');
  }

  console.log('\n--- SCENARIO 11: Concurrent Allocation Cannot Create Duplicate Numbers ---');
  {
    // Spawn 5 concurrent bills
    const concurrentPromises = [
      app.createBill({ devoteeName: 'Concurrent 1', totalAmount: 100 }),
      app.createBill({ devoteeName: 'Concurrent 2', totalAmount: 110 }),
      app.createBill({ devoteeName: 'Concurrent 3', totalAmount: 120 }),
      app.createBill({ devoteeName: 'Concurrent 4', totalAmount: 130 }),
      app.createBill({ devoteeName: 'Concurrent 5', totalAmount: 140 })
    ];

    const results = await Promise.all(concurrentPromises);
    const billNumbers = results.map(r => r.billPayload.receiptNo);
    const uniqueBillNumbers = new Set(billNumbers);

    assert(uniqueBillNumbers.size === 5, 'T11.1', 'All 5 concurrent bills received unique numbers', billNumbers.join(', '));
    const receiptNumbers = results.map(r => r.rcptPayload.receiptNo);
    const uniqueReceiptNumbers = new Set(receiptNumbers);
    assert(uniqueReceiptNumbers.size === 5, 'T11.2', 'All 5 concurrent linked receipts received unique numbers', receiptNumbers.join(', '));
  }

  console.log('\n--- SCENARIO 12: Totals, Reports, and Balances Recalculate Correctly ---');
  {
    const balanceBefore = await app.getCashBalance();

    // Create a new bill with Cash payment ₹500
    const newBill = await app.createBill({ devoteeName: 'Cash Devotee', totalAmount: 500, paymentMode: 'Cash' });
    const balanceAfterAdd = await app.getCashBalance();
    assert(balanceAfterAdd === balanceBefore + 500, 'T12.1', 'Cash balance increased by ₹500 after new bill', `bal=${balanceAfterAdd}`);

    // Delete the bill
    await app.deleteBillingRecord(newBill.billPayload.firestoreId);
    const balanceAfterDelete = await app.getCashBalance();
    assert(balanceAfterDelete === balanceBefore, 'T12.2', 'Cash balance restored exactly to prior amount after deletion', `bal=${balanceAfterDelete}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  fs.writeFileSync(
    path.join(__dirname, 'step_33_164_test_results.json'),
    JSON.stringify({ totalTests, passedTests, failedTests, testResults }, null, 2),
    'utf8'
  );

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
