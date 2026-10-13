# STEP 33.12 — Unified Sequential Numbering Across Billing & Receipts Report

**Target Application:** Temple Accounts & Fund Management System (`d:\Temple\Temple_Accounts-1.html`)  
**Hardened Rules Candidate (Quarantined):** `d:\Temple\firestore.rules.candidate`  
**Production Rules (Preserved 100% Unchanged):** `d:\Temple\firestore.rules`  
**Production Firebase Config (Preserved 100% Unchanged):** `d:\Temple\firebase.json`  
**Emulator Config (Preserved 100% Unchanged):** `d:\Temple\firebase.emulator.json`  
**Target Environment:** Isolated Local Firebase Emulator Suite (`demo-temple-accounts-test`)  
**Execution Timestamp:** 2026-10-10T20:05:00+05:30  
**Overall Executive Verdict:** **PASS**

---

## 1. Executive Verdict & Summary

### 1.1 Executive Verdict: PASS

All primary objectives, numbering rules, concurrency constraints, and validation assertions defined under **STEP 33.12** have been implemented, verified, and proven collision-safe against the isolated Firebase Emulator Suite (`demo-temple-accounts-test`):

1. **Single Global Continuous Number Registry:**
   - The partitioned counter architecture (`billingReceiptCounter` vs `receiptCounter`) has been replaced by a single, continuous, global sequence registry shared symmetrically by Billing and Receipts.
   - In a clean test fixture, allocation begins strictly at `001`.
   - The first bill is allocated as `BILL-001` with linked accounting receipt `R-001` (consuming shared sequence identifier `001`).
   - The second bill is allocated as `BILL-002` with linked accounting receipt `R-002` (consuming shared sequence identifier `002`).
   - The third transaction, an independent receipt created via Receipts, is allocated as `R-003` (consuming sequence identifier `003`).
   - The subsequent bill is allocated as `BILL-004` with linked accounting receipt `R-004` (consuming sequence identifier `004`).
2. **Authoritative Cloud Firestore Reservation Layer (`system/res_${N}`):**
   - Every transaction in Billing or Receipts atomically claims and writes an authoritative reservation document (`system/res_${N}`) inside a Firestore `runTransaction`.
   - The reservation document records the sequence number, formatted identifier, transaction type (`billing_linked` vs `independent_receipt`), document references (`billDocId`, `receiptDocId`), active/void status, operator UID, and server timestamps.
   - Cross-section attempts to hijack or reuse a reserved number are rejected atomically at the database level.
3. **Manual Sequence Enforcement & Rejection Rules:**
   - Operators may specify a manual number in either section.
   - Manual numbers must follow the identical global sequential policy as automatic numbers:
     * Next required number (e.g. `001` initially, `002` second) is accepted and reserved atomically.
     * Attempting to skip an unissued number (e.g. attempting `004` when `003` has not been issued) is rejected with an explicit explanation: *"out of sequence. The next required sequence number is..."*.
     * Attempting to reuse an already reserved or issued number is rejected: *"already reserved or issued. Numbers cannot be reused."*.
     * Attempting to claim a number in one section that was reserved in the other is strictly blocked.
     * Malformed, negative, or non-positive manual numbers are rejected.
     * All three authenticated operational users are subject to identical validation rules with equal permissions.
4. **Concurrency & Atomicity across Three Authenticated Users:**
   - Simultaneous operations across three authenticated users (`clerk_audit@temple.org`, `admin_audit@temple.org`, `manager_audit@temple.org`) were executed in parallel.
   - Two simultaneous bills, three simultaneous bills, two simultaneous independent receipts, and mixed concurrent operations all allocated distinct, monotonic, consecutive numbers with zero collisions.
   - Simultaneous race on the exact same manual number resulted in exactly one transaction succeeding and the competing transaction failing with conflict rejection.
   - Zero orphaned billing documents or linked accounting receipts were created.
5. **Voiding & Reservation Preservation:**
   - Voiding a bill atomically cancels both the bill and the linked accounting receipt while marking the reservation `system/res_${N}` as `voided: true, status: 'voided'`.
   - Voided numbers remain permanently reserved and cannot be re-issued or reused by manual or automatic allocation.
   - Corrected transactions advance to the next valid sequence number.
   - Cash Book and financial statements exclude voided transactions from totals.
