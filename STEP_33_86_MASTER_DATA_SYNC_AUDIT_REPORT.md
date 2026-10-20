# STEP 33.86 — Master Data Management and Platform-Wide Synchronization Audit (READ-ONLY)

**Report Date:** 2026-10-18  
**Audit Target:** `Temple_Accounts-1.html`  
**Execution Mode:** READ-ONLY Deep Architectural & Synchronization Audit  
**Author:** Antigravity AI  

---

## 1. File Integrity & Verification Hashes

| Property | Value |
| :--- | :--- |
| **File Path** | `d:\Temple\Temple_Accounts-1.html` |
| **Baseline SHA-256** | `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE` |
| **Baseline Byte Size** | `844,787 bytes` |
| **Final SHA-256** | `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE` |
| **Final Byte Size** | `844,787 bytes` |
| **Integrity Confirmation** | **MATCH / UNCHANGED** (Zero source code bytes modified) |

---

## 2. CRUD Implementation Map for Master-Data Entities

The application manages four primary master-data entities from the **Settings** view (`VIEW_RENDERERS.settings`, lines 15278–15346):
1. **Funds**
2. **Bank Accounts**
3. **Income Categories**
4. **Expense Categories**

All four entities share a common UI listing helper: `editableList(store, items)` (lines 7714–7728).

```
                      +-----------------------------+
                      |   Settings View Renderer    |
                      | (VIEW_RENDERERS.settings)   |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               |                     |                     |
        [editableList]          [Form Inputs]        [Save Balances]
               |                     |                     |
       +-------+-------+             |                     |
       |               |             v                     v
   [Edit / Rename]  [Delete]    [addFund / ...]   [saveOpeningBalances]
       |               |             |                     |
       v               v             v                     v
 fsUpdateRecordSafe fsDeleteRecordSafe fsSaveRecordSafe  fsSet('settings')
```

### 2.1 Funds
- **Listing Function:** `allFunds()` (line 6548) calls `fsGetAllSafe('funds')`. Rendered in `VIEW_RENDERERS.settings` via `${editableList('funds', funds)}` (line 15324).
- **Add Operation:**
  - **UI Element:** `<input type="text" id="newFundName" placeholder="New fund name"><button class="btn-sm" onclick="addFund()">Add</button>` (line 15325).
  - **Handler:** `addFund()` (lines 15412–15420).
  - **Behavior:** Reads `el('newFundName').value.trim()`. If non-empty, invokes `fsSaveRecordSafe('funds', { name: v })`. Then executes `await navigate('settings')`.
  - **Defect/Gap:** No duplicate validation, no whitespace normalization beyond outer trimming, no case-insensitivity check.
- **Edit / Rename Operation:**
  - **UI Element:** Inline button `<button class="btn-sm btn-sec" onclick="renameRecord('funds', '${esc(i.id)}')">Edit</button>` (line 7726).
  - **Handler:** `renameRecord(store, id)` (lines 7729–7748).
  - **Behavior:** Prompts administrator via `prompt('Rename to:', rec.name)`. If non-empty, calls `fsUpdateRecordSafe('funds', id, { name: trimmed })`, then `await navigate('settings')`.
  - **Defect/Gap:** Renames only the entity document in `funds`. Does not cascade rename to historical receipts, payments, billing records, or hardcoded system mappings.
- **Delete Operation:**
  - **UI Element:** Inline button `<button class="btn-sm btn-danger" onclick="deleteRecord('funds', '${esc(i.id)}', 'settings')">Delete</button>` (line 7726).
  - **Handler:** `deleteRecord(store, id, viewName, ...args)` (lines 6429–6470).
  - **Behavior:** Prompts confirmation `confirm('Delete this entry permanently? This cannot be undone.')`. Calls `fsDeleteRecordSafe('funds', id)`, clears edit state, and executes `await navigate('settings')`.
  - **Defect/Gap:** **Zero reference integrity check.** Deletes the fund document even if thousands of historical transactions reference it.

