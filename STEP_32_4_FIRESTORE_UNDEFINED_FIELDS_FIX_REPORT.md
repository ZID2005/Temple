# STEP 32.4 — Fix Firestore Undefined Fields in Receipt Edit Save Report

**Date:** October 3, 2026  
**Auditor / Engineer:** Antigravity Advanced Agentic Engineering  
**Target:** `D:\Temple\Temple_Accounts-1.html`  
**Status:** **FIX APPLIED — AWAITING MANUAL LIVE VERIFICATION**

---

## 1. Executive Summary

STEP 32.4 addresses the confirmed downstream Firestore SDK error discovered during STEP 32.3:

```
FirebaseError: [code=invalid-argument]: Function DocumentReference.set() called with invalid data.
Unsupported field value: undefined (found in field voidReason in document receipts/rcpt_1016)
```

The fix conditionally assigns `voidReason` and `voidDate` only when they have defined values on the prior document. This prevents the Firestore Web SDK from rejecting the payload for active (non-voided) receipts and payments.

**Two locations** were fixed: `saveReceipt()` (line 5825-5826) and `savePayment()` (line 8414-8415).

---

## 2. Pre-Modification Backup

| Property | Value |
| :--- | :--- |
| **Backup File** | `D:\Temple\Temple_Accounts-1_STEP32_4_BACKUP.html` |
| **SHA256 Hash** | `148c26d32be519b2601912969a26a8736b8a14a9ae339d53b34260f976313f95` |
| **Verification** | Backup SHA256 matches original file SHA256 exactly |
| **Original Line Count** | 13,939 |

---

## 3. Pre-Modification Production State

### Baseline from STEP 32.3 (confirmed unchanged at STEP 32.4 start)

| Property | Value |
| :--- | :--- |
| **Firestore Receipt Count** | 14 |
| **Active Receipts** | 6 (R-1010, R-1012, R-1013, R-1014, R-1015, R-1016) |
| **Voided Receipts** | 8 (R-1001 through R-1008) |
| **R-1016 `voided`** | `false` |
| **R-1016 `receiptNo`** | `R-1016` |
| **R-1016 `remarks`** | `""` (empty) |
| **R-1016 `voidReason`** | Not present (undefined) |
| **R-1016 `voidDate`** | Not present (undefined) |
| **`receiptCounter`** | 1017 |
| **`voucherCounter`** | 500 |
| **`billingReceiptCounter`** | 11 |
| **IndexedDB Version** | v3 |
| **IndexedDB Object Stores** | 13 |

---

## 4. Root Cause

In `saveReceipt()` and `savePayment()`, the edit path unconditionally assigns `voidReason` and `voidDate` from `prior`:

```javascript
rec.voidReason = prior ? prior.voidReason : undefined;
rec.voidDate = prior ? prior.voidDate : undefined;
```

For **active (non-voided) receipts**, `prior.voidReason` and `prior.voidDate` do not exist on the Firestore document. Accessing them returns `undefined`. The Firestore Web SDK (v8) strictly disallows `undefined` as a field value in `DocumentReference.set()`, causing the SDK to throw:

```
FirebaseError: [code=invalid-argument]: Function DocumentReference.set() called with invalid data.
Unsupported field value: undefined (found in field voidReason in document receipts/rcpt_1016)
```

This error was caught by the `try/catch` in `saveReceipt()`, displaying a user-facing alert and aborting the save operation entirely.

---

## 5. Exact Fix Applied

### Diff

```diff
--- a/Temple_Accounts-1.html (saveReceipt, lines 5825-5826)
+++ b/Temple_Accounts-1.html (saveReceipt, lines 5825-5826)
@@ -5822,8 +5822,8 @@
       rec.id = editId;
       rec.receiptNo = receiptNoInput || (prior ? prior.receiptNo : '');
       rec.voided = prior ? prior.voided : false;
-      rec.voidReason = prior ? prior.voidReason : undefined;
-      rec.voidDate = prior ? prior.voidDate : undefined;
+      if (prior && prior.voidReason !== undefined) rec.voidReason = prior.voidReason;
+      if (prior && prior.voidDate !== undefined) rec.voidDate = prior.voidDate;
       rec.createdAt = prior ? prior.createdAt : Date.now();
       rec.firestoreId = prior ? prior.firestoreId : ('rcpt_' + editId);
```

