# STEP 33.87 — Authorization and Master-Data Integrity Remediation Design Audit (READ-ONLY)

**Report Date:** 2026-10-18  
**Audit Target:** `Temple_Accounts-1.html`  
**Execution Mode:** Strictly READ-ONLY Architectural, Authorization & Integrity Design Audit  
**Author:** Antigravity AI  

---

## 1. Baseline Verification & Integrity Assurance

### 1.1 Target File Baseline Hashes and Metrics
Prior to conducting this design audit, cryptographic hashes and byte sizes of the primary application file and local Firestore configuration files were measured directly from the filesystem:

| File Path | SHA-256 Checksum | File Size (Bytes) | Verification Status |
| :--- | :--- | :--- | :--- |
| `d:\Temple\Temple_Accounts-1.html` | `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE` | `844,787` | **VERIFIED MATCH** |
| `d:\Temple\firestore.rules` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | `1,216` | **VERIFIED MATCH** |
| `d:\Temple\firestore.rules.candidate` | `E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D` | `12,407` | **VERIFIED MATCH** |

### 1.2 Verification of STEP 33.86 Findings
A line-by-line inspection of `d:\Temple\Temple_Accounts-1.html` was conducted to verify whether the findings documented in `STEP_33_86_MASTER_DATA_SYNC_AUDIT_REPORT.md` remain accurate against the current local source code:

1. **Master Data CRUD Operations:**
   - Functions `allFunds()`, `allBankAccounts()`, `allIncomeCategories()`, and `allExpenseCategories()` (lines 6548–6551) delegate to `fsGetAllSafe()`.
   - Mutation handlers `addFund()`, `addBankAccount()`, `addIncomeCategory()`, `addExpenseCategory()` (lines 15397–15440) delegate to `fsSaveRecordSafe()`.
   - Edit handler `renameRecord()` (lines 7729–7760) calls `fsUpdateRecordSafe()`.
   - Delete handler `deleteRecord()` (lines 6429–6470) calls `fsDeleteRecordSafe()`.
   - *Confirmation:* **100% Verified.** The code matches the STEP 33.86 report exactly.
2. **Persistence Path:**
   - `fsSaveRecordSafe`, `fsUpdateRecordSafe`, and `fsDeleteRecordSafe` (lines 18731–18845) perform remote Cloud Firestore calls first, then mirror changes to local IndexedDB (`putRec`, `deleteRec`).
   - *Confirmation:* **100% Verified.**
3. **Synchronization & Real-Time Listeners:**
   - Search across the entire codebase confirms that **zero Firestore `onSnapshot` listeners** exist for master-data collections or settings.
   - *Confirmation:* **100% Verified.** Real-time cross-client synchronization is completely absent.
4. **Historical Accounting Data Format:**
   - Transaction records (`receipts`, `payments`, `billing`) store raw descriptive strings (`fund`, `category`, `bankAccount`) without foreign keys or stable identifiers (`fundId`, `categoryId`).
   - *Confirmation:* **100% Verified.**
5. **Hardcoded Core Dependencies:**
   - Hardcoded strings `'General Temple Fund'`, `'Punarudharanam Fund'`, `'Chitty Fund'`, `'Vazhipadu Income'`, and `'Donation Income'` exist in `getFundBalance()` (lines 6602–6608), `fsCreateBillingWithAccounting()` (lines 19621–19624), `parsePhysicalReceiptIdentifier()` (lines 7785–7808), and `saveOpeningBalances()` (lines 15372–15376).
   - *Confirmation:* **100% Verified.**

---

## 2. Evidence-Backed Authorization Assessment

### 2.1 Current Authentication & Role Management Inspection
An exhaustive audit of authentication logic across `Temple_Accounts-1.html` revealed:

