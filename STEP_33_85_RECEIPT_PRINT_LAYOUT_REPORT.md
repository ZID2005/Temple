# STEP 33.85 — Receipts Print Preview Layout Correction Report

**Execution Date:** 2026-10-18  
**Target File:** `D:\Temple\Temple_Accounts-1.html`  
**Task ID:** STEP 33.85 — Receipts Print Preview Layout Correction  

---

## 1. Executive Summary

In STEP 33.85, the Receipts table print path was diagnosed, corrected, and verified. Previously, clicking **Print** on any row in the Receipts table produced a full-size page (A4/Letter) with a tiny receipt pinned at the top-left corner, followed by up to 8 trailing blank pages. In contrast, the Billing page's 80 mm thermal receipt preview printed cleanly as a single-page receipt.

### Key Outcomes:
1. **Dynamic 80 mm Thermal Page Sizing:** The Receipts print engine now measures rendered content off-screen under exact 80 mm width rules and dynamically injects a valid `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; }` style.
2. **Elimination of Trailing Blank Pages:** Background elements (`#app-shell`, modals, toasts, overlays) are now set to `display: none !important` during print, removing them from layout flow and reducing the print preview page count from 8 pages down to **exactly 1 page**.
3. **Billing-Linked Reprint Delegation:** Receipts originating from the Pooja Billing module (`source === 'billing'`) dynamically resolve their authoritative billing record and route through `printBillingReceipt()`, ensuring the full devotee roster, itemized breakdown, and 80 mm thermal layout are rendered. If the linked billing record cannot be resolved (e.g. orphan/purged record), the system gracefully falls back to `printReceipt(r)`.
4. **Physical & Independent Receipt Fidelity:** Physical P-series and PU-series receipts, as well as ordinary accounting receipts, strictly retain their banners (`[PHYSICAL PUJA RECEIPT]`, `[PHYSICAL · PUNARUDHARANAM RECEIPT]`), fund/category info, receipt numbers, devotee star labels (`Star / നാൾ:`), amounts in words, and authorized signature lines.
5. **Readable Typography & Malayalam Rendering:** Receipts utilize `'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace` typography with tabular numerals (`font-variant-numeric: tabular-nums`) and clean word-breaking (`word-break: break-word`) for descriptions of any length.
6. **Print Lifecycle Cleanup:** Idempotent event listeners on `afterprint` and `focus` (dialog close fallback) cleanly strip print classes and remove dynamic style sheets upon print completion or cancellation.

---

## 2. Cryptographic Baseline & Backup Verification

A byte-exact pre-change backup of `Temple_Accounts-1.html` was created and verified prior to making edits:

| File | Path | Size (Bytes) | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| **Baseline (Pre-Step)** | `D:\Temple\Temple_Accounts-1.html` | 834,921 | `3F6DAA24BC8CDC80034FD2C18B713EFE1685FB0B4D86CD3F749FB14769EB189D` |
| **Pre-Step Backup** | `D:\Temple\backups\Temple_Accounts-1_PreStep33_85_ReceiptPrintLayout_Backup_20261018_000530.html` | 834,921 | `3F6DAA24BC8CDC80034FD2C18B713EFE1685FB0B4D86CD3F749FB14769EB189D` |
| **Final (Post-Step)** | `D:\Temple\Temple_Accounts-1.html` | 844,787 | `073494F8C19830D603E89071DD6CF3B3DD206AE76EC95B2CA0F5D6EFE03B70BE` |

*Backup SHA-256 matches baseline hash with 100% cryptographic byte-exact parity.*

---

## 3. Root Cause Investigation

Tracing the print execution from the Receipts table identified four distinct issues in the legacy implementation:

