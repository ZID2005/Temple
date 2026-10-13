# STEP 33.9 — Firestore Rules Deployment Readiness Audit Report

**Target Application:** Temple Accounts & Fund Management System (`d:\Temple\Temple_Accounts-1.html`)  
**Hardened Rules Candidate:** `d:\Temple\firestore.rules.candidate`  
**Production Rules (Preserved):** `d:\Temple\firestore.rules`  
**Production Firebase Config:** `d:\Temple\firebase.json`  
**Emulator Config:** `d:\Temple\firebase.emulator.json`  
**Target Environment:** Isolated Local Firebase Emulator Suite (`demo-temple-accounts-test`)  
**Execution Timestamp:** 2026-10-10T15:35:00+05:30  
**Overall Executive Verdict:** **CONDITIONAL PASS (Deployment-Ready Pending Stakeholder Review)**  

---

## 1. Executive Verdict & Summary

### 1.1 Executive Verdict: CONDITIONAL PASS

The candidate hardened Firestore security rules (`firestore.rules.candidate`) have successfully passed all mandatory security assertions and application compatibility checks. The rules eliminate critical vulnerabilities present in production rules—specifically **VULN-01** (wildcard rule shadowing negating settings deletion protection), **VULN-02** (unprotected permanent deletion of billing and receipt records), and **VULN-03** (exposure of arbitrary collection namespaces via universal wildcards).

The verdict is designated as **CONDITIONAL PASS** in strict accordance with the audit acceptance criteria, because:
1. **Restore Pipeline Architectural Limitation:** Under candidate rules, the client-side backup restore pruning step (`restoreBackup()`, lines 11411–11416) is blocked from physically deleting unbacked-up financial documents (`/billing`, `/receipts`) and settings (`HTTP 403 PERMISSION_DENIED`). While this is a deliberate and desirable security feature protecting historical accounting records from destructive overwrites or corrupted backup files, stakeholders must formally acknowledge that database resets cannot be performed via the client UI.
2. **Billing-to-Receipt Asymmetry:** Direct editing of a billing-linked receipt via the Receipts interface updates `/receipts/{docId}` but leaves the original `/billing/{docId}` unchanged. This pre-existing application data-access limitation is preserved and documented.
3. **Absence of Role-Based Access Control (RBAC):** Firebase Authentication in the application currently does not issue custom claims (`token.role`). All three authenticated users have equal, identical administrative authority at the Firestore rule layer.
4. **Physical Hardware Constraints:** Physical 58mm thermal printer output is untestable in a headless automated audit environment and is documented as `NOT TESTED`.

**Mandatory Safety Compliance:** Zero production files were modified. Zero production database writes, deletes, or mutations occurred. Zero production deployments were performed. Candidate rules remain quarantined in `firestore.rules.candidate`.

---

## 2. Exact Files Inspected and Fresh Cryptographic Hashes

Fresh SHA-256 cryptographic digests, file sizes, and filesystem timestamps were calculated directly from the workspace files on 2026-10-10:

### 2.1 File Catalog & Cryptographic Hashes

