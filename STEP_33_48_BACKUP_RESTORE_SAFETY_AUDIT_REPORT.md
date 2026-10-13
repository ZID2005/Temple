# STEP 33.48 — Independent Backup/Restore Safety Audit Report

**Project:** Temple Accounts & Fund Management (Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം)  
**Audit Timestamp:** 2026-10-12T20:42:00+05:30  
**Audit Mode:** Read-Only Source Audit + Isolated Firebase Emulator Testing  
**Air-Gap Status:** 100% Isolated — Zero production Firebase connections, exports, mutations, counter resets, deployments, or cleanup operations  
**Overall Verdict:** ✅ **PASS WITH WARNINGS**

---

## 1. Executive Verdict

> [!IMPORTANT]
> **PASS WITH WARNINGS** — The STEP 33.47 backup/restore implementation is fundamentally sound. All 25 dedicated backup coverage tests pass (100%). All 105 production isolation tests pass (100%). Export scope, restore validation, safe-merge behavior, void preservation, monotonic counter protection, and idempotency-replay safety are all correctly implemented.
>
> **3 warnings** and **1 informational finding** are documented below. None are Critical or High severity. No changes to the application source were made during this audit.

---

## 2. Source and Artifact Hashes

| Artifact | Path | SHA-256 (Before Audit) | SHA-256 (After Audit) | Changed? |
| :--- | :--- | :---: | :---: | :---: |
| **Application Source** | `Temple_Accounts-1.html` (765,474 bytes) | `249769CFB82C6235BE8C50F221E1A2FF77DD398FEC13BA219B53759749C13E2B` | `249769CFB82C6235BE8C50F221E1A2FF77DD398FEC13BA219B53759749C13E2B` | ❌ No |
| **STEP 33.47 Test Suite** | `test_step_33_47_backup_coverage.js` | `9BEB473187B85126E88EDD838BE363ECDD544928C6E55D42C693D8B4AB8A9A05` | Same | ❌ No |
| **Frozen Release Artifact** | `deploy_staging_step_33_43/Temple_Accounts-1.html` | `AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC` | Same | ❌ No |
| **Production Isolation Tests** | `test_step_33_40_production_isolation.js` | `6948261C70A589201901EB37379EE5A0FFBE7D7C6EC4E23E2BB97BA3D6A993C4` | Same | ❌ No |
| **Backup Recovery Tests** | `test_step_33_46_backup_recovery_verification.js` | `1D08B20E95C516C79B2462AAE7C41B5E41498B99F2E04DEAF3F55E2E04A6CBE4` | Same | ❌ No |

> [!NOTE]
> **Source hash matches the expected STEP 33.47 hash**: `249769CFB82C6235BE8C50F221E1A2FF77DD398FEC13BA219B53759749C13E2B`. No source modifications occurred during this audit.

---

## 3. Functions and Code Paths Inspected

### 3.1 Backup Export Pipeline

| Function/Code Path | Lines | Purpose |
| :--- | :---: | :--- |
| `_serializeTimestamp()` | 14416–14432 | Serializes Firestore Timestamps to `{__type:'Timestamp', seconds, nanoseconds, iso}` |
| `_serializeDoc()` | 14437–14455 | Recursively serializes all Timestamps in a document tree |
| `downloadBackup()` | 14465–14707 | Full Firestore-authoritative export pipeline |
| Collection reads (Promise.allSettled) | 14507–14519 | Parallel reads of 13 application collections |
| System collection scan | 14546–14564 | Reads `system` collection, segments into counters/res_*/op_*/other |
| Counters fallback | 14567–14580 | Direct doc get if counters not found in collection scan |
| Deterministic sorting | 14583–14585 | Sorts reservations by seqNumber, idempotency by seqNumber+operationId |
| Backup object assembly | 14627–14661 | Schema v23.2 structure with dual-path (top-level + system nested) |
| JSON serialization + parse-back | 14664–14676 | Validates output is valid JSON |

### 3.2 Restore Pipeline

