# STEP 33.51 — Firestore Rules & Restore-Authorization Remediation Report

**Project:** Temple Accounts & Fund Management  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Report Date:** 2026-10-12T21:45:00+05:30  
**Execution Environment:** Disposable Firebase Emulator Suite (`127.0.0.1:8080`, `127.0.0.1:9099`)  
**Air-Gap Isolation Status:** **100% AIR-GAPPED & COMPLIANT**. Zero connection to production Firebase project `temple-f4f7d`, zero data reading/export/mutation/deletion in production, zero Vercel or Firebase deployments, zero production rules promotion, zero production counter resets, and zero financial record cleanup.

---

## 1. Executive Summary

STEP 33.51 resolves the authorization and release-readiness incompatibilities identified in STEP 33.50 (SEC-01, SEC-03, and SEC-04) while strictly preserving all backup, recovery, and accounting safeguards established in STEPs 33.47 through 33.49.

### Key Remediation Achievements:
1. **SEC-01 (Safe Restore-Specific Authorization):**
   - Corrected candidate rules incompatibility where disaster recovery restorations of historical sequence reservations (`res_*`) and idempotency records (`op_*`) failed with `403 Permission Denied` due to cross-user author checks and pre-voided status constraints.
   - Designed a dual-path authorization architecture:
     - **Path 1 (Ordinary Application Operations):** Enforces strict single-user ownership (`request.resource.data.createdBy == request.auth.uid`), active initial status (`status == 'active' && voided == false`), monotonic sequence progression, and immutable idempotency.
     - **Path 2 (Disaster Recovery Restore):** Strictly gated by `isRestoreSessionActive()`, requiring an actively registered `/system/_restoreProgress` document (`status == 'in_progress' && restoredBy == request.auth.uid`). Under this active session, historical authors are preserved (`createdBy` is not overwritten), historical voided reservations remain restorable without reactivation (`status == 'voided' && voided == true`), and restoring operators are audited via `_restoredBy` and `_restoredAt`.
     - In adherence to strict safety rules, no broadly accessible `isRestore` client flag is accepted, client-supplied `_restoredBy` is never trusted alone without the verified database session document, and zero Admin SDK or privileged backends were introduced.
2. **SEC-03 (Elimination of Restore-Progress Fallback Pollution):**
   - Removed the fallback mechanism in `Temple_Accounts-1.html` that previously redirected progress writes to `settings/_restoreProgress` when system writes failed.
   - Configured `system/_restoreProgress` as the exclusive system progress document with least-privilege security rules.
   - Enforced immediate error throwing on progress write failures, ensuring permission boundaries cannot be silently masked.
   - Enhanced restore preflight to detect concurrent active restore sessions (<15 minutes by a different operator) and reject attempts to resume or overwrite an interrupted session using a different backup fingerprint.
   - Fully protected IndexedDB `settings` object store synchronization by preventing unkeyed documents from polluting the `settings` collection.
3. **SEC-04 (Elimination of Broad Wildcard Write/Delete Permissions):**
   - Validated that `firestore.rules.candidate` maintains complete default-deny protection with zero catch-all `match /{collection}/{docId}` statements.
   - Explicitly prohibited physical deletion across all financial and audit collections (`billing`, `receipts`, `settings`, `system/counters`, `system/res_*`, `system/op_*`, `system/_restoreProgress`).
   - Retained full support for non-destructive atomic voiding and safe monotonic counter updates.
4. **Dummy Financial Data Confirmation & Inventory:**
   - Acknowledged the confirmed project requirement: **ALL EXISTING FINANCIAL TRANSACTION VALUES ACROSS THE APPLICATION ARE TEST/DUMMY DATA**.
   - Performed a read-only architecture inventory categorizing all dummy financial records vs. protected master configuration data, documenting linked dependencies, orphan risks, and verification requirements for future deletion (STEP 33.52+). Zero records were deleted in this step.

---

## 2. Baseline and Final Cryptographic Hashes

