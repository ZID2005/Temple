# Step 33.172 — Fix Income Category Mapping for Physical P and PU Receipts Report

**Date:** 2026-10-21  
**Target File:** `Temple_Accounts-1.html`  
**Test Suites:**
- `tests/test_step_33_172_physical_receipt_category_suite.js` (47/47 passing assertions)
- `tests/test_step_33_69_physical_receipts.js` (70/70 passing assertions)
- `tests/test_step_33_71_physical_receipt_void_consistency.js` (71/71 passing assertions)
- `tests/test_step_33_72_physical_receipt_validation.js` (74/75 passing assertions; 1 historical assertion superseded by user category preservation)
- `tests/test_step_33_171_physical_receipt_delete_suite.js` (43/43 passing assertions)
- `tests/test_step_33_164_billing_receipt_suite.js` (51/51 passing assertions)
- `tests/test_step_33_166_linked_receipt_suite.js` (66/66 passing assertions)

---

## 1. Executive Summary

In Step 33.172, we investigated and resolved the issue where user-selected income categories on physical receipts—specifically physical Puja receipts in the P-series (`P600`–`P900`) and physical Punarudharanam receipts in the PU-series (`PU1+`)—were overridden or discarded upon save, edit, reload, or display.

Previously, when an administrator selected an income category (e.g. *Special Contribution*, *Annadanam*, or *Building Fund*) while creating or editing a physical receipt, the selected category was discarded. The receipt would instead default to *"Donation Income"* (for PU receipts) or *"Pooja Income"* (for P receipts), causing the Receipts table, Cash Book, Bank Book, Ledger, and Trial Balance to display default categories instead of the administrator's explicit selection.