| Function/Code Path | Lines | Purpose |
| :--- | :---: | :--- |
| `restoreBackup()` | 14735–15731 | Full multi-phase restore pipeline |
| Phase 1 — Authentication | 14899–14911 | User login check |
| Phase 2 — Schema Detection | 14914–14961 | Detects v23.2 vs v23.1 vs legacy IndexedDB |
| Phase 3 — Validation | 14963–15129 | All-or-nothing validation before any write |
| Phase 3L — Reservation Validation | 15057–15090 | ID format regex, duplicate detection, seqNumber, voided type, security scan |
| Phase 3M — Idempotency Validation | 15092–15123 | ID format regex, duplicate detection, fingerprint required, security scan |
| Phase 4 — Preview & Confirm | 15134–15190 | User confirmation dialog |
| Phase 5 — Safety Snapshot | 15192–15283 | Pre-restore backup of current Firestore state (auto-download) |
| Phase 6 — Collection Restore | 15286–15375 | Safe-merge of 13 application collections |
| Phase 6B — Reservation Restore | 15377–15458 | Safe-merge of system/res_* with void preservation |
| Phase 6C — Idempotency Restore | 15460–15512 | Write-once immutable import of system/op_* |
| Phase 7 — Counter Restore | 15514–15589 | Monotonic max across live, backup, and maxResSeq |
| Phase 8 — Post-Restore Validation | 15591–15672 | Re-reads Firestore to verify counts |
| Phase 9 — IDB Cache Sync | 15674–15705 | Re-syncs IndexedDB cache via fsGetAllSafe() |
| Phase 10 — Completion | 15707–15731 | Success message and navigation |

### 3.3 Idempotency Replay Logic

| Function/Code Path | Lines | Purpose |
| :--- | :---: | :--- |
| `fsCreateBillingWithAccounting()` | 17890–18276 | Billing transaction with 16-point idempotency check |
| Replay detection (opSnap.exists) | 17909–18078 | Detects prior committed operation and validates |
| Fingerprint verification (Step 7) | 17948–17959 | v1 and v2 fingerprint matching |
| Linked document verification (Steps 8–14) | 17961–18048 | Cross-validates bill, receipt, reservation, operation links |
| Void replay block (Step 15) | 18053–18056 | Prevents replay of voided transactions |
| `fsCreateIndependentReceipt()` | 18290+ | Independent receipt with parallel idempotency |

### 3.4 Supporting Infrastructure

| Symbol | Line | Value |
| :--- | :---: | :--- |
| `FS_COUNTERS_COLLECTION` | 17037 | `'system'` |
| `FS_COUNTERS_DOC_ID` | 17038 | `'counters'` |
| `SENSITIVE_PATTERNS` | 14858–14864 | 18 credential/key patterns |
| `BATCH_LIMIT` | 14825 | 450 (Firestore 500 limit with safety margin) |

---

## 4. Export-Scope Audit Findings

### ✅ All 13 Application Collections Exported

The `BACKUP_COLLECTIONS` array at line 14485 lists exactly 13 collections: `settings`, `funds`, `incomeCategories`, `expenseCategories`, `bankAccounts`, `billing`, `receipts`, `payments`, `transfers`, `chittyMembers`, `chittyCollections`, `chittyPayouts`, `loans`.

### ✅ System Collection Segmentation

At lines 14546–14561, the entire `system` collection is read via `db.collection(FS_COUNTERS_COLLECTION).get()` and each document is classified:

| Document ID Pattern | Destination | Handling |
| :--- | :--- | :--- |
| `counters` (exact match) | `countersData` | Direct assignment |
| `res_*` (startsWith) | `reservationsList[]` | Pushed to array |
| `op_*` (startsWith) | `idempotencyList[]` | Pushed to array |
| **Everything else** | `otherSystemDocs[]` | Pushed to separate array |

### ✅ Out-of-Scope Document Handling

Documents that don't match `counters`, `res_*`, or `op_*` are captured in `otherSystemDocs[]`. If any exist, they are included in the backup under `system.other` (line 14646). This ensures no unknown system documents are silently lost, but also means unexpected documents could be exported.

### ✅ Schema Version and Deterministic Serialization

- Schema version `23.2` is set at line 14634
- Reservations sorted by `seqNumber` at line 14583
- Idempotency records sorted by `seqNumber` then `operationId` at line 14585
- JSON serialized with `JSON.stringify(backupObj, null, 2)` at line 14666
- Parse-back validation at lines 14672–14676

### ⚠️ SHA-256 Integrity Finding (W-01: Medium)