A timestamped preflight backup was established prior to editing:  
`backups/step_33_51_preflight_backup_20261012_213455/`

| Artifact | File Path | Baseline SHA-256 Checksum | Final SHA-256 Checksum | Modification Status |
| :--- | :--- | :---: | :---: | :---: |
| **Working Application** | `Temple_Accounts-1.html` | `33B1745CFD1F6DF19DC60632D868186BAC3CEF9B9CF8485E4AFD81E3CAD020AB` | `0BC9B28B094D83CE85880E62821897834FE1DCBF14A48BB98A061EDCCAC20BBC` | Modified (SEC-03 progress remediation & preflight conflict guards) |
| **Active Rules (Production)** | `firestore.rules` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **100% UNTOUCHED (Not Promoted)** |
| **Candidate Hardened Rules** | `firestore.rules.candidate` | `B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C` | `E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D` | Modified (SEC-01 dual-path restore authorization & SEC-04 protection) |
| **Frozen Release Package** | `deploy_staging_step_33_43/Temple_Accounts-1.html` | `AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC` | `AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC` | **100% UNTOUCHED (Frozen)** |
| **Active Rules Config** | `firebase.json` | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | Unchanged |
| **Emulator Config** | `firebase.emulator.json` | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | Unchanged |
| **Vercel Config** | `vercel.json` | `ACAA507172EA852D8158CF44ACAE42F044FCEE92A46C80228B0E8CFEA71CB5D1` | `ACAA507172EA852D8158CF44ACAE42F044FCEE92A46C80228B0E8CFEA71CB5D1` | Unchanged |
| **Test Suite** | `tests/test_step_33_51_authorization_remediation.js` | N/A (New) | `B546A44EED14F02049731143ED693D9FA16F30827BE568EA4153C1A1DAE471F4` | Created |
| **Test Evidence JSON** | `tests/step_33_51_authorization_test_results.json` | N/A (New) | `825A17BD6328A69360ED5BF24D6262C421B7B1FB35878EAFE311D1D24746977B` | Created |

---

## 3. Files Changed and Technical Rationale

### 3.1 `firestore.rules.candidate`
- **Location:** Lines 8–18, 36–60, 62–105, 107–126.
- **Changes Made:**
  1. Added `isRestoreSessionActive()` helper function:
     ```firestore
     function isRestoreSessionActive() {
       return isAuthenticated() &&
         exists(/databases/$(database)/documents/system/_restoreProgress) &&
         get(/databases/$(database)/documents/system/_restoreProgress).data.status == 'in_progress' &&
         get(/databases/$(database)/documents/system/_restoreProgress).data.restoredBy == request.auth.uid;
     }
     ```
  2. Added dedicated least-privilege security block for `/system/_restoreProgress`:
     - Permits authenticated read.
     - Permits create/update only when payload adheres to `{ sessionId, status, startedAt, currentPhase, completedPhases, restoredBy }` where `restoredBy == request.auth.uid`.
     - Update prevents hijacking by ensuring active in-progress sessions can only be updated by the initiating operator (`resource.data.restoredBy == request.auth.uid`) or when transitioning from a completed/interrupted session.
     - Physical deletion strictly prohibited (`allow delete: if false;`).
  3. Split `/system/{resId}` creation into two strict authorized paths:
     - **Path 1 (Normal Operations):** `createdBy == request.auth.uid && status == 'active' && voided == false`.
     - **Path 2 (Disaster Recovery):** Gated by `isRestoreSessionActive()`, `_restoredBy == request.auth.uid`, `_restoredAt is string`, preserving original `createdBy`, and permitting historical voided status (`status == 'voided' && voided == true`).
  4. Split `/system/{opId}` creation into two strict authorized paths:
     - **Path 1 (Normal Operations):** `createdBy == request.auth.uid && status == 'committed'`.
     - **Path 2 (Disaster Recovery):** Gated by `isRestoreSessionActive()`, `_restoredBy == request.auth.uid`, `_restoredAt is string`, preserving original `createdBy`.
     - `allow update: if false; allow delete: if false;` strictly preserved for immutability.

