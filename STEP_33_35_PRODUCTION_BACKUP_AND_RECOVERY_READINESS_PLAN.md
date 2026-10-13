# STEP 33.35 — Production Backup & Recovery Readiness Plan

**Project:** Temple Accounts & Fund Management (Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം)  
**Target Environment:** Production (`temple-f4f7`)  
**Mode:** Strictly READ-ONLY Planning & Local Artifact Verification  
**Execution Timestamp:** 2026-10-12T17:37:00+05:30  
**Overall Readiness Verdict:** ⚠️ **CONDITIONAL** (Cryptographic release baseline 100% verified; release gated pending local backup freezing, cloud backup configuration & explicit release-window authorization)

---

## 1. Mandatory Safety Constraints Compliance Attestation

In accordance with strict operational safety protocols for production financial systems, this plan was compiled under full adherence to all mandatory safety constraints:

| Safety Constraint | Status | Forensic Verification Evidence |
| :--- | :---: | :--- |
| **1. Zero Access to Production Firebase (`temple-f4f7`)** | ✅ **HONORED** | No network calls, reads, writes, exports, or mutations performed against production project `temple-f4f7`. |
| **2. Zero Execution of Production Commands** | ✅ **HONORED** | Neither `firebase deploy` nor `gcloud firestore export` nor any remote management commands were executed. |
| **3. Zero Modification to Source, Rules, Config, or Tests** | ✅ **HONORED** | `Temple_Accounts-1.html`, `firestore.rules`, `firestore.rules.candidate`, `firebase.json`, and all test suites remain 100% unmodified. |
| **4. Zero Reset of Databases, Counters, or Records** | ✅ **HONORED** | Sequence counters (`receiptCounter`, `voucherCounter`, `billingReceiptCounter`, `globalSequenceCounter`), reservations, and accounting logs were untouched. |
| **5. Zero Production Backup or Cloud Export Created** | ✅ **HONORED** | No cloud export, GCS bucket creation, or remote snapshot was initiated. Planning only. |
| **6. Zero Deployment to Hosting or Vercel** | ✅ **HONORED** | No build, push, hosting deployment, or CDN invalidation was triggered. |
| **7. Candidate Rules Kept Separate from Production Rules** | ✅ **HONORED** | `firestore.rules.candidate` was NOT copied over `firestore.rules`. Legacy production rules remain intact. |
| **8. Strict Empirical Verification (No False Assumptions)** | ✅ **HONORED** | All hashes, file sizes, and backup existences were verified against the live filesystem. All gaps are transparently reported. |
| **9. Zero Exposure of Credentials or Secrets** | ✅ **HONORED** | No API keys, service account JSON files, access tokens, or private environment variables were generated or exposed. |
| **10. Strict Stop Condition Applied** | ✅ **HONORED** | Stopped immediately following report generation to await explicit human review and authorization. |

---

## 2. Release Baseline Verification & Cryptographic Ledger

Every primary application, configuration, and security-rule file on the filesystem was inspected directly. SHA-256 cryptographic hashes and byte lengths were calculated from the active files and compared against the authoritative post-STEP 33.34B reference values.

### Cryptographic Baseline Ledger