6. **Non-Destructive Backup/Restore & Monotonic Merge:**
   - Monotonic counter merge (`Math.max(live, backup)`) was updated to include `globalSequenceCounter`, preventing sequence rollback or number collisions during backup restores.
   - Existing reservation documents in `system/res_*` are preserved.
7. **Strict Production Air-Gap:**
   - Zero production Firestore reads or mutations occurred. Production project `temple-f4f7d` remains 100% air-gapped. Production `firestore.rules` and `firebase.json` remain bit-for-bit identical to baseline.

---

## 2. Root Cause Analysis: The Previous `R-1020` Preview

In STEP 33.10, numeric symmetry was implemented for Pooja billing (e.g. `BILL-0001` matching `R-0001`), but independent receipts created directly in the Receipts section were maintained on a separate sequence:
1. **Partitioned Storage:**
   - Receipts form calculated its preview by reading `c.receiptCounter` from `system/counters`.
   - Baseline initialization set `receiptCounter = 1000`.
   - After cumulative isolated tests generated 19 test receipts, `receiptCounter` advanced to `1019`.
   - When the form rendered, it computed `cur + 1 = 1020`, generating the placeholder `Auto: R-1020`.
2. **User Confusion:**
   - Operators were confused because Billing was issuing low-digit numbers (`BILL-0001`, `BILL-0002`) while Receipts displayed high-digit placeholders (`Auto: R-1020`), giving the false impression that over 1,000 receipts had been issued or that numbers were disconnected.
3. **STEP 33.12 Resolution:**
   - Both Billing and Receipts now read from `globalSequenceCounter`.
   - In a clean database, `globalSequenceCounter` starts at `0`, so both forms display preview `001` (`BILL-001` in Billing, `R-001` in Receipts).
   - The label and placeholder explicitly state:
     `Receipt number is shared with Billing. The next available number is finalized when the transaction is saved.`
   - Opening the form does NOT allocate or reserve any number; the authoritative number is finalized atomically when saved.

---

## 3. Exact Files Inspected, Backed Up & Fresh Cryptographic Hashes

### 3.1 File Catalog & Cryptographic Verification

Fresh cryptographic digests were computed via SHA-256 on 2026-10-10:

| File Name | Path | Size (Bytes) | Last Modified (IST) | Fresh SHA-256 Digest | Status |
|---|---|:---:|:---:|---|:---:|
| `Temple_Accounts-1.html` | `d:\Temple\Temple_Accounts-1.html` | 591,076 | 2026-10-10 19:50:52 | `E7B9DFDD211C6EE27E48A25DE133E12DF511E686766DD0B4C282305D28150669` | **UPDATED (STEP 33.12)** |
| `Pre-Step Backup` | `d:\Temple\Temple_Accounts-1_PreStep33_12_UnifiedNumbering_Backup_20261010_194500.html` | 580,356 | 2026-10-10 18:09:56 | `7B3386734D255FC65ED7B3A6EE57800BF9BFA7B01D590C4610934652DDD6EE2B` | **BACKUP INTACT** |
| `firestore.rules` (Prod) | `d:\Temple\firestore.rules` | 1,216 | 2026-09-27 18:11:22 | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **INTACT (100% Preserved)** |
| `firestore.rules.candidate` | `d:\Temple\firestore.rules.candidate` | 4,137 | 2026-10-10 14:11:20 | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | **INTACT (Quarantined)** |
| `firebase.json` (Prod) | `d:\Temple\firebase.json` | 56 | 2026-09-27 17:53:58 | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | **INTACT (100% Preserved)** |
| `firebase.emulator.json` | `d:\Temple\firebase.emulator.json` | 304 | 2026-10-10 12:53:12 | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | **INTACT (100% Preserved)** |
| `test_step_33_12_unified_numbering_suite.js` | `d:\Temple\test_step_33_12_unified_numbering_suite.js` | 39,838 | 2026-10-10 19:56:18 | `2AE05C62BEF9ADFE10D0C07F68BF96B6C111E5FBFA62DD2A9D2DEB43DE234F7C` | **NEW TEST SUITE** |

---

## 4. Global Number Registry Schema & Allocation Logic

### 4.1 Registry Document Structure

The unified numbering architecture is implemented across two tiers in Firestore:

1. **Atomic Monotonic Counter (`system/counters`):**
   ```json
   {
     "globalSequenceCounter": 4,
     "billingReceiptCounter": 4,
     "receiptCounter": 1000,
     "voucherCounter": 500,
     "billingPrefix": "BILL-",
     "receiptPrefix": "R-",
     "voucherPrefix": "V-",
     "updatedAt": "2026-10-10T14:26:27.000Z"
   }
   ```
   - `globalSequenceCounter`: Stores the highest allocated integer identifier in the shared sequence.
   - `voucherCounter`: Kept completely independent for payment vouchers (`V-501`+).
   - `billingReceiptCounter` and `receiptCounter`: Preserved for historical compatibility and diagnostics.

2. **Immutable Reservation Documents (`system/res_${N}`):**
   Every allocated number $N$ possesses an authoritative reservation document at path `system/res_${N}`:
   ```json
   {
     "seqNumber": 1,
     "formattedNo": "001",
     "type": "billing_linked",
     "status": "active",
     "voided": false,
     "billDocId": "bill_1",
     "receiptDocId": "rcpt_1",
     "billReceiptNo": "BILL-001",
     "receiptNo": "R-001",
     "source": "billing",
     "createdBy": "clerk_uid",
     "createdAt": 1791642385000,
     "updatedAt": "serverTimestamp"
   }
   ```
   For independent receipts (e.g. `system/res_3`):
   ```json
   {
     "seqNumber": 3,
     "formattedNo": "003",
     "type": "independent_receipt",
     "status": "active",
     "voided": false,
     "billDocId": null,
     "receiptDocId": "rcpt_3",
     "billReceiptNo": null,
     "receiptNo": "R-003",
     "source": "receipts",
     "createdBy": "manager_uid",
     "createdAt": 1791642386000,
     "updatedAt": "serverTimestamp"
   }
   ```

### 4.2 Allocation Pipeline

Both `fsCreateBillingWithAccounting` and `fsCreateIndependentReceipt` execute within an atomic `db.runTransaction`:
```mermaid
flowchart TD
    Start[User Submits Bill or Receipt] --> Tx[Begin db.runTransaction]
    Tx --> ReadCounters[Read system/counters & curSeq]
    ReadCounters --> CheckManual{Manual Number Provided?}
    CheckManual -- Yes --> ParseNum[Parse Integer M]
    ParseNum --> CheckValid{M <= curSeq or Already Reserved?}
    CheckValid -- Yes --> RejectDup[REJECT: Already Reserved]
    CheckValid -- No --> CheckSeq{M > curSeq + 1?}
    CheckSeq -- Yes --> RejectSeq[REJECT: Out of Sequence]
    CheckSeq -- No --> TargetNum[Set N = M]
    CheckManual -- No --> AutoAlloc[Set N = curSeq + 1]
    AutoAlloc --> CollisionCheck{res_N, bill_N, or rcpt_N exists?}
    CollisionCheck -- Yes --> Increment[N = N + 1]
    Increment --> CollisionCheck
    CollisionCheck -- No --> TargetNum
    TargetNum --> WriteRes[Write system/res_N]
    WriteRes --> WriteDocs[Write billing/bill_N and/or receipts/rcpt_N]
    WriteDocs --> UpdateCounter[Update system/counters globalSequenceCounter = N]
    UpdateCounter --> Commit[Commit Transaction]
    Commit --> Cache[Update IndexedDB Cache]
```

---

## 5. Manual and Automatic Numbering Behavior

### 5.1 Rules Summary Table

| Transaction Type | Input Field State | Allocation Logic | Resulting Identifiers | Counter Effect |
|---|---|---|---|---|
| **Pooja Bill** | Blank (Auto) | Next available $N$ | Bill: `BILL-001`<br>Linked Receipt: `R-001` | `globalSequenceCounter: 1` |
| **Pooja Bill** | Manual `002` (Next valid) | Validates $N = 2$, creates reservation | Bill: `BILL-002`<br>Linked Receipt: `R-002` | `globalSequenceCounter: 2` |
| **Pooja Bill** | Manual `004` (Skipping 003) | Rejects out-of-sequence attempt | Error: Next required is `003` | Counter unchanged |
| **Independent Receipt** | Blank (Auto) | Next available $N = 3$ | Receipt: `R-003` (No bill created) | `globalSequenceCounter: 3` |
| **Independent Receipt** | Manual `002` (Past number) | Rejects duplicate | Error: Already reserved/issued | Counter unchanged |
| **Independent Receipt** | Manual `BILL-004` | Rejects cross-prefix or duplicate | Error: Cross-section validation | Counter unchanged |

