# STEP 33.10 — Shared Billing/Receipt Numbering, Accounting Synchronization & Safe Backup Restore Report

**Target Application:** Temple Accounts & Fund Management System (`d:\Temple\Temple_Accounts-1.html`)  
**Hardened Rules Candidate (Quarantined):** `d:\Temple\firestore.rules.candidate`  
**Production Rules (Preserved Unchanged):** `d:\Temple\firestore.rules`  
**Production Firebase Config (Preserved Unchanged):** `d:\Temple\firebase.json`  
**Emulator Config (Preserved Unchanged):** `d:\Temple\firebase.emulator.json`  
**Target Environment:** Isolated Local Firebase Emulator Suite (`demo-temple-accounts-test`)  
**Execution Timestamp:** 2026-10-10T18:15:00+05:30  
**Overall Executive Verdict:** **PASS**

---

## 1. Executive Verdict & Summary

### 1.1 Executive Verdict: PASS

All four primary objectives and requirements specified under STEP 33.10 have been implemented, verified, and proven collision-safe against the local Firebase Emulator Suite (`demo-temple-accounts-test`):

1. **Shared Numeric Identifiers for New Billing Transactions:**
   New billing transactions now atomically allocate a single shared sequence number for both the Pooja bill and its linked accounting receipt.
   - First new billing transaction in a clean test fixture: Bill `BILL-0001` with linked receipt `R-0001`.
   - Second new billing transaction: Bill `BILL-0002` with linked receipt `R-0002`.
   - Third new billing transaction: Bill `BILL-0003` with linked receipt `R-0003`.
   - Document ID paths mirror this symmetry: `billing/bill_1` and `receipts/rcpt_1`.
2. **Preservation of Historical Records & Independent Numbering:**
   - All historical records created under the legacy independent counter design (e.g. `BILL-0001` linked to `R-1001`) remain 100% unaltered. Zero historical renumbering was performed.
   - Independent accounting receipts created directly through the Receipts section continue to use their independent atomic counter (`receiptCounter`, range 1000+), guaranteeing non-collision with billing receipts.
   - Voucher numbering (`V-501`+) remains completely independent.
3. **Bill-Linked Receipt Synchronization & Edit Locks:**
   - Active accounting receipts originating from Pooja Billing are automatically detected (`source: 'billing'` or `billingFirestoreId`). Direct edits through the Receipts form are locked to prevent financial divergence.
   - Users are explicitly alerted and instructed to follow the safe workflow: void the linked bill in the Billing section (which atomically voids both the bill and the linked accounting receipt via Firestore batch) and issue a corrected replacement bill.
4. **Safe Backup Restoration (Zero Deletion & Non-Destructive Merge):**
   - The backup restore pipeline (`restoreBackup()`) has been transitioned from a destructive overwrite to an authoritative **Safe Merge**.
   - Documents absent from a backup file (newer bills, receipts, settings, payments) are **NEVER physically deleted**.
   - Void flags (`voided: true`, `voidReason`, `voidDate`, `voidedAt`) on existing live records are strictly protected from accidental reversal.
   - Live records with newer timestamps are not overwritten with older backup snapshots.
   - System counters (`system/counters`) are merged monotonically using `Math.max(live, backup)`, completely eliminating counter rollback and future sequence collisions.
5. **Root Cause Analysis of `Auto: R-1020` Preview:**
   - Fully investigated and resolved: `Auto: R-1020` was a computed dynamic placeholder derived from reading `receiptCounter` (`1019`) from Firestore/cache and calculating `cur + 1 = 1020`.
   - The UI has been enhanced with explicit helper annotations to prevent users from mistaking this unreserved preview for a permanently allocated sequence number.

**Strict Production Isolation:** Zero production database writes, deletes, or mutations occurred. Production `firestore.rules` and `firebase.json` remain bit-for-bit untouched. Candidate rules remain safely quarantined in `firestore.rules.candidate`.

---

## 2. Exact Files Inspected, Backed Up & Fresh Cryptographic Hashes

### 2.1 File Catalog & SHA-256 Digest Verification

Fresh cryptographic digests were computed via SHA-256 on 2026-10-10:

| File Name | Path | Size (Bytes) | Last Modified (IST) | Fresh SHA-256 Digest | Status |
|---|---|:---:|:---:|---|:---:|
| `Temple_Accounts-1.html` | `d:\Temple\Temple_Accounts-1.html` | 580,356 | 2026-10-10 18:09:56 | `7B3386734D255FC65ED7B3A6EE57800BF9BFA7B01D590C4610934652DDD6EE2B` | **UPDATED (STEP 33.10)** |
| `Pre-Step Backup` | `d:\Temple\Temple_Accounts-1_PreStep33_10_SharedNumbering_Backup_20261010_180500.html` | 573,486 | 2026-10-10 15:07:56 | `4F6CEB3961CC30214E115F72547902E2793E3B30720612F9061E19DA1464C499` | **BACKUP INTACT** |
| `firestore.rules` (Prod) | `d:\Temple\firestore.rules` | 1,216 | 2026-09-27 18:11:22 | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **INTACT (100% Preserved)** |
| `firestore.rules.candidate` | `d:\Temple\firestore.rules.candidate` | 4,137 | 2026-10-10 14:11:20 | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | **INTACT (Quarantined)** |
| `firebase.json` (Prod) | `d:\Temple\firebase.json` | 56 | 2026-09-27 17:53:58 | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | **INTACT (100% Preserved)** |
| `firebase.emulator.json` | `d:\Temple\firebase.emulator.json` | 304 | 2026-10-10 12:53:12 | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | **INTACT (100% Preserved)** |
| `test_step_33_10_shared_numbering_suite.js` | `d:\Temple\test_step_33_10_shared_numbering_suite.js` | 31,203 | 2026-10-10 18:13:12 | `469CB993F281DC5E22114CC27B7EAE8107E63CB9FF8D28EC290A82AA3A4EBB41` | **NEW TEST SUITE** |

---

## 3. Root Cause Analysis: The `Auto: R-1020` Receipt Form Preview

### 3.1 Investigation Findings
In the Receipts section form (`VIEW_RENDERERS.receipts`), the Receipt Number input field displayed the placeholder `Auto: R-1020`. Tracing through the source code revealed:
1. **Placeholder Construction (Lines 5713 & 5729):**
   ```javascript
   const nextNo = await nextReceiptNo();
   ...
   <input type="text" name="receiptNo" placeholder="Auto: ${esc(nextNo)}">
   ```
2. **Calculation in `nextReceiptNo()` (Lines 4854–4865):**
   ```javascript
   async function nextReceiptNo() {
     const c = await fsGetCounters();
     const cur = (c && typeof c.receiptCounter === 'number') ? c.receiptCounter : (parseInt(window.APP_SETTINGS.receiptCounter, 10) || 1000);
     return prefix + (cur + 1);
   }
   ```
3. **Counter Origin:**
   - In a baseline database, `receiptCounter` initializes at `1000`.
   - During automated test execution in STEPs 33.4, 33.5, 33.6A, 33.7, and 33.8A, 19 test receipts were committed to the isolated test database, advancing `receiptCounter` monotonically from `1000` to `1019`.
   - When `nextReceiptNo()` read `receiptCounter = 1019`, it computed `1019 + 1 = 1020`, yielding string `'R-1020'`.
4. **Core Technical Characterization:**
   - `Auto: R-1020` was **NOT** a hardcoded value, a corrupt counter, or a permanently reserved number.
   - It was a **real-time computed preview** reading the live monotonic counter in `system/counters`.
   - However, displaying simply `Auto: R-1020` without clarifying that the number is an unreserved preview created the misleading impression that `R-1020` had already been claimed. If two operators opened the Receipts screen simultaneously, both saw `Auto: R-1020`, but only the first operator to click SAVE would receive `R-1020`; the second operator would atomically receive `R-1021`.

### 3.2 UI Correction & Clarification
The Receipts form interface has been updated to eliminate all ambiguity:
- **Field Label:**
  `Receipt Number (Leave blank to auto-allocate; preview: R-XXXX)`
- **Input Placeholder:**
  `placeholder="Auto-generated on save (e.g. R-1020)"`
- **Helper Annotation:**
  `ℹ️ Next sequence preview is R-1020. Number is finalized atomically upon save. Independent receipts only.`
- When editing an existing receipt, the actual allocated number is displayed in the input value and labeled `(Assigned: R-XXXX)`.

---

## 4. Phase B — Shared Numbering Implementation & Counter Transition

### 4.1 Numbering Policy for New Transactions
Under the new policy, Pooja billing transactions allocate a single atomic integer sequence $N$, used symmetrically for both the bill and the linked accounting receipt:

| Transaction | Bill Number (`receiptNo`) | Linked Receipt (`receiptNo`) | Document Paths | Counter State |
|---|---|---|---|---|
| First new transaction | `BILL-0001` | `R-0001` | `billing/bill_1`<br>`receipts/rcpt_1` | `billingReceiptCounter: 1`<br>`receiptCounter: 1000` (untouched) |
| Second new transaction | `BILL-0002` | `R-0002` | `billing/bill_2`<br>`receipts/rcpt_2` | `billingReceiptCounter: 2`<br>`receiptCounter: 1000` (untouched) |
| Third new transaction | `BILL-0003` | `R-0003` | `billing/bill_3`<br>`receipts/rcpt_3` | `billingReceiptCounter: 3`<br>`receiptCounter: 1000` (untouched) |

### 4.2 Counter Architecture & Partitioned Ranges
To prevent collisions between billing receipts (`R-0001`+) and independent receipts (`R-1001`+):
1. **Billing Transactions:**
   - Controlled by `billingReceiptCounter` (starts at `0` in pristine databases).
   - Generates 4-digit padded numbers: `BILL-0001` and `R-0001`.
   - `fsCreateBillingWithAccounting` increments `billingReceiptCounter` within the Firestore transaction. It **does NOT mutate `receiptCounter`**.
2. **Independent Receipts:**
   - Controlled by `receiptCounter` (starts at `1000`).
   - Generates independent receipt numbers: `R-1001`, `R-1002`, `R-1020`...
   - `fsNextReceiptNo()` increments only `receiptCounter`.
3. **Partitioned Safety Margin:**
   The `0001–0999` range is reserved for billing transactions, while `1000+` is dedicated to independent receipts.
4. **Collision-Safe Lookahead:**
   Inside `fsCreateBillingWithAccounting` and `_fsAllocateCounter`, the transaction performs a document existence check:
   ```javascript
   let bSnap = await tx.get(billingDocRef);
   let rSnap = await tx.get(receiptDocRef);
   while (bSnap.exists || rSnap.exists) {
     nextBillNum++;
     billDocId = `bill_${nextBillNum}`;
     rcptDocId = `rcpt_${nextBillNum}`;
     billingDocRef = db.collection('billing').doc(billDocId);
     receiptDocRef = db.collection('receipts').doc(rcptDocId);
     bSnap = await tx.get(billingDocRef);
     rSnap = await tx.get(receiptDocRef);
   }
   ```
   If a number has been consumed by a historical or manual record, the allocator automatically advances past it to the next free integer, preventing any collision.

### 4.3 Treatment of Historical Records
- **Zero Renumbering:** Existing bills (`BILL-0001` linked to `R-1001`, `BILL-0002` linked to `R-1002`) remain untouched.
- **Relational Integrity:** Bidirectional links (`billingFirestoreId`, `billingReceiptNo`, `accountingReceiptId`, `accountingReceiptNo`) are 100% preserved.
- The system does not assume document IDs or numeric portions match on pre-existing records.

### 4.4 Manual Numbering Safeguards
- **Manual Bill Numbers:** An operator may specify a custom bill number (e.g., `BILL-0099`). The system verifies that neither `BILL-0099` nor matching `R-0099` exists across active or voided records. The linked receipt automatically adopts `R-0099`.
- **Manual Receipt Numbers:** An operator may specify a custom receipt number in the Receipts section (e.g., `R-9999`). Duplicate validation checks both active and voided records, and explicitly prevents hijacking numbers in the billing range (`R-0001`–`R-0999`).

---

## 5. Phase C — Bill-Linked Receipt Synchronization

### 5.1 Direct Receipt Edit Restriction
Allowing an operator to edit devotee name, amount, or payment mode on `/receipts/{id}` without altering `/billing/{id}` introduces financial divergence.

**Implemented Safe Workflow:**
1. In `VIEW_RENDERERS.receipts`:
   When an operator attempts to edit a receipt originating from Billing (`source === 'billing'` or `billingFirestoreId`), direct form editing is blocked:
   ```javascript
   if (editRec && (editRec.source === 'billing' || editRec.billingFirestoreId || editRec.billingId || editRec.billingReceiptNo)) {
     alert(`Receipt ${editRec.receiptNo || editId} was generated from Pooja Bill ${editRec.billingReceiptNo || editRec.billingId || ''}.\n\nDirect editing of billing-linked receipts is not permitted to preserve audit consistency between billing and accounting records.\n\nTo make a correction, please void the bill in the Billing section and create a new bill.`);
     editRec = null;
   }
   ```