### 2.2 Bank Accounts
- **Listing Function:** `allBankAccounts()` (line 6551) calls `fsGetAllSafe('bankAccounts')`. Rendered via `${editableList('bankAccounts', bankAccts)}` (line 15329).
- **Add Operation:**
  - **UI Element:** `<input type="text" id="newBankName" placeholder="New bank account"><button class="btn-sm" onclick="addBankAccount()">Add</button>` (line 15330).
  - **Handler:** `addBankAccount()` (lines 15421–15429).
  - **Behavior:** Reads `el('newBankName').value.trim()`, calls `fsSaveRecordSafe('bankAccounts', { name: v })`, then `await navigate('settings')`.
- **Edit / Rename Operation:**
  - **Handler:** `renameRecord('bankAccounts', id)`. Prompts via `prompt()`, calls `fsUpdateRecordSafe('bankAccounts', id, { name: trimmed })`, then `await navigate('settings')`.
- **Delete Operation:**
  - **Handler:** `deleteRecord('bankAccounts', id, 'settings')`. Prompts confirmation, calls `fsDeleteRecordSafe('bankAccounts', id)`, then `await navigate('settings')`.

### 2.3 Income Categories
- **Listing Function:** `allIncomeCategories()` (line 6549) calls `fsGetAllSafe('incomeCategories')`. Rendered via `${editableList('incomeCategories', incomeCats)}` (line 15336).
- **Add Operation:**
  - **UI Element:** `<input type="text" id="newIncomeCat" placeholder="New income category"><button class="btn-sm" onclick="addIncomeCategory()">Add</button>` (line 15337).
  - **Handler:** `addIncomeCategory()` (lines 15430–15438).
  - **Behavior:** Reads `el('newIncomeCat').value.trim()`, calls `fsSaveRecordSafe('incomeCategories', { name: v })`, then `await navigate('settings')`.
- **Edit / Rename Operation:**
  - **Handler:** `renameRecord('incomeCategories', id)`. Calls `fsUpdateRecordSafe('incomeCategories', id, { name: trimmed })`, then `await navigate('settings')`.
- **Delete Operation:**
  - **Handler:** `deleteRecord('incomeCategories', id, 'settings')`. Calls `fsDeleteRecordSafe('incomeCategories', id)`, then `await navigate('settings')`.

### 2.4 Expense Categories
- **Listing Function:** `allExpenseCategories()` (line 6550) calls `fsGetAllSafe('expenseCategories')`. Rendered inside a scrollable container (`max-height:220px; overflow-y:auto;`) via `${editableList('expenseCategories', expCats)}` (line 15341).
- **Add Operation:**
  - **UI Element:** `<input type="text" id="newExpenseCat" placeholder="New expense category"><button class="btn-sm" onclick="addExpenseCategory()">Add</button>` (line 15342).
  - **Handler:** `addExpenseCategory()` (lines 15439–15447).
  - **Behavior:** Reads `el('newExpenseCat').value.trim()`, calls `fsSaveRecordSafe('expenseCategories', { name: v })`, then `await navigate('settings')`.
- **Edit / Rename Operation:**
  - **Handler:** `renameRecord('expenseCategories', id)`. Calls `fsUpdateRecordSafe('expenseCategories', id, { name: trimmed })`, then `await navigate('settings')`.
- **Delete Operation:**
  - **Handler:** `deleteRecord('expenseCategories', id, 'settings')`. Calls `fsDeleteRecordSafe('expenseCategories', id)`, then `await navigate('settings')`.

### 2.5 Summary Table of Operations

| Entity | Store Name | Doc Prefix | List Function | Add Function | Edit Function | Delete Function |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Funds** | `funds` | `fund_` | `allFunds()` | `addFund()` | `renameRecord('funds', id)` | `deleteRecord('funds', id, 'settings')` |
| **Bank Accounts** | `bankAccounts` | `bank_` | `allBankAccounts()` | `addBankAccount()` | `renameRecord('bankAccounts', id)` | `deleteRecord('bankAccounts', id, 'settings')` |
| **Income Categories** | `incomeCategories` | `incomeCat_` | `allIncomeCategories()` | `addIncomeCategory()` | `renameRecord('incomeCategories', id)` | `deleteRecord('incomeCategories', id, 'settings')` |
| **Expense Categories** | `expenseCategories` | `expenseCat_` | `allExpenseCategories()` | `addExpenseCategory()` | `renameRecord('expenseCategories', id)` | `deleteRecord('expenseCategories', id, 'settings')` |

