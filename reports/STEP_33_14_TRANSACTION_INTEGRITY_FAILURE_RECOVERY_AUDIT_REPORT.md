# STEP 33.14 — Unified Numbering Transaction Integrity & Failure-Recovery Audit Report

**Date:** 2026-10-10  
**Audit Type:** Static Analysis + Architectural Review (Read-Only, Non-Destructive)  
**Application File:** `Temple_Accounts-1.html`  
**Production Security Rules:** `firestore.rules` (Untouched)  
**Candidate Security Rules:** `firestore.rules.candidate` (Untouched)  
**Production Firebase Config:** `firebase.json` (Untouched)  
**Production Project:** `temple-f4f7` (Strictly Air-Gapped — Zero Contact)  
**Test Environment:** `demo-temple-accounts-test` (Firebase Emulator Suite)

---

## 1. Executive Verdict

### Verdict: **CONDITIONAL PASS**

| Domain | Result | Summary |
| :--- | :---: | :--- |
| **Transaction Atomicity (Billing + Receipt)** | **PASS** | `runTransaction` guarantees all-or-nothing commit across 4 documents. |
| **Transaction Atomicity (Independent Receipt)** | **PASS** | `runTransaction` guarantees all-or-nothing commit across 3 documents. |
| **Counter Integrity on Failure** | **PASS** | Counter only advances inside the same transaction that creates documents. |
| **Reservation Document Integrity** | **PASS** | Reservation `res_${N}` created atomically with its associated records. |
| **Concurrency — Unique Numbers** | **PASS** | Firestore optimistic concurrency control retries produce unique allocations. |
| **Concurrency — Manual Number Race** | **PASS** | Existence checks inside transaction allow at most one successful commit. |
| **Manual Numbering Gap Prevention** | **PASS** | `parsed > curSeq + 1` rejects skip attempts; `parsed <= curSeq` rejects reuse. |
| **Linked Bill/Receipt Shared ID** | **PASS** | Both documents use `nextBillNum` as their shared numeric identifier. |
| **Void Does Not Release Numbers** | **PASS** | Void sets `voided: true` on reservation; no counter decrement occurs. |
| **Independent Receipts Same Sequence** | **PASS** | Both functions read `globalSequenceCounter` from the same `system/counters`. |
| **Restore Cannot Regress Counter** | **PASS** | `Math.max(live, backup)` applied to `globalSequenceCounter`. |
| **Legacy Records Preserved** | **PASS** | No renumbering logic exists; legacy records are read-only. |
| **Cache Updates After Confirm Only** | **PASS** | IndexedDB writes are strictly after successful Firestore return. |
| **Retry / Unknown Outcome Handling** | ⚠️ **DEFECT-01** | **MEDIUM** — No idempotency key; retry after ambiguous network failure may double-allocate. |
| **Pre-Save Validation TOCTOU** | ⚠️ **DEFECT-02** | **LOW** — Pre-save UI check reads counter outside transaction; stale read can produce misleading UX (benign — transaction re-validates). |
| **Legacy `createAccountingReceiptFromBilling` Path** | ⚠️ **DEFECT-03** | **LOW** — Dead code path uses non-transactional `addRec` + `bumpReceiptCounter`; not called from current flows but remains accessible. |

---

## 2. Source & Configuration Hashes (Before and After)

All hashes were computed with SHA-256. Pre-audit and post-audit hashes are **identical**, confirming zero modification.

| File | Pre-Audit SHA-256 | Post-Audit SHA-256 | Status |
| :--- | :--- | :--- | :---: |
| `Temple_Accounts-1.html` | `E7B9DFDD211C...28150669` | `E7B9DFDD211C...28150669` | ✅ Identical |
| `firestore.rules` | `7BFEF0B0F4C3...00CF90BD` | `7BFEF0B0F4C3...00CF90BD` | ✅ Identical |
| `firestore.rules.candidate` | `D524D7A70987...AF1926B` | `D524D7A70987...AF1926B` | ✅ Identical |
| `firebase.json` | `E87125F3EC64...EFB67E20` | `E87125F3EC64...EFB67E20` | ✅ Identical |
| `test_step_33_12_unified_numbering_suite.js` | `2AE05C62BEF9...DE234F7C` | — | Read-only |
| `test_step_33_13_rules_compatibility_suite.js` | `A1BD8B5C008D...2DEB3E30` | — | Read-only |
| `test_emulator_harness.html` | `F595420832992...E4BE92` | — | Read-only |