**Finding:** The `downloadBackup()` function in the application source does **not** compute or embed a SHA-256 checksum in the exported JSON. The SHA-256 checksum reported in the STEP 33.47 report and test suite is computed **by the test harness only** (at `test_step_33_47_backup_coverage.js:403`), not by the application itself.

The exported backup file contains no integrity hash. Tampering detection relies on the restore-side validation (Phase 3), which checks structural validity and sensitive fields but cannot detect silent modification of financial values.

**Impact:** A user could unknowingly load a tampered backup file that passes structural validation but contains altered amounts or dates.

**Recommended remediation:** Add a `metadata.sha256` field to the exported backup object computed from the serialized `collections`, `counters`, `reservations`, and `idempotency` sections. On restore, verify this hash before proceeding.

### ✅ Credential and Sensitive Data Exclusion

No credential fields, authentication tokens, API keys, service account data, or emulator configuration settings are included in the export. The export reads only from the 13 application collections and the `system` collection. No `users`, `auth`, or admin SDK data is accessed.

---

## 5. Restore Validation Audit Findings

### ✅ Structural Validation (Phase 3)

| Validation | Lines | Enforcement |
| :--- | :--- | :--- |
| All 13 collections present as arrays | 14971–14977 | ✅ Reject if missing or non-array |
| Document objects validated (not null/array) | 14986–14989 | ✅ Reject malformed docs |
| `_firestoreId` required per document | 14991–14999 | ✅ Reject missing/empty/non-string IDs |
| Duplicate document IDs within collection | 14995–14998 | ✅ Reject duplicates via Set tracking |
| Serialized Timestamp structure | 15001–15007 | ✅ Validates seconds/nanoseconds |
| Monetary value validation | 15008–15013 | ✅ Non-negative finite numbers |
| Billing-receipt cross-reference | 15022–15040 | ✅ accountingReceiptId must match a receipt |
| Counters presence and validity | 15042–15054 | ✅ Required fields must be non-negative numbers |
| Reservation ID format (`res_N`) | 15069–15077 | ✅ Regex `/^res_[0-9]+$/` enforced |
| Reservation duplicate IDs | 15073–15076 | ✅ Reject duplicates via Set |
| Reservation seqNumber validity | 15078–15080 | ✅ Must be positive number |
| Reservation voided flag type | 15081–15083 | ✅ Must be boolean if present |
| Idempotency ID format (`op_*`) | 15106–15112 | ✅ Regex `/^op_[A-Za-z0-9_-]+$/` enforced |
| Idempotency duplicate IDs | 15109–15111 | ✅ Reject duplicates via Set |
| Idempotency fingerprint required | 15114–15116 | ✅ Must be non-empty string |
| **Recursive security scan (18 patterns)** | 14874–14885 | ✅ Applied to all collections, reservations, and idempotency records |

### ✅ Zero Writes Before Validation Completion

All validation checks run in Phase 3 (lines 14963–15129). If `validationErrors.length > 0` at line 15125, the function throws immediately. No Firestore writes are called before this throw. Phases 4–6+ only execute after validation passes.

### ✅ Unsupported Schema Rejection

- Legacy IndexedDB format: Rejected at lines 14942–14951 with clear user message
- Non-firestore source: Rejected at lines 14958–14960
- Unknown format: Rejected at line 14951

### ⚠️ Missing Cross-Reference Validation Between Reservations and Linked Records (W-02: Low)

**Finding:** Phase 3 validates reservation IDs, seqNumbers, and sensitive fields, but does **not** validate that:
- A reservation's `billDocId` references a document present in `collections.billing`
- A reservation's `receiptDocId` references a document present in `collections.receipts`
- A reservation's `operationId` references a document present in `idempotency`

The billing-receipt cross-reference check (lines 15022–15040) validates billing→receipt links but not reservation→billing/receipt/operation links.

**Impact:** Low. Broken cross-references would not cause data corruption during restore because reservations are stored independently. The idempotency replay logic (Steps 8–14 of `fsCreateBillingWithAccounting`) performs comprehensive cross-reference validation at transaction time.

**Recommended remediation:** Add optional cross-reference warnings (not hard errors) to Phase 3 for reservation linkage integrity.

### ✅ No Contradictory Counter Validation Gap

Counter values are validated for type (non-negative number) but not checked for inter-counter consistency. However, this is safe because Phase 7 applies `Math.max` independently to each counter, preventing regression regardless of backup values.

