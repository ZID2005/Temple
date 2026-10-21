# Step 33.175 — Block Number Mode to Receipts with Matching Radial Glow Animation

**Project:** Temple Accounts  
**Primary File:** `Temple_Accounts-1.html`  
**Pre-change Backup:** `Temple_Accounts-1_PreStep33_175_BlockNumberReceipts_Backup_20261021_181100.html` (1,268,275 bytes)  
**Verification Suite:** `tests/test_step_33_175_block_receipt_suite.js` (76/76 PASS)  
**Regression Suites Passed:** 317/317 PASS (Steps 33.163, 33.164, 33.173, 33.174, 33.175)

---

## 1. Executive Summary

In Step 33.175, the **BLOCK NUMBER** mode was introduced to the Receipts module in `Temple_Accounts-1.html`, providing exact parity with the **CUSTOM** payment mode implemented in Steps 33.173 and 33.174. 

When the administrator activates **BLOCK NUMBER**, the new receipt form enters an unnumbered state:
1. The receipt number input (`#receiptNo`) is immediately blanked, disabled (`disabled = true`, `readOnly = true`), and marked with `aria-disabled="true"` with placeholder `— (No Receipt Number)`.
2. A prominent visual banner (`#block-receipt-banner`) announces:  
   `🛑 UNNUMBERED RECEIPT — NO RECEIPT NUMBER (Click BLOCK NUMBER again or Cancel to exit)`.
3. The compact button (`#btn-block-receipt`) switches to an active state (`.is-active`, `aria-pressed="true"`), displaying the animated radial glow and revolving shine effect matching the Payments reference design.
4. Saving the unnumbered receipt persists all accounting effects, donor information, fund allocations, and financial balances, while strictly **bypassing sequence counters** (`globalSequenceCounter`, `receiptCounter`, `billingReceiptCounter`). The document is stored with `receiptType: "custom"`, `receiptNo: ""`, `id: "c_..."`, and `firestoreId: "rcpt_c_..."`.
5. The subsequent normal receipt receives the exact next sequential number without skipping (e.g., `R-026` → unnumbered receipt `—` → `R-027`).
6. All downstream touchpoints—Receipts table, 80mm thermal printing, Cash Book, Bank Book, Ledger, Global Search, CSV export, and Delete modal—cleanly format the unnumbered receipt without inventing an arbitrary receipt number.

---

## 2. Architectural Analysis & Existing Receipt System

Before making changes, the existing receipt architecture was analyzed to ensure zero disruption to physical P/PU receipts, billing-linked receipts, and sequential software receipts:

| Mechanism | Software Receipts (`independent`) | Physical Receipts (`P` / `PU`) | Billing-Linked Receipts (`billing`) | Unnumbered Receipts (`custom`) |
| :--- | :--- | :--- | :--- | :--- |
| **Number Format** | `R-001`, `R-026`, etc. | `P600`–`P900`, `PU1`+ | `BILL-001` / `R-001` (unified) | `""` (Empty string, displays as `—`) |
| **Allocation Path** | `fsCreateIndependentReceipt` | `fsCreateIndependentReceipt` (manual) | `fsCreateBillingRecord` | `fsSaveRecordSafe('receipts', rec, false)` |
| **Document ID** | `rcpt_<seq>` | `rcpt_phys_<canon>` | `rcpt_<seq>` / `bill_<seq>` | `rcpt_c_<timestamp>_<rand>` |
| **Sequence Counter Effect** | Increments `globalSequenceCounter` & `receiptCounter` | Validates manual range; does NOT increment sequence | Increments `globalSequenceCounter` | **STRICTLY UNTOUCHED (0 increment, 0 reservation)** |
| **Table Badge** | Software | `PHYSICAL` / `PHYSICAL · PUNARUDHARANAM` | Billing-linked badge | `UNNUMBERED` (Gradient `#1f3f6d` → `#469396`) |
| **Print Header** | `No: R-026` | `No: PU12` + Physical Banner | `No: BILL-001` | `UNNUMBERED RECEIPT` + `[UNNUMBERED RECEIPT]` |

---

## 3. Implementation Details

### 3.1 Button Positioning & Radial Glow Animation

The `#btn-block-receipt` element was added directly after the `#btn-cancel-receipt` element inside `VIEW_RENDERERS.receipts`:

```html
<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
  <button type="button" id="btn-save-receipt" onclick="saveReceipt(false, false)">Save Receipt</button>
  <button type="button" class="btn-green" id="btn-save-print-receipt" onclick="saveReceipt(true, false)">Save & Print</button>
  <button type="button" class="btn-sec" id="btn-cancel-receipt" onclick="cancelReceiptForm()">Cancel</button>
  <button type="button" class="btn-block-receipt rg-button" id="btn-block-receipt" 
          onclick="toggleBlockReceiptMode()" 
          title="Block Number — Save without receipt number" 
          aria-label="Block receipt number and save unnumbered receipt" 
          aria-pressed="false">
    <span class="rg-shine" aria-hidden="true"></span>
    <span class="rg-bg" aria-hidden="true"></span>
    <span class="rg-label">
      <span class="rg-icon" aria-hidden="true">🛑</span>
      <span class="rg-text">BLOCK NUMBER</span>
    </span>
  </button>
</div>
```

The CSS styles in `Temple_Accounts-1.html` were extended to support `.btn-block-receipt.rg-button`:
- GPU-accelerated keyframe animation (`rg-spin`, `rg-slide`) driven by `@property --rg-pos-x` and `@property --rg-color-1`.
- Inactive state: clean, high-contrast outline button matching temple admin aesthetics.
- Active state (`.is-active`): vibrant radial glow, rotating shine highlight, and animated border gradient.
- Accessibility: `@media (prefers-reduced-motion: reduce)` disables rotational animations while maintaining clear visual indicator borders.

### 3.2 Visual Mode Indicator Banner

The `#block-receipt-banner` element was inserted immediately above the form grid:

```html
<div id="block-receipt-banner" class="block-receipt-banner" style="display:none;" role="status" aria-live="polite">
  <div class="block-receipt-banner-icon">🛑</div>
  <div class="block-receipt-banner-content">
    <div class="block-receipt-banner-title">UNNUMBERED RECEIPT — NO RECEIPT NUMBER</div>
    <div class="block-receipt-banner-desc">This receipt will be saved without allocating a sequential receipt number. All donor, fund, and payment details are preserved. Click BLOCK NUMBER again or Cancel to exit.</div>
  </div>
</div>
```

### 3.3 Receipt Number Field Locking & Invariant Protection

When `toggleBlockReceiptMode()` is called:
- `#receiptNo` is immediately blanked (`input.value = ''`), disabled (`disabled = true`, `readOnly = true`), and assigned `aria-disabled="true"`.
- The placeholder changes to `— (No Receipt Number)`.
- If exiting block mode, the cached sequential preview (e.g. `R-026`) is cleanly restored without touching or advancing the counter.
- Receipt preview handlers (`updateReceiptNoPreview` and `onReceiptNoInput`) are strictly guarded with `if (window.isBlockReceiptMode || window.isBlockNumberMode) return;` so asynchronous counter previews cannot repopulate the field while in block mode.
- Form inputs (devotee name, amount, fund, category, remarks, mobile, star) are strictly preserved across mode toggles.

### 3.4 Unnumbered Receipt Persistence

In `saveReceipt(print, isBlock = false)`:
- `effectiveIsBlock` evaluates `isBlock || window.isBlockReceiptMode || window.isBlockNumberMode`.
- Physical receipt detection (`parsePhysicalReceiptIdentifier`) is bypassed when `effectiveIsBlock` is active.
- Sequence counter advance (`fsCreateIndependentReceipt`) is bypassed.
- The document is constructed and saved directly via `fsSaveRecordSafe`:
  ```javascript
  const customId = isEditing ? editId : ('c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
  rec.id = customId;
  rec.firestoreId = isEditing ? (editId.startsWith('rcpt_') ? editId : ('rcpt_' + editId)) : ('rcpt_' + customId);
  rec.receiptNo = '';
  rec.receiptType = 'custom';
  await fsSaveRecordSafe('receipts', rec, !isEditing);
  ```
- Form lifecycle: On success, `window.isBlockReceiptMode` resets to `false`, `.is-active` is cleared, and navigation proceeds to receipts. On validation failure (e.g. empty devotee name), block mode and entered fields remain intact.

### 3.5 Sequential Numbering Preservation (`R-026` → `—` → `R-027`)