### 3.2 `Temple_Accounts-1.html`
- **Location:** Lines 14929–14955, 15105–15140.
- **Changes Made:**
  1. **Purged Settings Fallback (`SEC-03`):** Removed all code in `_getRestoreProgress()` and `_updateRestoreProgress()` that read or wrote to `db.collection('settings').doc('_restoreProgress')`. All restore-progress operations exclusively target `system/_restoreProgress`.
  2. **Surfaced Write Errors:** Modified `_updateRestoreProgress()` to throw descriptive errors on write rejections instead of silently suppressing them via `console.warn`.
  3. **Concurrent Restore Mutual Exclusion:** In restore preflight, checks whether an existing restore session has `status == 'in_progress'` within the last 15 minutes by a different operator UID, throwing an immediate conflict exception.
  4. **Mismatched Backup Fingerprint Guard:** In restore preflight, detects whether an interrupted session exists for a different backup fingerprint than the currently selected file. Rejects execution with instructions to resolve the original backup or restore from safety snapshot.

---

## 4. Revised Authorization Architecture & Limitations

### 4.1 Architecture Overview
The revised authorization model uses **Database Session State Gating** to distinguish disaster-recovery writes from ordinary transactions in a client-only architecture:

```mermaid
graph TD
    A[Client Write Request to system/res_* or system/op_*] --> B{Is Authenticated?}
    B -- No --> C[DENY: 403 Unauthenticated]
    B -- Yes --> D{Ordinary Write Check:<br/>createdBy == auth.uid &&<br/>status == 'active' && voided == false}
    D -- Matches --> E[ALLOW: 200 Normal Transaction]
    D -- Fails --> F{isRestoreSessionActive()?<br/>1. exists(/system/_restoreProgress)<br/>2. status == 'in_progress'<br/>3. restoredBy == auth.uid}
    F -- No --> G[DENY: 403 Forbidden]
    F -- Yes --> H{Restore Schema Check:<br/>_restoredBy == auth.uid &&<br/>_restoredAt is string &&<br/>createdBy is non-empty string}
    H -- Passes --> I[ALLOW: 200 Restored Historical Record]
    H -- Fails --> G
```

### 4.2 Security Properties Achieved:
1. **No Client-Side Forgery via Loose Flags:** A client cannot simply attach `_restoredBy` or an `isRestore` flag to forge records during ordinary operations. Unless an active `/system/_restoreProgress` session document exists and matches the caller UID, all cross-user or voided creations are strictly denied.
2. **Session Termination Revokes Privileges:** As soon as Phase 10 completes (updating `status = 'completed'`) or an error halts execution (updating `status = 'interrupted'`), `isRestoreSessionActive()` immediately evaluates to false, locking the restore gate.
3. **Idempotency Immutability Maintained:** `allow update: if false` on `op_*` records is 100% unconditional. Once written, no operator can mutate or alter an idempotency audit record.

### 4.3 Architectural Limitations & Future Recommendations (SEC-01 Requirement 7):
- **Limitation:** In the current client-side Firestore architecture, all authenticated operators share the same Firebase Auth role (`request.auth != null`). Any authenticated user can technically initiate a restore session in `/system/_restoreProgress`.
- **Recommended Future Production Mechanism (for post-launch hardening):**
  - **Option 1 (Firebase Auth Custom Claims):** Configure Firebase Auth custom claims (e.g., `request.auth.token.role == 'admin'`). Update `match /system/_restoreProgress` so that only verified administrators can initiate restore sessions.
  - **Option 2 (Privileged Backend Restoration):** Move the disaster-recovery restore pipeline from the client browser into an isolated Google Cloud Function / Cloud Run endpoint utilizing the Firebase Admin SDK. Under this model, client Firestore rules can completely deny all client writes to `system/` and historical backdated records, reserving restoration exclusively to the privileged backend.