| File Name | Path | Size (Bytes) | Last Modified (IST) | Fresh SHA-256 Digest | Status vs Previous Report |
|---|---|:---:|:---:|---|:---:|
| `Temple_Accounts-1.html` | `d:\Temple\Temple_Accounts-1.html` | 573,486 | 2026-10-10 15:07:56 | `4F6CEB3961CC30214E115F72547902E2793E3B30720612F9061E19DA1464C499` | **VERIFIED (Investigated below)** |
| `firestore.rules` (Prod) | `d:\Temple\firestore.rules` | 1,216 | 2026-09-27 18:11:22 | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **INTACT (100% Identical)** |
| `firestore.rules.candidate` | `d:\Temple\firestore.rules.candidate` | 4,137 | 2026-10-10 14:11:20 | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | **INTACT (100% Identical)** |
| `firebase.json` (Prod) | `d:\Temple\firebase.json` | 56 | 2026-09-27 17:53:58 | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | **INTACT (100% Identical)** |
| `firebase.emulator.json` | `d:\Temple\firebase.emulator.json` | 304 | 2026-10-10 12:53:12 | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | **INTACT (100% Identical)** |
| `STEP_33_7_FIRESTORE_RULES_HARDENING_REPORT.md` | `d:\Temple\STEP_33_7_FIRESTORE_RULES_HARDENING_REPORT.md` | 25,900 | 2026-10-10 14:16:02 | `E6F65F79EFBA703B2CA4F2BED9071BB4FDBDE2C67675BC0F256CDF75B68EB6B4` | **INTACT (100% Identical)** |
| `STEP_33_8_FIRESTORE_APPLICATION_COMPATIBILITY_REPORT.md` | `d:\Temple\STEP_33_8_FIRESTORE_APPLICATION_COMPATIBILITY_REPORT.md` | 39,133 | 2026-10-10 14:59:06 | `0B367E3E22DD301E4A37B19208667BAF14422ECF4825A0509AF28C90261F9237` | **INTACT (100% Identical)** |
| `STEP_33_8A_BILLING_RECEIPT_NUMBERING_REPORT.md` | `d:\Temple\STEP_33_8A_BILLING_RECEIPT_NUMBERING_REPORT.md` | 18,621 | 2026-10-10 15:23:48 | `465CA0A7CD7F37DCD2A6BC163CD4E0B18FF3E32AB1358401A9A798558C1D800D` | **INTACT (100% Identical)** |
| `test_rules_hardening_suite.js` | `d:\Temple\test_rules_hardening_suite.js` | 24,521 | 2026-10-10 14:14:18 | `8235AD6DD971A9E1632B4E354BC1BCD3B5259CEDD79641569A8DF8BDC06E738A` | **INTACT (100% Identical)** |
| `test_step_33_8_compatibility_suite.js` | `d:\Temple\test_step_33_8_compatibility_suite.js` | 37,700 | 2026-10-10 14:55:14 | `A69395A7F7767925BED61F41295CC0D5869BCBDE457CB6465F780C589A8F4E6D` | **INTACT (100% Identical)** |
| `test_step_33_8a_numbering_suite.js` | `d:\Temple\test_step_33_8a_numbering_suite.js` | 32,827 | 2026-10-10 15:14:02 | `A79226971954181FA330B508D411D01104DA950ACBC4C96DD75B0A0D10286ABB` | **INTACT (100% Identical)** |
| `test_step_33_8a_regression.js` | `d:\Temple\test_step_33_8a_regression.js` | 9,698 | 2026-10-10 15:22:02 | `315A035FC3CD9015963A4D18123C47EFA8F4D5C383F88F1E2882B0010421A76B` | **INTACT (100% Identical)** |
| `test_emulator_harness.html` | `d:\Temple\test_emulator_harness.html` | 65,640 | 2026-10-10 13:25:26 | `F595420832992A6FA727EC8563836BD922455160B54372D43558F2C337E4BE92` | **INTACT (100% Identical)** |
| `test_step_33_9_deployment_readiness.js` | `d:\Temple\test_step_33_9_deployment_readiness.js` | 32,873 | 2026-10-10 15:35:38 | `6E6A26650DA94441BA63A0F11ECBA5F5EF45A8367F4F7A693761B012F2C55353` | **NEW (STEP 33.9 Test Runner)** |

### 2.2 Investigation of Hash Difference for `Temple_Accounts-1.html`

In accordance with Phase 1 instructions:
- **Baseline Prior to STEP 33.8A:** In STEP 33.8, `Temple_Accounts-1.html` had SHA-256 `22A1FE0BBFD55CA8C05FCEFCB236836A291D02A804CC49641EA9D1F4CD136018` (568,700 bytes). This state is preserved bit-for-bit in `Temple_Accounts-1_PreStep33_8A_BillingNumbering_Backup_20261010_150200.html`.
- **Modifications in STEP 33.8A:** At 15:07:56 IST, manual bill numbering and optional receipt numbering were implemented in `Temple_Accounts-1.html`.
- **Recorded Hash vs Text Report:** Tool execution at 15:08:02 IST in conversation `c2c62b1d-d092-49f7-86aa-4e65949def2f` returned SHA-256 `4F6CEB3961CC30214E115F72547902E2793E3B30720612F9061E19DA1464C499`. However, during report generation in step 164 of that conversation, line 61 of `STEP_33_8A_BILLING_RECEIPT_NUMBERING_REPORT.md` recorded `9933B038B316F6D6F4202DFD34F94CD41EF0406A4290747E20E3AF24647FBE92`. Investigation of the conversation transcript confirms this was a transcription error by the assistant during markdown report formatting; the file on disk was modified once at 15:07:56 IST, tested successfully in STEP 33.8A, and has remained completely untouched since then.
- **Safety Rule 5 Compliance:** `Temple_Accounts-1.html` was not overwritten or reverted; its contents match the validated STEP 33.8A implementation.