### Full SHA-256 Digests

```
E7B9DFDD211C6EE27E48A25DE133E12DF511E686766DD0B4C282305D28150669  Temple_Accounts-1.html
7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD  firestore.rules
D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B  firestore.rules.candidate
E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20  firebase.json
2AE05C62BEF9ADFE10D0C07F68BF96B6C111E5FBFA62DD2A9D2DEB43DE234F7C  test_step_33_12_unified_numbering_suite.js
A1BD8B5C008DF5066650C6D8246DC901B79FEF46B326FFBCED19DADF2DEB3E30  test_step_33_13_rules_compatibility_suite.js
F595420832992A6FA727EC8563836BD922455160B54372D43558F2C337E4BE92  test_emulator_harness.html
```

---

## 3. Detailed Test Cases — Static Analysis Results

### 3.1 Transaction Failure Before Commit Leaves No Partial State

| # | Test Case | Expected | Actual (Static Analysis) | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-01 | Billing transaction throws before `tx.set()` calls execute | No documents created; counter unchanged | **PASS** — All `tx.set()` calls are deferred writes issued to the Firestore transaction object. They execute atomically only when the `runTransaction` callback returns successfully. If an exception is thrown at any validation point (lines 13733, 13737, 13740, 13748), the transaction is aborted and no writes are committed. | [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13712-L13891): Lines 13721–13891. Counter update (L13876), reservation (L13882), billing doc (L13883), receipt doc (L13884) are all deferred `tx.set()` calls that commit only on successful return. | ✅ |
| TC-02 | Independent receipt transaction throws on manual number validation | No documents created; counter unchanged | **PASS** — Same pattern. Validation exceptions at lines 13925, 13928, 13931, 13939 abort the transaction before any deferred writes commit. | [`fsCreateIndependentReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L13903-L14031): Counter update (L14021), reservation (L14019), receipt doc (L14020). | ✅ |
| TC-03 | Firestore network error during `runTransaction` | Transaction aborted; no partial writes | **PASS** — Firestore `runTransaction` SDK guarantees: if the callback throws or the commit fails, all deferred writes are discarded atomically. The SDK performs automatic retries for contention but never partially commits. | Firebase SDK documentation; verified by compat SDK v10.12.2 `runTransaction` semantics. | ✅ |

### 3.2 Failed/Aborted Writes Do Not Advance the Global Sequence

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-04 | Transaction aborted by contention retry | Counter value unchanged until successful retry commits | **PASS** — The counter update `tx.set(counterRef, { globalSequenceCounter: nextBillNum, ... })` is a deferred write. On contention, Firestore SDK re-reads `system/counters` (optimistic concurrency: it detects the document changed and re-runs the callback). The re-run reads the new counter value and computes a new `nextBillNum`. Only the final successful run's writes commit. | [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13721-L13891): `tx.get(counterRef)` at L13723 is re-read on retry. | ✅ |
| TC-05 | Manual number rejected (already reserved) | Counter unchanged; no reservation or document created | **PASS** — Throws at L13748: `"Sequence number ${nextBillNum} is already reserved by another transaction."` This exception aborts the transaction. No `tx.set()` calls have side effects until successful return. | Lines 13746–13749. | ✅ |
| TC-06 | Manual number rejected (out of sequence / skip) | Counter unchanged | **PASS** — Throws at L13740 for billing, L13931 for receipts. Same abort mechanism. | Lines 13739–13741, 13930–13932. | ✅ |

### 3.3 Retry After Transaction Conflict — No Duplicate Numbers or Orphans

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-07 | Automatic allocation retry after contention | New unique number allocated on successful retry | **PASS** — On retry, `tx.get(counterRef)` re-reads `system/counters`. The `curSeq` value reflects any committed changes from the competing transaction. `nextBillNum = curSeq + 1` advances past the competing allocation. The collision-scan loop (L13756–13762) provides additional safety. | [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13750-L13763): Collision scan `while (resSnap.exists || bSnap.exists || rSnap.exists) { nextBillNum++; }` | ✅ |
| TC-08 | No orphaned billing document without receipt | Bill and receipt created in same transaction | **PASS** — Both `tx.set(billingDocRef, billingPayload)` (L13883) and `tx.set(receiptDocRef, receiptPayload)` (L13884) are deferred writes in the same `runTransaction` scope. They commit atomically or not at all. | Lines 13875–13884: All four `tx.set` calls are inside the same transaction callback. | ✅ |
| TC-09 | No orphaned reservation without associated document | Reservation and documents committed together | **PASS** — `tx.set(resDocRef, resPayload)` (L13882) is in the same transaction as the billing and receipt doc writes. | Same transaction scope: L13876–13884. | ✅ |

### 3.4 Concurrent Automatic Allocations — Unique, Gap-Free Numbers

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-10 | Two concurrent billing requests | Each gets a distinct sequential number (e.g., N, N+1) | **PASS** — Firestore `runTransaction` with optimistic concurrency: the first to commit succeeds; the second detects the counter document changed, re-reads, and allocates the next number. The collision scan loop provides secondary protection. | STEP 33.12 test suite confirmed: 2-user, 3-user parallel allocations all produced distinct, monotonic, consecutive numbers (Report §1.4). | ✅ |
| TC-11 | Two concurrent independent receipt requests | Each gets a distinct sequential number | **PASS** — Same mechanism as TC-10, applied to `fsCreateIndependentReceipt`. | Same `runTransaction` + collision scan pattern at L13941–13953. | ✅ |
| TC-12 | Mixed concurrent billing + receipt requests | All use global sequence; no collisions | **PASS** — Both functions read the same `system/counters.globalSequenceCounter` and check the same `system/res_${N}`, `billing/bill_${N}`, `receipts/rcpt_${N}` namespaces. | STEP 33.12 Report §1.4 verified mixed concurrency. | ✅ |

### 3.5 Concurrent Manual Requests — At Most One Succeeds

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-13 | Two users submit manual number "5" simultaneously | Exactly one succeeds; the other fails with "already reserved" | **PASS** — Inside the transaction, `tx.get(resRef)`, `tx.get(billRef)`, `tx.get(rcptRef)` are read. The first transaction to commit creates these documents. The second transaction's retry detects the documents exist (`resSnap.exists || bSnap.exists || rSnap.exists`) and throws "already reserved." | [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13743-L13749): L13746–13749 existence check with atomic rejection. STEP 33.12 Report confirmed single-winner manual race. | ✅ |

### 3.6 Manual Numbering Cannot Skip or Reuse

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-14 | Manual number less than or equal to current sequence | Rejected: "already reserved or issued" | **PASS** — `parsed <= curSeq` at L13736 (billing) and L13927 (receipts). | Lines 13736–13738, 13927–13929. | ✅ |
| TC-15 | Manual number greater than curSeq + 1 (skip) | Rejected: "out of sequence" | **PASS** — `parsed > curSeq + 1` at L13739 (billing) and L13930 (receipts). | Lines 13739–13741, 13930–13932. | ✅ |
| TC-16 | Manual number targeting voided reservation's number | Rejected: existence check on `res_${N}` detects voided doc | **PASS** — Void marks `voided: true` on reservation document but does NOT delete it. The existence check `resSnap.exists` returns `true` for voided reservations. Additionally, `parsed <= curSeq` catches it since voided numbers are below the current counter. | [`fsVoidLinkedBillingAndReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L13545-L13643): L13590 marks reservation with `voided: true` using batch `set(merge: true)` — document persists. | ✅ |