---

## 5. Permission Matrix: Active vs. Remediated Candidate Rules

| Document Path / Pattern | Operation | Active Rules (`firestore.rules`) | Candidate Rules (`firestore.rules.candidate`) | Security Analysis & Outcome |
| :--- | :---: | :---: | :---: | :--- |
| `/system/counters` | Read | **ALLOW (200)** | **ALLOW (200)** | Authenticated read permitted |
| `/system/counters` | Update (Monotonic) | **ALLOW (200)** | **ALLOW (200)** | Monotonic advance with whitelisted keys |
| `/system/counters` | Update (Rollback) | **ALLOW (200)** | 🛑 **DENY (403)** | Sequence regression blocked |
| `/system/counters` | Delete | **ALLOW (200)** | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| `/system/_restoreProgress` | Read | **ALLOW (200)** | **ALLOW (200)** | Authenticated progress tracking |
| `/system/_restoreProgress` | Create (In-Progress) | **ALLOW (200)** | **ALLOW (200)** | Operator UID bound (`restoredBy == auth.uid`) |
| `/system/_restoreProgress` | Update (Operator) | **ALLOW (200)** | **ALLOW (200)** | Permitted for session operator |
| `/system/_restoreProgress` | Update (Hijack) | **ALLOW (200)** | 🛑 **DENY (403)** | Blocked: another user cannot overwrite active session |
| `/system/_restoreProgress` | Delete | **ALLOW (200)** | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| `/system/res_{N}` | Create (Own UID, Active) | **ALLOW (200)** | **ALLOW (200)** | Normal billing/receipt reservation creation |
| `/system/res_{N}` | Create (Cross-User, Normal) | **ALLOW (200)** | 🛑 **DENY (403)** | Blocked: ordinary writes cannot forge other authors |
| `/system/res_{N}` | Create (Cross-User, Restore) | **ALLOW (200)** | **ALLOW (200)** | **REMEDIATED (SEC-01):** Allowed under active restore session |
| `/system/res_{N}` | Create (Voided, Normal) | **ALLOW (200)** | 🛑 **DENY (403)** | Blocked: cannot create pre-voided record outside restore |
| `/system/res_{N}` | Create (Voided, Restore) | **ALLOW (200)** | **ALLOW (200)** | **REMEDIATED (SEC-01):** Historical voided reservation preserved |
| `/system/res_{N}` | Update (Atomic Void) | **ALLOW (200)** | **ALLOW (200)** | Non-destructive void transition (`voided: false -> true`) |
| `/system/res_{N}` | Delete | **ALLOW (200)** | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| `/system/op_{id}` | Create (Own UID) | **ALLOW (200)** | **ALLOW (200)** | Normal transaction idempotency record |
| `/system/op_{id}` | Create (Cross-User, Normal) | **ALLOW (200)** | 🛑 **DENY (403)** | Blocked: ordinary writes cannot forge other authors |
| `/system/op_{id}` | Create (Cross-User, Restore) | **ALLOW (200)** | **ALLOW (200)** | **REMEDIATED (SEC-01):** Historical idempotency record restored |
| `/system/op_{id}` | Update | **ALLOW (200)** | 🛑 **DENY (403)** | 100% write-once immutable audit trail |
| `/system/op_{id}` | Delete | **ALLOW (200)** | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| `/settings/{docId}` | Read / Write | **ALLOW (200)** | **ALLOW (200)** | Authenticated temple configuration maintenance |
| `/settings/{docId}` | Delete | **ALLOW (200)** *(Flaw)* | 🛑 **DENY (403)** | Active rules wildcard allowed delete; Candidate denies |
| `/billing/{docId}` | Delete | **ALLOW (200)** *(Flaw)* | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| `/receipts/{docId}` | Delete | **ALLOW (200)** *(Flaw)* | 🛑 **DENY (403)** | Physical deletion strictly prohibited |
| Unlisted Collections | Read / Write | **ALLOW (200)** *(Flaw)* | 🛑 **DENY (403)** | Active wildcard allowed; Candidate strictly default-denies |

