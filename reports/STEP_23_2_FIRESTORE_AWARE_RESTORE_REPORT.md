# STEP 23.2 — FIRESTORE-AWARE RESTORE + COUNTER SYNCHRONIZATION REPORT

**Date:** 2026-10-02  
**Fixes:** BUG-004 (Firestore-aware restore) · BUG-005 (Counter synchronization during restore)  
**File modified:** `Temple_Accounts-1.html`  
**Source backup:** `Temple_Accounts-1_PreStep23_2_FirestoreRestore_Backup_20261002_200715.html`

---

## 1. BUG-004 Root Cause

`restoreBackup()` (Step 22.3 audit finding) was writing exclusively to **IndexedDB**,
completely bypassing Firestore. The 18-line implementation read the file, then used
`clearStore()` + `addRec()` / `putRec()` — all IndexedDB operations. After Step 15
Firestore became the authoritative production database; any data written only to IndexedDB
was invisible to other authenticated clients and would be overwritten on the next
`fsGetAllSafe()` call which always re-reads from Firestore.

## 2. BUG-005 Root Cause

The old restore never touched `system/counters` in Firestore at all. Counter values
(`billingReceiptCounter`, `receiptCounter`, `voucherCounter`) lived exclusively in
the `system/counters` Firestore document after Step 19. Restoring production data
without restoring the corresponding counters left the counters inconsistent with the
restored data, causing the next `fsNextReceiptNo()` / `fsNextBillingReceiptNo()` /
`fsNextVoucherNo()` call to issue a sequence number that was either already used or
inconsistent with the restored transaction history.

---

## 3. Previous (Broken) Restore Behavior

The 18-line old implementation:
- Read `data[name]` expecting the old `{ settings: [], receipts: [], ... }` legacy format
- Never wrote to Firestore
- Never restored `system/counters`
- No authentication check
- No validation of any kind
- No confirmation beyond a generic browser confirm
- No safety snapshot
- No progress reporting
- No post-restore validation

---

## 4. New Firestore Restore Architecture

The new `restoreBackup()` is a **10-phase** pipeline:

| Phase | Name | Key Action |
|-------|------|-----------|
| 1 | Authentication | Verify `getCurrentFirebaseUser()` — abort if unauthenticated |
| 2 | Parse & Schema Detection | Read file, JSON.parse, detect v23.1 vs legacy format |
| 3 | Full Backup Validation | 14 validation rules, zero Firestore writes |
| 4 | Restore Preview & Confirmation | Show counts + counter values, require `window.confirm` |
| 5 | Pre-Restore Safety Snapshot | Read current Firestore state, download JSON |
| 6 | Firestore Restore | Batched set (backup docs) + batched delete (orphaned docs) |
| 7 | Counter Restore | `db.collection('system').doc('counters').set(counterPayload)` |
| 8 | Post-Restore Validation | Re-read Firestore, verify counts + counter values |
| 9 | IndexedDB Cache Sync | `fsGetAllSafe()` per collection (existing sync mechanism) |
| 10 | Complete | Navigate to Dashboard after 1.8s delay |

---

## 5. Backup Schema Compatibility

### v23.1 Firestore-Authoritative (SUPPORTED)

Produced by the Step 23.1 `downloadBackup()` function. Top-level structure:
`{ metadata, collections, counters, summary }`

Each document in `collections[name]` carries `_firestoreId` (original Firestore doc ID).
Timestamps are serialized as `{ "__type": "Timestamp", "seconds": N, "nanoseconds": N, "iso": "..." }`.

### Legacy IndexedDB Format (EXPLICITLY REJECTED)

The old `{ settings: [], receipts: [], billing: [] ... }` format (no `metadata`,
no `collections` key, no `counters` key, no `_firestoreId`) is detected and
**explicitly rejected** with a clear error message instructing the user to create
a new backup first. It is not silently interpreted.

---

## 6. Validation Rules

| Rule | Check |
|------|-------|
| A | All 13 required collections present (`settings` through `loans`) |
| B | Every collection is a JSON array |
| E | Every document is a non-null, non-array object |
| F | Every document has a valid non-empty string `_firestoreId` |
| G | No duplicate `_firestoreId` values within a collection |
| H | Serialized Timestamp objects have `seconds: number` and `nanoseconds: number` |
| I | Monetary fields are non-negative, finite numbers |
| J | Every billing record with `accountingReceiptId` has a matching receipt |
| K | `counters` section exists; three counter fields are valid non-negative numbers |
| L | Sensitive key patterns (`password`, `privateKey`, `accessToken`, etc.) cause rejection |