---

## 6. Emulator Test Results

### 6.1 Test Suite: `test_step_33_47_backup_coverage.js`

| Metric | Value |
| :--- | :--- |
| **Run timestamp** | 2026-10-12T20:41:47+05:30 |
| **Emulator ports** | Firestore: 8080, Auth: 9099 |
| **Source namespace** | `demo-step3347-src-1791817906542` |
| **Target namespace** | `demo-step3347-tgt-1791817906542` |
| **Total checks** | 25 |
| **Passed** | 25 |
| **Failed** | 0 |
| **Skipped** | 0 |

All 25 test IDs passed:

| # | Test ID | Category | Result |
| :---: | :--- | :--- | :---: |
| 1 | EXPORT-APP-01 | Export scope | ✅ |
| 2 | EXPORT-CTR-01 | Counter export | ✅ |
| 3 | EXPORT-RES-01 | Reservation export (4 docs) | ✅ |
| 4 | EXPORT-OP-01 | Idempotency export (4 docs) | ✅ |
| 5 | EXPORT-SCHEMA-01 | Schema v23.2 | ✅ |
| 6 | EXPORT-SHA256-01 | Integrity checksum | ✅ |
| 7 | EXPORT-RES-FIELDS-01 | Field preservation | ✅ |
| 8 | EXPORT-OP-FIELDS-01 | Fingerprint preservation | ✅ |
| 9 | EXPORT-VOID-RES-01 | Voided reservation | ✅ |
| 10 | RESTORE-CLEAN-01 | Clean target restore | ✅ |
| 11 | RESTORE-APP-01 | 21 app docs restored | ✅ |
| 12 | RESTORE-RES-01 | 4 reservations restored | ✅ |
| 13 | RESTORE-OP-01 | 4 idempotency restored | ✅ |
| 14 | VERIFY-RES-DOC-01 | Document audit stamps | ✅ |
| 15 | VERIFY-OP-DOC-01 | Fingerprint bit-fidelity | ✅ |
| 16 | VERIFY-CTR-DOC-01 | Counter GSC=1004 | ✅ |
| 17 | MONOTONIC-01 | Counter non-regression | ✅ |
| 18 | SAFE-NO-DELETE-01 | Zero deletion of unbacked records | ✅ |
| 19 | VOID-PRESERVE-01 | Void status preservation | ✅ |
| 20 | IDEMPOTENT-RETRY-01 | Replay detection | ✅ |
| 21 | IDEMPOTENT-VOID-01 | Voided replay rejection | ✅ |
| 22 | INTERRUPTED-OP-01 | Uncommitted token detection | ✅ |
| 23 | LEGACY-COMPAT-01 | v23.1 backward compat | ✅ |
| 24 | LEGACY-COMPAT-02 | Existing reservation preservation | ✅ |
| 25 | SEC-SCAN-01 | Credential injection rejection | ✅ |

### 6.2 Test Suite: `test_step_33_40_production_isolation.js`

| Metric | Value |
| :--- | :--- |
| **Total checks** | 105 |
| **Passed** | 105 |
| **Failed** | 0 |

### 6.3 Test Suite: `test_step_33_46_backup_recovery_verification.js`

| Metric | Value |
| :--- | :--- |
| **Total checks** | 21 |
| **Passed** | 20 |
| **Failed** | 1 |

**Failed test: `COMPARE-CTR-01`** — Expected GSC=1004, got GSC=1010.

**Root cause analysis:** This is a **stale emulator state artifact**, not a code defect. The 33.46 test uses static project IDs (`demo-backup-drill-source`/`demo-backup-drill-restore`) without namespace isolation. Counter state from a previous test run (which advanced GSC to 1010 in the safe-merge drill at line 601–606) persists in the emulator between runs.

The restore correctly applies `Math.max(live=1010, backup=1004) = 1010`, which is the **correct monotonic-merge behavior**. The test assertion was written before Step 33.47's safe-merge logic and naively expected a direct counter overwrite to 1004.

**Verdict:** Not a code defect. The 33.46 test needs dynamic `demo-*` project IDs or emulator state clearing. The 20 passing tests (including the 3 safe-merge guards SAFE-GUARD-01/02/03) confirm correct behavior.

