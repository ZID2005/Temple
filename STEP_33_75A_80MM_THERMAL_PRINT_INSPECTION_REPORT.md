# STEP 33.75A — 80 mm Thermal Receipt Print-Path Inspection Report (READ-ONLY)

**Target Document:** `Temple_Accounts-1.html`  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Inspection Phase:** Step 33.75A — Read-Only Architectural & CSS Print-Path Audit  
**Date:** 2026-10-17  
**Auditor:** Antigravity AI  

---

## 1. Verdict

### **VERDICT: INSPECTION COMPLETE**

The billing receipt print-path, DOM injection pipeline, CSS Paged Media `@page` descriptors, `@media print` rules, and browser print preview lifecycle have been thoroughly inspected in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) (20,975 lines, 831,279 bytes). The exact root cause for the receipt appearing in a narrow area at the top-left of a large portrait page has been identified with irrefutable CSS parser evidence from Chromium's CSSOM engine. A minimal, surgical, backward-compatible correction plan is established below.

---

## 2. Files Inspected & Safety Compliance Confirmation

### 2.1 Files Inspected
1. [`d:\Temple\Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html) — Core application source code containing billing form, receipt preview, thermal receipt renderer, dynamic print injection, and print stylesheets.
2. [`d:\Temple\tests\test_step_33_60_multiple_devotees_80mm.js`](file:///d:/Temple/tests/test_step_33_60_multiple_devotees_80mm.js) — Verification test suite from Step 33.60 that introduced the 80 mm layout assertions.
3. [`d:\Temple\package.json`](file:///d:/Temple/package.json) — Repository build and script definitions.
4. [`d:\Temple\STEP_33_59_MULTIPLE_DEVOTEES_80MM_AUDIT_REPORT.md`](file:///d:/Temple/STEP_33_59_MULTIPLE_DEVOTEES_80MM_AUDIT_REPORT.md) — Architectural design and migration document for 80 mm thermal receipts.

### 2.2 Strict Safety Compliance Confirmation
- **Zero Modifications:** No lines of application code, stylesheets, configuration files, test suites, or deployment packages were modified, formatted, or rewritten.
- **Zero Network Operations:** No connections were made to production Firebase or external APIs.
- **Zero Data Mutations:** No accounting records, billing documents, vouchers, counters, or local IndexedDB stores were read, created, updated, or deleted.
- **No Live Application Interaction:** The application was not loaded against production Firebase.
- **Zero Credential Exposure:** No API keys, passwords, or secrets were accessed or displayed.
- **Implementation Restraint:** Zero code changes have been implemented; execution stops upon completion of this report to await user authorization.

---

## 3. Exact Print Workflow & Function Map

When an operator issues a bill and requests physical printing, the application transitions through three distinct phases:

```
[Phase 1: Generate Bill]
       │
       ▼
billingSubmitForm() (Lines 9589-10059)
       │
       ├─► Validates Devotees, Puja item, Qty, Total, Payment Mode
       ├─► Executes fsCreateBillingWithAccounting() (Line 9955 / 18403)
       ├─► Updates currentBillingReceipt = billingRecord (Line 10026)
       ├─► Calls renderBillingReceiptPreview(currentBillingReceipt) (Line 10027)
       ├─► Triggers ReceiptPrinter.startPrinting(billingRecord) [Visual virtual feed] (Line 10031)
       └─► Renders Success Card with #btnSuccessPrintReceipt (Lines 10061-10091)
       │
[Phase 2: Click Print Receipt]
       │
       ▼
User clicks #btnPrintReceipt (Line 9345) or #btnSuccessPrintReceipt (Line 10081)
       │
       ▼
printBillingReceipt() (Lines 9379-9420)
       │
       ├─► Injects renderThermalReceiptHTML() into #print-area (Line 9393)
       ├─► Sets printArea.className = 'billing-80mm' (Line 9392)
       ├─► Adds document.body.classList.add('printing-billing-80mm') (Line 9395)
       ├─► Injects <style id="print-80mm-page-style"> with @page { size: 80mm auto; margin: 0; } (Lines 9396-9402)
       ├─► Schedules window.print() via double requestAnimationFrame (Lines 9404-9408)
       └─► Arms cleanup handler on afterprint + setTimeout(finishPrint, 2500) (Lines 9410-9420)
       │
[Phase 3: Browser Print Preview Modal Opens]
       │
       ▼
Chromium Print Engine Parses Injected CSS & Computes Canvas:
       ├─► Parses @page { size: 80mm auto; margin: 0; }
       ├─► Rejects 'size: 80mm auto;' as INVALID CSS SYNTAX; silently drops 'size' descriptor
       ├─► Retains only 'margin: 0;'
       ├─► Falls back to print destination's default sheet: A4 Portrait (210 mm × 297 mm)
       ├─► Paints #print-area (width: 80mm, left: 0, top: 0) at top-left of the 210 mm canvas
       └─► Result: 80 mm receipt rendered at top-left with 130 mm blank expanse to right and bottom
```

### 3.1 Detailed Function Breakdown

| Function Name | Source Line(s) | Role & Behavior |
|---|---|---|
| [`billingSubmitForm()`](file:///d:/Temple/Temple_Accounts-1.html#L9589) | [9589–10059](file:///d:/Temple/Temple_Accounts-1.html#L9589-L10059) | Validates the billing form, creates atomic accounting receipt, assigns `currentBillingReceipt`, invokes `renderBillingReceiptPreview()`, triggers on-screen feed animation `ReceiptPrinter.startPrinting()`, and renders the success card with action buttons. |
| [`renderBillingReceiptPreview(r)`](file:///d:/Temple/Temple_Accounts-1.html#L9301) | [9301–9377](file:///d:/Temple/Temple_Accounts-1.html#L9301-L9377) | Renders the on-screen card `#billingReceiptPreviewArea`. Embeds `.receipt-paper-box` (styled with `max-width: 380px`) populated by [`renderThermalReceiptHTML()`](file:///d:/Temple/Temple_Accounts-1.html#L8798). Renders button `#btnPrintReceipt` (`onclick="printBillingReceipt()"`). |
| [`renderThermalReceiptHTML(r, templeName, templeAddress)`](file:///d:/Temple/Temple_Accounts-1.html#L8798) | [8798–8878](file:///d:/Temple/Temple_Accounts-1.html#L8798-L8878) | Core receipt template generator. Returns markup with `.th-receipt`, temple header, receipt/bill metadata, multi-devotee roster table (`.th-roster-section`), category/puja item, quantity, unit price, formatted total (`.th-total`), payment mode, optional void banner, and sacred footer (`*** അമ്മേ നാരായണ ദേവി നാരായണ ***`). |
| [`printBillingReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L9379) | [9379–9420](file:///d:/Temple/Temple_Accounts-1.html#L9379-L9420) | Prepares `#print-area` with class `billing-80mm`, attaches `printing-billing-80mm` class to `document.body`, injects dynamic style tag `#print-80mm-page-style`, invokes `window.print()`, and registers cleanup via `afterprint` and a 2.5s `setTimeout`. |
| [`reprintBillingRecord(id)`](file:///d:/Temple/Temple_Accounts-1.html#L11621) | [11621–11630](file:///d:/Temple/Temple_Accounts-1.html#L11621-L11630) | Historical reprint trigger. Fetches saved bill from store, updates `currentBillingReceipt = r`, calls `renderBillingReceiptPreview(r)`, and immediately calls `printBillingReceipt()`. |

---

## 4. Relevant CSS Rules & Source Line Numbers

### 4.1 Static Styles in `<head>` `<style>`

#### 1. Base Print Canvas Isolation ([Lines 4232–4236](file:///d:/Temple/Temple_Accounts-1.html#L4232-L4236))
```css
#print-area { display: none; }
@media print {
  body * { visibility: hidden; }
  #print-area, #print-area * { visibility: visible; }
  #print-area { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
```
*Effect:* Hides the entire application DOM tree and makes `#print-area` visible at absolute `top: 0; left: 0`.

#### 2. Thermal Billing Container Rules ([Lines 4247–4279](file:///d:/Temple/Temple_Accounts-1.html#L4247-L4279))
```css
body.printing-billing-80mm,
body.printing-billing-58mm {
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  width: 80mm !important;
}
body.printing-billing-80mm #app-shell,
body.printing-billing-58mm #app-shell {
  display: none !important;
}
body.printing-billing-80mm #print-area,
body.printing-billing-58mm #print-area,
#print-area.billing-80mm,
#print-area.billing-58mm {
  display: block !important;
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 80mm !important;
  max-width: 80mm !important;
  min-height: 10mm !important;
  margin: 0 !important;
  padding: 3mm 4mm 4mm 4mm !important;
  background: #fff !important;
  color: #000 !important;
  font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace !important;
  font-size: 11.5px !important;
  line-height: 1.35 !important;
  box-shadow: none !important;
  border: none !important;
  box-sizing: border-box !important;
}
```
*Effect:* Constrains `#print-area` to a width of `80mm` and positions it absolutely at `(0, 0)`. With `box-sizing: border-box` and `padding: 3mm 4mm 4mm 4mm`, the active content width is `80 - 4 - 4 = 72mm` (the exact printable head width of standard 80 mm POS hardware).

#### 3. Printer Hardware Animation Overlay Suppression ([Lines 3039–3049](file:///d:/Temple/Temple_Accounts-1.html#L3039-L3049))
```css
@media print {
  .receipt-printer-overlay,
  .receipt-printer-backdrop,
  .receipt-printer-modal-content,
  .receipt-printer-chassis,
  .receipt-printer-root,
  .printer-paper-ejector {
    display: none !important;
    visibility: hidden !important;
  }
}
```
*Effect:* Correctly ensures the on-screen skeuomorphic hardware chassis does not print.

#### 4. Action Button Suppression ([Lines 5855–5861](file:///d:/Temple/Temple_Accounts-1.html#L5855-L5861))
```css
@media print {
  .dynamic-btn,
  .dynamic-btn-measure,
  .bill-success-actions {
    display: none !important;
  }
}
```

### 4.2 Dynamic Style Injected at Runtime

In `printBillingReceipt()` ([Lines 9396–9402](file:///d:/Temple/Temple_Accounts-1.html#L9396-L9402)):
```javascript
let dynamicStyle = document.getElementById('print-80mm-page-style');
if (!dynamicStyle) {
  dynamicStyle = document.createElement('style');
  dynamicStyle.id = 'print-80mm-page-style';
  dynamicStyle.textContent = '@page { size: 80mm auto; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }';
  document.head.appendChild(dynamicStyle);
}
```

---

## 5. Evidence-Based Root-Cause Analysis

### 5.1 Primary Root Cause: CSS Parser Rejection of `@page { size: 80mm auto; }`

The core reason why browser print preview displays the receipt in a narrow area at the top-left of an A4 page is a **CSS Paged Media syntax error** in the injected `@page` rule.

#### Specification Verification (W3C CSS Paged Media Module Level 3, § 3.1)
The formal grammar for the `size` property of `@page` is:
```
size: [ <length>{1,2} | auto | [ [ ltr | rtl ]? portrait | landscape ] | [ <page-size> || [ portrait | landscape ] ] ]
```
- `<length>{1,2}` permits either **one length** (e.g., `size: 80mm`, defining an 80 mm × 80 mm square page) or **two lengths** (e.g., `size: 80mm 200mm`, defining an 80 mm wide by 200 mm tall page).
- `auto` is a standalone keyword meaning "use the target sheet's default size".
- **`<length> auto` (such as `80mm auto`) is NOT valid CSS.** In CSS, `auto` is a keyword, not a `<length>`. Combining a length with `auto` violates the grammar.

#### Chromium Parser Test Evidence
To verify this behavior, a test suite was executed against Chromium's CSSOM parser using headless Chrome:

```html
<style id="s1">@page { size: 80mm auto; margin: 0; }</style>
<style id="s2">@page { size: 80mm; margin: 0; }</style>
<style id="s3">@page { size: 80mm 200mm; margin: 0; }</style>
```

**Chromium CSSOM Dump Results:**
```
s1 rule: @page { margin: 0px; }
s2 rule: @page { size: 80mm; margin: 0px; }
s3 rule: @page { size: 80mm 200mm; margin: 0px; }
```

**Conclusion:** When Chromium encounters `@page { size: 80mm auto; margin: 0; }`, its CSS parser **silently drops the invalid `size: 80mm auto;` descriptor entirely**, preserving only `margin: 0px;`.

### 5.2 The Cascading Effect on Print Preview
Because Chromium drops the `size` declaration:
1. **Target Sheet Fallback:** Chromium falls back to the default paper size of the currently active print destination.
2. **"Save as PDF" Destination Default:** In Chrome and Edge, the built-in virtual printer "Save as PDF" defaults to **A4 (210 mm × 297 mm)** or US Letter.
3. **Canvas Pinning:** The application CSS explicitly instructs:
   ```css
   #print-area.billing-80mm {
     position: absolute !important;
     left: 0 !important;
     top: 0 !important;
     width: 80mm !important;
   }
   ```
4. **Visual Result:** On an A4 sheet (210 mm wide by 297 mm tall), the receipt is pinned to coordinates `(0, 0)` with a width of 80 mm. The entire right half (`210 - 80 = 130 mm`) and bottom region (`297 - receipt_height ≈ 150+ mm`) remain a vast blank void.

### 5.3 Contributing Factor: Premature Cleanup via `setTimeout(finishPrint, 2500)`
In [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html#L9410-L9420):
```javascript
const finishPrint = () => {
  document.body.classList.remove('printing-billing-80mm');
  const pageStyle = document.getElementById('print-80mm-page-style');
  if (pageStyle && pageStyle.parentNode) {
    pageStyle.parentNode.removeChild(pageStyle);
  }
  window.removeEventListener('afterprint', finishPrint);
};
window.addEventListener('afterprint', finishPrint);
setTimeout(finishPrint, 2500);
```
- When `window.print()` opens the modal print preview, modern browsers do not necessarily pause asynchronous timers.
- After **2.5 seconds**, the `setTimeout` callback executes while the operator is still inspecting the print dialog.
- This strips `.printing-billing-80mm` from `<body>` and removes `#print-80mm-page-style` from `<head>`.
- If the operator subsequently changes any setting (such as margins, scale, or destination printer), Chromium re-evaluates print styles against the current DOM—which now completely lacks the 80 mm styling!
- By contrast, [`exportLedgerPDF()`](file:///d:/Temple/Temple_Accounts-1.html#L13053-L13061) and [`printBillingReport()`](file:///d:/Temple/Temple_Accounts-1.html#L11455-L11458) rely solely on the native `afterprint` event without any premature 2.5-second timer.

### 5.4 Distinction Matrix: CSS vs Dialog vs Driver

| Layer | Influence on Current Issue | Source Code Evidence & Analysis |
|---|---|---|
| **Application CSS** | **PRIMARY CAUSE** | `size: 80mm auto` is malformed CSS and is rejected by the browser parser, causing loss of all page size control. Absolute pinning at `left: 0; top: 0` creates the top-left positioning on whatever sheet size is supplied. |
| **Browser Print Dialog** | **SECONDARY FACTOR** | "Save as PDF" has no knowledge of roll paper; without valid CSS `@page { size }`, it defaults to A4/Letter. (Selecting "Save as PDF" does *not* mean the application generated a PDF file). |
| **Printer Driver Configuration** | **TARGET PRINTER FACTOR** | A physical thermal printer requires its Windows driver to have its page size set to an 80 mm roll format (e.g. `80 x 297 mm` or `Roll Paper`). If the driver is misconfigured to A4, even valid CSS may experience driver-enforced paper advance. |
| **Hardware / Firmware** | **UNVERIFIABLE WITHOUT HARDWARE** | The physical cutter activation command, tear-off feed distance, and thermal head dot density (203 DPI) cannot be verified in software alone. |

---

## 6. Minimal Recommended 80 mm Correction Plan

> [!IMPORTANT]
> This plan is proposed for subsequent implementation upon explicit user approval. **Zero code modifications have been made during this inspection step.**

### 6.1 Proposed Technical Solution

To deliver an authentic 80 mm thermal print experience across both virtual PDF preview and physical roll printers, the following surgical adjustments are recommended:

#### Adjustment 1: Replace Invalid `@page { size: 80mm auto; }` with Dynamic Content-Height `@page`
Since `auto` height is invalid in CSS `@page`, but two lengths `<width> <height>` are fully supported:
1. In `printBillingReceipt()`, after populating `printArea.innerHTML`:
2. Measure the exact pixel height of the rendered receipt content using DOM metrics:
   ```javascript
   const measuredHeightPx = printArea.offsetHeight || printArea.scrollHeight || 600;
   // Convert px to mm at 96 DPI: 1 inch = 25.4 mm = 96 px -> mm = px * 25.4 / 96
   // Add a 6 mm safety buffer to prevent trailing blank page generation
   const calculatedHeightMm = Math.ceil(measuredHeightPx * 25.4 / 96) + 6;
   const receiptHeightMm = Math.max(calculatedHeightMm, 80); // clamp minimum to 80 mm
   ```
3. Inject the valid `@page` rule:
   ```javascript
   dynamicStyle.textContent = `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }`;
   ```

#### Why Dynamic Height is Superior to Static Fixed Height
- **No Blank A4 Canvas:** When "Save as PDF" is chosen, the PDF document page size is generated as exactly `80mm × ${receiptHeightMm}mm` (e.g. 80 mm × 125 mm for a single puja, or 80 mm × 175 mm for 6 devotees). There is zero right-hand or bottom whitespace.
- **No Mid-Receipt Pagination:** Receipts adapt organically to any roster length without arbitrary page breaks.
- **Clean Physical Feed:** Physical thermal printers adhering to page boundaries will cut cleanly without wasting paper roll length.

#### Adjustment 2: Remove the Hazardous 2.5-Second `setTimeout`
Align `printBillingReceipt()` with `exportLedgerPDF()`:
- Eliminate `setTimeout(finishPrint, 2500)`.
- Rely on `window.addEventListener('afterprint', finishPrint, { once: true })`.
- Optionally include a generous safety timeout (e.g., 60,000 ms) purely as a backstop in case an old browser suppresses `afterprint`.

#### Adjustment 3: Center or Flow `#print-area` in Print Styles
In static CSS ([Lines 4262–4270](file:///d:/Temple/Temple_Accounts-1.html#L4262-L4270)):
- Ensure `#print-area.billing-80mm` has `box-sizing: border-box; width: 80mm; max-width: 80mm; padding: 2.5mm 4mm 3mm 4mm;`.
- Use `overflow: visible;` and `page-break-inside: avoid; break-inside: avoid;` to prevent browser fragmentation.

### 6.2 Interaction with Browser Print Dialog & Printer Driver
- **Browser Print Dialog:** When the operator chooses "Save as PDF", Chrome will immediately render an 80 mm wide receipt card matching the exact height of the content.
- **Physical Thermal Printer:** When the operator selects the physical POS-80 / Epson / TVS printer:
  - If the printer driver is set to 80 mm roll paper, the browser passes the 80 mm width directive to the driver.
  - **Important Reality Check:** CSS cannot override an operating-system driver that has been hardcoded to A4 in Windows Printer Properties. The implementation guide must instruct the temple administrator to ensure the printer driver default paper size is set to `80 x 297 mm` or `80 x Receipt / Roll Paper`.

---

## 7. Protected Functionality & Regression Risk Assessment

The proposed correction touches only `printBillingReceipt()` and `#print-80mm-page-style`. The following mission-critical components are strictly isolated:

| System / Subsystem | Isolation Status | Verification of Protection |
|---|---|---|
| **Billing Form & Devotee Entry** | **UNTOUCHED** | Devotee roster UI ([Lines 11776–11815](file:///d:/Temple/Temple_Accounts-1.html#L11776-L11815)) and calculation handlers (`updatePrice()`, `syncQtyWithDevotees()`) remain completely unaltered. |
| **Receipt Counters & Firestore Numbers** | **UNTOUCHED** | No changes to counter generation ([`fsCreateBillingWithAccounting()`](file:///d:/Temple/Temple_Accounts-1.html#L18403) and [`computeBillingFingerprint()`](file:///d:/Temple/Temple_Accounts-1.html#L18210)). |
| **Physical Receipt Printing (`P` & `PU`)** | **ISOLATED & PROTECTED** | Physical receipts use [`printReceipt(r)`](file:///d:/Temple/Temple_Accounts-1.html#L8216) with class `#print-area.receipt-print`. They do *not* use `printing-billing-80mm` and do *not* inject `#print-80mm-page-style`. |
| **Billing Report & Ledger PDF** | **ISOLATED & PROTECTED** | [`printBillingReport()`](file:///d:/Temple/Temple_Accounts-1.html#L11451) uses class `billing-report-print`. [`exportLedgerPDF()`](file:///d:/Temple/Temple_Accounts-1.html#L13069) uses class `printing-ledger-pdf` with its own isolated `#ledger-pdf-page-style`. |
| **Virtual Printer Animation** | **UNTOUCHED** | Skeuomorphic `ReceiptPrinter` controller ([Lines 8881–9300](file:///d:/Temple/Temple_Accounts-1.html#L8881-L9300)) operates strictly via CSS animation on `#receiptPrinterOverlay` and is unaffected. |
| **Accounting Integration & Firestore Rules** | **UNTOUCHED** | Firestore rules, cash book, bank book, and ledger queries are 100% bypassed by print layout code. |

---

## 8. Safe Implementation & Verification Plan (for Next Step)

When authorized, the implementation step must execute the following verified protocol:

### Phase 1: Surgical Code Update
1. Update `printBillingReceipt()` in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html#L9379):
   - Measure rendered content height in millimeters (`Math.ceil(printArea.offsetHeight * 25.4 / 96) + 6`).
   - Inject valid `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; }`.
   - Remove the 2.5-second `setTimeout(finishPrint, 2500)`.

### Phase 2: Static & Parser Verification
1. Run automated headless test verifying Chromium CSSOM parses the new `@page` rule without discarding the `size` descriptor.
2. Confirm SHA-256 integrity and syntax validation.

### Phase 3: Isolated Browser Preview Testing (Zero Firebase Connection)
1. Using the existing local test harness or a detached offline mock bill:
   - **Test Case 1 (Short Receipt):** Single devotee, 1 puja (Archana), total ₹30. Verify preview displays an 80 mm wide canvas with ~110–125 mm height and zero right-side blank canvas in "Save as PDF".
   - **Test Case 2 (Long Receipt):** Multi-devotee roster (6 family members with Malayalam stars), custom puja, void banner, total ₹1,800. Verify preview expands height smoothly without clipping or multi-page fragmentation.
   - **Test Case 3 (Physical Receipt Isolation):** Open a physical `P` receipt and click Print. Confirm physical receipt styling (`receipt-print`) remains identical and does not inherit 80 mm page styling.
   - **Test Case 4 (Ledger PDF Isolation):** Export Ledger PDF. Confirm A4 landscape formatting remains fully preserved.

---

## 9. Unverified Items & Limitations

In accordance with strict safety mandates, the following items are formally recorded as **NOT VERIFIED**:

1. **Physical 80 mm Hardware Output — NOT VERIFIED:**
   - Physical output on the temple's actual hardware printer (e.g. POS-80, Epson TM-T88, TVS RP-3200) cannot be verified in software or emulators.
   - Physical auto-cutter firing, paper tear-off feed margin, and thermal head contrast must be physically confirmed by the temple operator upon deployment.
2. **Windows Printer Driver Defaults — NOT VERIFIED:**
   - The specific default paper size currently configured in the temple workstation's Windows Print Spooler settings is unverified. If the driver is currently set to A4 in Windows, the operator must set it to `80 x 297 mm` or `80 x Receipt`.
3. **Thermal Head Dot Density & Malayalam Rendering — NOT VERIFIED ON HARDWARE:**
   - While Malayalam text renders crisply on screen and in Chromium PDF previews, thermal head physical rendering at 203 DPI (8 dots/mm) depends on the printer's internal font rasterization and graphics mode capability.

---

## 10. Summary Statement

This inspection definitively identifies the source-code mechanism responsible for the top-left A4 print preview anomaly: the invalid CSS declaration `@page { size: 80mm auto; }`, which Chromium silently discards. 

The proposed minimal correction dynamically computes the rendered content height in millimeters and injects a standard-compliant `@page { size: 80mm <height>mm; margin: 0; }`, resolving the preview in "Save as PDF" and providing proper sizing for 80 mm thermal paper.

**No code modifications have been made. Awaiting explicit user review and authorization before proceeding.**
