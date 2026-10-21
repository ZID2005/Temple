# Step 33.171 — Fix Firestore Transaction Read-Before-Write Error for Physical Receipt Deletion Report

**Date:** 2026-10-21  
**Target File:** `Temple_Accounts-1.html`  
**Test Suites:**
- `tests/test_step_33_171_physical_receipt_delete_suite.js` (New comprehensive physical delete test suite)
- `tests/test_step_33_164_billing_receipt_suite.js` (Hardened with strict read-before-write validation)
- `tests/test_step_33_163_voucher_suite.js`
- `tests/test_step_33_166_linked_receipt_suite.js`
- `tests/test_step_33_69_physical_receipts.js`
- `tests/test_step_33_71_physical_receipt_void_consistency.js`
- `tests/test_step_33_72_physical_receipt_validation.js`
- `tests/test_step_33_170_payment_description_mapping_suite.js`

---

## 1. Executive Summary

When attempting to permanently delete a physical receipt (specifically physical Puja receipts in the P-series such as `P600`–`P900` and physical Punarudharanam receipts in the PU-series such as `PU1`), Firestore aborted the deletion transaction with the following fatal error:
```
"Unable to delete receipt: Firestore transactions require all reads to be executed before all writes."
```
Example scenario: Deleting physical receipt `PU1`, dated 21-10-2026, for ₹500 under *Punarudharanam Fund / Donation Income*.

Step 33.171 identified the precise root causes, restructured transaction callbacks to strictly adhere to Firestore's read-before-write invariant, improved identifier resolution for physical receipts, guaranteed complete isolation between physical receipt deletions and software sequence counters (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`), maintained atomic bill/receipt bilateral deletion semantics, and verified all changes with 500 passing assertions across 8 test suites.

---

## 2. Root Cause Analysis

### 2.1 The Firestore Read-Before-Write Invariant
The Google Cloud Firestore transaction specification enforces that within a transaction callback `db.runTransaction(async (tx) => { ... })`:
- All read operations (`tx.get(docRef)`) must be executed **before** any write operations (`tx.set(...)`, `tx.update(...)`, or `tx.delete(...)`).
- As soon as the first write or delete is queued on `tx`, Firestore transitions the transaction into "write-only" mode. Any subsequent call to `tx.get()` throws an immediate exception:
  `"Firestore transactions require all reads to be executed before all writes."`

### 2.2 Violation in `fsDeleteReceiptRecord` (Physical Path)
Prior to Step 33.171, the physical receipt branch of `fsDeleteReceiptRecord` contained the following sequence:
```javascript
// FORMER FLAWED IMPLEMENTATION:
await db.runTransaction(async (tx) => {
  tx.delete(rcptRef);                                    // <--- WRITE QUEUED FIRST!
  const prSnap = await tx.get(physResRef);               // <--- FATAL: tx.get() AFTER tx.delete()!
  if (prSnap.exists) tx.delete(physResRef);
  if (opDocRef) {
    const opSnap = await tx.get(opDocRef);               // <--- FATAL: tx.get() AFTER tx.delete()!
    if (opSnap.exists) tx.delete(opDocRef);
  }
});
```
Because `tx.delete(rcptRef)` was called at line 1 of the transaction callback, the subsequent `await tx.get(physResRef)` threw the error and aborted the transaction every single time a user attempted to delete a physical receipt.

### 2.3 Violation in `fsDeleteBillingRecord` and Software `fsDeleteReceiptRecord`
In the software deletion paths, `tx.delete(billRef)` or `tx.delete(rcptRef)` were queued before querying the collection snapshots (`db.collection('billing').get()`, `db.collection('receipts').get()`, `db.collection('system').get()`) used for sequence recalculation. While collection `.get()` calls operate outside the transaction handle `tx`, mixing interleaved collection reads after transaction write queueing introduced subtle race windows and violated strict transaction staging rules.

### 2.4 Document ID Resolution for Physical Receipts
Physical receipts are stored in Firestore with the document prefix `rcpt_phys_` (e.g., `rcpt_phys_PU1`, `rcpt_phys_P600`). When UI handlers or callers passed raw identifiers (such as `"PU1"` or `"P600"`), the default fallback logic constructed `rcpt_PU1` instead of `rcpt_phys_PU1`, requiring extra fallback lookups or failing if the document was not found under the software receipt prefix.

---

## 3. Code Modifications in `Temple_Accounts-1.html`

### 3.1 Strict Read-Before-Write Ordering in `fsDeleteReceiptRecord`
The physical receipt deletion transaction was completely reorganized into the required 5-stage lifecycle:
1. **Stage 1 (Target Document Read):** `tx.get(rcptRef)`
2. **Stage 2 (Linked Records Read):** `tx.get(physResRef)`, `tx.get(altResRef)` (if different), `tx.get(opDocRef)` (if present)
3. **Stage 3 (Complete All Reads Concurrently):** Executed using `await Promise.all(...)`
4. **Stage 4 (Validation):** Validate receipt document existence, verify that the physical receipt is not mistakenly linked to billing, and ensure deletion eligibility.
5. **Stage 5 (Perform Writes and Deletions):** Queue `tx.delete(rcptRef)`, `tx.delete(physResRef)`, `tx.delete(altResRef)`, and `tx.delete(opDocRef)`.

