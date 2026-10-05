# STEP 26.4 — FONT SMOOTHING CONTROLLED AUDIT & SHARPNESS COMPARISON REPORT

**Temple Accounting & Fund Management System**  
**Execution Date:** 03 October 2026  
**Auditor & Forensic Engineer:** Antigravity Forensic Engineering  
**Target File:** `d:\Temple\Temple_Accounts-1.html`  
**Status:** **CONTROLLED AUDIT COMPLETE — 100% PRODUCTION SAFETY MAINTAINED**  
**Final Verdict:** **PASS (Zero Code Changes — Case B / Case C Recommendation: Preserve Existing Declarations)**  

---

## 1. Current Font-Smoothing Configuration

In `d:\Temple\Temple_Accounts-1.html` (lines 145–152), the root stylesheet defines global font properties on `body`:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Malayalam", "Manjari", "Gayathri", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### Forensic Analysis of the Active Properties:
1. **`-moz-osx-font-smoothing: grayscale;`**:
   - Vendor prefix: Gecko / Mozilla Firefox.
   - Platform constraint: macOS (OS X) only.
   - Behavior in Chromium (Blink) on Windows: Completely ignored. `getComputedStyle(document.body).getPropertyValue('-moz-osx-font-smoothing')` evaluates to `""` (empty string).
   - Behavior in Firefox on Windows: Completely ignored. The `-osx-` suffix restricts execution strictly to macOS.
2. **`-webkit-font-smoothing: antialiased;`**:
   - Vendor prefix: WebKit / Blink.
   - Historically designed to disable subpixel anti-aliasing (ClearType / Quartz subpixel) and force grayscale antialiasing on macOS.
   - Behavior in Chromium on Windows DirectWrite: Evaluated under controlled test conditions in this audit.

---

## 2. Test Methodology

The audit was executed as a **strictly non-destructive, non-production controlled experiment**:
1. **Zero Source Modification:** The production file `d:\Temple\Temple_Accounts-1.html` was not modified during testing. Its SHA-256 hash and LastWriteTime (`2026-10-03 00:24:00`) remained completely untouched.
2. **Direct Browser Runtime Control:** The application was loaded in its live environment at `http://localhost:3000/Temple_Accounts-1.html` connected via Chrome DevTools Protocol (CDP) WebSocket interface on port `9222`.
3. **Three Controlled States Tested:**
   - **State A (Current Production):**
     `-webkit-font-smoothing: antialiased !important; -moz-osx-font-smoothing: grayscale !important;`
   - **State B (Native / Default Value):**
     `-webkit-font-smoothing: auto !important; -moz-osx-font-smoothing: auto !important;`
   - **State C (Browser Default / Unset):**
     `document.body.style.removeProperty('-webkit-font-smoothing'); document.body.style.removeProperty('-moz-osx-font-smoothing');`
4. **Compositing Control Verification:** Prior to capturing snapshots, every view was monitored to confirm:
   - `#app-main` was freed of `.view-enter-active` (`transform: none`, `will-change: auto`).
   - In-view `[data-motion]` elements were fully transitioned into `.motion-settled` (`transform: none`, `will-change: auto`).
5. **Exact Pixel Extraction:** Viewport-clipped PNG screenshots were captured via CDP `Page.captureScreenshot` at native 100% device scale factor. Byte buffers and HTML5 Canvas raw pixel matrices (`ctx.getImageData()`) were evaluated pixel-by-pixel across Red, Green, Blue, and Alpha channels.
6. **State Cleanup:** Immediately upon test completion, all temporary browser overrides and emulation metrics were cleared, returning the browser to its exact pristine state.

---

## 3. Browser / Platform Environment

The audit was executed directly inside the production target browser environment:
- **Operating System:** Windows 10/11 Enterprise x64 (Win32 API)
- **Browser:** Google Chrome `154.0.8037.93` (Official Build)
- **Platform User Agent:** `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36`
- **Rendering Engine:** Blink / Skia DirectWrite
- **Device Pixel Ratio (DPR):** `1.0` (Standard 100% desktop DPI scale)
- **Screen Resolution:** `1920 × 1080`
- **Application URL:** `http://localhost:3000/Temple_Accounts-1.html`
- **Local Dev Server:** Node.js v24.14.0 HTTP server on port 3000