```
+-----------------------------------------------------------------------------------------+
|                               CURRENT AUTHENTICATION REALITY                            |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   1. Firebase Auth Method: Email/Password (firebase.auth().signInWithEmailAndPassword)  |
|   2. User Identification:  user.uid, user.email (lines 18162-18179)                     |
|   3. Role System in Code:  ZERO roles. No 'admin', 'clerk', or 'operator' properties.   |
|   4. User Record Store:    NO 'users' collection in Firestore or IndexedDB.             |
|   5. Authorization Gate:   Every authenticated user has EQUAL permissions.              |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

Specifically:
- **`getCurrentFirebaseUser()` (lines 18162–18169):** Simply returns `firebase.auth().currentUser`. It does not inspect custom claims, claims tokens, or role flags.
- **`saveTempleSettings()` (lines 15353–15354) & `saveOpeningBalances()` (lines 15378–15379):**
  ```javascript
  const user = getCurrentFirebaseUser();
  if (!user) { alert('Authentication required to modify settings.'); return; }
  ```
- **`addFund()` / `renameRecord()` / `deleteRecord()`:** Only assert `if (!user)`.
- **Historical Assessment Reports Confirmation:**
  - `STEP_17_MULTI_USER_SECURITY_VERIFICATION_REPORT.md` (lines 303–305) states:
    > *"There are no per-user roles, no role-based access control (RBAC), and no user-specific data partitioning in the current implementation. Any account registered in Firebase Authentication for the temple-f4f7d project and not disabled has identical read/write access to all production Firestore collections."*
  - `STEP_33_3_ISOLATED_TEST_ENVIRONMENT_ASSESSMENT.md` (line 49) states:
    > *"Access Control: Role-agnostic multi-user access. Security rules in firestore.rules mandate request.auth != null for all collections. All authenticated users share equal read/write access."*

### 2.2 Server-Side Firestore Security Rules Reality
Inspection of active production rules (`d:\Temple\firestore.rules`) and candidate rules (`d:\Temple\firestore.rules.candidate`) confirms:

1. **Active Production Rules (`firestore.rules`):**
   ```firestore
   // All application collections: authenticated users only
   match /{collection}/{docId} {
     allow read, write: if isAuthenticated();
   }
   match /settings/{docId} {
     allow read, write: if isAuthenticated();
     allow delete: if false;
   }
   ```
2. **Candidate Hardened Rules (`firestore.rules.candidate`):**
   ```firestore
   match /funds/{docId} { allow read, write: if isAuthenticated(); }
   match /incomeCategories/{docId} { allow read, write: if isAuthenticated(); }
   match /expenseCategories/{docId} { allow read, write: if isAuthenticated(); }
   match /bankAccounts/{docId} { allow read, write: if isAuthenticated(); }
   match /settings/{docId} { allow read, write: if isAuthenticated(); allow delete: if false; }
   ```

**Consequences of the Current Rules:**
- Any user who signs in (e.g. a billing counter operator or volunteer clerk) possesses full administrative privileges at the Firestore API level.
- A non-admin user can open the browser console and invoke `fsDeleteRecordSafe('funds', 'fund_1')` or `db.collection('funds').doc('fund_1').delete()`, permanently destroying core temple funds from Cloud Firestore.
- Neither the server nor the client distinguishes administrators from ordinary operators.

### 2.3 Proposed Administrator Authorization Architecture
A secure authorization design cannot rely on client-side state or user-editable database fields. The architecture must clearly separate three layers:

```
+-----------------------------------------------------------------------------------------+
|                           THREE-TIER AUTHORIZATION ARCHITECTURE                         |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ LAYER 1: UI Visibility & Client Guards ]                                             |
|  - Hide 'Settings' nav link and edit buttons for non-administrators                     |
|  - Route protection: navigate('settings') redirects unauthorized users to 'overview'    |
|  - NOTE: Purely cosmetic; provides UX clarity, NOT security                             |
|                                                                                         |
|  [ LAYER 2: Server-Enforced Firestore Security Rules ]                                  |
|  - The authoritative security perimeter                                                 |
|  - allow create, update, delete: if isAdmin();                                          |
|  - Rejects unauthorized network payloads at the database engine level                   |
|                                                                                         |
|  [ LAYER 3: Trusted Role Administration & Storage ]                                     |
|  - Authoritative role verification without client-side tampering                        |
|  - Evaluated via Custom Auth Claims OR Locked Firestore Directory /admins/{uid}         |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

#### Detailed Layer Evaluation:
1. **Layer 1: UI Visibility & Client-Side Checks**
   - Add an application auth helper: `isCurrentUserAdmin(): boolean`.
   - In `NAV_ITEMS` and `VIEW_RENDERERS.settings`, check `isCurrentUserAdmin()`. If false, suppress the Settings button on the navigation rail, and render a polite access-denied card if navigated to directly.
   - Master data mutation functions (`addFund`, `renameRecord`, `deleteRecord`, `saveOpeningBalances`) check `if (!isCurrentUserAdmin()) throw new Error('Administrative privileges required.');`.
2. **Layer 2: Firestore Security Rules Enforcement**
   - Security rules must strictly govern master-data collections:
     ```firestore
     // Helper function to verify administrator status
     function isAdmin() {
       return isAuthenticated() && (
         request.auth.token.admin == true ||
         exists(/databases/$(database)/documents/system_admins/$(request.auth.uid))
       );
     }

     match /funds/{docId} {
       allow read: if isAuthenticated();
       allow write: if isAdmin();
     }
     match /bankAccounts/{docId} {
       allow read: if isAuthenticated();
       allow write: if isAdmin();
     }
     match /incomeCategories/{docId} {
       allow read: if isAuthenticated();
       allow write: if isAdmin();
     }
     match /expenseCategories/{docId} {
       allow read: if isAuthenticated();
       allow write: if isAdmin();
     }
     match /settings/{docId} {
       allow read: if isAuthenticated();
       allow write: if isAdmin();
       allow delete: if false;
     }
     ```
