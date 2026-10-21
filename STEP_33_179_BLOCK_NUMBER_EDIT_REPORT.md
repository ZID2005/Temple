# STEP 33.179 — Allow BLOCK NUMBER Mode When Editing Existing Receipts

**Date:** 2026-10-21  
**Target File:** `Temple_Accounts-1.html`  
**Test Suite:** `tests/test_step_33_179_block_number_edit_suite.js` (80/80 passed)  
**Safety Scope:** Local code changes and automated testing only. Zero production data mutations, zero counter resets, zero Git push, zero deployment.

---

## 1. Executive Summary

Previously, an administrator editing an existing numbered receipt (`R-XXX`) was blocked from toggling BLOCK NUMBER mode by a hardcoded barrier:
> `"Existing numbered receipts cannot be converted to unnumbered block receipts."`

In **STEP 33.179**, this restriction has been safely lifted for eligible ordinary software receipts while establishing strict architectural guards for physical counterfoil receipts (`P`/`PU`) and billing-linked receipts (`source: 'billing'`).

An administrator can now:
1. **Convert an eligible ordinary numbered receipt into an unnumbered receipt:** Atomically purge the old numbered record, reservation (`res_N`), and operation log, and persist a canonical unnumbered receipt (`receiptType: 'custom'`, `receiptNo: ''`, unique ID `c_...`). System counters are strictly preserved and never decremented or reset.
2. **Convert an unnumbered receipt to a numbered receipt:** Disable BLOCK NUMBER mode to atomically allocate a valid, sequential receipt number via forward monotonic allocation (`Math.max(curSeq, nextSeqNum)`), safely skipping occupied reservations and bills while protecting against concurrent collisions.
3. **Edit existing unnumbered receipts in place:** Modifying fields (fund, category, devotee, amount, date, etc.) preserves their unnumbered status (`receiptNo: ''`) without bumping counters or re-allocating numbers.
4. **Preserve physical and billing receipt integrity:** Physical receipts (`P600-P900`, `PU1+`) retain immutable counterfoil numbers; billing-linked receipts retain linked billing sync; voided receipts remain locked against tampering.

---

## 2. Root Cause & Architectural Analysis of Original Restriction

In earlier iterations of `Temple_Accounts-1.html`, the restriction was placed as a safeguard because:
1. Numbered receipts possessed entries across three distinct Firestore locations:
   - `receipts/rcpt_N` (the receipt document itself)
   - `system/res_N` (the reservation document preventing duplicate sequence allocation)
   - `system/op_rcpt_N` (the idempotent operation commit log)
2. Simple updates only executed `fsUpdateRecordSafe('receipts', editId, rec)`. If a numbered receipt had its `receiptNo` set to empty string `""` without cleaning up `res_N`, that sequence number remained permanently locked as "occupied" by a ghost reservation.
3. Conversely, converting an unnumbered receipt to numbered mode had no transactional workflow to guarantee atomic number allocation without race conditions or counter corruption.

---

## 3. Implementation Details

### 3.1. Authoritative Mode Conversion Operations

Two atomic transactional functions were designed and integrated into `Temple_Accounts-1.html`:

#### A. Numbered to Unnumbered Conversion (`fsConvertNumberedReceiptToUnnumbered`)
- **Execution:** Runs inside `db.runTransaction()`.
- **Pre-flight Checks:** Ensures the record is not voided, not physical, and not billing-linked.
- **Atomic Operations:**
  1. Writes the new canonical unnumbered receipt:
     - `id`: `c_<timestamp>_<random6>`
     - `firestoreId`: `rcpt_c_<timestamp>_<random6>`
     - `receiptNo`: `""`
     - `receiptType`: `'custom'`
     - Audit fields: `convertedFromReceiptNo: 'R-XXX'`, `convertedFromId: N`, `convertedAt: <timestamp>`
  2. Deletes the old numbered receipt document (`receipts/rcpt_N`).
  3. Deletes the old reservation document (`system/res_N`).
  4. Deletes the old operation document (`system/op_rcpt_N`).