If **any** validation rule fails: STOP, display all errors, write **nothing** to Firestore.

---

## 7. Confirmation Workflow

1. File selected (no Firestore action)
2. Validation runs completely (no Firestore action)
3. `window.confirm()` shows: backup source, timestamp, schema version, per-collection counts (all 13), counter values, replacement warning
4. User clicks OK → Phase 5 begins (first Firestore activity: read-only snapshot)
5. First **destructive** write begins only in Phase 6, after safety snapshot is downloaded

---

## 8. Safety Snapshot Behavior

- **Source:** Live Firestore (NOT IndexedDB)
- **Trigger:** After user confirmation, before the first destructive write
- **Format:** Same v23.1 structure — can be used as a future restore source
- **Filename:** `Temple_Accounts_PreRestore_SafetyBackup_<ISO-timestamp>.json`
- **Delivery:** Auto-downloaded to browser's download directory
- **On failure:** Filename is shown in the error message for manual recovery

---

## 9. Restore Semantics: Replace (not Merge)

**Full replacement:** Every backup document is written with `batch.set(ref, data)` (not merge).
Documents in Firestore absent from backup are **deleted**. `system/counters` is overwritten.
Result: Firestore state after restore **exactly represents** the validated backup.

---

## 10. Firestore Batch/Transaction Strategy