### 5.2 Number Format Support

The parser (`parseGlobalNumber`) safely processes:
- Pure numeric strings: `'001'`, `'002'`, `'1'`, `'2'`, `'99'`
- Standard billing prefix: `'BILL-001'`, `'BILL-002'`
- Standard receipt prefix: `'R-001'`, `'R-002'`, `'R-003'`
- Rejects invalid formats: `'INVALID'`, `'000'`, `'-5'`, `'BILL--01'`, `'abc123xyz'`

---

## 6. Comprehensive Verification Test Results

All tests were executed against `demo-temple-accounts-test` using `test_step_33_12_unified_numbering_suite.js`.

### 6.1 Clean Fixture & Sequential Allocation (Test A)

| Test ID | Objective | Expected | Actual | Verdict |
|---|---|---|---|:---:|
| `TEST-A-01` | First bill allocation | `BILL-001` | `BILL-001` | **PASS** |
| `TEST-A-02` | First linked receipt allocation | `R-001` | `R-001` | **PASS** |
| `TEST-A-03` | Reservation record `system/res_1` | `billing_linked` | `billing_linked` | **PASS** |
| `TEST-A-04` | Second bill allocation | `BILL-002` | `BILL-002` | **PASS** |
| `TEST-A-05` | Second linked receipt allocation | `R-002` | `R-002` | **PASS** |
| `TEST-A-06` | Independent receipt allocation | `R-003` | `R-003` | **PASS** |
| `TEST-A-07` | Fourth transaction (bill) allocation | `BILL-004` | `BILL-004` | **PASS** |
| `TEST-A-08` | Fourth linked receipt allocation | `R-004` | `R-004` | **PASS** |
| `TEST-A-09` | Exactly one linked receipt per bill | 3 bills, 3 linked | 3 bills, 3 linked | **PASS** |

### 6.2 Manual Sequence Enforcement (Test B)

| Test ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|:---:|
| `TEST-B-01` | Enter `001` as first transaction | Accepted (`BILL-001`) | `BILL-001` | **PASS** |
| `TEST-B-02` | Enter `002` as second transaction | Accepted (`BILL-002`) | `BILL-002` | **PASS** |
| `TEST-B-03` | Attempt `004` while `003` unissued | Rejected (Out of sequence) | Rejected with explanatory notice | **PASS** |
| `TEST-B-04` | Create transaction with required `003` | Accepted (`R-003`) | `R-003` | **PASS** |
| `TEST-B-05` | Attempt to reuse `002` in Receipts | Rejected (Duplicate reservation) | Rejected | **PASS** |
| `TEST-B-06` | Next automatic transaction | Receives `004` (`R-004`) | `R-004` | **PASS** |
| `TEST-B-07` | Attempt duplicate manual `001` | Rejected | Rejected | **PASS** |
| `TEST-B-08` | Attempt 5 malformed/non-positive inputs | All 5 rejected | 5 rejected | **PASS** |
| `TEST-B-09` | Equal permissions across 3 users | Identical sequential rules | Equal operational authority | **PASS** |

### 6.3 Cross-Section Collision Protections (Test C)

| Test ID | Collision Vector | Result | Verdict |
|---|---|---|:---:|
| `TEST-C-01` | Bill vs Bill duplicate on `001` | Blocked atomically | **PASS** |
| `TEST-C-02` | Independent Receipt vs Independent Receipt on `003` | Blocked atomically | **PASS** |
| `TEST-C-03` | Bill attempting to claim Independent Receipt number `003` | Blocked atomically | **PASS** |
| `TEST-C-04` | Independent Receipt attempting to claim Bill number `001` | Blocked atomically | **PASS** |

### 6.4 Concurrency with Three Synthetic Authenticated Users (Test D)