2. In `saveReceipt()`:
   Server-side guard prevents programmatic updates to billing-linked receipts.
3. In `voidRecord()`:
   Voiding a billing-linked receipt prompts the user and dispatches `fsVoidLinkedBillingAndReceipt`, which atomically voids both the bill and the receipt in a single Firestore batch.

---

## 6. Phase D — Safe Backup Restoration

### 6.1 Shift from Destructive Overwrite to Safe Merge
Previously, `restoreBackup()` in Phase 6 executed `_batchDeleteCollection(db, col, idsToDelete)` to delete all Firestore documents absent from the uploaded JSON backup. Under candidate security rules (`firestore.rules.candidate`), this returned `HTTP 403 PERMISSION_DENIED` because rules intentionally lock financial document deletion.

Under STEP 33.10, `restoreBackup()` has been redesigned as an authoritative **Safe Merge**:

1. **Zero Physical Deletions:**
   `_batchDeleteCollection` has been removed. Documents in Firestore absent from the backup are **never deleted**. This guarantees that transactions recorded after a backup was taken are never wiped out.
2. **Conflict & Void Protection:**
   When an incoming backup document matches an existing live document:
   - If the live document is flagged `voided: true` and the backup document is not, the live `voided: true`, `voidReason`, `voidDate`, and `voidedAt` are preserved. The restore will never un-void a cancelled transaction.
   - If the live document's timestamp (`updatedAt` / `createdAt`) is newer than the backup document, the live record is preserved and overwrite is skipped (`skippedCount++`).
3. **Monotonic Counter Merge:**
   In Phase 7, counters are merged monotonically:
   ```javascript
   const safeBrc = Math.max(liveCData.billingReceiptCounter || 0, counterPayload.billingReceiptCounter || 0);
   const safeRc = Math.max(liveCData.receiptCounter || 0, counterPayload.receiptCounter || 0);
   const safeVc = Math.max(liveCData.voucherCounter || 0, counterPayload.voucherCounter || 0);
   ```
   Counters can never be wound backwards by restoring an older backup.
4. **Idempotency:**
   Repeated restoration of the same backup file produces identical, non-destructive results without duplicate entries.
5. **Detailed Progress Reporting:**
   Phase 6 reports exact counts: `${col}: X imported, Y updated, Z skipped (newer), W conflicts preserved (0 deleted - safe merge)`.

---

## 7. Automated Emulator Test Suite Results

All tests were executed against the isolated Firebase Emulator Suite (`demo-temple-accounts-test`, port 8080/9099) via `test_step_33_10_shared_numbering_suite.js`:

```text
========================================================================
   STEP 33.10 AUDIT EXECUTION SUMMARY
   Passed:     33
   Failed:     0
   Not Tested: 3
   Total:      36
   Verdict:    PASS
========================================================================
```

### 7.1 Detailed Test Assertions Matrix