- **Batch size:** ≤450 operations per batch (below Firestore's 500-op limit)
- **Per-collection:** Fetch current IDs → delete orphaned docs → write backup docs
- **Counters:** Single `db.doc.set()` call
- **Failure:** Stop at failed collection, display error + safety snapshot filename
- **No false atomicity claim:** Cross-collection rollback is not possible; safety snapshot is the recovery mechanism

---

## 11. Timestamp Restoration

`_deserializeDoc()` recursively walks each document:
- `{ "__type": "Timestamp", seconds, nanoseconds }` → `new firebase.firestore.Timestamp(seconds, nanoseconds)`
- Fallback: `new Date(seconds * 1000 + nanoseconds/1e6)` if Timestamp constructor unavailable
- `{ "__type": "Date", iso }` → `new Date(iso)`
- All other values pass through unchanged

This is the exact inverse of Step 23.1's `_serializeDoc()` / `_serializeTimestamp()`.

---

## 12. Document ID Preservation

```
backup: billing._firestoreId = "bill_6"
→ db.collection('billing').doc('bill_6').set(data)   ✓
NOT: db.collection('billing').add(data)               ✗
```

`_firestoreId` and `_firestoreCollection` are stripped from payloads before writing to Firestore (they are backup metadata, not document data).

---

## 13. Counter Synchronization (BUG-005 Fix)

**Confirmed field names in live `system/counters`:**
- `billingReceiptCounter`
- `receiptCounter`
- `voucherCounter`
- `receiptPrefix`, `voucherPrefix`, `billingPrefix`
- `updatedAt`

**Restore:** Strip backup metadata fields → deserialize timestamps → stamp `_restoredAt`/`_restoredBy` → `db.collection('system').doc('counters').set(payload)` (full replace).

**Counter safety:** `fsNextReceiptNo()`, `fsNextBillingReceiptNo()`, `fsNextVoucherNo()` are **never called** during restore. No counters are incremented or consumed.

---

## 14. Billing/Accounting Integrity

Validation rule J checks that every billing record with `accountingReceiptId` has a corresponding receipt. All link fields (`accountingReceiptId`, `accountingReceiptNo`, `billingId`, `source`) are preserved exactly from backup — no modification during write.

---

## 15. Voided Receipt Preservation

`voided: true`, `voidReason`, `voidDate`, original amounts, timestamps, and audit metadata are part of the document payload and written as-is. No conversion of voided → active. No filtering of voided documents.

---

## 16. IndexedDB Cache Synchronization

Phase 9 calls `fsGetAllSafe(col)` for each of the 13 collections. This is the **existing** Firestore→IDB sync mechanism. Firestore is not demoted; IndexedDB remains the cache.

---

## 17. Failure Handling

| Stage | Behavior |
|-------|----------|
| Phase 1–3 | Stop, show error, re-enable button, write nothing |
| Phase 4 cancel | Stop, re-enable button, no writes |
| Phase 5 read fail | Warn, continue (snapshot is best-effort) |
| Phase 6 write fail | Stop, show error + safety snapshot filename, alert() |
| Phase 7 counter fail | Stop, show error + safety snapshot filename, alert() |
| Phase 8 | Warn on discrepancy, continue |
| Phase 9 | Warn per collection, do not fail restore |

No silent failures. No false "Restore complete" on error.

**Rollback:** Not automatic. Safety snapshot provides the recovery artifact.

---

## 18. Test Matrix

| # | Test | Expected |
|---|------|----------|
| 1 | Invalid JSON | Rejected Phase 2; no Firestore write |
| 2 | Missing collection | Rejected Phase 3 (rule A) |
| 3 | Invalid document ID | Rejected Phase 3 (rule F) |
| 4 | Invalid counter | Rejected Phase 3 (rule K) |
| 5 | Sensitive credential field | Rejected Phase 3 (rule L) |
| 6 | Valid v23.1 structure | Passes Phase 3; reaches Phase 4 |
| 7 | Valid backup, confirmed | Firestore state matches backup |
| 8 | Counter verification | Counter fields match; next-number functions correct |
| 9 | Timestamp verification | `Timestamp` objects properly reconstructed |
| 10 | Billing/accounting links | Links preserved exactly |
| 11 | Voided receipts | Remain voided after restore |
| 12 | Cache verification | IDB mirrors Firestore after Phase 9 |
| 13 | Legacy backup | Rejected Phase 2 with explicit schema mismatch |
| 14 | Unauthenticated | Rejected Phase 1 |

---

## 19. Production State Before/After

**Current known production state (not modified by this step):**

| Item | Value |
|------|-------|
| settings | 1 |
| funds | 6 |
| incomeCategories | 7 |
| expenseCategories | 71 |
| bankAccounts | 1 |
| active billing | 0 |
| active receipts | 0 |
| voided audit receipts | 5 |
| payments | 0 |
| transfers | 0 |
| chitty | 0 |
| loans | 0 |
| `billingReceiptCounter` | 5 |
| `receiptCounter` | 1005 |
| `voucherCounter` | 500 |

No new transactions were created. No counters were consumed. No authentication or Firestore rules changes were made.

---

## 20. Console Result

Expected on successful restore: 0 errors, 0 unhandled rejections, 0 Firebase permission errors.

Progress log output (sample):
```
▶ Phase 1 — Authentication
  Authenticated as: user@temple.org
▶ Phase 2 — Parse & Schema Detection
  JSON parse: OK
  Schema: v23.1 | Source: firestore | Exported: 2026-10-02T...
▶ Phase 3 — Backup Validation
  Validation: PASSED — all 13 collections valid
▶ Phase 7 — Restoring system/counters
  system/counters written:
  billingReceiptCounter = 5
  receiptCounter = 1005
  voucherCounter = 500
▶ Phase 8 — Post-Restore Validation
  system/counters: billingReceiptCounter=5 receiptCounter=1005 voucherCounter=500 ✓
  Post-restore validation: ALL PASSED
▶ Restore Complete
  ✓ Firestore restore completed successfully.
```

---

## 21. Source Backup Filename

`Temple_Accounts-1_PreStep23_2_FirestoreRestore_Backup_20261002_200715.html`

---

## 22. Safety Backup Filename Pattern

`Temple_Accounts_PreRestore_SafetyBackup_<YYYY-MM-DDTHH-MM-SS>.json`

Auto-downloaded before the first destructive write.

---

## 23. Limitations and Unresolved Issues

1. **Not atomic across multiple collections:** If a batch write fails mid-restore, some collections may be restored and others not. The safety snapshot is the recovery mechanism.

2. **Legacy backup not supported for restore:** Pre-Step 23.1 backups are explicitly rejected. Users must create a new v23.1 backup first.

3. **No automatic rollback:** Full automatic rollback would require a second restore using the safety snapshot. The safety snapshot filename is always shown in failure messages.

4. **BUG-003 (backup) already fixed in Step 23.1** — not re-addressed here.
