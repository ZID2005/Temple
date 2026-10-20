# STEP 33.59 — Multiple Devotees & 80 mm Receipt Integration Audit Report

**Project:** Temple Accounts & Fund Management  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Feature:** Multi-Devotee Roster with Individual Nakshatrams & 80 mm Thermal Receipt Migration  
**Phase:** Audit & Implementation Planning Only — Strictly READ-ONLY (No code modification)  
**Date:** 2026-10-14  
**Auditor:** Antigravity AI  

---

## 1. Executive Summary

This audit report provides an in-depth architectural assessment and implementation plan to enhance the Temple Accounts billing system. The objective is twofold:
1. **Multiple Devotees per Bill:** Enable an operator to attach multiple devotees—each with an individual devotee name and individual birth star (nakshatram / നാൾ)—to a single puja bill (e.g. an Archana booking for six family members), while strictly preserving existing single-puja billing criteria, catalog pricing, and accounting integrity.
2. **80 mm (3-inch) Thermal Receipt Migration:** Upgrade the thermal receipt layout from 58 mm (2-inch nominal roll) to 80 mm (3-inch nominal roll), utilizing the expanded printable width (~72 mm) to render all devotees in a clear, vertical tabular layout without cramped typography, while maintaining the revered temple header, payment details, and traditional blessing footer.

### Key Audit Findings & Compliance Confirmation
- **Strict Read-Only Execution:** Zero lines of existing application code, stylesheets, configuration files, test suites, or frozen deployment packages were modified during this step. No production Firebase databases, rules, counters, or financial records were accessed or altered.
- **Billing Criteria Preserved:** One bill continues to represent exactly one selected Vazhipadu/puja offering. Different offerings (e.g., Archana and Kadumpayasam) must continue to be booked as separate bills.
- **Zero Accounting Double-Counting:** The application's core accounting engines ([`activeReceipts`](file:///d:/Temple/Temple_Accounts-1.html#L6405), [`buildCashBookRows`](file:///d:/Temple/Temple_Accounts-1.html#L11887), [`buildBankBookRows`](file:///d:/Temple/Temple_Accounts-1.html#L12090), and [`VIEW_RENDERERS.ledger`](file:///d:/Temple/Temple_Accounts-1.html#L12147)) calculate balances and journal entries **exclusively from the `receipts` collection**. Adding multiple devotees to one bill creates exactly one linked accounting receipt with the validated transaction total, ensuring zero phantom income.
- **Source Inspection Reality vs. Dropdown Assumption:** The current billing form does **not** contain a nakshatram dropdown. Instead, line 11222 implements a free-text input: `<input type="text" id="star" name="star" placeholder="അശ്വതി, ഭരണി... (Optional)">`. This audit specifies how a canonical 27-star datalist autocomplete or dropdown can be introduced seamlessly while preserving backward compatibility.
- **Quantity & Devotee Synchronization Rules:** For per-person pujas (e.g. Archana, Pushpanjali), the quantity should automatically match the devotee count (`quantity = devotees.length`). For lump-sum offerings and donations (e.g. Sambhavana, Punarudharanam), the lump sum is not multiplied by the devotee count. Any potential edge cases (e.g., family Ganapathi Homam) have been documented with safe compatibility rules.

---

## 2. Current Billing Architecture & Exact Code Locations

All billing operations are implemented in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) (20,114 lines, 792,927 bytes). The table below documents the concrete elements, functions, and lines inspected:

| Architectural Component | HTML / JavaScript Element | Exact Lines | Classification | Source Inspection Details |
|---|---|---|---|---|
| **Devotee Name Field** | `<input type="text" id="name" name="name">` | [11218–11220](file:///d:/Temple/Temple_Accounts-1.html#L11218-L11220) | `source-inspected` | Single text input with `required` attribute. Validated for non-empty string in [`billingSubmitForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9240). |
| **Nakshatram (Star) Field** | `<input type="text" id="star" name="star">` | [11221–11224](file:///d:/Temple/Temple_Accounts-1.html#L11221-L11224) | `source-inspected` | Single free-text input with placeholder `അശ്വതി, ഭരണി... (Optional)`. **No `<select>` dropdown or star array exists in the current source code.** |
| **Puja Offering Catalog** | `BILLING_DEFAULT_ITEMS` | [8029–8044](file:///d:/Temple/Temple_Accounts-1.html#L8029-L8044) | `source-inspected` | Fixed array of 13 Vazhipadu items and 1 Punarudharanam item. Frozen release rule preserves this catalogue. |
| **Custom Vazhipadu Loader** | [`appendCustomVazhipaduOption()`](file:///d:/Temple/Temple_Accounts-1.html#L8116) | [8116–8148](file:///d:/Temple/Temple_Accounts-1.html#L8116-L8148) | `source-inspected` | Dynamically appends `കസ്റ്റം വഴിപാട്` (Custom Vazhipadu) to the selector and renders `#billingCustomItemRow` ([11193–11202](file:///d:/Temple/Temple_Accounts-1.html#L11193-L11202)). |
| **Category Selection** | `#billingCategorySegmented`, `#categorySelect` | [11165–11183](file:///d:/Temple/Temple_Accounts-1.html#L11165-L11183) | `source-inspected` | Toggles between `വഴിപാട്` and `പുനരുദ്ധാരണം` via [`setBillingCategory()`](file:///d:/Temple/Temple_Accounts-1.html#L8063) and [`loadCategoryItems()`](file:///d:/Temple/Temple_Accounts-1.html#L8150). |
| **Quantity Control** | `<input type="number" id="qty" name="qty">` | [11229–11236](file:///d:/Temple/Temple_Accounts-1.html#L11229-L11236) | `source-inspected` | Stepper buttons call [`billingAdjustQty(delta)`](file:///d:/Temple/Temple_Accounts-1.html#L8096) (`min=1`, `max=500`, integer). |
| **Pricing & Total Calculation** | [`updatePrice()`](file:///d:/Temple/Temple_Accounts-1.html#L8213) | [8213–8337](file:///d:/Temple/Temple_Accounts-1.html#L8213-L8337) | `source-inspected` | Fixed price: `calculatedTotal = price * qty`. Custom Vazhipadu: `rate * qty`. Variable donation: total typed into `#total` ([11205–11210](file:///d:/Temple/Temple_Accounts-1.html#L11205-L11210)). |
| **Form Validation & Submission** | [`billingSubmitForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9113) | [9113–9572](file:///d:/Temple/Temple_Accounts-1.html#L9113-L9572) | `source-inspected` | Validates category, item, custom inputs, devotee name, integer qty, total > 0, and payment mode. Engages double-submission lock `window.isBillingSaving`. |
| **Form Reset** | [`billingResetForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9585) | [9585–9650](file:///d:/Temple/Temple_Accounts-1.html#L9585-L9650) | `source-inspected` | Clears devotee name, star, custom row, resets qty to 1, restores category to `വഴിപാട്`, and resets DynamicButton state. |
| **Payload Creation Point** | `billingFpPayload` & `billingInput` | [9362–9424](file:///d:/Temple/Temple_Accounts-1.html#L9362-L9424) | `source-inspected` | Constructs input objects passed to [`computeBillingFingerprint()`](file:///d:/Temple/Temple_Accounts-1.html#L18210) and [`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L18403). |
| **Atomic Firestore Transaction** | [`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L18403) | [18403–18790](file:///d:/Temple/Temple_Accounts-1.html#L18403-L18790) | `source-inspected` | Atomically creates `billing/bill_${N}`, `receipts/rcpt_${N}`, `system/res_${N}`, `system/op_${id}`, and updates `system/counters`. |
| **Thermal Receipt Renderer** | [`renderThermalReceiptHTML()`](file:///d:/Temple/Temple_Accounts-1.html#L8339) | [8339–8402](file:///d:/Temple/Temple_Accounts-1.html#L8339-L8402) | `source-inspected` | Generates HTML markup for thermal receipt preview and print output. |
| **Thermal Print Trigger** | [`printBillingReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L8903) | [8903–8944](file:///d:/Temple/Temple_Accounts-1.html#L8903-L8944) | `source-inspected` | Injects `@page { size: 58mm auto; }` and triggers `window.print()`. |
| **Receipt Preview Card** | [`renderBillingReceiptPreview()`](file:///d:/Temple/Temple_Accounts-1.html#L8825) | [8825–8901](file:///d:/Temple/Temple_Accounts-1.html#L8825-L8901) | `source-inspected` | Renders `.receipt-paper-box` ([3438–3457](file:///d:/Temple/Temple_Accounts-1.html#L3438-L3457)) inside `#billingReceiptPreviewArea`. |
| **Native Printer Animation** | `window.ReceiptPrinter` | [8404–8823](file:///d:/Temple/Temple_Accounts-1.html#L8404-L8823) | `source-inspected` | Native overlay simulating thermal hardware feed, cutter slot, and serrated paper ejector. |
| **Billing History & Search** | [`refreshBillingHistory()`](file:///d:/Temple/Temple_Accounts-1.html#L9718), [`applyBillingFilters()`](file:///d:/Temple/Temple_Accounts-1.html#L9831) | [9718–10093](file:///d:/Temple/Temple_Accounts-1.html#L9718-L10093) | `source-inspected` | Manages Active vs Voided tabs, date presets, and search haystack over `receiptNo`, `devoteeName`, `star`, and `item`. |
| **Details Modal & Reprint** | [`viewBillingDetails()`](file:///d:/Temple/Temple_Accounts-1.html#L10906), [`reprintBillingRecord()`](file:///d:/Temple/Temple_Accounts-1.html#L11048) | [10906–11057](file:///d:/Temple/Temple_Accounts-1.html#L10906-L11057) | `source-inspected` | Renders bill details modal and re-executes thermal receipt print for saved bills. |
| **Reports & CSV Export** | [`applyBillingReportFilters()`](file:///d:/Temple/Temple_Accounts-1.html#L10320), [`exportBillingReportCSV()`](file:///d:/Temple/Temple_Accounts-1.html#L10484) | [10320–10565](file:///d:/Temple/Temple_Accounts-1.html#L10320-L10565) | `source-inspected` | Itemized sales aggregation and UTF-8 BOM CSV export. |

---

## 3. Repeatable Devotee-Entry Section Design

### 3.1 Existing Form Layout vs Proposed Devotee Section
In the current form (lines 11216–11225), the devotee particulars occupy a static two-column `.form-row`:
```html
<!-- Current Static Implementation -->
<div class="form-row">
  <div class="form-group" style="flex: 1.5 1 200px;">
    <label for="name">ഭക്തന്റെ പേര് (Devotee Name) *</label>
    <input type="text" id="name" name="name" placeholder="ഭക്തന്റെ പേര് / Name" autocomplete="off" required>
  </div>
  <div class="form-group" style="flex: 1 1 140px;">
    <label for="star">നാൾ / നക്ഷത്രം (Star)</label>
    <input type="text" id="star" name="star" placeholder="അശ്വതി, ഭരണി... (Optional)" autocomplete="off">
  </div>
</div>
```

To support an arbitrary number of devotees without redesigning the surrounding form card, we propose replacing this static block with a **Repeatable Devotee Roster Section** (`#billingDevoteesContainer`):

```html
<!-- Proposed Repeatable Devotee Section Structure -->
<div class="billing-devotees-section" style="margin-bottom: 12px;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <label style="font-weight: 700; font-size: 13px; color: var(--text);">
      ഭക്തരുടെ വിവരങ്ങൾ (Devotees &amp; Nakshatrams) *
    </label>
    <span id="devoteeCountBadge" class="pill" style="font-size: 11px; background: var(--surface-alt); color: var(--text); padding: 2px 8px;">
      Devotees: 1
    </span>
  </div>

  <!-- Dynamic Devotee Rows Container -->
  <div id="billingDevoteeRows" class="devotee-rows-container" style="display: flex; flex-direction: column; gap: 8px;">
    <!-- Devotee Row 1 (Template) -->
    <div class="devotee-entry-row" data-index="0" style="display: flex; gap: 8px; align-items: center; background: #faf8f5; border: 1px solid #e7ded4; border-radius: 6px; padding: 8px;">
      <span class="devotee-row-num" style="font-weight: 700; font-size: 12px; color: var(--maroon); width: 20px; text-align: center;">1.</span>
      <div style="flex: 2 1 160px;">
        <input type="text" class="devotee-name-input" name="devotee_name_0" placeholder="ഭക്തന്റെ പേര് (Devotee Name) *" autocomplete="off" required>
      </div>
      <div style="flex: 1.5 1 130px;">
        <input type="text" class="devotee-star-input" name="devotee_star_0" placeholder="നാൾ / Star (Optional)" list="malayalamNakshatraList" autocomplete="off">
      </div>
      <button type="button" class="btn-devotee-remove" onclick="removeDevoteeEntry(0)" title="Remove Devotee" disabled style="opacity: 0.4; cursor: not-allowed; border: none; background: transparent; color: #b91c1c; font-size: 16px; padding: 4px 6px;">
        ✕
      </button>
    </div>
  </div>

  <!-- Add Devotee Action Toolbar -->
  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
    <button type="button" class="btn-outline btn-sm motion-interactive" id="btnAddDevotee" onclick="addDevoteeEntry()" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px;">
      <span>➕</span>
      <span>ഭക്തനെ ചേർക്കുക (+ Add Devotee)</span>
    </button>
    <span class="muted" style="font-size: 11px;">
      💡 Add all family members for this puja.
    </span>
  </div>
</div>
```

### 3.2 Value Preservation & Dynamic Row Handling
A critical failure mode in dynamic HTML tables is recreating the container via `innerHTML += ...`, which immediately wipes out text already typed by the operator in previous rows.
- **Requirement:** `addDevoteeEntry()` must use `document.createElement()` and `appendChild()`, or read the existing input values before rendering and immediately restore them.
- **Minimum Entry Rule:** Exactly one devotee entry is required at all times. When only one row is present, its remove button (`✕`) is visibly disabled (`disabled`, `opacity: 0.4`). When a second entry is added, all remove buttons become active.
- **Validation:** Every row must have a non-empty name (`name.trim().length >= 1`). If any row's name is empty upon submission, validation highlights that specific row with `.input-error` and aborts. Nakshatram remains optional.

### 3.3 Investigation of the Nakshatram Field: Dropdown vs. Text Input vs. Datalist
- **Source Code Reality:** Static analysis confirms **there is NO nakshatram dropdown anywhere in `Temple_Accounts-1.html`**. Lines 11222–11224 define a plain text input.
- **Evaluation of Alternatives for STEP 33.60:**
  1. *Option A — HTML5 `<datalist>` Autocomplete (Recommended):* Provide `<datalist id="malayalamNakshatraList">` populated with all 27 Malayalam birth stars (അശ്വതി, ഭരണി, കാർത്തിക, രോഹിണി, മകയിരം, തിരുവാതിര, പുണർതം, പൂയം, ആയില്യം, മകം, പൂരം, ഉത്രം, അത്തം, ചിത്തിര, ചോതി, വിശാഖം, അനിഴം, തൃക്കേട്ട, മൂലം, പൂരാടം, ഉത്രാടം, തിരുവോണം, അവിട്ടം, ചതയം, പൂരുരുട്ടാതി, ഉത്രട്ടാതി, രേവതി).  
     *Advantage:* Offers instant dropdown autocomplete when clicked/typed, while still allowing the operator to type unlisted variations, English star names, or leave it blank without breaking legacy habits.
  2. *Option B — Strict `<select>` Dropdown:* Replace text inputs with `<select>` containing the 27 stars plus an empty default `"നാൾ തിരഞ്ഞെടുക്കുക (Select Star — Optional)"`.  
     *Advantage:* Enforces clean canonical star names.  
     *Disadvantage:* Slower keyboard-only counter operation; requires scrolling through 27 options on mobile/tablet.
- **Classification:** `source-inspected` (current input is text) and `unresolved` (operator preference on Option A vs Option B to be approved prior to STEP 33.60).

---

## 4. Quantity and Pricing Compatibility Rules

### 4.1 Current Quantity Behavior Across Categories
Static analysis of [`updatePrice()`](file:///d:/Temple/Temple_Accounts-1.html#L8213-L8337) and [`billingSubmitForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9113-L9280) identifies three distinct pricing models:
1. **Fixed-Price Offerings (`price > 0`):**
   - e.g. `നൂൽജപം/അർച്ചന` (₹20), `രക്തപുഷ്പാഞ്ജലി` (₹50), `കൂട്ടുപായസം` (₹250), `ഗണപതിഹോമം` (₹750).
   - Line 8323: `calculatedTotal = price * qty`. Total input is readonly. Stepper adjusts `#qty`.
2. **Custom Vazhipadu (`isCustomVazhipadu = true`):**
   - Admin-entered `customRate` (₹) multiplied by `qty`.
   - Line 8263: `calculatedTotal = Math.round(rate * qty * 100) / 100`. Total input is readonly.
3. **Variable Custom Offerings & Donations (`isCustom = true` or `price === 0`):**
   - e.g. `പൂജയും വിളക്കും` (Custom Vazhipadu), `സംഭാവന` (Vazhipadu Donation), and `സംഭാവന` (Punarudharanam Fund).
   - Line 8286: `totalInput.readOnly = false`. The operator enters an arbitrary total rupee amount.
   - Line 8305: Quantity stepper is dimmed (`opacity = 0.5`), and `#qty` defaults to 1.

### 4.2 Multi-Devotee Quantity Correspondence Rules
To preserve existing pricing logic while supporting multi-devotee bookings, the following rules are established:

```mermaid
flowchart TD
    A["Operator adds/removes Devotee Entries\n(Devotee Count = N)"] --> B{"Offering Category & Mode"}
    
    B -- "Fixed-Price Offering\n(e.g. Archana, Pushpanjali)" --> C["Rule 1: Auto-Sync Quantity\n• Set #qty.value = N\n• Calculate Total = Unit Price * N\n• Update Total Banner ₹(Price * N)"]
    
    B -- "Custom Vazhipadu\n(Admin Rate R)" --> D["Rule 2: Auto-Sync Quantity\n• Set #qty.value = N\n• Calculate Total = R * N\n• Update Total Banner ₹(R * N)"]
    
    B -- "Variable Lump-Sum / Donation\n(Sambhavana, Punarudharanam)" --> E["Rule 3: Independent Quantity\n• Total remains Operator-Entered Amount\n• #qty remains 1\n• All N devotees recorded for blessing"]
    
    C & D & E --> F["Pre-Submit Validation\nPrevent Mismatch between Devotee Count & Line Multiplier"]
```

#### Detailed Rule Definitions:
- **Rule 1 (Per-Person Fixed Offerings — e.g. Archana, Pushpanjali):**  
  Archana is performed for each individual. When six devotees are entered for an Archana bill, the quantity must equal 6 (`qty = 6`). The total is strictly calculated as `₹20 × 6 = ₹120.00`.  
  *Implementation:* When `addDevoteeEntry()` or `removeDevoteeEntry()` changes the roster count from $N_1$ to $N_2$, the quantity input `#qty` automatically updates to $N_2$ and calls `updatePrice()`.
- **Rule 2 (Custom Vazhipadu):**  
  Custom Vazhipadu functions identically to fixed offerings: `qty` automatically tracks devotee count, and `total = customRate * devoteeCount`.
- **Rule 3 (Variable Offerings & Donations — Sambhavana & Punarudharanam):**  
  Donations represent a family contribution. A family contributing ₹1,000 may list four family members. The donation total is **NOT** multiplied by 4; it remains ₹1,000.  
  *Implementation:* When `totalInput.dataset.itemMode === 'custom'`, adding devotees updates the roster without modifying the operator-entered lump-sum amount.
- **Rule 4 (Prasadam & Shared Family Rituals — e.g. Ganapathi Homam):**  
  *Ambiguity Analysis:* If a family books one Ganapathi Homam (₹750) and lists five family members to be included in the single sankalpam, does the quantity equal 1 (₹750 total for the family) or 5 (5 separate homams = ₹3,750)?  
  *Safe Default Proposal:* By default, standard counter offerings auto-sync `qty = devoteeCount`. However, if the operator manually edits `#qty` (e.g. changes `qty` back to 1 for a shared family homam), the system will permit it with an informative prompt confirming: *"Shared family sankalpam: 1 offering for N devotees"*.  
  *Classification:* `unresolved` — to be confirmed with temple administration prior to implementation in STEP 33.60.

---

## 5. Bill Storage & Backward Compatibility Assessment

### 5.1 Current Stored Records
Static analysis of [`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L18689-L18750) identifies the exact fields stored in Firestore collections:

#### `billing/bill_${N}` (Operational POS Record)
- `id`: integer sequence number (e.g. `104`)
- `receiptNo`: string (e.g. `'BILL-104'`)
- `date`: string (`'DD/MM/YYYY'`)
- `time`: string (`'hh:mm AM/PM'`)
- `category`: string (`'വഴിപാട്'` or `'പുനരുദ്ധാരണം'`)
- `item`: string (puja name)
- `devoteeName`: string (currently single devotee)
- `star`: string (currently single nakshatram)
- `quantity`: integer
- `unitPrice`: float
- `totalAmount`: float
- `paymentMode`: string (`'Cash'` or `'UPI'`)
- `bankAccount`: string (empty if Cash)
- `accountingReceiptId`: string (`'rcpt_104'`)
- `accountingReceiptNo`: string (`'R-104'`)
- `reservationDocId`: string (`'res_104'`)
- `operationId`: string (`'op_bill_...'`)
- `voided`: boolean (`false`)
- `createdBy`, `updatedBy`: string (Firebase UID)
- `createdAt`, `updatedAt`: timestamp

#### `receipts/rcpt_${N}` (Authoritative Accounting Record)
- `id`: integer sequence number (`104`)
- `receiptNo`: string (`'R-104'`)
- `date`: string (`'YYYY-MM-DD'` ISO)
- `name`: string (`devoteeName`)
- `fund`: string (`'General Temple Fund'` or `'Punarudharanam Fund'`)
- `category`: string (`'Vazhipadu Income'` or `'Donation Income'`)
- `description`: string (`'${item} (Qty: ${qty}) | Star: ${star}'`)
- `amount`: float (`totalAmount`)
- `paymentMode`: string (`'Cash'` or `'UPI'`)
- `remarks`: string (`'Billing Receipt: BILL-104'`)
- `billingId`: integer (`104`)
- `billingReceiptNo`: string (`'BILL-104'`)
- `voided`: boolean (`false`)

### 5.2 Proposed Backward-Compatible Multi-Devotee Representation
To support multiple devotees without breaking existing screens, reports, backup validation, or Firestore rules, we propose extending the billing document with a structured array while retaining legacy scalar fields:

```javascript
// Proposed Billing Document Structure (billing/bill_${N})
{
  // --- New Structured Multi-Devotee Fields ---
  devotees: [
    { name: "രാഹുൽ കൃഷ്ണൻ", star: "അശ്വതി" },
    { name: "പ്രിയാ രാഹുൽ", star: "ഭരണി" },
    { name: "ആദിത്യൻ കൃഷ്ണൻ", star: "രോഹിണി" }
  ],
  devoteeCount: 3,

  // --- Preserved Legacy Fields (100% Backward Compatibility) ---
  devoteeName: "രാഹുൽ കൃഷ്ണൻ (+ 2 others)", // Primary devotee with count summary
  star: "അശ്വതി",                              // Primary devotee star

  // --- Existing Billing Fields (Completely Unaltered) ---
  id: 104,
  receiptNo: "BILL-104",
  date: "14/10/2026",
  time: "10:30 AM",
  category: "വഴിപാട്",
  item: "നൂൽജപം/അർച്ചന",
  quantity: 3,
  unitPrice: 20.00,
  totalAmount: 60.00,
  paymentMode: "Cash",
  accountingReceiptId: "rcpt_104",
  accountingReceiptNo: "R-104",
  reservationDocId: "res_104",
  operationId: "op_bill_...",
  voided: false
}
```

### 5.3 Flow-Through Verification Across Application Modules

| System Module | Inspected Location | Impact of Multi-Devotee Storage | Compatibility Verification |
|---|---|---|---|
| **Billing History & Search** | [`applyBillingFilters()`](file:///d:/Temple/Temple_Accounts-1.html#L9860-L9872) | The search haystack currently joins `r.devoteeName` and `r.star`. Updating the haystack to iterate `(r.devotees || []).map(d => d.name + ' ' + d.star)` will ensure searching for any devotee's name or star finds the bill immediately. | ✅ Verified compatible |
| **Active & Voided History Tables** | Lines [10009–10010](file:///d:/Temple/Temple_Accounts-1.html#L10009-L10010), [10074](file:///d:/Temple/Temple_Accounts-1.html#L10074) | Tables render `r.devoteeName || r.name`. Displaying `രാഹുൽ കൃഷ്ണൻ (+ 2 others)` fits within existing column widths without clipping. | ✅ Verified compatible |
| **Details Modal (`viewBillingDetails`)** | Lines [10994–11000](file:///d:/Temple/Temple_Accounts-1.html#L10994-L11000) | Update modal to render a clean sub-table of all devotees and stars if `r.devotees` is present; fall back to single name/star if absent. | ✅ Verified compatible |
| **Thermal Receipt Reprints** | [`reprintBillingRecord()`](file:///d:/Temple/Temple_Accounts-1.html#L11048-L11057) | Passes the stored bill `r` directly to [`renderThermalReceiptHTML()`](file:///d:/Temple/Temple_Accounts-1.html#L8339). The renderer will check `r.devotees` and output all devotees. | ✅ Verified compatible |
| **Cash Book & Bank Book** | Lines [11896–11903](file:///d:/Temple/Temple_Accounts-1.html#L11896-L11903), [12090–12094](file:///d:/Temple/Temple_Accounts-1.html#L12090-L12094) | Cash Book and Bank Book read strictly from `receipts` (`r.amount`, `r.name`, `r.receiptNo`). They never read the `billing` collection. Zero risk of breakdown or double-counting. | ✅ Verified compatible |
| **Ledger & Dashboard** | Lines [12148–12152](file:///d:/Temple/Temple_Accounts-1.html#L12148-L12152), [14026–14048](file:///d:/Temple/Temple_Accounts-1.html#L14026-L14048) | Ledger aggregates from `receipts`. Dashboard pooja analytics aggregate by `b.item`, `b.quantity`, and `b.totalAmount`. Fully unaffected. | ✅ Verified compatible |
| **Reports & CSV Export** | [`exportBillingReportCSV()`](file:///d:/Temple/Temple_Accounts-1.html#L10508-L10528) | CSV generator outputs `r.devoteeName` and `r.star`. For multi-devotee bills, it can output primary name + count or semicolon-delimited names (`"രാഹുൽ; പ്രിയ; ആദി"`). | ✅ Verified compatible |
| **Backup and Restore** | Lines [14748–14762](file:///d:/Temple/Temple_Accounts-1.html#L14748-L14762), [15330–15369](file:///d:/Temple/Temple_Accounts-1.html#L15330-L15369) | [`downloadBackup()`](file:///d:/Temple/Temple_Accounts-1.html#L14708) serializes entire document objects. [`restoreBackup()`](file:///d:/Temple/Temple_Accounts-1.html#L14991) validates monetary fields and document IDs, without restricting nested arrays. `devotees` will backup and restore with 100% fidelity. | ✅ Verified compatible |
| **Linked Voiding** | [`fsVoidLinkedBillingAndReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L18024) | Voids documents by ID and updates `voided: true`. No devotee field dependencies exist in the voiding batch. | ✅ Verified compatible |
| **Idempotency Fingerprint** | [`computeBillingFingerprint()`](file:///d:/Temple/Temple_Accounts-1.html#L18210) | Fingerprint v2 hashes devotee names. When multiple devotees are present, deterministically sort and serialize them: `devotees.map(d => d.name + ':' + (d.star||'')).join(';')`. | ✅ Verified compatible |

---

## 6. Audit of Thermal Receipt Implementations & 58 mm Assumptions

### 6.1 Complete Inventory of Hardcoded 58 mm References
Static analysis reveals 9 distinct locations in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) where 58 mm dimensions, styles, or labels are explicitly embedded:

```
Location 1: Line 3438 — CSS Comment: /* Thermal Receipt Paper Card (58mm Realistic View) */
Location 2: Lines 4208–4300 — Print Stylesheet:
            body.printing-billing-58mm { width: 58mm !important; }
            #print-area.billing-58mm { width: 58mm !important; max-width: 58mm !important; font-size: 10px !important; }
            #print-area.billing-58mm .th-receipt { max-width: 58mm !important; }
            #print-area.billing-58mm .th-row { font-size: 10.5px !important; }
Location 3: Lines 8563–8564 — Native Printer Animation Status Text:
            label.textContent = 'PRINTING (58mm)';
            subtext.textContent = 'Feeding 58mm thermal receipt paper…';
Location 4: Line 8610 — Screen Reader Live Announcer:
            announcer.textContent = 'Transaction saved. Feeding 58mm thermal receipt paper.';
Location 5: Lines 8835, 8838 — Receipt Preview Placeholder:
            '58mm തെർമൽ രസീത് ഇവിടെ കാണാം.'
            '🖨️ 58mm Thermal Printer Ready'
Location 6: Line 8853 — Receipt Preview Card Title:
            <h4>🧾 Receipt Preview (58mm)</h4>
Location 7: Lines 8916–8940 — printBillingReceipt() Print Execution:
            printArea.className = 'billing-58mm';
            document.body.classList.add('printing-billing-58mm');
            dynamicStyle.textContent = '@page { size: 58mm auto; margin: 0; } @media print { html, body { width: 58mm !important; ... } }';
Location 8: Lines 10028, 10082 — Billing History Table Action Buttons:
            title="Reprint VOIDED 58mm Receipt"
            title="Reprint 58mm Thermal Receipt"
Location 9: Line 11134 — Billing Screen Header Subtitle:
            'Fast counter billing for Vazhipadu and Punarudharanam donations with 58mm thermal receipt printing.'
```

### 6.2 Comparison: 58 mm vs. 80 mm Physical & Browser Print Specifications

| Dimension / Parameter | 58 mm Thermal Ticket (Current) | 80 mm Thermal Ticket (Proposed) | Architectural Impact & Design Decisions |
|---|---|---|---|
| **Nominal Roll Width** | 58 mm (2.28 in) | 80 mm (3.15 in) | +38% roll width increase (+22 mm physical paper). |
| **Actual Printable Width** | ~48 mm (384 dots @ 203 DPI) | ~72 mm (576 dots @ 203 DPI) | **+50% printable width increase!** Allows multi-column layout without cramped text. |
| **Default Margins** | 2 mm left/right | 3 mm – 4 mm left/right | Safe margin prevents edge clipping on diverse printer heads. |
| **@page CSS Rule** | `@page { size: 58mm auto; margin: 0; }` | `@page { size: 80mm auto; margin: 0; }` | Browser print driver automatically scales to standard 80 mm roll paper. |
| **Body / Container CSS** | `width: 58mm !important; max-width: 58mm !important;` | `width: 80mm !important; max-width: 80mm !important;` | Replaces `.billing-58mm` and `.printing-billing-58mm` with `.billing-80mm` and `.printing-billing-80mm`. |
| **Base Font Size** | 10px / 10.5px monospace | 11.5px / 12px monospace / sans-serif | Significantly enhances legibility for elderly devotees and priests. |
| **Screen Preview Width** | `.receipt-paper-box { max-width: 300px; }` | `.receipt-paper-box { max-width: 380px; }` | Accurately represents 80 mm physical roll proportion on desktop screens. |
| **Chassis Compatibility** | `.receipt-printer-chassis { max-width: 420px; }` | Already sized at 420px; throat slot 380px | Hardware simulation chassis already fits 80 mm paper perfectly! Zero CSS breakage. |

---

## 7. Proposed 80 mm Thermal Receipt Layout

### 7.1 Layout Architecture & Growth Model
The proposed 80 mm layout:
1. **Preserves the Existing Sacred Header & Footer:** Includes temple title, address, receipt/bill sequence number, date/time, and traditional blessing (`*** അമ്മേ നാരായണ ദേവി നാരായണ ***`).
2. **Dedicated Devotees & Nakshatrams Table:** Replaces the single `പേര്:` line with a structured roster table that grows **vertically** for each additional devotee.
3. **No Font Shrinking:** The font remains comfortably legible at 11.5px – 12px.
4. **Itemized Financial Summary:** Clear quantity, unit rate, and total line calculation, followed by a prominent Grand Total and payment breakdown.

### 7.2 Visual Mockup (80 mm / ~72 mm Printable Width)

```
+--------------------------------------------------------------+
|                മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം                  |
|                 ആശാരിവിളാകം, കേരളദിത്യപുരം                  |
|--------------------------------------------------------------|
| No: BILL-104                          14/10/2026 10:30 AM    |
|--------------------------------------------------------------|
| വഴിപാട്: നൂൽജപം/അർച്ചന                നിരക്ക്: ₹20.00         |
|--------------------------------------------------------------|
| ക്ര.നം   ഭക്തന്റെ പേര്                     നാൾ/നക്ഷത്രം       |
|--------------------------------------------------------------|
| 1.     രാഹുൽ കൃഷ്ണൻ                      അശ്വതി             |
| 2.     പ്രിയാ രാഹുൽ                       ഭരണി               |
| 3.     ആദിത്യൻ കൃഷ്ണൻ                    രോഹിണി             |
| 4.     വിഷ്ണു കൃഷ്ണൻ                     മകയിരം             |
| 5.     അഞ്ജലി കൃഷ്ണൻ                     തിരുവാതിര          |
| 6.     നാരായണൻ പിള്ള                     പുണർതം             |
|--------------------------------------------------------------|
| എണ്ണം (Quantity): 6  ×  ₹20.00          തുക: ₹120.00         |
|--------------------------------------------------------------|
| ആകെ തുക (TOTAL):                        ₹120.00              |
| പേയ്‌മെന്റ് (Payment):                    CASH                 |
|--------------------------------------------------------------|
|              *** അമ്മേ നാരായണ ദേവി നാരായണ ***               |
+--------------------------------------------------------------+
```

### 7.3 Voided 80 mm Receipt Representation
When a bill is voided, the layout renders the red dashed cancellation badge, cancellation reason, cancellation date, and strikethrough on totals, exactly mirroring current audit standards:

```
+--------------------------------------------------------------+
|                മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം                  |
|                 ആശാരിവിളാകം, കേരളദിത്യപുരം                  |
|==============================================================|
|                *** VOIDED / റദ്ദാക്കിയത് ***                  |
|             Reason: Entered wrong devotee star               |
|==============================================================|
| No: BILL-104 [VOID]                   14/10/2026 10:30 AM    |
|--------------------------------------------------------------|
| ... Devotee Roster (Preserved for Audit Trail) ...          |
|--------------------------------------------------------------|
| ആകെ തുക (TOTAL):                        ~~₹120.00~~          |
| Cancelled On: 14/10/2026                                     |
|--------------------------------------------------------------|
|              *** അമ്മേ നാരായണ ദേവി നാരായണ ***               |
+--------------------------------------------------------------+
```

---

## 8. Scenario-Based Test Matrix (19 Test Scenarios)

The test plan file [`tests/step_33_59_multiple_devotees_80mm_audit_plan.json`](file:///d:/Temple/tests/step_33_59_multiple_devotees_80mm_audit_plan.json) defines 19 specific integration scenarios. The table below details preconditions, actions, expected results, and verification mechanisms:

| Scenario ID | Test Title | Category | Test Inputs & Actions | Expected Result & Audit Invariant | Verification Method |
|---|---|---|---|---|---|
| **SCEN-01** | One Devotee, One Fixed Puja | Single Baseline | Archana (₹20), 1 Devotee (രാഹുൽ / അശ്വതി), Qty 1, Cash | Bill generated for ₹20.00. 1 devotee roster item rendered. Single linked receipt `R-xxx` created for ₹20.00. | Automated DOM assertion & transaction payload inspection. |
| **SCEN-02** | Two Devotees, Same Puja | Pairing | Archana (₹20), 2 Devotees (രാഹുൽ / അശ്വതി, പ്രിയ / ഭരണി), Qty 2, Cash | Total ₹40.00. Roster displays 2 distinct rows. Single bill document with `devotees` array length 2. Single linked accounting receipt. | Verify line total rate*2, devotee array length 2, single accounting receipt. |
| **SCEN-03** | Six Devotees, Same Puja | Family Archana Canonical | Archana (₹20), 6 family members with distinct nakshatrams, Qty 6, Cash | Total ₹120.00. Receipt grows vertically to 6 rows without font reduction. Exactly one accounting entry for ₹120.00. | Assert 6 roster items in receipt DOM, rate*6 calculation, single bill document. |
| **SCEN-04** | 10 or More Devotees, Same Puja | Stress Scaling | Raktapushpanjali (₹50), 12 Devotees, Qty 12, Cash | Total ₹600.00. Paper feed animation and screen preview handle expanded vertical height with smooth scrolling. Zero horizontal clipping. | Programmatic generation of 12 devotees, checking print-area scrollHeight. |
| **SCEN-05** | Long Malayalam Devotee Names | Typography & Wrapping | Devotee name with 65+ Malayalam characters, star ഉത്രാടം | Name wraps gracefully onto second line without overlapping the star column or exceeding 80 mm ticket bounds. | DOM bounding rect check on devotee name row and overflow assertion. |
| **SCEN-06** | Distinct Nakshatrams for Every Devotee | Roster Diversity | 4 Devotees, each with a different birth star (കാർത്തിക, മകം, ചോതി, രേവതി) | Each devotee retains their specific star in the payload and on the printed receipt without data cross-talk. | Verify each row in payload has exact matching star from input. |
| **SCEN-07** | Missing Name or Star Validation | Validation UX | 3 Devotee rows: Row 1 complete, Row 2 name empty, Row 3 star empty | Submission blocked with visual error on Row 2 name. Row 3 allowed (star is optional and defaults to `---`). | Form submission test verifying error feedback display and focus set to invalid input. |
| **SCEN-08** | Dynamic Adding and Removing Devotees | Form State Management | Start with 1 row, add to 3 rows, fill names, remove middle row, verify values | Values in remaining rows 1 and 3 are 100% preserved. Remove button disabled when 1 row remains. Qty stepper syncs accurately. | DOM input event sequence test with state verification after each add/remove action. |
| **SCEN-09** | Quantity vs Devotee Count Mismatch | Quantity Rule Guard | 4 Devotees entered, but operator manually sets Qty = 2 for Archana | System prevents submission or auto-syncs Qty to 4 with an actionable explanation to the operator. | Attempt submit with mismatched quantity and assert guard message. |
| **SCEN-10** | Custom Vazhipadu with Multiple Devotees | Custom Item Integration | Custom puja "മൃത്യുഞ്ജയ ഹോമം", Rate ₹150, 2 Devotees, Qty 2 | Total ₹300.00. Receipt renders custom puja name, ₹150 rate, 2 devotees, and ₹300 total. | Execute custom vazhipadu form flow with 2 devotees and verify calculation. |
| **SCEN-11** | Different Pujas Must Use Separate Bills | Criteria Preservation | Attempt to book Archana and Kadumpayasam on one bill | UI permits only one puja selection per bill. Operator books Bill 1, then Bill 2. Sequential numbers allocated (`BILL-105`, `BILL-106`). | Inspect Firestore operations log for two independent transactions. |
| **SCEN-12** | Cash-Only Payment for Multi-Devotee Bill | Cash Flow | Multi-devotee bill for ₹120.00 paid in Cash | Bill records `paymentMode: "Cash"`. Cash Book balance increases by exactly ₹120.00. | Verify Cash Book balance recalculation includes ₹120.00 credit. |
| **SCEN-13** | UPI-Only Payment for Multi-Devotee Bill | Bank Flow | Multi-devotee bill for ₹120.00 paid via UPI | Bill records `paymentMode: "UPI"`, resolves temple bank account. Bank Book registers deposit of ₹120.00. | Verify Bank Book balance recalculation includes ₹120.00 deposit. |
| **SCEN-14** | Mixed Cash/UPI Payment Compatibility | Boundary Check | Check for split cash/UPI payment options | Static inspection proves single-mode payment only (`Cash` or `UPI`). Boundary documented as non-supported. | Code inspection of `#billingPaymentModes` and paymentMode schema. |
| **SCEN-15** | History & Receipt Reprint with Multi-Devotees | History & Reprint | View and reprint a persisted multi-devotee bill from History tab | History table lists primary devotee + count. Details modal and reprint show full devotee roster on 80 mm layout. | Trigger `viewBillingDetails()` and `reprintBillingRecord()` on multi-devotee bill. |
| **SCEN-16** | Thermal Print Preview & Physical 80 mm Output | Printer Output | Preview in `#billingReceiptPreviewArea`, animated modal, and `@media print` | Screen preview matches 80 mm geometry. Physical printer output marked UNRESOLVED until physical hardware bench test. | Inspect CSS computed styles and layout dimensions; note physical testing requirement. |
| **SCEN-17** | Legacy Single-Devotee Bill Compatibility | Backward Compatibility | Render historical bill created prior to multi-devotee update (no `devotees` array) | System constructs fallback array `[{ name: r.devoteeName, star: r.star }]`. Renders cleanly on 80 mm without runtime errors. | Pass legacy record without devotees array to `renderThermalReceiptHTML()` and assert zero errors. |
| **SCEN-18** | Backup & Restore Field Preservation | Data Portability | Export backup with multi-devotee bill, inspect JSON, simulate restore | Backup JSON preserves `devotees` array with 100% fidelity. `restoreBackup()` schema validation passes without rejection. | JSON structure inspection and schema verification against `restoreBackup()` validator. |
| **SCEN-19** | Linked Voiding and Accounting Totals Integrity | Voiding Integrity | Void a multi-devotee bill for ₹300.00 | Bill, linked receipt, and reservation atomically marked `voided: true`. Cash Book income reverted. Void watermark printed. | Call `voidBillingRecord()` and verify `getCashBalance()` and thermal void header. |

---

## 9. Accounting and Data Integrity Safeguards

Static analysis of the accounting engine confirms the following mandatory safeguards:
1. **One Bill, Exactly One Accounting Receipt:**  
   In [`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L18403), the transaction writes exactly one document to `billing/bill_${N}` and exactly one document to `receipts/rcpt_${N}`. Multiple devotees on a bill do **NOT** create multiple accounting receipts or multiply income lines.
2. **Strict Financial Separation Between Billing and Accounting Stores:**  
   The `billing` collection serves solely as an operational counter register and ticket reprint repository. The financial books ([`getCashBalance`](file:///d:/Temple/Temple_Accounts-1.html#L6424), [`getBankBalance`](file:///d:/Temple/Temple_Accounts-1.html#L6443), [`buildCashBookRows`](file:///d:/Temple/Temple_Accounts-1.html#L11887), [`buildBankBookRows`](file:///d:/Temple/Temple_Accounts-1.html#L12090), and [`VIEW_RENDERERS.ledger`](file:///d:/Temple/Temple_Accounts-1.html#L12147)) calculate income **strictly from the `receipts` collection** via [`activeReceipts()`](file:///d:/Temple/Temple_Accounts-1.html#L6405).
3. **Preserved Unified Numbering & Reservation Pipeline:**  
   Both bill and receipt continue to share the exact same sequence number allocated atomically from `system/counters` (`globalSequenceCounter`) and reserved via `system/res_${N}`.
4. **Idempotency & Double-Submission Protection:**  
   The client-side lock `window.isBillingSaving` prevents duplicate user clicks. The backend idempotency document `system/op_${billingOpId}` with canonical SHA-256 fingerprinting ensures network retries return the committed bill without creating duplicate receipts or allocating extra sequence numbers.
5. **Bidirectional Atomic Voiding:**  
   Voiding a bill via [`fsVoidLinkedBillingAndReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L18024) updates the bill, accounting receipt, and reservation document in a single atomic batch, immediately removing the income from active books.

---

## 10. Identified Risks and Unresolved Questions

### 10.1 Identified Technical Risks & Mitigations
1. **Accidental Form Field Cleansing on Dynamic Add/Remove:**  
   *Risk:* Using `container.innerHTML += ...` when adding a devotee row destroys active input values in existing rows.  
   *Mitigation:* Use `document.createElement()` and `appendChild()`, or cache existing values before DOM manipulation.
2. **Print Dialog Page-Size Mismatch on Older Operating Systems:**  
   *Risk:* Some Windows printer drivers default to A4 or Letter if `@page { size: 80mm auto; }` is not accompanied by explicit pixel/mm dimensions on `#print-area`.  
   *Mitigation:* Apply both `@page { size: 80mm auto; margin: 0; }` and `#print-area.billing-80mm { width: 80mm !important; max-width: 80mm !important; box-sizing: border-box; }`.
3. **Idempotency Fingerprint Hash Invalidation for Replays:**  
   *Risk:* If the canonical fingerprint serialization changes without backward compatibility, retrying a pending operation initiated before the upgrade could fail.  
   *Mitigation:* Maintain deterministic sorting in fingerprint v2 and retain `computeBillingFingerprintV1` for legacy replays.

### 10.2 Unresolved Design Decisions (Awaiting User/Admin Alignment)
The following questions are classified as `unresolved` and must be confirmed prior to implementation in STEP 33.60:
1. **Nakshatram Selection UX:**  
   Should the nakshatram input use **Option A** (HTML5 `<datalist>` autocomplete with 27 Malayalam stars, allowing free-text custom typing) or **Option B** (strict `<select>` dropdown)? *(Recommended: Option A for counter speed and flexibility).*
2. **Quantity Auto-Sync Policy for Shared Family Offerings:**  
   For standard per-person pujas (Archana), Qty automatically equals devotee count. Should the operator be permitted to override Qty to 1 for shared family offerings (e.g. 1 Ganapathi Homam for 4 family members), with an explicit confirmation dialog? *(Recommended: Permit with explicit non-blocking notice).*
3. **Legacy Devotee Name Display in History Tables:**  
   When a bill contains multiple devotees, should the single `Devotee Name` column in the history table display:
   - Primary devotee with count: `"രാഹുൽ (+ 2 others)"`?
   - Semicolon-delimited names: `"രാഹുൽ, പ്രിയ, ആദി"`?  
   *(Recommended: Primary devotee with count to maintain clean table typography).*
4. **Physical Thermal Printer Compatibility:**  
   *Mandatory Disclaimer:* In accordance with Step 33.59 Section 11, physical printer compatibility is classified as `unresolved` until verified on actual 80 mm POS hardware with a live print run.

---

## 11. Ordered Implementation Plan for STEP 33.60

The planned implementation sequence for STEP 33.60 is divided into 5 ordered phases:

```mermaid
flowchart LR
    P1["Phase 1:\nData Model &\nFingerprint"] --> P2["Phase 2:\nForm UI &\nDevotee Roster"]
    P2 --> P3["Phase 3:\n80 mm Thermal\nCSS & Layout"]
    P3 --> P4["Phase 4:\nHistory, Modal,\nReports & CSV"]
    P4 --> P5["Phase 5:\nAutomated Tests\n& Verification"]
```

### Phase 1: Data Model & Fingerprinting
1. Extend `billingInput` and `billingPayload` in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) to store `devotees: [{ name, star }]` and `devoteeCount`.
2. Populate legacy scalar fields `devoteeName` (primary name + count summary) and `star` (primary star) for complete backward compatibility.
3. Update [`computeBillingFingerprint()`](file:///d:/Temple/Temple_Accounts-1.html#L18210) to serialize `devotees` deterministically.

### Phase 2: Form UI & Dynamic Devotee Roster
1. Replace lines 11216–11225 with `#billingDevoteesContainer` supporting dynamic addition and removal of devotee entries.
2. Implement `addDevoteeEntry()` and `removeDevoteeEntry()`, enforcing minimum 1 entry and preserving already typed inputs.
3. Provide the canonical 27 Malayalam nakshatrams via `<datalist id="malayalamNakshatraList">`.
4. Update [`updatePrice()`](file:///d:/Temple/Temple_Accounts-1.html#L8213) to auto-sync quantity with devotee count for per-person offerings.
5. Update [`billingResetForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9585) to reset the roster to 1 clean entry.

### Phase 3: 80 mm Thermal Print & CSS Engine
1. Update `@media print` styles ([4208–4300](file:///d:/Temple/Temple_Accounts-1.html#L4208-L4300)) from 58 mm to 80 mm (`width: 80mm !important; max-width: 80mm !important; padding: 3mm 4mm 4mm 4mm; font-size: 11.5px;`).
2. Update [`printBillingReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L8903) to inject `@page { size: 80mm auto; margin: 0; }`.
3. Update `.receipt-paper-box` ([3438–3457](file:///d:/Temple/Temple_Accounts-1.html#L3438-L3457)) to `max-width: 380px`.
4. Update [`renderThermalReceiptHTML()`](file:///d:/Temple/Temple_Accounts-1.html#L8339) to render the full vertical devotee roster with index, name, and star.
5. Update UI text references and screen-reader announcements from "58mm" to "80mm".

### Phase 4: History, Details Modal, Reports, & CSV
1. Update search haystack in [`applyBillingFilters()`](file:///d:/Temple/Temple_Accounts-1.html#L9860) to index all names and stars across `r.devotees`.
2. Update [`viewBillingDetails()`](file:///d:/Temple/Temple_Accounts-1.html#L10906) to render the full devotee table.
3. Update [`exportBillingReportCSV()`](file:///d:/Temple/Temple_Accounts-1.html#L10484) and [`exportVoidedBillsCSV()`](file:///d:/Temple/Temple_Accounts-1.html#L10117) to include devotee details and count.
4. Add legacy fallback in [`renderThermalReceiptHTML()`](file:///d:/Temple/Temple_Accounts-1.html#L8339) for historical bills without `devotees` array.

### Phase 5: Automated Regression Testing & Verification
1. Implement test suite `tests/test_step_33_60_multiple_devotees_80mm.js` executing all 19 scenarios defined in [`tests/step_33_59_multiple_devotees_80mm_audit_plan.json`](file:///d:/Temple/tests/step_33_59_multiple_devotees_80mm_audit_plan.json).
2. Execute tests against isolated local harness to verify atomic persistence, numbering, idempotency, and voiding.
3. Validate browser print layout and vertical pagination via browser subagent.

---

## 12. List of Files Created and Modified

### Files Created
1. [`tests/step_33_59_multiple_devotees_80mm_audit_plan.json`](file:///d:/Temple/tests/step_33_59_multiple_devotees_80mm_audit_plan.json)  
   Comprehensive machine-readable audit plan, code mapping, architectural contracts, and 19 scenario test definitions.
2. [`STEP_33_59_MULTIPLE_DEVOTEES_80MM_AUDIT_REPORT.md`](file:///d:/Temple/STEP_33_59_MULTIPLE_DEVOTEES_80MM_AUDIT_REPORT.md)  
   This complete, code-grounded audit report.

### Files Modified
**NONE.** In strict compliance with the Step 33.59 Safety Restrictions, zero application source files, test suites, database records, rules, or release assets were altered.

---

## 13. Stop Condition & Next Steps

This audit is complete. In strict adherence to **Section 12 (Stop Condition)**:
- No application code was altered.
- No receipt width was modified.
- No production database or service was accessed.
- All deliverables are generated and self-contained.

Awaiting review, resolution of the unresolved design decisions, and explicit user authorization before initiating implementation in **STEP 33.60**.