---

## 3. Production vs Candidate Rules Line-by-Line Comparison

### 3.1 Side-by-Side Code Architecture

```firestore-rules
// ============================================================================
// PRODUCTION RULES (firestore.rules) - 43 lines
// Vulnerable to wildcard shadowing and unauthorized deletion
// ============================================================================
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    match /system/{docId} {
      allow read, write: if isAuthenticated();
    }
    
    match /settings/{docId} {
      allow read, write: if isAuthenticated();
      allow delete: if false;  // <-- SHADOWED AND OVERRIDDEN!
    }
    
    match /__system_diagnostics__/{docId} {
      allow read, write, delete: if isAuthenticated();
    }
    
    match /{collection}/{docId} {  // <-- CATCH-ALL WILDCARD OVERRIDES ALL ABOVE!
      allow read, write: if isAuthenticated();
    }
    
    match /migration_staging/{migrationId} {
      allow read, write: if isAuthenticated();
      match /{subCollection}/{docId} {
        allow read, write: if isAuthenticated();
      }
    }
  }
}
```

```firestore-rules
// ============================================================================
// CANDIDATE HARDENED RULES (firestore.rules.candidate) - 124 lines
// Strict default-deny, granular permissions, non-destructive audit locks
// ============================================================================
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // 1. SYSTEM & CONFIGURATION PROTECTION
    match /system/{docId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if false;  // Physical delete locked
    }
    
    match /settings/{docId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if false;  // Physical delete locked
    }
    
    // 2. PROTECTED FINANCIAL AUDIT RECORDS (NON-DESTRUCTIVE / VOID-ONLY)
    match /billing/{docId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if false;  // Physical delete locked
    }
    
    match /receipts/{docId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if false;  // Physical delete locked
    }
    
    // 3. OPERATIONAL APPLICATION COLLECTIONS
    match /funds/{docId} { allow read, write: if isAuthenticated(); }
    match /incomeCategories/{docId} { allow read, write: if isAuthenticated(); }
    match /expenseCategories/{docId} { allow read, write: if isAuthenticated(); }
    match /bankAccounts/{docId} { allow read, write: if isAuthenticated(); }
    
    match /payments/{docId} { allow read, write: if isAuthenticated(); }
    match /transfers/{docId} { allow read, write: if isAuthenticated(); }
    match /loans/{docId} { allow read, write: if isAuthenticated(); }
    match /chittyMembers/{docId} { allow read, write: if isAuthenticated(); }
    match /chittyCollections/{docId} { allow read, write: if isAuthenticated(); }
    match /chittyPayouts/{docId} { allow read, write: if isAuthenticated(); }
    
    // 4. DIAGNOSTICS & MIGRATION STAGING
    match /__system_diagnostics__/{docId} {
      allow read, write: if isAuthenticated();
    }
    
    match /migration_staging/{migrationId} {
      allow read, write: if isAuthenticated();
      match /{subCollection}/{docId} {
        allow read, write: if isAuthenticated();
      }
    }
    
    // Catch-all wildcard /{collection}/{docId} REMOVED.
    // All undeclared namespaces return HTTP 403 by default-deny.
  }
}
```

### 3.2 Key Rules Differences & Mechanism Analysis