---

## 6. Restore-Progress Storage Behavior & SEC-03 Verification

### 6.1 Storage Behavior Trace:
- **Primary Document Path:** `/system/_restoreProgress` in collection `system`.
- **Fallback Elimination:** Zero code paths write to `settings/_restoreProgress`.
- **IndexedDB Protection:** Because `_restoreProgress` is never stored in `settings`, Phase 9 `fsGetAllSafe('settings')` reads only `settings/set_1`. No unkeyed documents enter the IndexedDB `settings` store, preventing `DataError` crashes.
- **Concurrency & Stale Marker Handling:**
  - If a prior restore was interrupted for Backup A (fingerprint `FP_A`), attempting to restore Backup B (fingerprint `FP_B`) triggers:  
    `Error: Restore conflict: A prior restore operation was interrupted while restoring a DIFFERENT backup...`
  - If another operator started a restore <15 minutes ago, subsequent attempts trigger:  
    `Error: Concurrent restore conflict: An active restore session by operator ... is currently running...`
- **Atomicity Clarification:** Restoration operates via controlled batched writes (<=450 ops/batch) with explicit pre-restore safety snapshots. As documented in the application source header, restore across multiple collections is **not atomic across the entire database** due to Cloud Firestore limits, but is **idempotently recoverable** via safe-merge.

---

## 7. Dedicated Emulator Test Cases & Exact Results

The dedicated test suite (`tests/test_step_33_51_authorization_remediation.js`) was executed against the local Firebase Emulator (`127.0.0.1:8080`, `127.0.0.1:9099`) under disposable namespace `demo-step3351-1791821494866`.

### Results Summary: 15 / 15 CHECKS PASSED (100%)

| Test ID | Requirement Category | Condition Tested | Expected Outcome | Actual Evidence | Verdict |
| :--- | :--- | :--- | :---: | :--- | :---: |
| `TEST-REQ-01` | 1. Legitimate Operations | Authorized operator creates bill, receipt, reservation, and idempotency audit record | HTTP 200 on all | Billing 200, Receipt 200, Res 200, Op 200 | ✅ **PASS** |
| `TEST-REQ-02` | 2. Unauthorized Denied | Unauthenticated writes to billing, receipts, reservations, and counters | HTTP 403 on all | Bill 403, Rcpt 403, Res 403, Ctr 403 | ✅ **PASS** |
| `TEST-REQ-03` | 3. Physical Deletions Prohibited | Physical deletion of billing, receipts, reservations, ops, counters, settings | HTTP 403 on all | Bill 403, Rcpt 403, Res 403, Op 403, Ctr 403, Set 403 | ✅ **PASS** |
| `TEST-REQ-04` | 4. Legitimate Voiding | Atomic void update permitted on billing, receipts, reservations; docs preserved | HTTP 200; docs exist | Void Bill 200, Void Rcpt 200, Void Res 200, Readback 200 | ✅ **PASS** |
| `TEST-REQ-05` | 5. Historical Cross-User Restore | Cross-user author denied under normal write, allowed under active restore session | 403 normal / 200 restore | Without restore: Res 403, Op 403. With restore: Res 200, Op 200 | ✅ **PASS** |
| `TEST-REQ-06` | 6. Void Preservation on Restore | Historical voided reservation created into clean target without reactivation | HTTP 200; voided=true | Create 200, Readback voided=true, status='voided' | ✅ **PASS** |
| `TEST-REQ-07` | 7. Idempotency Immutability | Committed idempotency records reject updates from creator and other users | HTTP 403 on all | Same user update 403, Cross user update 403 | ✅ **PASS** |
| `TEST-REQ-08` | 8. Monotonic Sequence Safeguards | Counters advance monotonically; rollbacks and reservation reuse denied | 200 advance / 403 regr | Advance 200, Rollback 403, Reuse Reservation 403 | ✅ **PASS** |
| `TEST-REQ-09` | 9. Restore Progress Lifecycle | Operator updates phase; hijack attempt denied; deletion denied; complete recorded | 200 / 403 / 403 / 200 | Operator Update 200, Hijack 403, Delete 403, Complete 200 | ✅ **PASS** |
| `TEST-REQ-10` | 10. Zero Settings Fallback | Source code free of settings fallback; document absent in settings collection | false fallback / 404 doc | Get fallback: false, Update fallback: false, Doc: 404 | ✅ **PASS** |
| `TEST-REQ-11` | 11. IndexedDB Sync Safety | Settings collection contains only set_1 with id; zero unkeyed progress docs | 1 doc / zero unkeyed | Settings docs: 1, Unkeyed detected: false | ✅ **PASS** |
| `TEST-REQ-12` | 12. Interrupted Retry Safety | Idempotent retry skips existing target records; zero duplicate records created | Zero duplicates | 3 skipped, 0 imported (0 duplicate bills/rcpts/res) | ✅ **PASS** |
| `TEST-REQ-13` | 13. Malformed Pre-write Gate | Phase 2B cryptographic gate and all Phase 3 relational integrity checks enforced | Gates present | Phase 2B: true, Phase 3: true, Relational checks: true | ✅ **PASS** |
| `TEST-REQ-14` | 14. Temple Settings Maintenance | Authorized operator reads and updates temple details while deletion is denied | HTTP 200 | Read 200, Update 200, Readback 200 | ✅ **PASS** |
| `TEST-REQ-15` | 15. Regression Suites Pass | STEP 33.49, 33.47, and 33.46 regression test suites continue to pass 100% | 81 / 81 PASS | STEP 33.49 (35/35), STEP 33.47 (25/25), STEP 33.46 (21/21) | ✅ **PASS** |