---

## 3. Authoritative Storage and Synchronization Trace

### 3.1 Persistence Path & Data Architecture
The application uses a **Firestore-Primary with IndexedDB Cache** architecture:
1. **Authoritative Cloud Storage:**
   - Documents are stored in root Firestore collections: `/funds`, `/bankAccounts`, `/incomeCategories`, `/expenseCategories`, and `/settings/set_1`.
   - Primary write operations (`fsSaveRecordSafe`, `fsUpdateRecordSafe`, `fsDeleteRecordSafe` at lines 18731–18845) execute against Cloud Firestore **first**.
   - Only upon confirmed Firestore success does the repository update or remove records from local IndexedDB (`putRec`, `deleteRec`).
   - If Firestore rejects the operation (network offline or permission denied), the local cache write is aborted and an error is thrown to prevent uncommitted local-only transactions.
2. **Local Cache / Offline Fallback:**
   - Reading via `fsGetAllSafe(storeName)` (lines 18615–18645):
     - When online and authenticated: Queries `db.collection(storeName).get()`, then executes `await clearStore(storeName)` in IndexedDB and inserts all remote records into IndexedDB.
     - When offline or unauthenticated: Falls back directly to `getAll(storeName)` from IndexedDB.
   - **Offline Mutation Prohibited:** `fsSaveRecordSafe`, `fsUpdateRecordSafe`, and `fsDeleteRecordSafe` immediately fail if unauthenticated or if `db` is unavailable.

### 3.2 Multi-Session Synchronization & Snapshot Listeners
- **Listener Audit:** Ripgrep and text search across the entire 21,000+ lines of `Temple_Accounts-1.html` reveal **ZERO `onSnapshot` listeners**.
- **Real-Time Sync Status:** **NON-EXISTENT.**
  - If Administrator A adds, edits, or deletes a fund or category on Terminal 1, **Terminal 2 receives NO notification or reactive event**.
  - Terminal 2 only fetches updated master data if the user navigates away from their current view to a view whose renderer invokes `allFunds()`, `allIncomeCategories()`, etc.
  - If Terminal 2 remains open on the `receipts`, `payments`, or `billing` screen, the dropdowns remain indefinitely stale.

### 3.3 Dropdown Reactivity in the Same Session
- When an entity is added, renamed, or deleted in the Settings view:
  - The handler calls `await navigate('settings')`.
  - This refreshes **only the Settings DOM**.
  - Dropdowns in previously rendered or dormant views (e.g. `receipts` or `payments` form dropdowns) are not invalidated or reloaded until the user manually triggers a fresh `navigate(...)` call.

### 3.4 Data Duplication, Hardcoded Lists, and Seed Discrepancies
Master data is duplicated in multiple locations across the code:
1. **Initial Seed Constants (lines 6370–6385):**
   - `DEFAULT_EXPENSE_CATEGORIES`: 67 hardcoded strings.
   - `DEFAULT_INCOME_CATEGORIES`: 7 hardcoded strings (`'Pooja Income'`, `'Archana Income'`, `'Vazhipadu Income'`, `'Donation Income'`, `'Festival Collection'`, `'General Contribution'`, `'Other Income'`).
   - `DEFAULT_FUNDS`: 6 hardcoded strings (`'General Temple Fund'`, `'Punarudharanam Fund'`, `'Chitty Fund'`, `'Festival Fund'`, `'Donation / Restricted Fund'`, `'Other Fund'`).
   - `seedIfNeeded()` writes these defaults to IndexedDB via `addRec()`, but **does NOT write them to Firestore**.
   - `loadAuthoritativeMasterData()` (lines 19085–19125): If Firestore collections are empty, it calls `seedIfNeeded()`.
