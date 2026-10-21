# Step 33.173 — Add Custom Unnumbered Payment Icon Without Affecting Voucher Sequence: Implementation & Verification Report

**Project:** Temple Accounts  
**Main File Modified:** `Temple_Accounts-1.html`  
**Test Suites:**
- Node Integration & Invariant Suite: `tests/test_step_33_173_custom_payment_suite.js` (75/75 Passed)
- Headless Chrome Browser E2E Suite: `tests/test_step_33_173_browser_e2e.js` (29/29 Passed)  
**Date:** 2026-10-21  
**Status:** COMPLETED & VERIFIED (0 Failures, 0 Regressions)

---

## 1. Executive Summary & Objective

In **Step 33.173**, a small **CUSTOM icon/button** was introduced into the existing *New Payment / Expense* form, positioned immediately after the **CANCEL** button. The feature enables temple administrators to record legitimate cash or bank payments that do not have a formal voucher number (e.g., ad-hoc petty vendor disbursements, informal temple offerings), while strictly guaranteeing that the automatic voucher numbering sequence (`voucherCounter`) is neither incremented, decremented, reserved, nor reset.

### Core Numbering Invariant Verified

The exact required voucher sequence was tested and verified both at the engine/integration level and inside a live Headless Google Chrome browser instance:

| Step | Action | Stored Voucher No | Displayed in Table / Books | `voucherCounter` State |
|:---:|:---|:---:|:---:|:---:|
| 1 | Baseline state (prior normal voucher) | `V-010` | `V-010` | 10 |
| 2 | Admin creates normal payment | `V-011` | `V-011` | 11 |
| 3 | Admin clicks **CUSTOM** and saves a payment | `""` (empty) | `—` | **11 (Untouched)** |
| 4 | Admin creates next normal payment | `V-012` | `V-012` | 12 |
| 5 | Admin clicks **CUSTOM** and saves a payment | `""` (empty) | `—` | **12 (Untouched)** |
| 6 | Admin creates next normal payment | `V-013` | `V-013` | 13 |

**Result:** Normal payments received strictly sequential voucher numbers (`V-011` → `V-012` → `V-013`) with zero skipped numbers, and zero counter mutations caused by custom entries.

---

## 2. Pre-Change Verified Backups & Integrity

Prior to modifying `Temple_Accounts-1.html`, verified copies were created and cryptographically hashed using SHA-256:

| Backup Path | Size (Bytes) | SHA-256 Checksum |
|:---|:---:|:---|
| `d:\Temple\Temple_Accounts-1_PreStep33_173_CustomPayment_Backup_20261021_171500.html` | 1,248,438 | `42B423B8013110C4DF943F4198D0B8BFDC24B1DF750A5E302E3A39D243A73E43` |
| `d:\Temple\backups\Temple_Accounts-1_PreStep33_173_CustomPayment_Backup_20261021_171500.html` | 1,248,438 | `42B423B8013110C4DF943F4198D0B8BFDC24B1DF750A5E302E3A39D243A73E43` |

---

## 3. UI Implementation & Positioning

### Button Placement
In `Temple_Accounts-1.html`, inside `VIEW_RENDERERS.payments`, the `.form-actions` container layout was updated:
```html
<div class="form-actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
  <button type="button" id="btn-save-payment" onclick="savePayment(false)">${editRec ? 'UPDATE' : 'SAVE'}</button>
  <button type="button" class="btn-green" id="btn-save-print-payment" onclick="savePayment(true)">${editRec ? 'UPDATE &amp; PRINT' : 'SAVE &amp; PRINT'}</button>
  <button type="button" class="btn-outline" id="btn-cancel-payment" onclick="navigate('payments')">CANCEL</button>
  <button type="button" class="btn-outline btn-custom-payment" id="btn-save-custom-payment" onclick="savePayment(false, true)" title="Custom — Save without voucher number" aria-label="Custom — Save without voucher number" style="display:inline-flex;align-items:center;gap:4px;font-weight:600;padding:6px 12px;border-color:var(--border);"><span style="font-size:13px;line-height:1;">⚙️</span><span>CUSTOM</span></button>
</div>
```

### UI Characteristics:
1. **Positioning:** Placed immediately following `<button id="btn-cancel-payment">CANCEL</button>`.
2. **Label & Tooltip:** Displays `⚙️ CUSTOM` with tooltip and `aria-label`: `Custom — Save without voucher number`.
3. **Preservation of Existing Controls:** Existing `SAVE`, `SAVE & PRINT`, and `CANCEL` buttons retain their exact IDs, classes, and handlers.
4. **Action On Click:** Directly saves the payment as an unnumbered custom payment via `savePayment(false, true)` rather than merely toggling form state.
5. **Double-Submission Protection:** `savePayment` implements an atomic `window.isSavingPayment` guard and immediately disables `btn-save-payment`, `btn-save-print-payment`, and `btn-save-custom-payment` upon invocation.

