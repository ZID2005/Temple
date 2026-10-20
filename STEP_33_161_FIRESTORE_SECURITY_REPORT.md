# STEP 33.161 — Firestore Security Rules Hardening Report

**Project:** Temple Accounts & Fund Management  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Application File:** [`d:\Temple\Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html)  
**Firebase Project:** `temple-f4f7d`  
**Firebase Plan:** Spark (Free Tier)  
**Authorized Administrator:** `vibu@gmail.com` (UID: `rFvStQNfiINnPor66OzXuE1O9Lm1`)  
**Report Date:** 2026-10-20T15:20:00+05:30  
**Candidate Rules File:** [`d:\Temple\firestore.rules.step_33_161_candidate`](file:///d:/Temple/firestore.rules.step_33_161_candidate)  
**Test Suite:** [`d:\Temple\tests\test_step_33_161_rules_hardening.js`](file:///d:/Temple/tests/test_step_33_161_rules_hardening.js)  
**Verification Evidence:** [`d:\Temple\tests\step_33_161_rules_test_results.json`](file:///d:/Temple/tests/step_33_161_rules_test_results.json)  
**Execution Environment:** Disposable Air-Gapped Local Firestore Emulator (`127.0.0.1:8380`)  
**Deployment Status:** 🛑 **ZERO PRODUCTION DEPLOYMENT — CANDIDATE RULES QUARANTINED — LIVE RULES UNTOUCHED**

---

## 1. Executive Summary & Mandatory Safety Attestation

Following the successful commissioning of the first billing sequence (`BILL-001`, linked receipt `R-001`, counter `0`) in **STEP 33.160**, this step conducted an exhaustive security rules hardening audit for Cloud Firestore before the application begins accepting genuine financial contributions.

Prior security audits identified severe over-permissioning in the active production rules (`firestore.rules`), where a catch-all wildcard `match /{collection}/{docId} { allow read, write: if isAuthenticated(); }` allows any authenticated user to arbitrarily delete, modify, or overwrite financial transactions, sequence counters, and protected master data. Furthermore, historical candidate rules from STEP 33.51 were discovered to contain a fatal defect: complete incompatibility with physical Puja (`P600`–`P900`) and Punarudharanam (`PU1`+) receipts introduced in STEP 33.69.

### Key Achievements in STEP 33.161:
1. **Full Collection & Permission Mapping:**  
   Mapped all 13 application collections, 4 system singleton/reservation/idempotency namespaces, diagnostics, and migration staging namespaces used by `Temple_Accounts-1.html`.
2. **Elimination of Overly Broad Authenticated Wildcard Access:**  
   Removed all catch-all wildcards. Every collection now enforces least-privilege constraints with default-deny for unmapped paths.
3. **Immutability of Financial Records (Non-Destructive Voiding Only):**  
   Strictly prohibited physical deletion (`allow delete: if false;`) across all financial audit collections: `billing`, `receipts`, `payments`, `transfers`, `loans`, `chittyCollections`, and `chittyPayouts`. Enforced schema immutability so that committed financial amounts, dates, items, and sequence numbers cannot be edited.
4. **Physical Receipt Compatibility Resolution:**  
   Resolved the incompatibility present in earlier candidate rules by adding dedicated rules for physical tracking reservations (`res_phys_*`), physical idempotency records (`op_phys_rcpt_*`), and physical receipts (`rcpt_phys_*`). Both creation and non-destructive voiding are now fully supported.
5. **Monotonic Sequence Counter Protection:**  
   Enforced monotonically increasing progression for all operational sequence counters (`globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`, `voucherCounter`). Counter rollbacks and arbitrary field injections are strictly denied for normal callers.
6. **Role-Based Master Data & Settings Protection:**  
   Restricted mutations to `settings`, `funds`, `bankAccounts`, `incomeCategories`, and `expenseCategories` strictly to authorized administrators (`isAdmin()`) or active disaster recovery restore sessions (`isRestoreSessionActive()`). Protected core temple funds (`General Temple Fund`, `Punarudharanam Fund`, `Chitty Fund`) from deletion by any user.
7. **100% Air-Gapped Local Emulator Verification:**  
   Executed a dedicated 39-test automated test suite on an isolated local Firestore Emulator (`127.0.0.1:8380`), testing both allowed operations and denial cases across all 7 operational domains. Achieved a **100% pass rate (39/39 passed, 0 failed)**.
8. **Strict Compliance with Project Constraints:**  
   The active production rules file (`firestore.rules`) remains 100% untouched. Zero production writes or deployments occurred. Proposed rules are quarantined in `firestore.rules.step_33_161_candidate`.

---

## 2. Cryptographic Integrity Ledger

| Artifact | File Path | File Size (Bytes) | SHA-256 Checksum | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Active Rules (Live)** | [`d:\Temple\firestore.rules`](file:///d:/Temple/firestore.rules) | 1,216 | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **100% UNTOUCHED (Not Promoted)** |
| **Legacy Candidate Rules** | [`d:\Temple\firestore.rules.candidate`](file:///d:/Temple/firestore.rules.candidate) | 12,407 | `E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D` | Reference Baseline (STEP 33.51) |
| **Proposed Hardened Rules** | [`d:\Temple\firestore.rules.step_33_161_candidate`](file:///d:/Temple/firestore.rules.step_33_161_candidate) | 22,493 | `06A6F56E4A8C3B906FB29323FF3B3B9E06F94936E5A69BBC6048922672AA75D1` | **CREATED & VERIFIED (Quarantined)** |
| **Application Source** | [`d:\Temple\Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) | 1,155,386 | `45297BD26B59C69E1E9242BDA32AC0D866862268EF7B00DD437686688355BE98` | **100% UNTOUCHED** |
| **Hardening Test Suite** | [`d:\Temple\tests\test_step_33_161_rules_hardening.js`](file:///d:/Temple/tests/test_step_33_161_rules_hardening.js) | 27,362 | `BA90DC6BE9697CC690672706FA1C4D17EA3135C9A7515C46C79AB0796F0788B3` | Created |
| **Test Evidence JSON** | [`d:\Temple\tests\step_33_161_rules_test_results.json`](file:///d:/Temple/tests/step_33_161_rules_test_results.json) | 10,351 | `8FAEF0037CF83C1D298EFB0492DD2CC59D101B386C849DF7C8ACA16C0557E14C` | Created (39/39 PASS) |

---

## 3. Vulnerability Analysis of Active Live Rules (`firestore.rules`)

The current live rules in `d:\Temple\firestore.rules` contain critical security risks that make them unsafe for genuine financial data:

```firestore
// Current Live firestore.rules (Lines 28-31)
match /{collection}/{docId} {
  allow read, write: if isAuthenticated();
}
```

```
+---------------------------------------------------------------------------------------------------------+
|                                    ACTIVE PRODUCTION VULNERABILITY MATRIX                               |
+---------------------------------------------------------------------------------------------------------+
|  ID      | Severity | Vulnerability Description                          | Impact on Financial Records  |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-01  | CRITICAL | Wildcard Write/Delete on All Collections           | Any authenticated user can   |
|          |          | match /{collection}/{docId} { allow write; }       | delete or wipe entire tables |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-02  | CRITICAL | Deletion of Financial Audit Records                | Physical deletion of bills,  |
|          |          | billing, receipts, payments have no delete locks   | receipts, and payment books  |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-03  | HIGH     | Arbitrary Financial Data Mutation                  | Users can alter total amounts|
|          |          | Existing records can be updated with arbitrary data| or dates on past receipts    |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-04  | HIGH     | Sequence Counter Rollbacks & Injections            | Counter can be reset to 0,   |
|          |          | system/{docId} allows arbitrary counter writes     | causing duplicate bills      |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-05  | HIGH     | Master Data & Core Fund Destruction                | Non-admin operators can wipe |
|          |          | funds, bankAccounts can be deleted by any clerk    | 'General Temple Fund'        |
+----------+----------+----------------------------------------------------+------------------------------+
| VULN-06  | MEDIUM   | Idempotency & Reservation Tampering                | Cross-user replay attacks and|
|          |          | op_* and res_* documents lack caller UID binding   | reservation hijacking        |
+---------------------------------------------------------------------------------------------------------+
```

---

## 4. Defect Analysis of Legacy Candidate Rules (`firestore.rules.candidate`)

In STEP 33.51 (2026-10-12), candidate rules were drafted. However, the subsequent addition of physical receipt workflows in STEP 33.69 (2026-10-17) introduced severe architectural incompatibilities that remained unaddressed:

1. **FATAL DEFECT: Rejection of Physical Receipts (`res_phys_*` and `op_phys_rcpt_*`):**
   - In `Temple_Accounts-1.html:L22176-L22182`, physical Puja (`P600`–`P900`) and Punarudharanam (`PU1`+) receipts create reservation documents `system/res_phys_P600` and idempotency records `system/op_phys_rcpt_*`.
   - Legacy candidate rules constrained `system/{resId}` strictly to `resId.matches('^res_[0-9]+$')` and required integer `seqNumber is int`. Physical receipts have `seqNumber: null` and string identifier `formattedNo: "P600"`.
   - Legacy candidate rules constrained `system/{opId}` to require `seqNumber is int && seqNumber > 0`. Physical receipts have `type: 'physical_receipt'` without integer sequence numbers.
   - **Impact:** If legacy candidate rules were promoted, all physical receipt recording would immediately fail with `403 Permission Denied`.
2. **FATAL DEFECT: Rejection of Physical Receipt Voiding:**
   - In `Temple_Accounts-1.html:L21255`, voiding a physical receipt calls an atomic update on `system/res_phys_${canonicalPhysId}` setting `voided: true, status: 'voided'`.
   - Legacy candidate rules restricted reservation updates to `resId.matches('^res_[0-9]+$')`.
   - **Impact:** Voiding any physical receipt would crash with `403 Permission Denied`.
3. **PERSISTENT OVER-PERMISSION: Broad Write on Operational Collections:**
   - Legacy candidate rules retained `allow read, write: if isAuthenticated();` on `payments`, `transfers`, `loans`, `chittyMembers`, `chittyCollections`, `chittyPayouts`, `funds`, `incomeCategories`, `expenseCategories`, and `bankAccounts`.
   - Any signed-in user could permanently delete payment vouchers, transfer entries, or core master funds.

---

## 5. Collection Mapping & Least-Privilege Authorization Model

The proposed rules in `firestore.rules.step_33_161_candidate` define a comprehensive, least-privilege security perimeter:

### 5.1 System Collection Mapping

| Collection / Path | Document ID Pattern | Permitted Operations | Least-Privilege Constraints |
| :--- | :--- | :--- | :--- |
| `system/counters` | `counters` | `read`, `create`, `update` | Monotonic advance only for normal callers. Arbitrary rollback denied. Physical deletion denied (`allow delete: if false;`). Admin/Restore authorized to reset. |
| `system/_restoreProgress` | `_restoreProgress` | `read`, `create`, `update` | Caller UID bound (`restoredBy == request.auth.uid`). Hijack rejected. Physical deletion denied. |
| `system/{resId}` (Sequential) | `res_[0-9]+` | `read`, `create`, `update` | Bound to caller UID. Status `active`. Voiding transition only for update (`voided == true, status == 'voided'`). Deletion denied. |
| `system/{resId}` (Physical) | `res_phys_[A-Za-z0-9]+` | `read`, `create`, `update` | Type `physical_receipt`. Bound to caller UID. Voiding transition supported. Deletion denied. |
| `system/{opId}` | `op_[A-Za-z0-9_-]+` | `read`, `create` | Write-once immutable audit record (`allow update: if false; allow delete: if false;`). Bound to caller UID. |
| `system_admins/{adminUid}` | `{adminUid}` | `read` | Locked from all client-side writes (`allow write: if false;`). Seeded via console/backend only. |
| `settings/{docId}` | `1`, `set_1` | `read`, `create`, `update` | Read for all authenticated users. Create & Update restricted strictly to `isAdmin()` or active restore. Deletion denied. |

### 5.2 Financial Transaction Collections (Immutable / Non-Destructive Void Only)

| Collection | Document ID Pattern | Allowed Operations | Security Controls & Immutability Guarantees |
| :--- | :--- | :--- | :--- |
| `billing` | `bill_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Normal creation bound to caller UID (`createdBy == request.auth.uid`). **Update restricted strictly to voiding transitions** (`isValidFinancialVoidTransition()`). Total amount, items, date, and numbers cannot be edited. |
| `receipts` | `rcpt_[0-9]+`, `rcpt_phys_[A-Za-z0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Supports both sequential and physical receipts. Bound to caller UID. **Update restricted strictly to voiding transitions.** Amount, fund, category cannot be edited. |
| `payments` | `pmt_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Create requires positive amount. Update permitted on unvoided payments (for description/paidTo) or transition to voided. Once voided, cannot be re-activated. |
| `transfers` | `trans_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Create requires positive amount. Update permitted on unvoided records or transition to voided. |
| `loans` | `loan_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Audit trail of temple loans and advances preserved. |
| `chittyCollections` | `cc_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Voiding supported; hard deletes denied. |
| `chittyPayouts` | `cp_[0-9]+` | `read`, `create`, `update` | **Delete Prohibited (`allow delete: if false;`).** Voiding supported; hard deletes denied. |
| `chittyMembers` | `cm_[0-9]+` | `read`, `create`, `update`, `delete` | Members roster. Deletion permitted for authenticated callers (client checks zero financial references). |

### 5.3 Master Data Collections (Admin Role-Restricted)

| Collection | Document ID Pattern | Allowed Operations | Security Controls |
| :--- | :--- | :--- | :--- |
| `funds` | `fund_[0-9]+` | `read`, `create`, `update`, `delete` | Read allowed for all authenticated users (needed for dropdowns & reports). **Mutations restricted strictly to `isAdmin()` or active restore.** **Protected core funds (`General Temple Fund`, `Punarudharanam Fund`, `Chitty Fund`) cannot be deleted by anyone (`!isProtectedCoreFund()`).** |
| `bankAccounts` | `bank_[0-9]+` | `read`, `create`, `update`, `delete` | Read allowed for all authenticated users. **Write & Delete restricted strictly to `isAdmin()` or active restore.** |
| `incomeCategories` | `cat_[0-9]+` | `read`, `create`, `update`, `delete` | Read allowed for all authenticated users. **Write & Delete restricted strictly to `isAdmin()` or active restore.** |
| `expenseCategories` | `exp_[0-9]+` | `read`, `create`, `update`, `delete` | Read allowed for all authenticated users. **Write & Delete restricted strictly to `isAdmin()` or active restore.** |

---

## 6. Automated Emulator Verification & Test Results

A comprehensive automated test suite ([`tests/test_step_33_161_rules_hardening.js`](file:///d:/Temple/tests/test_step_33_161_rules_hardening.js)) was executed against the local Cloud Firestore Emulator running on isolated port `8380` with Java 25.

### 6.1 Test Execution Metrics
- **Total Test Cases:** 39
- **Passed:** 39 (100%)
- **Failed:** 0 (0%)
- **Target Project:** `demo-step33161-test` (Air-gapped)
- **Candidate Rules File:** `firestore.rules.step_33_161_candidate`

### 6.2 Complete Test Execution Ledger

```
========================================================================================================================
  ID           DOMAIN             TEST DESCRIPTION                                            EXPECTED   ACTUAL   RESULT
========================================================================================================================
  SEC-TEST-01  AUTHENTICATION     Unauthenticated read of billing records is rejected         HTTP 403   HTTP 403  PASS
  SEC-TEST-02  AUTHENTICATION     Unauthenticated write to system counters is rejected        HTTP 403   HTTP 403  PASS
  SEC-TEST-03  AUTHENTICATION     Unauthenticated read of master settings is rejected         HTTP 403   HTTP 403  PASS
  SEC-TEST-04  BILLING            Authenticated operator creates bill with caller UID binding HTTP 200   HTTP 200  PASS
  SEC-TEST-05  RECEIPTS           Authenticated operator creates linked accounting receipt    HTTP 200   HTTP 200  PASS
  SEC-TEST-06  BILLING            Forging bill with another user UID as creator is rejected   HTTP 403   HTTP 403  PASS
  SEC-TEST-07  BILLING            Physical deletion of billing record is strictly denied      HTTP 403   HTTP 403  PASS
  SEC-TEST-08  RECEIPTS           Physical deletion of accounting receipt is strictly denied   HTTP 403   HTTP 403  PASS
  SEC-TEST-09  BILLING            Non-destructive atomic voiding transition on bill permitted HTTP 200   HTTP 200  PASS
  SEC-TEST-10  BILLING            Tampering with financial amount of existing bill rejected   HTTP 403   HTTP 403  PASS
  SEC-TEST-11  PHYSICAL_RECEIPTS  Operator records Physical Puja receipt P600 and reservation HTTP 200   HTTP 200  PASS
  SEC-TEST-12  PHYSICAL_RECEIPTS  Operator records Physical Punarudharanam receipt PU1 & res  HTTP 200   HTTP 200  PASS
  SEC-TEST-13  PHYSICAL_RECEIPTS  Voiding physical receipt and physical reservation succeeds  HTTP 200   HTTP 200  PASS
  SEC-TEST-14  PHYSICAL_RECEIPTS  Physical deletion of physical receipt or reservation denied HTTP 403   HTTP 403  PASS
  SEC-TEST-15  COUNTERS           Operator initializes system counters singleton              HTTP 200   HTTP 200  PASS
  SEC-TEST-16  COUNTERS           Operator monotonically advances sequence counter (0 -> 1)   HTTP 200   HTTP 200  PASS
  SEC-TEST-17  COUNTERS           Operator rolling back sequence counter (1 -> 0) rejected    HTTP 403   HTTP 403  PASS
  SEC-TEST-18  COUNTERS           Administrator authorized to re-commission/reset counters    HTTP 200   HTTP 200  PASS
  SEC-TEST-19  COUNTERS           Physical deletion of system counters is strictly denied     HTTP 403   HTTP 403  PASS
  SEC-TEST-20  IDEMPOTENCY        Idempotency record is strictly immutable (updates denied)   HTTP 403   HTTP 403  PASS
  SEC-TEST-21  PAYMENTS           Operator records payment voucher pmt_503                    HTTP 200   HTTP 200  PASS
  SEC-TEST-22  PAYMENTS           Physical deletion of payment voucher is strictly denied     HTTP 403   HTTP 403  PASS
  SEC-TEST-23  TRANSFERS          Operator records fund transfer and voids it safely          HTTP 200   HTTP 200  PASS
  SEC-TEST-24  TRANSFERS          Physical deletion of fund transfer is strictly denied       HTTP 403   HTTP 403  PASS
  SEC-TEST-25  CHITTY             Physical deletion of Chitty collection / payout is denied   HTTP 403   HTTP 403  PASS
  SEC-TEST-26  CHITTY             Operator creates and deletes an unreferenced Chitty member  HTTP 200   HTTP 200  PASS
  SEC-TEST-27  MASTER_DATA        Ordinary clerk reading settings is allowed                  HTTP 200   HTTP 200  PASS
  SEC-TEST-28  MASTER_DATA        Ordinary clerk modifying settings is denied                 HTTP 403   HTTP 403  PASS
  SEC-TEST-29  MASTER_DATA        Administrator modifying settings is permitted               HTTP 200   HTTP 200  PASS
  SEC-TEST-30  MASTER_DATA        Physical deletion of settings document is denied even admin HTTP 403   HTTP 403  PASS
  SEC-TEST-31  MASTER_DATA        Ordinary clerk creating/deleting funds is denied            HTTP 403   HTTP 403  PASS
  SEC-TEST-32  MASTER_DATA        Admin seeds General Temple Fund and creates custom fund     HTTP 200   HTTP 200  PASS
  SEC-TEST-33  MASTER_DATA        Deleting protected core fund (General Temple Fund) denied   HTTP 403   HTTP 403  PASS
  SEC-TEST-34  MASTER_DATA        Administrator deleting non-core custom fund is permitted    HTTP 200   HTTP 200  PASS
  SEC-TEST-35  SYSTEM_ADMINS      Client-side write to /system_admins directory is locked     HTTP 403   HTTP 403  PASS
  SEC-TEST-36  DISASTER_RECOVERY  Operator initiates restore session in /system/_restoreProg  HTTP 200   HTTP 200  PASS
  SEC-TEST-37  DISASTER_RECOVERY  Under restore session, historical records with other UID ok HTTP 200   HTTP 200  PASS
  SEC-TEST-38  DISASTER_RECOVERY  Another user attempting to hijack restore session rejected  HTTP 403   HTTP 403  PASS
  SEC-TEST-39  DISASTER_RECOVERY  Initiating operator marks restore session completed         HTTP 200   HTTP 200  PASS
========================================================================================================================
```

---

## 7. Application Workflow Compatibility Audit

An exhaustive code audit was performed against `Temple_Accounts-1.html` to confirm that the candidate rules do not break any required application workflows:

| Application Workflow | Functions Invoked | Collections Affected | Compatibility Verdict | Audit Findings & Safeguards |
| :--- | :--- | :--- | :---: | :--- |
| **Sequential Counter Billing** | `fsCreateBillingWithAccounting()` | `billing`, `receipts`, `system/res_*`, `system/op_*`, `system/counters` | ✅ **100% COMPATIBLE** | Creates `bill_N`, `rcpt_N`, `res_N`, `op_*`, and advances `globalSequenceCounter`. All pass with caller UID. |
| **Independent Receipts** | `fsCreateIndependentReceipt()` | `receipts`, `system/res_*`, `system/op_*`, `system/counters` | ✅ **100% COMPATIBLE** | Advances `globalSequenceCounter` and creates `rcpt_N` and `res_N`. Passes validation. |
| **Physical Puja Receipts** | `fsCreatePhysicalReceipt()` | `receipts`, `system/res_phys_*`, `system/op_phys_rcpt_*` | ✅ **100% COMPATIBLE** | Creates `rcpt_phys_P*`, `res_phys_P*`, `op_phys_rcpt_*`. Does not touch sequence counters. Fully supported. |
| **Physical Renovation Receipts** | `fsCreatePhysicalReceipt()` | `receipts`, `system/res_phys_*`, `system/op_phys_rcpt_*` | ✅ **100% COMPATIBLE** | Creates `rcpt_phys_PU*`, `res_phys_PU*`, `op_phys_rcpt_*`. Fully supported. |
| **Billing & Receipt Voiding** | `fsVoidLinkedBillingAndReceipt()` | `billing`, `receipts`, `system/res_*` | ✅ **100% COMPATIBLE** | Batch sets `voided: true` and void metadata. Validated by `isValidFinancialVoidTransition()`. |
| **Physical Receipt Voiding** | `fsVoidRecordSafe('receipts')` | `receipts`, `system/res_phys_*` | ✅ **100% COMPATIBLE** | Atomic update sets `voided: true, status: 'voided'`. Fully supported by revised reservation update rule. |
| **Payment Vouchers** | `savePayment()`, `fsNextVoucherNo()` | `payments`, `system/counters` | ✅ **100% COMPATIBLE** | Monotonically increments `voucherCounter` and saves `pmt_N`. Editing unvoided vouchers permitted. |
| **Payment Voiding** | `voidRecord('payments')` | `payments` | ✅ **100% COMPATIBLE** | Sets `voided: true`. Physical deletion blocked. |
| **Fund Transfers** | `saveTransfer()`, `deleteTransfer()` | `transfers` | ✅ **100% COMPATIBLE** | `deleteTransfer` delegates to `fsVoidRecordSafe('transfers')` (non-destructive). Supported. |
| **Loans & Advances** | `saveLoan()` | `loans` | ✅ **100% COMPATIBLE** | Create and update permitted. Physical deletion blocked. |
| **Chitty Collections & Payouts** | `saveChittyCollection()`, `deleteChittyCollection()` | `chittyCollections`, `chittyPayouts` | ✅ **100% COMPATIBLE** | Collections and payouts are voided, never hard deleted. Supported. |
| **Chitty Members Roster** | `saveChittyMember()`, `deleteChittyMember()` | `chittyMembers` | ✅ **100% COMPATIBLE** | Deletion permitted if member has zero financial dependencies. |
| **Full Database Backup** | `BACKUP_COLLECTIONS.map()` | All 13 collections + `system` | ✅ **100% COMPATIBLE** | Read-only operations. All authenticated users can read collections for export. |
| **Disaster Recovery Restore** | `RESTORE_COLLECTIONS.map()` | All 13 collections + `system` | ✅ **100% COMPATIBLE** | Gated by `isRestoreSessionActive()`. Preserves historical authors and voided states. |
| **Temple Settings Management** | `saveTempleSettings()`, `saveOpeningBalances()` | `settings` | ✅ **100% COMPATIBLE** | Administrator (`vibu@gmail.com`) can save settings. Non-admins correctly rejected. |
| **Master Data CRUD** | `addFund()`, `renameRecord()`, `deleteRecord()` | `funds`, `bankAccounts`, `incomeCategories`, `expenseCategories` | ✅ **100% COMPATIBLE** | Administrator can add/edit/delete custom funds/categories. Deletion of core funds blocked for all. |

### Documented Security Constraints (Intended Restrictions):
1. **Non-Administrator Master Data Access:**
   - Ordinary clerks cannot modify or delete `funds`, `bankAccounts`, `incomeCategories`, `expenseCategories`, or `settings`.
   - Any attempt by a non-admin to mutate these collections will result in `403 Permission Denied`. This is a deliberate design requirement.
2. **Direct Financial Record Deletions (Hard Deletes):**
   - Direct calls to `.delete()` on `billing`, `receipts`, `payments`, `transfers`, `loans`, `chittyCollections`, and `chittyPayouts` will be rejected by Cloud Firestore.
   - Applications must continue to use the non-destructive `Void` action (`fsVoidRecordSafe`).

---

## 8. Deployment Prerequisites & Promotion Recommendations

Before promoting `firestore.rules.step_33_161_candidate` to production (`firestore.rules`), the following prerequisites must be verified by the administrator:

### 8.1 Administrator Identity & Multi-Admin Architecture
1. **Primary Administrator:**  
   `vibu@gmail.com` (UID: `rFvStQNfiINnPor66OzXuE1O9Lm1`) is hardcoded in `isAdmin()` as the authoritative temple administrator.
2. **Future Secondary Administrators:**  
   To grant administrative rights to additional users without requiring rule edits:
   - **Method A (Console/CLI):** Create a document in `/system_admins/{uid}` (`{ email: 'admin@temple.org', role: 'admin', grantedAt: ... }`). The candidate rules allow `isAdmin()` to resolve this locked directory.
   - **Method B (Custom Claims):** Set `{ admin: true }` or `{ role: 'admin' }` on the user's Firebase Auth token.

### 8.2 Safe Rules Promotion Procedure (Future Step)
When the administrator decides to deploy the hardened rules:
1. Verify live backup snapshot exists.
2. Overwrite `firestore.rules` with `firestore.rules.step_33_161_candidate`.
3. Deploy via Firebase CLI: `firebase deploy --only firestore:rules --project temple-f4f7d`.
4. Validate live billing issuance with `BILL-001` / `R-001`.

---

## 9. Conclusion

The candidate security rules in [`firestore.rules.step_33_161_candidate`](file:///d:/Temple/firestore.rules.step_33_161_candidate) establish a robust, least-privilege security perimeter:
- Completely closes the wildcard write/delete vulnerability of active production rules.
- Resolves the legacy candidate rules defect regarding physical Puja/Punarudharanam receipts.
- Ensures all genuine financial records (`billing`, `receipts`, `payments`, `transfers`) are permanently protected against deletion and tampering.
- Successfully validated across 39 automated tests with a **100% pass rate**.
- Adhered strictly to all safety constraints: live rules remain untouched, and zero production writes occurred.