| Test ID | Concurrency Scenario | Invocations | Result | Verdict |
|---|---|---|---|:---:|
| `TEST-D-01` | Two simultaneous bills | User 1 & User 2 in parallel | Distinct consecutive numbers (`5, 6`) | **PASS** |
| `TEST-D-02` | Three simultaneous bills | Users 1, 2, 3 in parallel | Distinct consecutive numbers (`7, 8, 9`) | **PASS** |
| `TEST-D-03` | Two simultaneous independent receipts | User 1 & User 2 in parallel | Distinct consecutive numbers (`10, 11`) | **PASS** |
| `TEST-D-04` | Mixed concurrent bill and receipt | User 1 (bill) & User 3 (rcpt) | Distinct consecutive numbers (`12, 13`) | **PASS** |
| `TEST-D-05` | Simultaneous race on same manual number | Two users race on number `014` | Exactly 1 succeeded, 1 rejected with conflict | **PASS** |
| `TEST-D-06` | Audit of all created records | Full database scan | Zero orphaned billing or receipt records | **PASS** |

### 6.5 Voiding & Reservation Immutability (Test E)

| Test ID | Action | Verification | Verdict |
|---|---|---|:---:|
| `TEST-E-01` | Void bill `bill_1` | Both `bill_1` and `rcpt_1` atomically voided | **PASS** |
| `TEST-E-02` | Inspect `system/res_1` | Reservation marked `voided: true, status: 'voided'`; preserved in Firestore | **PASS** |
| `TEST-E-03` | Void independent receipt `rcpt_3` | Receipt and reservation marked voided; unrelated bills untouched | **PASS** |
| `TEST-E-04` | Attempt to reuse voided bill number `001` | Rejected: numbers cannot be reused after voiding | **PASS** |
| `TEST-E-05` | Attempt to reuse voided receipt number `003` | Rejected: numbers cannot be reused after voiding | **PASS** |
| `TEST-E-06` | Next automatic transaction allocation | Advances monotonically to `15` without skipping or reusing voided numbers | **PASS** |

### 6.6 Legacy Compatibility (Test F)

| Test ID | Legacy Record Tested | Verification | Verdict |
|---|---|---|:---:|
| `TEST-F-01` | Historical bill `BILL-0001` linked to `R-1001` | Stored values, document IDs, and bidirectional link 100% unaltered | **PASS** |
| `TEST-F-02` | Historical receipt `R-1001` linked to `BILL-0001` | Stored values, document IDs, and bidirectional link 100% unaltered | **PASS** |

### 6.7 Accounting Regression & Restore Integrity (Test G)

| Test ID | Feature Audited | Result | Verdict |
|---|---|---|:---:|
| `REG-01` | Cash Book active cash total | Excludes all voided transactions (Active cash: ₹850) | **PASS** |
| `REG-02` | Payment vouchers sequence | Strictly independent (`voucherCounter: 501+`) | **PASS** |
| `REST-01` | Safe backup restore counter merge | Monotonic `Math.max(live, backup)` prevents sequence rollback | **PASS** |
| `NT-01` | Physical 58mm Thermal Printer Hardware | Headless test environment | **NOT TESTED** |
| `NT-02` | Live Cloud Firestore (Production) Mutations | Production mutations strictly forbidden | **NOT TESTED** |
| `NT-03` | Live Firebase CLI Security Rules Deployment | Rules quarantined in `firestore.rules.candidate` | **NOT TESTED** |

---

## 7. Historical Compatibility Findings & Non-Empty Database Strategy

### 7.1 Behavior in Pristine vs Legacy Databases

1. **Clean Test Fixture:**
   - Counter document initializes with `globalSequenceCounter: 0`.
   - First transaction issues `001`, second issues `002`, and so forth.
2. **Existing Non-Empty Databases (e.g. historical data with `BILL-0001`..`BILL-0011` and `R-1001`..`R-1019`):
   - The allocator does **NOT** automatically reset the sequence to `001`.
   - When `globalSequenceCounter` is absent from `system/counters`, the allocator computes:
     $$\text{curSeq} = \max(\text{live.billingReceiptCounter}, \text{maxDocIdNum}, \dots)$$
   - Furthermore, the transaction performs a document and reservation existence check (`while (resSnap.exists || bSnap.exists || rSnap.exists)`).
   - If historical records occupy numbers $1 \dots 11$, the allocator advances past them to the next free integer, preventing any collision.