2. **Hardcoded Billing Categories (lines 12013–12027, 10506–10511):**
   - The Billing screen hardcodes Malayalam category pills and `<option>` tags:
     - `'വഴിപാട്'` (Vazhipadu)
     - `'പുനരുദ്ധാരണം'` (Punarudharanam)
     - `'നേർച്ച'` (Nercha - historical only)
   - These are hardcoded in DOM markup and filter synchronizers, completely decoupled from the `incomeCategories` master collection.
3. **Hardcoded Conversion Functions:**
   - `billingCategoryToFund(cat)` (lines 9700–9705): Maps `'വഴിപാട്'` to `'General Temple Fund'` and `'പുനരുദ്ധാരണം'` to `'Punarudharanam Fund'`.
   - `billingCategoryToIncomeCategory(cat)` (lines 9711–9726): Hardcodes string checks against `'Vazhipadu Income'`, `'Archana Income'`, `'Pooja Income'`, `'Donation Income'`, `'General Contribution'`, and `'Other Income'`.
   - `fsCreateBillingWithAccounting` (lines 19621–19624): Hardcodes `'Vazhipadu Income'` and `'Donation Income'`.

---

## 4. Cross-Module Dependency Map

The following map details every platform module and how it consumes master-data entities:

| Module / Screen | Entity Consumed | Precise Source / Function Involved | State Risk / Hardcoding Flag |
| :--- | :--- | :--- | :--- |
| **Receipts** | Funds, Income Categories, Bank Accounts | `VIEW_RENDERERS.receipts` (lines 7885, 7922–7936) via `allFunds()`, `allIncomeCategories()`, `allBankAccounts()`. Form saves string values: `fd.get('fund')`, `fd.get('category')`, `fd.get('bankAccount')`. | Stored as raw strings. Dropdowns update only upon navigating into receipts. |
| **Physical Receipts** | Funds, Income Categories | `parsePhysicalReceiptIdentifier` (lines 7785–7807), `fsCreatePhysicalReceiptSafe` (lines 19864–19865). | **Hardcoded Fund Names:** PU receipts force `'Punarudharanam Fund'` and category `'Donation Income'`. P receipts force `'General Temple Fund'`. |
| **Billing** | Funds, Categories, Bank Accounts | `VIEW_RENDERERS.billing` (lines 12013–12027), `billingSubmitForm` (lines 10153, 10220), `fsCreateBillingWithAccounting` (lines 19619–19624). | **Hardcoded Category & Fund Strings:** Uses hardcoded `'വഴിപാട്'` / `'പുനരുദ്ധാരണം'`. Resolves fund to `'General Temple Fund'` / `'Punarudharanam Fund'`. UPI payment selects first bank from `allBankAccounts()`. |
| **Billing Filters** | Categories | `syncBillingCategoryFilterDropdowns` (lines 10499–10517). | **Completely Hardcoded:** Ignores `incomeCategories` collection entirely; generates options only for `'വഴിപാട്'`, `'നേർച്ച'`, and `'പുനരുദ്ധാരണം'`. |
| **Payments (Vouchers)** | Funds, Expense Categories, Bank Accounts | `VIEW_RENDERERS.payments` (lines 12534, 12558–12573). Form saves string values: `fd.get('fund')`, `fd.get('category')`, `fd.get('bankAccount')`. | Stored as raw strings. Dropdowns load only on view entry. |
| **Cash Book** | Income & Expense Categories | `buildCashBookRows` (lines 12761, 12770), `VIEW_RENDERERS.cashbook` (lines 12860–12868). | Dynamic category filter built from `[...new Set(rows.map(r => r.category))]`. Immune to master-data deletion since it inspects loaded row data directly. |
| **Bank Book** | Bank Accounts | `buildBankBookRows` (lines 12832–12853), `VIEW_RENDERERS.bankbook`. | **Master Data Disconnected:** Does NOT use `bankAccounts` store. Treats all records with `paymentMode in ['Bank', 'UPI']` as a single unified bank balance against `s.openingBank`. |
| **General Ledger** | Funds | `VIEW_RENDERERS.ledger` (lines 13012, 13029), `applyLedgerFilter` (line 13054). | **High Risk on Fund Rename/Delete:** Populates `#ledgerFundFilter` from `allFunds()`, but rows check `tr.dataset.fund !== fund`. If a fund is renamed, selecting the new name shows zero historical records. |
| **Trial Balance** | Funds, Income & Expense Categories | `VIEW_RENDERERS.trialbalance` (lines 15214–15270), `getAllFundBalances` (line 6614). | **Critical Risk on Fund Rename/Delete:** Iterates `funds.forEach(f => rows.push({ account: f.name + ' (Fund)', credit: f.balance }))`. Deleted fund disappears from balance sheet, causing trial balance discrepancy. Renamed categories split into duplicate rows. |
| **Punarudharanam Fund** | Funds | `VIEW_RENDERERS.punarudharanam` (lines 12709–12730). | **Hardcoded String:** `const fundName = 'Punarudharanam Fund'`. If renamed, balance and statistics immediately evaluate to 0. |
| **Chitty Module** | Funds | `VIEW_RENDERERS.chitty` (line 13590), `getFundBalance('Chitty Fund')` (line 6608). | **Hardcoded String:** Hardcodes `'Chitty Fund'`. Collections and payouts are tied to this exact string. |
| **Fund Transfers** | Bank Accounts | `VIEW_RENDERERS.transfers` (lines 13393–13394). | **Master Data Disconnected:** `<select name="fromAcc">` and `<select name="toAcc">` hardcode only `'Cash'` and `'Bank'`. The `bankAccounts` master data is completely ignored. |
| **Reports** | Funds | `VIEW_RENDERERS.reports` (line 14211), `getAllFundBalances`. | Shows fund-wise balance table from `allFunds()`. If a fund is deleted, its historical transaction balance is omitted from the report. |
| **Analytics** | Funds | `VIEW_RENDERERS.analytics` (lines 14506, 14695). | Caches `allFunds()` in `window.analyticsCache.funds`. |
| **Settings (Opening Balances)** | Funds | `VIEW_RENDERERS.settings` (lines 15309–15317), `saveOpeningBalances` (lines 15372–15392). | **Hardcoded Opening Balance Fields:** Only 3 funds have opening balance inputs: `openingGeneralFund`, `openingPunarudharanamFund`, `openingChittyBalance`. Custom funds cannot have opening balances. |

