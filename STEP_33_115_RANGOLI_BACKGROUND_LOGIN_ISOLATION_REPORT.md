# STEP 33.115 — Rangoli Background, Login Isolation & Progress Indicator Removal Report

**Project:** Temple Accounts & Fund Management  
**Target File:** `D:\Temple\Temple_Accounts-1.html`  
**Execution Date:** 2026-10-19  

---

## 1. Baseline Verification & Backup Integrity

Before applying any code changes, the baseline file was inspected, measured, and backed up:

| Property | Pre-Edit Baseline | Post-Edit Result |
| :--- | :--- | :--- |
| **File Path** | `D:\Temple\Temple_Accounts-1.html` | `D:\Temple\Temple_Accounts-1.html` |
| **File Size** | 1,651,944 bytes | 1,653,636 bytes |
| **SHA-256 Hash** | `749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35` | `985909723BAFC070C624CDC0ADB5A998CD5025370F2BB79CB083E0F55BD10F28` |
| **Line Endings** | Pure LF (`cr: 0, lf: 23453`) | Pure LF (`cr: 0, lf: 23502`) |
| **Byte-for-Byte Backup** | `D:\Temple\Temple_Accounts-1_PreStep33_115_RangoliBackgroundLoginIsolation_Backup_20261019_004700.html` | **Verified Identical** (Hash: `749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35`) |

---

## 2. Root Cause Analysis

### Issue A: Excessive Cream-White Spotlight Oval
* **Cause:** `#rangoli-welcome .rgp-close` possessed a dense radial gradient:
  ```css
  background: radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90) 0%, rgba(255, 244, 222, 0.58) 55%, rgba(255, 244, 222, 0) 80%);
  ```
  This created an opaque, artificially bright oval badge that washed out the natural red-oxide mineral texture and detached the Malayalam text from the floral Rangoli.
* **Fix:** Replaced the radial gradient with `background: transparent; box-shadow: none;` while retaining the warm, dark non-black text colours (`#38140c` for temple blessing, `#260c06` for Swagatham) and gentle dual-layer typography text-shadows (`rgba(255, 255, 255, 0.85)` and `rgba(247, 207, 42, 0.35)`).

### Issue B: Numeric Percentage HUD (`084%`)
* **Cause:** The welcome markup included `<div class="rgp-corner rgp-br"><span id="rangoli-count">000%</span></div>`, styled with fixed monospaced tabular numbers and continuously updated by `pctLast` in the JavaScript `frame()` loop.
* **Fix:** Completely eliminated `#rangoli-count` and `.rgp-br` from HTML, stripped `.rgp-br` and `.rgp-count` CSS rules, removed ARIA progressbar attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`), and removed `countEl` references from the animation loop without touching the internal progression curve or timing.

### Issue C: Red-Oxide Background Leak on Login Screen
Visual analysis of the browser lifecycle revealed three interlocking issues that caused the red-oxide floor to leak into the login screen:
1. **Scope Error on `setLocal`:** `setLocal(p)` was defined inside the `init(options)` function closure. When `openGate()` or external handlers were called, invoking `setLocal("open")` threw an `Uncaught ReferenceError: setLocal is not defined`, crashing execution before `root.classList.add('rgp-hidden')` or `destroy()` could execute.
2. **Lifecycle Gate Stall in `checkAndProceed()`:** The coordinator previously checked:
   ```javascript
   if (!rangoliFinished || !authStateResolved) return;
   ```
   If Firebase authentication was delayed, unauthenticated, or running in an offline environment, `authStateResolved` remained `false` when the 12-second Rangoli animation concluded. Consequently, `openGate()` was never called, leaving the RAF loop running and drawing the red-oxide floor indefinitely.
3. **Incomplete CSS Suppression:** `#rangoli-welcome` lacked an absolute dismissal CSS state (`.rgp-dismissed`). Even if opacity was set to 0, underlying elements or partial transitions could leak through.
* **Fix:**
  - Hoisted `setLocal(p)` to module scope within `RangoliPreloader`.
  - Added auto-open safety timer (300ms fallback) when the `clear` phase finishes.
  - Decoupled `checkAndProceed()` so that once Rangoli finishes, unauthenticated users cleanly transition to the login screen on schedule without revealing protected content.
  - Implemented `.rgp-dismissed` rule in CSS (`display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; background: transparent !important; z-index: -1 !important;`).
  - Hardened `destroy()` to set inline `display: none; background: transparent; z-index: -1;`, clear canvas context, and zero canvas dimensions.
  - Handled `logout=true` / `#logout` URL signals to immediately bypass Rangoli and show the login card directly.

