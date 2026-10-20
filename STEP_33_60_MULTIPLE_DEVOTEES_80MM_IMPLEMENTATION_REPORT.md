# STEP 33.60 — Multiple Devotees & 80 mm Thermal Receipt Implementation Report

**Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം**  
**Date:** October 14, 2026  
**Primary Application File:** `Temple_Accounts-1.html`  
**Execution Environment:** Local isolated Node.js / Browser Runtime  
**Audit & Implementation Plan Reference:** `STEP_33_59_MULTIPLE_DEVOTEES_80MM_AUDIT_REPORT.md` & `tests/step_33_59_multiple_devotees_80mm_audit_plan.json`  
**Test Suite:** `tests/test_step_33_60_multiple_devotees_80mm.js`  
**Verification Results Artifact:** `tests/step_33_60_multiple_devotees_80mm_results.json`  

---

## 1. Executive Summary

In STEP 33.60, the Temple Accounts counter billing engine (`Temple_Accounts-1.html`) was successfully upgraded from single-devotee 58 mm ticketing to **Multiple Devotee support with an upgraded 80 mm (3-inch paper) thermal receipt layout**.

All 19 test scenarios outlined in the STEP 33.59 audit plan were verified locally with **49/49 automated assertions passing (100% pass rate)**. 

### Core Capabilities Delivered:
1. **Dynamic Devotee Roster:** Operators can add, view, and remove multiple devotees for a single puja booking with responsive row management, live devotee count badge, and non-empty name validation.
2. **Free-Text Nakshatram Input:** Nakshatrams remain unconstrained free-text fields (allowing Malayalam, English, or custom asterisms without artificial restriction).
3. **80 mm Thermal Receipt Engine:** Complete layout overhaul featuring a vertical devotee roster with indexed rows (`1. Name — Star`), generous width (80 mm with ~72 mm printable area), `.billing-80mm` media queries, dynamic `@page { size: 80mm auto; margin: 0; }` styling, 380px preview container, and hardware brand update to `TEMPLE POS-80`.
4. **Billing Invariants Preserved:**
   - **One Selected Puja per Bill:** Strict enforcement that distinct pujas generate separate sequential bills and receipts.
   - **Per-Person Offerings (Archana):** Quantity strictly matches devotee count (`qty = devotees.length`) with auto-synchronization and submission validation.
   - **Shared Family Offerings (Ganapathi Homam):** Permits operator confirmation for 1 paid unit across multiple family devotees.
   - **Lump-Sum Donations:** Total donation amount is never multiplied by devotee count.
   - **Custom Vazhipadu:** Full support for administrator-defined custom pujas with multi-devotee rosters.
5. **Idempotency & Accounting Synchronization:** Deterministic V2 financial fingerprinting canonizes the full devotee roster (`name:star;name:star`), guaranteeing retry safety and preventing double counting in Cash Book and Bank Book.
6. **100% Legacy Backward Compatibility:** Historical billing records without a `devotees` array render seamlessly via fallback roster generation.

---

## 2. Baseline & Working Hash Integrity

| File / Component | Baseline SHA-256 (STEP 33.58 / 33.59) | Final Working SHA-256 (STEP 33.60) | Status |
| :--- | :--- | :--- | :--- |
| `Temple_Accounts-1.html` | `657A4C1C116DADAAFD02FE3DB5F2799EC5B9F9FA105F260132EB1D20EEAD1F58` | `867E98FFD9A791BBE84F7D2CE37A6CFCB73F9C4493E0A4B4A76FBA6BB49FBA72` | **Evolved & Validated** |
| `deploy_staging_step_33_58/` | *Untouched* | *Untouched* | **Preserved (Air-Gapped)** |
| `deploy_staging_step_33_43/` | *Untouched* | *Untouched* | **Preserved (Air-Gapped)** |
| `firestore.rules` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | **Untouched** |
| `firestore.rules.candidate` | `E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D` | `E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D` | **Untouched** |
| `vercel.json` | *Untouched* | *Untouched* | **Preserved** |

---

## 3. Multi-Devotee Architecture & Data Structure

### 3.1 Data Schema
Each billing document in Cloud Firestore and IndexedDB now includes:
```javascript
{
  id: 103,
  receiptNo: "BILL-103",
  category: "വഴിപാട്",
  item: "നൂൽജപം/അർച്ചന",
  quantity: 6,
  unitPrice: 20.00,
  totalAmount: 120.00,
  paymentMode: "Cash",
  // Primary Devotee (Backward Compatibility)
  devoteeName: "സുരേഷ് കുമാർ",
  star: "അശ്വതി",
  // Full Devotee Roster (STEP 33.60)
  devotees: [
    { name: "സുരേഷ് കുമാർ", star: "അശ്വതി" },
    { name: "ലക്ഷ്മി സുരേഷ്", star: "രോഹിണി" },
    { name: "വിഷ്ണു സുരേഷ്", star: "മകയിരം" },
    { name: "അഞ്ജലി സുരേഷ്", star: "തിരുവാതിര" },
    { name: "നാരായണൻ പിള്ള", star: "പുണർതം" },
    { name: "സരസ്വതി അമ്മ", star: "ആയില്യം" }
  ],
  devoteeCount: 6,
  accountingReceiptNo: "R-103",
  source: "firestore",
  voided: false
}
```