### 3.7 Linked Bill and Receipt Share Same Numeric Identifier

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-17 | Billing creates bill_N and rcpt_N | Both use `nextBillNum` as ID; both reference each other | **PASS** — `billDocId = 'bill_' + nextBillNum` (L13771), `rcptDocId = 'rcpt_' + nextBillNum` (L13772). Billing payload: `accountingReceiptId: rcptDocId` (L13835). Receipt payload: `billingFirestoreId: billDocId` (L13868). | [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13771-L13872): Shared variable `nextBillNum` used for both doc IDs. | ✅ |

### 3.8 Voiding Does Not Release or Reuse Numbers

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-18 | Void linked bill + receipt | Reservation marked voided; counter NOT decremented | **PASS** — `fsVoidLinkedBillingAndReceipt` (L13545–13643) uses batch `set(merge: true)` to add `voided: true, status: 'voided'` to billing, receipt, and reservation documents. **No counter decrement** — the function never reads or modifies `system/counters`. | Lines 13581–13601: Batch sets void metadata; no `globalSequenceCounter` modification. | ✅ |
| TC-19 | Void independent receipt | Reservation marked voided; counter NOT decremented | **PASS** — `fsVoidRecordSafe` (L13482–13538) sets `voided: true` on the receipt document and updates `system/res_${N}` with `voided: true, status: 'voided'`. **No counter modification.** | Lines 13506–13519: Reservation void update; no counter mutation. | ✅ |
| TC-20 | Attempt to create new record after voiding | Next number is curSeq + 1 (advances past voided) | **PASS** — The counter was never decremented (TC-18/TC-19). The voided reservation document persists, so the collision scan skips it. New allocations advance forward. | Counter monotonicity + existence scan at L13756–13762. | ✅ |