3. **Layer 3: Trusted Role Storage Mechanism (Comparing Two Secure Patterns)**
   - **Pattern A (Firebase Auth Custom Claims):**
     - Pros: Native, zero extra Firestore reads in rules (`request.auth.token.admin == true`).
     - Cons: Requires Firebase Admin SDK or Cloud Function to set claims via service account. The current repository has no active server backend with Firebase Admin credentials.
   - **Pattern B (Locked Firestore Admin Namespace `/system_admins/{uid}`):**
     - Implementation: A dedicated collection `/system_admins` where each document ID is the user's `uid` (`{ email: 'admin@temple.org', role: 'admin', grantedAt: ... }`).
     - Security Rule Protection:
       ```firestore
       match /system_admins/{adminUid} {
         allow read: if isAuthenticated();
         allow write: if false; // Locked from all client-side writes! Seeded via controlled CLI/emulator.
       }
       ```
     - Pros: 100% server-enforced, works immediately in browser client without Node.js backend infrastructure, completely unforgeable by client sessions.
   - **Architectural Recommendation:** Implement **Pattern B** (with support for Custom Claims fallback if an Admin SDK environment is deployed later).

---

## 3. Historical Accounting Risk Analysis

### 3.1 Data Model Reality: Raw String Storage
In `Temple_Accounts-1.html`, financial records are stored with **denormalized string labels**, not relational foreign keys:

```
+-----------------------------------------------------------------------------------------+
|                         CURRENT TRANSACTION DATA STORAGE MODEL                          |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   receipts document:                                                                    |
|   {                                                                                     |
|     "receiptNo": "R-1042",                                                              |
|     "fund": "General Temple Fund",        <-- RAW STRING (No fundId)                    |
|     "category": "Vazhipadu Income",       <-- RAW STRING (No categoryId)                |
|     "bankAccount": "Canara Bank",         <-- RAW STRING (No bankAccountId)             |
|     "amount": 250.00                                                                    |
|   }                                                                                     |
|                                                                                         |
|   payments document:                                                                    |
|   {                                                                                     |
|     "voucherNo": "V-501",                                                               |
|     "fund": "General Temple Fund",        <-- RAW STRING (No fundId)                    |
|     "category": "Oil",                    <-- RAW STRING (No categoryId)                |
|     "bankAccount": "",                                                                  |
|     "amount": 1200.00                                                                   |
|   }                                                                                     |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### 3.2 Cascading System Failure Points

#### 1. General Ledger Collapse
- **Function:** `VIEW_RENDERERS.ledger` (line 13012) and `applyLedgerFilter()` (line 13054).
- **Mechanism:** `#ledgerFundFilter` populates its `<option>` values from `allFunds()`. Rows are rendered with `data-fund="${esc(x.fund)}"`. The filter executes:
  ```javascript
  if (fund && tr.dataset.fund !== fund) show = false;
  ```
- **Failure:** If `"General Temple Fund"` is renamed to `"General Fund"`, selecting `"General Fund"` in the filter compares `"General Temple Fund" !== "General Fund"`. **100% of historical transactions become invisible.**

#### 2. Trial Balance Desynchronization & Difference Generation
- **Function:** `VIEW_RENDERERS.trialbalance` (lines 15214–15270).
- **Mechanism:** Trial balance calculates equity rows by iterating:
  ```javascript
  funds.forEach(f => rows.push({ account: f.name + ' (Fund)', debit: 0, credit: f.balance }));
  ```
  Where `f.balance` is computed by `getFundBalance(f.name)`.
- **Failure on Delete:** If a fund is deleted from the `funds` collection, `allFunds()` omits it. Its credit balance is entirely excluded from the balance sheet. However, the cash or bank receipts received into that fund remain in `Cash in Hand` or `Bank Account` assets.
  - Result: `totalDebit != totalCredit`.
  - The Trial Balance banner turns red with `⚠️ Difference Found: ₹[Deleted Fund Net Balance]`.
- **Failure on Rename:** If `"General Temple Fund"` is renamed:
  - `getFundBalance("New Name")` calculates opening balance as 0 because lines 6602–6604 check `if (fundName === 'General Temple Fund') opening = parseFloat(s.openingGeneralFund)`.
  - All historical receipts having `r.fund === "General Temple Fund"` fail the filter `r.fund === "New Name"`.
  - The fund's calculated balance drops to ₹0, destroying the Trial Balance.

#### 3. Silent Category Overwrite on Historical Voucher Edit
- **Function:** `VIEW_RENDERERS.receipts` (lines 7922–7926) and `VIEW_RENDERERS.payments` (lines 12558–12574).
- **Mechanism:** Dropdowns render options via `optsFromNames(expCats, editRec ? editRec.category : null)`.
  ```javascript
  function optsFromNames(arr, selected) {
    return arr.map(x => `<option value="${esc(x.name)}" ${x.name===selected?'selected':''}>${esc(x.name)}</option>`).join('');
  }
  ```
- **Failure:** If the category `"Oil"` was renamed to `"Pooja Oil"` or deleted:
  - When editing a historical payment that used `"Oil"`, `x.name === selected` evaluates to `false` for every single option.
  - In standard HTML form behavior, when no `<option>` has the `selected` attribute, the browser **automatically defaults to the very first option** in the dropdown (e.g. `"Flower"`).
  - When the administrator clicks "UPDATE", `fd.get('category')` submits `"Flower"`.
  - **The historical accounting voucher is silently and permanently corrupted.**