Machine-readable results recorded in: `tests/step_33_51_authorization_test_results.json`.

---

## 8. Full Automated Regression Battery Summary

| Test Suite File | Domain / Focus | Total Checks | Passed | Failed | Status | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `tests/test_step_33_51_authorization_remediation.js` | Dedicated Remediation & Rules Verification | 15 | 15 | 0 | ✅ **100% PASS** | Newly created in STEP 33.51 |
| `tests/test_step_33_49_backup_restore_hardening.js` | Integrity gates, REL validation, safe-merge | 35 | 35 | 0 | ✅ **100% PASS** | 100% regression parity |
| `tests/test_step_33_47_backup_coverage.js` | Full backup export & restore coverage | 25 | 25 | 0 | ✅ **100% PASS** | 100% regression parity |
| `tests/test_step_33_46_backup_recovery_verification.js` | Backup drill & recovery safeguards | 21 | 21 | 0 | ✅ **100% PASS** | 100% regression parity |
| `tests/test_step_33_40_production_isolation.js` | Production isolation, Vercel shielding | 105 | 104 | 1* | ⚠️ **99% PASS** | *Single expected hash change (see below) |
| **TOTAL** | | **201** | **200** | **1** | ✅ **VERIFIED** | |

*\*Note on `test_step_33_40` failure:* Check `TEST GROUP 1: Active firestore.rules.candidate untouched` reported a hash discrepancy because `firestore.rules.candidate` evolved from `B11D865A...` (STEP 33.40 baseline) to `E0D2F9D1...` (STEP 33.51 remediated rules) as explicitly instructed by this prompt.

---

## 9. Read-Only Dummy Financial Data Cleanup Inventory

> [!IMPORTANT]
> **Confirmed Requirement:** ALL EXISTING FINANCIAL TRANSACTION VALUES ACROSS THE APPLICATION ARE TEST/DUMMY DATA.  
> STEP 33.51 is an authorization-remediation step. **Zero records were deleted or modified in production.**  
> Below is the architectural read-only inventory of where test financial records reside, their linkages, and the safeguards required for future cleanup.

### 9.1 Data Classification Matrix

