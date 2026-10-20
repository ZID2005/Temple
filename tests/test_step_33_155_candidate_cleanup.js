/**
 * STEP 33.155 SYNTHETIC TEST SUITE
 * Location: tests/test_step_33_155_candidate_cleanup.js
 *
 * Verifies candidate cleanup script, manifest, and plan for STEP 33.155.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  canonicalJsonStringify,
  computeSha256,
  computeFileSha256,
  computeBackupPayloadHash,
  verifyBackup,
  verifyManifest,
  validateTargetEntry,
  verifyDocumentFingerprint,
  verifyLinkedRecords,
  buildDeletionPlan,
  produceReviewReport,
  serializeDeletionPlan,
  execute,
  executeCleanup,
  performLiveDeletion,
  executeBatchedDeletions,
  deleteDocument,
  KNOWN_EXCEPTION_RECEIPTS,
  LEGACY_PAIRS,
  LEGACY_STANDALONE_RECEIPTS,
  LEGACY_TOMBSTONE_RECEIPTS
} = require('../scripts/step_33_155_candidate_cleanup.js');

let passed = 0;
let failed = 0;
const failedTests = [];

function test(name, fn) {
  try {
    fn();
    console.log('[PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('[FAIL] ' + name + ' -> ' + err.message);
    failed++;
    failedTests.push({ name, error: err.message });
  }
}

// Helpers
function docSha(doc) {
  return computeSha256(canonicalJsonStringify(doc));
}

function makeDoc(id, extra) {
  return Object.assign({ _firestoreId: id, id }, extra || {});
}

function makeBackupBuffer(collectionsOrPayload, metaExtra) {
  const meta = Object.assign({
    source: 'firestore',
    timestamp: '2026-10-20T06:17:45.155Z',
    snapshotId: 'snap-155-test'
  }, metaExtra || {});

  const baseCollections = {
    bankAccounts: [], billing: [], chittyCollections: [], chittyMembers: [],
    chittyPayouts: [], expenseCategories: [], funds: [], incomeCategories: [],
    loans: [], payments: [], receipts: [], settings: [], transfers: []
  };

  const payload = {
    collections: Object.assign({}, baseCollections, (collectionsOrPayload && collectionsOrPayload.collections) || {}),
    counters: (collectionsOrPayload && collectionsOrPayload.counters) || { receiptCounter: 1020, voucherCounter: 502, billingReceiptCounter: 100, globalSequenceCounter: 100 },
    reservations: (collectionsOrPayload && collectionsOrPayload.reservations) || [],
    idempotency: (collectionsOrPayload && collectionsOrPayload.idempotency) || [],
    system: (collectionsOrPayload && collectionsOrPayload.system) || {}
  };

  const payloadHash = computeBackupPayloadHash(payload);
  meta.integrity = { algorithm: 'SHA-256', hash: payloadHash };

  const root = Object.assign({ metadata: meta }, payload);
  return Buffer.from(JSON.stringify(root), 'utf8');
}

function makeManifest(bBuf, targets, metaExtra) {
  const vb = verifyBackup(bBuf);
  const payload = Object.assign({
    backupFileHash: vb.fileHash,
    backupPayloadHash: vb.payloadHash,
    generatedAt: new Date().toISOString(),
    schemaVersion: '33.155',
    targets: targets || []
  }, metaExtra || {});
  const mHash = computeSha256(canonicalJsonStringify(payload));
  return Buffer.from(JSON.stringify(Object.assign(payload, { manifestHash: mHash })), 'utf8');
}

// ==========================================================================
// TEST 1: Full Candidate Plan Verification
// ==========================================================================
test('TC-01: Full Candidate Plan with 412 targets produces eligible plan', function() {
  const bPath = 'D:\\Download\\Temple_Accounts_Backup_2026-10-20T06-17-45.json';
  const mPath = 'D:\\Temple\\plans\\step_33_155_cleanup_manifest.json';
  assert(fs.existsSync(bPath), 'Backup must exist');
  assert(fs.existsSync(mPath), 'Candidate manifest must exist');

  const bBuf = fs.readFileSync(bPath);
  const mBuf = fs.readFileSync(mPath);

  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert.strictEqual(plan.isEligible, true, 'Candidate plan must be eligible');
  assert.strictEqual(plan.totalManifestTargets, 412, 'Must have exactly 412 targets');
  assert.strictEqual(plan.acceptedTargets.length, 412, 'Must accept all 412 targets');
  assert.strictEqual(plan.rejectedEntries.length, 0, 'No rejected entries');
  assert.strictEqual(plan.fingerprintErrors.length, 0, 'No fingerprint errors');
  assert.strictEqual(plan.linkageErrors.length, 0, 'No linkage errors');
  assert.strictEqual(plan.relationshipExceptions.length, 4, 'Must have 4 documented exceptions');
  assert.strictEqual(plan.verifiedEdges.length, 569, 'Must have exactly 569 verified reciprocal edges');

  // Verify stages
  assert.strictEqual(plan.topologicalBatches[0].count, 0, 'Stage 1: 0 records');
  assert.strictEqual(plan.topologicalBatches[1].count, 10, 'Stage 2: 10 records');
  assert.strictEqual(plan.topologicalBatches[2].count, 114, 'Stage 3: 114 receipts');
  assert.strictEqual(plan.topologicalBatches[3].count, 94, 'Stage 4: 94 billing records');
  assert.strictEqual(plan.topologicalBatches[4].count, 194, 'Stage 5: 194 sequences/ops');
});

// ==========================================================================
// TEST 2: Known Exception Receipts Handling
// ==========================================================================
test('TC-02: Known exceptions for rcpt_1001, rcpt_1002, rcpt_1003, rcpt_1017 are documented and not falsely marked valid', function() {
  const bPath = 'D:\\Download\\Temple_Accounts_Backup_2026-10-20T06-17-45.json';
  const mPath = 'D:\\Temple\\plans\\step_33_155_cleanup_manifest.json';
  const vb = verifyBackup(fs.readFileSync(bPath));
  const vm = verifyManifest(fs.readFileSync(mPath), vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  const exMap = new Map(plan.relationshipExceptions.map(e => [e.receiptId, e]));

  // rcpt_1001
  assert(exMap.has('rcpt_1001'), 'rcpt_1001 must be in exceptions');
  assert.strictEqual(exMap.get('rcpt_1001').category, 'CONFLICTING_RECIPROCAL_LINK');
  assert.strictEqual(exMap.get('rcpt_1001').relationshipValid, false);
  assert(!plan.verifiedEdges.includes('receipts/rcpt_1001 <-> billing/bill_1'), 'Must NOT falsely add reciprocal edge for rcpt_1001');

  // rcpt_1002
  assert(exMap.has('rcpt_1002'), 'rcpt_1002 must be in exceptions');
  assert.strictEqual(exMap.get('rcpt_1002').category, 'MISSING_REFERENCED_BILL');
  assert.strictEqual(exMap.get('rcpt_1002').relationshipValid, false);
  assert(!plan.verifiedEdges.some(e => e.includes('rcpt_1002')), 'Must NOT falsely add edge for rcpt_1002');

  // rcpt_1003
  assert(exMap.has('rcpt_1003'), 'rcpt_1003 must be in exceptions');
  assert.strictEqual(exMap.get('rcpt_1003').category, 'MISSING_REFERENCED_BILL');
  assert.strictEqual(exMap.get('rcpt_1003').relationshipValid, false);
  assert(!plan.verifiedEdges.some(e => e.includes('rcpt_1003')), 'Must NOT falsely add edge for rcpt_1003');

  // rcpt_1017
  assert(exMap.has('rcpt_1017'), 'rcpt_1017 must be in exceptions');
  assert.strictEqual(exMap.get('rcpt_1017').category, 'CONFLICTING_RECIPROCAL_LINK');
  assert.strictEqual(exMap.get('rcpt_1017').relationshipValid, false);
  assert(!plan.verifiedEdges.includes('receipts/rcpt_1017 <-> billing/bill_11'), 'Must NOT falsely add reciprocal edge for rcpt_1017');
});

// ==========================================================================
// TEST 3: Legacy Pairs and Standalone Receipts
// ==========================================================================
test('TC-03: Legacy 2-way pairs and standalone receipts are properly handled', function() {
  const bPath = 'D:\\Download\\Temple_Accounts_Backup_2026-10-20T06-17-45.json';
  const mPath = 'D:\\Temple\\plans\\step_33_155_cleanup_manifest.json';
  const vb = verifyBackup(fs.readFileSync(bPath));
  const vm = verifyManifest(fs.readFileSync(mPath), vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  // Legacy pairs verified edges
  assert(plan.verifiedEdges.includes('billing/bill_12 <-> receipts/rcpt_1018'), 'bill_12 <-> rcpt_1018 edge must exist');
  assert(plan.verifiedEdges.includes('billing/bill_13 <-> receipts/rcpt_1019'), 'bill_13 <-> rcpt_1019 edge must exist');
  assert(plan.verifiedEdges.includes('billing/bill_14 <-> receipts/rcpt_14'), 'bill_14 <-> rcpt_14 edge must exist');

  // Standalone receipts are accepted
  for (const rId of LEGACY_STANDALONE_RECEIPTS) {
    assert(plan.acceptedTargets.some(t => t.collection === 'receipts' && t.id === rId), rId + ' must be accepted');
  }

  // Tombstones are accepted
  for (const rId of LEGACY_TOMBSTONE_RECEIPTS) {
    assert(plan.acceptedTargets.some(t => t.collection === 'receipts' && t.id === rId), rId + ' must be accepted');
  }
});

// ==========================================================================
// TEST 4: Modified backup rejection
// ==========================================================================
test('TC-04: Modified backup rejection (non-buffer, source mismatch, payload tamper)', function() {
  assert.throws(() => verifyBackup('not-a-buffer'), /rawBytes must be a Buffer/);

  const bBuf = makeBackupBuffer({}, { source: 'mongodb' });
  assert.throws(() => verifyBackup(bBuf), /metadata\.source must be firestore/);

  const raw = makeBackupBuffer({});
  const parsed = JSON.parse(raw.toString('utf8'));
  parsed.collections.settings.push({ _firestoreId: 'tampered' });
  const tamperedBuf = Buffer.from(JSON.stringify(parsed), 'utf8');
  assert.throws(() => verifyBackup(tamperedBuf), /BACKUP_INTEGRITY_MISMATCH/);
});

// ==========================================================================
// TEST 5: Modified manifest rejection
// ==========================================================================
test('TC-05: Modified manifest rejection (schema version, hash mismatch, identity mismatch)', function() {
  const bBuf = makeBackupBuffer({});
  const targets = [{ collection: 'billing', id: 'bill_1', docSha256: 'A'.repeat(64) }];
  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);

  // Schema mismatch
  const mWrongVer = makeManifest(bBuf, targets, { schemaVersion: '99.99' });
  assert.throws(() => verifyManifest(mWrongVer, vb.fileHash, vb.payloadHash), /MANIFEST_SCHEMA_VERSION_ERROR/);

  // Hash mismatch
  const parsedM = JSON.parse(mBuf.toString('utf8'));
  parsedM.targets.push({ collection: 'billing', id: 'bill_2', docSha256: 'B'.repeat(64) });
  const tamperedM = Buffer.from(JSON.stringify(parsedM), 'utf8');
  assert.throws(() => verifyManifest(tamperedM, vb.fileHash, vb.payloadHash), /MANIFEST_HASH_MISMATCH/);

  // Identity mismatch
  assert.throws(() => verifyManifest(mBuf, 'F'.repeat(64), vb.payloadHash), /MANIFEST_IDENTITY_MISMATCH/);
});

// ==========================================================================
// TEST 6: Stale manifest rejection (> 7 days old)
// ==========================================================================
test('TC-06: Stale manifest rejection (> 7 days old)', function() {
  const bBuf = makeBackupBuffer({});
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const mBuf = makeManifest(bBuf, [], { generatedAt: eightDaysAgo });
  const vb = verifyBackup(bBuf);
  assert.throws(() => verifyManifest(mBuf, vb.fileHash, vb.payloadHash), /MANIFEST_STALE/);
});

// ==========================================================================
// TEST 7: Unexpected collection rejection
// ==========================================================================
test('TC-07: Unexpected collection rejection (collections outside allowlist)', function() {
  const entry = { collection: 'unknownCollection', id: 'doc_1', docSha256: 'A'.repeat(64) };
  const res = validateTargetEntry(entry, 0);
  assert.strictEqual(res.valid, false);
  assert(res.reason.includes('not in allowlist'));
});

// ==========================================================================
// TEST 8: Duplicate target rejection
// ==========================================================================
test('TC-08: Duplicate target rejection', function() {
  const bill = makeDoc('bill_1', { id: 1, accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1', operationId: 'op_1' });
  const rcpt = makeDoc('rcpt_1', { billingFirestoreId: 'bill_1', billingId: 1, reservationDocId: 'res_1', operationId: 'op_1', source: 'billing' });
  const res  = makeDoc('res_1',  { seqNumber: 1, billDocId: 'bill_1', receiptDocId: 'rcpt_1', operationId: 'op_1' });
  const op   = makeDoc('op_1',   { resDocId: 'res_1', billDocId: 'bill_1', operationId: 'op_1' });

  const bBuf = makeBackupBuffer({
    collections: { billing: [bill], receipts: [rcpt] },
    reservations: [res],
    idempotency: [op]
  });

  const targets = [
    { collection: 'billing', id: 'bill_1', docSha256: docSha(bill) },
    { collection: 'billing', id: 'bill_1', docSha256: docSha(bill) }, // dup
    { collection: 'receipts', id: 'rcpt_1', docSha256: docSha(rcpt) },
    { collection: 'system', id: 'res_1', docSha256: docSha(res) },
    { collection: 'system', id: 'op_1', docSha256: docSha(op) }
  ];

  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);
  assert.strictEqual(plan.isEligible, false, 'Duplicate target must make plan ineligible');
  assert(plan.rejectedEntries.some(r => r.reason.includes('DUPLICATE_TARGET')));
});

// ==========================================================================
// TEST 9: Incorrect document fingerprint rejection
// ==========================================================================
test('TC-09: Incorrect document fingerprint rejection (tampered hash)', function() {
  const bill = makeDoc('bill_1', { id: 1, accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1', operationId: 'op_1' });
  const rcpt = makeDoc('rcpt_1', { billingFirestoreId: 'bill_1', billingId: 1, reservationDocId: 'res_1', operationId: 'op_1', source: 'billing' });
  const res  = makeDoc('res_1',  { seqNumber: 1, billDocId: 'bill_1', receiptDocId: 'rcpt_1', operationId: 'op_1' });
  const op   = makeDoc('op_1',   { resDocId: 'res_1', billDocId: 'bill_1', operationId: 'op_1' });

  const bBuf = makeBackupBuffer({
    collections: { billing: [bill], receipts: [rcpt] },
    reservations: [res],
    idempotency: [op]
  });

  const targets = [
    { collection: 'billing', id: 'bill_1', docSha256: 'F'.repeat(64) }, // tampered hash
    { collection: 'receipts', id: 'rcpt_1', docSha256: docSha(rcpt) },
    { collection: 'system', id: 'res_1', docSha256: docSha(res) },
    { collection: 'system', id: 'op_1', docSha256: docSha(op) }
  ];

  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);
  assert.strictEqual(plan.isEligible, false);
  assert(plan.fingerprintErrors.some(f => f.reason.includes('FINGERPRINT_MISMATCH')));
});

// ==========================================================================
// TEST 10: Broken cluster error on non-exception records
// ==========================================================================
test('TC-10: Broken billing cluster on non-exception records is blocked', function() {
  const bill = makeDoc('bill_50', { id: 50, accountingReceiptId: 'rcpt_50', reservationDocId: 'res_50', operationId: 'op_50' });
  // receipt omitted
  const res  = makeDoc('res_50',  { seqNumber: 50, billDocId: 'bill_50', receiptDocId: 'rcpt_50', operationId: 'op_50' });
  const op   = makeDoc('op_50',   { resDocId: 'res_50', billDocId: 'bill_50', operationId: 'op_50' });

  const bBuf = makeBackupBuffer({
    collections: { billing: [bill] },
    reservations: [res],
    idempotency: [op]
  });

  const targets = [
    { collection: 'billing', id: 'bill_50', docSha256: docSha(bill) },
    { collection: 'system', id: 'res_50', docSha256: docSha(res) },
    { collection: 'system', id: 'op_50', docSha256: docSha(op) }
  ];

  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);
  assert.strictEqual(plan.isEligible, false);
  assert(plan.linkageErrors.some(e => e.includes('Broken Cluster')));
});

// ==========================================================================
// TEST 11: Preservation of physical receipts
// ==========================================================================
test('TC-11: Physical receipts in targets are strictly blocked', function() {
  const entry = { collection: 'receipts', id: 'rcpt_phys_101', docSha256: 'A'.repeat(64) };
  const res = validateTargetEntry(entry, 0);
  assert.strictEqual(res.valid, false);
  assert(res.reason.includes('physical receipt - protected'));

  const sysEntry = { collection: 'system', id: 'res_phys_101', docSha256: 'A'.repeat(64) };
  const sysRes = validateTargetEntry(sysEntry, 0);
  assert.strictEqual(sysRes.valid, false);
  assert(sysRes.reason.includes('physical tracking record - protected'));
});

// ==========================================================================
// TEST 12: Preservation of master data and counters
// ==========================================================================
test('TC-12: Master data collections and system counters in targets are blocked', function() {
  const masterCols = ['settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts', 'chittyMembers'];
  for (const mc of masterCols) {
    const entry = { collection: mc, id: 'test_doc', docSha256: 'A'.repeat(64) };
    const res = validateTargetEntry(entry, 0);
    assert.strictEqual(res.valid, false);
    assert(res.reason.includes('protected master data'));
  }

  const counterEntry = { collection: 'system', id: 'counters', docSha256: 'A'.repeat(64) };
  const cRes = validateTargetEntry(counterEntry, 0);
  assert.strictEqual(cRes.valid, false);
  assert(cRes.reason.includes('protected system metadata'));
});

// ==========================================================================
// TEST 13: Malformed target IDs quarantined
// ==========================================================================
test('TC-13: Path traversal and malformed target IDs rejected', function() {
  const bad = ['../escape', 'bill/1', 'res_\x00bad', 'res_abc'];
  for (const b of bad) {
    const entry = { collection: 'system', id: b, docSha256: 'A'.repeat(64) };
    const res = validateTargetEntry(entry, 0);
    assert.strictEqual(res.valid, false);
  }
});

// ==========================================================================
// TEST 14: All deletion methods unconditionally locked
// ==========================================================================
test('TC-14: All deletion methods unconditionally throw EXECUTE_MODE_DISABLED', function() {
  const stubs = [execute, executeCleanup, performLiveDeletion, executeBatchedDeletions, deleteDocument];
  for (const stub of stubs) {
    let threw = false;
    let errCode = '';
    try { stub(); } catch (e) {
      threw = true;
      errCode = e.code;
      assert.strictEqual(e.deletionsPerformed, 0);
      assert.strictEqual(e.mutationsPerformed, 0);
    }
    assert(threw, stub.name + ' must throw');
    assert.strictEqual(errCode, 'EXECUTE_MODE_DISABLED');
  }
});

// ==========================================================================
// TEST 15: Zero live database/Firebase SDK imports
// ==========================================================================
test('TC-15: Zero network requests, zero live Firebase/Admin SDK imports in cleanup script', function() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'step_33_155_candidate_cleanup.js');
  const code = fs.readFileSync(scriptPath, 'utf8');

  const forbidden = [
    'firebase-admin', 'firebase/app', 'firebase/firestore', '@google-cloud/firestore',
    'require("http")', "require('http')", 'require("https")', "require('https')",
    'require("net")', "require('net')", 'require("dgram")', "require('dgram')"
  ];

  for (const f of forbidden) {
    assert(!code.includes(f), 'Candidate cleanup script must not include: ' + f);
  }
});

// ==========================================================================
// TEST 16: Protected files remain strictly identical to baseline hashes
// ==========================================================================
test('TC-16: Baseline and input artifact hashes match 100%', function() {
  const baselines = {
    'Temple_Accounts-1.html': '45297BD26B59C69E1E9242BDA32AC0D866862268EF7B00DD437686688355BE98',
    'firestore.rules': '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
    'scripts/transactional_reset_orchestrator.js': 'DB924F7C7189C1223C634F09009306A3314852EF6CE294B9A4D94B56E57533A7',
    'scripts/one_time_transaction_cleanup.js': 'AF8B5BA29149B9F04F30E789E9FCDC7641DFEBA032815F8B481087E2426C479D',
    'plans/step_33_153_cleanup_manifest.json': '221E8A7F452A2B7BD6FB213086691BEE57B20420B014A5C100FE73AC4C9563D3',
    'plans/step_33_153_cleanup_plan.json': '7EE3D2B3A08B2E491B7DE8DEAE235DC88EB0F6F8ABAE820325ED81205087D2C1',
    'plans/step_33_154_reconciliation_report.md': 'CF8B9564528B2489FD52C02488E7F63BB9F707A84A0417B570511E8DD0987465'
  };

  for (const [relPath, expHash] of Object.entries(baselines)) {
    const fullPath = path.join(__dirname, '..', relPath);
    assert(fs.existsSync(fullPath), 'Missing protected file: ' + relPath);
    const compHash = computeFileSha256(fs.readFileSync(fullPath));
    assert.strictEqual(compHash, expHash, 'Hash mismatch for ' + relPath);
  }

  // Authoritative backup file
  const bPath = 'D:\\Download\\Temple_Accounts_Backup_2026-10-20T06-17-45.json';
  assert(fs.existsSync(bPath), 'Authoritative backup must exist');
  const bHash = computeFileSha256(fs.readFileSync(bPath));
  assert.strictEqual(bHash, '2EDC31B88FFC799350F6CA22B3F9531336F616D7F7EA8BB7790E9E5C31F15738');
});

// ---- Summary ----
console.log('');
console.log('='.repeat(60));
console.log('STEP 33.155 Synthetic Test Suite Summary');
console.log('  Total tests run : ' + (passed + failed));
console.log('  Passed          : ' + passed);
console.log('  Failed          : ' + failed);
console.log('='.repeat(60));
if (failed > 0) {
  console.error('FAILED TESTS:');
  for (const t of failedTests) console.error('  * ' + t.name + ': ' + t.error);
  process.exit(1);
}
console.log('ALL 16 SYNTHETIC TESTS PASSED');
process.exit(0);