#### 4. Hardcoded Core Business Engine Breakage
Multiple critical workflows hardcode specific string names:
- **Billing Conversion (`fsCreateBillingWithAccounting`, lines 19621–19624):** Maps billing category `'വഴിപാട്'` to `'General Temple Fund'` and category `'Vazhipadu Income'`. Maps `'പുനരുദ്ധാരണം'` to `'Punarudharanam Fund'` and category `'Donation Income'`.
- **Physical Receipt Parser (`parsePhysicalReceiptIdentifier`, lines 7785–7808):** Forces PU receipts to `'Punarudharanam Fund'` and P receipts to `'General Temple Fund'`.
- **Chitty Module (lines 6608–6611, 13590):** Strictly hardcodes `'Chitty Fund'`.
- **Opening Balances (`saveOpeningBalances`, lines 15372–15376):** Stores only `openingGeneralFund`, `openingPunarudharanamFund`, `openingChittyBalance`.
- **Consequence:** Renaming or deleting any of these three funds or two income categories instantly disables billing, physical receipt logging, and opening balance reconciliation.

---

## 4. Safe Master-Data Behavior Matrix

To resolve the catastrophic risks identified above, the system must enforce strict operational semantics for each entity type:

| Master Data Type | Operation | Required Design Behavior | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **System Funds**<br>(General, Punarudharanam, Chitty) | **Rename** | **STRICTLY PROHIBITED.** These entities are fundamental structural pillars of the ledger and billing engines. | UI hides edit button; server rules and code reject updates with `"System core funds cannot be renamed."` |
| **System Funds** | **Delete** | **STRICTLY PROHIBITED.** Deletion corrupts trial balance and breaks physical/counter billing. | UI hides delete button; server rules and code reject deletion with `"System core funds cannot be deleted."` |
| **Custom Funds** | **Add** | Allowed with case-insensitive and whitespace-normalized validation. Deterministic slug docId prevents duplicate collision. | Normalization helper; transaction/slug-based document creation. |
| **Custom Funds** | **Rename** | **Disallow direct raw-string rename.** Instead, provide **Display Name Aliasing**: the document maintains `name: "New Name"`, `legacyAliases: ["Old Name"]`. Queries in Ledger and Balances aggregate over `[name, ...legacyAliases]`. | Data model update (`legacyAliases` array) + query engine alias expansion. |
| **Custom Funds** | **Delete (Unused)** | Allowed only if reference check across `receipts`, `payments`, and `settings` returns exactly 0 matches. | Atomic pre-delete reference scan across collections. |
| **Custom Funds** | **Delete (Referenced)** | **PROHIBITED.** Must offer **Soft Archival / Deactivation** (`isActive: false`). Inactive funds are hidden from new transaction dropdowns but remain active in ledger, reports, and trial balance. | Soft-delete attribute `isActive: false` instead of document deletion. |
| **System Categories**<br>(Vazhipadu Income, Donation Income) | **Rename / Delete** | **STRICTLY PROHIBITED.** Required by billing and physical receipt conversion. | Hardcoded protection guard in mutation handlers and security rules. |
| **Custom Categories**<br>(Income & Expense) | **Add** | Allowed with trimming, internal whitespace collapse, and case-insensitive collision check against all active and archived categories. | Client validation + duplicate detection query. |
| **Custom Categories** | **Rename** | Two permitted paths: (1) For unused categories: direct in-place update. (2) For referenced categories: **Deprecate & Replace** (mark old category `isActive: false` and create new category) OR alias mapping. Direct rename that breaks historical dropdown matching is strictly blocked. | Reference verification guard in `renameRecord()`. |
| **Custom Categories** | **Delete (Unused)** | Permitted if 0 records in `receipts`, `payments`, and `billing` reference the category name. | Full scan guard before invoking `fsDeleteRecordSafe`. |
| **Custom Categories** | **Delete (Referenced)** | **Hard deletion strictly blocked.** System prompts: `"Category is used in [N] transactions. Deactivate instead?"`. Sets `isActive: false`. | Reference guard blocks `fsDeleteRecordSafe`. |
| **Bank Accounts** | **Add / Rename / Delete** | Referenced bank accounts cannot be deleted. Soft-deactivation hides bank from receipt/payment mode dropdowns. System preserves bank name in historical audit trail. | Reference guard in `deleteRecord()`. |

---

## 5. Cross-Module Dependency Map

The following matrix documents every subsystem in `Temple_Accounts-1.html` and its exact coupling to master-data entities:

```
                                  +-----------------------+
                                  | Master Data Entities  |
                                  +-----------+-----------+
                                              |
      +-------------------+-------------------+-------------------+-------------------+
      |                   |                   |                   |                   |
      v                   v                   v                   v                   v
 [ Receipts ]        [ Payments ]        [ Billing ]       [ Bank Book ]      [ General Ledger ]
  - Funds             - Funds             - Core Funds      - Unconnected      - All Funds
  - Income Cats       - Expense Cats      - Core Cats         (pools all       - Filter by name
  - Bank Accounts     - Bank Accounts     - Default Bank      Bank/UPI)        - Invisible on rename
      |                   |                   |                   |                   |
      +-------------------+-------------------+-------------------+-------------------+
                                              |
      +-------------------+-------------------+-------------------+
      |                   |                   |                   |
      v                   v                   v                   v
[ Cash Book ]      [ Trial Balance ]   [ Reports/Export ]  [ Punarudharanam/Chitty ]
 - Income Cats      - All Funds         - All Funds         - Hardcoded 'Punarudharanam Fund'
 - Expense Cats     - Fund Balances     - Balance Table     - Hardcoded 'Chitty Fund'
 - Dynamic rows     - Corrupts on del   - Omits on delete   - Breaks on rename/delete
```

### Detailed Subsystem Breakdown:
1. **Receipts Module (`VIEW_RENDERERS.receipts`, lines 7885–7945):**
   - Consumes: `funds`, `incomeCategories`, `bankAccounts`.
   - Behavior: Reads via `allFunds()`, `allIncomeCategories()`, `allBankAccounts()`. Form saves `fd.get('fund')`, `fd.get('category')`, `fd.get('bankAccount')`.
   - Vulnerability: Historical edit silent fallback when category or fund is renamed/deleted.
2. **Physical Receipts (`parsePhysicalReceiptIdentifier`, lines 7785–7808):**
   - Consumes: Hardcoded `'General Temple Fund'`, `'Punarudharanam Fund'`, `'Pooja Income'`, `'Donation Income'`.
   - Vulnerability: Renaming these funds creates orphan receipts that don't match the hardcoded strings.
3. **Billing Module (`fsCreateBillingWithAccounting`, lines 19619–19725):**
   - Consumes: Hardcoded `'General Temple Fund'`, `'Punarudharanam Fund'`, `'Vazhipadu Income'`, `'Donation Income'`. Selects default bank from `allBankAccounts()`.
   - Vulnerability: Fails if core entities are modified.
4. **Payments Module (`VIEW_RENDERERS.payments`, lines 12534–12575):**
   - Consumes: `funds`, `expenseCategories`, `bankAccounts`.
   - Vulnerability: Historical edit silent fallback when expense category is renamed/deleted.
5. **Cash Book (`buildCashBookRows`, lines 12760–12830):**
   - Consumes: Transaction row strings (`r.category`, `p.category`).
   - Vulnerability: Renaming categories creates dual rows in category filters.
6. **Bank Book (`buildBankBookRows`, lines 12832–12853):**
   - Current state: **Disconnected from `bankAccounts` store.** Pools all `Bank` and `UPI` transactions against `s.openingBank`.
   - Risk: Renaming or adding bank accounts in settings has zero effect on Bank Book.
7. **General Ledger (`VIEW_RENDERERS.ledger`, lines 13012–13063):**
   - Consumes: `allFunds()`. Filters rows via `tr.dataset.fund !== fund`.
   - Vulnerability: Renamed fund hides all prior transactions. Deleted fund leaves transactions in ledger without a selectable filter.
8. **Trial Balance (`VIEW_RENDERERS.trialbalance`, lines 15214–15270):**
   - Consumes: `getAllFundBalances()` which queries `allFunds()`.
   - Vulnerability: Deleted fund removes equity balance, creating permanent trial balance imbalance.
9. **Settings & Opening Balances (`saveOpeningBalances`, lines 15372–15396):**
   - Consumes: Hardcoded field names `openingGeneralFund`, `openingPunarudharanamFund`, `openingChittyBalance`. Custom funds have no opening balance support.

---

## 6. Platform-Wide Synchronization and Concurrency Design

### 6.1 Multi-Session & Multi-Terminal Synchronization Strategy
Currently, when Terminal A modifies a master-data record, Terminal B remains unaware until Terminal B navigates to a new view that triggers `fsGetAllSafe()`. If Terminal B is actively entering a receipt or payment, the dropdown remains stale.

#### Evaluated Architectural Options:
- **Option 1: Firestore Real-Time Snapshot Listeners (`onSnapshot`) [RECOMMENDED]**
  - Architecture: Attach `onSnapshot` listeners to `/funds`, `/bankAccounts`, `/incomeCategories`, and `/expenseCategories`.
  - Bandwidth & Cost Impact: **Extremely low.** These four collections typically contain fewer than 100 documents combined across the entire temple database. Master data changes very infrequently (a few times per month).
  - Reactivity: When an administrator adds, renames, or deactivates a category on Terminal A, Terminal B receives the update in < 200ms.
  - Lifecycle Safety: Store unsubscribe callbacks in a global registry `window._masterDataUnsubscribers = []`. Detach cleanly on user sign-out (`handleLogout`) to prevent memory leaks or zombie listeners.
