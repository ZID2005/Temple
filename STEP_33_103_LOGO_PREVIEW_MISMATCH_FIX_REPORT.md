# STEP 33.103 — Logo Mismatch in Receipt Ready Preview Fix Report

**Execution Date:** 2026-10-18  
**Scope:** `Temple_Accounts-1.html`, `tests/test_step_33_103_logo_preview_fix.js`  
**Classification:** Screen Preview & CSS Presentation Layer Bug Fix (Non-Destructive)

---

## 1. Executive Summary

In **STEP 33.103**, the visual distortion and mismatch between the deity logo on the printed 80mm thermal receipt and the on-screen **Receipt Ready** modal/preview was investigated, diagnosed, and resolved.

- **Root Cause:** Both the on-screen preview (`renderBillingReceiptPreview`) and the print pipeline (`printBillingReceipt`) call the identical underlying function `renderThermalReceiptHTML` and embed the exact same Base64 monochrome image asset `TEMPLE_DEITY_LOGO_B64` (a 300 × 450 px, 1-bit Floyd-Steinberg dithered bitmap). In print media (`@media print`), high-density rasterization (203–300+ DPI) smoothly blends the binary dither micro-dots into continuous grayscale shading. However, on screen (96 DPI), the CSS class `.th-deity-logo` specified `image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;`. In the Chromium/Blink screen compositor, `crisp-edges` forces **nearest-neighbor point sampling** (`kNearestNeighbor`), which dropped 75% of the pixel rows and columns when downscaling 300px to 20mm (75.6px). This point-sampling destroyed the delicate dither pattern, resulting in catastrophic aliasing, severe high-frequency noise, dark pixel clumping, and facial distortion in the preview.
- **Resolution:** Updated `.th-deity-logo` in the screen CSS to `image-rendering: auto;`. This restores standard sub-pixel area averaging (bilinear/bicubic filtering) in the screen compositor, reconstructing the exact grayscale tones and fine details of the deity's face, crown, ornaments, throne, and parasol, perfectly matching the print receipt.
- **Invariants Preserved:** The print CSS (`#print-area.billing-80mm .th-deity-logo`), print layout, QR code rendering (`.th-upi-qr`), "SCAN TO PAY" caption, billing calculation logic, receipt numbering, accounting synchronization, and Firestore security rules remained 100% untouched.

---

## 2. Cryptographic Baseline & Backup Invariants

### 2.1 Application File Measurements
| Metric | Pre-Change Baseline | Timestamped Backup | Post-Implementation State | Status |
| :--- | :--- | :--- | :--- | :--- |
| **File Path** | `D:\Temple\Temple_Accounts-1.html` | `D:\Temple\Temple_Accounts-1_PreStep33_103_LogoPreviewFix_Backup_20261018_160800.html`<br>`D:\Temple\backups\Temple_Accounts-1_PreStep33_103_LogoPreviewFix_Backup_20261018_160800.html` | `D:\Temple\Temple_Accounts-1.html` | Verified |
| **SHA-256** | `569AF29CA28F88E91E2354D8921DE2034C49E4F105BF6F50211FDC0A4D80E794` | `569AF29CA28F88E91E2354D8921DE2034C49E4F105BF6F50211FDC0A4D80E794` | `75B334C39BE33813D798944B553B27DFCAE2196EF6B4498A2AF09A33846AEE43` | **MATCHED** |
| **File Size** | `969,748` bytes | `969,748` bytes | `969,691` bytes | **-57 bytes** |
| **Line Count** | 22,589 lines (LF) | 22,589 lines (LF) | 22,588 lines (LF) | **-1 line** |

### 2.2 Unchanged Invariant System Files
- `firestore.rules`: SHA-256 `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` (**UNTOUCHED**)
- `server.js`: Unchanged (**UNTOUCHED**)
- Accounting logic, receipt numbering, transaction validation, and Firestore queries: (**UNTOUCHED**)
- UPI QR code and "SCAN TO PAY" section: (**UNTOUCHED**)

---

## 3. Root Cause Analysis

### 3.1 Architectural Investigation
Investigation of `renderThermalReceiptHTML`, `renderBillingReceiptPreview`, and `printBillingReceipt` revealed:
1. **Shared Single-Source Generator:** Both the print output and the on-screen Receipt Ready modal use the exact same template generator `renderThermalReceiptHTML(r, templeName, templeAddress)` and the exact same Base64 image constant:
   ```javascript
   const deityLogoSrc = (typeof TEMPLE_DEITY_LOGO_B64 !== 'undefined' && TEMPLE_DEITY_LOGO_B64) 
     ? TEMPLE_DEITY_LOGO_B64 
     : ((typeof window !== 'undefined' && window.TEMPLE_DEITY_LOGO_B64) ? window.TEMPLE_DEITY_LOGO_B64 : 'assets/temple_deity_logo_bw.png');
   ```
2. **Asset Fidelity:** `TEMPLE_DEITY_LOGO_B64` matches `D:\Temple\assets\temple_deity_logo_bw.png` (SHA256 `C852A4847E46896178F9FED11AAA8E47D11685CF34C9F0A434CDB6E2494A9FE6`, 16,188 bytes, 300 × 450 px). It is a 1-bit Floyd-Steinberg dithered representation of Sri Marutha Chamundi Devi.
3. **The Discrepancy Mechanism:**
   - **Print Environment:** When sent to PDF or a physical thermal printer, rasterization occurs at 203 to 300+ DPI. At 300 DPI, 20mm is ~236 pixels (closely matching the native 300px width), and the printer/PDF compositor rasterizes the vector image at native print resolution without nearest-neighbor downsampling.
   - **Screen Preview Environment:** On screen (96 DPI standard CSS display), 20mm corresponds to `20 × 96 / 25.4 = 75.59 px`. In screen CSS:
     ```css
     .th-deity-logo {
       width: 20mm;
       max-width: 20mm;
       height: auto;
       aspect-ratio: 300 / 450;
       display: block;
       margin: 0 auto;
       object-fit: contain;
       image-rendering: -webkit-optimize-contrast;
       image-rendering: crisp-edges;
     }
     ```
     `image-rendering: crisp-edges` instructs the Chromium compositor to disable bilinear/bicubic filtering and apply **nearest-neighbor sampling**. Point-sampling a dithered 1-bit image down by ~4:1 causes extreme moiré patterns and noise: alternating single-pixel black dots either hit or miss sample points randomly, clumping into dark blotches and distorting facial features.