- **Counter Safety:** Strictly preserves `globalSequenceCounter`, `billingReceiptCounter`, and `receiptCounter`. Counters are never decremented or rolled back.
- **Cache Eviction:** Automatically deletes the old document keys from IndexedDB (`receipts` store) and inserts the new unnumbered record.

#### B. Unnumbered to Numbered Conversion (`fsConvertUnnumberedReceiptToNumbered`)
- **Execution:** Runs inside `db.runTransaction()`.
- **Pre-flight Checks:** Ensures original receipt exists and is not voided.
- **Sequence Allocation:**
  - Reads `system/counters` to obtain `curSeq = globalSequenceCounter`.
  - Determines `nextSeqNum = curSeq + 1`.
  - Performs an iterative reservation and document existence check:
    ```javascript
    while (resSnap.exists || bSnap.exists || rSnap.exists) {
      nextSeqNum++;
      [resSnap, bSnap, rSnap] = await Promise.all([tx.get(resRef), tx.get(billRef), tx.get(rcptRef)]);
    }
    ```
- **Atomic Operations:**
  1. Writes new reservation document (`system/res_N`) with `status: 'active'`, `type: 'independent_receipt'`.
  2. Writes new numbered receipt (`receipts/rcpt_N`) with `receiptNo: 'R-XXX'`, `receiptType: 'independent'`, and audit trail `convertedFromUnnumberedId: 'c_...'`.
  3. Writes operation log (`system/op_rcpt_N`).
  4. Deletes old unnumbered receipt (`receipts/rcpt_c_...`).
  5. Monotonically advances `globalSequenceCounter` forward via `Math.max(curSeq, nextSeqNum)`.
- **Cache Synchronization:** Evicts old `c_...` key from IndexedDB, stores new `rcpt_N` record, and updates in-memory `APP_SETTINGS`.

---

### 3.2. Form Lifecycle & UI Handlers

1. **`VIEW_RENDERERS.receipts` (Edit Mode Initialization):**
   - Renders the BLOCK NUMBER toggle button with radial glow classes in edit mode.
   - For existing unnumbered receipts (`editRec.receiptType === 'custom'`), displays `#block-receipt-banner` with the "Exit Block Number Mode" button.
   - Embeds hidden inputs:
     - `blockModeAction`: Set dynamically to `'convertToUnnumbered'` or `'convertToNumbered'`.
     - `isBlockReceiptMode`: Tracks active toggle state (`'1'` or `'0'`).
     - `originalReceiptNo`: Stores cached original identifier.
     - `originalReceiptType`: Tracks original type (`'custom'`, `'independent'`, etc.).
   - Dynamically updates the form title:
     - `Edit Receipt (Unnumbered)`
     - `Edit Receipt R-XXX`
     - `Edit Receipt P600 [PHYSICAL]`
     - `Edit Receipt PU1 [PHYSICAL · PUNARUDHARANAM]`

2. **`toggleBlockReceiptMode(forceState)`:**
   - Evaluates guards immediately:
     - If `isBillingLinked`, alerts: `"Billing-linked receipts cannot be converted to unnumbered block receipts."`
     - If `isPhysicalRec`, alerts: `"Physical receipts (P / PU) have fixed counterfoil identifiers and cannot be converted to unnumbered block receipts."`
   - Dynamically adjusts the receipt input:
     - When activating BLOCK NUMBER: locks input to `""`, disabled, read-only, sets badge `"UNNUMBERED RECEIPT — NO RECEIPT NUMBER"`.
     - When deactivating BLOCK NUMBER: restores cached original receipt number if returning to numbered, or displays `"Auto-allocated on update (e.g. R-XXX)"` placeholder if converting an unnumbered receipt.

3. **`cancelReceiptForm()`:**
   - Fully resets `isBlockReceiptMode = false`, `isBlockNumberMode = false`, `_cachedEditReceiptNo = null`, `_explicitBlockModeDisabled = false`, `_explicitBlockModeEnabled = false`, and clears global edit state.

---

### 3.3. Conversion Matrix

