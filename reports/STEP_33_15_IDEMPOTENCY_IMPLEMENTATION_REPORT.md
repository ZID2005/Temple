# STEP 33.15 — Idempotent Billing & Receipt Transactions with Retry-Safe Number Allocation Report

**Date:** 2026-10-10  
**Target Application:** Temple Accounts & Fund Management System (`d:\Temple\Temple_Accounts-1.html`)  
**Production Rules (Preserved 100% Unchanged):** `firestore.rules`  
**Candidate Hardened Rules (Preserved 100% Unchanged):** `firestore.rules.candidate`  
**Production Firebase Config (Preserved 100% Unchanged):** `firebase.json`  
**Target Test Environment:** Isolated Local Firebase Emulator Suite (`demo-temple-accounts-test`)  
**Overall Executive Verdict:** **PASS**

---

## 1. Executive Verdict & Summary

### Verdict: **PASS**

All requirements, constraints, and test scenarios defined in **STEP 33.15** have been implemented, verified, and proven collision-safe against the isolated Firebase Emulator Suite:

1. **Resolution of DEFECT-01:**
   - Implemented durable, retry-safe client-side operation ID assignment (`generateOperationId`) and financial payload fingerprinting (`computeBillingFingerprint`, `computeReceiptFingerprint`).
   - Operation IDs and fingerprints persist in `localStorage` across timeouts, client-side errors, and full page reloads.
2. **Atomic Firestore Idempotency Verification:**
   - Both `fsCreateBillingWithAccounting` and `fsCreateIndependentReceipt` atomically read the idempotency operation document `system/op_${operationId}` inside the Firestore transaction (`db.runTransaction`) before attempting any number allocation.
   - If `system/op_${operationId}` already exists with matching financial data, the transaction performs zero writes, advances zero counters, allocates zero new documents, and immediately returns the previously committed records (`isIdempotentReplay: true`).
3. **5-Way & 4-Way Atomic Transactional Writing:**
   - On a fresh allocation, `fsCreateBillingWithAccounting` atomically commits 5 documents in a single transaction:
     1. Counter document: `system/counters`
     2. Authoritative reservation: `system/res_${nextBillNum}`
     3. Billing record: `billing/bill_${nextBillNum}`
     4. Linked accounting receipt: `receipts/rcpt_${nextBillNum}`
     5. Idempotency operation record: `system/op_${operationId}`
   - On a fresh independent receipt, `fsCreateIndependentReceipt` atomically commits 4 documents:
     1. Counter document: `system/counters`
     2. Authoritative reservation: `system/res_${nextSeqNum}`
     3. Independent receipt record: `receipts/rcpt_${nextSeqNum}`
     4. Idempotency operation record: `system/op_${operationId}`
4. **Deterministic Lost-Response Recovery:**
   - Verified via deterministic fault injection simulating a successful Cloud Firestore commit followed immediately by a lost client network connection. Retrying with the same operation ID seamlessly recovered `BILL-003` without incrementing the global sequence counter or allocating a duplicate record.
5. **Payload Tampering Protection:**
   - Submitting an existing operation ID with materially altered financial details (e.g., modified amount or devotee name) is strictly rejected with an explicit error: `"Idempotency conflict: Operation ... has already been committed with different financial details"`.
6. **Concurrent Race Protection:**
   - Two parallel requests with identical operation IDs produced exactly one server-side document creation; the competing request resolved cleanly as an idempotent replay returning the identical record identifier.
7. **Strict Production Air-Gap & Zero Rule Mutations:**
   - Zero production Firestore reads or mutations occurred (`temple-f4f7` strictly air-gapped).
   - Candidate security rules `firestore.rules.candidate` and production `firestore.rules` remained 100% unaltered.

---

## 2. Root Cause and Implemented Solution

### 2.1 Root Cause (DEFECT-01)
In previous steps (up to STEP 33.14), `fsCreateBillingWithAccounting` and `fsCreateIndependentReceipt` did not generate or track a client-side idempotency key. If a transaction committed successfully on the Firestore server but the network connection was severed before the client received the HTTP 200 response, the client Promise rejected or timed out. Seeing the error or reloading the page, the operator would re-click "Create Bill", causing a second transaction to allocate a *second* sequential number from `system/counters`. This created a "ghost" committed bill and an unacknowledged gap in the perceived sequence.