---

## 4. Viewports Tested

In accordance with Section 3 requirements, all controlled comparisons were executed across 5 standard responsive viewports:

| Viewport Width | Viewport Height | Mode | Target Device Class | Elements Evaluated |
| :---: | :---: | :---: | :---: | :---: |
| **1440px** | 900px | Desktop | Standard Desktop / Laptop Display | 17 representative elements |
| **1024px** | 900px | Desktop / Tablet | Small Laptop / iPad Pro Landscape | 17 representative elements |
| **768px** | 900px | Mobile / Tablet | iPad Portrait / Large Tablet | 16 representative elements |
| **600px** | 900px | Mobile Drawer | Small Tablet / Phablet | 15 representative elements |
| **480px** | 900px | Mobile Phone | Standard Mobile Phone Screen | 15 representative elements |

---

## 5. Elements Compared

Across the 5 viewports, **80 element comparisons** were conducted spanning the 6 primary functional application modules:

### 1. Dashboard
- **Hero Heading:** `#app-main .dash-hero-title` (23px Malayalam script header: *മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം*)
- **Statistics:** `#app-main .dash-sub-value` (18px tabular numeric currency: *₹0.00*)
- **Card Labels:** `#app-main .dash-card-label` (12px uppercase tracked label: *CURRENT LIQUID POSITION*)
- **Buttons:** `#app-main .dash-primary-cta` (15px bold action button: *+ New Bill*)

### 2. Tables (Cash Book)
- **Table Headings:** `#app-main th` (12px uppercase table column headings: *DATE, PARTICULARS, VOUCHER, RECEIPTS, PAYMENTS, BALANCE*)
- **Table Body:** `#app-main td` (13px tabular body text: *26-09-2026, Opening Balance*)
- **Totals / Banner:** `#app-main .balance-banner` (15px bold closing cash banner)

### 3. Billing
- **Category Labels:** `#app-main .cat-pill-title` (14px category tab: *വഴിപാട്*)
- **Item Chips:** `#app-main .billing-item-chip` (13px pooja selection chip: *അർച്ചന ₹20*)
- **Payment Controls:** `#app-main .pm-text` (14px payment mode label: *CASH*)
- **Total / Submit:** `#app-main .billing-submit-btn` (15px primary submit button: *GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക*)

### 4. Reports
- **Headings:** `#app-main h3` (15px section header: *📅 Daily / Range Report*)
- **Helper / Table Text:** `#app-main .muted` (13px muted explanatory copy)

### 5. Analytics
- **Card Labels:** `#app-main .analytics-header-title` (18px section title: *Analytics & Statistical Overview*)
- **Chart Subtitles:** `#app-main .analytics-header-subtitle` (13px explanatory subtitle)
- **Legends / Period:** `#app-main .analytics-period-display` (13px date indicator)

### 6. Settings
- **Form Labels:** `#app-main .form-group label` (13px field labels: *Temple Name, Financial Year*)
- **Inputs:** `#app-main .form-group input` (14px form input text)
- **Buttons:** `#app-main .btn-sm` (12px compact action buttons)

### 7. Auxiliary System Elements
- **Sticky Topbar Title:** `#topbar-title` (17px header title: *Dashboard*)
- **Sidebar Navigation Rail:** `.brand-title`, `.nav-item.active` (15px sidebar item)

---

## 6. Current Rendering Observations (State A: `antialiased`)

1. **Table Cells, Form Inputs, Badges, and Small UI Copy (11px–14px):**
   - Glyphs render with crisp, dark charcoal strokes on ivory/white surfaces.
   - Text edges use standard DirectWrite pixel-aligned antialiasing.
   - Under 100% browser zoom, letters are sharp, legible, and maintain strong contrast.
2. **Large Malayalam Heading (`.dash-hero-title`, 23px):**
   - The Malayalam font glyphs (*മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം*) render using **pure grayscale antialiasing**.
   - Edge pixels transition smoothly through intermediate luminance values without colored fringes.
   - Glyphs appear clean and well-balanced against the linear-gradient ivory card surface.