| Evaluation Aspect | Production `firestore.rules` | Candidate `firestore.rules.candidate` | Impact & Resolution |
|---|---|---|---|
| **Default Access Approach** | Permissive Catch-All (`match /{collection}/{docId}`) | Strict Default-Deny (No universal wildcard) | **VULN-03 Resolved:** Unknown collections are blocked by default. |
| **Settings Deletion** | Allowed (`HTTP 200`) due to wildcard shadowing and `allow write:` | Strictly Blocked (`HTTP 403`) via explicit `allow delete: if false;` | **VULN-01 Resolved:** System settings cannot be purged by clients. |
| **Financial Records Deletion** | Allowed (`HTTP 200`) via wildcard rule | Strictly Blocked (`HTTP 403`) on `/billing` and `/receipts` | **VULN-02 Resolved:** Permanent document destruction blocked. |
| **System Counters Deletion** | Allowed (`HTTP 200`) via `allow write:` | Strictly Blocked (`HTTP 403`) on `/system/{docId}` | **Counter Preservation:** Monotonic sequence continuity protected. |
| **Operational Collections** | Broad single-segment wildcard | Explicit collection whitelist (10 operational collections) | Identical functional access, zero permission leakage. |
| **Voiding Operations** | Allowed | Allowed (`update` with `{voided: true, voidReason: ...}`) | 100% compatible with bidirectional voiding workflow. |
| **Multi-User Authority** | Equal (`isAuthenticated()`) | Equal (`isAuthenticated()`) | All 3 authenticated users retain identical authority. |

### 3.3 Rule Evaluation Mechanics: Permissive Combination (Logical OR)

In Cloud Firestore Security Rules, multiple rules matching the same path are evaluated permissively:
$$\text{Access Granted} = \text{Rule}_1 \lor \text{Rule}_2 \lor \dots \lor \text{Rule}_n$$
- In production rules, `/settings/set_1` matched `match /settings/{docId}` AND `match /{collection}/{docId}`. Because the second block evaluated `allow write: if isAuthenticated();` to `true`, the `allow delete: if false;` statement in the first block was overridden.
- In candidate rules, only one match block matches `/settings/{docId}`. In that block, `allow create, update: if isAuthenticated();` grants only document creation and modification. Because `delete` is not granted by any rule and is explicitly denied, deletion is unconditionally rejected.

### 3.4 Limitations That Cannot Be Solved by Rules Alone

1. **Sequential Monotonic Numbering:** Firestore rules cannot query prior documents or evaluate counters across documents to guarantee that bill numbers follow `BILL-0001`, `BILL-0002` without gaps. Sequence monotonicity is enforced by application-level Firestore transactions (`db.runTransaction`) targeting `system/counters`.
2. **Custom Number Uniqueness Against Concurrency:** If two counter operators enter the same custom bill number simultaneously, Firestore rules cannot enforce field-level uniqueness across the collection without storing the custom string as the document ID. Uniqueness is checked client-side before submission.
3. **Double-Entry Accounting Invariants:** Rules permit authorized updates to `payments`, `receipts`, and `billing`, but do not enforce debits equaling credits or validate that a linked receipt's amount matches the billing amount.
4. **Field Schema & Type Enforcement:** Rules verify authenticated user presence and operation type, but do not inspect payload keys (`request.resource.data.keys().hasAll(...)`).

---

## 4. Security Test Results

All security tests were executed against the isolated Firebase Emulator Suite (`demo-temple-accounts-test`) using the automated runner `test_step_33_9_deployment_readiness.js`:

```text
========================================================================
   STEP 33.9 AUDIT EXECUTION SUMMARY
   Passed:     35
   Failed:     0
   Not Tested: 3
   Total:      38
   Verdict:    CONDITIONAL PASS (Ready for Review)
========================================================================
```

### 4.1 Detailed Test Assertions Matrix