---

## 3. Visual Evidence & Rendered Verification

Visual tests were executed using headless Chrome across desktop, mobile, and logout states. Rendered screenshots were captured directly into the artifacts directory:

- Desktop Hold Greeting: `step33_115_desktop_02_hold_greeting.png`
- Desktop Revealed Login: `step33_115_desktop_04_login_revealed.png`
- Mobile Hold Greeting: `step33_115_mobile_01_hold_greeting.png`
- Mobile Revealed Login: `step33_115_mobile_02_login_revealed.png`
- Desktop Immediate Direct Logout: `step33_115_desktop_logout_direct.png`

### Key Visual Observations
1. **Welcome Screen:** The natural `#5c1a12` red-oxide floor texture with subtle radial vignette and mineral speckles is fully preserved. The colourful Rangoli (turmeric, marigold, vermilion, magenta, indigo, rice flour) remains centered and vibrant.
2. **Malayalam Typography:** "മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം" and "സ്വാഗതം" are rendered crisply without an artificial white oval badge, seamlessly integrated into the Rangoli art.
3. **No Progress HUD:** The bottom-right corner is completely empty across desktop and mobile. No `084%`, `100%`, or progress container appears.
4. **Login Screen Isolation:** Upon animation completion (or direct logout), `#rangoli-welcome` is completely hidden and non-rendering (`display: none; background: transparent; z-index: -1`). The login card sits on its original dark purple/black WebGL veil background (`#0d0b0e`).

---

## 4. Animation Timing Preservation

All revised timing constants from STEP 33.114 were preserved down to the millisecond:

| Phase | Constant | Duration | Target Range | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Drawing** | `DURATION_MS` | 5,500 ms (5.5s) | 5.0 – 6.0s | **Exact** |
| **Appreciation Hold** | `HOLD_MS` | 3,500 ms (3.5s) | 3.0 – 4.0s | **Exact** |
| **Wind Gust** | `WIND_MS` | 2,200 ms (2.2s) | — | **Exact** |
| **Dispersal Clear** | `CLEAR_MS` | 800 ms (0.8s) | 2.5 – 3.5s (wind+clear: 3.0s) | **Exact** |
| **Destination Fade** | `OPEN_MS` | 900 ms (0.9s) | 0.8 – 1.0s | **Exact** |
| **Total Experience** | Sum | **12,900 ms (~12.9s)** | **12.0 – 15.0s** | **Exact** |

`prefers-reduced-motion: reduce` support and the 16-second watchdog safety timeout remain active.

---

## 5. Automated Test Suite Results

The dedicated test suite `tests/test_step_33_115_rangoli_cleanup.js` was executed:

```
================================================================================
STEP 33.115: RANGOLI BACKGROUND, LOGIN ISOLATION & PROGRESS INDICATOR REMOVAL
================================================================================

--- TEST GROUP 1: Baseline, Backups, and File Integrity ---
  ✅ [PASS] GROUP-1 / T1.1: Main HTML file exists at Temple_Accounts-1.html
  ✅ [PASS] GROUP-1 / T1.2: Main HTML file has updated content and valid size (Size: 1653636 bytes, Hash: 985909723BAFC070C624CDC0ADB5A998CD5025370F2BB79CB083E0F55BD10F28)
  ✅ [PASS] GROUP-1 / T1.3: Pre-implementation byte-for-byte backup exists
  ✅ [PASS] GROUP-1 / T1.4: Backup matches exact pre-change baseline hash (Backup Hash: 749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35, Size: 1651944)
  ✅ [PASS] GROUP-1 / T1.5: firestore.rules remains untouched and unmodified (Rules Hash: 7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD)
  ✅ [PASS] GROUP-1 / T1.6: Main HTML file preserves pure LF line endings (0 CR bytes) (CR count: 0)

--- TEST GROUP 2: Spotlight Removal and Malayalam Typography ---
  ✅ [PASS] GROUP-2 / T2.1: Excessive cream-white radial-gradient spotlight is completely removed
  ✅ [PASS] GROUP-2 / T2.2: Greeting container uses transparent background with no visible plate
  ✅ [PASS] GROUP-2 / T2.3: Deep red-oxide floor background color is preserved
  ✅ [PASS] GROUP-2 / T2.4: Malayalam blessing and Swagatham preserve warm dark non-black text colours
  ✅ [PASS] GROUP-2 / T2.5: Malayalam Unicode typography preserved without character corruption

--- TEST GROUP 3: Complete Progress Indicator Removal ---
  ✅ [PASS] GROUP-3 / T3.1: Numeric percentage element (#rangoli-count) is completely removed from DOM
  ✅ [PASS] GROUP-3 / T3.2: Bottom-right HUD container (.rgp-br) is completely removed from HTML
  ✅ [PASS] GROUP-3 / T3.3: HUD styles (.rgp-br and .rgp-count) are removed from CSS
  ✅ [PASS] GROUP-3 / T3.4: Progressbar ARIA role removed from #rangoli-welcome
  ✅ [PASS] GROUP-3 / T3.5: Progress counter DOM update logic is removed from JavaScript

--- TEST GROUP 4: Login Isolation & Background Leak Elimination ---
  ✅ [PASS] GROUP-4 / T4.1: .rgp-dismissed rule enforces absolute visual and layout elimination
  ✅ [PASS] GROUP-4 / T4.2: All child elements under .rgp-dismissed are guaranteed hidden
  ✅ [PASS] GROUP-4 / T4.3: setLocal is module-scoped in RangoliPreloader, preventing openGate ReferenceError
  ✅ [PASS] GROUP-4 / T4.4: destroy() sets transparent background and adds rgp-dismissed
  ✅ [PASS] GROUP-4 / T4.5: destroy() suppresses gate display and disarms data-phase
  ✅ [PASS] GROUP-4 / T4.6: Logout explicitly tears down Rangoli and applies rgp-dismissed
  ✅ [PASS] GROUP-4 / T4.7: Logout URL query/hash directly bypasses Rangoli on page initialization
  ✅ [PASS] GROUP-4 / T4.8: checkAndProceed transitions cleanly to login if unauthenticated without hanging

--- TEST GROUP 5: Preserved Deliberate Timing and Reduced Motion ---
  ✅ [PASS] GROUP-5 / T5.1: Exact animation timings preserved (5.5s draw, 3.5s hold, 3.0s dispersal, 0.9s open = 12.9s)
  ✅ [PASS] GROUP-5 / T5.2: Prefers-reduced-motion media query and JS detection preserved
  ✅ [PASS] GROUP-5 / T5.3: 16-second watchdog safety timeout preserved

--- TEST GROUP 6: Preserved Accounting, Receipts, and Core Integrity ---
  ✅ [PASS] GROUP-6 / T6.1: Thermal receipt generation function renderThermalReceiptHTML preserved untouched
  ✅ [PASS] GROUP-6 / T6.2: Production Firebase configuration with project ID temple-f4f7d intact
  ✅ [PASS] GROUP-6 / T6.3: Receipt print styles and media print rules intact
  ✅ [PASS] GROUP-6 / T6.4: Accounting and IndexedDB core functions preserved intact

================================================================================
TEST SUITE RESULTS: 31 PASSED, 0 FAILED (TOTAL: 31)
================================================================================
```

Regression test `tests/test_step_33_94_billing_sync.js` was also run: **48 PASSED, 0 FAILED**.

---

## 6. Safety & Non-Interference Confirmation

In strict compliance with instructions:
- **Zero Firestore reads or writes** were initiated against production.
- **Zero database records** were created, modified, voided, or deleted.
- **No changes** were made to `firestore.rules` or `firestore.rules.candidate`.
- **No accounting, billing, receipt printing, or financial calculation logic** was modified.
- **No deployment** to Vercel occurred.
- Only `D:\Temple\Temple_Accounts-1.html` was edited, and its line endings remain pure LF (0 CR bytes).