- **Option 2: Periodic Polling (Stale-While-Revalidate)**
  - Architecture: Poll Firestore every 60 seconds.
  - Defect: Unnecessary read traffic when idle, yet introduces up to 60 seconds of latency during active setup.
- **Option 3: BroadcastChannel / LocalStorage Events**
  - Defect: Only synchronizes multiple tabs on the **same physical browser/machine**. Provides zero synchronization across different physical terminals (e.g. Counter PC vs Office PC).

### 6.2 Dropdown Reactivity in Active Views (Preserving User Form State)
When an `onSnapshot` event arrives while an operator is filling out a receipt or payment form, replacing the entire view via `navigate()` would wipe out devotee names, phone numbers, and amounts currently being entered.

**Safe In-Place Dropdown Synchronizer:**
```javascript
function updateSelectPreservingSelection(selectEl, newItems, includeEmptyOption = false) {
  if (!selectEl) return;
  const currentVal = selectEl.value;
  let html = includeEmptyOption ? '<option value="">-- Select --</option>' : '';
  newItems.forEach(item => {
    if (item.isActive !== false || item.name === currentVal) {
      const selected = (item.name === currentVal) ? 'selected' : '';
      html += `<option value="${esc(item.name)}" ${selected}>${esc(item.name)}</option>`;
    }
  });
  selectEl.innerHTML = html;
  // If the previous value was not found in active items, restore it if present as legacy
  if (currentVal && selectEl.value !== currentVal) {
    selectEl.value = currentVal;
  }
}
```
This guarantees that dropdowns update dynamically in the background without clearing in-progress form inputs.

### 6.3 Concurrency Control and Race Condition Prevention

#### 1. Deterministic Slug Document IDs (Duplicate Prevention)
Currently, `fsSaveRecordSafe()` assigns `docId = `${prefix}${Date.now()}``. If two administrators concurrently add `"Flower"` and `"flower"`, two duplicate documents are created.
- **Remediation:** Compute a deterministic normalized slug for the document ID:
  ```javascript
  function toEntitySlug(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  // Example: "General Temple Fund" -> docId: "fund_general_temple_fund"
  // "flower" and "Flower" -> docId: "expenseCat_flower"
  ```
- **Concurrency Benefit:** In Cloud Firestore, two concurrent writes to the same document ID target the exact same document. Under security rules enforcing `allow create: if !exists(...)`, the second concurrent creation is atomically rejected as a collision.

#### 2. Optimistic Concurrency via Transactions for Deactivation & Reference Verification
- Deletion or deactivation must execute inside a `fsTransaction`:
  1. Transaction reads the target master doc to confirm it is not already deleted or locked.
  2. Transaction verifies that `isSystemCore !== true`.
  3. Reference check confirms no active transaction documents contain the entity name.
  4. If referenced, transaction sets `{ isActive: false, deactivatedAt: serverTimestamp() }` instead of deleting.

#### 3. Offline Mutation & Retry Behavior
- Master-data modifications (adding funds, changing opening balances) represent fundamental structural configuration.
- To prevent split-brain states and conflicting offline master data, **master-data mutations must require an active online connection to Cloud Firestore**.
- If offline, the UI must immediately display: `"Master data modifications require an active cloud connection. Please reconnect to proceed."`

---

## 7. Isolated Regression Test Strategy

All proposed changes must be verified in an isolated test environment without touching live production databases.