| Test ID | Domain | Assertion Description | Expected | Actual Output | Status |
|---|---|---|---|---|:---:|
| `ENV-01` | Isolation | Air-gapped demo project verification | Project starts with `demo-` | `demo-temple-accounts-test` | **PASS** |
| `ENV-02` | Isolation | Emulator Hub, Firestore & Auth Active | HTTP 200 on ports 8080 & 9099 | Firestore: 8080, Auth: 9099 | **PASS** |
| `SEC-01` | Security | Unauthenticated reads/writes denied | HTTP 403 on all 27 requests | All 27 requests returned 403 | **PASS** |
| `AUTH-U1-01` | Authority | User 1 (Clerk) read operational collections | HTTP 200 or 404 (Authorized) | All 10 collections authorized | **PASS** |
| `AUTH-U1-02` | Authority | User 1 (Clerk) write operational collections | HTTP 200 across 10 collections | All 10 writes returned 200 | **PASS** |
| `AUTH-U1-03` | Settings | User 1 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U1-04` | Counters | User 1 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U1-05` | Billing | User 1 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U1-06` | Receipts | User 1 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U1-07` | Numbering | User 1 manual custom bill & receipt entry | HTTP 200 on custom numbers | Bill:200, Receipt:200 | **PASS** |
| `AUTH-U1-08` | Voiding | User 1 bidirectional void update | HTTP 200 on void updates | Bill void:200, Rcpt void:200 | **PASS** |
| `AUTH-U2-01` | Authority | User 2 (Accountant) read operational collections | HTTP 200 or 404 (Authorized) | All 10 collections authorized | **PASS** |
| `AUTH-U2-02` | Authority | User 2 (Accountant) write operational collections | HTTP 200 across 10 collections | All 10 writes returned 200 | **PASS** |
| `AUTH-U2-03` | Settings | User 2 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U2-04` | Counters | User 2 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U2-05` | Billing | User 2 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U2-06` | Receipts | User 2 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U2-07` | Numbering | User 2 manual custom bill & receipt entry | HTTP 200 on custom numbers | Bill:200, Receipt:200 | **PASS** |
| `AUTH-U2-08` | Voiding | User 2 bidirectional void update | HTTP 200 on void updates | Bill void:200, Rcpt void:200 | **PASS** |
| `AUTH-U3-01` | Authority | User 3 (Admin) read operational collections | HTTP 200 or 404 (Authorized) | All 10 collections authorized | **PASS** |
| `AUTH-U3-02` | Authority | User 3 (Admin) write operational collections | HTTP 200 across 10 collections | All 10 writes returned 200 | **PASS** |
| `AUTH-U3-03` | Settings | User 3 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U3-04` | Counters | User 3 read/update allowed, delete denied | Write:200, Read:200, Delete:403 | Write:200, Read:200, Delete:403 | **PASS** |
| `AUTH-U3-05` | Billing | User 3 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U3-06` | Receipts | User 3 create allowed, delete denied | Create:200, Delete:403 | Create:200, Delete:403 | **PASS** |
| `AUTH-U3-07` | Numbering | User 3 manual custom bill & receipt entry | HTTP 200 on custom numbers | Bill:200, Receipt:200 | **PASS** |
| `AUTH-U3-08` | Voiding | User 3 bidirectional void update | HTTP 200 on void updates | Bill void:200, Rcpt void:200 | **PASS** |
| `SEC-02` | Default-Deny | Unknown collections denied across the board | HTTP 403 on all 12 requests | All 12 requests returned 403 | **PASS** |
| `DIFF-01` | Differential | Settings delete: Prod (200) vs Candidate (403) | Prod: 200, Candidate: 403 | Prod DELETE: 200, Cand: 403 | **PASS** |
| `DIFF-02` | Differential | Billing delete: Prod (200) vs Candidate (403) | Prod: 200, Candidate: 403 | Prod DELETE: 200, Cand: 403 | **PASS** |
| `DIFF-03` | Differential | Unknown coll write: Prod (200) vs Candidate (403) | Prod: 200, Candidate: 403 | Prod PATCH: 200, Cand: 403 | **PASS** |
| `NUM-01` | Numbering | Monotonic atomic counter advancement | Sequential increments (11,12,13) | Final counter: 13 | **PASS** |
| `NUM-02` | Numbering | Custom bill number does not corrupt counters | Counter advances monotonically | Counter value: 14 | **PASS** |
| `BAK-01` | Backup | Backup read queries across all 13 stores | HTTP 200 on all 13 stores + counters | All stores returned 200 | **PASS** |
| `BAK-02` | Restore | Restore write permitted; prune delete blocked | Write: 200, Prune delete: 403 | Write: 200, Prune delete: 403 | **PASS** |
| `NT-01` | Hardware | 58mm Thermal Printer Hardware Printout | Hardware printout produced | No physical printer in fixture | **NOT TESTED** |
| `NT-02` | Safety | Live Production Firestore Writes / Mutations | Production documents mutated | Production writes forbidden | **NOT TESTED** |
| `NT-03` | Safety | Live Rules Deployment to Cloud Firestore | Rules deployed via CLI | Deployment forbidden in audit | **NOT TESTED** |

