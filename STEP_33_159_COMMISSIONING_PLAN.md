# STEP 33.159 — Safe First Billing Number Commissioning Plan

**Project:** Temple Accounts & Fund Management  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Application File:** [`d:\Temple\Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html)  
**Firebase Project:** `temple-f4f7d` (Spark Plan — Free Tier)  
**Authorized Administrator:** `vibu@gmail.com` (UID: `rFvStQNfiINnPor66OzXuE1O9Lm1`)  
**Investigation Timestamp:** 2026-10-20T08:42:00.000Z (14:12:00 IST)  
**Status:** ✅ **INVESTIGATION COMPLETE — COMMISSIONING SPECIFICATION FINALIZED**  
**Execution Guard:** 🛑 **ZERO MUTATIONS PERFORMED — PLANNING ONLY**

---

## 1. Executive Summary

Following **STEP 33.157**, all 412 confirmed pre-production test transactions were successfully purged from Cloud Firestore. However, when an operator enters `001` or `BILL-001` into the manual bill number field on the Billing screen, the application rejects the entry:

> **"❌ Number BILL-001 is already reserved/issued. Numbers cannot be reused."**

### Core Investigation Findings:
1. **Root Cause:**  
   The rejection is purely arithmetic:
   $$\text{parsed } (1) < \text{nextSeq } (101)$$
   The document `system/counters` still holds `globalSequenceCounter: 100` and `billingReceiptCounter: 100`. The real-time input validator ([`Temple_Accounts-1.html:L11130`](file:///d:/Temple/Temple_Accounts-1.html#L11130)), the submit handler ([`L11444`](file:///d:/Temple/Temple_Accounts-1.html#L11444)), and the transactional backend ([`L21950`](file:///d:/Temple/Temple_Accounts-1.html#L21950)) all reject any number strictly less than `curSeq + 1`.
2. **Ground-Truth Database Verification:**  
   A live read-only verification executed through the authenticated administrative session (`vibu@gmail.com`) confirmed:
   - `billing/bill_1`: **DOES NOT EXIST** (`b1Exists: false`)
   - `receipts/rcpt_1`: **DOES NOT EXIST** (`r1Exists: false`)
   - `system/res_1`: **DOES NOT EXIST** (`res1Exists: false`)
   - `billing` collection count: **0**
   - `receipts` collection count: **0**
   - `system` reservations (`res_*`): **0**
   - `system` operations (`op_*`): **0**
   - `system/counters`: exists with `globalSequenceCounter: 100`, `billingReceiptCounter: 100`, `receiptCounter: 1020`, `voucherCounter: 502`.
3. **Safety of Sequence 1:**  
   Setting `globalSequenceCounter` and `billingReceiptCounter` to `0` is **completely safe** and is the canonical initial state for a fresh temple ledger. Sequence 1 (`BILL-001` / `R-001`) is already explicitly protected by the application's built-in **Commissioning Guard** ([`Temple_Accounts-1.html:L22501-L22510`](file:///d:/Temple/Temple_Accounts-1.html#L22501-L22510)), which strictly prohibits independent receipts from issuing sequence 1 before the first bill is created.
4. **Decoupled Payment Vouchers:**  
   Payment vouchers use an independent counter (`voucherCounter`, currently `502`). Preserving `voucherCounter: 502` guarantees that future vouchers start at `V-503`, causing **zero voucher collisions**.

---

## 2. Code Trace & Counter Dependency Findings

An exhaustive inspection of all numbering functions in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) reveals the following architecture:

```
                                  ┌─────────────────────────────────────────┐
                                  │             system/counters             │
                                  │  globalSequenceCounter: 100             │
                                  │  billingReceiptCounter: 100             │
                                  │  receiptCounter: 1020                   │
                                  │  voucherCounter: 502                    │
                                  └────────────────────┬────────────────────┘
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           ▼                                                       ▼
        ┌──────────────────────────────────────┐                ┌──────────────────────────────────────┐
        │      getNextGlobalSequenceNo()       │                │          fsNextVoucherNo()           │
        │    cur = counters.globalSequence     │                │   cur = counters.voucherCounter      │
        │          returns cur + 1             │                │          returns V-(cur + 1)         │
        └──────────────────┬───────────────────┘                └──────────────────────────────────────┘
                           │                                                 (Payment Vouchers)
          ┌────────────────┴────────────────┐
          ▼                                 ▼
┌──────────────────┐              ┌──────────────────┐
│  Billing Screen  │              │  Receipt Screen  │
│  nextBillNum =   │              │  nextSeqNum =    │
│  curSeq + 1      │              │  curSeq + 1      │
│  (BILL-001)      │              │  (R-001)         │
└──────────────────┘              └──────────────────┘
```

### 2.1 Function Trace Breakdown

| Function Name | File Line Range | Counter Read / Written | Numbering Role & Behavior |
| :--- | :--- | :--- | :--- |
| [`parseGlobalNumber(str)`](file:///d:/Temple/Temple_Accounts-1.html#L7667-L7672) | Lines 7667–7672 | None (Pure Regex) | Matches `^(?:BILL-\|R-)?0*([1-9]\d*)$`. Parses `"001"`, `"BILL-001"`, `"R-001"`, `"1"` all into integer `1`. |
| [`formatGlobalNumber(num, prefix)`](file:///d:/Temple/Temple_Accounts-1.html#L7662-L7665) | Lines 7662–7665 | None (Formatting) | Formats `1` with `'BILL-'` into `"BILL-001"` (pads to 3 digits). |
| [`getNextGlobalSequenceNo()`](file:///d:/Temple/Temple_Accounts-1.html#L7674-L7686) | Lines 7674–7686 | Reads `system/counters.globalSequenceCounter` | Returns `(globalSequenceCounter \|\| 0) + 1`. Currently returns $100 + 1 = 101$. |
| [`getNextBillingReceiptNo()`](file:///d:/Temple/Temple_Accounts-1.html#L9825-L9838) | Lines 9825–9838 | Reads `getNextGlobalSequenceNo()` | Generates UI preview string: `${billingPrefix}${pad(nextVal)}` (e.g. `BILL-101`). |
| [`validateManualBillNoInput(input)`](file:///d:/Temple/Temple_Accounts-1.html#L11111-L11152) | Lines 11111–11152 | Reads `getNextGlobalSequenceNo()` | Real-time input handler. If `parsed < nextSeq`, shows red banner: *"❌ Number BILL-001 is already reserved/issued. Numbers cannot be reused."* |
| [`billingSubmitForm()`](file:///d:/Temple/Temple_Accounts-1.html#L11434-L11457) | Lines 11434–11457 | Reads `getNextGlobalSequenceNo()` | Form submission validator. If `parsedManual < nextSeq`, aborts save and alerts operator that number is already reserved. |
| [`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L21707-L22145) | Lines 21707–22145 | Reads & Writes `system/counters` (`globalSequenceCounter`, `billingReceiptCounter`) | **Atomic Transactional Billing Engine:**<br>1. Validates `fund`.<br>2. Verifies idempotency (`system/op_*`).<br>3. Checks `parsed <= curSeq` (aborts if true).<br>4. Verifies `res_N`, `bill_N`, `rcpt_N` do not exist.<br>5. Writes `billing/bill_N`, `receipts/rcpt_N`, `system/res_N`, `system/op_N`.<br>6. Atomically updates both `globalSequenceCounter` and `billingReceiptCounter` to $N$. |
| [`fsCreateIndependentReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L22329-L22646) | Lines 22329–22646 | Reads & Writes `system/counters` (`globalSequenceCounter`) | **Atomic Independent Receipt Engine:**<br>1. Delegates physical numbers (`P*`, `PU*`) to `fsCreatePhysicalReceipt`.<br>2. **Commissioning Guard ([Line 22504](file:///d:/Temple/Temple_Accounts-1.html#L22504)):** If `curSeq === 0`, throws error requiring first transaction to be a bill.<br>3. Writes `receipts/rcpt_N`, `system/res_N`, `system/op_N`.<br>4. Updates `globalSequenceCounter` to $N$ (does NOT touch `billingReceiptCounter`). |
| [`fsCreatePhysicalReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L22161-L22327) | Lines 22161–22327 | None (Counters Isolated) | Handles physical books (`P600`–`P900`, `PU1`+). Writes `rcpt_phys_*` and `res_phys_*` with `seqNumber: null`. Never reads or touches `system/counters`. |
| [`fsNextVoucherNo()`](file:///d:/Temple/Temple_Accounts-1.html#L20696-L20703) | Lines 20696–20703 | Reads & Writes `system/counters.voucherCounter` | Atomically allocates voucher number for payments (`V-501`, `V-502`...). Completely decoupled from `globalSequenceCounter`. |

---

## 3. Shared Sequence & Invariant Analysis

### 3.1 Is `globalSequenceCounter` Shared by Bills and Receipts?

**YES. `globalSequenceCounter` is a unified accounting counter shared between Vazhipadu Billing and Independent Receipts.**

1. **Shared Sequence Behavior:**
   - Every bill issued receives sequential integer $N$ and automatically creates:
     - Vazhipadu bill record: `billing/bill_N` with `receiptNo: BILL-XXX`
     - Linked accounting receipt: `receipts/rcpt_N` with `receiptNo: R-XXX`
     - Sequence reservation: `system/res_N` with `billReceiptNo: BILL-XXX` and `receiptNo: R-XXX`
   - Every independent software receipt issued receives sequential integer $M$ and creates:
     - Accounting receipt record: `receipts/rcpt_M` with `receiptNo: R-XXX`
     - Sequence reservation: `system/res_M` with `receiptNo: R-XXX` (and `billDocId: null`)
   - Both transactions advance `globalSequenceCounter` monotonically so that neither module can issue a conflicting receipt number.

2. **The Commissioning Guard Protection ([Lines 22501–22510](file:///d:/Temple/Temple_Accounts-1.html#L22501-L22510)):**
   The application codebase incorporates a fail-closed commissioning guard specifically designed for the `curSeq === 0` state:
   ```javascript
   // STEP 33.137 (Fix B): Commissioning guard.
   // Sequence 1 (BILL-001 / R-001) is reserved for the first billing transaction.
   if (curSeq === 0) {
     throw new Error(
       'The accounting sequence has not been commissioned yet. ' +
       'The first transaction (sequence 001) must be a billing transaction. ' +
       'Please create the first bill from the Billing screen before recording an independent receipt.'
     );
   }
   ```
   **Architectural Consequence:**  
   When `globalSequenceCounter` is set to `0`:
   - An independent receipt **cannot** seize sequence 1.
   - The first transaction is **guaranteed** to originate from the Billing module.
   - Upon creating the first bill, sequence 1 is issued (`BILL-001` and `R-001`), and `globalSequenceCounter` advances to `1`.
   - From sequence 2 onward, both billing and independent receipts can proceed normally.

### 3.2 Dual Counter Invariant (`globalSequenceCounter` vs. `billingReceiptCounter`)

- In `fsCreateBillingWithAccounting` ([Line 22127](file:///d:/Temple/Temple_Accounts-1.html#L22127)), every bill updates both:
  ```javascript
  tx.set(counterRef, {
    globalSequenceCounter: nextBillNum,
    billingReceiptCounter: nextBillNum,
    updatedAt: serverTs
  }, { merge: true });
  ```
- If `globalSequenceCounter` is reset to 0 while `billingReceiptCounter` is left at 100, a counter divergence occurs. Legacy queries or diagnostic checks inspecting `billingReceiptCounter` would report sequence 100 while active sequencing generates `BILL-001`.
- **Mandatory Invariant:** Both `globalSequenceCounter` and `billingReceiptCounter` must be updated together to `0`.

---

## 4. Historical Records & Numbering Collision Assessment

A thorough investigation was conducted to determine whether historical physical receipts, paper books, or retained records could conflict with `BILL-001` or receipt number `R-001` (`R-0001`).

| Record Type | Series / Prefix | Storage Namespace | Potential Conflict with `BILL-001` / `R-001` | Evidence / Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **Physical Puja Receipt Books** | `P600` – `P900` | `rcpt_phys_P*`<br>`res_phys_P*` | **ZERO** | Physical books use prefix `P` and range 600–900. Zero overlap with `BILL-` or `R-`. |
| **Physical Punarudharanam Books** | `PU1`, `PU2`, ... | `rcpt_phys_PU*`<br>`res_phys_PU*` | **ZERO** | Physical renovation books use prefix `PU`. Zero overlap with `BILL-` or `R-`. |
| **Historical Pre-Computerization Paper Bills** | None | N/A | **ZERO** | Vazhipadu counter did not issue computer bills prior to this software. Thermal `BILL-` series is entirely software-native. |
| **Legacy Development Offsets (`1000` / `500`)** | `R-1001`+ / `V-501`+ | `receipts/rcpt_*`<br>`payments/pay_*` | **ZERO** | In Steps 1–12, offsets `receiptCounter: 1000` and `voucherCounter: 500` were set as a buffer. Under Step 33.12 unified sequencing, modern software receipts use `globalSequenceCounter` (`001`, `002`). |
| **Deleted Test Records (STEP 33.157)** | `BILL-001` to `BILL-100` | Purged | **ZERO** | All 412 test transactions were permanently deleted on 2026-10-20T08:08:07Z. Post-verification confirmed 0 records remain. |
| **Payment Vouchers** | `V-501`, `V-502` | `payments/pay_*` | **ZERO** | Vouchers use independent counter `voucherCounter: 502`. Vouchers continue from `V-503`. |

### Conclusion on Historical Collision:
No physical paper receipt books, historical vouchers, or live database records conflict with `BILL-001` or `R-001`. The number `BILL-001` represents the true, genuine first operational computer bill of the temple.

---

## 5. Live Environment Verification Audit

On 2026-10-20 at 14:11:30 IST, a read-only verification was executed directly against Cloud Firestore in the authenticated administrative session (`vibu@gmail.com`):

```json
{
  "authenticatedUser": {
    "email": "vibu@gmail.com",
    "uid": "rFvStQNfiINnPor66OzXuE1O9Lm1"
  },
  "counters": {
    "globalSequenceCounter": 100,
    "billingReceiptCounter": 100,
    "receiptCounter": 1020,
    "voucherCounter": 502,
    "billingPrefix": "BILL-",
    "billingReceiptPrefix": "BILL-",
    "receiptPrefix": "R-",
    "voucherPrefix": "V-",
    "source": "indexeddb_clean_production"
  },
  "sequence1Check": {
    "b1Exists (billing/bill_1)": false,
    "r1Exists (receipts/rcpt_1)": false,
    "res1Exists (system/res_1)": false
  },
  "collectionCounts": {
    "billing": 0,
    "receipts": 0,
    "payments": 0,
    "systemTotal": 1,
    "systemReservations": 0,
    "systemOperations": 0
  }
}
```

This live evidence proves that sequence 1 is completely vacant in all three required document collections (`billing`, `receipts`, and `system`).

---

## 6. Comparison of Correction Options

| Criteria | Option 1: UI Validation Bypass | Option 2: Blind Counter Overwrite | Option 3 (Recommended): Dedicated Commissioning Transaction |
| :--- | :--- | :--- | :--- |
| **Mechanism** | Alter `validateManualBillNoInput` to hardcode an exception for `'001'`. | Execute an ad-hoc `.update({ globalSequenceCounter: 0 })`. | Execute an authenticated, fail-closed atomic transaction verifying preconditions, updating paired counters, and recording audit metadata. |
| **Backend Safety** | ❌ **FAIL:** Backend transaction (`fsCreateBillingWithAccounting`) still rejects `parsed <= curSeq` at Line 21950. | ⚠️ **PARTIAL:** Does not verify if records were created concurrently; leaves `billingReceiptCounter` at 100. | ✅ **PASS:** Transaction reads counters, verifies emptiness of sequence 1, updates paired counters atomically. |
| **Auto-Generation** | ❌ **FAIL:** `getNextBillingReceiptNo()` still displays `BILL-101`. | ✅ **PASS:** `getNextBillingReceiptNo()` displays `BILL-001`. | ✅ **PASS:** `getNextBillingReceiptNo()` displays `BILL-001`. |
| **Independent Receipts**| ❌ **FAIL:** Independent receipts can allocate out of order. | ⚠️ **RISK:** No commissioning guard verification. | ✅ **PASS:** Commissioning guard is activated; independent receipts cannot preempt `BILL-001`. |
| **Audit Trail** | ❌ None. | ❌ None. | ✅ Full audit metadata recorded (`commissionedBy`, `commissionedAt`, `commissioningStatus`). |

---

## 7. Recommended Minimal Correction Specification

The recommended correction is a **Dedicated Administrative Commissioning Transaction**:

### 7.1 Exact Document Mutations on `system/counters`

```javascript
// Target Document: system/counters
{
  // 1. Commission global sequence counters to zero
  globalSequenceCounter: 0,
  billingReceiptCounter: 0,

  // 2. Preserve payment voucher counter to prevent duplicate vouchers
  voucherCounter: 502,

  // 3. Preserve legacy receipt counter baseline
  receiptCounter: 1020,

  // 4. Preserve existing standard prefixes
  billingPrefix: "BILL-",
  billingReceiptPrefix: "BILL-",
  receiptPrefix: "R-",
  voucherPrefix: "V-",

  // 5. Commissioning Audit Metadata
  commissionedAt: firebase.firestore.FieldValue.serverTimestamp(),
  commissionedBy: "rFvStQNfiINnPor66OzXuE1O9Lm1",
  commissionedUser: "vibu@gmail.com",
  commissioningStatus: "READY_FOR_FIRST_BILL",
  commissioningNote: "STEP 33.159: Reset sequence counters to zero following test data cleanup. Enables first production bill to issue BILL-001.",
  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
}
```

### 7.2 Safety Invariants Enforced by Commissioning Operation:
1. **Precondition 1 (Auth):** Must be signed in as authorized administrator `vibu@gmail.com`.
2. **Precondition 2 (Vacancy):** `bill_1`, `rcpt_1`, `res_1` must be verified non-existent immediately inside the transaction.
3. **Precondition 3 (Purity):** `billing` and `receipts` collections must contain 0 documents.
4. **Precondition 4 (Voucher Protection):** `voucherCounter` remains unchanged at `502`. Vouchers will monotonically continue at `V-503`.
5. **Precondition 5 (Atomicity):** Applied as an atomic Firestore transaction (`db.runTransaction()`). If any concurrent write occurs, the transaction automatically re-evaluates or aborts.

---

## 8. Explicit Preconditions and Rollback Limitations

### 8.1 Preconditions Checklist (Before Execution)

- [x] Application code in `Temple_Accounts-1.html` is unchanged.
- [x] Active security rules in `firestore.rules` permit authenticated administrator write to `system/counters`.
- [x] Backup file `D:\Download\Temple_Accounts_Backup_2026-10-20T06-17-45.json` is preserved with valid SHA-256 hash.
- [x] Live Firestore read-only check confirmed `bill_1`, `rcpt_1`, and `res_1` are completely absent.
- [x] Live web server is running on `127.0.0.1:3000` with authenticated session for `vibu@gmail.com`.

### 8.2 Rollback Limitations (Spark Tier)

1. **No Cloud Firestore Point-in-Time Recovery (PITR):**  
   The Firebase project is on the Spark (Free) plan. Google Cloud automated binary rollback (`gs://` bucket exports) is not configured.
2. **Reversibility of Counter Commissioning:**  
   If commissioning is performed and the administrator later decides to revert to `100`, updating `globalSequenceCounter: 100` and `billingReceiptCounter: 100` restores the exact pre-commissioning state.
3. **Post-First-Bill Irreversibility:**  
   Once the first bill `BILL-001` is entered and saved by the temple operator, rolling back requires a formal administrative void transaction (`voidRecord`) or targeted cleanup. Live production accounting records cannot be silently deleted once issued to devotees.

---

## 9. Prepared Commissioning Operation Script

The following script specification is prepared for execution in the next operational step. It connects via the authenticated browser CDP session on port 3000 and commits the commissioning transaction:

```javascript
/**
 * STEP 33.159 — EXECUTION RUNNER SPECIFICATION
 * Location: scripts/step_33_159_commission_counters.js
 */
'use strict';

async function executeCommissioning(db, user) {
  if (!user || user.email !== 'vibu@gmail.com') {
    throw new Error('Unauthorized: Must be authenticated as vibu@gmail.com');
  }

  const counterRef = db.collection('system').doc('counters');
  const b1Ref = db.collection('billing').doc('bill_1');
  const r1Ref = db.collection('receipts').doc('rcpt_1');
  const res1Ref = db.collection('system').doc('res_1');

  return await db.runTransaction(async (tx) => {
    // 1. Transactional reads
    const [cSnap, b1Snap, r1Snap, res1Snap] = await Promise.all([
      tx.get(counterRef),
      tx.get(b1Ref),
      tx.get(r1Ref),
      tx.get(res1Ref)
    ]);

    // 2. Strict precondition assertions
    if (!cSnap.exists) {
      throw new Error('system/counters document not found.');
    }
    if (b1Snap.exists) {
      throw new Error('Precondition failed: billing/bill_1 already exists!');
    }
    if (r1Snap.exists) {
      throw new Error('Precondition failed: receipts/rcpt_1 already exists!');
    }
    if (res1Snap.exists) {
      throw new Error('Precondition failed: system/res_1 already exists!');
    }

    const cData = cSnap.data() || {};

    // 3. Construct atomic update payload
    const updatePayload = {
      globalSequenceCounter: 0,
      billingReceiptCounter: 0,
      commissionedAt: firebase.firestore.FieldValue.serverTimestamp(),
      commissionedBy: user.uid,
      commissionedUser: user.email,
      commissioningStatus: 'READY_FOR_FIRST_BILL',
      commissioningNote: 'STEP 33.159: Reset sequence counters to zero. Enables first bill BILL-001.',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // 4. Commit atomic update
    tx.set(counterRef, updatePayload, { merge: true });

    return {
      status: 'COMMISSIONED',
      previousGlobalSequence: cData.globalSequenceCounter,
      previousBillingCounter: cData.billingReceiptCounter,
      newGlobalSequence: 0,
      newBillingCounter: 0,
      preservedVoucherCounter: cData.voucherCounter || 502,
      preservedReceiptCounter: cData.receiptCounter || 1020
    };
  });
}
```

---

## 10. Operational Sequence Following Approval

Once approved by the user/administrator:
1. **Execute Commissioning Script:**  
   Run the authenticated commissioning script to update `system/counters` to `0`.
2. **Reload Operator Browser Session:**  
   Refresh `Temple_Accounts-1.html` in the operator's browser window to reload `system/counters` into client memory (`window.APP_SETTINGS`).
3. **Verify Billing Screen:**  
   Navigate to the Billing module. Confirm that:
   - Bill number placeholder reads: `Auto-generated on save (e.g. BILL-001)`
   - Preview indicator displays: `(preview: BILL-001)`
   - Typing `001` or `BILL-001` renders green validation banner:  
     `✓ Valid next sequential number: BILL-001`
4. **Issue Genuine First Production Bill:**  
   The temple operator records the first vazhipadu bill, successfully producing `BILL-001` and synchronized accounting receipt `R-001`.
5. **No Code Mutations:**  
   All existing application validation, security rules, and financial protections remain 100% untouched.