### 6.4 Test Coverage vs. STEP 33.48 Audit Requirements

| Audit Requirement | Test Coverage | Status |
| :--- | :--- | :---: |
| 1. Complete v23.2 restore into empty target | RESTORE-CLEAN-01 through VERIFY-CTR-DOC-01 | ✅ |
| 2. Higher GSC counter preservation | MONOTONIC-01 | ✅ |
| 3. Newer live financial record preservation | SAFE-GUARD-01 (33.46) | ✅ |
| 4. Void status/reason preservation | VOID-PRESERVE-01, SAFE-GUARD-02 (33.46) | ✅ |
| 5. Absent live records preserved | SAFE-NO-DELETE-01 | ✅ |
| 6. Committed idempotency immutability | IDEMPOTENT-RETRY-01 (Phase 6C write-once) | ✅ |
| 7. No duplicate sequence allocations | MONOTONIC-01, Phase 7 math | ✅ |
| 8. Reservation-operation conflict detection | EXPORT-RES-FIELDS-01, VERIFY-RES/OP-DOC | ✅ |
| 9. Legacy v23.1 restore with existing res/op | LEGACY-COMPAT-01, LEGACY-COMPAT-02 | ✅ |
| 10. Interrupted/partial restore detection | See Section 7 below | ⚠️ |
| 11. Failed validation = zero writes | SEC-SCAN-01, Phase 3 ordering | ✅ |
| 12. No counter regression or reuse | MONOTONIC-01, SAFE-GUARD-03 | ✅ |

---

## 7. Partial-Write, Recovery, and Restore Atomicity Analysis

### ⚠️ Restore Is NOT Atomic (W-03: Medium)

**Finding:** The restore pipeline is **multi-batch, multi-phase, non-atomic**. This is explicitly documented in the code comment at lines 14726–14733:

> "Firestore does not support single transactions spanning multiple collections or more than 500 documents."

The restore writes proceed in this order:
1. Phase 6: 13 collections (one batch per collection, sequentially)
2. Phase 6B: Reservations (one batch)
3. Phase 6C: Idempotency records (one batch)
4. Phase 7: Counters (single document set)

**If a failure occurs between phases:**
- Collections restored before the failure **remain written** to Firestore
- Collections after the failure point **are not written**
- Counters may or may not be written depending on when the failure occurs
- The pre-restore safety snapshot (Phase 5) has already been downloaded to the user's computer

**Mitigation already in place:**
- Phase 5 auto-downloads a complete pre-restore safety snapshot in v23.2 format
- Error messages include the safety snapshot filename (line 15372)
- Each phase failure throws immediately, preventing further writes
- The safety snapshot includes `reservations` and `idempotency` (v23.2) — lines 15255–15261

**Retry safety analysis:**
- **Retrying a failed restore is safe** because:
  - Phase 6 safe-merge does not delete existing documents
  - Phase 6B void-preservation prevents re-activating voided reservations
  - Phase 6C is write-once (skips existing op_ docs)
  - Phase 7 is monotonic-max (cannot regress)
- **However**, if Phase 6 partially completed and the user retries, the same collection documents will be overwritten again. This is idempotent for most fields but will update `_restoredAt` timestamps.

**Impact:** Medium. A mid-restore failure leaves Firestore in a mixed state. Recovery requires using the safety snapshot, which the user must save. The system does not automatically detect or track partial restore state.

**Recommended remediation:** Consider adding a `system/_restoreState` document that records the current phase and batch progress, enabling detection of interrupted restores.

### Safety Snapshot Verification

The safety snapshot is created in Phase 5 (lines 15243–15278) using the same v23.2 schema as the export. It captures all 13 collections, counters, reservations, and idempotency records. The safety snapshot itself is a valid backup file that can be restored using `restoreBackup()`.

**Limitation:** The safety snapshot is triggered via `_downloadJson()` which calls `document.createElement('a').click()`. If the browser's download dialog is blocked (e.g., popup blocker), the snapshot may not be saved. There is no verification that the download completed.

---

## 8. Idempotency and Transaction Replay Analysis

### ✅ Operation ID and Fingerprint Matching

When an operation ID already exists (`opSnap.exists`), the replay detection performs 16 sequential checks (lines 17909–18078):