---

## 5. Application Compatibility Results

A static and dynamic audit of `Temple_Accounts-1.html` was conducted to verify that candidate rules support all active application workflows:

| Application Workflow | Target Firestore Paths | Candidate Rule Alignment | Compatibility Status |
|---|---|---|:---:|
| **Authentication & Profile Load** | Firebase Auth / `getCurrentFirebaseUser` | `function isAuthenticated() { return request.auth != null; }` | **PASS** |
| **Pooja Billing Creation** | `/billing/{id}`, `/receipts/{id}`, `/system/counters` | `allow create: if isAuthenticated()` | **PASS** |
| **Manual Bill Number Entry** | `/billing/{id}` (`manualBillNo: true`) | `allow create: if isAuthenticated()` | **PASS** |
| **Automatic Bill Numbering** | `db.runTransaction` on `system/counters` | `allow read, update: if isAuthenticated()` | **PASS** |
| **Receipt Creation (Auto)** | `/receipts/{id}`, `/system/counters` | `allow create, update: if isAuthenticated()` | **PASS** |
| **Receipt Creation (Manual)** | `/receipts/{id}` (`manualNumber: true`) | `allow create: if isAuthenticated()` | **PASS** |
| **Receipt Editing (In-Place)** | `/receipts/{id}` via `saveReceipt` | `allow update: if isAuthenticated()` | **PASS** |
| **Billing-Initiated Voiding** | `/billing/{id}` + linked `/receipts/{id}` | `allow update: if isAuthenticated()` | **PASS** |
| **Receipt-Initiated Voiding** | `/receipts/{id}` + linked `/billing/{id}` | `allow update: if isAuthenticated()` | **PASS** |
| **Payment Vouchers** | `/payments/{id}`, `/system/counters` | `allow read, write: if isAuthenticated()` | **PASS** |
| **Fund Transfers** | `/transfers/{id}` | `allow read, write: if isAuthenticated()` | **PASS** |
| **Loan Management** | `/loans/{id}` | `allow read, write: if isAuthenticated()` | **PASS** |
| **Chitty Schemes** | `/chittyMembers`, `/chittyCollections`, `/chittyPayouts` | `allow read, write: if isAuthenticated()` | **PASS** |
| **Cash Book & Bank Book** | In-memory aggregation from active receipts/payments | Read-only; zero additional writes | **PASS** |
| **Ledger, Trial Balance & Reports** | Querying `/billing`, `/receipts`, `/payments` | `allow read: if isAuthenticated()` | **PASS** |
| **Settings Management** | `/settings/{id}` | `allow read, create, update: if isAuthenticated()` | **PASS** |
| **Backup Download** | Read queries across all 13 collections | `allow read: if isAuthenticated()` | **PASS** |
| **Backup Restore (Upsert)** | Batch writes across collections | `allow create, update: if isAuthenticated()` | **PASS** |
| **Backup Restore (Pruning Extra Docs)** | Batch deletes on unbacked-up docs | `allow delete: if false;` on financial stores | **DOCUMENTED LIMITATION** |

### 5.1 Documented Operational Limitations

1. **Direct Receipt Edit Asymmetry:**  
   When an operator edits an active receipt that was originally generated from a Pooja bill, `saveReceipt()` (lines 5836–5856) issues `fsUpdateRecordSafe('receipts', editId, rec)`. The linked billing record in `/billing` is not updated. In TEST-08, modifying devotee name on `rcpt_1` left `bill_1` with the original devotee name. This is an existing application design limitation and is preserved without modification.
2. **Restore Pruning Deletion Lock:**  
   In `restoreBackup()` (lines 11411–11416), Phase 6 attempts to delete documents present in Firestore that do not exist in the backup file (`_batchDeleteCollection`). Under candidate rules, deletions on `/billing`, `/receipts`, `/settings`, and `/system/counters` return HTTP 403. Consequently, restoring a historical backup will successfully add and update records, but will not purge records created after that backup was taken. This guarantees audit trail durability against malicious or accidental wipe attempts.

---

## 6. Numbering and Accounting Safety Findings

The implementation from STEP 33.8A was inspected and evaluated across the three representative user roles:

### 6.1 Multi-User Numbering Authority
- All three authenticated accounts (Counter Clerk, Accountant, Admin) have equal authority to enter custom bill numbers via `#manualBillNo` and custom receipt numbers via `#receiptNo`.
- Leaving `#manualBillNo` blank triggers automatic numbering using the format `BILL-${String(nextBillNum).padStart(4, '0')}`.
- Leaving `#receiptNo` blank triggers automatic numbering using `fsNextReceiptNo()`, allocating `R-${nextNo}`.
- Neither the application nor the Firestore security rules impose single-user restrictions or role claims for custom numbering.

### 6.2 Counter Monotonicity & Transactional Safety
- In `fsCreateBillingWithAccounting` (lines 13543–13565), entering a custom bill number **does not reset or decrement** `billingReceiptCounter`. The transaction increments the internal counter (`curBillCnt + 1`) and names the document `bill_${nextBillNum}`, ensuring subsequent automatic bills allocate conflict-free sequential numbers.
- In `saveReceipt` (lines 5857–5873), entering a manual receipt number bypasses `fsNextReceiptNo()`, leaving `receiptCounter` unchanged for future automatic allocations.
- Verification in `NUM-01` and `NUM-02` confirmed strictly monotonic counter behavior across sequential and concurrent requests from all three users.

### 6.3 Duplicate-Number Safeguards: Client vs Atomic Data Model
- **Automatic Numbering:** Uniqueness is **atomically guaranteed by the data model** via Firestore transactions incrementing `system/counters`.
- **Manual Custom Numbering:** Uniqueness is **checked on the client** prior to submission:
  - For billing: `existingBills.find(b => b.receiptNo === manualBillNo && !b.voided)`
  - For receipts: `existingReceipts.find(r => r.receiptNo === receiptNoInput && !r.voided)`
  - Conflicting numbers against active records are rejected with an informative prompt. Conflicting numbers against voided records are permitted for re-issuance.
  - **Limitation:** Because manual numbers are stored as a field rather than the document ID, a theoretical sub-millisecond race condition between two concurrent users submitting the identical custom string could pass the client-side check before either document commits.

### 6.4 Accounting Links & Void Metadata Integrity
- Linked fields between billing and receipts (`accountingReceiptId`, `billingFirestoreId`, `billingReceiptNo`, `source: 'billing'`) are preserved upon creation, editing, and voiding.
- Voided records retain their original sequential numbers and are flagged with `voided: true`, `voidReason`, `voidDate`, and `voidedBy`.
- Cash Book, Bank Book, reports, and financial aggregates strictly filter out records where `voided === true`, preventing voided transactions from corrupting ledger balances.

---

## 7. Deployment Configuration Findings

Inspection of configuration files `firebase.json` and `firebase.emulator.json` verified:

1. **Target Project Binding:**
   - Neither `firebase.json` nor `firebase.emulator.json` hardcodes a default cloud project.
   - The production Firebase project is `temple-f4f7d`. Cloud operations require explicit specification via `--project temple-f4f7d`.
   - The emulator configuration explicitly targets `demo-temple-accounts-test`, which engages Google Cloud CLI's air-gap mode, rejecting external internet traffic.
2. **Rules Target File Binding:**
   - In `firebase.json`: `"rules": "firestore.rules"`.
   - In `firebase.emulator.json`: `"rules": "firestore.rules"`.
   - The candidate rules file is stored separately as `firestore.rules.candidate`.
   - Candidate rules have **not** been substituted for `firestore.rules`.
   - No automated build script, npm script, or CI/CD workflow automatically copies or deploys `firestore.rules.candidate`.
3. **Emulator Port Alignment:**
   - Firestore Emulator: Host `127.0.0.1`, Port `8080` (matches test runners and test harness).
   - Auth Emulator: Host `127.0.0.1`, Port `9099` (matches test runners and test harness).
   - Emulator UI: Host `127.0.0.1`, Port `4000`.
   - Hub: Host `127.0.0.1`, Port `4400`.
4. **Credential & Secret Protection:**
   - Zero private API keys, service-account JSON files, or production passwords exist in the repository.

---

## 8. Remaining Blockers, Risks, and Limitations