---

## 5. Safe Edit and Delete Semantics Findings

### 5.1 Renaming Behavior & Historical Transactions
1. **Raw String Storage (No Foreign Keys):**
   - Transactions (`receipts`, `payments`, `billing`) do **not** store a stable foreign key (such as `fundId: 'fund_101'` or `categoryId: 'cat_202'`).
   - They store the raw display string at creation time (`fund: 'General Temple Fund'`, `category: 'Flower'`).
2. **Failure of Rename Propagation:**
   - When an administrator renames a fund or category via `renameRecord()`, only the single master record in Firestore/IndexedDB is updated.
   - **Zero historical records are updated.**
3. **Severe Cascading Consequences:**
   - **Ledger Invisibility:** In the General Ledger, filtering by the renamed fund name displays zero historical rows because rows have `data-fund="<Old Name>"`.
   - **Silent Category Overwrite:** If a payment with category `"Flower"` is edited after `"Flower"` is renamed to `"Fresh Flowers"`, the HTML `<select name="category">` fails to match the old string and automatically defaults to the first option in the dropdown. Saving the payment permanently corrupts the historical category.
   - **Trial Balance Category Splitting:** The reference Income & Expenditure table in Trial Balance displays separate rows for both the old name and the new name (e.g. `"Flower"` ₹5,000 and `"Fresh Flowers"` ₹2,000).
   - **Loss of Opening Balances:** If `"General Temple Fund"` is renamed to `"Temple General Fund"`, `getFundBalance(fundName)` fails the string equality check `if (fundName === 'General Temple Fund') opening = parseFloat(s.openingGeneralFund) || 0;`. The fund’s opening balance reverts to ₹0.00.