The sequential numbering invariant was verified through automated Firestore state testing:
1. Normal Receipt Saved: Sequence counter allocates `R-026`, counter moves from 25 → 26.
2. Block Receipt Saved: Document saved with `receiptType: "custom"`, `receiptNo: ""`. Sequence counters (`globalSequenceCounter`, `receiptCounter`) remain **strictly at 26**.
3. Next Normal Receipt Saved: Sequence counter increments from 26 → 27, allocating `R-027`.
   **Zero numbers skipped, zero gaps created.**

### 3.6 Downstream Touchpoint Integration

| Touchpoint | Line(s) | Implementation Details |
| :--- | :--- | :--- |
| **Receipts Table** | ~9610–9650 | Renders `<b>—</b>` and `<span class="badge badge-custom-receipt">UNNUMBERED</span>`. Filter dropdown includes `<option value="custom">Unnumbered (Block)</option>`. |
| **80mm Thermal Print** | ~10360–10405 | Recognizes `isCustom`. Renders `UNNUMBERED RECEIPT` and `[UNNUMBERED RECEIPT]` badge without inventing `No: ` or `No: —`. |
| **Cash Book** | ~15746 | Formats `particulars` as `Receipt - Devotee` when `receiptNo` is empty, avoiding awkward gaps. Total balances reflect donor income accurately. |
| **Bank Book** | ~15848 | Formats `particulars` as `Receipt - Devotee (Bank)` when `receiptNo` is empty. Bank deposit amounts reconcile accurately. |
| **General Ledger** | ~16244, ~16265 | Sets `voucher: r.receiptNo \|\| ''`. Renders `—` in table. Debit/credit balance remains mathematically exact. |
| **Global Search** | ~20552, ~20560 | Searches by devotee name, amount, category, and remarks. Displays `— · Date · Devotee — Amount`. |
| **CSV Export** | ~20516–20522 | Exports `ReceiptNo: ""` and `Type: "Unnumbered"`. Physical PU/P receipts are never mislabeled as unnumbered. |
| **Delete Modal** | ~10581, ~10677 | Confirmation modal displays `Receipt Number: — (Unnumbered)` instead of document ID `c_...`. Permanent delete removes document without counter mutation. |

---

## 4. Safety Guarantees

1. **Physical P/PU Receipt Isolation:** Physical receipt numbers (`P600–P900`, `PU1+`) require a valid physical identifier. An unnumbered receipt with `receiptNo: ""` is explicitly recognized as `isCustom` and never falls back to physical receipt logic.
2. **Billing-Linked Receipts Isolation:** Billing-linked receipts (`source: 'billing'`) cannot be converted to block receipts. Attempting to click BLOCK NUMBER while editing a billing-linked receipt triggers an alert and halts execution.
3. **Existing Numbered Receipts Guard:** When editing an existing numbered receipt, activating BLOCK NUMBER is prevented with an informative message to avoid stripping allocated sequential numbers.
4. **Idempotent Double-Click Protection:** Double submission protection (`window.isReceiptSaving`) guards against concurrent saves, ensuring unique document generation.

---

## 5. Verification & Test Evidence

### 5.1 Step 33.175 Automated Test Suite (`tests/test_step_33_175_block_receipt_suite.js`)

A dedicated 76-assertion test suite was built and executed:

```
================================================================================
STEP 33.175: BLOCK NUMBER MODE, RECEIPT LOCK & RADIAL GLOW TEST SUITE
================================================================================

--- GROUP 1: HTML Structure & CSS Inspection ---
  ✅ [PASS] T1.1: BLOCK NUMBER button present with id="btn-block-receipt"
  ✅ [PASS] T1.2: BLOCK NUMBER button incorporates rg-button radial glow class
  ✅ [PASS] T1.3: Receipt radial glow shine container present
  ✅ [PASS] T1.4: Receipt radial glow background container present
  ✅ [PASS] T1.5: Receipt radial glow label present
  ✅ [PASS] T1.6: BLOCK NUMBER button invokes toggleBlockReceiptMode()
  ✅ [PASS] T1.7: Block receipt banner element present
  ✅ [PASS] T1.8: Visual banner text displays UNNUMBERED RECEIPT — NO RECEIPT NUMBER
  ✅ [PASS] T1.9: Receipt number input has explicit id="receiptNo"
  ✅ [PASS] T1.10: Receipt number label has explicit id="receiptNoLabel"
  ✅ [PASS] T1.11: Active block receipt CSS styling defined with glow & animations
  ✅ [PASS] T1.12: CSS styling for .block-receipt-banner defined
  ✅ [PASS] T1.13: Receipt table filter has Unnumbered (Block) option
  ✅ [PASS] T1.14: Receipt table renders badge-custom-receipt for unnumbered receipts
  ✅ [PASS] T1.15: BLOCK NUMBER button is placed after CANCEL button in receipt form

--- GROUP 2: Block Mode Toggle & Receipt Field Lock ---
  ✅ [PASS] T2.1: Initial receipt form is in normal mode
  ✅ [PASS] T2.2: Initial receipt field contains preview R-026
  ✅ [PASS] T2.3: Initial receipt field is enabled
  ✅ [PASS] T2.4: Activating BLOCK NUMBER sets isBlockReceiptMode=true
  ✅ [PASS] T2.5: isBlockNumberMode alias also synchronized to true
  ✅ [PASS] T2.6: Activating BLOCK NUMBER immediately clears receipt number input
  ✅ [PASS] T2.7: Activating BLOCK NUMBER disables receipt number input
  ✅ [PASS] T2.8: Activating BLOCK NUMBER makes receipt number input readOnly
  ✅ [PASS] T2.9: Activating BLOCK NUMBER sets aria-disabled="true"
  ✅ [PASS] T2.10: Input placeholder informs user of unnumbered status
  ✅ [PASS] T2.11: Activating BLOCK NUMBER displays block-receipt-banner
  ✅ [PASS] T2.12: Activating BLOCK NUMBER adds .is-active to button
  ✅ [PASS] T2.13: BLOCK NUMBER button aria-pressed="true"
  ✅ [PASS] T2.14: Devotee name preserved across activation
  ✅ [PASS] T2.15: Receipt amount preserved across activation
  ✅ [PASS] T2.16: Clicking BLOCK NUMBER again exits mode (isBlockReceiptMode=false)
  ✅ [PASS] T2.17: Exiting block mode re-enables receipt number input
  ✅ [PASS] T2.18: Exiting block mode sets readOnly=false
  ✅ [PASS] T2.19: Exiting block mode restores cached preview R-026 without consuming a sequence number
  ✅ [PASS] T2.20: Exiting block mode hides block-receipt-banner
  ✅ [PASS] T2.21: Exiting block mode removes .is-active from button
  ✅ [PASS] T2.22: BLOCK NUMBER button aria-pressed="false"
  ✅ [PASS] T2.23: Counters strictly untouched (remain 25) during toggle cycles

--- GROUP 3: Receipt Preview Handlers Guarded During Block Mode ---
  ✅ [PASS] T3.1: updateReceiptNoPreview does not overwrite locked blank field during block mode
  ✅ [PASS] T3.2: updateReceiptNoPreview updates internal cache for future normal receipts
  ✅ [PASS] T3.3: onReceiptNoInput immediately forces blank when block mode is active
  ✅ [PASS] T3.4: Billing-linked receipt is guarded against block mode activation
  ✅ [PASS] T3.5: Helpful alert shown when attempting block mode on billing receipt

--- GROUP 4: Save Invariant & Counter Safety ---
  ✅ [PASS] T4.1: First normal receipt advances globalSequenceCounter to 26
  ✅ [PASS] T4.2: First normal receipt advances receiptCounter to 26
  ✅ [PASS] T4.3: Normal receipt saved with sequential number R-026
  ✅ [PASS] T4.4: Normal receipt has receiptType: "independent"
  ✅ [PASS] T4.5: globalSequenceCounter strictly NOT advanced by unnumbered receipt (remains 26)
  ✅ [PASS] T4.6: receiptCounter strictly NOT advanced by unnumbered receipt (remains 26)
  ✅ [PASS] T4.7: Unnumbered receipt found in Firestore store
  ✅ [PASS] T4.8: Unnumbered receipt has receiptNo strictly equal to empty string ""
  ✅ [PASS] T4.9: Unnumbered receipt has receiptType: "custom"
  ✅ [PASS] T4.10: Unnumbered receipt document ID starts with "c_"
  ✅ [PASS] T4.11: Unnumbered receipt firestoreId starts with "rcpt_c_"
  ✅ [PASS] T4.12: Amount correctly saved as 1000
  ✅ [PASS] T4.13: Successful block save cleanly resets isBlockReceiptMode to false
  ✅ [PASS] T4.14: Next normal receipt advances counter to 27
  ✅ [PASS] T4.15: Next normal receipt receives exact sequential number R-027 without skipping

--- GROUP 5: Validation Failure Retains Block Mode ---
  ✅ [PASS] T5.1: Validation failure preserves isBlockReceiptMode=true
  ✅ [PASS] T5.2: Form fields preserved on validation failure
  ✅ [PASS] T5.3: Active button styling preserved on validation failure

--- GROUP 6: Editing Unnumbered & Normal Receipts ---
  ✅ [PASS] T6.1: Edited unnumbered receipt updated in store
  ✅ [PASS] T6.2: Edited unnumbered receipt still has receiptNo: ""
  ✅ [PASS] T6.3: Edited unnumbered receipt preserves receiptType: "custom"
  ✅ [PASS] T6.4: Updated amount reflects in store
  ✅ [PASS] T6.5: Counters remain 27 across unnumbered receipt edit

--- GROUP 7: Accounting & Display Touchpoints ---
  ✅ [PASS] T7.1: Print receipt outputs UNNUMBERED RECEIPT header
  ✅ [PASS] T7.2: Print receipt does not output empty No: prefix
  ✅ [PASS] T7.3: Delete modal displays "— (Unnumbered)" instead of internal document ID
  ✅ [PASS] T7.4: Unnumbered receipt included in Cash Book rows
  ✅ [PASS] T7.5: Cash Book particulars format cleanly as "Receipt - Devotee"
  ✅ [PASS] T7.6: Cash Book balance remains numeric and valid
  ✅ [PASS] T7.7: Unnumbered bank receipt included in Bank Book rows
  ✅ [PASS] T7.8: Bank Book particulars format cleanly as "Receipt - Devotee (Bank)"
  ✅ [PASS] T7.9: CSV export correctly sets type "Unnumbered" and receiptNo ""
  ✅ [PASS] T7.10: CSV export correctly preserves Physical PU receipts

================================================================================
STEP 33.175 TEST SUMMARY: 76/76 TESTS PASSED (0 FAILED)
================================================================================
```