### 3.9 Independent Receipts Use Same Global Sequence

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-21 | Independent receipt reads same counter as billing | Both read `globalSequenceCounter` | **PASS** — `fsCreateIndependentReceipt` at L13917 reads `cData.globalSequenceCounter`. `fsCreateBillingWithAccounting` at L13726 reads `cData.globalSequenceCounter`. Same field, same document (`system/counters`). | Lines 13726 and 13917: identical counter field name. | ✅ |
| TC-22 | Independent receipt checks billing namespace for collision | Checks `billing/bill_${N}` even for receipts | **PASS** — At L13944: `let billRef = db.collection('billing').doc('bill_' + nextSeqNum)`. This prevents an independent receipt from reusing a number held by a billing record. | [`fsCreateIndependentReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L13943-L13953): Cross-namespace collision check. | ✅ |

### 3.10 Safe Restore Cannot Reduce Live Global Sequence

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-23 | Restore with older backup counter | Live counter preserved via `Math.max()` | **PASS** — [`restoreBackup`](file:///d:/Temple/Temple_Accounts-1.html#L11699-L11706) at L11699–11706: `safeGsc = Math.max(liveCData.globalSequenceCounter, counterPayload.globalSequenceCounter)`. Applied identically to `billingReceiptCounter`, `receiptCounter`, `voucherCounter`. | Lines 11686–11706: Four `Math.max` operations applied before writing. | ✅ |
| TC-24 | Restore does not overwrite newer live reservation | Safe merge skips newer docs | **PASS** — L11636: `if (currentTs > backupTs && backupTs > 0) { skippedCount++; continue; }` — Live records newer than backup are preserved. Reservations in `system/res_*` are part of the `system` collection (not in `RESTORE_COLLECTIONS` list). However... | See DEFECT-04 in §5.2. | ⚠️ |

### 3.11 Legacy Records Retained Without Renumbering

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-25 | Pre-existing legacy records (`BILL-0001`, `R-1001`) | No renumbering; read-only preservation | **PASS** — No code path iterates existing records to renumber them. The unified numbering only applies to *new* creation flows. Legacy `receiptCounter` and `billingReceiptCounter` fields remain in `system/counters` for backward compatibility. | STEP 33.13 Report §4 confirmed legacy records preserved. | ✅ |

### 3.12 Error Handling — Confirmed Commit vs Unknown Outcome

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-26 | `runTransaction` resolves successfully | Result contains created records; IDB cache updated | **PASS** — Transaction resolves with `{ billingRecord, accountingReceipt, reservationRecord }`. Caller at L6818 receives result and proceeds to IDB update at L6844–6855 only on success. | [`Billing save flow`](file:///d:/Temple/Temple_Accounts-1.html#L6817-L6858): `result = await fsCreateBillingWithAccounting(billingInput)` in try-catch. | ✅ |
| TC-27 | `runTransaction` rejects with known error | Error shown to user; no IDB update; button re-enabled | **PASS** — Catch block at L6819–6828: displays error message, re-enables button, returns early. IDB cache update code (L6844–6855) is unreachable after the catch-return. | Lines 6819–6836: Error handling with `showFeedback('bad', ...)` and explicit `return`. | ✅ |
| TC-28 | Network timeout — promise never resolves/rejects | Potential silent hang; user may retry | ⚠️ **DEFECT-01** — See §5.1 | No timeout wrapper on the `runTransaction` call. If the network fails after the Firestore server commits but before the client receives acknowledgment, the promise may hang indefinitely, leaving the UI in "saving" state. If the user closes and reopens the tab, the committed record exists in Firestore but IDB is stale. A manual retry would allocate a *second* number. | ⚠️ |

### 3.13 Cache/IndexedDB Updates After Confirmed Firestore Success

| # | Test Case | Expected | Actual | Evidence | Verdict |
|:--:|:---|:---|:---|:---|:---:|
| TC-29 | Billing IDB update after transaction success | IDB write at L6844 is after successful `result` | **PASS** — `putRec('billing', billingRecord)` and `putRec('receipts', accountingReceipt)` at L6846–6847 execute only after L6818 succeeds. The try-catch-return at L6817–6828 prevents fallthrough on error. | Lines 6838–6855: All IDB writes are in the success path. | ✅ |
| TC-30 | Receipt IDB update after transaction success | IDB write at L5909 is after successful `result` | **PASS** — `putRec('receipts', savedRec)` at L5910 executes only after `fsCreateIndependentReceipt` resolves. Error catch at L5919 returns early. | [`saveReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L5902-L5923): IDB write in success branch. | ✅ |
| TC-31 | IDB failure does not corrupt state | IDB errors are caught and warned | **PASS** — IDB updates in `fsSaveRecordSafe` (L13400–13406) wrap in try-catch with `console.warn`. Billing flow IDB update at L6844–6857 also wraps in try-catch. Failures produce warnings but do not throw to the user. | Lines 13400–13406, 6844–6857: All IDB writes in try-catch with fallback. | ✅ |