```
+-----------------------------------------------------------------------------------------+
|                                AIR-GAPPED TEST SUITES                                   |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ TIER 1: In-Memory / Local Unit Tests (Zero Network / Fast Run) ]                      |
|  - Normalization: internal whitespace collapse, trim, case insensitivity                 |
|  - Slug Generation: collision detection across Unicode and ASCII strings                |
|  - Historical Form Matching: preservation of unselected legacy values in dropdowns       |
|                                                                                         |
|  [ TIER 2: Local Firebase Emulator Integration (Air-Gapped 127.0.0.1:8080) ]            |
|  - Security Rules Enforcement: Admin vs Non-Admin write/delete rejection                 |
|  - Disposable project namespaces: demo-step3387-[timestamp]                             |
|  - Atomic Concurrency: Simultaneous duplicate additions targeting slug docId           |
|  - In-Use Deletion Guard: Blocked deletion of referenced funds and categories            |
|                                                                                         |
|  [ TIER 3: Cross-Module Accounting Regression ]                                          |
|  - Cash Book Running Balance Invariance                                                  |
|  - Bank Book Balance Invariance                                                          |
|  - General Ledger Filter Invariance (before and after entity deactivation)               |
|  - Trial Balance Equilibrium Invariance (Total Debit == Total Credit)                    |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### Detailed Isolated Test Matrix:

| Suite ID | Test Description | Target Module | Expected Outcome | Environment |
| :--- | :--- | :--- | :--- | :--- |
| **TEST-01** | Unauthorized user attempts to add a fund via Firestore REST API | `firestore.rules` (`/funds`) | **403 PERMISSION_DENIED** | Firebase Emulator (`demo-step3387-*`) |
| **TEST-02** | Authorized admin adds a fund | `firestore.rules` (`/funds`) | **200 OK**; document created with audit metadata | Firebase Emulator |
| **TEST-03** | Attempt to delete a system-protected fund (`General Temple Fund`) | Mutation Guard / Rules | **Error thrown**; deletion rejected | Emulator & Local Unit |
| **TEST-04** | Attempt to delete a referenced custom fund (has receipts) | `deleteRecord` guard | **Blocked**; prompt to archive/deactivate | Local Fixture Test |
| **TEST-05** | Deletion of an unused category with 0 transactions | `deleteRecord` | **Allowed**; doc removed from Firestore & IndexedDB | Emulator & Local Unit |
| **TEST-06** | Whitespace and case-insensitive duplicate prevention | `addExpenseCategory` | Reject `"  flower  "` when `"Flower"` exists | Local Unit Test |
| **TEST-07** | Historical voucher edit with retired/deactivated category | Payments form rendering | Retains historical category; does **NOT** default to first option | Local DOM Test |
| **TEST-08** | Trial balance equilibrium after deactivating a fund | `VIEW_RENDERERS.trialbalance` | Balances remain balanced (`totalDebit === totalCredit`) | Local Accounting Engine |
| **TEST-09** | General Ledger row visibility with aliased fund | `VIEW_RENDERERS.ledger` | All historical transactions remain visible under alias | Local Accounting Engine |
| **TEST-10** | Dropdown update while form is open | Dynamic dropdown synchronizer | Dropdown options update without clearing devotee name or amount | Local DOM Test |
| **TEST-11** | Two-session emulator synchronization | Real-time `onSnapshot` | Session B receives master data added in Session A within 200ms | Firebase Emulator |
| **TEST-12** | Concurrent addition of identical category | Slug docId / Transaction | Exactly one document created; second call handled gracefully | Firebase Emulator |

---

## 8. Prioritized Implementation Roadmap

To eliminate catastrophic risks without destabilizing existing production functionality, remediation must be executed in **strictly sequenced, independent phases**:

```
[ Phase 1: Reference Guards & Immutability ]  <-- CRITICAL INTEGRITY (Blocks Data Loss)
                   |
                   v
[ Phase 2: Input Normalization & Duplicate Prevention ]  <-- DATA CLEANLINESS
                   |
                   v
[ Phase 3: Administrator Role Architecture & Rules ]  <-- ACCESS CONTROL
                   |
                   v
[ Phase 4: Soft-Archival (Deactivation) Lifecycle ]  <-- PRESERVES LEDGER
                   |
                   v