| Test ID | Domain | Assertion Description | Expected | Actual Output | Status |
|---|---|---|---|---|:---:|
| `ENV-01` | Isolation | Air-gap verification: Target project is demo emulator | `demo-temple-accounts-test` | `demo-temple-accounts-test` | **PASS** |
| `ENV-02` | Isolation | Production project temple-f4f7d air-gapped | `temple-f4f7d` untouched | `UNTOUCHED` | **PASS** |
| `ENV-03` | Security | Hardened candidate rules loaded in emulator | HTTP 200 | HTTP 200 | **PASS** |
| `AUTH-01` | Authentication | 3 operational users authenticated (equal authority) | 3 users | 3 users authenticated | **PASS** |
| `NUM-01` | Shared Numbering | First bill in clean fixture allocated as BILL-0001 | `BILL-0001` | `BILL-0001` | **PASS** |
| `NUM-02` | Shared Numbering | First linked receipt allocated as R-0001 (matching) | `R-0001` | `R-0001` | **PASS** |
| `NUM-03` | Shared Numbering | First bill and receipt share doc ID suffix bill_1 / rcpt_1 | `bill_1 / rcpt_1` | `bill_1 / rcpt_1` | **PASS** |
| `NUM-04` | Shared Numbering | Second bill allocated as BILL-0002 | `BILL-0002` | `BILL-0002` | **PASS** |
| `NUM-05` | Shared Numbering | Second linked receipt allocated as R-0002 (matching) | `R-0002` | `R-0002` | **PASS** |
| `NUM-06` | Shared Numbering | Third bill allocated as BILL-0003 | `BILL-0003` | `BILL-0003` | **PASS** |
| `NUM-07` | Shared Numbering | Third linked receipt allocated as R-0003 (matching) | `R-0003` | `R-0003` | **PASS** |
| `NUM-08` | Shared Numbering | `billingReceiptCounter` at 3; `receiptCounter` at 1000 | `brc=3, rc=1000` | `brc=3, rc=1000` | **PASS** |
| `IND-01` | Independent Receipts | Independent receipt auto-allocated as R-1001 | `R-1001` | `R-1001` | **PASS** |
| `IND-02` | Independent Receipts | `receiptCounter` advanced to 1001; `billingReceiptCounter` at 3 | `rc=1001, brc=3` | `rc=1001, brc=3` | **PASS** |
| `IND-03` | Independent Receipts | Second independent receipt sequentially allocated as R-1002 | `R-1002` | `R-1002` | **PASS** |
| `IND-04` | Independent Receipts | Custom independent receipt R-9999 accepted | `R-9999` | `R-9999` | **PASS** |
| `IND-05` | Duplicate Safeguards | Duplicate manual receipt R-1001 blocked | Detected & blocked | Duplicate detected | **PASS** |
| `IND-06` | Duplicate Safeguards | Attempt to use billing-reserved R-0001 blocked | Detected & blocked | Reserved detected | **PASS** |
| `NUM-09` | Manual Billing | Custom bill number BILL-0099 accepted | `BILL-0099` | `BILL-0099` | **PASS** |
| `NUM-10` | Manual Billing | Linked receipt adopts matching numeric identifier R-0099 | `R-0099` | `R-0099` | **PASS** |
| `CONC-01` | Concurrency | Concurrent billing creation yields distinct sequential numbers | Distinct bill numbers | `BILL-0005, BILL-0006` | **PASS** |
| `SYNC-01` | Synchronization | Bidirectional ID and number links verified | `true` | `true` | **PASS** |
| `SYNC-02` | Void Workflow | Voiding bill atomically voids linked accounting receipt | `true` | `true` | **PASS** |
| `SYNC-03` | Void Workflow | Both documents retain voided: true and audit metadata | `true` | `true` | **PASS** |
| `SYNC-04` | Synchronization | Bill-linked receipt detected and locked against direct edits | Locked | Protected from direct edit | **PASS** |
| `SYNC-05` | Synchronization | Voiding independent receipt does not affect billing records | `true` | `true` | **PASS** |
| `REST-01` | Safe Restore | Unbacked-up billing records preserved (zero deletion) | `true` | `true` | **PASS** |
| `REST-02` | Safe Restore | Unbacked-up receipts preserved (zero deletion) | `true` | `true` | **PASS** |
| `REST-03` | Safe Restore | Counters merged monotonically without sequence rollback | `true` | `true` | **PASS** |
| `REST-04` | Safe Restore | Voided records and void flags survive backup restoration | `true` | `true` | **PASS** |
| `HIST-01` | Historical Preservation | Historical records with differing numbers remain unaltered | `true` | `true` | **PASS** |
| `REG-01` | Regression | Cash Book calculation excludes voided transactions | Active totals only | Excluded voided (₹1825 active) | **PASS** |
| `REG-02` | Regression | Payment voucher numbering remains independent | HTTP 200 | HTTP 200 (`V-501`) | **PASS** |
| `NT-01` | Hardware | Physical 58mm Thermal Printer Hardware Output | Physical paper printout | No physical printer in headless fixture | **NOT TESTED** |
| `NT-02` | Safety | Live Cloud Firestore (temple-f4f7d) Mutations | Production mutations | Zero production writes dispatched | **NOT TESTED** |
| `NT-03` | Safety | Live Production Rules Deployment (firebase deploy) | Rules deployed | Deployment strictly prohibited | **NOT TESTED** |

---

## 8. Regression Suite Verification

Existing regression suites were executed to verify zero regression across earlier project steps:

| Suite | Target | Assertions | Status | Notes |
|---|---|:---:|:---:|---|
| `test_step_33_8a_regression.js` | Cash Book, Bank Book, Reports, Voids, CSV | 19 / 19 | **PASS** | Zero failures |
| `test_step_33_9_deployment_readiness.js` | Candidate Rules, Equal User Authority, Audit Locks | 35 / 35 | **PASS** | All 3 users authenticated and authorized |
| `test_step_33_10_shared_numbering_suite.js` | Shared Numbering, Sync, Safe Restore | 33 / 33 | **PASS** | All domain tests passed |