### 2.2 Implemented Architectural Solution
1. **Stable Operation ID Lifecycle:**
   - Prior to invoking the transaction, the UI calculates a deterministic financial fingerprint of the form inputs (`category|item|qty|unitPrice|totalAmount|paymentMode|devoteeName|manualBillNo`).
   - If an unconfirmed operation with identical fingerprint exists in `localStorage['temple_pending_billing_op']`, the existing `operationId` is reused.
   - If no pending operation matches, a cryptographically random UUID (`op_bill_${uuid}`) is generated and staged in `localStorage`.
2. **Transaction-Tier Idempotency Gate:**
   - Within `db.runTransaction`, `tx.get(opDocRef)` and `tx.get(counterRef)` are executed simultaneously as the initial reads.
   - If `opSnap.exists`:
     * Verifies `operationType` matches.
     * Verifies `fingerprint` matches incoming payload.
     * Fetches the committed billing, receipt, and reservation documents.
     * Returns the committed result immediately without writing to `system/counters` or creating any new records.
   - If `!opSnap.exists`:
     * Allocates next sequential number (or validates manual number).
     * Atomically stages updates to `system/counters`, `system/res_${N}`, `billing/bill_${N}`, `receipts/rcpt_${N}`, and `system/op_${opId}`.
3. **Post-Commit Confirmation & Cleanup:**
   - Upon successful transaction resolution, `localStorage.removeItem('temple_pending_billing_op')` is invoked, and local IndexedDB cache is updated in place.
   - If an error occurs, the staged pending operation remains in `localStorage` so an immediate retry or a retry after page reload reuses the identical ID.

---

## 3. Exact Functions and Schema Paths Changed

### 3.1 Application File: `Temple_Accounts-1.html`

| Function / Component | Location | Nature of Change |
| :--- | :--- | :--- |
| `generateOperationId(prefix)` | Line 13697 | Generates stable UUID with timestamp/random fallback. |
| `computeBillingFingerprint(input)` | Line 13704 | Canonical string concatenation of non-sensitive financial fields. |
| `computeReceiptFingerprint(input)` | Line 13717 | Canonical string concatenation of non-sensitive receipt fields. |
| `fsReconcilePendingOperation(opId)` | Line 13729 | Reads `system/op_${opId}` and resolves committed records. |
| `fsCreateBillingWithAccounting` | Lines 13768–13945 | Added `tx.get(opDocRef)` check, idempotent replay short-circuit, and atomic `system/op_${opId}` write. |
| `fsCreateIndependentReceipt` | Lines 13958–14080 | Added `tx.get(opDocRef)` check, idempotent replay short-circuit, and atomic `system/op_${opId}` write. |
| Billing UI Save Handler | Lines 6795–6845 | Staging and recovery of `temple_pending_billing_op` in `localStorage`. |
| `saveReceipt` UI Save Handler | Lines 5900–5940 | Staging and recovery of `temple_pending_receipt_op` in `localStorage`. |
| Window Exports | Lines 14210–14220 | Exposed idempotency utilities on `window` for test harnesses. |

### 3.2 Firestore Document Schema Paths

| Document Path | Namespace | Role in STEP 33.15 |
| :--- | :--- | :--- |
| `/system/op_${opId}` | `system` collection | Stored atomically inside transaction. Fields: `operationId`, `type`, `status: 'committed'`, `seqNumber`, `formattedNo`, `billDocId`, `receiptDocId`, `resDocId`, `billReceiptNo`, `accountingReceiptNo`, `amount`, `fingerprint`, `createdBy`, `createdAt`. |
| `/system/res_${N}` | `system` collection | Stored atomically with `operationId: opId` field link. |
| `/billing/bill_${N}` | `billing` collection | Stored atomically with `operationId: opId` field link. |
| `/receipts/rcpt_${N}` | `receipts` collection | Stored atomically with `operationId: opId` field link. |
| `/system/counters` | `system` collection | Updated monotonically inside transaction only on fresh allocations. Untouched on idempotent replays. |

---

## 4. Test Suite Execution & Results

### 4.1 Dedicated Test Suite: `test_step_33_15_idempotency_suite.js`

Executed against isolated Firebase Emulator Suite (`demo-temple-accounts-test`):