[ Phase 5: Real-Time Cross-Client Synchronization ]  <-- MULTI-TERMINAL RELIABILITY
```

### Phase 1: Reference Integrity Guards & Core Entity Immutability
- **Primary Objective:** Prevent any administrator or operator from permanently deleting referenced master data or modifying core system entities.
- **Affected Functions:** `deleteRecord` (line 6429), `renameRecord` (line 7729), `editableList` (line 7714).
- **Implementation Design:**
  - Define system constants: `SYSTEM_PROTECTED_FUNDS = ['General Temple Fund', 'Punarudharanam Fund', 'Chitty Fund']` and `SYSTEM_PROTECTED_CATEGORIES = ['Vazhipadu Income', 'Donation Income']`.
  - In `editableList()`, if `SYSTEM_PROTECTED_FUNDS.includes(i.name)`, omit the `Edit` and `Delete` buttons entirely.
  - In `deleteRecord()`, check if `store` is `funds`, `bankAccounts`, `incomeCategories`, or `expenseCategories`. Execute a fast reference check across `receipts`, `payments`, and `billing`. If matches > 0, block deletion with: `"Cannot delete [Name] because it is used by [N] transactions. You may archive it instead."`.
- **Accounting Risk:** **Zero.** This phase is strictly protective and prevents existing data from being destroyed.
- **Prerequisites & Tests:** Run TEST-03, TEST-04, TEST-05 in local test harness.

### Phase 2: Input Normalization & Duplicate Prevention
- **Primary Objective:** Prevent duplicate master data caused by casing differences, leading/trailing whitespace, or internal double spaces.
- **Affected Functions:** `addFund` (line 15397), `addBankAccount` (line 15408), `addIncomeCategory` (line 15419), `addExpenseCategory` (line 15430), `renameRecord` (line 7729).
- **Implementation Design:**
  - Introduce `normalizeMasterDataName(str)`: collapses multiple spaces, trims outer whitespace.
  - Before calling `fsSaveRecordSafe()`, fetch existing records from the store and check for case-insensitive collision:
    ```javascript
    const existing = await fsGetAllSafe(storeName);
    if (existing.some(x => x.name.toLowerCase() === candidate.toLowerCase())) {
      alert(`An entry named "${candidate}" already exists.`);
      return;
    }
    ```
- **Accounting Risk:** **Zero.**
- **Prerequisites & Tests:** Run TEST-06.

### Phase 3: Administrator Role Architecture & Security Rules
- **Primary Objective:** Enforce that only verified administrators can modify master data or temple settings, both in application logic and Cloud Firestore security rules.
- **Affected Files:** `Temple_Accounts-1.html`, `firestore.rules.candidate`.
- **Implementation Design:**
  - Create locked `/system_admins/{uid}` collection in Firestore.
  - Update `firestore.rules.candidate` to include `isAdmin()` checking `/system_admins/$(request.auth.uid)`.
  - In `Temple_Accounts-1.html`, add `isCurrentUserAdmin()` caching the status from Firestore.
  - Conditionally render Settings navigation item only if admin.
- **Accounting Risk:** Low. If admin status is misconfigured, authorized admins might see an access-denied message. Remediated by ensuring the primary admin UID is pre-seeded into `/system_admins`.
- **Prerequisites & Tests:** Run TEST-01, TEST-02 against Firebase Emulator.

### Phase 4: Soft-Archival (Deactivation) Lifecycle
- **Primary Objective:** Replace hazardous hard deletions with safe deactivations (`isActive: false`).
- **Affected Modules:** Form dropdowns across `receipts`, `payments`, `billing`, and `settings`.
- **Implementation Design:**
  - When an administrator clicks "Deactivate", update `{ isActive: false }`.
  - Dropdown helpers (`optsFromNames`) filter out `item.isActive === false` for **new** entries, but explicitly keep the item if `item.name === editRec.value` when editing **historical** records.
  - Historical vouchers retain exact category matching; silent fallback is completely eliminated.
- **Accounting Risk:** Extremely low. Preserves 100% of historical records and balances.
- **Prerequisites & Tests:** Run TEST-07, TEST-08, TEST-09.

### Phase 5: Real-Time Cross-Client Synchronization
- **Primary Objective:** Ensure that multiple counter terminals immediately reflect master-data additions and deactivations without page reloads.
- **Affected Modules:** App initialization (`initializeFirestore`, lines 18125–18150), Auth teardown (`handleLogout`, lines 18090–18100).
- **Implementation Design:**
  - Register `onSnapshot` listeners on `/funds`, `/bankAccounts`, `/incomeCategories`, `/expenseCategories`.
  - Update in-memory stores and IndexedDB cache reactively.
  - Dispatch local event `window.dispatchEvent(new CustomEvent('master-data-updated'))`.
  - Attach listener to active view to refresh dropdowns in-place preserving form state.
- **Accounting Risk:** Zero. Does not mutate database records.
- **Prerequisites & Tests:** Run TEST-10, TEST-11.

---

## 9. Unverified Findings and Production Blockers

In compliance with strict safety rules, no external cloud connections were made and no production settings were altered. The following items are explicitly recorded:

1. **Active Cloud Security Rules: UNVERIFIED (Production Cloud State)**
   - Local file `d:\Temple\firestore.rules` was inspected. Whether this exact file is currently active on the live Firebase production project `temple-f4f7d` cannot be confirmed without live Firebase CLI deployment inspection.
2. **Production User UIDs & Claims: UNVERIFIED**
   - The exact list of user accounts registered in production Firebase Authentication and whether any have custom claims is UNVERIFIED.
3. **Existing Master-Data Inconsistencies: UNVERIFIED**
   - Whether production collections `/funds`, `/incomeCategories`, etc. currently contain duplicate or un-trimmed records was not inspected against production databases. A read-only audit script should inspect production records during the pre-implementation backup phase.

---

## 10. Confirmation of Source Code & Production Boundaries

- **Local Source Code Invariance:**
  - `Temple_Accounts-1.html` was inspected in a strictly read-only manner.
  - SHA-256 before audit: `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE`
  - SHA-256 after audit: `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE`
  - Byte size: `844,787 bytes` (Zero source bytes modified).
- **Production Services & Databases:**
  - Zero connections to production Firebase (`temple-f4f7d`).
  - Zero database mutations, deletions, or schema alterations executed.
  - Zero rules deployed to cloud.

---

## 11. Final Audit Verdict

# `DESIGN READY FOR PHASED IMPLEMENTATION`

### Justification:
1. **Complete Architectural Evidence:** The baseline reality has been verified with 100% precision: the application currently lacks role-based authorization, stores master data as raw denormalized strings, and permits unconstrained hard deletions that break the General Ledger, Reports, and Trial Balance.
2. **Elimination of Data Loss Hazards:** The proposed phased remediation strictly prioritizes reference integrity guards and core entity immutability (Phase 1) before any synchronization or authorization enhancements, ensuring historical financial records cannot be corrupted.
3. **Preservation of Historical Auditing:** The design replaces destructive deletions with non-destructive deactivations (`isActive: false`) and safe in-place dropdown rendering, permanently preventing silent category overwrites on historical vouchers.
4. **Air-Gapped Verification Protocol:** A comprehensive 12-suite isolated test plan using local fixtures and the local Firebase Emulator is fully defined, ensuring zero risk to production operations.