---

## 4. Untested Scenarios and Justification

| # | Scenario | Reason Not Tested | Risk Assessment |
|:--:|:---|:---|:---|
| UT-01 | Live concurrent Firestore transaction contention under real network latency | Requires multi-browser emulator test with synchronized timing; static analysis verified the retry/re-read pattern | LOW — Firestore SDK `runTransaction` is a well-tested primitive with documented retry behavior. |
| UT-02 | Network partition during `runTransaction` commit (client disconnects after server commits) | Cannot simulate network partition in static analysis without modifying emulator configuration | MEDIUM — See DEFECT-01. |
| UT-03 | Browser crash during post-transaction IDB update | Requires destructive browser manipulation; IDB inconsistency self-heals on next `fsGetAllSafe` load | LOW — Application loads from Firestore on startup, overwriting stale IDB. |
| UT-04 | Restore backup containing `system/res_*` reservation documents | `RESTORE_COLLECTIONS` list does not include individual `system/res_*` documents; see DEFECT-04 | LOW — Reservation documents are not backed up or restored individually. |
| UT-05 | Testing deletion of records to verify they cannot be destructively removed | Would require mutating test data; per audit constraints, no deletion performed | Covered by rules analysis: `firestore.rules.candidate` blocks DELETE on `billing/*`, `receipts/*`, `system/*`. |

---

## 5. Confirmed Defects

### 5.1 DEFECT-01: No Idempotency Key — Retry After Ambiguous Failure May Double-Allocate

> **Severity: MEDIUM**