| Original Receipt Type | Target Mode | Allowed? | Behavior & Enforcement |
|:---|:---|:---:|:---|
| **Ordinary Numbered (`R-XXX`)** | **Unnumbered** | ✅ **YES** | Converted via `fsConvertNumberedReceiptToUnnumbered`. Old `rcpt_N`, `res_N`, `op_N` deleted; new `rcpt_c_...` created; counters untouched. |
| **Unnumbered (`c_...`)** | **Numbered** | ✅ **YES** | Converted via `fsConvertUnnumberedReceiptToNumbered`. New `R-XXX` allocated sequentially; `res_N` created; old `rcpt_c_...` deleted; counter advanced forward. |
| **Unnumbered (`c_...`)** | **Unnumbered (Edit)** | ✅ **YES** | In-place edit. Preserves `receiptType: 'custom'`, `receiptNo: ''`. Zero counter movement. |
| **Physical Puja (`P600–P900`)** | **Unnumbered** | 🛑 **NO** | Blocked with alert: fixed physical counterfoil book identifier. |
| **Physical Punarudharanam (`PU1+`)** | **Unnumbered** | 🛑 **NO** | Blocked with alert: fixed physical counterfoil book identifier. |
| **Billing-Linked (`source: 'billing'`)** | **Unnumbered** | 🛑 **NO** | Blocked with alert: linked to commercial Pooja Bill; dual-record sync invariant required. |
| **Voided Receipt** | **Any** | 🛑 **NO** | Blocked with alert: voided records cannot be edited or converted. |

---

## 4. Test Results

A dedicated automated test suite was constructed and executed:  
**`tests/test_step_33_179_block_number_edit_suite.js`**

### Test Results Breakdown:

```
================================================================================
STEP 33.179: ALLOW BLOCK NUMBER MODE WHEN EDITING EXISTING RECEIPTS TEST SUITE
================================================================================

--- GROUP 1: Code Inspection & Removal of Old Restriction ---
  ✅ [PASS] T1.1: Old restriction alert "Existing numbered receipts cannot be converted..." is safely removed
  ✅ [PASS] T1.2: BLOCK NUMBER button exists with id="btn-block-receipt"
  ✅ [PASS] T1.3: Hidden input blockModeAction exists for tracking explicit conversion actions
  ✅ [PASS] T1.4: Hidden input originalReceiptNo exists for caching original identifier
  ✅ [PASS] T1.5: Hidden input originalReceiptType exists for tracking original type
  ✅ [PASS] T1.6: fsConvertNumberedReceiptToUnnumbered is defined and exported
  ✅ [PASS] T1.7: fsConvertUnnumberedReceiptToNumbered is defined and exported

--- GROUP 2: In-place Editing of Existing Unnumbered Receipts ---
  ✅ [PASS] T2.1: Edited unnumbered receipt document still exists at original doc ID
  ✅ [PASS] T2.2: Edited unnumbered receipt preserved empty receiptNo
  ✅ [PASS] T2.3: Edited unnumbered receipt preserved receiptType: "custom" (custom)
  ✅ [PASS] T2.4: Fund updated to "Punarudharanam Fund" (Punarudharanam Fund)
  ✅ [PASS] T2.5: Amount updated to 2000 (2000)
  ✅ [PASS] T2.6: globalSequenceCounter strictly untouched (remains 50) (50)

--- GROUP 3: Converting Ordinary Numbered Receipt (R-050) to Unnumbered Mode ---
  ✅ [PASS] T3.1: Old numbered receipt doc "rcpt_50" atomically deleted from Firestore
  ✅ [PASS] T3.2: Old reservation doc "res_50" atomically deleted from Firestore
  ✅ [PASS] T3.3: Old operation doc "op_rcpt_seed_50" atomically deleted from Firestore
  ✅ [PASS] T3.4: Old numbered receipt evicted from IndexedDB cache
  ✅ [PASS] T3.5: New canonical unnumbered receipt exists in Firestore
  ✅ [PASS] T3.6: Converted receipt has receiptNo empty string
  ✅ [PASS] T3.7: Converted receipt has receiptType: "custom" (custom)
  ✅ [PASS] T3.8: Converted receipt ID follows canonical "c_..." format (c_1792597601646_2557cu)
  ✅ [PASS] T3.9: Audit trail preserved: convertedFromReceiptNo is "R-050" (R-050)
  ✅ [PASS] T3.10: Audit trail preserved: convertedFromId is 50 (50)
  ✅ [PASS] T3.11: Financial field fund preserved as "Festival Fund" (Festival Fund)
  ✅ [PASS] T3.12: Amount correctly saved as 750 (750)
  ✅ [PASS] T3.13: globalSequenceCounter strictly NOT decremented or reset (remains 50) (50)

--- GROUP 4: Converting Unnumbered Receipt to Numbered Mode ---
  ✅ [PASS] T4.1: Old unnumbered document atomically deleted from Firestore
  ✅ [PASS] T4.2: Old unnumbered document evicted from IndexedDB cache
  ✅ [PASS] T4.3: New numbered document "rcpt_51" created in Firestore
  ✅ [PASS] T4.4: New numbered document assigned sequential id 51 (51)
  ✅ [PASS] T4.5: New numbered document assigned receiptNo "R-051" (R-051)
  ✅ [PASS] T4.6: New receiptType is "independent" (independent)
  ✅ [PASS] T4.7: reservationDocId set to "res_51" (res_51)
  ✅ [PASS] T4.8: Audit trail preserved: convertedFromUnnumberedId recorded (c_1792597601646_2557cu)
  ✅ [PASS] T4.9: Reservation doc "res_51" created in Firestore
  ✅ [PASS] T4.10: Reservation doc holds receiptNo "R-051" (R-051)
  ✅ [PASS] T4.11: globalSequenceCounter monotonically advanced to 51 (51)

--- GROUP 5: Sequence Collision & Reservation Skipping During Conversion ---
  ✅ [PASS] T5.1: Allocated receipt skipped occupied res_52 and bill_53 to reach sequence 54
  ✅ [PASS] T5.2: Allocated receipt receiptNo is R-054 (R-054)
  ✅ [PASS] T5.3: globalSequenceCounter advanced to 54 (54)

--- GROUP 6: Physical Receipts Guarding (P600-P900 and PU1+) ---
  ✅ [PASS] T6.1: toggleBlockReceiptMode rejects physical P receipt conversion with alert
  ✅ [PASS] T6.2: toggleBlockReceiptMode rejects physical PU receipt conversion with alert
  ✅ [PASS] T6.3: saveReceipt rejects physical receipt conversion to block receipt
  ✅ [PASS] T6.4: Physical receipt P600 remains intact and uncorrupted

--- GROUP 7: Billing-Linked Receipts Guarding ---
  ✅ [PASS] T7.1: toggleBlockReceiptMode rejects billing-linked receipt conversion with alert
  ✅ [PASS] T7.2: saveReceipt rejects billing-linked receipt conversion with alert
  ✅ [PASS] T7.3: Billing doc and accounting receipt remain intact, never deleted

--- GROUP 8: Voided Receipts Guarding ---
  ✅ [PASS] T8.1: saveReceipt rejects editing voided receipts

--- GROUP 9: Form Lifecycle, Preview, and Cancel Behaviors ---
  ✅ [PASS] T9.1: cancelReceiptForm resets isBlockReceiptMode to false
  ✅ [PASS] T9.2: cancelReceiptForm resets isBlockNumberMode to false
  ✅ [PASS] T9.3: cancelReceiptForm clears _cachedEditReceiptNo
  ✅ [PASS] T9.4: cancelReceiptForm resets _explicitBlockModeDisabled
  ✅ [PASS] T9.5: cancelReceiptForm resets _explicitBlockModeEnabled
  ✅ [PASS] T9.6: updateReceiptNoPreview preserves blank input during block mode

--- GROUP 10: Concurrency Simulation on Sequential Conversion ---
  ✅ [PASS] T10.1: Both concurrent conversions completed successfully
  ✅ [PASS] T10.2: Concurrent conversions received distinct IDs (55 vs 56)
  ✅ [PASS] T10.3: Concurrent conversions received distinct receipt numbers (R-055 vs R-056)
  ✅ [PASS] T10.4: Concurrent conversions allocated sequential numbers 55 and 56

--- GROUP 11: End-to-End Preservation of All 11 Financial & Donor Fields ---
  ✅ [PASS] T11.1: Converted document found in Firestore
  ✅ [PASS] T11.2: Date preserved (2026-10-22)
  ✅ [PASS] T11.3: Name preserved (Devotee Eleven Fields Updated)
  ✅ [PASS] T11.4: Mobile preserved (9845112233)
  ✅ [PASS] T11.5: Star preserved (Revathi)
  ✅ [PASS] T11.6: Description preserved (Special Archana & Abhishekham (Updated))
  ✅ [PASS] T11.7: Fund preserved (Punarudharanam Fund)
  ✅ [PASS] T11.8: Category preserved (Donation Income)
  ✅ [PASS] T11.9: Payment mode preserved (Bank)
  ✅ [PASS] T11.10: Bank account preserved (SBI Temple Main)
  ✅ [PASS] T11.11: Amount preserved (1800)
  ✅ [PASS] T11.12: Remarks preserved (All 11 fields updated and preserved)
  ✅ [PASS] T11.13: Fund and category remain completely independent

--- GROUP 12: VIEW_RENDERERS.receipts Edit UI Inspection ---
  ✅ [PASS] T12.1: Edit form title for unnumbered receipt is "Edit Receipt (Unnumbered)"
  ✅ [PASS] T12.2: Block receipt banner present in edit form
  ✅ [PASS] T12.3: Exit Block Number Mode button rendered
  ✅ [PASS] T12.4: Hidden originalReceiptType is "custom"
  ✅ [PASS] T12.5: Edit form title for numbered receipt includes "Edit Receipt R-070"
  ✅ [PASS] T12.6: Hidden originalReceiptNo is "R-070"
  ✅ [PASS] T12.7: BLOCK NUMBER button rendered in numbered edit form
  ✅ [PASS] T12.8: Edit form title for Physical P receipt includes "[PHYSICAL]"
  ✅ [PASS] T12.9: Edit form title for Physical PU receipt includes "[PHYSICAL · PUNARUDHARANAM]"

================================================================================
STEP 33.179 TEST SUMMARY: 80/80 TESTS PASSED (0 FAILED)
================================================================================
```