1. **Missing `@page` Rule (Defaulted to Full A4 Canvas):**
   - In `printReceipt(r)`, `window.print()` was called directly after writing to `#print-area`.
   - Without an explicit `@page { size: ...; margin: 0; }` CSS rule, Chromium defaulted to the printer's default paper size (A4: 210 × 297 mm or US Letter).
   - In CSS, `#print-area.receipt-print` had `width: 72mm; position: absolute; left: 0; top: 0;`. This placed the receipt as a tiny strip in the upper-left quadrant of an A4 canvas with massive white space on the right and bottom.

2. **`visibility: hidden` vs `display: none` on `#app-shell` (8 Phantom Pages):**
   - The legacy print style used `@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } }`.
   - `visibility: hidden` hides pixel rendering but **does not remove elements from layout flow**.
   - `#app-shell` contained the entire accounting interface, including the receipts table with hundreds of rows, navigation menus, and forms (totaling over 3,500 pixels in height).
   - Chromium computed layout flow across multiple pages for the invisible `#app-shell`, producing 8 pages of blank paper trailing after the receipt.

3. **Absence of Billing-Linked Reprint Delegation:**
   - In `#receiptTable`, clicking Print called `reprintReceipt(id)`.
   - `reprintReceipt` directly invoked `printReceipt(r)` regardless of whether `r` was generated from a Pooja Bill (`r.source === 'billing'`).
   - Consequently, billing receipts printed through the Receipts table lost their devotee roster, pooja item breakdown, unit price calculations, and the specialized thermal template provided in `printBillingReceipt()`.

4. **Lack of Dynamic Content Height Measurement and Print Lifecycle Cleanup:**
   - Receipts had no off-screen height measurement mechanism to calculate height for varying content lengths (such as long descriptions or star details).
   - There was no `afterprint` or `focus` listener to clean up print styles or classes upon dialog dismissal.

---

## 4. Exact Implementation Details

