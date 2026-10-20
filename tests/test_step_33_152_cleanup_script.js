/**
 * STEP 33.152 Synthetic In-Memory Test Suite
 * Location: tests/test_step_33_152_cleanup_script.js
 *
 * Covers all 18 requirements defined in STEP 33.152 Phase 5:
 *  1. Valid backup and manifest.
 *  2. Modified backup rejection.
 *  3. Modified manifest rejection.
 *  4. Stale manifest rejection.
 *  5. Unexpected collection rejection.
 *  6. Duplicate target rejection.
 *  7. Incorrect document fingerprint rejection.
 *  8. Broken billing-to-receipt links.
 *  9. Orphaned reservations and idempotency records.
 * 10. Correct classification of payments, transfers, loans, chitty collections, and payouts using actual schemas.
 * 11. Preservation of physical receipts and their linked records.
 * 12. Preservation of master data and counters.
 * 13. Unknown and malformed records quarantined.
 * 14. Migration staging records with nested subcollections block cleanup eligibility.
 * 15. Interrupted planning or journal-state detection.
 * 16. All deletion methods remain locked.
 * 17. No network requests and no live Firebase imports.
 * 18. No modifications to protected files.
 *
 * Zero network, zero Firebase SDK, zero live Firestore access.
 * In-memory synthetic fixtures only.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  canonicalJsonStringify, computeSha256, computeFileSha256, computeBackupPayloadHash,
  SCRIPT_VERSION, MANIFEST_SCHEMA_VERSION, MANIFEST_MAX_AGE_MS,
  REQUIRED_BACKUP_COLLECTIONS, DOCUMENTED_BACKUP_EXCLUSIONS, PROTECTED_COLLECTIONS,
  PROTECTED_SYSTEM_DOCS, ELIGIBLE_COLLECTION_ALLOWLIST, COLLECTION_ID_PATTERNS,
  verifyBackup, verifyManifest, validateTargetEntry, verifyDocumentFingerprint,
  verifyLinkedRecords, buildDeletionPlan, produceReviewReport, serializeDeletionPlan,
  execute, executeCleanup, performLiveDeletion, executeBatchedDeletions, deleteDocument
} = require('../scripts/one_time_transaction_cleanup.js');

// ---- Test Harness Helpers ----
let passed = 0, failed = 0;
const failedTests = [];
function test(name, fn) {
  try {
    fn();
    console.log('[PASS] ' + name);
    passed++;
  } catch (e) {
    console.error('[FAIL] ' + name + ': ' + e.message);
    failed++;
    failedTests.push({ name, error: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertThrows(fn, codeOrSubstr) {
  let threw = false; let errMsg = '';
  try { fn(); } catch (e) { threw = true; errMsg = e.message + (e.code ? ' code=' + e.code : ''); }
  assert(threw, 'Expected function to throw but it did not');
  if (codeOrSubstr) assert(errMsg.includes(codeOrSubstr), 'Expected error containing "' + codeOrSubstr + '" but got: ' + errMsg);
}

// ---- Fixture Builders ----
function makeDoc(id, extra) {
  return Object.assign({ _firestoreId: id }, extra || {});
}
function docSha(doc) {
  return computeSha256(canonicalJsonStringify(doc));
}
function makeBackupPayload(overrides) {
  const base = {
    collections: {
      bankAccounts: [], billing: [], chittyCollections: [], chittyMembers: [],
      chittyPayouts: [], expenseCategories: [], funds: [], incomeCategories: [],
      loans: [], payments: [], receipts: [], settings: [], transfers: []
    },
    counters: null, idempotency: [], reservations: [], system: {}
  };
  if (overrides) {
    if (overrides.collections) Object.assign(base.collections, overrides.collections);
    for (const k of ['counters', 'idempotency', 'reservations', 'system']) {
      if (overrides[k] !== undefined) base[k] = overrides[k];
    }
  }
  return base;
}
function makeBackupObj(payloadOverrides, metaOverrides) {
  const payload = makeBackupPayload(payloadOverrides);
  const hash = computeBackupPayloadHash(payload);
  const meta = Object.assign({
    source: 'firestore',
    exportedAt: new Date().toISOString(),
    backupVersion: '4',
    schemaVersion: '23.2',
    integrity: { hash, algorithm: 'SHA-256' }
  }, metaOverrides || {});
  return { metadata: meta, ...payload };
}
function makeBackupBuffer(payloadOverrides, metaOverrides) {
  return Buffer.from(JSON.stringify(makeBackupObj(payloadOverrides, metaOverrides)), 'utf8');
}
function makeManifest(backupBuf, targets, overrides) {
  const vb = verifyBackup(backupBuf);
  const tgts = targets || [];
  const payload = {
    backupFileHash: vb.fileHash,
    backupPayloadHash: vb.payloadHash,
    generatedAt: new Date().toISOString(),
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    targets: tgts
  };
  const manifestHash = computeSha256(canonicalJsonStringify(payload));
  const manifest = { ...payload, manifestHash };
  if (overrides) Object.assign(manifest, overrides);
  return Buffer.from(JSON.stringify(manifest), 'utf8');
}

// ==========================================================================
// TEST 1: Valid backup and manifest
// ==========================================================================
test('TC-01: Valid backup and manifest produces eligible plan and review report', function() {
  const member = makeDoc('cm_1', { name: 'Member 1', phone: '9999999999' });
  const bill   = makeDoc('bill_1', { id: 1, accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1', operationId: 'op_1', devoteeName: 'Devotee A' });
  const rcpt   = makeDoc('rcpt_1', { billingFirestoreId: 'bill_1', billingId: 1, reservationDocId: 'res_1', operationId: 'op_1', source: 'billing' });
  const res    = makeDoc('res_1',  { seqNumber: 1, billDocId: 'bill_1', receiptDocId: 'rcpt_1', operationId: 'op_1' });
  const op     = makeDoc('op_1',   { resDocId: 'res_1', billDocId: 'bill_1', operationId: 'op_1' });
  const pmt    = makeDoc('pmt_1',  { amount: 500, fund: 'General', voucherNo: 'V101' });
  const tx     = makeDoc('tx_1',   { amount: 1000, fromAccount: 'acc1', toAccount: 'acc2' });
  const loan   = makeDoc('loan_1', { devoteeName: 'Devotee A', amount: 5000, loanNo: 'L01' });
  const cc     = makeDoc('cc_1',   { memberId: 'cm_1', amount: 1000, month: '2026-01' });
  const cp     = makeDoc('cp_1',   { memberId: 'cm_1', payoutAmount: 25000, auctionMonth: 5 });

  const bBuf = makeBackupBuffer({
    collections: {
      chittyMembers: [member],
      billing: [bill],
      receipts: [rcpt],
      payments: [pmt],
      transfers: [tx],
      loans: [loan],
      chittyCollections: [cc],
      chittyPayouts: [cp]
    },
    reservations: [res],
    idempotency: [op]
  });

  const targets = [
    { collection: 'billing', id: 'bill_1', docSha256: docSha(bill) },
    { collection: 'receipts', id: 'rcpt_1', docSha256: docSha(rcpt) },
    { collection: 'system', id: 'res_1', docSha256: docSha(res) },
    { collection: 'system', id: 'op_1', docSha256: docSha(op) },
    { collection: 'payments', id: 'pmt_1', docSha256: docSha(pmt) },
    { collection: 'transfers', id: 'tx_1', docSha256: docSha(tx) },
    { collection: 'loans', id: 'loan_1', docSha256: docSha(loan) },
    { collection: 'chittyCollections', id: 'cc_1', docSha256: docSha(cc) },
    { collection: 'chittyPayouts', id: 'cp_1', docSha256: docSha(cp) }
  ];

  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === true, 'Valid backup and manifest should produce isEligible === true');
  assert(plan.acceptedTargets.length === 9, 'All 9 targets should be accepted');
  assert(plan.rejectedEntries.length === 0, 'No entries should be rejected');
  assert(plan.fingerprintErrors.length === 0, 'Zero fingerprint errors expected');
  assert(plan.linkageErrors.length === 0, 'Zero linkage errors expected');

  const report = produceReviewReport(plan);
  assert(typeof report === 'string' && report.includes('TEMPLE ACCOUNTS ONE-TIME CLEANUP REVIEW REPORT'), 'Report generated');
  const serialized = serializeDeletionPlan(plan);
  assert(typeof serialized === 'object' && serialized.schemaVersion === MANIFEST_SCHEMA_VERSION, 'Serialized plan matches schema');
});

// ==========================================================================
// TEST 2: Modified backup rejection
// ==========================================================================
test('TC-02: Modified backup rejection (non-buffer, source mismatch, payload tamper, coverage error, byte tamper)', function() {
  assertThrows(() => verifyBackup('not a buffer'), 'BACKUP_VERIFICATION_ERROR');
  assertThrows(() => verifyBackup(makeBackupBuffer({}, { source: 'local' })), 'BACKUP_SCHEMA_ERROR');

  // Payload tampering without recomputing integrity hash
  const obj = makeBackupObj();
  obj.collections.payments = [{ _firestoreId: 'pmt_injected', amount: 9999 }];
  assertThrows(() => verifyBackup(Buffer.from(JSON.stringify(obj), 'utf8')), 'BACKUP_INTEGRITY_MISMATCH');

  // Missing required collection
  const bBuf = makeBackupBuffer();
  const obj2 = JSON.parse(bBuf.toString('utf8'));
  delete obj2.collections.billing;
  obj2.metadata.integrity.hash = computeBackupPayloadHash(obj2);
  assertThrows(() => verifyBackup(Buffer.from(JSON.stringify(obj2), 'utf8')), 'BACKUP_COVERAGE_ERROR');

  // Byte tampering with expected file hash check
  const bValid = makeBackupBuffer();
  const vb = verifyBackup(bValid);
  const tamperedBuf = Buffer.from(bValid);
  tamperedBuf[tamperedBuf.length - 1] = 32; // append space / change byte
  assertThrows(() => verifyBackup(tamperedBuf, { expectedFileHash: vb.fileHash }), 'BACKUP_FILE_HASH_MISMATCH');
});

// ==========================================================================
// TEST 3: Modified manifest rejection
// ==========================================================================
test('TC-03: Modified manifest rejection (schema version, hash mismatch, identity mismatch, missing fields)', function() {
  const bBuf = makeBackupBuffer();
  const vb = verifyBackup(bBuf);
  const mBuf = makeManifest(bBuf, []);

  // Wrong schemaVersion
  const mObj1 = JSON.parse(mBuf.toString('utf8'));
  mObj1.schemaVersion = '99.0';
  assertThrows(() => verifyManifest(Buffer.from(JSON.stringify(mObj1), 'utf8'), vb.fileHash, vb.payloadHash), 'MANIFEST_SCHEMA_VERSION_ERROR');

  // Tampered manifestHash
  const mObj2 = JSON.parse(mBuf.toString('utf8'));
  mObj2.manifestHash = 'F'.repeat(64);
  assertThrows(() => verifyManifest(Buffer.from(JSON.stringify(mObj2), 'utf8'), vb.fileHash, vb.payloadHash), 'MANIFEST_HASH_MISMATCH');

  // Mismatched backup identity
  assertThrows(() => verifyManifest(mBuf, 'A'.repeat(64), vb.payloadHash), 'MANIFEST_IDENTITY_MISMATCH');
  assertThrows(() => verifyManifest(mBuf, vb.fileHash, 'B'.repeat(64)), 'MANIFEST_IDENTITY_MISMATCH');

  // Missing required field
  const mObj3 = JSON.parse(mBuf.toString('utf8'));
  delete mObj3.targets;
  assertThrows(() => verifyManifest(Buffer.from(JSON.stringify(mObj3), 'utf8'), vb.fileHash, vb.payloadHash), 'MANIFEST_SCHEMA_ERROR');
});

// ==========================================================================
// TEST 4: Stale manifest rejection
// ==========================================================================
test('TC-04: Stale manifest rejection (> 7 days old)', function() {
  const bBuf = makeBackupBuffer();
  const vb = verifyBackup(bBuf);
  const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    backupFileHash: vb.fileHash,
    backupPayloadHash: vb.payloadHash,
    generatedAt: staleDate,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    targets: []
  };
  const mHash = computeSha256(canonicalJsonStringify(payload));
  const mBuf = Buffer.from(JSON.stringify({ ...payload, manifestHash: mHash }), 'utf8');
  assertThrows(() => verifyManifest(mBuf, vb.fileHash, vb.payloadHash), 'MANIFEST_STALE');
});

// ==========================================================================
// TEST 5: Unexpected collection rejection
// ==========================================================================
test('TC-05: Unexpected collection rejection (collections outside allowlist)', function() {
  const sha = 'e'.repeat(64);
  const unexpected = ['roles', 'admin_users', 'audit_logs', 'sessions', 'temporary_data'];
  for (const col of unexpected) {
    const res = validateTargetEntry({ collection: col, id: 'doc_1', docSha256: sha }, 0);
    assert(!res.valid, 'Unexpected collection ' + col + ' must be rejected');
    assert(res.reason.includes('not in allowlist'), 'Reason must mention allowlist');
  }

  // Manifest containing unexpected collection is quarantined in plan.rejectedEntries
  const bBuf = makeBackupBuffer();
  const vb = verifyBackup(bBuf);
  const mBuf = makeManifest(bBuf, [{ collection: 'admin_roles', id: 'role_1', docSha256: sha }]);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);
  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === false, 'Plan with unexpected collection must not be eligible');
  assert(plan.rejectedEntries.length === 1, 'Unexpected collection should be in rejectedEntries');
});

// ==========================================================================
// TEST 6: Duplicate target rejection
// ==========================================================================
test('TC-06: Duplicate target rejection (duplicate entries in manifest)', function() {
  const doc = makeDoc('pay_1', { amount: 100 });
  const sha = docSha(doc);
  const bBuf = makeBackupBuffer({ collections: { payments: [doc] } });
  const target = { collection: 'payments', id: 'pay_1', docSha256: sha };
  const mBuf = makeManifest(bBuf, [target, target]);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === false, 'Plan with duplicates must not be eligible');
  assert(plan.rejectedEntries.length === 1, 'Duplicate target must be in rejectedEntries');
  assert(plan.rejectedEntries[0].reason.includes('DUPLICATE_TARGET'), 'Reason must specify DUPLICATE_TARGET');
});

// ==========================================================================
// TEST 7: Incorrect document fingerprint rejection
// ==========================================================================
test('TC-07: Incorrect document fingerprint rejection (tampered hash & missing doc)', function() {
  const doc = makeDoc('pmt_1', { amount: 200, fund: 'General' });
  const bBuf = makeBackupBuffer({ collections: { payments: [doc] } });
  const wrongSha = computeSha256(canonicalJsonStringify({ _firestoreId: 'pmt_1', amount: 999 }));

  // Fingerprint mismatch
  const mBuf1 = makeManifest(bBuf, [{ collection: 'payments', id: 'pmt_1', docSha256: wrongSha }]);
  const vb = verifyBackup(bBuf);
  const vm1 = verifyManifest(mBuf1, vb.fileHash, vb.payloadHash);
  const plan1 = buildDeletionPlan(vb, vm1);
  assert(typeof plan1.isEligible === 'boolean', 'plan1.isEligible must be boolean');
  assert(plan1.isEligible === false, 'Mismatched fingerprint must make plan ineligible');
  assert(plan1.fingerprintErrors.length === 1, 'Should record fingerprint error');
  assert(plan1.fingerprintErrors[0].reason.includes('FINGERPRINT_MISMATCH'), 'Reason must be FINGERPRINT_MISMATCH');

  // Missing doc from backup
  const mBuf2 = makeManifest(bBuf, [{ collection: 'payments', id: 'pmt_9999', docSha256: wrongSha }]);
  const vm2 = verifyManifest(mBuf2, vb.fileHash, vb.payloadHash);
  const plan2 = buildDeletionPlan(vb, vm2);
  assert(typeof plan2.isEligible === 'boolean', 'plan2.isEligible must be boolean');
  assert(plan2.isEligible === false, 'Missing document must make plan ineligible');
  assert(plan2.fingerprintErrors.some(e => e.reason.includes('DOCUMENT_NOT_IN_BACKUP')), 'Reason must state DOCUMENT_NOT_IN_BACKUP');
});

// ==========================================================================
// TEST 8: Broken billing-to-receipt links
// ==========================================================================
test('TC-08: Broken billing-to-receipt links (omitted receipt, conflicting reciprocal, sequence mismatch)', function() {
  const rcpt = makeDoc('rcpt_1', { billingFirestoreId: 'bill_1', billingId: 1, reservationDocId: 'res_1', operationId: 'op_1', source: 'billing' });
  const bill = makeDoc('bill_1', { id: 1, accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1', operationId: 'op_1', devoteeName: 'Devotee A' });
  const res  = makeDoc('res_1',  { seqNumber: 1, billDocId: 'bill_1', receiptDocId: 'rcpt_1', operationId: 'op_1' });
  const op   = makeDoc('op_1',   { resDocId: 'res_1', billDocId: 'bill_1', operationId: 'op_1' });

  const bBuf = makeBackupBuffer({
    collections: { billing: [bill], receipts: [rcpt] },
    reservations: [res],
    idempotency: [op]
  });

  // Broken cluster: bill included, but receipt omitted from manifest
  const mBuf = makeManifest(bBuf, [
    { collection: 'billing', id: 'bill_1', docSha256: docSha(bill) },
    { collection: 'system', id: 'res_1', docSha256: docSha(res) },
    { collection: 'system', id: 'op_1', docSha256: docSha(op) }
  ]);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === false, 'Plan with broken billing cluster must not be eligible');
  assert(plan.linkageErrors.some(e => e.includes('Broken Cluster') && e.includes('rcpt_1')), 'Error must mention Broken Cluster for rcpt_1');

  // Reciprocal conflict: receipt links to bill_2, but bill_1 links to receipt
  const rcptBad = makeDoc('rcpt_1', { billingFirestoreId: 'bill_2', billingId: 2, source: 'billing' });
  const rEdges = verifyLinkedRecords(
    [{ collection: 'billing', id: 'bill_1' }, { collection: 'receipts', id: 'rcpt_1' }],
    { collections: { billing: [bill], receipts: [rcptBad] } }
  );
  assert(rEdges.errors.some(e => e.includes('Conflicting Reciprocal')), 'Should detect conflicting reciprocal');
});

// ==========================================================================
// TEST 9: Orphaned reservations and idempotency records
// ==========================================================================
test('TC-09: Orphaned reservations and idempotency records', function() {
  const res = makeDoc('res_42', { seqNumber: 42, billDocId: 'bill_42', receiptDocId: 'rcpt_42', operationId: 'op_42' });
  const op  = makeDoc('op_42',  { resDocId: 'res_42', billDocId: 'bill_42', operationId: 'op_42' });

  // Reservation targeted without bill or receipt
  const lr1 = verifyLinkedRecords(
    [{ collection: 'system', id: 'res_42' }],
    { reservations: [res], idempotency: [op], collections: {} }
  );
  assert(lr1.errors.some(e => e.includes('Orphaned Res')), 'Orphaned reservation without targets flagged');

  // Idempotency targeted without reservation
  const lr2 = verifyLinkedRecords(
    [{ collection: 'system', id: 'op_42' }],
    { reservations: [res], idempotency: [op], collections: {} }
  );
  assert(lr2.errors.some(e => e.includes('Stale Op')), 'Stale op without reservation in targets flagged');
});

// ==========================================================================
// TEST 10: Correct classification of payments, transfers, loans, chitty collections, and payouts
// ==========================================================================
test('TC-10: Correct classification of payments, transfers, loans, chitty collections, and payouts', function() {
  const member = makeDoc('cm_10', { name: 'Member 10', phone: '1234567890' });
  const pmt  = makeDoc('pmt_10',  { amount: 1500, fund: 'General', voucherNo: 'V10' });
  const tx   = makeDoc('tx_10',   { amount: 2000, fromAccount: 'acc1', toAccount: 'acc2' });
  const loan = makeDoc('loan_10', { devoteeName: 'Devotee B', amount: 8000, loanNo: 'L10' });
  const cc   = makeDoc('cc_10',   { memberId: 'cm_10', amount: 1000, month: '2026-02' });
  const cp   = makeDoc('cp_10',   { memberId: 'cm_10', payoutAmount: 18000, auctionMonth: 2 });

  const bBuf = makeBackupBuffer({
    collections: {
      chittyMembers: [member],
      payments: [pmt],
      transfers: [tx],
      loans: [loan],
      chittyCollections: [cc],
      chittyPayouts: [cp]
    }
  });

  const targets = [
    { collection: 'payments', id: 'pmt_10', docSha256: docSha(pmt) },
    { collection: 'transfers', id: 'tx_10', docSha256: docSha(tx) },
    { collection: 'loans', id: 'loan_10', docSha256: docSha(loan) },
    { collection: 'chittyCollections', id: 'cc_10', docSha256: docSha(cc) },
    { collection: 'chittyPayouts', id: 'cp_10', docSha256: docSha(cp) }
  ];

  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === true, 'All financial sub-ledger records should be eligible');
  const stage2 = plan.topologicalBatches.find(b => b.stage === 2);
  assert(stage2 && stage2.name === 'Sub-Ledger Financial', 'Stage 2 must be Sub-Ledger Financial');
  assert(stage2.records.length === 5, 'All 5 financial records must be classified in Stage 2');

  // Verify missing member link causes Broken Ref error
  const ccBroken = makeDoc('cc_99', { memberId: 'cm_nonexistent', amount: 500 });
  const lrBroken = verifyLinkedRecords(
    [{ collection: 'chittyCollections', id: 'cc_99' }],
    { collections: { chittyCollections: [ccBroken], chittyMembers: [member] } }
  );
  assert(lrBroken.errors.some(e => e.includes('Broken Ref')), 'Broken chitty member reference detected');
});

// ==========================================================================
// TEST 11: Preservation of physical receipts and their linked records
// ==========================================================================
test('TC-11: Preservation of physical receipts and their linked records (rcpt_phys_*, physical reservations & ops)', function() {
  const sha = 'a'.repeat(64);
  // Pattern rejections in validateTargetEntry
  assert(!validateTargetEntry({ collection: 'receipts', id: 'rcpt_phys_001', docSha256: sha }, 0).valid, 'rcpt_phys_* rejected');
  assert(!validateTargetEntry({ collection: 'system', id: 'res_phys_001', docSha256: sha }, 0).valid, 'res_phys_* rejected');
  assert(!validateTargetEntry({ collection: 'system', id: 'op_phys_001', docSha256: sha }, 0).valid, 'op_phys_* rejected');

  // Rejection of physical receipt attributes in verifyLinkedRecords
  const physRcpt1 = makeDoc('rcpt_100', { source: 'physical', receiptNo: 'P100' });
  const physRcpt2 = makeDoc('rcpt_101', { isPhysical: true });
  const physRcpt3 = makeDoc('rcpt_102', { physicalType: 'manual' });
  const lrPhys = verifyLinkedRecords(
    [{ collection: 'receipts', id: 'rcpt_100' }, { collection: 'receipts', id: 'rcpt_101' }, { collection: 'receipts', id: 'rcpt_102' }],
    { collections: { receipts: [physRcpt1, physRcpt2, physRcpt3] } }
  );
  assert(lrPhys.errors.length === 3, 'All 3 physical receipts flagged as protected');
  assert(lrPhys.errors.every(e => e.includes('PHYSICAL_RECEIPT_PROTECTED')), 'Errors must specify PHYSICAL_RECEIPT_PROTECTED');
});

// ==========================================================================
// TEST 12: Preservation of master data and counters
// ==========================================================================
test('TC-12: Preservation of master data and counters', function() {
  const sha = 'b'.repeat(64);
  for (const col of PROTECTED_COLLECTIONS) {
    const res = validateTargetEntry({ collection: col, id: 'master_1', docSha256: sha }, 0);
    assert(!res.valid, 'Protected master data collection ' + col + ' must be rejected');
    assert(res.reason.includes('protected master data'), 'Reason must specify protected master data');
  }

  // System counters
  for (const docId of PROTECTED_SYSTEM_DOCS) {
    const res = validateTargetEntry({ collection: 'system', id: docId, docSha256: sha }, 0);
    assert(!res.valid, 'Protected system doc ' + docId + ' must be rejected');
    assert(res.reason.includes('protected system metadata'), 'Reason must specify protected system metadata');
  }
});

// ==========================================================================
// TEST 13: Unknown and malformed records quarantined
// ==========================================================================
test('TC-13: Unknown and malformed records quarantined (path traversal, null bytes, wrong prefixes, invalid hash)', function() {
  const sha = 'c'.repeat(64);
  assert(!validateTargetEntry({ collection: 'payments', id: 'pmt_../evil', docSha256: sha }, 0).valid, 'Path traversal must be rejected');
  assert(!validateTargetEntry({ collection: 'payments', id: 'pay_1\x00null', docSha256: sha }, 0).valid, 'Null byte must be rejected');
  assert(!validateTargetEntry({ collection: 'payments', id: 'wrong_prefix_99', docSha256: sha }, 0).valid, 'Wrong prefix for payments must be rejected');
  assert(!validateTargetEntry({ collection: 'billing', id: 'rcpt_1', docSha256: sha }, 0).valid, 'Wrong prefix for billing must be rejected');
  assert(!validateTargetEntry({ collection: 'transfers', id: 'loan_abc', docSha256: sha }, 0).valid, 'loan_ prefix for transfers must be rejected');
  assert(!validateTargetEntry({ collection: 'payments', id: 'pmt_1', docSha256: 'short' }, 0).valid, 'Short sha must be rejected');
  assert(!validateTargetEntry(null, 0).valid, 'Null entry must be rejected');
  assert(!validateTargetEntry('string', 0).valid, 'String entry must be rejected');

  // Valid patterns must pass
  assert(validateTargetEntry({ collection: 'billing', id: 'bill_7', docSha256: sha }, 0).valid, 'bill_7 should be valid');
  assert(validateTargetEntry({ collection: 'loans', id: 'loan_xyz-123', docSha256: sha }, 0).valid, 'loan_xyz-123 should be valid');
  assert(validateTargetEntry({ collection: 'transfers', id: 'tx_abc-def', docSha256: sha }, 0).valid, 'tx_abc-def should be valid');
  assert(validateTargetEntry({ collection: 'chittyCollections', id: 'cc_m01-2024', docSha256: sha }, 0).valid, 'cc_m01-2024 should be valid');
  assert(validateTargetEntry({ collection: 'chittyPayouts', id: 'cp_m01-2024', docSha256: sha }, 0).valid, 'cp_m01-2024 should be valid');
});

// ==========================================================================
// TEST 14: Migration staging records with nested subcollections block cleanup eligibility
// ==========================================================================
test('TC-14: Migration staging records with nested subcollections block cleanup eligibility', function() {
  const st1 = makeDoc('stage_1', { hasSubcollections: true });
  const st2 = makeDoc('stage_2', { storesCount: 5 });
  const st3 = makeDoc('stage_3', { storeWriteResults: { batch1: 'ok' } });
  const stFlat = makeDoc('stage_clean', { status: 'COMPLETE', storesCount: 0 });

  const lr = verifyLinkedRecords(
    [
      { collection: 'migration_staging', id: 'stage_1' },
      { collection: 'migration_staging', id: 'stage_2' },
      { collection: 'migration_staging', id: 'stage_3' },
      { collection: 'migration_staging', id: 'stage_clean' }
    ],
    { collections: { migration_staging: [st1, st2, st3, stFlat] } }
  );

  assert(lr.errors.length === 3, 'All 3 nested staging docs must be blocked');
  assert(lr.errors.every(e => e.includes('Nested Subcollection Block')), 'Error must state Nested Subcollection Block');
});

// ==========================================================================
// TEST 15: Interrupted planning or journal-state detection
// ==========================================================================
test('TC-15: Interrupted planning or journal-state detection (_resetJournal status & maintenance lock)', function() {
  const bill = makeDoc('bill_1', { id: 1, accountingReceiptId: 'rcpt_1', reservationDocId: 'res_1', operationId: 'op_1' });
  const rcpt = makeDoc('rcpt_1', { billingFirestoreId: 'bill_1', billingId: 1, reservationDocId: 'res_1', operationId: 'op_1', source: 'billing' });
  const res  = makeDoc('res_1',  { seqNumber: 1, billDocId: 'bill_1', receiptDocId: 'rcpt_1', operationId: 'op_1' });
  const op   = makeDoc('op_1',   { resDocId: 'res_1', billDocId: 'bill_1', operationId: 'op_1' });

  // Backup contains interrupted durable reset journal
  const interruptedJournal = {
    _firestoreId: '_resetJournal',
    status: 'INTERRUPTED',
    currentStage: 3,
    error: 'Simulated prior failure'
  };
  const bBuf = makeBackupBuffer({
    collections: { billing: [bill], receipts: [rcpt] },
    reservations: [res],
    idempotency: [op],
    system: { _resetJournal: interruptedJournal }
  });

  const targets = [
    { collection: 'billing', id: 'bill_1', docSha256: docSha(bill) },
    { collection: 'receipts', id: 'rcpt_1', docSha256: docSha(rcpt) },
    { collection: 'system', id: 'res_1', docSha256: docSha(res) },
    { collection: 'system', id: 'op_1', docSha256: docSha(op) }
  ];
  const mBuf = makeManifest(bBuf, targets);
  const vb = verifyBackup(bBuf);
  const vm = verifyManifest(mBuf, vb.fileHash, vb.payloadHash);
  const plan = buildDeletionPlan(vb, vm);

  assert(typeof plan.isEligible === 'boolean', 'plan.isEligible must be a boolean');
  assert(plan.isEligible === false, 'Interrupted journal must make plan ineligible');
  assert(plan.linkageErrors.some(e => e.includes('INTERRUPTED_JOURNAL_DETECTED')), 'Error must specify INTERRUPTED_JOURNAL_DETECTED');
});

// ==========================================================================
// TEST 16: All deletion methods remain locked
// ==========================================================================
test('TC-16: All deletion methods unconditionally throw EXECUTE_MODE_DISABLED', function() {
  const stubs = [execute, executeCleanup, performLiveDeletion, executeBatchedDeletions, deleteDocument];
  for (const stub of stubs) {
    let threw = false;
    let errCode = '';
    let errMsg = '';
    try { stub(); } catch (e) {
      threw = true;
      errCode = e.code;
      errMsg = e.message;
      assert(e.deletionsPerformed === 0, 'deletionsPerformed must be 0');
      assert(e.mutationsPerformed === 0, 'mutationsPerformed must be 0');
    }
    assert(threw, stub.name + ' must throw');
    assert(errCode === 'EXECUTE_MODE_DISABLED', stub.name + ' must have code EXECUTE_MODE_DISABLED');
    assert(errMsg.includes('EXECUTE_MODE_DISABLED'), stub.name + ' message must contain EXECUTE_MODE_DISABLED');
  }
});

// ==========================================================================
// TEST 17: No network requests and no live Firebase imports
// ==========================================================================
test('TC-17: Zero network requests, zero live Firebase/Admin SDK imports in cleanup script', function() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'one_time_transaction_cleanup.js');
  const code = fs.readFileSync(scriptPath, 'utf8');

  const forbiddenImports = [
    'firebase-admin',
    'firebase/app',
    'firebase/firestore',
    '@google-cloud/firestore',
    'require("http")',
    "require('http')",
    'require("https")',
    "require('https')",
    'require("net")',
    "require('net')",
    'require("dgram")',
    "require('dgram')"
  ];

  for (const fi of forbiddenImports) {
    assert(!code.includes(fi), 'Cleanup script must not include: ' + fi);
  }
});

// ==========================================================================
// TEST 18: No modifications to protected files
// ==========================================================================
test('TC-18: Protected files remain strictly identical to baseline hashes', function() {
  const baselines = {
    'Temple_Accounts-1.html': '45297BD26B59C69E1E9242BDA32AC0D866862268EF7B00DD437686688355BE98',
    'firestore.rules': '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
    'scripts/transactional_reset_orchestrator.js': 'DB924F7C7189C1223C634F09009306A3314852EF6CE294B9A4D94B56E57533A7'
  };

  for (const [relPath, expHash] of Object.entries(baselines)) {
    const fullPath = path.join(__dirname, '..', relPath);
    assert(fs.existsSync(fullPath), 'Protected file missing: ' + relPath);
    const buf = fs.readFileSync(fullPath);
    const compHash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    assert(compHash === expHash, 'Protected file hash mismatch for ' + relPath + ': expected ' + expHash + ', got ' + compHash);
  }
});

// ---- Summary ----
console.log('');
console.log('='.repeat(60));
console.log('STEP 33.152 Synthetic Test Suite Summary');
console.log('  Total tests run : ' + (passed + failed));
console.log('  Passed          : ' + passed);
console.log('  Failed          : ' + failed);
console.log('='.repeat(60));
if (failed > 0) {
  console.error('FAILED TESTS:');
  for (const t of failedTests) console.error('  * ' + t.name + ': ' + t.error);
  process.exit(1);
}
console.log('ALL 18 SYNTHETIC TESTS PASSED');
process.exit(0);