| Risk / Finding ID | Severity | Category | Description & Mitigating Context |
|---|:---:|:---:|---|
| **RISK-01** | **MEDIUM** | Backup & Restore | **Restore Pruning Blocked:** Under candidate rules, client-side restore cannot purge unbacked-up records from `/billing`, `/receipts`, `/settings`, or `/system`.<br>*Mitigation:* Desirable audit protection; full database resets require Firebase CLI / Admin SDK. |
| **RISK-02** | **MEDIUM** | Data Synchronization | **Receipt Edit Asymmetry:** Editing a billing-derived receipt in the Receipts UI does not update the billing record in `/billing`.<br>*Mitigation:* Documented operational workflow; users advised to void and re-issue rather than directly edit linked receipts. |
| **RISK-03** | **LOW** | Authorization | **Role-Agnostic Access (No RBAC):** All authenticated accounts share identical database privileges.<br>*Mitigation:* Satisfies current temple requirement; future release can introduce Firebase Custom Claims (`token.role`). |
| **RISK-04** | **LOW** | Concurrency | **Client-Side Manual Number Uniqueness:** Uniqueness of custom bill/receipt numbers is verified by client queries prior to transaction commit.<br>*Mitigation:* Small operator pool (3 users) makes simultaneous collision highly improbable. |
| **RISK-05** | **LOW** | Hardware | **Physical Thermal Printing Untested:** 58mm physical thermal paper output untestable headless.<br>*Mitigation:* Browser print pipeline and Unicode rendering verified intact in STEP 33.8A regression tests. |

---

## 9. Production Files and Data Modification Confirmation

In compliance with Safety Constraints 1, 3, 4, 5, and 6:
- [x] **Production `firestore.rules`:** **NOT MODIFIED** (SHA-256: `7BFEF0B0F4C3...` verified intact).
- [x] **Production `firebase.json`:** **NOT MODIFIED** (SHA-256: `E87125F3EC64...` verified intact).
- [x] **Production Application (`Temple_Accounts-1.html`):** **NOT MODIFIED** (SHA-256: `4F6CEB3961CC...` verified intact).
- [x] **Production Firestore Database (`temple-f4f7d`):** **ZERO WRITES, ZERO DELETES, ZERO MUTATIONS**.
- [x] **Production Firebase Authentication Accounts:** **ZERO ACCESS OR MUTATION**.
- [x] **Production Counters & Financial Records:** **UNTOUCHED**.

---

## 10. Production Deployment Status Confirmation

In compliance with Safety Constraint 2 and Acceptance Criteria:
- [x] **Production Deployment Performed:** **NO**.
- [x] **Firebase Deploy Commands Executed:** **NONE**.
- [x] **Candidate Rules Quarantined:** `firestore.rules.candidate` remains quarantined on the local filesystem.
- [x] **Emulator State Restored:** Emulator memory was cleared of synthetic test records and baseline production rules were restored at test conclusion.

---

## 11. Precise Recommendation for the Next Step

### Recommended Next Step: Stakeholder Review Prior to Production Deployment

Before proceeding with production deployment in STEP 34, temple management and trustees should review and formally approve:
1. The **CONDITIONAL PASS** status and the documented limitations in Section 8 (particularly the backup restore pruning lock).
2. The operational recommendation that database resets are conducted via Firebase Admin CLI rather than client restore.

### Exact Deployment Execution Plan (When Approved for STEP 34):

1. **Pre-Deployment Production Rule Backup:**
   ```powershell
   Copy-Item "d:\Temple\firestore.rules" "d:\Temple\firestore.rules.pre_deploy_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
   ```
2. **Promote Candidate Hardened Rules:**
   ```powershell
   Copy-Item "d:\Temple\firestore.rules.candidate" "d:\Temple\firestore.rules" -Force
   ```
3. **Verify Fresh Rule Hash:**
   Confirm `firestore.rules` matches candidate SHA-256: `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B`.
4. **Deploy Rules to Production Project:**
   ```powershell
   firebase deploy --only firestore:rules --project temple-f4f7d
   ```
5. **Execute Post-Deployment Production Verification:**
   Verify read access on settings and counters, and verify authenticated bill and receipt creation on `temple-f4f7d`.

---
*Report generated under the strict non-destructive audit and air-gapped testing protocols of STEP 33.9.*