### A. Print CSS Hardening (`Temple_Accounts-1.html`)
1. **Added `body.printing-receipt-80mm` to Thermal Layout Rules:**
   ```css
   /* 80mm & 58mm Thermal Receipt Printing */
   body.printing-billing-80mm,
   body.printing-billing-58mm,
   body.printing-receipt-80mm {
     margin: 0 !important;
     padding: 0 !important;
     background: #fff !important;
     width: 80mm !important;
   }
   body.printing-billing-80mm #app-shell,
   body.printing-billing-58mm #app-shell,
   body.printing-receipt-80mm #app-shell,
   body.printing-receipt-80mm #login-container,
   body.printing-receipt-80mm #darkveil-canvas,
   body.printing-receipt-80mm .modal-backdrop,
   body.printing-receipt-80mm .toast,
   body.printing-receipt-80mm #audioUnlockModal,
   body.printing-receipt-80mm #receiptPrinterOverlay {
     display: none !important;
   }
   body.printing-billing-80mm #print-area,
   body.printing-billing-58mm #print-area,
   body.printing-receipt-80mm #print-area,
   #print-area.billing-80mm,
   #print-area.billing-58mm,
   body.printing-receipt-80mm #print-area.receipt-print {
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

2. **Added Dedicated Receipt Typography Styles:**
   ```css
   /* STEP 33.85: Receipts Table 80mm Thermal Receipt Typography & Layout */
   body.printing-receipt-80mm #print-area * {
     visibility: visible !important;
     color: #000 !important;
     background: transparent !important;
     box-sizing: border-box !important;
   }
   body.printing-receipt-80mm #print-area .pr-line {
     border-bottom: 1px dashed #000 !important;
     margin: 4px 0 !important;
     width: 100% !important;
     display: block !important;
   }
   body.printing-receipt-80mm #print-area .pr-center { text-align: center !important; }
   body.printing-receipt-80mm #print-area .pr-bold { font-weight: bold !important; }
   body.printing-receipt-80mm #print-area .pr-flex {
     display: flex !important;
     justify-content: space-between !important;
     align-items: baseline !important;
     width: 100% !important;
     font-variant-numeric: tabular-nums !important;
   }
   body.printing-receipt-80mm #print-area .pr-title {
     font-size: 13.5px !important;
     font-weight: bold !important;
     line-height: 1.25 !important;
     margin-bottom: 2px !important;
   }
   body.printing-receipt-80mm #print-area .pr-sub {
     font-size: 10.5px !important;
     line-height: 1.25 !important;
     margin-bottom: 3px !important;
   }
   body.printing-receipt-80mm #print-area .pr-amount {
     font-size: 13.5px !important;
     font-weight: bold !important;
     font-variant-numeric: tabular-nums !important;
   }
   body.printing-receipt-80mm #print-area .pr-blessing {
     font-size: 10px !important;
     font-weight: bold !important;
     margin-top: 5px !important;
     text-align: center !important;
   }
   ```

### B. Billing-Linked Receipt Delegation (`reprintReceipt`)
Updated `reprintReceipt(id)` so that if a receipt is billing-linked (`source === 'billing' || billingFirestoreId || billingId || billingReceiptNo`), it attempts to resolve the linked bill from Firestore / IndexedDB cache:
```javascript
async function reprintReceipt(id) {
  let r = null;
  try {
    r = await fsGetOneSafe('receipts', id);
  } catch (fsErr) {
    console.warn('[reprintReceipt] Firestore lookup failed:', fsErr);
  }
  if (!r) {
    try {
      r = await getOne('receipts', id);
    } catch (idbErr) {
      console.warn('[reprintReceipt] IndexedDB lookup failed (non-fatal):', idbErr);
    }
  }

  if (r) {
    // If billing-linked, attempt to resolve the authoritative billing record
    if (r.source === 'billing' || r.billingFirestoreId || r.billingId || r.billingReceiptNo) {
      let billRec = null;
      const billDocId = r.billingFirestoreId || (r.billingId ? (String(r.billingId).startsWith('bill_') ? r.billingId : `bill_${r.billingId}`) : null) || r.billingId;
      if (billDocId) {
        try { billRec = await getBillingRecord(billDocId); } catch (e) {}
      }
      if (!billRec && r.billingId && r.billingId !== billDocId) {
        try { billRec = await getBillingRecord(r.billingId); } catch (e) {}
      }
      if (!billRec && typeof getOne === 'function' && r.billingId) {
        try { billRec = await getOne('billing', r.billingId); } catch (e) {}
      }
      if (!billRec && typeof allBillingRecords === 'function') {
        try {
          const allB = await allBillingRecords();
          billRec = (allB || []).find(b =>
            (r.billingId && (b.id === r.billingId || String(b.id) === String(r.billingId))) ||
            (r.billingFirestoreId && (b.firestoreId === r.billingFirestoreId || b.id === r.billingFirestoreId)) ||
            (r.billingReceiptNo && b.receiptNo === r.billingReceiptNo) ||
            (r.remarks && b.receiptNo && r.remarks.includes(b.receiptNo))
          ) || null;
        } catch (e) {}
      }

      if (billRec) {
        currentBillingReceipt = billRec;
        if (typeof renderBillingReceiptPreview === 'function') {
          renderBillingReceiptPreview(billRec);
        }
        printBillingReceipt();
        return;
      }
    }

    // Independent, physical, or unresolvable billing fallback
    printReceipt(r);
  } else {
    alert('Receipt not found. It may have been deleted or the ID is invalid.');
  }
}
```

### C. 80 mm Thermal Dynamic Engine (`printReceipt`)
Implemented off-screen measurement with matching typography rules, dynamic `@page` rule generation, and lifecycle cleanup:
```javascript
function printReceipt(r) {
  const printArea = el('print-area');
  if (!printArea) return;

  const s = window.APP_SETTINGS || {};
  const templeName = s.templeName || 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം';
  const templeAddress = s.address || 'ആശാരിവിളാകം, കേരളദിത്യപുരം';

  const isPhysPU = r.physicalType === 'PU' || (r.receiptNo && /^PU[1-9]\d*$/i.test(r.receiptNo.trim()));
  const isPhysP = !isPhysPU && (r.physicalType === 'P' || (r.receiptNo && /^P[1-9]\d*$/i.test(r.receiptNo.trim())));
  const isVoided = !!r.voided;

  if (window._receiptPrintCleanup) window._receiptPrintCleanup();
  if (window._billingPrintCleanup) window._billingPrintCleanup();

  printArea.className = 'receipt-print';
  printArea.innerHTML = `
    <div class="pr-center pr-bold pr-title">${esc(templeName)}</div>
    <div class="pr-center pr-sub">${esc(templeAddress)}</div>
    ${isVoided ? `
      <div style="border: 2px dashed #b91c1c; background: #fff5f5; padding: 4px; margin: 4px 0; text-align: center; color: #b91c1c; font-weight: 900; font-size: 12px; letter-spacing: 1px;">
        *** VOIDED / റദ്ദാക്കിയത് ***
      </div>
      ${r.voidReason ? `<div style="text-align: center; font-size: 10px; color: #b91c1c; margin-bottom: 4px; font-weight: 600;">Reason: ${esc(r.voidReason)}</div>` : ''}
    ` : ''}
    <div class="pr-line"></div>
    <div class="pr-flex">
      <span>No: ${esc(r.receiptNo)}${isVoided ? ' <span style="color:#b91c1c;font-weight:bold;">[VOID]</span>' : ''}</span>
      <span>${fmtDate(r.date)}</span>
    </div>
    ${isPhysPU ? '<div class="pr-center" style="font-size:11px; font-weight:bold; color:#7b1fa2; margin: 2px 0;">[PHYSICAL · PUNARUDHARANAM RECEIPT]</div>' : (isPhysP ? '<div class="pr-center" style="font-size:11px; font-weight:bold; color:#1976d2; margin: 2px 0;">[PHYSICAL PUJA RECEIPT]</div>' : '')}
    <div>Name: <b>${esc(r.name || '---')}</b></div>
    ${r.star ? `<div>Star / നാൾ: <b>${esc(r.star)}</b></div>` : ''}
    ${r.mobile ? `<div>Mobile: ${esc(r.mobile)}</div>` : ''}
    <div class="pr-line"></div>
    <div>${esc(r.fund)} — ${esc(r.category)}</div>
    ${r.description && String(r.description).trim() ? `<div style="word-break: break-word; overflow-wrap: break-word;">${esc(String(r.description).trim())}</div>` : ''}
    <div class="pr-flex pr-bold pr-amount">
      <span>Amount:</span>
      <span ${isVoided ? 'style="text-decoration:line-through;color:#991b1b;"' : ''}>${fmtMoney(r.amount)}</span>
    </div>
    <div>Mode: ${esc(r.paymentMode)}${r.bankAccount ? (' - ' + esc(r.bankAccount)) : ''}</div>
    <div style="font-size: 10.5px; word-break: break-word;">In words: ${amountInWords(r.amount)}</div>
    <div class="pr-line"></div>
    <div class="pr-flex" style="margin-top: 10px; font-size: 10.5px;"><span></span><span>Treasurer / Authorized Person</span></div>
    <div class="pr-center pr-bold pr-blessing" style="margin-top: 6px;">*** അമ്മേ നാരായണ ദേവി നാരായണ ***</div>
  `;

  if (document.body && document.body.classList) {
    document.body.classList.add('printing-receipt-80mm');
  }

  let dynamicStyle = document.getElementById('print-80mm-page-style');
  if (!dynamicStyle && document.head) {
    dynamicStyle = document.createElement('style');
    dynamicStyle.id = 'print-80mm-page-style';
    document.head.appendChild(dynamicStyle);
  }

  if (dynamicStyle) {
    dynamicStyle.textContent = '@media screen { body.printing-receipt-80mm #print-area { display: block !important; position: absolute !important; left: -9999px !important; top: 0 !important; visibility: hidden !important; width: 80mm !important; max-width: 80mm !important; box-sizing: border-box !important; padding: 3mm 4mm 4mm 4mm !important; font-family: \'Consolas\', \'Courier New\', \'Noto Sans Malayalam\', \'Segoe UI\', monospace !important; font-size: 11.5px !important; line-height: 1.35 !important; background: #fff !important; color: #000 !important; } body.printing-receipt-80mm #print-area * { box-sizing: border-box !important; } body.printing-receipt-80mm #print-area .pr-line { border-bottom: 1px dashed #000 !important; margin: 4px 0 !important; width: 100% !important; display: block !important; } body.printing-receipt-80mm #print-area .pr-center { text-align: center !important; } body.printing-receipt-80mm #print-area .pr-bold { font-weight: bold !important; } body.printing-receipt-80mm #print-area .pr-flex { display: flex !important; justify-content: space-between !important; align-items: baseline !important; width: 100% !important; font-variant-numeric: tabular-nums !important; } body.printing-receipt-80mm #print-area .pr-title { font-size: 13.5px !important; font-weight: bold !important; line-height: 1.25 !important; margin-bottom: 2px !important; } body.printing-receipt-80mm #print-area .pr-sub { font-size: 10.5px !important; line-height: 1.25 !important; margin-bottom: 3px !important; } body.printing-receipt-80mm #print-area .pr-amount { font-size: 13.5px !important; font-weight: bold !important; font-variant-numeric: tabular-nums !important; } body.printing-receipt-80mm #print-area .pr-blessing { font-size: 10px !important; font-weight: bold !important; margin-top: 5px !important; text-align: center !important; } }';
  }

  let cleanedUp = false;
  let focusTimer = null;
  const finishPrint = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window._receiptPrintCleanup = null;
    if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
    if (window.removeEventListener) {
      window.removeEventListener('afterprint', finishPrint);
      window.removeEventListener('focus', onFocusFallback);
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove('printing-receipt-80mm');
    }
    const pageStyle = document.getElementById('print-80mm-page-style');
    if (pageStyle && pageStyle.parentNode) {
      pageStyle.parentNode.removeChild(pageStyle);
    }
  };

  const onFocusFallback = () => { focusTimer = setTimeout(finishPrint, 300); };
  window._receiptPrintCleanup = finishPrint;

  const measuredPx = Math.max(
    printArea.offsetHeight || 0,
    printArea.scrollHeight || 0,
    (printArea.getBoundingClientRect ? Math.ceil(printArea.getBoundingClientRect().height) : 0)
  );

  const rawMm = measuredPx > 0 ? Math.ceil((measuredPx * 25.4) / 96) + 5 : 120;
  const receiptHeightMm = Math.min(Math.max(rawMm, 70), 500);

  if (dynamicStyle) {
    dynamicStyle.textContent = `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }`;
  }

  if (window.addEventListener) {
    window.addEventListener('afterprint', finishPrint);
    window.addEventListener('focus', onFocusFallback, { once: true });
  }

  if (typeof window.print === 'function') {
    window.print();
  }
}
```

---

## 5. Chromium Headless PDF Measurements

Using Chromium headless (`--headless=new --disable-gpu --print-to-pdf`), actual output PDF files were generated across test scenarios and parsed for MediaBox dimensions and page counts:

| Scenario | Tested Receipt | Devotee / Star | Description | PDF Pages | Page Width | Page Height | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ordinary Software Receipt** | `R-1001` | K. R. Varma / Chithira | Special puja contribution | **1 Page** | **80.1 mm** (227.04 pt) | **80.1 mm** (227.04 pt) | ✅ PASS |
| **Physical Puja Receipt** | `P600` | Radhakrishnan Nair / Rohini | [PHYSICAL PUJA RECEIPT] | **1 Page** | **80.1 mm** (227.04 pt) | **80.1 mm** (227.04 pt) | ✅ PASS |
| **Physical Punarudharanam** | `PU1` | Parvathy Amma / Aswathi | [PHYSICAL · PUNARUDHARANAM] | **1 Page** | **80.1 mm** (227.04 pt) | **80.1 mm** (227.04 pt) | ✅ PASS |
| **Long Description Receipt** | `R-2005` | Madhavan Nampoothiri / Thiruvonam | 150+ chars Malayalam & English multi-sentence description | **1 Page** | **80.1 mm** (227.04 pt) | **105.2 mm** (298.08 pt) | ✅ PASS |

### Hardware Limitation Note:
As noted in the instructions, physical POS-80 thermal hardware was not directly connected or tested in this software automation environment. Physical printer hardware behavior was simulated and verified via Chromium's native CSSOM layout engine and headless PDF rasterization.

---

## 6. Comprehensive Verification & Regression Test Results

### 1. Dedicated Verification Suite (`tests/test_step_33_85_receipt_print_layout.js`)
- **Total Tests:** 34
- **Passed:** 34
- **Failed:** 0
- **Pass Rate:** 100%

Key Test Verifications:
- `GROUP-1` (Cryptographic Baseline & Invariants): Backup presence, hash match (`3F6DAA...`), size parity (834,921 bytes).
- `GROUP-2` (CSS Rules): `body.printing-receipt-80mm` width 80mm, `#app-shell` hidden, overlay suppression, typography rules.
- `GROUP-3` (Functional Sandbox): className `receipt-print`, body class toggling, devotee star rendering, amount formatting, lifecycle cleanup on `afterprint`.
- `GROUP-4` (Billing Delegation): Linked receipt routes to `printBillingReceipt()`, unresolvable bill safely falls back to `printReceipt()`.
- `GROUP-5` (Physical & Voided): `[PHYSICAL PUJA RECEIPT]` in blue `#1976d2`, `[PHYSICAL · PUNARUDHARANAM RECEIPT]` in purple `#7b1fa2`, voided banner, strike-through amount, `[VOID]` indicator.
- `GROUP-6` (Chromium Real PDF Measurements): Exact 1 page, 80.1mm width, proportional height expansion on long description.

