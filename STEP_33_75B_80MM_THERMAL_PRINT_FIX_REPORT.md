# STEP 33.75B — Minimal 80 mm Billing Receipt Print Correction Report

**Target Document:** `Temple_Accounts-1.html`  
**Temple:** Marutha Chamundi Devi Temple / മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം  
**Step:** 33.75B — Minimal 80 mm Thermal Billing Receipt Print Correction  
**Date:** 2026-10-17  
**Auditor & Implementation Agent:** Antigravity AI  

---

## 1. Executive Summary & Verdict

### **VERDICT: CORRECTION COMPLETE & VERIFIED**

The surgical correction for the 80 mm thermal billing receipt print workflow has been successfully implemented in [`Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html). 

The invalid CSS Paged Media descriptor `@page { size: 80mm auto; margin: 0; }` has been replaced with a standards-compliant dynamic page size declaration `@page { size: 80mm <calculated-height>mm; margin: 0; }`, where height is measured from the rendered receipt content under exact 80 mm print layout conditions. The hazardous fixed 2.5-second `setTimeout(finishPrint, 2500)` has been completely eliminated and replaced with an idempotent lifecycle handler attached to `afterprint` and a non-timer window-focus fallback.

All 28 automated verification tests across 7 test groups passed with 100% success. Zero external network calls were made, and zero production data, accounting ledgers, physical receipts, or Firestore rules were touched.

---

## 2. Pre-Change & Post-Change Evidence

### 2.1 Pre-Change Backup Verification
- **Backup File Path:** [`d:\Temple\backups\Temple_Accounts-1_PreStep33_75B_ThermalPrintFix_Backup_20261017_170500.html`](file:///d:/Temple/backups/Temple_Accounts-1_PreStep33_75B_ThermalPrintFix_Backup_20261017_170500.html)
- **File Size:** `831,279 bytes`
- **SHA-256 Hash:** `0B8FD7B183DAC834FB70B1DDAE1E090761AD29BFD31217AA7A95E1D2C6B9112C`

### 2.2 Post-Change Application Verification
- **Application File Path:** [`d:\Temple\Temple_Accounts-1.html`](file:///d:/Temple/Temple_Accounts-1.html)
- **File Size:** `834,045 bytes`
- **SHA-256 Hash:** `04BA0A9402149F8463DCC0154EB45AE05CDBDFE07C82D40FB810753BABF199A6`

---

## 3. Exact Function & CSS Declarations Changed

### 3.1 Modified Function
- Only [`printBillingReceipt()`](file:///d:/Temple/Temple_Accounts-1.html#L9379) (Lines 9379–9481) in `Temple_Accounts-1.html` was modified.
- No other function in `Temple_Accounts-1.html` was changed.

### 3.2 Injected CSS Rules & Lifecycle Changes
1. **Invalid `@page` Declaration Removed:**
   ```diff
   - dynamicStyle.textContent = '@page { size: 80mm auto; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }';
   ```
2. **Dynamic Off-Screen Measurement Layout:**
   Enables accurate measurement of rendered receipt metrics prior to opening `window.print()`:
   ```css
   @media screen {
     body.printing-billing-80mm #print-area {
       display: block !important;
       position: absolute !important;
       left: -9999px !important;
       top: 0 !important;
       visibility: hidden !important;
       width: 80mm !important;
       max-width: 80mm !important;
       box-sizing: border-box !important;
       padding: 3mm 4mm 4mm 4mm !important;
       font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace !important;
       font-size: 11.5px !important;
       line-height: 1.35 !important;
       background: #fff !important;
       color: #000 !important;
     }
   }
   ```
3. **Dynamic Valid `@page` Injection:**
   Computes height in millimeters (`Math.ceil((measuredPx * 25.4) / 96) + 5`), clamped to `[70mm, 500mm]`:
   ```javascript
   dynamicStyle.textContent = `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }`;
   ```
4. **Premature 2.5-Second Timer Removed:**
   ```diff
   - window.addEventListener('afterprint', finishPrint);
   - setTimeout(finishPrint, 2500);
   ```
5. **Idempotent Lifecycle Cleanup:**
   - Attached to `afterprint`.
   - Fallback attached to window `focus` (only fires after the modal print dialog closes, never while active).
   - Re-entry protection: `if (window._billingPrintCleanup) window._billingPrintCleanup();` cleanly resets state on repeated prints.

---

## 4. Concise Diff Summary

```diff
--- a/Temple_Accounts-1.html (Pre-Step 33.75B Backup)
+++ b/Temple_Accounts-1.html (Post-Step 33.75B)
@@ -9389,34 +9389,92 @@ function printBillingReceipt() {
   const printArea = el('print-area');
   if (!printArea) return;
 
+  // Clean up any lingering print state from an earlier print run
+  if (window._billingPrintCleanup) {
+    window._billingPrintCleanup();
+  }
+
+  // Populate print area with 80mm receipt markup
   printArea.className = 'billing-80mm';
   printArea.innerHTML = renderThermalReceiptHTML(r, templeName, templeAddress);
 
   document.body.classList.add('printing-billing-80mm');
+
+  // Obtain or create dedicated dynamic 80mm stylesheet
   let dynamicStyle = document.getElementById('print-80mm-page-style');
   if (!dynamicStyle) {
     dynamicStyle = document.createElement('style');
     dynamicStyle.id = 'print-80mm-page-style';
-    dynamicStyle.textContent = '@page { size: 80mm auto; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }';
     document.head.appendChild(dynamicStyle);
   }
 
-  requestAnimationFrame(() => {
-    requestAnimationFrame(() => {
-      window.print();
-    });
-  });
+  // Position #print-area off-screen in screen media so rendered height can be accurately measured
+  // under the exact 80mm container width, box-sizing, padding, and typography rules
+  dynamicStyle.textContent = '@media screen { body.printing-billing-80mm #print-area { display: block !important; position: absolute !important; left: -9999px !important; top: 0 !important; visibility: hidden !important; width: 80mm !important; max-width: 80mm !important; box-sizing: border-box !important; padding: 3mm 4mm 4mm 4mm !important; font-family: \'Consolas\', \'Courier New\', \'Noto Sans Malayalam\', \'Segoe UI\', monospace !important; font-size: 11.5px !important; line-height: 1.35 !important; background: #fff !important; color: #000 !important; } }';
 
+  // Define idempotent cleanup handler
+  let cleanedUp = false;
+  let focusTimer = null;
   const finishPrint = () => {
-    document.body.classList.remove('printing-billing-80mm');
+    if (cleanedUp) return;
+    cleanedUp = true;
+    window._billingPrintCleanup = null;
+
+    if (focusTimer) {
+      clearTimeout(focusTimer);
+      focusTimer = null;
+    }
+    if (window.removeEventListener) {
+      window.removeEventListener('afterprint', finishPrint);
+      window.removeEventListener('focus', onFocusFallback);
+    }
+    if (document.body && document.body.classList) {
+      document.body.classList.remove('printing-billing-80mm');
+    }
     const pageStyle = document.getElementById('print-80mm-page-style');
     if (pageStyle && pageStyle.parentNode) {
       pageStyle.parentNode.removeChild(pageStyle);
     }
-    window.removeEventListener('afterprint', finishPrint);
   };
-  window.addEventListener('afterprint', finishPrint);
-  setTimeout(finishPrint, 2500);
+
+  const onFocusFallback = () => {
+    // When print dialog/preview closes, the parent window regains focus.
+    // Trigger cleanup with a small deferral so any active paint completes safely.
+    focusTimer = setTimeout(finishPrint, 300);
+  };
+
+  window._billingPrintCleanup = finishPrint;
+
+  // Measure rendered content after layout stabilization
+  requestAnimationFrame(() => {
+    const measuredPx = Math.max(
+      printArea.offsetHeight || 0,
+      printArea.scrollHeight || 0,
+      (printArea.getBoundingClientRect ? Math.ceil(printArea.getBoundingClientRect().height) : 0)
+    );
+
+    // Convert CSS pixels to millimeters: 1 inch = 96 px = 25.4 mm => mm = px * 25.4 / 96
+    // Add 5 mm bottom allowance to prevent subpixel rounding overflow from spawning a blank second page
+    const rawMm = measuredPx > 0 ? Math.ceil((measuredPx * 25.4) / 96) + 5 : 120;
+
+    // Safety bounds: minimum 70 mm, maximum 500 mm
+    const receiptHeightMm = Math.min(Math.max(rawMm, 70), 500);
+
+    // Inject syntactically valid @page rule with explicit 80mm width and calculated content height
+    dynamicStyle.textContent = `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }`;
+
+    if (window.addEventListener) {
+      window.addEventListener('afterprint', finishPrint);
+      // Non-timer fallback: cleans up when window regains focus after modal dismiss, cannot fire while modal is active
+      window.addEventListener('focus', onFocusFallback, { once: true });
+    }
+
+    requestAnimationFrame(() => {
+      if (typeof window.print === 'function') {
+        window.print();
+      }
+    });
+  });
 }