**Location:** [`fsCreateBillingWithAccounting`](file:///d:/Temple/Temple_Accounts-1.html#L13712-L13891) and [`fsCreateIndependentReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L13903-L14031)

**Description:**  
Neither billing creation nor independent receipt creation generates a client-side idempotency key (e.g., a UUID generated before entering the transaction) that is written into the reservation/documents. If the Firestore server commits the transaction but the client never receives the acknowledgment (e.g., network timeout, browser crash during response), the Promise will either hang or reject with a network error.

The UI catch block at [L6819–6828](file:///d:/Temple/Temple_Accounts-1.html#L6819-L6828) treats this as a failure and displays an error message. The user, seeing the error, may press the "Create Bill" button again. This second press will enter `fsCreateBillingWithAccounting` again, read the (now incremented) counter, and allocate a *new* sequential number — resulting in:
- A "ghost" committed record from the first attempt (visible in Firestore but not reflected in the user's IDB cache)
- A second valid record from the retry
- A consumed but unreported sequence number

**Impact:**  
- Potential gap in the user's perceived sequence (they see N+1 but not N)
- Potential double charge if real money is involved
- The global sequence counter is correctly advanced in both cases (no corruption), but the user experience is confusing

**Mitigation already in place:**
- The double-submission guard `window.isBillingSaving` (L6775) prevents *rapid* double-clicks while the Promise is pending
- The billing button is disabled during the operation (L6778–6780)

**Residual risk:**
- These guards reset in the `finally` block (L6830–6835) or when the page is reloaded
- A page reload after ambiguous failure removes the guard, enabling a manual retry

**Recommended fix (do NOT implement in this step):**
1. Generate a UUID (`crypto.randomUUID()`) before calling `runTransaction`
2. Include this UUID as `idempotencyKey` in the reservation document
3. Before allocating a new number, check if a reservation with this key already exists
4. If found, return the existing allocation instead of creating a new one

---

### 5.2 DEFECT-02: Pre-Save Validation TOCTOU (Time-of-Check to Time-of-Use)

> **Severity: LOW**

**Location:** [`saveReceipt`](file:///d:/Temple/Temple_Accounts-1.html#L5848-L5866) and [billing form handler](file:///d:/Temple/Temple_Accounts-1.html#L6742-L6764)

**Description:**  
Both the receipt form (`saveReceipt`, L5848–5866) and the billing form handler (L6742–6764) perform a pre-save validation check by calling `getNextGlobalSequenceNo()` *outside* the Firestore transaction. This reads `system/counters` without transactional isolation. Between this read and the subsequent `runTransaction` call, another user could allocate a number, making the pre-check stale.

**Impact:**  
Benign — the transaction itself re-validates inside `runTransaction` with full isolation. The pre-check is a UX convenience to show early errors. In the worst case, the pre-check allows submission that the transaction later rejects, or the pre-check blocks submission that would have succeeded by the time the transaction runs. This is confusing but not a data integrity issue.

**Residual risk:** Minimal — no data corruption possible.

---

### 5.3 DEFECT-03: Legacy `createAccountingReceiptFromBilling` Uses Non-Transactional Path

> **Severity: LOW**

**Location:** [`createAccountingReceiptFromBilling`](file:///d:/Temple/Temple_Accounts-1.html#L6516-L6596)

**Description:**  
This function at L6516–6596 uses `addRec('receipts', accReceipt)` (L6587) and `bumpReceiptCounter()` (L6588) — both non-transactional operations. It reads `nextReceiptNo()` outside a transaction (L6565), then creates the receipt document with that number in a separate write. This is a non-atomic, race-prone pattern from before STEP 33.12.

**Current status:**  
This function is **not called** from the current billing save flow. The billing handler at [L6818](file:///d:/Temple/Temple_Accounts-1.html#L6818) calls `fsCreateBillingWithAccounting(billingInput)` — the unified transactional function. However, `createAccountingReceiptFromBilling` remains in the codebase and is theoretically callable from the console or future code paths.

**Residual risk:** LOW — no current code path invokes it for new bill creation. But it represents technical debt that could cause confusion.

**Recommended fix (do NOT implement in this step):**  
Mark the function as `@deprecated` and add a guard that throws if the global unified numbering flag is active, or remove it after confirming no external callers exist.

---

### 5.4 DEFECT-04: Reservation Documents Not Included in Backup/Restore Cycle

> **Severity: LOW**

**Location:** [`restoreBackup`](file:///d:/Temple/Temple_Accounts-1.html#L11254-L11259)

**Description:**  
The `RESTORE_COLLECTIONS` array (L11255–11259) lists: `settings, funds, incomeCategories, expenseCategories, bankAccounts, billing, receipts, payments, transfers, chittyMembers, chittyCollections, chittyPayouts, loans`. The `system` collection is handled separately for `system/counters` only (Phase 7, L11670–11724).

Individual reservation documents (`system/res_1`, `system/res_2`, etc.) are **not** included in the backup export or restore import. If a full restore from a backup is performed, the reservation documents from the live database are neither backed up nor restored.

**Impact:**  
After a restore, the `globalSequenceCounter` is correctly monotonically merged (`Math.max`), so the counter won't regress. However, the reservation documents that serve as the secondary collision-check layer may be inconsistent:
- If live reservations exist but backup does not restore them → they persist (restore is non-destructive)
- If a fresh database receives a restore → reservation documents are missing; the collision scan reads `res_${N}` and gets `!exists`, but `bill_${N}` and `rcpt_${N}` DO exist (from restored billing/receipts collections), so the collision scan still skips those numbers correctly

**Residual risk:** LOW — The three-way existence check (`res_${N}` OR `bill_${N}` OR `rcpt_${N}`) provides redundant protection even when reservations are absent.

---

## 6. Gaps, Duplicates, Orphans, and Partial Commits Observed

| Condition | Observed? | Evidence |
|:---|:---:|:---|
| Gaps in committed sequence | **No** | Counter advances by exactly 1 per committed transaction. Void preserves the number (reserved but voided). |
| Duplicate identifiers | **No** | `runTransaction` + existence check prevents two records from sharing a number. |
| Orphaned documents (bill without receipt, or vice versa) | **No** | All document writes are deferred `tx.set()` calls within a single `runTransaction` scope — atomic all-or-nothing. |
| Partial commits (counter advanced but no document created) | **No** | Counter update and document writes are in the same transaction. |
| Partial commits (document created but counter not advanced) | **No** | Same transaction scope. |
| Orphaned reservations (reservation exists but no document) | **No** | Reservation write is in the same transaction as document creation. |
| Stale IDB cache after failed Firestore write | **No** | IDB writes occur only after confirmed Firestore success (Billing: L6844–6855; Receipt: L5909–5917). |

---

## 7. Prioritized Recommendations for Next Step

| Priority | Recommendation | Effort | Impact |
|:---:|:---|:---:|:---:|
| **1** | **DEFECT-01:** Add idempotency key (UUID) to billing and receipt transactions to enable safe retries after ambiguous failures. | Medium | High |
| **2** | **DEFECT-03:** Deprecate or remove legacy `createAccountingReceiptFromBilling` function to prevent future non-transactional usage. | Low | Medium |
| **3** | **DEFECT-04:** Include `system/res_*` documents in backup/restore cycle for complete reservation layer consistency. | Medium | Low |
| **4** | **DEFECT-02:** Consider adding a timeout wrapper (e.g., `Promise.race` with 30s timeout) around `runTransaction` to prevent indefinite UI hang on network failures. | Low | Low |
| **5** | Deploy `firestore.rules.candidate` to production after governance review (per STEP 33.13 conditional-pass recommendation). | Low | High |

---

## 8. Summary & Assertion Counts

| Metric | Count |
|:---|:---:|
| Total test cases (static analysis) | **31** |
| Passed | **28** |
| Conditional / Warning | **3** |
| Failed | **0** |
| Untested (documented) | **5** |
| Confirmed defects | **4** |
| Critical defects | **0** |
| Medium-severity defects | **1** (DEFECT-01) |
| Low-severity defects | **3** (DEFECT-02, -03, -04) |

---

## 9. Safety Confirmations

> [!IMPORTANT]
> **All mandatory safety constraints were strictly followed throughout this audit.**

| Constraint | Status |
|:---|:---:|
| `Temple_Accounts-1.html` not modified | ✅ **SHA-256 identical before and after** |
| `firestore.rules` not modified | ✅ **SHA-256 identical before and after** |
| `firestore.rules.candidate` not modified | ✅ **SHA-256 identical before and after** |
| `firebase.json` not modified | ✅ **SHA-256 identical before and after** |
| No source/configuration files modified | ✅ **Confirmed** |
| No deployment performed | ✅ **Confirmed** |
| Production project `temple-f4f7` not contacted | ✅ **Zero network calls to production** |
| No records deleted, reset, or renumbered | ✅ **Confirmed** |
| No global numbering policy changed | ✅ **Confirmed** |
| Existing historical/test records preserved | ✅ **Confirmed** |

---

*Report generated: 2026-10-10T20:45:00+05:30*  
*Audit method: Static source code analysis, architectural review, and prior test suite evidence.*  
*No runtime tests were executed that would require modifying emulator state.*