```diff
--- a/Temple_Accounts-1.html (savePayment, lines 8414-8415)
+++ b/Temple_Accounts-1.html (savePayment, lines 8414-8415)
@@ -8410,8 +8410,8 @@
       rec.id = editId;
       rec.voucherNo = voucherNoInput || (prior ? prior.voucherNo : '');
       rec.voided = prior ? prior.voided : false;
-      rec.voidReason = prior ? prior.voidReason : undefined;
-      rec.voidDate = prior ? prior.voidDate : undefined;
+      if (prior && prior.voidReason !== undefined) rec.voidReason = prior.voidReason;
+      if (prior && prior.voidDate !== undefined) rec.voidDate = prior.voidDate;
       rec.createdAt = prior ? prior.createdAt : Date.now();
       rec.firestoreId = prior ? prior.firestoreId : ('pmt_' + editId);
```

### Fix Logic

| Scenario | Before Fix | After Fix |
| :--- | :--- | :--- |
| **Active receipt** (no `voidReason`/`voidDate` on prior) | `rec.voidReason = undefined` — Firestore rejects | Field not set on `rec` — Firestore accepts |
| **Voided receipt** (has `voidReason`/`voidDate`) | `rec.voidReason = prior.voidReason` preserved | `rec.voidReason = prior.voidReason` preserved |
| **No prior** (`prior` is null) | `rec.voidReason = undefined` — Firestore rejects | Field not set — Firestore accepts |

### Net Modification

- **Lines changed:** 4 lines modified (2 in `saveReceipt`, 2 in `savePayment`)
- **Lines added/removed:** 0 net change (line count remains 13,939)
- **Functions modified:** `saveReceipt()`, `savePayment()` — only the `voidReason`/`voidDate` assignment lines
- **No other code was changed**

### STEP 32.3 Fix Preserved

Line 5794 remains exactly:
```javascript
const receiptNoInput = (fd.get('receiptNo') || '').trim();
```

### Post-Fix SHA256

```
39d8fbf2510f8a7c63c4d1a92019810561430e15e7ca317ddd274efa9d5bf73f
```

---

## 6. Controlled R-1016 Edit/Save Verification

**Browser subagent rate-limited.** The automated browser testing tool was unavailable due to API rate limits during this session. The fix is code-correct and follows the exact prescribed pattern from STEP 32.3 recommendation. Manual verification steps are provided below.

### Manual Verification Steps (for user execution)

1. **Hard reload** the page (`Ctrl+Shift+R`) at `http://localhost:3000/Temple_Accounts-1.html`
2. **Navigate** to Receipts and Edit R-1016
3. **Change** Remarks to `STEP32_4_TEST`
4. **Click** UPDATE
5. **Expected result:** Save succeeds without error. No `FirebaseError` alert.
6. **Verify** in Firestore console: `receipts/rcpt_1016` has `remarks: "STEP32_4_TEST"` and no `voidReason` or `voidDate` fields
7. **Restore** Remarks to empty string via Edit and UPDATE
8. **Verify** restoration is reflected in Firestore and IndexedDB

### Console Verification Script

After loading the page, paste in browser console to verify the fix is loaded:
```javascript
// Verify the fix is in place (no 'undefined' in saveReceipt source)
const src = saveReceipt.toString();
console.log('Has old pattern:', src.includes('prior.voidReason : undefined'));
console.log('Has new pattern:', src.includes('prior.voidReason !== undefined'));
// Expected: false, true
```

---

## 7. Firestore Verification

### Expected State After Successful R-1016 Edit

| Field | Expected Value |
| :--- | :--- |
| `receiptNo` | `R-1016` |
| `voided` | `false` |
| `voidReason` | **Absent** (field should not exist on active receipt) |
| `voidDate` | **Absent** (field should not exist on active receipt) |
| `remarks` | `STEP32_4_TEST` (then restored to `""`) |
| `amount` | `300` |
| `name` | `AMAL` |

---

## 8. IndexedDB Verification