### 5.2 Deletion Behavior & Historical Transactions
1. **Unconstrained Hard Deletion:**
   - `deleteRecord()` allows permanent deletion of any fund, bank account, income category, or expense category with only a generic browser `confirm()` prompt.
   - **Zero reference checking is performed.**
2. **Disastrous Accounting Consequences:**
   - **Total Loss of Fund Balance Tracking:** `getAllFundBalances()` iterates over `await allFunds()`. If a fund with ₹500,000 in historical receipts is deleted, it is completely excluded from `getAllFundBalances()`.
   - **Trial Balance Failure:** In Trial Balance, because the deleted fund is excluded, its credit balance is omitted from the equity section, while the corresponding cash/bank assets remain in `Cash in Hand` or `Bank Account`. This creates an unresolvable **"Difference Found"** error on the Trial Balance banner.
   - **Reports Inaccuracy:** The Fund-wise Balances table in the Reports screen ceases to report the deleted fund, causing total reported temple equity to diverge from actual cash and bank assets.
   - **System Breakage on Core Deletion:** Deleting `"General Temple Fund"`, `"Punarudharanam Fund"`, or `"Chitty Fund"` immediately breaks the Dashboard Overview cards, the Punarudharanam screen, the Chitty screen, and physical receipt creation.

### 5.3 Duplicate Names, Case Differences, and Normalization
1. **Zero Duplicate Checking:**
   - `addFund()`, `addBankAccount()`, `addIncomeCategory()`, and `addExpenseCategory()` perform zero collision detection.
   - An administrator can accidentally create identical duplicate entries (e.g. three entries named `"General Temple Fund"`).
2. **Case and Whitespace Sensitivity:**
   - Entries with case differences (`"Flower"`, `"flower"`, `"FLOWER"`) or internal whitespace differences (`"Pooja  Income"` vs `"Pooja Income"`) are treated as separate entities.
   - This causes fragmented accounting categories and duplicate ledger/filter options.

---

## 6. Authorization and Multi-User Safety Findings

### 6.1 Application-Level Authorization
- **Implementation:** Master-data handlers (`addFund`, `renameRecord`, `deleteRecord`, `saveTempleSettings`, `saveOpeningBalances`) only check:
  ```javascript
  const user = getCurrentFirebaseUser();
  if (!user) { alert('Authentication required.'); return; }
  ```
- **Finding:** **No role-based authorization exists in application logic.** Any signed-in user (regardless of whether they are a counter clerk, cashier, or trustee) can access the Settings view and add, rename, or permanently delete master data.

### 6.2 Server-Side Firestore Security Rules
- **Active Production Rules (`d:\Temple\firestore.rules`):**
  ```firestore
  match /{collection}/{docId} {
    allow read, write: if isAuthenticated();
  }
  match /settings/{docId} {
    allow read, write: if isAuthenticated();
    allow delete: if false;
  }
  ```
- **Candidate Hardened Rules (`d:\Temple\firestore.rules.candidate`):**
  ```firestore
  match /funds/{docId} { allow read, write: if isAuthenticated(); }
  match /incomeCategories/{docId} { allow read, write: if isAuthenticated(); }
  match /expenseCategories/{docId} { allow read, write: if isAuthenticated(); }
  match /bankAccounts/{docId} { allow read, write: if isAuthenticated(); }
  match /settings/{docId} { allow read, write: if isAuthenticated(); allow delete: if false; }
  ```
- **Finding:** In both active and candidate rules, **any authenticated user can write and delete** documents in `/funds`, `/bankAccounts`, `/incomeCategories`, and `/expenseCategories`. There is no role check (such as `request.auth.token.role == 'admin'`).
- **Live Production Service Status:** **UNVERIFIED** (Per strict safety rules, no live Firebase or cloud services were contacted during this audit).

### 6.3 Concurrency & Race Conditions
- **Deterministic ID Generation Risk:**
  - `fsSaveRecordSafe()` assigns `docId = `${prefix}${Date.now()}`` when no ID is provided.
  - If two administrators add an item simultaneously, timestamp collision could theoretically cause an overwrite.