### Full Regression Matrix Results:

| Suite | Focus Area | Result |
|:---|:---|:---:|
| `test_step_33_175_block_receipt_suite.js` | BLOCK NUMBER Mode Creation & Counter Safety | **76 / 76 PASS** (100%) |
| `test_step_33_176_receipt_fund_sync_suite.js` | Receipt Fund Selection & Category Independence | **53 / 53 PASS** (100%) |
| `test_step_33_177_billing_number_reuse_suite.js` | Billing Number Reuse & Reservation Concurrency | **107 / 107 PASS** (100%) |
| `test_step_33_179_block_number_edit_suite.js` | Editing Receipts & Bidirectional Mode Conversion | **80 / 80 PASS** (100%) |
| **Total Passed** | **All Invariants Verified** | **316 / 316 PASS** (100%) |

---

## 5. Verification Checklist & Guarantees

- [x] **Restriction Lifted Safely:** Old blocking alert removed for eligible ordinary software receipts.
- [x] **No Duplicate Active Receipts:** Atomically deletes old document upon conversion in transaction.
- [x] **No Lingering Reservations:** Atomically deletes `res_N` reservation upon numbered-to-unnumbered conversion.
- [x] **No Counter Rollback:** Sequence counters (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`) are strictly protected against backward decrements.
- [x] **Concurrency & Monotonicity:** Unnumbered-to-numbered conversion allocates forward via `Math.max(curSeq, nextSeqNum)` and skips occupied numbers.
- [x] **Immutable Physical Counterfoils:** Physical Puja (`P600–P900`) and Punarudharanam (`PU1+`) receipts reject conversion with clear UI alerts.
- [x] **Billing Protection:** Linked billing transactions are never altered or deleted as a side effect.
- [x] **Zero Production Mutation:** Tested strictly via local automated harnesses; no deployment or Git push performed.