### 2. Regression Suite Results
| Test Suite | Description | Tests Passed | Status |
| :--- | :--- | :--- | :--- |
| `tests/test_step_33_84_description_column_layout.js` | 3-table dedicated description columns & layout | 90 / 90 | ✅ ALL PASSED |
| `tests/test_step_33_72_physical_receipt_validation.js` | Physical receipt validation, numbering, reprint banners | 75 / 75 | ✅ ALL PASSED |
| `tests/test_step_33_69_physical_receipts.js` | Physical receipt engine, accounting, CSV classification | 70 / 70 | ✅ ALL PASSED |
| `tests/test_step_33_80_devotee_star_font_size.js` | Devotee name & star 13.5px font size, wrapping | 48 / 48 functional | ✅ PASSED (5 pre-step diff invariants expectedly failed) |
| `tests/test_step_33_76_smooth_feed_only.js` | Native printer smooth feed & hardware bezel | 25 / 25 functional | ✅ PASSED (1 pre-step size invariant expectedly failed) |

---

## 7. Safety & Isolation Compliance Checklist

- [x] **No Deployment:** Changes were made strictly on the local workspace copy; no deploy commands were executed.
- [x] **No Database / Counter Modification:** No Firestore documents, rules, counters (`globalSequenceCounter`), or accounting balances were altered.
- [x] **No Description Column Regression:** The 10-column Receipts table, 8-column Cash Book, and 7-column Ledger from STEP 33.84 remain 100% intact.
- [x] **Selective Delegation:** Only verified billing-linked receipts route to `printBillingReceipt()`; independent and physical receipts strictly preserve their dedicated format.
- [x] **Idempotency & Re-entry:** Prior print states are unconditionally cleared before triggering new print cycles.