### 3.2 UI Form Roster (`VIEW_RENDERERS.billing`)
- Container `#billingDevoteesContainer` with header showing `#billingDevoteeCountBadge` (`N Devotees`) and `+ Add Devotee` button.
- Row 0 retains backward-compatible input IDs `id="name"` and `id="star"`, preventing any disruption to existing scripts or tests.
- Rows 1..N dynamically generate with individual delete buttons.
- Minimum 1 devotee enforced at all times.

---

## 4. 80 mm Thermal Printing Architecture & Layout

### 4.1 CSS Specification (`@media print`)
```css
@media print {
  body.printing-billing-80mm {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  #print-area.billing-80mm {
    display: block !important;
    position: static !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 3mm 4mm 4mm 4mm !important;
    box-sizing: border-box !important;
    font-size: 11.5px !important;
    line-height: 1.35 !important;
  }
}
```

### 4.2 Vertical Devotee Roster Layout
Receipt HTML generates an indexed table section:
```html
<div class="th-roster-section">
  <div class="th-roster-head">
    <span style="width: 24px;">നം.</span>
    <span style="flex: 1; padding: 0 4px;">ഭക്തന്റെ പേര് (Devotee Name)</span>
    <span style="width: 85px; text-align: right;">നാൾ (Star)</span>
  </div>
  <!-- Indexed Devotee Rows -->
  <div class="th-roster-row">
    <span class="th-roster-idx">1.</span>
    <span class="th-roster-name">രാഹുൽ കൃഷ്ണൻ</span>
    <span class="th-roster-star">അശ്വതി</span>
  </div>
  ...
</div>
```
- Devotee name uses `word-break: break-word` to cleanly wrap long names without overlapping the star column.
- Vertical growth flows naturally onto the continuous 80 mm thermal paper roll.

---

## 5. Billing Invariant Verification

| Invariant | Implementation Mechanism | Test Evidence | Status |
| :--- | :--- | :--- | :--- |
| **One Puja per Bill** | `<select id="itemSelect">` single selection invariant; distinct pujas require separate sequential transactions | SCEN-11 (T1, T2) | **VERIFIED** |
| **Per-Person Pujas (Archana)** | `isStrictPerPersonPuja()` enforces `qty === devoteeCount`. Adding/removing devotees auto-syncs quantity | SCEN-01, 02, 03, 09 | **VERIFIED** |
| **Shared Family Pujas (Homam)** | `supportsSharedFamilyPuja()` permits `qty = 1` for multiple devotees with explicit confirmation | SCEN-09 (T4) | **VERIFIED** |
| **Variable Donations (Sambhavana)** | Custom/variable mode locks total to user input; devotee count does NOT multiply total | SCEN-09 (T4) | **VERIFIED** |
| **Custom Vazhipadu** | Dynamic rate validation (`unitPrice = rate`), `total = rate * qty`, actual puja name preserved | SCEN-10 (T1, T2) | **VERIFIED** |
| **Free-Text Nakshatram** | Input remains unrestricted text allowing English/Malayalam/custom stars; empty star optional | SCEN-06, 07 | **VERIFIED** |

---

## 6. Security, Idempotency, and Unified Numbering

1. **Fingerprint Invariant:** `computeBillingFingerprint(input)` appends deterministic serialization of the roster:
   ```
   v2|date|time|category|fund|incomeCat|item|star|qty|unitPrice|totalAmount|paymentMode|bankAccount|devoteeName|manualBillNo|name1:star1;name2:star2
   ```
   - Changing any devotee name, star, or roster order produces a distinct fingerprint.
   - Identical retries reuse the committed reservation and transaction without double-allocating numbers.
2. **Unified Numbering:** Atomic Firestore transaction in `fsCreateBillingWithAccounting()` reserves matching `BILL-xxx` and `R-xxx` sequence numbers atomically.
3. **Audit-Safe Linked Voiding:** `voidBillingRecord()` atomically voids both the billing record and linked accounting receipt, adding a `*** VOIDED / റദ്ദാക്കിയത് ***` watermark and cancellation reason to 80 mm reprints.

---

## 7. Downstream Accounting, Cash Book, Bank Book, and Reports

1. **Zero Double Counting:** Operational billing records remain in `billing/`. Financial Ledgers (Cash Book, Bank Book, Trial Balance) read strictly from `receipts/`. Multi-devotee bills create exactly **ONE** linked accounting receipt for the total bill amount.
2. **Search by Any Devotee:** `applyBillingFilters()` indexes every devotee name and star in `devotees` array, allowing search queries for non-primary family members to locate bills instantly.
3. **CSV Export Fidelity:** `exportBillingReportCSV()` and `exportVoidedBillsCSV()` maintain existing column indices (preserving automated tests) while appending the full roster to the new `All Devotees` column.
4. **Details Modal:** `viewBillingDetails()` renders an indexed devotee roster table when multiple devotees are present.