---

## 4. Technical Architecture & Counter-Isolation Proof

### 1. Counter Isolation on Creation
When `savePayment(print, isCustom = true)` is invoked:
- It **does NOT** call `fsNextVoucherNo()` or `nextVoucherNo()`.
- It **does NOT** create any voucher reservation in `system/counters`.
- It sets:
  - `rec.voucherNo = ""` (empty string; never a temporary number).
  - `rec.voucherType = "custom"`.
  - `rec.id = "c_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8)`.
  - `rec.firestoreId = "pmt_" + rec.id`.
- The document ID prefix `c_` guarantees that `parseInt(id, 10)` evaluates to `NaN`. As a result, Cloud Firestore sequence counter allocation algorithms (which filter on `match(/\d+$/)`) can never confuse custom entries with numeric voucher sequence integers.

### 2. Preservation on Editing
When an administrator edits a custom payment:
- The voucher input renders as readonly: `placeholder="— (No Voucher Number)"` and header `Edit Payment (Custom)`.
- During update, `savePayment` checks:
  ```javascript
  const isPriorCustom = prior && (prior.voucherType === 'custom' || !prior.voucherNo || prior.voucherNo === '—');
  if (isPriorCustom || isCustom) {
    rec.voucherType = 'custom';
    rec.voucherNo = '';
  }
  ```
- No voucher allocation function is called during update, ensuring the record remains unnumbered and `voucherCounter` remains completely untouched.

### 3. Deletion & Trailing Voucher Reuse Safety
When deleting payments (`deletePayment`):
- Custom payments are detected via `isCustom = (record.voucherType === 'custom' || !record.voucherNo || record.voucherNo === '—')`.
- For custom payments, `deletedVNum = null`. The transaction in Firestore skips counter adjustments entirely.
- Crucially, when a normal voucher is deleted, the calculation for `maxRemainingNum` filters out custom payments:
  ```javascript
  allPayments.forEach(d => {
    if (d.voucherType === 'custom' || !d.voucherNo || d.voucherNo === '—') return;
    // only parse normal voucher sequence numbers
  });
  ```
  This ensures remaining custom payments never artificially inflate or corrupt the trailing voucher reuse calculation.

---

## 5. Accounting & Reporting Integration

Custom payments are genuine financial transactions and are fully reflected across all accounting registers and books:

1. **Payments Table:**
   - Displays `—` in the Voucher No column: `(p.voucherNo && String(p.voucherNo).trim()) ? esc(p.voucherNo) : '—'`.
   - Date, Paid To, Description, Fund, Category, Mode, and Amount display normally.
   - Print, Edit, Void, and Delete actions are fully available.
2. **Cash Book (`buildCashBookRows`):**
   - Cash payments display `Payment - {paidTo}` (or `Payment {voucherNo} - {paidTo}` if numbered).
   - Generates no `undefined` or empty parentheses `Payment  - ...`.
   - Debits/credits affect cash balances identically to numbered vouchers.
3. **Bank Book (`buildBankBookRows`):**
   - Bank/UPI custom payments display `Payment - {paidTo}`.
   - Fully included in withdrawal amounts and bank account reconciliations.
4. **General Ledger & Punarudharanam:**
   - Handled cleanly in voucher number display columns with fallback to `—`.
5. **CSV / Excel Export:**
   - Exports `""` (empty string) for `VoucherNo` without fabricating artificial voucher numbers.
6. **Global Search:**
   - Matches custom payments by vendor name, description, category, and remarks.

---

## 6. Verification & Test Execution Results

All verification suites were run against the updated application:

### Test Suite 1: Step 33.173 Core Integration & Invariants Suite
**Script:** `tests/test_step_33_173_custom_payment_suite.js`  
**Assertions:** 75 / 75 PASSED (100%)

- **Group 1: Exact Numbering Sequence & Counter Isolation (19/19 Passed)**
  - T1.1: Baseline voucherCounter = 10.
  - T1.2: Initial form preview proposes V-011.
  - T1.3–T1.5: Normal payment receives `V-011`, updates `voucherCounter` to 11.
  - T1.6–T1.11: Custom payment saved with `voucherNo = ""`, `voucherType = "custom"`, `voucherCounter` remains 11. Next preview remains `V-012`.
  - T1.12: Renders `—` in Payments table.
  - T1.13–T1.14: Next normal payment receives sequential `V-012`, updates `voucherCounter` to 12.
  - T1.15–T1.17: Second custom payment saved with `voucherNo = ""`, `voucherCounter` remains 12.
  - T1.18–T1.19: Third normal payment receives sequential `V-013`, updates `voucherCounter` to 13.