| Property | Expected Value |
| :--- | :--- |
| Database name | `temple_accounts_db` |
| Version | 3 |
| Object stores | 13 |
| Receipt R-1016 `voided` | `false` |
| Receipt R-1016 `voidReason` | Absent or not present |
| Receipt R-1016 `voidDate` | Absent or not present |

---

## 9. Voided Receipt Protection Verification

Receipt R-1001 protection expectations (unchanged by this fix):

| Check | Expected Result |
| :--- | :--- |
| Edit button in table | **Absent** (voided receipts show only Print/Delete) |
| Direct navigation `navigate('receipts', null, 1001)` | **Blocked** with alert |
| `voidReason` on R-1001 | **Preserved exactly** (existing value unchanged) |
| `voidDate` on R-1001 | **Preserved exactly** (existing value unchanged) |
| `voided` on R-1001 | `true` |

---

## 10. String-ID Verification

The string-ID protection from STEP 32.1 (line 5796) remains intact:
```javascript
const editId = rawEditId ? (/^\d+$/.test(rawEditId.trim()) ? parseInt(rawEditId.trim(), 10) : rawEditId.trim()) : null;
```

String IDs like `rcpt_1006` continue to work without `ReferenceError` or malformed onclick behavior.

---

## 11. Counter Verification

| Counter | Expected Value | Status |
| :--- | :--- | :--- |
| `receiptCounter` | 1017 | **No change expected** |
| `voucherCounter` | 500 | **No change expected** |
| `billingReceiptCounter` | 11 | **No change expected** |

Editing an existing receipt does not consume or modify counters.

---

## 12. Financial-Record Safety Verification

No new records of any type should be created by this fix:

| Collection | Expected Count | Expected Change |
| :--- | :--- | :--- |
| `receipts` | 14 | 0 |
| `payments` | 0 | 0 |
| `transfers` | 5 | 0 |
| `billing` | 1 | 0 |
| `loans` | 0 | 0 |
| `chittyMembers` | 1 | 0 |
| `chittyCollections` | 0 | 0 |
| `chittyPayouts` | 0 | 0 |

---

## 13. Regression Verification

| Area | Expected Behavior | Fix Impact |
| :--- | :--- | :--- |
| Firestore authoritative | Remains authoritative source | None |
| IndexedDB v3 / 13 stores | Unchanged | None |
| Receipts Edit UI | Now operational (was blocked by this error) | **Fixed** |
| Voided receipt protection | Unchanged | None |
| Billing module | Unchanged | None |
| 14 Vazhipadu items | Intact | None |
| കൂട്ടുപായസം = ₹250 | Intact | None |
| രക്തപുഷ്പാഞ്ജലി = ₹50 | Intact | None |
| കടുംപായസം = ₹150 | Intact | None |
| Sidebar temple name | Fully visible | None |
| Cash Book Category column/filter/export | Intact | None |
| Analytics donut | Intact | None |
| Console errors from this change | None expected | None |

---

## 14. Newly Discovered Defects (Not Fixed)

No additional defects were discovered during the code analysis for STEP 32.4.

The automated browser testing was unavailable during this session due to API rate limits. Manual verification of the live application is required to confirm no runtime defects exist beyond the code-level fix.

---

## 15. Final Status

### Code Fix: APPLIED

The minimum fix for the confirmed Firestore `undefined` field defect has been applied to both `saveReceipt()` and `savePayment()` functions. The fix:

1. Prevents `undefined` values from being sent to Firestore for `voidReason` and `voidDate`
2. Preserves existing `voidReason`/`voidDate` values for voided records
3. Does not change receipt numbering
4. Does not change accounting logic
5. Does not change Billing logic
6. Does not change Firestore rules
7. Does not change counters
8. Does not refactor `saveReceipt()` or `savePayment()`
9. Does not modify unrelated functions or modules
10. Preserves the STEP 32.3 `receiptNoInput` fix (line 5794) unchanged

### Live Verification: PENDING MANUAL TEST

Due to browser subagent API rate limits during this session, the controlled live test (edit R-1016, save, verify, restore) could not be automated. The user must perform the manual verification steps in Section 6 to confirm the fix works in production.

### Overall Verdict: **CONDITIONAL PASS** — Code fix correct, pending manual live verification