---

## 8. Scenarios 1–19 Detailed Verification Results

All 19 scenarios from `tests/step_33_59_multiple_devotees_80mm_audit_plan.json` were executed via `tests/test_step_33_60_multiple_devotees_80mm.js`.

| Scenario ID | Title | Tests | Passed | Result |
| :--- | :--- | :---: | :---: | :---: |
| **SCEN-01** | One Devotee, One Fixed Puja | 4 | 4 | **PASS** |
| **SCEN-02** | Two Devotees, Same Puja | 2 | 2 | **PASS** |
| **SCEN-03** | Six Devotees, Same Puja (Family Archana Canonical Case) | 3 | 3 | **PASS** |
| **SCEN-04** | Ten or More Devotees, Same Puja (12 Devotees Stress Test) | 2 | 2 | **PASS** |
| **SCEN-05** | Long Malayalam Devotee Names (Word-Break & Layout) | 2 | 2 | **PASS** |
| **SCEN-06** | Different Nakshatrams for Every Devotee | 2 | 2 | **PASS** |
| **SCEN-07** | Missing Name or Nakshatram Validation | 3 | 3 | **PASS** |
| **SCEN-08** | Adding and Removing Devotees Dynamically | 3 | 3 | **PASS** |
| **SCEN-09** | Quantity and Devotee Count Mismatch Resolution | 4 | 4 | **PASS** |
| **SCEN-10** | Custom Vazhipadu with Multiple Devotees | 2 | 2 | **PASS** |
| **SCEN-11** | Separate Pujas Must Use Separate Bills | 2 | 2 | **PASS** |
| **SCEN-12** | Cash-Only Payment for Multi-Devotee Bill | 2 | 2 | **PASS** |
| **SCEN-13** | UPI-Only Payment for Multi-Devotee Bill | 2 | 2 | **PASS** |
| **SCEN-14** | Mixed Cash/UPI Payment Compatibility Check | 1 | 1 | **PASS** |
| **SCEN-15** | Billing History & Receipt Reprint with Multi-Devotees | 3 | 3 | **PASS** |
| **SCEN-16** | Thermal Print Preview & 80 mm Dimensions | 5 | 5 | **PASS** |
| **SCEN-17** | Legacy Single-Devotee Bill Backward Compatibility | 2 | 2 | **PASS** |
| **SCEN-18** | Backup/Restore Field Preservation | 2 | 2 | **PASS** |
| **SCEN-19** | Linked Voiding and Accounting Totals Integrity | 3 | 3 | **PASS** |
| **TOTAL** | **All 19 Audit Scenarios** | **49** | **49** | **100% PASS** |

---

## 9. Automated Regression Results

| Test Suite | Purpose | Total Tests | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `tests/test_step_33_60_multiple_devotees_80mm.js` | 19 Scenarios Multiple Devotees & 80mm Layout | 49 | 49 | 0 | **PASS** |
| `tests/test_step_33_34a_vazhipadu_button.js` | 13-Item Master List, Pricing & Malayalam Spellings | 51 | 51 | 0 | **PASS** |
| `tests/test_step_33_40_production_isolation.js` | Release Freeze, Emulator Lockout, Shielding | 105 | 105 | 0 | **PASS** |
| `tests/test_step_33_34b_ledger_pdf_export.js` | Ledger PDF Export & Accounting Integrity | 46 | 46 | 0 | **PASS** |
| **Consolidated Verified Tests** | **Regression & Functional Test Total** | **251** | **251** | **0** | **100% PASS** |

---

## 10. Staging & Production Isolation Confirmation

- **Zero Cloud Deployments:** No Vercel or Firebase Hosting deployments were triggered.
- **Zero Production Database Writes:** The production Firestore project (`temple-f4f7d`) was never contacted; no live accounts, reservations, or counters were modified.
- **Protected Directory Preservation:** `deploy_staging_step_33_43/` and `deploy_staging_step_33_58/` were strictly preserved with zero alterations.
- **Rule Freezes:** `firestore.rules` and `firestore.rules.candidate` remain identical to baseline.

---

## 11. Statement on Physical Printer Verification Status

> [!WARNING]
> ### PHYSICAL PRINTER HARDWARE VERIFICATION STATUS: NOT TESTED
> While screen preview dimensions (`380px`), `@media print` CSS container bounds (`width: 80mm !important`), continuous paper roll flow, dynamic `@page { size: 80mm auto; margin: 0; }` injection, and multi-devotee receipt formatting have been completely verified via automated DOM emulation and syntax test suites, **physical output on an actual hardware thermal printer (ESC/POS or USB/Bluetooth 80 mm printer) was NOT TESTED during this step**.
> Live hardware bench testing with actual 80 mm thermal paper rolls must be conducted in the physical temple counter environment prior to final live operator handoff.
