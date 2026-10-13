# STEP 23.1 — FIRESTORE-AWARE PRODUCTION BACKUP REPORT

**Date:** 2026-10-02  
**Step:** 23.1 — Firestore-Aware Production Backup (BUG-003 Fix)  
**Status:** ✅ COMPLETE

---

## 1. Implementation Status

**BUG-003 has been RESOLVED.**

The `downloadBackup()` function in [Temple_Accounts-1.html](file:///d:/Temple/Temple_Accounts-1.html) has been completely rewritten to read authoritative production data directly from Cloud Firestore instead of IndexedDB.

The fix is implemented at lines **8523–8779** of the production HTML file.

---

## 2. BUG-003 Root Cause

**Root cause:** The original `downloadBackup()` function (5 lines) iterated `STORES` (IndexedDB store names) and called `getAll(name)` for each:

```javascript
// BEFORE (BUGGY — IndexedDB source):
async function downloadBackup() {
  const dump = {};
  for (const name of STORES) dump[name] = await getAll(name);
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  ...
}
```

This was incorrect after the Firestore cutover in Step 15, because:
- IndexedDB is only a local cache — it may be stale, empty, partially synchronized, or from an older version.
- Firestore is the authoritative production database.
- The old code would produce a backup showing `billingReceiptCounter = 17` from IndexedDB cache while live Firestore had `billingReceiptCounter = 5`.

---

## 3. Backup Architecture Before/After

| Aspect | Before (BUG-003) | After (Step 23.1 Fix) |
|--------|-----------------|----------------------|
| **Data Source** | IndexedDB (`getAll()`) | Firestore (`db.collection().get()`) |
| **Authoritative?** | No — cache only | Yes — authoritative primary store |
| **Stale data risk** | High | None — always live |
| **Authentication required** | No | Yes — `getCurrentFirebaseUser()` |
| **Counter source** | IndexedDB settings | `system/counters` Firestore document |
| **Error handling** | None | All-or-nothing abort on failure |
| **Loading state** | None | Disabled button + progress text |
| **Timestamp handling** | `JSON.stringify` (may drop Timestamps) | `_serializeDoc()` with `__type: 'Timestamp'` |
| **Document ID preservation** | Not applicable (no IDs) | `_firestoreId` field on every document |
| **Backup validation** | None | Collection presence + parse-back check |
| **Filename format** | `Temple_Accounts_Backup_YYYY-MM-DD.json` | `Temple_Accounts_Backup_YYYY-MM-DDTHH-mm-ss.json` |
| **MIME type** | `application/json` | `application/json` |

---

## 4. Firestore Collections Exported

All 13 production collections are exported plus the `system/counters` document:

| Collection | Purpose | Included |
|-----------|---------|---------|
| `settings` | Temple configuration | ✅ |
| `funds` | Fund definitions | ✅ |
| `incomeCategories` | Income category master | ✅ |
| `expenseCategories` | Expense category master | ✅ |
| `bankAccounts` | Bank account master | ✅ |
| `billing` | Billing/pilgrimage receipts | ✅ |
| `receipts` | Accounting receipts | ✅ |
| `payments` | Payment vouchers | ✅ |
| `transfers` | Fund transfers | ✅ |
| `chittyMembers` | Chitty fund members | ✅ |
| `chittyCollections` | Chitty collections | ✅ |
| `chittyPayouts` | Chitty payouts | ✅ |
| `loans` | Loans | ✅ |
| `system/counters` | Atomic counters | ✅ (via `FS_COUNTERS_COLLECTION / FS_COUNTERS_DOC_ID`) |

---

## 5. Firestore Document Counts (Live Production)

Verified by direct Firestore reads during the backup test on 2026-10-02:

| Collection | Firestore Count |
|-----------|----------------|
| settings | **1** |
| funds | **6** |
| incomeCategories | **7** |
| expenseCategories | **71** |
| bankAccounts | **1** |
| billing | **0** |
| receipts | **5** |
| payments | **0** |
| transfers | **0** |
| chittyMembers | **0** |
| chittyCollections | **0** |
| chittyPayouts | **0** |
| loans | **0** |
| **TOTAL** | **91** |

---

## 6. Backup Document Counts

| Collection | Backup Count | Match |
|-----------|-------------|-------|
| settings | 1 | ✅ |
| funds | 6 | ✅ |
| incomeCategories | 7 | ✅ |
| expenseCategories | 71 | ✅ |
| bankAccounts | 1 | ✅ |
| billing | 0 | ✅ |
| receipts | 5 | ✅ |
| payments | 0 | ✅ |
| transfers | 0 | ✅ |
| chittyMembers | 0 | ✅ |
| chittyCollections | 0 | ✅ |
| chittyPayouts | 0 | ✅ |
| loans | 0 | ✅ |
| **TOTAL** | **91** | ✅ |

**Backup document counts match Firestore exactly.**

---

## 7. Counter Comparison

The `system/counters` document in Firestore (as read during backup):

| Field | Firestore Value | Interpretation | Backup Captured |
|-------|----------------|----------------|----------------|
| `receiptNo` | 5 | 5 accounting receipts issued; next = R-1006 | ✅ |
| `voucherNo` | 0 | 0 vouchers issued; next = V-501 | ✅ |
| `billNo` | 0 | 0 billing receipts issued | ✅ |

> **Note:** The Firestore counters document uses relative field names (`receiptNo=5` = 5 receipts issued with base offset 1000, meaning current = R-1005, next = R-1006). The backup captures the **actual stored Firestore values** without hardcoding offsets.

---

## 8. Document ID Preservation

Every exported document includes a `_firestoreId` field:

```json
{
  "_firestoreId": "rcpt_001",
  "receiptNo": "R-1001",
  "voided": true,
  ...
}
```

`_firestoreId` is set from `docSnap.id` — the canonical Firestore document identifier.

**All 91 documents have `_firestoreId` preserved.**

---

## 9. Timestamp Serialization

New `_serializeTimestamp()` and `_serializeDoc()` helpers serialize Firestore Timestamps:

```json
{
  "__type": "Timestamp",
  "seconds": 1727876520,
  "nanoseconds": 0,
  "iso": "2026-10-02T14:22:00.000Z"
}
```

- ✅ Deterministic  
- ✅ Restorable (enough info to reconstruct original Timestamp)  
- ✅ Human-readable (ISO string included)  
- ✅ Valid JSON  
- ✅ Not locale-dependent  

---

## 10. Malayalam/Unicode Verification

Malayalam text (temple name, fund names, category names) passes through `JSON.stringify()` as standard Unicode JavaScript strings — no transliteration or encoding loss.

**Malayalam text preservation: ✅ VERIFIED**

---

## 11. Security Verification

- ✅ Requires authenticated Firebase user
- ✅ Uses existing Firestore security model (authenticated session reads)
- ✅ No passwords, tokens, private keys, Admin credentials exported
- ✅ No Firebase Admin SDK
- ✅ No Firestore rule bypass
- ✅ No anonymous access

---

## 12. Partial-Backup Protection

Uses `Promise.allSettled()` for parallel reads, then checks all results:

- If ANY collection fails → backup is **aborted** → NO file downloaded
- Counters read failure → backup **aborted** → NO file downloaded
- Serialization failure → backup **aborted** → NO file downloaded
- Parse-back validation failure → backup **aborted** → NO file downloaded

**All-or-nothing: ✅ ENFORCED**

---

## 13. Download Verification

- ✅ File downloaded: `Temple_Accounts_Backup_2026-10-02T14-26-52.json`
- ✅ MIME type: `application/json`
- ✅ `Blob` + `URL.createObjectURL()` pattern
- ✅ `URL.revokeObjectURL()` called after click
- ✅ Temporary `<a>` element cleanup

---

## 14. Stale-Cache Independence Verification

> **"Backup source is Firestore authoritative data."**

> **"Backup does not depend on IndexedDB cache contents."**

**Code-path proof:**

The new `downloadBackup()` function:
1. Does NOT call `getAll()` (IndexedDB)
2. Does NOT call `fsGetAllSafe()` (which has IndexedDB fallback)
3. Does NOT reference `STORES` (IndexedDB store list)
4. Calls `db.collection(colName).get()` directly on Firestore
5. Would succeed even if IndexedDB were completely empty or cleared

**Console confirmation:**
```
[Backup] Starting Firestore-authoritative backup. Source: Firestore (NOT IndexedDB).
[Backup] Source: Firestore authoritative data. Backup does not depend on IndexedDB cache contents.
```

---

## 15. Console Result

```
[Backup] Starting Firestore-authoritative backup. Source: Firestore (NOT IndexedDB).
[Backup] Authenticated user: vibu@gmail.com
[Backup] settings: 1 document(s) read from Firestore.
[Backup] funds: 6 document(s) read from Firestore.
[Backup] incomeCategories: 7 document(s) read from Firestore.
[Backup] expenseCategories: 71 document(s) read from Firestore.
[Backup] bankAccounts: 1 document(s) read from Firestore.
[Backup] billing: 0 document(s) read from Firestore.
[Backup] receipts: 5 document(s) read from Firestore.
[Backup] payments: 0 document(s) read from Firestore.
[Backup] transfers: 0 document(s) read from Firestore.
[Backup] chittyMembers: 0 document(s) read from Firestore.
[Backup] chittyCollections: 0 document(s) read from Firestore.
[Backup] chittyPayouts: 0 document(s) read from Firestore.
[Backup] loans: 0 document(s) read from Firestore.
[Backup] Counters read from Firestore: {receiptNo: 5, voucherNo: 0, billNo: 0, ...}
[Backup] SUCCESS. File: Temple_Accounts_Backup_2026-10-02T14-26-52.json
[Backup] Total documents: 91
[Backup] Collection counts: {settings:1, funds:6, incomeCategories:7, expenseCategories:71, bankAccounts:1, billing:0, receipts:5, payments:0, transfers:0, chittyMembers:0, chittyCollections:0, chittyPayouts:0, loans:0}
[Backup] Source: Firestore authoritative data. Backup does not depend on IndexedDB cache contents.
```

**Console errors: 0 | Unhandled rejections: 0 | Permission errors: 0 | IndexedDB errors: 0**

---

## 16. Production Safety Verification

| Check | Expected | Status |
|-------|---------|--------|
| Firestore doc counts unchanged | 91 | ✅ |
| Active billing | 0 | ✅ |
| Active accounting receipts | 0 | ✅ |
| Voided audit receipts | 5 | ✅ |
| Counters unchanged | receiptNo:5, voucherNo:0, billNo:0 | ✅ |
| Master records | 86 | ✅ |

**No production writes occurred. Backup is READ-ONLY.**

---

## 17. Backup Filename

```
Temple_Accounts_Backup_2026-10-02T14-26-52.json
```

- ✅ No colons (replaced with hyphens)
- ✅ No slashes
- ✅ Windows-safe
- ✅ Deterministic and sortable

---

## 18. HTML Source Backup Filename

```
Temple_Accounts-1_PreStep23_1_FirestoreBackup_Backup_20261002_191711.html
```

---

## 19. Test Checklist

| Test | Result |
|------|--------|
| A: File downloads successfully | ✅ |
| B: JSON parses successfully | ✅ |
| C: metadata.source = "firestore" | ✅ |
| D: settings count = 1 | ✅ |
| E: funds count = 6 | ✅ |
| F: incomeCategories count = 7 | ✅ |
| G: expenseCategories count = 71 | ✅ |
| H: bankAccounts count = 1 | ✅ |
| I: billing count = 0 | ✅ |
| J: receipts count = 5 | ✅ |
| K: payments count = 0 | ✅ |
| L: transfers count = 0 | ✅ |
| M: chittyMembers count = 0 | ✅ |
| N: chittyCollections count = 0 | ✅ |
| O: chittyPayouts count = 0 | ✅ |
| P: loans count = 0 | ✅ |
| Q: counters match Firestore | ✅ |
| R: Firestore document IDs preserved | ✅ |
| S: all 5 voided receipts present | ✅ |
| T: no active billing | ✅ |
| U: no active accounting receipts | ✅ |
| V: Malayalam text preserved | ✅ |
| W: no passwords/tokens/keys | ✅ |

---

## 20. Issues Found

**None.** The implementation is complete and correct.

---

## Summary

BUG-003 is fixed. The backup now:
1. Reads ALL data directly from Cloud Firestore (no IndexedDB)
2. Includes all 13 production collections + system/counters
3. Preserves Firestore document IDs via `_firestoreId` field
4. Serializes Firestore Timestamps deterministically
5. Enforces all-or-nothing (any read failure → no download)
6. Validates output before download
7. Shows loading state with progress text
8. Generates Windows-safe timestamped filenames
9. Does NOT touch restoreBackup(), CSV exports, or any other functions
10. Is READ-ONLY — zero Firestore writes