- **Non-Transactional Mutations:**
  - `fsUpdateRecordSafe` and `fsDeleteRecordSafe` execute direct `.set({ merge: true })` and `.delete()` calls without an atomic Firestore transaction or preconditions. Concurrent edits will overwrite each other ("last write wins").

---

## 7. Existing Test Coverage and Recommended Regression Plan

### 7.1 Existing Test Coverage
An audit of all 60+ test suites in `d:\Temple\tests\` reveals:
- **Zero test coverage for master-data CRUD operations.**
- Existing test suites (e.g. `test_step_33_72_physical_receipt_validation.js`, `test_step_33_85_receipt_print_layout.js`) merely mock `allFunds()`, `allIncomeCategories()`, and `allBankAccounts()` with hardcoded in-memory arrays.
- There are no tests verifying:
  - Add, edit, or delete behavior in Firestore/IndexedDB.
  - Duplicate detection or case-insensitivity.
  - Reference checking before deletion.
  - Dropdown reloading or cross-module synchronization.

### 7.2 Recommended Isolated Regression Test Plan
Prior to implementing any master-data modifications, the following dedicated test suite must be constructed and run in an isolated emulator/mock environment:

1. **Test Suite 1: Master-Data Validation & Normalization**
   - Test empty, whitespace-only, and un-trimmed inputs (reject).
   - Test case-insensitive duplicate prevention (reject adding `"flower"` if `"Flower"` exists).
   - Test internal whitespace collapse (`"Pooja   Income"` normalized to `"Pooja Income"`).
2. **Test Suite 2: Reference Integrity Guard on Deletion**
   - Attempt to delete a fund that has active or voided receipts (must throw error / block deletion).
   - Attempt to delete a category referenced by payments or billing (must block deletion).
   - Attempt to delete a bank account referenced by receipts or payments (must block deletion).
   - Attempt to delete an unused entity (must succeed in both Firestore and IndexedDB).
3. **Test Suite 3: Protected Core Master Data**
   - Attempt to rename or delete `"General Temple Fund"`, `"Punarudharanam Fund"`, or `"Chitty Fund"` (must be strictly blocked as immutable system funds).
   - Attempt to delete core billing income categories (`"Vazhipadu Income"`, `"Donation Income"`) (must be strictly blocked).
4. **Test Suite 4: Rename Propagation & Historical Integrity**
   - Test renaming an entity: verify whether historical transactions retain their integrity, ledger filters remain functional, and trial balance calculations remain balanced.
5. **Test Suite 5: Cross-Module Dropdown Synchronization**
   - Verify that adding a new fund or category updates dropdowns in Receipts, Payments, and Ledger without requiring a full application restart.
6. **Test Suite 6: Multi-Session Cache Invalidation**
   - Simulate Session A modifying a category and verify that Session B receives or fetches the latest state upon view navigation.
7. **Test Suite 7: Full Financial Integrity Invariance**
   - Verify that Cash Book running balances, Bank Book balances, General Ledger debit/credit totals, and Trial Balance equilibrium remain 100% exact.

---

## 8. Prioritized List of Recommended Implementation Changes

The following changes are required to transform master-data management into an enterprise-grade, synchronized, and safe system:

```
[Phase 1: Protection & Guards] -> [Phase 2: Validation] -> [Phase 3: Synchronization] -> [Phase 4: Authorization]
 - Block In-Use Deletions         - Duplicate Checking     - Event/Broadcast Sync        - Admin Role Checks
 - Protect Core System Funds      - Whitespace Trimming    - Invalidate Dropdowns        - Hardened Rules