| Data Category | Collection / Store | Identification Pattern | Data Classification | Action in Future Cleanup Step (STEP 33.52+) |
| :--- | :--- | :--- | :--- | :--- |
| **Vazhipadu Billing** | `/billing` | `bill_{N}` | **Dummy Transaction** | Delete all records; verify linked receipt pair deletion |
| **Accounting Receipts** | `/receipts` | `rcpt_{N}` | **Dummy Transaction** | Delete all records; verify linked billing pair deletion |
| **Expense Payments** | `/payments` | `pay_{N}` | **Dummy Transaction** | Delete all records; verify cash/bank book balance impact |
| **Fund Transfers** | `/transfers` | `tx_{N}` | **Dummy Transaction** | Delete all records; verify zero dangling fund references |
| **Devotee / Staff Loans** | `/loans` | `loan_{N}` | **Dummy Transaction** | Delete all loan principal, interest, and repayment entries |
| **Chitty Collections** | `/chittyCollections` | `coll_{N}` | **Dummy Transaction** | Delete all installment collection records |
| **Chitty Payouts** | `/chittyPayouts` | `payout_{N}` | **Dummy Transaction** | Delete all prize / auction payout records |
| **Chitty Members** | `/chittyMembers` | `member_{N}` | **Mixed / Verification Required** | Distinguish test dummy subscribers from real temple devotees |
| **Temple Settings** | `/settings` | `set_1` | **Protected Master Config** | **PRESERVE**. Retain temple name, address, phone, prefix config. Re-zero opening balance fields (`openingCash`, `openingBank`) to verified starting figures. |
| **Master Funds** | `/funds` | `fund_{N}` | **Protected Master Config** | **PRESERVE**. Master definitions (General Fund, Renovation Fund). Do NOT delete fund definitions. |
| **Income Categories** | `/incomeCategories` | `inc_cat_{N}` | **Protected Master Config** | **PRESERVE**. Category definitions (Vazhipadu, Donations, etc.). |
| **Expense Categories** | `/expenseCategories` | `exp_cat_{N}` | **Protected Master Config** | **PRESERVE**. Category definitions (Pooja, Electricity, Salary, etc.). |
| **Bank Accounts** | `/bankAccounts` | `bank_{N}` | **Protected Master Config** | **PRESERVE**. Bank account configuration (Federal Bank, SBI, account numbers). |
| **Vazhipadu Items** | In-code / Config | `vazhipaduList` | **Protected Master Config** | **PRESERVE**. Vazhipadu offerings, Malayalam labels, base rates. |
| **Sequence Counters** | `/system/counters` | `counters` | **Protected Safeguard** | **DO NOT RESET TO 0**. Maintain monotonic continuity or establish a clean starting baseline (e.g. `10000`). Never reuse issued numbers. |
| **Number Reservations** | `/system` | `res_{N}` | **Protected Safeguard** | Archive / retain reservation registry to guarantee numbers cannot be re-issued. |
| **Idempotency Records** | `/system` | `op_{id}` | **Protected Safeguard** | Archive / retain committed operation tokens to prevent replay. |
| **Restore Progress** | `/system` | `_restoreProgress` | **System State** | Retain completion marker or reset to clean initialization state. |
| **Diagnostics Staging** | `/__system_diagnostics__` | `test_doc_*` | **Disposable Test Data** | Delete all synthetic diagnostic records. |
| **Migration Staging** | `/migration_staging` | `mig_*` | **Disposable Staging** | Delete staging manifests and chunks. |
| **Client IndexedDB** | `temple_accounts_db` | All transactional stores | **Local Mirror** | Re-synchronize from Firestore after Firestore cleanup. |