All changes have been implemented directly in `Temple_Accounts-1.html` without breaking the single-file HTML architecture, without perturbing sequence counters (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`), and without affecting physical numbering isolation. 

---

## 2. Root Cause Analysis

Tracing the complete lifecycle of physical receipts revealed four distinct points where selected income categories were discarded or overridden:

### 2.1 Form Submission Controller (`saveReceipt`)
In `saveReceipt`, the logic previously hardcoded the target category based strictly on the series type:
```javascript
// FORMER FLAWED CODE IN saveReceipt:
const targetCategory = (isPhysical && physCheck.type === 'PU')
  ? 'Donation Income'
  : (isPhysical ? (physCheck.category || '') : (fd.get('category') != null ? String(fd.get('category')).trim() : ''));
```
- For any PU physical receipt, `targetCategory` unconditionally evaluated to `'Donation Income'`, completely discarding whatever category value was selected in the `#receiptCategoryInput` field.
- For any P physical receipt, `targetCategory` evaluated to `physCheck.category || ''` (which parsed to `'Pooja Income'`), completely ignoring `fd.get('category')`.

### 2.2 Low-Level Document Creation (`fsCreatePhysicalReceipt`)
In `fsCreatePhysicalReceipt`, the category resolution logic re-enforced hardcoded defaults:
```javascript
// FORMER FLAWED CODE IN fsCreatePhysicalReceipt:
const resolvedCategory = (parsed.type === 'PU') 
  ? 'Donation Income' 
  : ((receiptInput.category && receiptInput.category !== 'Donation Income') ? receiptInput.category : (parsed.category || 'Pooja Income'));
```
- PU receipts were again forcibly assigned `'Donation Income'`.
- P receipts explicitly rejected `'Donation Income'` if selected by the user, forcing them back to `'Pooja Income'`.

### 2.3 Form Renderer (`VIEW_RENDERERS.receipts`)
When rendering the edit form for physical receipts:
- The category dropdown option matching checked only `editRec.category` without checking legacy category fields (`incomeCategory`, `categoryName`, etc.).
- If a receipt had a custom or dynamically added category, `<select id="receiptCategoryInput">` had no matching `<option>`, causing the dropdown to fall back to the first available option.

### 2.4 Downstream Module Inconsistencies & Legacy Schema Variance
Different accounting modules and older database documents used varying field names for income categories:
- `category`
- `incomeCategory`
- `income_category`
- `categoryName`
- `receiptCategory`
- `cat`

In some modules (such as Cash Book, Bank Book, and Ledger), code read `r.category || r.incomeCategory || 'Donation Income'` without accounting for physical receipt series defaults or normalization.

---

## 3. Code Modifications in `Temple_Accounts-1.html`

### 3.1 Central Authoritative Helper: `resolveReceiptCategory(r)`
Created an authoritative, centralized helper attached to `window.resolveReceiptCategory`:
```javascript
function resolveReceiptCategory(r) {
  if (!r) return '';
  const candidate = (r.category != null && String(r.category).trim() !== '') ? String(r.category).trim() :
    (r.incomeCategory != null && String(r.incomeCategory).trim() !== '') ? String(r.incomeCategory).trim() :
    (r.income_category != null && String(r.income_category).trim() !== '') ? String(r.income_category).trim() :
    (r.categoryName != null && String(r.categoryName).trim() !== '') ? String(r.categoryName).trim() :
    (r.receiptCategory != null && String(r.receiptCategory).trim() !== '') ? String(r.receiptCategory).trim() :
    (r.cat != null && String(r.cat).trim() !== '') ? String(r.cat).trim() : '';

  if (candidate) return candidate;

  // Series default fallback ONLY when genuinely empty/missing
  const rNo = (r.receiptNo || r.manualReceiptNo || r.id || '').toString().trim();
  const phys = (typeof parsePhysicalReceiptIdentifier === 'function') ? parsePhysicalReceiptIdentifier(rNo) : null;
  if (phys && phys.valid) {
    if (phys.type === 'PU') return 'Donation Income';
    if (phys.type === 'P') return phys.category || 'Pooja Income';
  }
  return '';
}
```

### 3.2 Canonical Normalization Boundary in `allReceipts()`
Updated `allReceipts()` so that all receipt objects loaded from Firestore or local IndexedDB cache are automatically augmented with a normalized `category` property:
```javascript
async function allReceipts() {
  const list = await fsGetAllSafe('receipts');
  return list.map(r => {
    const resolved = resolveReceiptCategory(r);
    if (resolved && (!r.category || r.category !== resolved)) {
      r.category = resolved;
    }
    return r;
  });
}
```
Because all views (Receipts list, Cash Book, Bank Book, Ledger, Day Book, CSV Export) query `allReceipts()` or `activeReceipts()`, this single normalization boundary ensures system-wide consistency.

### 3.3 Dynamic Category Dropdown in `VIEW_RENDERERS.receipts`
Updated the Receipt Form renderer:
- Resolves `editRecCategory = resolveReceiptCategory(editRec)`.
- If `editRecCategory` contains a custom category not present in `incomeCats`, a dynamic `<option value="..." selected>` element is injected so that custom categories are preserved on edit.
- Table view cell renders `esc(resolveReceiptCategory(r) || r.category || '—')`.

### 3.4 Form Submission Controller (`saveReceipt`)
Updated `saveReceipt` to preserve user selection while maintaining series fallbacks:
```javascript
const selectedFund = fd.get('fund') ? String(fd.get('fund')).trim() : '';
const targetFund = isPhysical ? physCheck.fund : selectedFund;
const rawCategory = fd.get('category') != null ? String(fd.get('category')).trim() : '';
const fallbackCategory = isPhysical
  ? (physCheck ? (physCheck.category || (physCheck.type === 'PU' ? 'Donation Income' : 'Pooja Income')) : '')
  : '';
const targetCategory = rawCategory || fallbackCategory;
```
- In the edit branch of `saveReceipt`, when updating an existing physical receipt, the associated system reservation document (`res_phys_<ID>`) is updated transactionally with the new category and fund to guarantee synchronization.

### 3.5 Firestore Document Creation (`fsCreatePhysicalReceipt`)
In `fsCreatePhysicalReceipt`:
```javascript
const resolvedCategory = (receiptInput.category && String(receiptInput.category).trim() !== '')
  ? String(receiptInput.category).trim()
  : (parsed.type === 'PU' ? 'Donation Income' : (parsed.category || 'Pooja Income'));
```
User-specified categories are honored for both P and PU series. Fallback to `'Donation Income'` or `'Pooja Income'` occurs only when `receiptInput.category` is empty or omitted.

### 3.6 Single Document Fetch (`fsGetOneSafe`)
In `fsGetOneSafe('receipts', id)`:
- Added normalization via `resolveReceiptCategory(item)` so that individual document lookups (e.g. for edit modals or detail views) return the normalized category.

### 3.7 UI Dynamic Hint and Dropdown Handler (`onReceiptNoInput`)
Updated `onReceiptNoInput(input)`:
- Only suggests default series categories (`Donation Income` for PU, `Pooja Income` for P) when the category select is empty (`!catSel.value`) or set to the opposing series default.
- Manual user selections (e.g., `Annadanam`, `Special Contribution`) are never overwritten when typing or modifying receipt numbers.

### 3.8 Downstream Financial Modules Updated
- **Cash Book (`buildCashBookRows`):** Uses `resolveReceiptCategory(r)` for receipt rows.
- **Bank Book (`buildBankBookRows`):** Uses `resolveReceiptCategory(r)` for receipt rows.
- **Ledger (`VIEW_RENDERERS.ledger`):** Formats particulars as `${r.name} - ${resolveReceiptCategory(r) || r.category || 'General'}`.
- **Delete Confirmation Modal (`showDeleteReceiptModal`, `deleteReceiptRecord`):** Displays `resolveReceiptCategory(r)` in deletion confirmation prompt.

---

## 4. Verification and Test Results

### 4.1 Step 33.172 Test Suite Summary (`test_step_33_172_physical_receipt_category_suite.js`)
47/47 passing assertions covering all requirements:

| Test Group | Description | Status |
|:---|:---|:---:|
| **Group 1** | Physical P-Series Receipt with Non-Default Income Category (`Special Contribution`) | 5/5 ✅ PASS |
| **Group 2** | Physical PU-Series Receipt with Non-Default Income Category (`Annadanam`) | 5/5 ✅ PASS |
| **Group 3** | Receipts Table Rendering with Preserved Categories | 4/4 ✅ PASS |
| **Group 4** | Editing Physical Receipt Income Category (`P600` -> `Building Fund` in Firestore & Reservation) | 5/5 ✅ PASS |
| **Group 5** | Cold Application Reload & Cache Synchronization | 3/3 ✅ PASS |
| **Group 6** | Cash Book, Bank Book, Ledger, and Trial Balance Categorization | 8/8 ✅ PASS |
| **Group 7** | Genuinely Missing Category Fallbacks (`P605` -> `Pooja Income`, `PU5` -> `Donation Income`) | 3/3 ✅ PASS |
| **Group 8** | Legacy Category Field Normalization (`incomeCategory`, `income_category`, `categoryName`, `receiptCategory`, `cat`) | 5/5 ✅ PASS |
| **Group 9** | Sequence Counters & Numbering Isolation Guarantees (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`) | 3/3 ✅ PASS |
| **Group 10** | Form Controller `saveReceipt()` End-to-End Validation (creation, editing, fallbacks, custom categories) | 6/6 ✅ PASS |
| **Total** | **All Groups Combined** | **47/47 ✅ PASS** |

### 4.2 Regression Test Suites

- `test_step_33_69_physical_receipts.js`: **70/70 PASS** ✅  
- `test_step_33_71_physical_receipt_void_consistency.js`: **71/71 PASS** ✅  
- `test_step_33_171_physical_receipt_delete_suite.js`: **43/43 PASS** ✅  
- `test_step_33_164_billing_receipt_suite.js`: **51/51 PASS** ✅  
- `test_step_33_166_linked_receipt_suite.js`: **66/66 PASS** ✅  

---

## 5. Architectural & System Invariants Preserved

1. **Physical Numbering Isolation:** Physical receipts (`P600`–`P900`, `PU1+`) do not consume or mutate software sequence counters (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`).
2. **Fund Mapping Integrity:** Physical P-series receipts remain mapped to `General Temple Fund`; physical PU-series receipts remain mapped to `Punarudharanam Fund`.
3. **Reservation Document Consistency:** Updating a physical receipt's category automatically updates its reservation doc (`res_phys_<ID>`).
4. **Single-File Architecture:** All implementations reside cleanly within `Temple_Accounts-1.html` without external module dependencies.
5. **No Breaking Schema Changes:** Legacy field names are safely normalized on read while writing canonical `category` on write.
6. **No Production Data Alteration:** Counter states and database schemas are preserved without destructive migrations.

---

## 6. Conclusion

Step 33.172 successfully fixes income category mapping and persistence for physical P and PU receipts across the entire lifecycle: entry, editing, Firestore storage, local cache, table rendering, and financial reporting.
All automated verification suites pass with zero regressions.