```

---

## 5. Test Names, Results, and Evidence

The dedicated verification test suite [`tests/test_step_33_75b_80mm_thermal_print_fix.js`](file:///d:/Temple/tests/test_step_33_75b_80mm_thermal_print_fix.js) was executed locally against Node.js v24.14.0 and headless Google Chrome.

| Test ID | Test Category & Description | Result | Details / Metrics |
|---|---|:---:|---|
| **T1.1** | Invalid `@page { size: 80mm auto; }` removed from `printBillingReceipt()` | **PASS** | `size: 80mm auto` completely eliminated |
| **T1.2** | Valid dynamic `@page` with 80mm and calculated height injected | **PASS** | Matches `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; }` |
| **T1.3** | CSS pixel-to-millimeter formula present (`px * 25.4 / 96`) | **PASS** | Exact conversion ratio implemented |
| **T1.4** | Bottom safety allowance (+5 mm) added | **PASS** | Prevents subpixel rounding page-spill |
| **T1.5** | Bounds enforced (`Math.min(Math.max(rawMm, 70), 500)`) | **PASS** | Min: 70 mm, Max: 500 mm |
| **T2.1** | Hazardous 2.5s `setTimeout` unconditionally removed | **PASS** | `setTimeout(finishPrint, 2500)` eliminated |
| **T2.2** | Native `afterprint` event listener attached | **PASS** | Standards-based print cleanup |
| **T2.3** | Window focus fallback attached | **PASS** | Re-focus fallback cleans up if `afterprint` omitted |
| **T2.4** | Cleanup is idempotent and guarded against duplicate execution | **PASS** | Guarded by `if (cleanedUp) return;` |
| **T2.5** | Re-entry safety: prior print state cleaned up on repeated printing | **PASS** | `window._billingPrintCleanup()` called upon re-entry |
| **T3.1** | Headless Chrome CSSOM discards old invalid `size: 80mm auto` | **PASS** | Parsed: `@page { margin: 0px; }` (size dropped) |
| **T3.2** | Headless Chrome CSSOM parses & accepts new `size: 80mm 145mm` | **PASS** | Parsed: `@page { size: 80mm 145mm; margin: 0px; }` (retained) |
| **T4.1** | Short receipt (1 devotee, 1 puja) height measured and positive | **PASS** | 567 px measured -> 156 mm calculated |
| **T4.2** | Short receipt height within bounds (70mm - 500mm) | **PASS** | 156 mm (within [70, 500]) |
| **T4.3** | Short receipt `@page` rule accepted by Chromium CSSOM | **PASS** | Parsed: `@page { size: 80mm 156mm; margin: 0px; }` |
| **T4.4** | Long receipt (6 devotees, wrapped text, void banner) scales height | **PASS** | 772 px measured -> 210 mm calculated (> 156 mm) |
| **T4.5** | Long receipt height within bounds (<= 500mm) | **PASS** | 210 mm (within [70, 500]) |
| **T4.6** | Long receipt `@page` rule accepted by Chromium CSSOM | **PASS** | Parsed: `@page { size: 80mm 210mm; margin: 0px; }` |
| **T5.1** | Print styles active upon print invocation (no timer stripping) | **PASS** | `.printing-billing-80mm` & style present |
| **T5.2** | Print styles cleanly removed upon dialog dismissal | **PASS** | Styles and classes detached |
| **T5.3** | Cleanup is strictly idempotent (subsequent calls are no-ops) | **PASS** | 1 cleanup execution recorded |
| **T6.1** | Physical receipt print function `printReceipt(r)` is byte-identical | **PASS** | 100% byte match with pre-change backup |
| **T6.2** | Physical receipt print styles (`.receipt-print`) unaffected | **PASS** | Static 72mm monospace CSS intact |
| **T7.1** | `billingSubmitForm()` is byte-identical to pre-change backup | **PASS** | 100% byte match |
| **T7.2** | `computeBillingFingerprint()` is byte-identical to pre-change backup | **PASS** | 100% byte match |
| **T7.3** | `fsCreatePhysicalReceipt()` is byte-identical to pre-change backup | **PASS** | 100% byte match |
| **T7.4** | `getFsCountersDocRef()` is byte-identical to pre-change backup | **PASS** | 100% byte match |
| **T7.5** | `exportLedgerPDF()` is byte-identical to pre-change backup | **PASS** | 100% byte match |

**Test Summary:** **28 PASSED**, **0 FAILED**.

---

## 6. Safety Compliance Confirmations

1. **Zero External Network Calls:** No network connections to Firebase, Google APIs, CDNs, or external hosts were initiated or attempted.
2. **Zero Production Data Mutations:** No accounting records, vouchers, billing receipts, devotee records, or database documents were read, written, modified, or deleted.
3. **Firestore Security Rules:** Zero changes to `firestore.rules` or security configurations.
4. **Authentication & Authorization:** Zero changes to authentication logic, session management, or user roles.
5. **Receipt Numbering & Counters:** Zero changes to `system/counters`, global sequence numbers, or physical receipt identifiers (`P` / `PU`).
6. **Physical P/PU Receipt Workflow:** [`printReceipt(r)`](file:///d:/Temple/Temple_Accounts-1.html#L8216) and `.receipt-print` styles remain 100% byte-identical to the pre-change backup.
7. **No Unrelated Files Modified:** Only `Temple_Accounts-1.html` was modified. Test suite [`test_step_33_75b_80mm_thermal_print_fix.js`](file:///d:/Temple/tests/test_step_33_75b_80mm_thermal_print_fix.js) was created for validation.

---

## 7. Unresolved Browser or Printer-Driver Limitations

In strict adherence to the safety boundaries, the following limitations are formally recorded:

1. **Physical Thermal Printer Hardware Output — NOT VERIFIED ON HARDWARE:**
   - Physical print output on the temple's actual hardware POS-80 / TVS / Epson thermal printer cannot be verified in a headless software environment.
   - The physical auto-cutter pulse, paper tear-off feed margin, and thermal head contrast must be confirmed on-site by the temple operator.
2. **Windows Printer Driver Paper Size Configuration:**
   - CSS Paged Media `@page { size: 80mm ...; }` dictates the page geometry to the browser layout engine and virtual printers (such as "Save as PDF").
   - However, if the physical printer's driver in Windows (`Printers & Scanners -> Printing Preferences`) is hardcoded to A4, the Windows print spooler can override application directives. The temple administrator must ensure the Windows driver default paper size is set to `80 x 297 mm` or `Roll Paper 80mm`.
3. **Note on Step 33.60 Test Suite (`test_step_33_60_multiple_devotees_80mm.js`):**
   - In the historical test suite for Step 33.60, assertion `SCEN-16 / T3` previously checked for `html.includes('size: 80mm auto')`.
   - Because that specific test explicitly asserted the old, malformed string, running that specific legacy test file reports a failure on `SCEN-16 / T3`.
   - Per instructions, `test_step_33_60_multiple_devotees_80mm.js` was NOT modified in this step. Updating that historical test to assert the valid dynamic syntax should be scheduled in a subsequent test maintenance step upon user authorization.

---

## 8. Completion & Next Steps

All requirements of **STEP 33.75B** have been fully achieved:
- Injected `@page` rule replaced with valid, content-measured 80 mm dimensions.
- 2.5-second premature cleanup timer removed.
- Safe, idempotent `afterprint` and focus lifecycle cleanup implemented.
- Byte-exact backup verified.
- Core accounting, physical receipt printing, and billing calculations remain completely isolated and intact.

**Execution is stopped. Awaiting operator review and authorization before proceeding.**