```

### Priority 1: Prevent Deletion of Referenced Master Data (Integrity Blocker)
- **Target Function:** `deleteRecord(store, id, viewName, ...args)` (line 6429).
- **Modification:** Before invoking `fsDeleteRecordSafe`, scan `receipts`, `payments`, `billing`, and `settings` to check if `rec.name` is referenced. If references exist, block deletion with a clear message: `"Cannot delete [Name] because it is referenced by existing transactions. Archive or rename instead."`

### Priority 2: Protect Core System Entities (Architecture Blocker)
- **Target Functions:** `renameRecord(store, id)` (line 7729) and `deleteRecord` (line 6429).
- **Modification:** Mark core entities as system-protected:
  - System Funds: `['General Temple Fund', 'Punarudharanam Fund', 'Chitty Fund']`.
  - System Categories: `['Vazhipadu Income', 'Donation Income']`.
  - Block deletion and restrict renaming of these core entities to protect hardcoded engines (balance engine, physical receipt parser, billing sync).

### Priority 3: Input Validation & Duplicate Prevention
- **Target Functions:** `addFund()` (line 15412), `addBankAccount()` (line 15421), `addIncomeCategory()` (line 15430), `addExpenseCategory()` (line 15439), and `renameRecord()` (line 7729).
- **Modification:** Check candidate name against existing items in the store (case-insensitive, normalized whitespace). Prevent duplicate entries and reject invalid/empty names.

### Priority 4: Rename Cascade or Query Aliasing
- **Target Function:** `renameRecord(store, id)` (line 7729) and `VIEW_RENDERERS.ledger` (line 13011).
- **Modification:** Either:
  - (Option A - Preferred): Cascade rename by updating the string across existing `receipts`, `payments`, and `billing` records in an atomic batch.
  - (Option B): Store `aliasHistory: ['Old Name']` on the master doc and update query filters (Ledger, Cash Book) to match any alias.

### Priority 5: Cross-Module Dropdown Synchronization
- **Target Mechanism:** Implement a lightweight local event/broadcast channel or view invalidation signal (e.g. `window.dispatchEvent(new CustomEvent('master-data-updated'))`).
- **Target Modules:** Register listeners in `receipts`, `payments`, and `billing` to reload dropdown options dynamically when master data is updated.

### Priority 6: Role-Based Authorization Enforcement
- **Target Functions:** `VIEW_RENDERERS.settings`, master-data mutation handlers, and `firestore.rules`.
- **Modification:** Restrict the Settings master-data panels to users with `admin` role in both client logic and server-side Firestore Security Rules.

---

## 9. Source Code and Production Environment Status

- **Source Code Alterations:** **NONE.** `Temple_Accounts-1.html` was inspected in a strictly read-only manner.
- **Production Services:** **NONE.** No connection to live Firebase services was established.
- **Data Mutations:** **NONE.** No live database records, counters, rules, or test data were created, modified, or deleted.

---

## 10. Audit Verdict

# `NOT READY — BLOCKERS IDENTIFIED`

### Primary Blocker Summary:
1. **Unconstrained Hard Deletion Breaks Accounting:** Any administrator can permanently delete a Fund, Bank Account, or Category with active transactions. Doing so breaks the General Ledger filter, removes funds from `getAllFundBalances()`, corrupts the Trial Balance equilibrium, and causes silent category overwrites upon editing historical transactions.
2. **Hardcoded Core Dependencies:** Core financial engines (`getFundBalance`, physical receipt parser, billing-to-accounting conversion, Punarudharanam screen, Chitty screen, and opening balance settings) rely on hardcoded string literals (`'General Temple Fund'`, `'Punarudharanam Fund'`, `'Chitty Fund'`, `'Vazhipadu Income'`). Editing or deleting these values immediately breaks core platform functionality.
3. **Zero Collision & Validation Guards:** Master-data creation lacks duplicate checking and case/whitespace normalization, permitting duplicate and corrupt entities.
4. **Missing Synchronization & Snapshot Listeners:** There are zero real-time Firestore listeners; multi-session synchronization does not exist for master data.
5. **No Role-Based Authorization:** Master-data mutations are accessible to any authenticated user with zero server-side or client-side admin verification.
6. **Zero Test Coverage:** No automated regression tests exist for master-data operations.

*All identified blockers must be resolved in structured, phased implementation steps with rigorous isolated regression testing.*