---

## 9. Live UI Verification & Browser Screenshots

The application was loaded in Google Chrome via the browser subagent at `http://localhost:3001/Temple_Accounts-1.html`:
- **Console Errors:** `0` errors captured.
- **Receipts Form:**
  - Label: `Receipt Number (Leave blank to auto-allocate; preview: R-1020)`
  - Placeholder: `Auto-generated on save (e.g. R-1020)`
  - Helper note: `ℹ️ Next sequence preview is R-1020. Number is finalized atomically upon save. Independent receipts only.`
  - Screenshot verified: `receipts_form_1791636320186.png`
- **Billing Form:**
  - Bill Number field rendered with label `🔢 Bill Number (Leave blank for auto-generated BILL-XXXX)` and placeholder `Auto-generated`.
  - Screenshot verified: `billing_form_1791636399836.png`

---

## 10. Production Isolation Confirmation

- **Production Firestore:** `temple-f4f7d` was never contacted during any write-based test.
- **Production Rules:** `firestore.rules` is 100% bit-for-bit intact (`7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD`).
- **Production Config:** `firebase.json` is 100% bit-for-bit intact (`E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20`).
- **Candidate Rules:** `firestore.rules.candidate` remains quarantined.
- **Deployment Status:** No `firebase deploy` was dispatched.

---

## 11. Remaining Risks and Limitations

1. **Physical Hardware Output:** Physical 58mm thermal printing cannot be confirmed in a headless automated testing environment.
2. **Absence of Role-Based Access Control (RBAC):** Firebase Authentication tokens currently do not include custom claims (`token.role`). All three authenticated accounts have identical operational access at both the UI and Firestore rules levels.
3. **Database Reset via UI Disallowed:** Because `restoreBackup()` no longer physically deletes unbacked-up records, a total wipe/reset of the database cannot be performed from the client UI. A database reset must be conducted via administrative tools or Google Cloud Console if ever required.

---

## 12. Manual Testing Instructions

To manually test these features on the local development environment:

1. **Launch Local Servers:**
   - Ensure the Firebase Emulator is running: `firebase emulators:start --config firebase.emulator.json`
   - Ensure the local dev server is running: `http://localhost:3001/Temple_Accounts-1.html`
2. **Test Shared Billing Numbering:**
   - Navigate to **Billing / വഴിപാട്**.
   - Create a Pooja bill (e.g., Category: വഴിപാട്, Item: നെയ്യ് വിളക്ക്, Devotee: സുരേഷ്, Mode: Cash).
   - Leave the Bill Number field blank. Click **CREATE BILL**.
   - Observe the success banner: Note the bill number `BILL-XXXX` and the linked accounting receipt `R-XXXX`. Verify that their numeric portions match identically.
   - Navigate to **Receipts**: Verify that the linked receipt appears in the table with `R-XXXX` and `Status: Active`.
3. **Test Direct Edit Protection on Linked Receipt:**
   - In the Receipts table, locate the newly created billing receipt.
   - Click **Edit**: Observe the alert:
     > *"Receipt R-XXXX was generated from Pooja Bill BILL-XXXX. Direct editing of billing-linked receipts is not permitted... To make a correction, please void the bill in the Billing section and create a new bill."*
   - Verify that the form does not open and existing data is protected.
4. **Test Atomic Linked Voiding:**
   - Navigate back to **Billing / വഴിപാട്** -> **Billing History**.
   - Click **Void** on the bill. Enter reason: `Test cancellation`.
   - Confirm that the bill displays `● Voided` with watermark.
   - Navigate to **Receipts**: Confirm that the linked receipt `R-XXXX` is also automatically marked `Status: Voided`.
5. **Test Independent Receipt Creation:**
   - In **Receipts**, note the preview in the label `(preview: R-XXXX)`.
   - Fill in Devotee Name, Fund, Category, Amount (₹100), and leave Receipt Number blank. Click **SAVE**.
   - Verify that the independent receipt is saved with a number from the independent counter sequence (`R-1001`+), distinct from billing receipt numbers.
6. **Test Safe Restore:**
   - Navigate to **Settings** -> **Backup & Restore**.
   - Click **Download Backup** to export current state.
   - Create a new bill `BILL-YYYY`.
   - Upload the older backup file and click **RESTORE FROM FILE**.
   - Observe the progress log: Verify that it reports `0 deleted - safe merge` and that `BILL-YYYY` remains active in Billing History.
