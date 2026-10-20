/**
 * test_step_33_156_zero_cost_recovery_rehearsal.js
 * STEP 33.156 — Zero-Cost Local Recovery Rehearsal Drill
 *
 * Verifies local recovery capabilities using only local JSON artifacts and an in-memory
 * simulated Firestore store. ZERO network access, ZERO live database mutations.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return '[' + val.map(item => (item === undefined || typeof item === 'function') ? 'null' : canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const entries = [];
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined && typeof v !== 'function') entries.push(JSON.stringify(k) + ':' + canonicalJsonStringify(v));
  }
  return '{' + entries.join(',') + '}';
}

function computeSha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').toUpperCase();
}

const BACKUP_PATH = 'D:/Download/Temple_Accounts_Backup_2026-10-20T06-17-45.json';
const MANIFEST_PATH = 'D:/Temple/plans/step_33_155_cleanup_manifest.json';
const PLAN_PATH = 'D:/Temple/plans/step_33_155_cleanup_plan.json';

const EXPECTED_BACKUP_FILE_SHA = '2EDC31B88FFC799350F6CA22B3F9531336F616D7F7EA8BB7790E9E5C31F15738';
const EXPECTED_BACKUP_PAYLOAD_SHA = '7AC91CB36A108BB4B15E431E84816902DA6D3EB3A7C2510D4FF1513292E5B520';
const EXPECTED_MANIFEST_FILE_SHA = '6ED0F2BF4EE33E8F4986700A4F88E19B62B4B95D4068C789DBB3D5B5B8C0004E';

const tests = [];
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    tests.push({ name, pass: true });
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    tests.push({ name, pass: false, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Simulated In-Memory Firestore Datastore
// ---------------------------------------------------------------------------
class SimulatedFirestore {
  constructor() {
    this.collections = new Map(); // colName -> Map(docId -> docData)
  }

  set(col, id, data) {
    if (!this.collections.has(col)) this.collections.set(col, new Map());
    this.collections.get(col).set(id, JSON.parse(JSON.stringify(data)));
  }

  get(col, id) {
    if (!this.collections.has(col)) return null;
    const d = this.collections.get(col).get(id);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }

  delete(col, id) {
    if (!this.collections.has(col)) return false;
    return this.collections.get(col).delete(id);
  }

  getAll(col) {
    if (!this.collections.has(col)) return [];
    return Array.from(this.collections.get(col).values()).map(d => JSON.parse(JSON.stringify(d)));
  }

  count(col) {
    if (!this.collections.has(col)) return 0;
    return this.collections.get(col).size;
  }

  totalDocCount() {
    let sum = 0;
    for (const m of this.collections.values()) sum += m.size;
    return sum;
  }
}

console.log('============================================================');
console.log('STEP 33.156 Zero-Cost Recovery Rehearsal Drill');
console.log('============================================================\n');

// TC-01: Artifact Cryptographic Baseline Verification
test('TC-01: Cryptographic verification of local recovery artifacts', () => {
  const backupBuf = fs.readFileSync(BACKUP_PATH);
  const fileHash = computeSha256(backupBuf);
  if (fileHash !== EXPECTED_BACKUP_FILE_SHA) {
    throw new Error(`Backup file hash mismatch: expected ${EXPECTED_BACKUP_FILE_SHA}, got ${fileHash}`);
  }

  const backupObj = JSON.parse(backupBuf.toString('utf8'));
  const payloadHash = computeSha256(canonicalJsonStringify({
    collections: backupObj.collections || {},
    counters: backupObj.counters || null,
    idempotency: backupObj.idempotency || [],
    reservations: backupObj.reservations || [],
    system: backupObj.system || {}
  }));
  if (payloadHash !== EXPECTED_BACKUP_PAYLOAD_SHA) {
    throw new Error(`Backup payload hash mismatch: expected ${EXPECTED_BACKUP_PAYLOAD_SHA}, got ${payloadHash}`);
  }

  const manifestBuf = fs.readFileSync(MANIFEST_PATH);
  const manifestHash = computeSha256(manifestBuf);
  if (manifestHash !== EXPECTED_MANIFEST_FILE_SHA) {
    throw new Error(`Manifest file hash mismatch: expected ${EXPECTED_MANIFEST_FILE_SHA}, got ${manifestHash}`);
  }
});

// TC-02: Datastore Ingestion from Authoritative Backup
let store = new SimulatedFirestore();
let backupData = null;

test('TC-02: Populate simulated store from authoritative backup (497 docs)', () => {
  backupData = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));

  // Load application collections
  for (const [colName, docs] of Object.entries(backupData.collections)) {
    for (const d of docs) {
      const docId = d._firestoreId || d.id;
      store.set(colName, docId, d);
    }
  }

  // Load system records
  if (backupData.counters) {
    store.set('system', 'counters', backupData.counters);
  }
  for (const r of (backupData.reservations || [])) {
    const docId = r._firestoreId || (r.seqNumber ? `res_${r.seqNumber}` : null);
    store.set('system', docId, r);
  }
  for (const op of (backupData.idempotency || [])) {
    const docId = op._firestoreId || op.operationId;
    store.set('system', docId, op);
  }

  const totalLoaded = store.totalDocCount();
  if (totalLoaded !== 497) {
    throw new Error(`Expected 497 documents loaded into simulated store, got ${totalLoaded}`);
  }
  if (store.count('billing') !== 94) throw new Error(`Expected 94 bills, got ${store.count('billing')}`);
  if (store.count('receipts') !== 114) throw new Error(`Expected 114 receipts, got ${store.count('receipts')}`);
  if (store.count('system') !== 195) throw new Error(`Expected 195 system docs, got ${store.count('system')}`);
});

// TC-03: Simulate Cleanup Deletion of 412 Manifest Targets
test('TC-03: Simulate candidate cleanup of 412 targets from manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  let deletedCount = 0;

  for (const target of manifest.targets) {
    const existed = store.delete(target.collection, target.id);
    if (!existed) {
      throw new Error(`Target ${target.collection}/${target.id} was not present in store before deletion!`);
    }
    deletedCount++;
  }

  if (deletedCount !== 412) {
    throw new Error(`Expected 412 deletions, got ${deletedCount}`);
  }

  const remainingTotal = store.totalDocCount();
  // 497 initial - 412 deleted = 85 remaining (84 master data + 1 counters)
  if (remainingTotal !== 85) {
    throw new Error(`Expected 85 remaining documents after cleanup, got ${remainingTotal}`);
  }

  // Verify all master data remains untouched
  if (store.count('settings') !== 1) throw new Error('settings corrupted');
  if (store.count('funds') !== 3) throw new Error('funds corrupted');
  if (store.count('incomeCategories') !== 4) throw new Error('incomeCategories corrupted');
  if (store.count('expenseCategories') !== 71) throw new Error('expenseCategories corrupted');
  if (store.count('bankAccounts') !== 2) throw new Error('bankAccounts corrupted');
  if (store.count('chittyMembers') !== 3) throw new Error('chittyMembers corrupted');

  // Verify counters document remains untouched
  const countersDoc = store.get('system', 'counters');
  if (!countersDoc) throw new Error('system/counters missing after cleanup!');
  if (countersDoc.receiptCounter !== 1020 || countersDoc.voucherCounter !== 502 ||
      countersDoc.billingReceiptCounter !== 100 || countersDoc.globalSequenceCounter !== 100) {
    throw new Error('Counters document corrupted during cleanup!');
  }

  // Verify all transactional collections are completely clean
  if (store.count('billing') !== 0) throw new Error('billing not clean');
  if (store.count('receipts') !== 0) throw new Error('receipts not clean');
  if (store.count('payments') !== 0) throw new Error('payments not clean');
  if (store.count('transfers') !== 0) throw new Error('transfers not clean');
  if (store.count('loans') !== 0) throw new Error('loans not clean');
  if (store.count('chittyCollections') !== 0) throw new Error('chittyCollections not clean');
  if (store.count('chittyPayouts') !== 0) throw new Error('chittyPayouts not clean');
  if (store.count('system') !== 1) throw new Error('system reservations/idempotency not clean');
});

// TC-04: Full Disaster Recovery Simulation (Rehydrate from Backup)
test('TC-04: Full recovery rehearsal from offline JSON backup (restore all 497 docs)', () => {
  // Simulate complete database recovery from backupData
  let restoredCount = 0;

  for (const [colName, docs] of Object.entries(backupData.collections)) {
    for (const d of docs) {
      const docId = d._firestoreId || d.id;
      store.set(colName, docId, d);
      restoredCount++;
    }
  }

  if (backupData.counters) {
    store.set('system', 'counters', backupData.counters);
    restoredCount++;
  }
  for (const r of (backupData.reservations || [])) {
    const docId = r._firestoreId || (r.seqNumber ? `res_${r.seqNumber}` : null);
    store.set('system', docId, r);
    restoredCount++;
  }
  for (const op of (backupData.idempotency || [])) {
    const docId = op._firestoreId || op.operationId;
    store.set('system', docId, op);
    restoredCount++;
  }

  if (restoredCount !== 497) {
    throw new Error(`Expected 497 restored documents, got ${restoredCount}`);
  }
  if (store.totalDocCount() !== 497) {
    throw new Error(`Store total count after restore is ${store.totalDocCount()}, expected 497`);
  }

  // Verify full fingerprint integrity against original backup
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const target of manifest.targets) {
    const restoredDoc = store.get(target.collection, target.id);
    if (!restoredDoc) {
      throw new Error(`Restored document missing: ${target.collection}/${target.id}`);
    }
    const hash = computeSha256(canonicalJsonStringify(restoredDoc));
    if (hash !== target.docSha256) {
      throw new Error(`Restored document hash mismatch for ${target.collection}/${target.id}: expected ${target.docSha256}, got ${hash}`);
    }
  }
});

// TC-05: Verify Safe-Merge Asymmetry (Add-Only Restore vs Extraneous Document)
test('TC-05: Validate safe-merge limitation (restore does not delete extraneous unbacked docs)', () => {
  // Inject an extraneous document created outside the backup
  store.set('billing', 'bill_extraneous_9999', {
    _firestoreId: 'bill_extraneous_9999',
    devoteeName: 'Alien Test Devotee',
    amount: 100
  });

  if (store.count('billing') !== 95) throw new Error('Extraneous doc injection failed');

  // Re-run restore from backup
  for (const [colName, docs] of Object.entries(backupData.collections)) {
    for (const d of docs) {
      const docId = d._firestoreId || d.id;
      store.set(colName, docId, d);
    }
  }

  // The extraneous document remains! This empirically proves that client restore is ADDITIVE
  const stillExists = store.get('billing', 'bill_extraneous_9999');
  if (!stillExists) {
    throw new Error('Expected extraneous document to persist under additive restore semantics');
  }

  // Clean it up from test store
  store.delete('billing', 'bill_extraneous_9999');
});

console.log('\n============================================================');
const passed = tests.filter(t => t.pass).length;
console.log(`Rehearsal Results: ${passed} / ${tests.length} PASS`);
console.log('============================================================');