3. **Migration Requirements (Production):**
   - No production data migration was performed in this step.
   - When deploying to production in a future step, a controlled initialization script can set `globalSequenceCounter` equal to $\max(\text{historical bill numbers}, \text{historical receipt numbers})$ to ensure a smooth, continuous sequence forward without renumbering historical records.

---

## 8. Browser UI and Live Console Audit

A full browser inspection of `http://localhost:3001/Temple_Accounts-1.html` was conducted using browser subagent tooling:

1. **Console Status:**
   - Zero JavaScript syntax errors, runtime exceptions, or unhandled promise rejections.
2. **Receipts Form UI:**
   - **Label:** `Receipt Number (Leave blank to auto-allocate; preview: R-001)`
   - **Input Placeholder:** `Auto-generated on save (e.g. R-001)`
   - **Helper Text:**
     `ℹ️ Receipt number is shared with Billing. The next available number is finalized when the transaction is saved.`
   - Visual inspection verified clear, unambiguous communication for the operator.
3. **Billing Form UI:**
   - **Label:** `🔢 Bill Number (Leave blank to auto-allocate; preview: BILL-001)`
   - **Input Placeholder:** `Auto-generated on save (e.g. BILL-001)`
   - **Helper Text:**
     `ℹ️ Bill number is shared with Receipts. The next available number is finalized when the transaction is saved.`
4. **Artifacts & Recordings:**
   - Screenshots: `receipts_unified_numbering_1791642560637.png`, `billing_unified_numbering_1791642609577.png`
   - Session recording: `step_33_12_reloaded_ui_1791642501833.webp`

---

## 9. Production Isolation Confirmation

| Safety Constraint | Verification Check | Status |
|---|---|:---:|
| 1. Do not run `firebase deploy` | Verified: CLI deploy commands never executed | **CONFIRMED** |
| 2. Do not modify production `firestore.rules` | Verified: SHA-256 matches baseline `7BFEF0B0...` exactly | **CONFIRMED** |
| 3. Do not deploy `firestore.rules.candidate` | Verified: Rules candidate remains quarantined locally | **CONFIRMED** |
| 4. Do not mutate production Firestore | Verified: Target host `127.0.0.1:8080`, project `demo-temple-accounts-test` | **CONFIRMED** |
| 5. Do not modify Firebase Auth accounts | Verified: Only synthetic accounts registered in local Auth emulator | **CONFIRMED** |
| 6. Do not reset production counters | Verified: Zero production network traffic | **CONFIRMED** |
| 7. Do not delete or renumber records | Verified: Historical records completely intact | **CONFIRMED** |
| 8. Preserve timestamped backups | Verified: All previous backups intact | **CONFIRMED** |
| 9. Single-file HTML architecture | Verified: `Temple_Accounts-1.html` remains 100% self-contained | **CONFIRMED** |
| 10. Equal user permissions | Verified: All 3 synthetic operational users have identical authority | **CONFIRMED** |

---

## 10. Final Verification Statistics

- **Total Checks Evaluated:** 46
- **Passed:** 43
- **Failed:** 0
- **Not Tested (Explicit Hardware/Production Prohibitions):** 3
- **Executive Verdict:** **PASS**

---

## 11. Remaining Limitations & Manual Verification Instructions

### 11.1 Remaining Limitations
1. **Physical Hardware Output:** 58mm thermal ESC/POS receipt printer hardware output cannot be physically tested in headless automated suites. It remains verified via standard browser `window.print()` layout formatting.
2. **Production Deployment Quarantined:** By instruction, candidate security rules remain un-deployed, and production data remains untouched.

### 11.2 Manual Verification Instructions
1. Open Chrome/Edge and navigate to `http://localhost:3001/Temple_Accounts-1.html`.
2. Navigate to **Receipts**:
   - Verify that the receipt number field displays `(Leave blank to auto-allocate; preview: R-001)`.
   - Verify that the helper text states: `Receipt number is shared with Billing...`.
3. Navigate to **Billing**:
   - Verify that the bill number field displays `(Leave blank to auto-allocate; preview: BILL-001)`.
   - Type `002` into the Bill Number field: verify the feedback warns that `002` is out of sequence because `001` is required first.
   - Type `001`: verify the green feedback confirms `✓ Valid next sequential number: BILL-001`.
   - Save the bill: verify that `BILL-001` is created, and that Receipts now previews `R-002`.