### 5.2 Full Regression Suite Summary

All test suites across the voucher, receipt, and payment systems were re-executed:

| Test Suite | Scope | Result |
| :--- | :--- | :--- |
| `test_step_33_175_block_receipt_suite.js` | Block Number Receipt Mode, UI, Radial Glow, Invariants | **76/76 PASS** (100%) |
| `test_step_33_174_custom_mode_suite.js` | Custom Payment Mode, Voucher Lock, Radial Glow | **68/68 PASS** (100%) |
| `test_step_33_173_custom_payment_suite.js` | Custom Unnumbered Payment Persistence & Invariants | **75/75 PASS** (100%) |
| `test_step_33_164_billing_receipt_suite.js` | Permanent Deletion, Billing & Receipts Bilateral Sync | **51/51 PASS** (100%) |
| `test_step_33_163_voucher_suite.js` | Voucher Sequence Numbers, Number Reuse & Deletion | **47/47 PASS** (100%) |
| **Total** | **Full System Financial & Invariant Integrity** | **317/317 PASS (0 Failures)** |

---

## 6. Artifact Inventory

| File Path | Description |
| :--- | :--- |
| [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) | Primary application file updated with Block Number Receipt mode, radial glow animation, and full accounting integration |
| [`Temple_Accounts-1_PreStep33_175_BlockNumberReceipts_Backup_20261021_181100.html`](file:///d:/Temple/Temple_Accounts-1_PreStep33_175_BlockNumberReceipts_Backup_20261021_181100.html) | Untouched pre-change backup created before any modifications (1,268,275 bytes) |
| [`tests/test_step_33_175_block_receipt_suite.js`](file:///d:/Temple/tests/test_step_33_175_block_receipt_suite.js) | Automated test suite verifying DOM structure, state transitions, sequence invariants, counter isolation, and accounting integration |
| [`STEP_33_175_UNNUMBERED_RECEIPT_MODE_REPORT.md`](file:///d:/Temple/STEP_33_175_UNNUMBERED_RECEIPT_MODE_REPORT.md) | Comprehensive engineering and audit report documenting the architecture, implementation, and test verification |