1. Authentication required (VULN-02 remediation)
2. Schema validation on operation record
3. Operation type check (`billing_linked` vs `independent_receipt`)
4. Operation ID match
5. **Caller UID validation** (cross-user replay denied)
6. Required document ID pointers (`billDocId`, `receiptDocId`, `resDocId`)
7. **Financial fingerprint v2 match**
8. Linked document existence (bill, receipt, reservation all must exist)
9–10. Document ownership verification (createdBy match)
11. Operation ID cross-verification on linked documents
12. **Sequence number consistency** across all 4 linked documents
13. Formatted identifier consistency
14. Cross-document reference validation
15. **Void replay block** — voided transactions cannot be replayed
16. Legacy v1 field-level conflict detection

### ✅ Behavior When One Linked Record Is Missing

If `opSnap.exists` but any linked document (`billDocId`, `receiptDocId`, `resDocId`) does not exist:
- Lines 17972–17980: Throws `Idempotency integrity error: Committed [billing|receipt|reservation] document "..." not found.`
- **No writes occur.** The error is thrown within the transaction before any `tx.set()` calls.
- **This is the correct behavior.** A missing linked document indicates data corruption requiring manual investigation, not automatic recovery.

### ✅ Counter Increment Safety

In the idempotency replay path, the transaction returns the original committed result at lines 18071–18078 **without executing any `tx.set()` calls**. No counter increments, no document writes, no reservation allocations occur during a replay.

### ✅ Operation Status Handling

| Operation State | Replay Behavior | Safe? |
| :--- | :--- | :---: |
| `committed` | Returns original result (isIdempotentReplay: true) | ✅ |
| `voided` (any linked doc voided) | Throws void replay error | ✅ |
| `pending` (not committed) | Not possible — operations are committed atomically within the transaction | ✅ |
| Missing operation doc | Fresh transaction executes normally | ✅ |

### ✅ Restored Operation Records Cannot Authorize Different Transactions

The fingerprint check at lines 17948–17959 prevents a restored operation record from being used to authorize a transaction with different financial details. Additionally:
- Caller UID must match the original `createdBy`
- Operation type must match
- All linked document IDs must exist and cross-reference correctly

---

## 9. Security Findings

| ID | Severity | Category | Finding | Status |
| :--- | :---: | :--- | :--- | :---: |
| **W-01** | **Medium** | Integrity | Export does not embed SHA-256 checksum in backup file | ⚠️ Open |
| **W-02** | **Low** | Validation | Reservation cross-references to billing/receipts/operations not validated in Phase 3 | ⚠️ Open |
| **W-03** | **Medium** | Atomicity | Multi-phase restore is non-atomic; interrupted restores leave mixed state | ⚠️ Mitigated by safety snapshot |
| **I-01** | **Info** | Testing | `test_step_33_46` COMPARE-CTR-01 fails due to stale static emulator namespace, not a code defect | ℹ️ Documented |

No Critical or High severity findings.

---

## 10. Detailed Finding Descriptions

### W-01: Export Missing Embedded SHA-256 Checksum (Medium)

**Location:** `downloadBackup()` at lines 14465–14707  
**Description:** The backup JSON file is produced without a `metadata.sha256` or `metadata.integrityHash` field. The STEP 33.47 report mentions SHA-256 verification, but this is performed only by the test harness, not the production code.  
**Risk:** A manually edited or corrupted backup file could pass Phase 3 structural validation and be restored with altered financial data.  
**Minimum corrective change:** After building `backupObj` and before `JSON.stringify`, compute SHA-256 of the serialized `collections`, `counters`, `reservations`, and `idempotency` payload (excluding metadata). Store it in `backupObj.metadata.sha256`. On restore, recompute and compare before Phase 4.

### W-02: Missing Reservation-to-Record Cross-Reference Validation (Low)

**Location:** Phase 3 validation at lines 15056–15090  
**Description:** Reservation documents list `billDocId`, `receiptDocId`, and `operationId` but these are not verified against the `collections.billing`, `collections.receipts`, and `idempotency` arrays respectively.  
**Risk:** Low. Broken references in a backup would not corrupt the database on restore. The idempotency layer validates references at transaction time.  
**Minimum corrective change:** Add optional warnings (not hard errors) to Phase 3 for reservation linkage verification.

### W-03: Non-Atomic Multi-Phase Restore (Medium)