3. **Topbar & Sidebar:**
   - Topbar title (*Dashboard*) and active navigation item render cleanly with zero blur or edge distortion.

---

## 7. Native / Default Rendering Observations (State B: `auto` & State C: `unset`)

1. **Table Cells, Form Inputs, Badges, and Small UI Copy (11px–14px):**
   - **Byte-for-byte identical to State A.**
   - In Chromium DirectWrite on Windows, setting `auto` or removing `-webkit-font-smoothing` produces **zero change** in pixel rasterization for elements with background boundaries, table borders, or container cards.
   - Every single pixel in table cells (`th`, `td`), form labels, input boxes, billing chips, and stat labels matches State A with `0.00%` delta.
2. **Large Malayalam Heading (`.dash-hero-title`, 23px):**
   - When `-webkit-font-smoothing: auto` (or unset) is applied, DirectWrite activates **horizontal LCD subpixel antialiasing (ClearType)** on this specific element because it rests on an opaque surface.
   - Left-facing vertical glyph edges display red/orange subpixel fringing (`Δ(R - B) = +92`).
   - Right-facing vertical glyph edges display cyan/blue subpixel fringing (`Δ(B - R) = +54`).
   - At 100% native browser zoom, the heading appears slightly denser in horizontal weight, but on some LCD viewing angles faint chromatic fringes can be observed along high-contrast curved Malayalam glyph loops (*ണ്ഡ, മ്പി*).
3. **State B (`auto`) vs State C (`unset`):**
   - Across **100% of all 80 tests**, State B and State C produced identical byte files (`isIdentical_BC = true`). `auto` and `unset` behave identically in Chromium on Windows.

---

## 8. Side-by-Side Comparison Results

### Matrix Summary Across Viewports:

| Viewport | Element Tested | Selector | Sample Text | Identical A == B? | Diff % (A vs B) | Subpixel Mode Observed |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| **1440px** | Hero Heading | `#app-main .dash-hero-title` | *മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം* | **FALSE** | **21.23%** | ClearType (B) vs Grayscale (A) |
| **1440px** | Liquid Position | `#app-main .dash-sub-value` | *₹0.00* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Stat Card Label | `#app-main .dash-card-label` | *CURRENT LIQUID POSITION* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Primary CTA | `#app-main .dash-primary-cta` | *+ New Bill* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Table Header | `#app-main th` | *DATE* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Table Body Cell | `#app-main td` | *26-09-2026* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Balance Banner | `#app-main .balance-banner` | *Closing Cash Balance: ₹0.00* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Billing Cat Pill | `#app-main .cat-pill-title` | *വഴിപാട്* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Billing Item Chip | `#app-main .billing-item-chip`| *അർച്ചന ₹20* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Payment Mode | `#app-main .pm-text` | *CASH* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Billing Submit | `#app-main .billing-submit-btn`| *GENERATE BILL / ബിൽ* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Report Header | `#app-main h3` | *📅 Daily / Range Report* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Report Muted | `#app-main .muted` | *Full export instructions* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Analytics Header | `.analytics-header-title` | *Analytics & Statistical...* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Analytics Period | `.analytics-period-display` | *Period: 01 Oct → 03 Oct* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Settings Label | `#app-main .form-group label`| *Temple Name* | **TRUE** | **0.00%** | Identical direct rendering |
| **1440px** | Settings Input | `#app-main .form-group input`| *(Input field text)* | **TRUE** | **0.00%** | Identical direct rendering |
| **1024px** | Hero Heading | `#app-main .dash-hero-title` | *മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം* | **FALSE** | **20.48%** | ClearType (B) vs Grayscale (A) |
| **1024px** | All Other 16 Elements | *(Various selectors)* | *(Various text)* | **TRUE** | **0.00%** | Identical direct rendering |
| **768px** | All 16 Elements | *(Various selectors)* | *(Various text)* | **TRUE** | **0.00%** | Identical direct rendering |
| **600px** | All 15 Elements | *(Various selectors)* | *(Various text)* | **TRUE** | **0.00%** | Identical direct rendering |
| **480px** | All 15 Elements | *(Various selectors)* | *(Various text)* | **TRUE** | **0.00%** | Identical direct rendering |
| **Global** | Topbar Title | `#topbar-title` | *Dashboard* | **TRUE** | **0.00%** | Identical direct rendering |
| **Global** | Sidebar Nav Item | `.nav-item.active` | *Dashboard* | **TRUE** | **0.00%** | Identical direct rendering |