| Test ID | Domain / Scenario | Expected | Measured Result | Verdict |
| :---: | :--- | :--- | :--- | :---: |
| **ENV-01** | Air-Gap Isolation | `demo-temple-accounts-test` | `demo-temple-accounts-test` | **PASS** |
| **ENV-02** | Security Rules Active | HTTP 200 (Candidate rules) | HTTP 200 | **PASS** |
| **AUTH-01** | User Authentication | 3 operational users | 3 operational users | **PASS** |
| **TC-01** | First Billing Request Commit | `BILL-001` (seq: 1, replay: false) | `BILL-001` (seq: 1, replay: false) | **PASS** |
| **TC-02** | Billing Idempotent Replay | `BILL-001` (seq: 1, replay: true) | `BILL-001` (seq: 1, replay: true) | **PASS** |
| **TC-03** | Counter Invariance on Replay | Counter = 1 (Unchanged) | Counter = 1 (Unchanged) | **PASS** |
| **TC-04** | Tampered Financial Data Rejection | Exception thrown | Rejection: `"Idempotency conflict..."` | **PASS** |
| **TC-05** | First Independent Receipt Commit | `R-002` (seq: 2, replay: false) | `R-002` (seq: 2, replay: false) | **PASS** |
| **TC-06** | Independent Receipt Replay | `R-002` (seq: 2, replay: true) | `R-002` (seq: 2, replay: true) | **PASS** |
| **TC-07** | Deterministic Lost-Response Recovery | `BILL-003` recovered without advance | `BILL-003` recovered, Counter = 3 | **PASS** |
| **TC-08** | Retry After Pre-Commit Abort | `BILL-004` (fresh commit) | `BILL-004` (replay: false, counter=4) | **PASS** |
| **TC-09** | Concurrency with Same Operation ID | Exactly 1 commit, 1 replay | Single commit `BILL-005`, 1 replay | **PASS** |
| **TC-10** | Concurrency with Distinct Operation IDs | Monotonic allocations `[6, 7]` | Monotonic allocations `[6, 7]` | **PASS** |
| **TC-11** | Database Audit: No Orphan Records | 0 orphan receipts or bills | 0 orphan records (6 bills, 7 receipts) | **PASS** |
| **TC-12** | Voiding & Permanent Reservation | Number 001 cannot be reused | Reuse of 001 rejected | **PASS** |
| **TC-13** | Manual Numbering Race Condition | Exactly 1 success, 1 rejection | 1 success (`BILL-008`), 1 rejection | **PASS** |
| **TC-14** | Session Recovery Across Page Reload | Stored opId recovered | Recovered `op_session_recovery_009` | **PASS** |
| **TC-15** | IndexedDB Deduplication Safety | Exactly 1 record per ID in store | Exactly 1 record in store | **PASS** |
| **TC-16** | Reconciliation of Uncommitted ID | `committed: false` | `committed: false` | **PASS** |
| **TC-17** | Regression Suite: STEP 33.12 | All 43 test assertions pass | **PASS (43/43)** | **PASS** |

**Test Summary:**
* **Total Assertions:** 20
* **Passed:** 20
* **Failed:** 0
* **Not Tested:** 0

---

## 5. Evidence of Lost-Response Recovery & Counter Values

### 5.1 Deterministic Fault Injection Evidence (Scenario 7)
In test `TC-07`, the transaction callback committed the writes for `BILL-003` (including `system/op_bill_lost_response_003` and `system/counters` = 3), but the client immediately threw a simulated lost network response (`SIMULATED_CLIENT_LOST_RESPONSE_AFTER_SERVER_COMMIT`).

* **Client state after drop:** Client caught simulated network timeout; document persisted on Firestore.
* **Global counter before injection:** `2`
* **Global counter after server commit (unacknowledged):** `3`
* **Client retry with same operation ID:** Invoked `executeTransactionBillingWithIdempotency` with `op_bill_lost_response_003`.
* **Retry response:** Resolved with original committed document `BILL-003`, `seqNumber: 3`, `isIdempotentReplay: true`.
* **Global counter after retry:** `3` (Zero advancement; zero double allocation).

### 5.2 Before-and-After Counter Values Across Key Scenarios