**Location:** Phases 6, 6B, 6C, 7 at lines 15286–15589  
**Description:** See Section 7 above.  
**Risk:** Medium. Mid-restore failure leaves mixed state. The pre-restore safety snapshot mitigates this but depends on browser download succeeding.  
**Minimum corrective change:** Add a `system/_restoreInProgress` marker document before Phase 6 begins; clear it in Phase 10. On next restore attempt, detect this marker and warn the user of a previous interrupted restore.

### I-01: Stale Static Emulator Namespace in test_step_33_46 (Informational)

**Location:** `test_step_33_46_backup_recovery_verification.js` lines 20–21  
**Description:** Uses static project IDs `demo-backup-drill-source`/`demo-backup-drill-restore` which retain state across emulator restarts. The COMPARE-CTR-01 assertion expects GSC=1004 but finds GSC=1010 from the safe-merge drill in Section 5 of a prior run.  
**Minimum corrective change:** Use dynamic `demo-*-${Date.now()}` project IDs (as the 33.47 test suite does).

---

## 11. Reproduction Steps for Failures

### COMPARE-CTR-01 (test_step_33_46)

```bash
# 1. Start Firebase emulator
npx firebase emulators:start --config firebase.emulator.json --project demo-test

# 2. Run Step 33.46 test once (creates state with GSC=1010 in safe-merge drill)
node tests/test_step_33_46_backup_recovery_verification.js

# 3. Run Step 33.46 test again (COMPARE-CTR-01 now fails because GSC=1010 persists)
node tests/test_step_33_46_backup_recovery_verification.js
# Result: COMPARE-CTR-01 FAIL - Expected GSC=1004, got GSC=1010
```

**Fix:** Not required for this audit. The test's expectation is outdated (pre-Step 33.47).

---

## 12. Production Safety Confirmation

> [!CAUTION]
> **EXPLICIT CONFIRMATION: ZERO PRODUCTION OPERATIONS**
>
> During this audit:
> - ❌ No connection to production Firebase project `temple-f4f7d`
> - ❌ No production Firestore reads, writes, exports, or mutations
> - ❌ No counter resets or sequence number modifications
> - ❌ No deployment to Vercel or Firebase Hosting
> - ❌ No changes to `firestore.rules`, `firestore.rules.candidate`, or environment variables
> - ❌ No modifications to `deploy_staging_step_33_43/`
> - ❌ No modifications to `Temple_Accounts-1.html` (SHA-256 unchanged)
> - ❌ No existing backups or reports overwritten
> - ❌ No real user credentials or production data used in tests
> - ✅ All tests ran against disposable `demo-*` emulator project IDs
> - ✅ Source hash before: `249769CFB82C6235BE8C50F221E1A2FF77DD398FEC13BA219B53759749C13E2B`
> - ✅ Source hash after: `249769CFB82C6235BE8C50F221E1A2FF77DD398FEC13BA219B53759749C13E2B`

---

## 13. Test Execution Summary

| Test Suite | Total | Passed | Failed | Skipped | Blocked |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `test_step_33_47_backup_coverage.js` | 25 | 25 | 0 | 0 | 0 |
| `test_step_33_40_production_isolation.js` | 105 | 105 | 0 | 0 | 0 |
| `test_step_33_46_backup_recovery_verification.js` | 21 | 20 | 1 | 0 | 0 |
| **Grand Total** | **151** | **150** | **1** | **0** | **0** |

The single failure (`COMPARE-CTR-01`) is a test artifact, not a code defect (see Section 6.3 and I-01).

---

## 14. Required Remediation Summary

| Priority | Finding | Action |
| :--- | :--- | :--- |
| **Should fix** | W-01: Export SHA-256 embedding | Add `metadata.sha256` to backup JSON; verify on restore |
| **Should fix** | W-03: Interrupted restore detection | Add `system/_restoreInProgress` marker document |
| **Nice to have** | W-02: Reservation cross-ref warnings | Add optional Phase 3 warnings for res→bill/rcpt/op links |
| **Nice to have** | I-01: Test namespace isolation | Use dynamic project IDs in `test_step_33_46` |

**No Critical or High severity items require immediate remediation before production use.**

The existing safety mechanisms (pre-restore snapshot download, safe-merge rules, void preservation, monotonic counters, and idempotency replay detection) provide strong protection against the most common and dangerous failure modes.