### Full-Viewport Screenshot Bit-Equality:
- **Full Cash Book Viewport (1440px):** `full_cashbook_1440px_A_antialiased.png` (50,601 bytes) == `full_cashbook_1440px_B_auto.png` (50,601 bytes) → **100% Bit-for-Bit Identical**
- **Full Billing Viewport (1440px):** `full_billing_1440px_A_antialiased.png` (159,885 bytes) == `full_billing_1440px_B_auto.png` (159,885 bytes) → **100% Bit-for-Bit Identical**
- **Full Analytics Viewport (1440px):** `full_analytics_1440px_A_antialiased.png` (102,818 bytes) == `full_analytics_1440px_B_auto.png` (102,818 bytes) → **100% Bit-for-Bit Identical**
- **Full Dashboard Viewport (768px):** `full_dashboard_768px_A_antialiased.png` (108,652 bytes) == `full_dashboard_768px_B_auto.png` (108,652 bytes) → **100% Bit-for-Bit Identical**
- **Full Cash Book Viewport (768px):** `full_cashbook_768px_A_antialiased.png` (23,602 bytes) == `full_cashbook_768px_B_auto.png` (23,602 bytes) → **100% Bit-for-Bit Identical**
- **Full Billing Viewport (768px):** `full_billing_768px_A_antialiased.png` (81,193 bytes) == `full_billing_768px_B_auto.png` (81,193 bytes) → **100% Bit-for-Bit Identical**
- **Full Analytics Viewport (768px):** `full_analytics_768px_A_antialiased.png` (62,756 bytes) == `full_analytics_768px_B_auto.png` (62,756 bytes) → **100% Bit-for-Bit Identical**

---

## 9. Whether the Difference is Reproducible

- **On small & medium UI typography (11px–16px, tables, forms, badges, numbers):**
  - **Zero difference is reproducible.** The browser renders byte-for-byte identical output regardless of the font-smoothing setting.
- **On large Malayalam heading typography (23px, `.dash-hero-title`):**
  - **The difference is 100% reproducible.** Switching between State A and State B consistently toggles DirectWrite between grayscale smoothing (State A) and LCD subpixel RGB stripe fringing (State B).

---

## 10. Whether the Difference is Globally Consistent

- **The difference is NOT globally consistent.**
- Out of 80 controlled test cases, **78 elements (97.5%) exhibited zero change**.
- Only 2 elements (2.5%) exhibited any change, strictly confined to large Malayalam font glyphs on wide viewports (1440px, 1024px).
- At mobile viewports (768px, 600px, 480px), the hero heading rendered identically because the mobile container layout/stacking context triggers mobile compositor behavior.

---

## 11. Interaction with Step 26.1 (View Transition Cleanup)

- **Verification:** `step26_1_cleanupExists: true`
- In all tested navigation sequences, `#app-main` was verified after 280ms:
  - `.view-enter-active` class: **0 occurrences** (absent)
  - `transform`: `none`
  - `will-change`: `auto`
- Step 26.1 successfully removed the permanent hardware compositing layer. The font-smoothing test was 100% uncontaminated by GPU compositing layer trapping.

---

## 12. Interaction with Step 26.2 (Motion Settling Cleanup)

- **Verification:**
  - `motionSettledCount`: 28 elements settled in view.
  - `unsettledCount`: 0 in-view motion elements remaining uncleaned after the settling timer elapsed.
- Static motion elements correctly settled to `transform: none !important; will-change: auto !important;`.
- Interactive buttons retained baseline scales and interactive `:hover` states without persistent texture rasterization.
- The font-smoothing audit was completely free of idle compositing interference.

---

## 13. Interaction with Step 26.3 (Integer Typography Snapping)

- **Verification:**
  - Table headers `th` remain snapped to `12px` (formerly `11.5px`).
  - Stat card labels remain snapped to `12px` (formerly `11.5px`).
  - Liquid currency balance remains snapped to `18px` (formerly `17.5px`).
  - Brand FY badge remains snapped to `11px` (formerly `10.5px`).