| Test Case | Scenario Description | Initial Counter | Post-Commit Counter | Post-Retry Counter |
| :---: | :--- | :---: | :---: | :---: |
| **TC-01 / TC-02** | Initial Bill Commit & Retry | `0` | `1` | `1` (Invariant) |
| **TC-05 / TC-06** | Independent Receipt & Retry | `1` | `2` | `2` (Invariant) |
| **TC-07** | Lost Response & Safe Recovery | `2` | `3` | `3` (Invariant) |
| **TC-08** | Transaction Abort Before Commit | `3` | `3` (Aborted) | `4` (Committed on retry) |
| **TC-09** | Concurrent Race (Same Operation ID) | `4` | `5` | `5` (Single winner, single advance) |

---

## 6. Regression Suite Verification

To confirm that the new idempotency layer introduced zero regressions, all existing test suites were executed against the emulator:

1. **STEP 33.12 Unified Numbering Suite (`test_step_33_12_unified_numbering_suite.js`):**
   - **Passed:** 43 / 43
   - **Failed:** 0
   - **Not Tested:** 3 (Physical printer, production mutation, live CLI deployment)
   - **Verdict:** **PASS**
2. **STEP 33.13 Security Rules Compatibility Suite (`test_step_33_13_rules_compatibility_suite.js`):**
   - **Passed:** 46 / 46
   - **Failed:** 0
   - **Not Tested:** 3 (Physical printer, production mutation, live CLI deployment)
   - **Verdict:** **PASS**

---

## 7. Cryptographic File Integrity & Configuration Hashes

All digests were computed using SHA-256:

| File Name | Pre-Change SHA-256 | Post-Change SHA-256 | Status |
| :--- | :--- | :--- | :---: |
| `Temple_Accounts-1.html` | `E7B9DFDD211C6EE27E48A25DE133E12DF511E686766DD0B4C282305D28150669` | `19C2EB40A25BC495ABBDEBED2488E4AD55901F49C2ACE6C719B998A56EE1FC4B` | **UPDATED** |
| `Pre-Change Backup File` | `E7B9DFDD211C6EE27E48A25DE133E12DF511E686766DD0B4C282305D28150669` | `E7B9DFDD211C6EE27E48A25DE133E12DF511E686766DD0B4C282305D28150669` | **VERIFIED** |
| `firestore.rules` (Production) | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **INTACT** |
| `firestore.rules.candidate` | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | **INTACT** |
| `firebase.json` (Production) | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | **INTACT** |
| `firebase.emulator.json` | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | **INTACT** |
| `test_step_33_12_unified_numbering_suite.js` | `2AE05C62BEF9ADFE10D0C07F68BF96B6C111E5FBFA62DD2A9D2DEB43DE234F7C` | `2AE05C62BEF9ADFE10D0C07F68BF96B6C111E5FBFA62DD2A9D2DEB43DE234F7C` | **INTACT** |
| `test_step_33_13_rules_compatibility_suite.js` | `A1BD8B5C008DF5066650C6D8246DC901B79FEF46B326FFBCED19DADF2DEB3E30` | `A1BD8B5C008DF5066650C6D8246DC901B79FEF46B326FFBCED19DADF2DEB3E30` | **INTACT** |
| `test_step_33_15_idempotency_suite.js` | — | `0D7FEA8B50B0C989C8E4D2C50A649D60EC8AB7A0697028D92988E864E46AC4A0` | **NEW TEST SUITE** |

---

## 8. Safety & Compliance Certifications

1. **Zero Contact with Production:**
   - Production project `temple-f4f7` was strictly air-gapped. Zero network requests reached Google Cloud production infrastructure.
2. **Zero Modification to Security Rules:**
   - Neither `firestore.rules` nor `firestore.rules.candidate` was altered.
   - The idempotency records utilize the existing `/system/{docId}` path, fully supported by candidate rule `allow read, create, update: if isAuthenticated(); allow delete: if false;`.
3. **No Historical Data Mutation:**
   - No historical records in production or test archives were rewritten, renumbered, or deleted.
4. **Preservation of Single-File Architecture:**
   - All client-side code remains fully contained within `Temple_Accounts-1.html`. No external dependencies or bundlers were added.

---

## 9. Next Steps and Recommendations

DEFECT-01 is completely resolved and verified. As instructed in the STEP 33.15 mandate:
* DEFECT-02 (Pre-save validation TOCTOU check outside transaction) and DEFECT-03 (Legacy unused `createAccountingReceiptFromBilling` path) were documented in STEP 33.14 and are preserved for subsequent prioritization.
* No changes should be deployed to production until review of this report is completed.