- **Group 2: UI Elements & Code Inspection (13/13 Passed)**
  - T2.1–T2.6: `#btn-save-custom-payment` verified with correct attributes, styling, tooltip, and `aria-label`.
  - T2.7–T2.8: Verified positioned immediately after `#btn-cancel-payment`.
  - T2.9–T2.13: Existing SAVE and SAVE & PRINT buttons preserved, double-submission guard confirmed.
- **Group 3: Cold Reload & Cache Synchronization (5/5 Passed)**
  - T3.1–T3.5: Custom payment and normal payments correctly reloaded from persistent storage.
- **Group 4: Editing Custom Payments (5/5 Passed)**
  - T4.1–T4.5: Edited custom payment preserves `voucherType = "custom"`, does not receive a voucher number, updates amount and details, leaves `voucherCounter` untouched.
- **Group 5: Accounting Integration (10/10 Passed)**
  - T5.1–T5.3: Custom cash payment cleanly represented in Cash Book without empty brackets.
  - T5.4–T5.9: Bank Book verified for normal and custom bank payments.
  - T5.10: Financial balances sum normal and custom payments accurately.
- **Group 6: Voiding & Permanent Deletion Safety (13/13 Passed)**
  - T6.1–T6.3: Voiding custom payment preserves `voucherCounter`.
  - T6.4–T6.8: Deleting custom payment removes record without touching `voucherCounter`.
  - T6.9–T6.13: Deleting trailing normal voucher `V-013` safely decrements counter to 12, allowing sequential number reuse without interference from custom payments.
- **Group 7: CSV Export & Global Search (5/5 Passed)**
  - T7.1–T7.3: CSV exports blank `VoucherNo` for custom payments.
  - T7.4–T7.5: Global search indexes custom payments by description and payee.
- **Group 8: Concurrency & Duplicate Prevention (5/5 Passed)**
  - T8.1–T8.3: 5 concurrent custom payments generated distinct unique IDs without counter contention.
  - T8.4–T8.5: Subsequent normal payment cleanly received sequential `V-014`.

---

### Test Suite 2: Step 33.173 Headless Chrome Browser E2E Suite
**Script:** `tests/test_step_33_173_browser_e2e.js`  
**Assertions:** 29 / 29 PASSED (100%)

- **Group 1: Browser DOM Inspection of New Payment Form (8/8 Passed)**
  - CANCEL, SAVE, SAVE & PRINT, and CUSTOM buttons all present and correctly structured.
  - Confirmed CUSTOM button is positioned immediately after CANCEL in live DOM tree.
- **Group 2: Live Sequence Execution (7/7 Passed)**
  - `V-011` → `CUSTOM (—)` → `V-012` → `CUSTOM (—)` → `V-013` executed live in Chromium.
- **Group 3: Payments Table DOM Rendering (4/4 Passed)**
  - Verified `—` is rendered in `<td>` for custom payments and `V-011`, `V-012`, `V-013` for normal payments.
- **Group 4: Cash Book Rendering (4/4 Passed)**
  - Verified `Payment - Local Flower Vendor` (custom) and `Payment V-011 - Priest Dakshina` (normal) render cleanly without `undefined`.
- **Group 5: Edit Custom Payment Invariance (6/6 Passed)**
  - Readonly voucher field, preserved custom status, amount update to ₹550, and counter invariance verified.

---

### Regression Verification Suites

| Suite Name | Focus Area | Assertions | Result |
|:---|:---|:---:|:---:|
| `test_step_33_163_voucher_suite.js` | Voucher Sequence & Highest Number Reuse | 47 / 47 | **PASSED** |
| `test_step_33_171_physical_receipt_delete_suite.js` | Read-Before-Write Firestore Deletion | 43 / 43 | **PASSED** |
| `test_step_33_172_physical_receipt_category_suite.js` | Physical Receipt Income Category Mapping | 47 / 47 | **PASSED** |
| `test_step_33_173_custom_payment_suite.js` | Custom Unnumbered Payment & Invariant Suite | 75 / 75 | **PASSED** |
| `test_step_33_173_browser_e2e.js` | Headless Chrome Browser E2E Suite | 29 / 29 | **PASSED** |
| **Total** | **Comprehensive Step 33 Regression** | **241 / 241** | **100% PASSED** |

---

## 7. Safety Constraints & Audit

- **Production Records:** No production transactions or live counters were altered. All sequence tests ran against isolated mock counters and test document IDs.
- **Firestore Security Rules:** Unmodified.
- **Deployment Constraints:** No git commit was pushed to GitHub and no deployment to Vercel was triggered.
- **Single-File Architecture:** Strictly preserved in `Temple_Accounts-1.html`.
- **Syntax Check:** Inline JavaScript syntax validated with 0 errors across 1,044,364 characters.

---

## 8. Unresolved Issues

None. All requirements specified in Step 33.173 are fully implemented, verified, and passing all tests.