### 9.2 Linked Relational Dependencies & Orphan Risks:
1. **Bilateral Bill-Receipt Linkage:** Every billing record (`bill_N`) has a corresponding accounting receipt (`rcpt_N`) sharing sequence number $N$. Deletion must be executed in coordinated atomic batches to avoid creating orphaned bills without receipts or receipts without bills.
2. **Dynamic Ledger Recalculation:** The Cash Book, Bank Book, and Fund Ledgers dynamically aggregate all records from `receipts`, `payments`, and `transfers`. If any partial deletion occurs, ledger opening/closing balance equations will break.
3. **Numbering Monotonicity:** If dummy bills 1 through 100 are deleted, the next live bill MUST NOT be issued as bill 1 unless explicitly intended and approved, because physical receipts or vouchers previously printed during testing could conflict. Best practice is to set counters to a higher live starting sequence (e.g., `BILL-1001` or `BILL-10001`).

---

## 10. Release Package Handling & Future Synchronization Needs

`deploy_staging_step_33_43/` remains completely unchanged as required.

### Future Synchronization Requirements (for STEP 33.52+ release build):
When authorized to synchronize the staging release package:
1. `deploy_staging_step_33_43/Temple_Accounts-1.html` must be updated with root `Temple_Accounts-1.html` (SHA-256: `0BC9B28B...`), introducing schema v23.2, canonical RFC 8785 JSON, SHA-256 integrity verification, REL-01–11 validation, pre-restore safety snapshots, safe-merge recovery, and clean restore progress without settings fallback.
2. `firestore.rules` must be synchronized with remediated `firestore.rules.candidate` (SHA-256: `E0D2F9D1...`) to close the wildcard deletion vulnerability and enforce hardened authorization.
3. `vercel.json`, `scripts/generate-firebase-config.js`, `ogl.esm.js`, and `package.json` are already identical between root and staging.

---

## 11. Remaining Security & Recovery Risks

1. **Active Production Rules Still Permit Wildcard Delete:** Until `firestore.rules.candidate` is formally promoted and deployed to production Cloud Firestore, production project `temple-f4f7d` remains governed by active rules (`7BFEF0B0...`), which permit authenticated deletion of audit records via the catch-all wildcard.
2. **Client-Role Parity Limitation:** In the absence of Firebase Auth Custom Claims (`admin: true`), any authenticated user can technically initiate a disaster recovery restore session. Implementation of custom claims is strongly recommended prior to multi-operator live rollout.
3. **Multi-Collection Atomicity Limitation:** Cloud Firestore does not provide cross-collection ACID transactions spanning thousands of documents. Restoration relies on pre-restore safety snapshots and idempotent safe-merge recovery.

---

## 12. Required Production Verifications (Pre-Promotion Checklist)

Prior to promoting these changes to production:
1. [ ] **Clean Data State:** Execute the approved financial dummy-data cleanup (STEP 33.52) in a strictly air-gapped staging environment before touching production.
2. [ ] **Sequence Counter Policy:** Confirm committee policy on post-cleanup starting sequence numbers (e.g. continuing monotonically vs. resetting with dedicated production prefix).
3. [ ] **Production Rules Promotion:** Deploy `firestore.rules.candidate` to production Firestore only after explicit human approval.
4. [ ] **Release Staging Re-build:** Run `generate-firebase-config.js` and verify bundle hashes before Vercel promotion.
5. [ ] **Full Production Backup:** Execute an authoritative full backup export (`downloadBackup()`) with verified cryptographic checksum immediately prior to any production deployment.

---

## 13. Explicit Confirmation of Air-Gap Compliance

**I hereby confirm:**
- ZERO network requests were transmitted to production Firebase project `temple-f4f7d`.
- ZERO production data was read, exported, modified, or deleted.
- ZERO deployments to Vercel or Firebase Hosting were initiated.
- ZERO Firestore security rules were deployed to production.
- ZERO financial records or sequence counters were cleaned, deleted, or reset.
- ZERO modifications were made to `deploy_staging_step_33_43/`.
- All tests were executed against disposable local Firebase Emulator instances with synthetic data only.

---

## 14. Strict Stop Condition Met

All STEP 33.51 objectives are complete. Execution is halted. No further steps will begin without independent review and explicit instruction.