---

## 4. Code Changes Summary

### 4.1 Modified CSS in [Temple_Accounts-1.html](file:///D:/Temple/Temple_Accounts-1.html)
Modified lines 3812–3817 in `<style>`:
```diff
     .th-deity-logo {
       width: 20mm;
       max-width: 20mm;
       height: auto;
       aspect-ratio: 300 / 450;
       display: block;
       margin: 0 auto;
       object-fit: contain;
-      image-rendering: -webkit-optimize-contrast;
-      image-rendering: crisp-edges;
+      image-rendering: auto;
     }
```

### 4.2 Exact Scope Boundaries
- **No changes to print styles:** `#print-area.billing-80mm .th-deity-logo` retains its print rules (`width: 20mm !important; image-rendering: crisp-edges !important;`).
- **No changes to QR code:** `.th-upi-qr` retains `width: 28mm; height: 28mm; image-rendering: pixelated;` for sharp, high-contrast module recognition.
- **No changes to billing/accounting logic:** Zero changes to `fsCreateBillingWithAccounting`, `computeReceiptFingerprint`, `DynamicButton`, or IDB/Firestore stores.

---

## 5. Verification & Test Evidence

### 5.1 Dedicated Verification Suite: [`test_step_33_103_logo_preview_fix.js`](file:///D:/Temple/tests/test_step_33_103_logo_preview_fix.js)
```
TOTAL TESTS: 31 | PASSED: 31 | FAILED: 0
```
- **Group 1 (Cryptographic Invariants & Backup):** 6 tests PASSED.
- **Group 2 (Screen Preview & Print CSS Verification):** 10 tests PASSED (Confirmed: Screen CSS defines `.th-deity-logo` with `image-rendering: auto;`, no `crisp-edges`, print CSS untouched).
- **Group 3 (Image Asset & Rendering Logic Invariance):** 5 tests PASSED (Confirmed: Byte-identical `TEMPLE_DEITY_LOGO_B64`, shared `renderThermalReceiptHTML` pipeline).
- **Group 4 (DOM Ordering, QR Code & Billing Integrity):** 3 tests PASSED (Confirmed: Strict order Logo -> Title -> Details -> Blessing -> SCAN TO PAY -> QR preserved).
- **Group 5 (Headless Chromium Visual Rendering & Fidelity Analysis):** 4 tests PASSED:
  - Headless Chrome rendered on-screen preview screenshot (`tests/step_33_103_preview_screen.png`).
  - Python Pillow analysis of the on-screen preview logo confirmed smooth continuous-tone grayscale gradation (**32.39% intermediate tones**, well above the 20% threshold; baseline had 0% intermediate tones due to binary nearest-neighbor clumping).
  - Contrast standard deviation of 89.26 matches expected natural thermal print gradient.
  - Live QR code scan directly off the rendered on-screen receipt decoded to `upi://pay?pn=ASARI%20VILAKAM%20MARUTHA%20CHAMUNDI%20DEVI%20TEMPLE&mode=01&pa=917306611995@waicici`.
- **Group 6 (Isolation from Unrelated Views):** 3 tests PASSED (Accounts print, Chitty, and Ledger PDF views unpolluted).

### 5.2 Full Regression Suite Runs
| Test Suite | Purpose | Tests | Result |
| :--- | :--- | :--- | :--- |
| `tests/test_step_33_103_logo_preview_fix.js` | Dedicated Step 33.103 Verification | 31 / 31 | **100% PASS** |
| `tests/test_step_33_102_logo_qr.js` | Logo & UPI QR Integration & 80mm Print Layout | 37 / 37 | **100% PASS** |
| `tests/test_step_33_85_receipt_print_layout.js` | 80mm Thermal Receipt Layout & Reprint Routing | 34 / 34 | **100% PASS** |
| `tests/test_step_33_94_billing_sync.js` | Accounting Fund Synchronization & Cash Book Integrity | 48 / 48 | **100% PASS** |
| `tests/test_step_33_96_fund_validation.js` | Transaction-Level Fund Validation & Idempotency | 35 / 35 | **100% PASS** |
| **Combined** | **Complete System Regression** | **185 / 185** | **100% PASS** |

---

## 6. Visual Comparison Evidence

Real Headless Chromium side-by-side rendering evidence captured during investigation:
- **Baseline Screenshot (Distorted):** `card1_crisp_edges.png` exhibited severe pixelation and dark blotches due to `kNearestNeighbor` point sampling.
- **Fixed Preview Screenshot:** `card2_auto.png` and `preview_comparison_headers.png` (Column 2) show smooth, high-fidelity sub-pixel area averaging, clearly displaying the deity's facial details, crown, jewellery, pose, throne, and parasol.
- **Print Comparison:** The on-screen preview now visually matches the 203 DPI printed thermal receipt (`tests/step_33_102_e2e_rendered.png`) in clarity, proportions, and detail.