```javascript
// STEP 33.171 FIXED IMPLEMENTATION:
await db.runTransaction(async (tx) => {
  // 1. Read target receipt document
  // 2. Read linked reservation or operation documents
  // 3. Complete all other necessary transaction reads
  const readPromises = [
    tx.get(rcptRef),
    tx.get(physResRef)
  ];
  if (altResRef) {
    readPromises.push(tx.get(altResRef));
  }
  if (opDocRef) {
    readPromises.push(tx.get(opDocRef));
  }
  const readSnaps = await Promise.all(readPromises);
  const rcptSnap = readSnaps[0];
  const prSnap = readSnaps[1];
  let nextIdx = 2;
  const altResSnap = altResRef ? readSnaps[nextIdx++] : null;
  const opSnap = opDocRef ? readSnaps[nextIdx++] : null;

  // 4. Validate document existence, receipt type, linkage, and deletion eligibility
  if (!rcptSnap.exists) {
    throw new Error(`Receipt record "${rcptDocId}" does not exist in Firestore.`);
  }
  const rSnapData = rcptSnap.data() || {};
  const isLinkedTx = (rSnapData.source === 'billing' || !!rSnapData.billingFirestoreId || !!rSnapData.billingId || !!rSnapData.billingReceiptNo);
  if (isLinkedTx) {
    throw new Error(`Cannot delete receipt "${rcptDocId}" as physical: record is linked to billing.`);
  }

  // 5. Only after all reads are complete, perform the required writes and deletes
  tx.delete(rcptRef);
  if (prSnap && prSnap.exists) {
    tx.delete(physResRef);
  }
  if (altResSnap && altResSnap.exists) {
    tx.delete(altResRef);
  }
  if (opDocRef && opSnap && opSnap.exists) {
    tx.delete(opDocRef);
  }
});
```

### 3.2 Enhanced Physical Identifier Candidate Resolution
Added candidate document resolution using `parsePhysicalReceiptIdentifier`:
```javascript
// If not found directly, check physical candidate ID if identifier matches physical pattern
if (!rcptData && typeof parsePhysicalReceiptIdentifier === 'function') {
  const stripped = String(rcptDocIdOrId).replace(/^rcpt_phys_/, '').replace(/^rcpt_/, '').replace(/^phys_/, '');
  const parsedPhys = parsePhysicalReceiptIdentifier(stripped);
  if (parsedPhys && parsedPhys.valid) {
    const physCandidateRef = db.collection('receipts').doc(`rcpt_phys_${parsedPhys.formattedId}`);
    const physCandidateSnap = await physCandidateRef.get();
    if (physCandidateSnap.exists) {
      rcptData = physCandidateSnap.data();
      rcptRef = physCandidateRef;
      rcptDocId = `rcpt_phys_${parsedPhys.formattedId}`;
    }
  }
}
```

### 3.3 Strict Read-Before-Write Ordering in Software Deletion & Billing Deletion
In `fsDeleteBillingRecord` and the independent software receipt branch of `fsDeleteReceiptRecord`:
- All reads (`tx.get(billRef)`, `tx.get(counterRef)`, `tx.get(rcptRef)`, `tx.get(resRef)`, `tx.get(opRef)`, and collection `.get()` calls) are bundled and awaited via `Promise.all` **before** any `tx.delete(...)` or `tx.set(...)` is executed.
- Trailing number sequence recalculation logic evaluates the read snapshots and only queues `tx.set(counterRef, ...)` at the very end.