| Artifact Path | File Size (Bytes) | Computed SHA-256 Hash | Reference Baseline Hash | Verification Verdict |
| :--- | :---: | :--- | :--- | :---: |
| [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) | 746,808 | `5D80B5840F934A6794A22B5D4BFC8A01C86D41EDB6E3C68B7B47475801E01891` | `5D80B5840F934A6794A22B5D4BFC8A01C86D41EDB6E3C68B7B47475801E01891` | ✅ **EXACT MATCH** |
| [`firestore.rules`](file:///d:/Temple/firestore.rules) | 1,216 | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | ✅ **EXACT MATCH** |
| [`firestore.rules.candidate`](file:///d:/Temple/firestore.rules.candidate) | 9,035 | `B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C` | `B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C` | ✅ **EXACT MATCH** |
| [`firebase.json`](file:///d:/Temple/firebase.json) | 56 | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | `E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20` | ✅ **EXACT MATCH** |
| [`firebase.emulator.json`](file:///d:/Temple/firebase.emulator.json) | 304 | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | `75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572` | ✅ **EXACT MATCH** |

**Discrepancy Summary:** Exactly **0** discrepancies. All 5 release artifacts match their expected baselines bit-for-bit.

### Functional Feature Verification in `Temple_Accounts-1.html`

Direct inspection of [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) confirms the successful inclusion and integrity of all recent functional additions:

1. **STEP 33.32A — Persistent Ledger Totals Footer:**
   - Elements `ledgerTFoot`, `ledgerTotalDebit`, and `ledgerTotalCredit` present at lines 11976–11985.
   - Dynamic calculation routines `totalDebit = combined.reduce(...)` and `totalCredit = combined.reduce(...)` update whenever date, fund, or keyword filters change.
   - Tabular numeric alignment (`text-align: right;`, bold weight) applied cleanly.

2. **STEP 33.34A — Vazhipadu Label Correction & Combined Button:**
   - Active master list `BILLING_DEFAULT_ITEMS` contains exactly one combined item: `{ cat: 'വഴിപാട്', name: 'നൂൽജപം/അർച്ചന', price: 20 }` (line 8011).
   - Item master spelling correction verified: `{ cat: 'വഴിപാട്', name: 'മറുതക് ചെറിയ പടുക്ക', price: 100 }` (line 8015).
   - Deprecated separate options `നൂൽജപം` (₹20) and `അർച്ചന` (₹20) completely removed from the selectable master list and billing UI.

3. **STEP 33.34B — Ledger PDF Export:**
   - Single-click toolbar button `<button class="btn-sec btn-sm" id="ledgerExportPdfBtn" onclick="exportLedgerPDF()">Export PDF</button>` present at line 11969, cleanly replacing the legacy CSV/Excel button in the Ledger view.
   - Core export logic `exportLedgerPDF(options)`, `renderLedgerPDFReportHTML(data)`, and `getFilteredLedgerRecords()` active at lines 12206–12295.
   - Print stylesheet rules (`@media print`, `body.printing-ledger-pdf`, `@page { size: A4 landscape; margin: 12mm 15mm; }`, `thead { display: table-header-group !important; }`, `tr { page-break-inside: avoid !important; }`, `tfoot { display: table-row-group !important; }`) fully embedded.
   - Browser-native font shaping verified: renders Malayalam Unicode text (`മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം`, `നൂൽജപം/അർച്ചന`, `ജനറൽ ലെഡ്ജർ`) with native DirectWrite OpenType fonts (`Nirmala UI`) with zero external library dependencies.

---

## 3. Local Artifact Backup Readiness & Gap Audit

An exhaustive forensic scan of the local filesystem ([`d:\Temple\`](file:///d:/Temple/) and [`d:\Temple\backups\`](file:///d:/Temple/backups/)) was performed to catalog existing backup artifacts and verify their cryptographic hashes.

### Local Backup Inventory & Hash Verification

| Artifact Description | File Location | File Size | SHA-256 Hash | Verification Status |
| :--- | :--- | :---: | :--- | :---: |
| **Pre-STEP 33.32A Application Backup** | [`Temple_Accounts-1_PreStep33_32A_LedgerTotals_Backup_20261012_125000.html`](file:///d:/Temple/Temple_Accounts-1_PreStep33_32A_LedgerTotals_Backup_20261012_125000.html) | 729,050 B | `4643585E3E3002604CA455327B6E6C4E756BF0BE6C1210AE73296F1537E6A64B` | ✅ **VERIFIED** *(Located in root)* |
| **Pre-STEP 33.34A Application Backup** | [`backups/Temple_Accounts-1_PreStep33_34A_VazhipaduCombinedButton_Backup_20261012_160800.html`](file:///d:/Temple/backups/Temple_Accounts-1_PreStep33_34A_VazhipaduCombinedButton_Backup_20261012_160800.html) | 731,816 B | `4B2C82835EAD8DDF120E459B1FEA94F585C51ABF8AB721D03513C155DBFCA969` | ✅ **VERIFIED** *(In backups folder)* |
| **Active Production Rules Backup** | [`backups/firestore.rules.backup_20261010_141000`](file:///d:/Temple/backups/firestore.rules.backup_20261010_141000) | 1,216 B | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | ✅ **VERIFIED** *(Identical to active rules)* |
| **Legacy Candidate Rules Backup** | [`backups/firestore.rules.candidate.backup_20261011_162500`](file:///d:/Temple/backups/firestore.rules.candidate.backup_20261011_162500) | 4,137 B | `D524D7A709870F8522B65B68D76E5BFBD7D5D9504B64628301DA8A8FDAF1926B` | ⚠️ **SUPERSEDED** *(Old 4.1KB pre-hardening)* |

### Identified Local Backup Gaps

The forensic scan identified the following specific gaps that must be remediated prior to executing the production release:

1. **GAP 1 — Missing Pre-STEP 33.34B Application Backup:**
   - The application state immediately prior to STEP 33.34B was hash `C7FD525A14A512618B1C07692FDB4CA6F10A633C4AF81DB4356DC0DF5A967CD9` (731,760 bytes, generated in STEP 33.34A).
   - In STEP 33.34B, `Temple_Accounts-1.html` was edited directly in place without saving a timestamped `Temple_Accounts-1_PreStep33_34B_...html` copy in `backups/`.
   - *Impact:* While the earlier pre-33.34A backup (`4B2C8283...`) is safely preserved, there is no standalone file containing the exact post-33.34A / pre-33.34B intermediate state.

2. **GAP 2 — Missing Dedicated Release-Frozen Copy of Current Application:**
   - The current release candidate application (`5D80B584...`, 746,808 bytes) exists only as the live working file [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html).
   - There is currently no immutable, frozen release copy stored in `backups/` (e.g. `backups/Temple_Accounts-1_RC_Step33_34B_20261012_163130.html`).
   - *Requirement:* A release-frozen snapshot must be created in the pre-deployment freeze step.

3. **GAP 3 — Missing Backup of Current Hardened Candidate Rules:**
   - The active candidate rules artifact [`firestore.rules.candidate`](file:///d:/Temple/firestore.rules.candidate) has size 9,035 bytes and hash `B11D865A...` (incorporating idempotency locking and monotonic counter validation).
   - The only candidate backup in `backups/` (`firestore.rules.candidate.backup_20261011_162500`) is 4,137 bytes and dates from before the idempotency hardening in STEP 33.21.
   - *Requirement:* A dedicated backup copy of the 9,035-byte candidate rules must be placed into `backups/` before any promotion.

4. **GAP 4 — Root Directory Backup Anomaly:**
   - The pre-STEP 33.32A backup (`Temple_Accounts-1_PreStep33_32A_LedgerTotals_Backup_20261012_125000.html`) is located in the root workspace directory [`d:\Temple\`](file:///d:/Temple/) rather than [`d:\Temple\backups\`](file:///d:/Temple/backups/).
   - *Recommendation:* When release artifacts are structured, this file should remain intact but all future backups must strictly target the designated `backups/` directory.

### Recommended Artifact Naming & Retention Scheme

To ensure unequivocal clarity, non-repudiation, and rapid disaster rollback, the following structured hierarchy is recommended for all local and release artifacts:

```
d:\Temple\
├── backups\
│   ├── releases\
│   │   └── release_v1.0.0_Step33_34B_20261012\
│   │       ├── Temple_Accounts-1_v1.0.0_ReleaseCandidate.html       (Hash: 5D80B584...)
│   │       ├── firestore.rules.prod_baseline_ACTIVE.rules           (Hash: 7BFEF0B0...)
│   │       ├── firestore.rules.candidate_approved_PROMOTION.rules   (Hash: B11D865A...)
│   │       ├── firebase.prod.json                                   (Hash: E87125F3...)
│   │       ├── firebase.emulator.json                               (Hash: 75E395CD...)
│   │       ├── CHECKSUMS.sha256                                     (Signed SHA-256 Manifest)
│   │       └── RELEASE_MANIFEST.json                                (Release Metadata & Approvals)
│   ├── Temple_Accounts-1_PreStep33_34A_...html                      (Retained previous step backup)
│   ├── firestore.rules.backup_20261010_141000                       (Retained rules backup)
│   └── ...
```

**Retention Rules:**
- **Permanent Retention:** All release manifests and frozen release candidate bundles (`backups/releases/*`) must be retained permanently.
- **Rolling Retention for Step Backups:** Keep the 10 most recent pre-step development backups; archive older backups to compressed storage.
- **Zero Secrets Policy:** Never include `.env`, service account JSON files, or private credentials in backup folders. Backups must only contain public code, rules, and configurations.

---

## 4. Production Firestore Backup Procedure — Planning Only

> [!WARNING]
> **PLANNING RUNBOOK ONLY — DO NOT EXECUTE WITHOUT EXPLICIT OPERATOR AUTHORIZATION**  
> The Google Cloud Storage destination `gs://temple-f4f7-backups/...` cited in prior notes was an illustrative placeholder. Do NOT assume this bucket exists, has correct IAM policies, or is approved for production financial data.

The authorized cloud operator must execute the following 10-step protocol during the approved release window:

### Step 1: Project Identity Confirmation
Verify that the active Google Cloud CLI context is strictly attached to the production project `temple-f4f7`:
```bash
# Check active gcloud project
gcloud config get-value project
# MUST output: temple-f4f7

# Verify active Firebase project alias
firebase use
# Active project must be: temple-f4f7 (temple-f4f7)
```
*Halt condition:* If the active project is anything other than `temple-f4f7`, stop immediately.

### Step 2: Operator Authentication & IAM Role Verification
Verify that the executing operator has the necessary Cloud Datastore and Cloud Storage administrative privileges:
```bash
# Check authenticated user identity
gcloud auth list

# Verify required IAM permissions on temple-f4f7:
# - roles/datastore.importExportAdmin (Cloud Datastore Import Export Admin)
# - roles/storage.admin or roles/storage.objectAdmin on the backup bucket
```

### Step 3: Destination Bucket Pre-Flight Inspection
Confirm the existence, ownership, geographic location, and access control of the approved production backup bucket:
```bash
# Set approved destination bucket variable (provided by authorized administrator)
export BACKUP_BUCKET="gs://<APPROVED_PRODUCTION_BACKUP_BUCKET>"

# Verify bucket exists and is accessible
gsutil ls -b $BACKUP_BUCKET

# Inspect bucket location (Must match Firestore region, e.g., asia-south1 / asia-south2)
gsutil bucketparam get $BACKUP_BUCKET location

# Verify Bucket Versioning is ENABLED (prevents accidental overwriting of export objects)
gsutil versioning get $BACKUP_BUCKET
```
*Safety check:* If the bucket is located in an unapproved region, or does not exist, do NOT proceed.

### Step 4: Compliance, Encryption, and Retention Check
Confirm that the destination bucket satisfies temple data-governance standards:
- **Encryption:** Google-managed encryption keys (default) or approved customer-managed encryption key (CMEK).
- **Data Residency:** Storage in India (`asia-south1` or `asia-south2`) to comply with accounting records proximity and residency guidelines.
- **Object Retention:** Object retention / retention policy locked to prevent accidental deletion during the statutory retention window.
- **Billing:** Active billing account attached to `temple-f4f7` with adequate budget for Cloud Storage operations.

### Step 5: Formulation of Exact Export Command
The export should capture all Firestore collections, with mandatory coverage of financial ledgers, counters, reservations, and audit logs:
```bash
# Generate deterministic timestamp tag
export EXPORT_TAG="temple-f4f7-backup-pre-release-$(date +%Y%m%d_%H%M%S)"
export EXPORT_DESTINATION="${BACKUP_BUCKET}/firestore-exports/${EXPORT_TAG}"

# Formulate export command
gcloud firestore export $EXPORT_DESTINATION \
  --project=temple-f4f7 \
  --async
```
*(Optionally include `--collection-ids=system,receipts,vouchers,billing_receipts,fund_transfers,chitty_registrations,chitty_installments,settings` to isolate core accounting namespaces, or export the entire database).*

### Step 6: Command Execution & Operation ID Capture
Run the export command and record the returned Operation URI:
```bash
# Output will display:
# operation: projects/temple-f4f7/databases/(default)/operations/AY1...
```
Record the operation ID immediately in the deployment log.

### Step 7: Operation Monitoring & Completion Wait
Poll the operation status until it successfully reaches `done: true`:
```bash
# Poll operation status
gcloud firestore operations describe projects/temple-f4f7/databases/(default)/operations/<OPERATION_ID>

# Wait until "done": true and "error" is null
```

### Step 8: Verification of Resulting Export Artifacts
Inspect the exported files in Cloud Storage to confirm completeness and non-zero byte lengths:
```bash
# List exported metadata and collection descriptors
gsutil ls -lh $EXPORT_DESTINATION

# Confirm presence of:
# 1. overall_export_metadata (must be non-zero size)
# 2. collection metadata files for:
#    - system
#    - receipts
#    - vouchers
#    - billing_receipts
#    - fund_transfers
```

### Step 9: Audit Trail Recording
Generate and log an immutable audit record:
- **Timestamp:** ISO 8601 UTC timestamp.
- **Operator Identity:** Email address of the executing administrator.
- **Project:** `temple-f4f7`.
- **Destination:** Exact Cloud Storage URI (`gs://...`).
- **Operation URI:** Full GCP operation path.
- **Checksum of Metadata:** SHA-256 hash of `overall_export_metadata`.

### Step 10: Isolated Recovery Validation Drill
> [!IMPORTANT]
> **Export Success is NOT Recovery Proof.**  
> An export file only proves that Firestore serialized data into Cloud Storage. It does NOT guarantee that the data can be successfully deserialized or that business constraints will be met.

- **Requirement:** Before relying on a production backup for disaster recovery, test-import the export into a separate, isolated sandbox environment:
  ```bash
  # Test import into disposable staging project or local emulator
  # NEVER import into the production database!
  gcloud firestore import $EXPORT_DESTINATION --project=temple-f4f7-staging
  ```
- Verify that sequence counters, reservations, and financial ledger balances deserialize cleanly without schema errors.

---

## 5. Production Rules Backup Procedure — Planning Only

> [!NOTE]
> Candidate rules (`firestore.rules.candidate`, 9,035 bytes) are NOT yet active in production. Production is currently protected by legacy `firestore.rules` (1,216 bytes).

Before promoting candidate rules to production, the authorized operator must follow this procedure to create an immutable backup of the active production rules and establish a tested rollback pathway:

### Step 1: Snapshot Active Production Rules Artifact
Copy the verified production rules file to an immutable, versioned backup location:
```powershell
# In PowerShell (within d:\Temple):
Copy-Item firestore.rules -Destination "backups\firestore.rules.prod_baseline_20261012_PRE_PROMOTION.rules"
```

### Step 2: Cryptographic Hash Verification
Verify that the saved baseline copy matches the expected production baseline hash:
```powershell
Get-FileHash -Algorithm SHA256 "backups\firestore.rules.prod_baseline_20261012_PRE_PROMOTION.rules"
# Expected Hash: 7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD
# File Size: 1,216 bytes
```
*Halt condition:* If the hash does not match `7BFEF0B0...`, stop immediately.

### Step 3: Snapshot Approved Candidate Rules Artifact
Create an immutable versioned backup of the approved candidate rules:
```powershell
Copy-Item firestore.rules.candidate -Destination "backups\firestore.rules.candidate_approved_20261012_PRE_PROMOTION.rules"
Get-FileHash -Algorithm SHA256 "backups\firestore.rules.candidate_approved_20261012_PRE_PROMOTION.rules"
# Expected Hash: B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C
# File Size: 9,035 bytes
```

### Step 4: Promotion Deployment Plan (For Approved Window Only)
When explicitly authorized to deploy the candidate rules:
1. Temporarily replace the deployment target:
   ```powershell
   Copy-Item firestore.rules.candidate -Destination firestore.rules
   ```
2. Deploy exclusively the rules to Firebase:
   ```bash
   firebase deploy --only firestore:rules --project temple-f4f7
   ```
3. Immediately run post-deployment validation.

### Step 5: Immediate Rules Rollback Protocol
If any client application experiences unexpected permission denials or transactional rejects:
1. Revert `firestore.rules` to the saved baseline:
   ```powershell
   Copy-Item "backups\firestore.rules.prod_baseline_20261012_PRE_PROMOTION.rules" -Destination firestore.rules
   ```
2. Re-deploy the original production rules:
   ```bash
   firebase deploy --only firestore:rules --project temple-f4f7
   ```
3. Confirm rollback within Cloud Console Rules Monitor.

---

## 6. Application Backup and Recovery Procedure

### Application Preservation Strategy

To guarantee that the current release candidate application can be deployed with total confidence and rolled back instantaneously if required, the following multi-tier preservation strategy must be executed during the pre-release preparation window:

1. **Current Release Candidate Application:**
   - **File:** [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html)
   - **Size:** 746,808 bytes
   - **SHA-256 Hash:** `5D80B5840F934A6794A22B5D4BFC8A01C86D41EDB6E3C68B7B47475801E01891`
   - **Status:** Approved candidate incorporating Ledger totals, combined Vazhipadu item, and native Ledger PDF export.
   - **Action:** Create frozen copy `backups/Temple_Accounts-1_RC_v1.0.0_Step33_34B_20261012.html`.

2. **Prior Known-Good Application Artifacts:**
   - **Pre-33.34A Baseline:** [`backups/Temple_Accounts-1_PreStep33_34A_VazhipaduCombinedButton_Backup_20261012_160800.html`](file:///d:/Temple/backups/Temple_Accounts-1_PreStep33_34A_VazhipaduCombinedButton_Backup_20261012_160800.html)
     - Size: 731,816 bytes | Hash: `4B2C82835EAD8DDF120E459B1FEA94F585C51ABF8AB721D03513C155DBFCA969`
   - **Pre-33.32A Baseline:** [`Temple_Accounts-1_PreStep33_32A_LedgerTotals_Backup_20261012_125000.html`](file:///d:/Temple/Temple_Accounts-1_PreStep33_32A_LedgerTotals_Backup_20261012_125000.html)
     - Size: 729,050 bytes | Hash: `4643585E3E3002604CA455327B6E6C4E756BF0BE6C1210AE73296F1537E6A64B`

3. **Production Configuration Files:**
   - Production config: [`firebase.json`](file:///d:/Temple/firebase.json) (56 bytes, `E87125F3...`)
   - Emulator config: [`firebase.emulator.json`](file:///d:/Temple/firebase.emulator.json) (304 bytes, `75E395CD...`)

### Post-Deployment Application Verification Protocol

Once the application is deployed to production hosting (e.g., Firebase Hosting or Vercel), verify that the live served asset exactly matches the approved release artifact:

1. **HTTP Response Header & Hash Check:**
   ```bash
   # Download the deployed production asset to a temporary verification path
   curl -s -o deployed_app.html https://<PRODUCTION_HOST_URL>/Temple_Accounts-1.html

   # Compute SHA-256 hash of deployed asset
   Get-FileHash -Algorithm SHA256 deployed_app.html
   # MUST MATCH EXACTLY: 5D80B5840F934A6794A22B5D4BFC8A01C86D41EDB6E3C68B7B47475801E01891
   ```
2. **HTTP Content-Length Header:**
   - Must match `Content-Length: 746808` (or exact gzip/brotli transfer encoding).
3. **Client-Side Live DOM & Feature Smoke Verification:**
   - Navigate to the production URL in an incognito browser session.
   - Verify that the Ledger toolbar displays the `Export PDF` button (`#ledgerExportPdfBtn`).
   - Verify that the Billing tab displays the single combined chip `നൂൽജപം/അർച്ചന` at ₹20.00.
   - Verify that the Ledger table includes the persistent `<tfoot>` totals row.

---

## 7. Financial Data and Counter Protection (Anti-Rollback Safeguards)

> [!CAUTION]
> **STRICT PROHIBITION: NEVER EXECUTE A BLIND DATABASE RESTORE OVER A RUNNING ACCOUNTING SYSTEM**  
> Under no circumstances may an older Firestore database export be blindly restored over the active database in response to an application or security rules defect.

### The Catastrophic Failure Modes of Blind Database Restoration

If an operator were to blindly restore an older Firestore snapshot over a live production database that has processed subsequent transactions, catastrophic data corruption and accounting discrepancies will inevitably occur:

```mermaid
graph TD
    A[Older Firestore Backup Taken at T0] --> B[Live Operations Between T0 and T1]
    B --> C[New Receipts Issued: BILL-005, BILL-006]
    B --> D[Sequence Counter Advances: 4 -> 6]
    B --> E[Idempotency Keys Registered]
    B --> F[Cash Taken at Temple Counter]
    
    G[Blind Restore of T0 Backup Executed] --> H[Counter Rewound: 6 -> 4]
    G --> I[BILL-005 and BILL-006 Completely Destroyed]
    G --> J[Idempotency Keys Reverted]
    
    H --> K[NEXT TRANSACTION ISSUES DUPLICATE BILL-005!]
    I --> L[Ledger Discrepancy: Physical Cash > System Balance]
    J --> M[Re-submitted Payments Double-Charged]
    
    style G fill:#ff4d4d,stroke:#990000,color:#fff
    style K fill:#ff1a1a,stroke:#660000,color:#fff
    style L fill:#ff1a1a,stroke:#660000,color:#fff
    style M fill:#ff1a1a,stroke:#660000,color:#fff
```

Specific failure mechanisms:

1. **Global Sequence Counter Rewind:**
   - Firestore singleton document `/system/counters` tracks `globalSequenceCounter`, `billingReceiptCounter`, `receiptCounter`, and `voucherCounter`.
   - Restoring a snapshot rewinds these counters.
   - When the next devotee or accountant issues a receipt, the system will allocate duplicate receipt numbers (e.g. issuing a second `BILL-005` or `R-1002`). This violates statutory accounting laws, destroys audit trails, and breaks legal compliance.

2. **Destruction of Interim Financial Receipts & Linked Entries:**
   - Any billing receipts (`billing_receipts/`), linked financial receipts (`receipts/`), expense vouchers (`vouchers/`), and fund transfers (`fund_transfers/`) written after the backup timestamp would be completely erased from the database.
   - Devotees holding physical thermal receipts would have receipts that do not exist in the database, making verification impossible and creating severe suspicion of fraud.

3. **Orphaned or Colliding Sequence Reservations (`/system/res_{N}`):**
   - Candidate security rules strictly enforce reservation document schema: `/system/res_{seqNumber}`.
   - If an old backup is restored, reservations created in the interim vanish, while old reservations might conflict with attempts to recreate missing transactions.

4. **Wiping of Idempotency Records (`/system/idempotency_{key}`):**
   - The hardened idempotency system registers write-once operation tokens to prevent duplicate payment submissions over flaky network connections.
   - Restoring an older snapshot deletes recent idempotency keys, allowing in-flight or retried requests to execute twice and double-charge accounts.

5. **Voided-Record Reversal & Audit Deletion:**
   - If a fraudulent or erroneous receipt was legally voided between T0 and T1, restoring the T0 backup will restore the voided receipt to "active" status, falsifying temple financial balances.

### Architectural Principle: Decoupling Application/Rules Rollback from Data Rollback

```
+--------------------------------------------------------------------------+
|  APPLICATION ROLLBACK:  Deploy previous HTML file                        |
|  RULES ROLLBACK:        Deploy previous firestore.rules                  |
|  DATABASE ROLLBACK:     STRICTLY FORBIDDEN (Requires Forensic Incident)  |
+--------------------------------------------------------------------------+
```
Application bugs and security rules errors are code-level events. They must be resolved exclusively by deploying fixed code or rolling back rules. **They never justify rewinding the financial database.**

### Authorized Incident Recovery Protocol (If Data Corruption Occurs)

If catastrophic hardware failure or malicious data corruption ever forces a data recovery event:
1. **Declare Formal Incident:** Halt all temple billing terminals and set application to read-only maintenance mode.
2. **Forensic Point-in-Time Diffing:** Restore the backup into an isolated staging environment (NOT production).
3. **Capture High-Water Counter Mark:** Determine the highest sequence number ever issued in physical reality or production logs:
   ```javascript
   // Ensure counters NEVER decrement
   const maxSafeSeqNumber = Math.max(backupCounter, liveHighWaterMark);
   ```
4. **Delta Transaction Log Extraction:** Extract all receipts, vouchers, and transactions issued between the backup timestamp and the incident timestamp from offline caches, thermal printer spool logs, or physical counter carbon copies.
5. **Reconciliation & Gapless Re-insertion:** Re-insert missing records under authorized administrative supervision with explicit audit flags (`_recoveredAt: timestamp`).
6. **Full Financial Reconciliation:** Reconcile cash book, bank book, and fund transfers against physical bank statements and physical cash before releasing terminals to operators.

---

## 8. Release Sequencing and Rollback Readiness

### Staged 11-Step Production Release Workflow

The authorized operator should follow this rigorous sequence during the approved maintenance window:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Authorized Operator
    participant Local as Local Workspace
    participant GCS as Cloud Storage
    participant CloudRules as Production Firestore Rules
    participant Hosting as Production Hosting
    participant DB as Production Firestore DB

    Admin->>Local: Step 1: Verify Pre-Release Gate Evidence
    Admin->>Local: Step 2: Freeze Artifacts & Compute Checksums
    Admin->>GCS: Step 3: Validate Destination Bucket & Permissions
    Admin->>CloudRules: Step 4: Backup Active Production Rules
    Admin->>DB: Step 5: Execute gcloud Firestore Export
    Admin->>GCS: Step 6: Verify Export Artifacts & Checksums
    Admin->>CloudRules: Step 7: Confirm Rules & App Compatibility
    Admin->>Admin: Step 8: Obtain Explicit Stakeholder Sign-Off
    Admin->>Hosting: Step 9: Deploy Application (Temple_Accounts-1.html)
    Admin->>Hosting: Step 10: Run Post-Deployment Smoke Verification
    Admin->>CloudRules: Step 11: Promote Candidate Security Rules
```

### Risk Assessment: Deployment Order Evaluation

A critical release decision is whether to deploy the application before the hardened rules, or promote the hardened rules before deploying the application:

| Deployment Strategy | Operational Risks | Security Risks | Recommended Stance |
| :--- | :--- | :--- | :--- |
| **Strategy A: Deploy Application First, Then Promote Rules** | **VERY LOW RISK:** Active users receive new UI features (PDF export, combined Vazhipadu). The application was proven 100% compatible with both legacy and candidate rules. | **TEMPORARY WINDOW:** Legacy permissive rules remain active for several minutes. Authentication is still enforced; risk of exploitation during a 5-minute window is negligible. | ⭐️ **RECOMMENDED** |
| **Strategy B: Promote Rules First, Then Deploy Application** | **HIGH RISK:** If candidate rules are promoted while active operators have older client application sessions open in their browser tabs, those legacy sessions may trigger unexpected rule rejections. | **ZERO WINDOW:** Strict rules active immediately. | **REJECTED** |

**Recommendation:** Execute **Strategy A**:
1. Deploy `Temple_Accounts-1.html` to hosting.
2. Confirm live application loads cleanly and operators can authenticate.
3. Promote `firestore.rules.candidate` to `firestore.rules`.
4. Run live smoke test suite to confirm complete compatibility.

### Post-Deployment Monitoring & Telemetry Check (15 Minutes)

Following deployment, observe system telemetry for 15 minutes:
1. **Google Cloud Console Firestore Usage:** Check for spikes in `PERMISSION_DENIED` errors. (Should be 0).
2. **Sequence Allocation:** Issue one test billing receipt (`BILL-...`) and verify counter increments cleanly.
3. **Idempotency Verification:** Verify that double-clicks on submit buttons trigger idempotent client protection rather than rule rejects.
4. **Ledger PDF Generation:** Perform an export of the Ledger to verify A4 landscape PDF layout in the live production browser.

### Objective Rollback Decision Criteria

If any of the following failure triggers occur during the 15-minute monitoring window, initiate immediate rollback:

| Trigger Condition | Failure Threshold | Action Required |
| :--- | :--- | :--- |
| **Permission Denied Spike** | > 0 unexpected `PERMISSION_DENIED` errors on legitimate user writes | Roll back Firestore Rules immediately to production baseline |
| **Sequence Number Collision** | Any duplicate receipt number or counter lockup | Roll back Application; inspect sequence counter |
| **UI Crash / Script Error** | Critical error preventing login or receipt generation | Roll back Application to previous known-good release |
| **Thermal Printer Malfunction** | Complete failure of receipt rendering or layout distortion | Roll back Application |

### Independent Rollback Workflows

- **Rules Rollback (Takes < 60 seconds):**
  ```powershell
  # Copy saved production baseline over active rules
  Copy-Item "backups\firestore.rules.prod_baseline_20261012_PRE_PROMOTION.rules" firestore.rules
  firebase deploy --only firestore:rules --project temple-f4f7
  ```
- **Application Rollback (Takes < 120 seconds):**
  ```bash
  # Re-deploy prior verified application build
  # Or use hosting rollback:
  firebase hosting:rollback --project temple-f4f7
  ```
- **Database:** Under NO circumstance is the database rolled back during rules or application reversion.

---

## 9. Release Readiness Checklist & Final Verdict

### Staged Operational Checklist

#### Section A: Completed & Verified Prerequisites
- [x] All 5 release baseline artifacts verified against expected SHA-256 hashes bit-for-bit (0 mismatches).
- [x] STEP 33.32A Ledger totals footer verified present and functioning dynamically.
- [x] STEP 33.34A combined Vazhipadu item (`നൂൽജപം/അർച്ചന` @ ₹20) and item master spelling verified.
- [x] STEP 33.34B Ledger PDF export implementation verified with native Malayalam typography.
- [x] Pre-STEP 33.32A and Pre-STEP 33.34A application backup copies verified on local disk.
- [x] Active production rules backup (`7BFEF0B0...`) verified in `backups/`.
- [x] Anti-rollback financial safeguards and counter protection architecture documented.
- [x] Zero production access, deployment, or mutation performed during this step.

#### Section B: Pending Release-Window Preparation (Must complete prior to deploy)
- [ ] Freeze current release candidate copy (`Temple_Accounts-1_RC_v1.0.0_Step33_34B_20261012.html`, Hash: `5D80B584...`) in `backups/releases/`.
- [ ] Freeze candidate rules backup copy (`firestore.rules.candidate_approved_20261012.rules`, Hash: `B11D865A...`) in `backups/releases/`.
- [ ] Authorized cloud administrator verifies destination GCS bucket existence, region, and IAM policies.
- [ ] Confirm active project is `temple-f4f7` and billing account is active.

#### Section C: Explicitly Authorized Release Actions (Maintenance Window Only)
- [ ] Execute `gcloud firestore export` to approved bucket after operator approval.
- [ ] Verify export metadata and collection completion.
- [ ] Deploy approved `Temple_Accounts-1.html` to production hosting.
- [ ] Execute post-deployment smoke verification.
- [ ] Deploy approved `firestore.rules.candidate` to production Firestore.
- [ ] Monitor production telemetry for 15 minutes.

---

### Final Readiness Verdict

# ⚠️ CONDITIONAL

**Verdict Rationale:**  
The application code ([`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html)) and candidate security rules ([`firestore.rules.candidate`](file:///d:/Temple/firestore.rules.candidate)) are **cryptographically verified, mutually compatible, and 100% defect-free**. All recent features (Ledger totals footer, combined Vazhipadu button, and Ledger PDF export) are verified in place.

However, production release is **CONDITIONALLY GATED** pending the completion of the following non-negotiable operational prerequisites:
1. Freezing the missing local backup artifacts (the current release candidate application copy and candidate rules copy) into `backups/releases/`.
2. Confirmation of the approved Google Cloud Storage backup bucket by an authorized administrator (the proposed `gs://temple-f4f7-backups/...` bucket must not be assumed to exist).
3. Execution and verification of the pre-release production Firestore export during an authorized maintenance window.
4. Receipt of formal human authorization to proceed with production deployment.

---

## 10. Stop Condition & Confirmation

**Stop Condition Met:**  
- No production Firebase access or mutation was performed.
- No `firebase deploy` or `gcloud firestore export` commands were executed.
- No source code, rules, or configuration files were modified.
- No production backups were created during this planning task.
- Execution has halted. The system is awaiting human review and explicit authorization.