- The 66 integer typography snaps established in Step 26.3 remain completely intact and continue to guarantee that font glyph stems align directly with physical device pixel boundaries.

---

## 14. Production Decision & Recommendation

### Decision Framework:
- **CASE A:** If native/default rendering produces a clearly sharper and more appropriate result across the application without layout or typography problems, recommend changing the global override.
- **CASE B:** If there is no meaningful difference, recommend leaving the existing rules unchanged.
- **CASE C:** If the result differs by browser/platform or display environment, document that and do not apply a potentially platform-specific global change without evidence.

### Forensic Conclusion:
**CASE B / CASE C applies.**

1. **No Application-Wide Softness Cause:** The initial hypothesis that `-webkit-font-smoothing: antialiased` was causing the general softness across tables, form inputs, billing chips, and stat labels is **forensically disproven** on Windows Chromium. Across 97.5% of application text, DirectWrite rasterizes bit-for-bit identical pixels regardless of this property.
2. **True Sharpness Factors Already Resolved:** The perceived text softness previously identified in the system was overwhelmingly caused by:
   - Layer compositing trapping on `#app-main` (resolved in Step 26.1).
   - Unsettled 3D matrix transforms on `[data-motion]` elements (resolved in Step 26.2).
   - Fractional `.5px` font sizes bridging physical pixel grids (resolved in Step 26.3).
3. **Cross-Platform Protection:** On macOS/WebKit environments (Safari, Chrome on macOS), removing `-webkit-font-smoothing: antialiased` causes text to render with heavy, artificial font weight dilation ("bolding" effect) on standard and Retina displays. Preserving `antialiased` ensures clean, elegant typography across macOS and iOS without negatively affecting Windows Chromium.
4. **Final Recommendation:** **Do NOT modify the production source.** Leave `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` intact in `Temple_Accounts-1.html`.

---

## 15. Production Safety Verification

| Safety Criterion | Mandated Threshold | Observed Metric | Status |
| :--- | :---: | :---: | :---: |
| **Source Code Modifications** | 0 bytes | **0 bytes** | **VERIFIED PASS** |
| **Firestore Database Writes** | 0 | **0** | **VERIFIED PASS** |
| **IndexedDB Writes** | 0 | **0** | **VERIFIED PASS** |
| **Receipts Created** | 0 | **0** | **VERIFIED PASS** |
| **Billing Records Created** | 0 | **0** | **VERIFIED PASS** |
| **Payment Records Created** | 0 | **0** | **VERIFIED PASS** |
| **Counters / Account Balances** | Unchanged | **Unchanged** | **VERIFIED PASS** |
| **Firebase / Firestore Rules** | Untouched | **Untouched** | **VERIFIED PASS** |
| **Authentication System** | Untouched | **Untouched** | **VERIFIED PASS** |
| **Console Runtime Errors** | 0 | **0** | **VERIFIED PASS** |
| **Temporary Browser Overrides** | Fully Cleaned | **100% Cleaned** | **VERIFIED PASS** |

---

## 16. Final PASS / FAIL Verdict

```
================================================================================
  STEP 26.4 — FONT SMOOTHING CONTROLLED AUDIT & SHARPNESS COMPARISON
================================================================================
  Target File:                   d:\Temple\Temple_Accounts-1.html
  File Modifications:            0 lines changed (Source untouched)
  Controlled Test Comparisons:   80 element snapshots across 5 viewports
  Identical Snapshots (A == B):  78 / 80 (97.5% identical)
  Differing Snapshots (A != B):  2 / 80 (confined to large Malayalam heading)
  ClearType Fringing Detected:   State B (auto) on large text; State A (grayscale)
  Small Typography Impact:       0.00% difference (tables, labels, inputs, badges)
  Step 26.1 / 26.2 / 26.3 State: 100% Intact & Verified
  Console Errors:                0 runtime exceptions
  Production Recommendation:     CASE B / CASE C: Preserve existing rules
  FINAL AUDIT VERDICT:           >>> PASS <<<
================================================================================
```