### 3.4 Preservation of Physical Receipt Counters & Isolation
- Physical receipt deletion touches **only** `receipts/rcpt_phys_<ID>`, `system/res_phys_<ID>`, and `system/op_phys_<ID>`.
- `system/counters` (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`) is **never** accessed, updated, or decremented during physical receipt deletion.
- Physical receipt numbers are preserved in their isolated manual numbering domain (P600–P900 and PU1+).

### 3.5 Fail-Closed Local Cache & IndexedDB Eviction
- Local cache deletion (`deleteRec('receipts', ...)`) is strictly placed **after** `await db.runTransaction(...)` completes successfully.
- If Firestore transaction aborts or throws an error (e.g., network failure, concurrent conflict, unauthorized access), the local IndexedDB record remains intact, preventing partially deleted or orphaned local states.

### 3.6 Confirmation Modal Messaging
Updated `showDeleteReceiptModal` to distinguish physical receipts from software receipts:
```javascript
${(typeof parsePhysicalReceiptIdentifier === 'function' && parsePhysicalReceiptIdentifier(r.receiptNo)?.valid)
  ? 'This will permanently remove the physical receipt from Cloud Firestore and local storage, restoring balances. Physical receipt numbers are not tracked by software sequence counters.'
  : 'This will permanently remove the record from Cloud Firestore and local storage, restoring balances and enabling safe number reuse if this is the highest allocated number.'}
```

---

## 4. File Verification & Backup Integrity

### 4.1 Authentic Pre-Change Backup
- **Backup File Path:** `d:\Temple\backups\Temple_Accounts-1_PreStep33_171_PhysicalReceiptDelete_Backup_20261021_154000.html`
- **Source:** Exact git HEAD state prior to Step 33.171 (`commit 3634cb9`)
- **Byte Size:** 1,226,178 bytes
- **SHA-256 Hash:** `9E694509C3CE30192AE6FB8545BEDE20CDBE65B01CEF4F590B3412FD651A400E`

### 4.2 Post-Change Main Application File
- **File Path:** `d:\Temple\Temple_Accounts-1.html`
- **Byte Size:** 1,244,413 bytes
- **SHA-256 Hash:** `24BE3B5EBD16239CCC29F93D7A339E20D1CD157FBD6B4781DDA4AF8F04693E0B`
- **Architecture Integrity:** Maintained 100% single-file HTML architecture; no external dependencies introduced; no changes to Firestore security rules.

---

## 5. Test Suite Verification & Execution Results

All tests were executed against local mock environments and an isolated in-memory Firestore engine instrumented with strict **read-after-write detection traps** (throwing `"Firestore transactions require all reads to be executed before all writes"` if any `tx.get()` is invoked after `tx.delete()` or `tx.set()`).

### 5.1 Test Suites Summary

| Test Suite File | Description | Assertions | Passed | Failed | Status |
|---|---|:---:|:---:|:---:|:---:|
| `tests/test_step_33_171_physical_receipt_delete_suite.js` | Dedicated Physical Delete Suite (P & PU series, read-before-write audit, rollback, counter isolation) | 43 | 43 | 0 | **PASSED** |
| `tests/test_step_33_164_billing_receipt_suite.js` | Permanent Deletion, Billing & Receipts, Number Reuse | 51 | 51 | 0 | **PASSED** |
| `tests/test_step_33_163_voucher_suite.js` | Voucher Numbering, Number Reuse & Deletion Suite | 47 | 47 | 0 | **PASSED** |
| `tests/test_step_33_166_linked_receipt_suite.js` | Full Editing of Billing-Linked Receipts with Bidirectional Sync | 66 | 66 | 0 | **PASSED** |
| `tests/test_step_33_69_physical_receipts.js` | Physical Receipts Verification Suite | 70 | 70 | 0 | **PASSED** |
| `tests/test_step_33_71_physical_receipt_void_consistency.js` | Physical Receipt Void Consistency Suite | 71 | 71 | 0 | **PASSED** |
| `tests/test_step_33_72_physical_receipt_validation.js` | Physical Receipt Validation Suite | 75 | 75 | 0 | **PASSED** |
| `tests/test_step_33_170_payment_description_mapping_suite.js` | Payment Description Mapping Suite | 77 | 77 | 0 | **PASSED** |
| **Total** | **Across all 8 test suites** | **500** | **500** | **0** | **100% PASSED** |

### 5.2 Key Verified Test Scenarios

1. **Physical P-Series Deletion (e.g., P600):**
   - Successfully deleted `rcpt_phys_P600`, `res_phys_P600`, and `op_phys_p600`.
   - Verified that 100% of transaction reads occurred before any delete/write.
   - Verified that `globalSequenceCounter`, `billingReceiptCounter`, and `receiptCounter` remained strictly untouched.
2. **Physical PU-Series Deletion (e.g., PU1, ₹500, Punarudharanam Fund / Donation Income):**
   - Successfully resolved raw identifier `"PU1"` to `rcpt_phys_PU1`.
   - Executed transaction with zero read-before-write errors.
   - Cleared Firestore receipt, reservation, and local cache entries.
   - Allowed immediate re-entry of `PU1` without duplicate key collision.
3. **Independent Software Receipt Deletion:**
   - Deleted trailing independent receipt `rcpt_40` and safely decremented `globalSequenceCounter` from 40 to 39 for sequence reuse.
   - Deleted middle receipt `rcpt_38` and verified `globalSequenceCounter` was NOT decremented (gap preserved).
4. **Billing-Linked Receipt Deletion:**
   - Deleting a billing-linked receipt routed to `fsDeleteBillingRecord` and atomically deleted both `bill_39` and `rcpt_39` in a single transaction with read-before-write compliance.
5. **Fail-Closed Rollback:**
   - Simulated transaction abort/failure and verified that the Firestore document and local IndexedDB cache remained intact without data corruption.
6. **Global Transaction Ordering Audit:**
   - Monitored 7 distinct multi-document transactions across the suite; verified 0 read-after-write violations.

---

## 6. Conclusion

The Firestore transaction error `"Firestore transactions require all reads to be executed before all writes"` encountered during physical receipt deletion has been completely resolved. All Firestore transactions across physical receipt deletion, independent software receipt deletion, and billing-linked deletion now strictly perform all document and collection reads prior to queueing any write or delete operations. Physical receipt deletions remain cleanly isolated from software sequence counters, and all regression suites passed with zero failures.
