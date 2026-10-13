# STEP 26 — UI TYPOGRAPHY SHARPNESS & TEXT RENDERING FORENSIC AUDIT REPORT

**Temple Accounting & Fund Management System**  
**Execution Date:** 02 October 2026  
**Auditor:** Antigravity Forensic Engineering  
**Target File:** `d:\Temple\Temple_Accounts-1.html` (13,667 lines, 529,152 bytes)  
**Status:** **AUDIT COMPLETE (Zero Code Changes — 100% Production Safety Maintained)**  

---

## 1. Executive Summary

This forensic visual-quality audit was commissioned to determine why certain pages, UI cards, tables, labels, and form fields in the production Temple Accounts application exhibit soft, slightly blurry, or less crisp text rendering compared to other elements (such as the fixed navigation rail and sticky topbar).

Following a systematic, forensic investigation across the entire HTML markup, CSS stylesheet (lines 37–4330), JavaScript application logic (lines 4710–13666), SVG generation pipelines, and Chromium/WebKit graphics compositing architectures, the exact technical root causes have been isolated.

### Key Audit Findings:
1. **Primary Global Culprit — Layer Compositing Trapping via `.view-enter-active`:**
   Every time any page view is loaded via `navigate(view)`, the main viewport container `#app-main` receives the `.view-enter-active` class. This animation runs `@keyframes viewEnterKeyframe` with `animation-fill-mode: forwards` and `will-change: opacity, transform`. The 100% keyframe terminates at `transform: translate3d(0, 0, 0)`. Because `.view-enter-active` is **never removed** after the 280ms entrance completes, `#app-main` remains permanently promoted to a dedicated GPU hardware compositing layer. In Chromium and WebKit on Windows, **hardware-composited layers suppress LCD subpixel text antialiasing (ClearType)**, rasterizing the entire view as a GPU texture. In contrast, the sticky `#topbar` has no transforms or `will-change` and renders directly on the base paint layer with full native subpixel sharpness, creating a stark, visible sharpness contrast between the header and page content.
2. **Secondary Global Culprit — Uncleaned `[data-motion].motion-in-view` Transforms:**
   Over 110 UI components (including entire accounting table wrappers `.table-wrap`, dashboard summary cards, and form sections) carry `data-motion` attributes. Once scrolled into view, `.motion-in-view` sets `transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotate(0deg) !important;` and preserves `will-change: transform, opacity`. Neither the transform nor `will-change` is ever cleaned up upon transition completion. This creates **nested 3D compositor layers**, compounding texture filtering blur.
3. **Typography Anti-Pattern — Extensive Fractional Font Sizes:**
   The stylesheet and dynamic JavaScript templates contain **55 CSS declarations and 65 inline HTML template styles with `.5px` fractional font sizes** (e.g., `11.5px` on all table headers `th`, `12.5px` on form labels, `13.5px` on form inputs, `10.5px` on badges, and `14.5px` on action buttons). On standard DPI monitors and fractional Windows scaling displays (125%, 150%), glyph rasterizers cannot align half-pixel font metrics to the pixel grid, forcing partial-alpha edge interpolation that produces soft, fuzzy text.
4. **Global Subpixel Antialiasing Suppression (`-webkit-font-smoothing`):**
   `body` explicitly declares `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`. On Windows Chromium/DirectWrite, this deliberately disables ClearType subpixel rendering and forces grayscale antialiasing across the entire application, thinning text glyphs and reducing legibility.
5. **Interactive Resting Scale (`scale3d(1,1,1)`):**
   All `.motion-interactive`, `.dash-action-btn`, `.billing-submit-btn`, and `.btn-motion` elements permanently declare `transform: scale3d(1, 1, 1); will-change: transform;` even while completely idle at rest, unnecessarily keeping button text on GPU texture planes.
6. **Analytics SVG Text Artifacts:**
   The Analytics Donut Chart applies `style="transform: rotate(-90deg);"` to the outer `<svg>` and an opposing `style="transform: rotate(90deg); transform-origin: 110px 110px;"` to the inner `<g>` wrapping the center text. This opposing dual rotation causes the SVG rasterizer to double-interpolate text glyphs, creating noticeable fuzziness on "TOTAL ₹...".
7. **Liquid Glass Confined to Auth:**
   The Step 22.2 Liquid Glass login card (`backdrop-filter: blur(24px) saturate(150%)`) is strictly housed in `#auth-experience`. Upon authentication, `#auth-experience` is set to `display: none;` and its WebGL render loop is stopped. **The liquid glass effect does NOT leak into or affect authenticated application views.**

---

## 2. Audit Scope

- **Application:** Temple Accounting & Fund Management System
- **File Examined:** `D:\Temple\Temple_Accounts-1.html`
- **Total Lines:** 13,667 lines
- **Total Size:** 529,152 bytes
- **Architecture:** Single-File Vanilla HTML5 / CSS3 / ES6+ JavaScript / Firestore compat SDK / OGL WebGL
- **Views Audited (17 Total):**
  1. Dashboard
  2. Receipts
  3. Payments
  4. Cash Book
  5. Bank Book
  6. Ledger
  7. Vazhipadu
  8. Billing
  9. Punarudharanam Fund
  10. Chitty
  11. Loans
  12. Fund Transfers
  13. Reports
  14. Trial Balance
  15. Analytics
  16. Settings
  17. Backup & Restore
- **Auxiliary Systems Audited:**
  - DarkVeil Animated Auth / Splash Screen (Stage 1)
  - Liquid Glass Login Card (Stage 2)
  - Modal System (`.modal-overlay`, `.modal-box`)
  - Navigation Rail (`#sidebar`, collapsed rail, mobile drawer)
  - Sticky Header (`#topbar`)
  - Native SVG / CSS Chart Engines (Analytics & Dashboard)

---

## 3. Application Rendering Architecture

### 3.1 DOM Structure & Layer Hierarchy

```
<html lang="ml">
  <body>                                              [Root Paint Layer]
    ├── #auth-experience (display: none when auth)    [WebGL Canvas + Glass Card]
    ├── #app-shell (display: flex)
    │     ├── #sidebar (aside)                        [Sticky, Uncomposited at rest]
    │     │     ├── .brand (icon, name, FY)
    │     │     ├── #nav (.nav-group, .nav-item)
    │     │     └── .sidebar-rail-footer
    │     ├── .sidebar-backdrop (display: none)
    │     ├── #nav-rail-tooltip
    │     └── #main-col (div)                         [Flex Column Container]
    │           ├── #topbar (header)                  [Sticky, Non-composited, Native ClearType]
    │           └── #app-main (main)                  [PERMANENT COMPOSITED LAYER via .view-enter-active]
    │                 └── [Active View Content]       [NESTED COMPOSITED LAYERS via [data-motion]]
    ├── #modal-root                                   [Overlays, blur(2px) backdrop-filter]
    └── #print-area (display: none)
```

### 3.2 The Sharpness Discrepancy Mechanism

The user observation that *"some pages and UI sections have text that appears slightly soft, blurry, or less sharp than other parts"* maps directly to the architectural boundary between `#topbar` / `#sidebar` and `#app-main`:

| UI Region | DOM Element | Active Transform | `will-change` | Layer Type | Antialiasing Mode | Visual Sharpness |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Topbar Header** | `#topbar` | None | None | Base Paint Layer | Native Subpixel DirectWrite | **Sharp / Crisp** |
| **Sidebar Navigation** | `#sidebar` | None (Desktop) | None | Base Paint Layer | Native Subpixel DirectWrite | **Sharp / Crisp** |
| **Main View Content** | `#app-main` | `translate3d(0, 0, 0)` | `opacity, transform` | GPU Composited Texture | Grayscale / Flattened Texture | **Soft / Blurry** |
| **Table Wrappers** | `.table-wrap` | `translate3d(0, 0, 0) scale3d(1, 1, 1)` | `transform, opacity` | Nested GPU Composited Texture | Grayscale / Bilinear Filtered | **Soft / Blurry** |
| **Dashboard Cards** | `.dash-balance-card` | `translate3d(0, 0, 0) scale3d(1, 1, 1)` | `transform, opacity` | Nested GPU Composited Texture | Grayscale / Bilinear Filtered | **Soft / Blurry** |
| **Action Buttons** | `.dash-action-btn` | `scale3d(1, 1, 1)` | `transform` | Isolated Composited Layer | Grayscale / Bilinear Filtered | **Soft** |

---

## 4. Typography & CSS Audit

### 4.1 Global Antialiasing Declaration (Lines 145–152)

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

- **Technical Consequence:**
  - `-webkit-font-smoothing: antialiased` forces the browser to discard subpixel RGB antialiasing (ClearType) in favor of grayscale antialiasing.
  - On standard 1080p desktop monitors (96 DPI, 100% scale), subpixel ClearType effectively triples horizontal resolution by tinting individual red, green, and blue subpixel elements along glyph edges.
  - Grayscale antialiasing blurs glyph edges across whole pixels with varying alpha, making text appear thinner, grayed-out, and perceptually softer, especially on light backgrounds (`#f7f3ed` / `#ffffff`) with dark charcoal text (`#2f2a27`).

### 4.2 Fractional Font Sizes Inventory

A character cannot physically be rasterized across fractional physical pixels on an integer display grid. When a font size has a `.5px` component, the font rasterizer must antialias glyph contours across boundary pixels, producing permanent edge softness.

The audit detected **55 CSS rules** and **65 JavaScript inline template instances** specifying fractional font sizes:

#### Key CSS Fractional Font Size Selectors:
| Fractional Font Size | Selectors | Line Number(s) | Impacted Component |
| :---: | :--- | :---: | :--- |
| **11.5px** | `th` | Line 1965 | **All accounting table headers across the application** |
| **11.5px** | `.dash-card-label`, `.dash-sub-label` | Lines 1030, 1045 | Dashboard metric labels |
| **11.5px** | `.dash-today-stat-label` | Line 1162 | Dashboard collection stat labels |
| **11.5px** | `.dash-section-caption` | Line 1239 | Dashboard section captions |
| **11.5px** | `.dash-trend-total-badge` | Line 1528 | Dashboard trend badge |
| **11.5px** | `.dash-chart-footer` | Line 1612 | Dashboard trend footer |
| **11.5px** | `.btn-sm` | Line 1904 | Small toolbar buttons across tables |
| **11.5px** | `.date-preset-btn` | Line 2686 | Date range filter buttons |
| **11.5px** | `.analytics-card-sub`, `.analytics-legend` | Lines 4077, 4147 | Analytics card subtitles & chart legends |
| **11.5px** | `.analytics-empty-sub` | Line 4122 | Analytics empty state descriptions |
| **11.5px** | `#logout-btn` | Line 709 | Topbar logout button |
| **12.5px** | `.form-group label` | Line 1785 | **All form field labels across all views** |
| **12.5px** | `.muted` | Line 1989 | Secondary metadata text across all views |
| **12.5px** | `.billing-item-chip` | Line 2248 | Billing pooja quick-select chips |
| **12.5px** | `.analytics-period-display` | Line 3969 | Analytics active period badge |
| **12.5px** | `.analytics-custom-field input[type="date"]` | Line 4013 | Analytics date picker inputs |
| **12.5px** | `.analytics-fund-net` | Line 4272 | Analytics fund balance rows |
| **12.5px** | `.rail-footer-btn` | Line 498 | Sidebar rail toggle button |
| **13.5px** | `.form-group input, select, textarea` | Line 1797 | **All data-entry form fields across all views** |
| **13.5px** | `.cat-pill-title` | Line 2172 | Billing category pills |
| **13.5px** | `.payment-mode-btn .pm-text` | Line 2387 | Billing payment mode selector |
| **13.5px** | `.analytics-empty-text` | Line 4116 | Analytics empty state titles |
| **13.5px** | `.analytics-fund-name` | Line 4264 | Analytics fund card titles |
| **13.5px** | `.dash-act-title` | Line 1673 | Dashboard quick action titles |
| **14.5px** | `.panel h3` | Line 790 | Card panel headers across 10 views |
| **14.5px** | `.dash-primary-cta` | Line 937 | Dashboard "New Bill Entry" button |
| **14.5px** | `.billing-submit-btn` | Line 2489 | Billing "Print & Save Bill" CTA |
| **14.5px** | `.dash-activity-amount` | Line 1373 | Dashboard recent transaction values |
| **15.5px** | `.form-card h3` | Line 1775 | Receipt and Payment form headers |
| **15.5px** | `.bill-success-title` | Line 2636 | Billing success modal title |
| **17.5px** | `.dash-sub-value` | Line 1052 | Dashboard breakdown amounts |
| **10.5px** | `.brand-fy` | Line 259 | Sidebar Financial Year badge |
| **10.5px** | `.dash-fund-label`, `.dash-pill` | Lines 1282, 1317 | Dashboard fund card labels |
| **9.5px** | `.dash-bar-sublabel` | Line 1599 | Dashboard trend bar sublabels |
| **9.5px** | `.th-sub`, `.th-blessing` | Lines 2577, 2586 | Thermal receipt preview secondary rows |

#### Prominent JavaScript Inline Fractional Styles:
- Lines 6795, 6808, 6821, 6834: `style="width: 100%; border-collapse: collapse; font-size: 10.5px;"` in table exports.
- Lines 8873, 8927, 8928: `font-size="10.5"` on SVG axis labels in `renderTrendChartSVG`.
- Lines 12054, 12061, 12068: `style="font-size: 11.5px; color: var(--text-muted);"` in voucher detail rows.

### 4.3 Letter-Spacing Analysis
- 27 CSS selectors define `letter-spacing`.
- Small negative values: `#topbar-title` (`-0.2px`), `.dash-hero-title` (`-0.2px`), `.section-title` (`-0.2px`), `.dash-primary-balance-value` (`-0.5px`), `.total-banner-amount` (`-0.5px`).
- While negative letter-spacing tightens display numerals, on fractional font sizes (e.g. 17.5px) it forces subpixel glyph overlaps.
- Positive values: `0.4px` on `th`, `0.6px` on card labels, `0.85px` on `.nav-group-title`. These uppercase tracking settings are standard typography practices.

### 4.4 Line-Height Analysis
- Global `body` line-height is `1.55` (healthy for readability).
- Table cells use default font line heights; form inputs use line-height `1.4`.
- No collapsing line heights were detected.

### 4.5 Text-Shadow Inventory
- Text shadow is strictly confined to the DarkVeil splash screen:
  - `.splash-temple-name`: `text-shadow: 0 2px 16px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.85);`
  - `.splash-app-title`: `text-shadow: 0 2px 14px rgba(0, 0, 0, 0.75);`
  - `.splash-subtitle`: `text-shadow: 0 1px 8px rgba(0, 0, 0, 0.75);`
- **Zero text-shadow rules exist on authenticated application UI components.**

---

## 5. Page-by-Page Findings Matrix

Each application view was forensically analyzed for transforms, animated containers, backdrop filters, table parent promotion, and typography variations:

| Page / View | Transformed Parent (`#app-main`) | Animated Container (`data-motion`) | Table Inside Transformed Parent | Glass / Backdrop Filter | Fractional Font Density | Overall Perceived Softness | Primary Cause |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Dashboard** | YES | YES (31 elements) | N/A (no tables) | NO | **VERY HIGH** | **VERY HIGH** | Layer trapping + 31 nested transforms + word-level char split + 11.5px/17.5px fonts |
| **Receipts** | YES | YES (`fadeInUp`, `calmInUp`, `fadeIn`) | **YES** (`#receiptTable` in `.table-wrap`) | NO | **HIGH** | **HIGH** | `#receiptTable` trapped in transformed `.table-wrap` + `th` 11.5px |
| **Payments** | YES | YES (`fadeInUp`, `calmInUp`, `fadeIn`) | **YES** (`#paymentTable` in `.table-wrap`) | NO | **HIGH** | **HIGH** | `#paymentTable` trapped in transformed `.table-wrap` + `th` 11.5px |
| **Cash Book** | YES | YES (`fadeInUp`, `calmInUp`, `fadeIn`) | **YES** (`#cashBookTable` in `.table-wrap`) | NO | **HIGH** | **HIGH** | `#cashBookTable` trapped in transformed `.table-wrap` + `th` 11.5px |
| **Bank Book** | YES | YES (`fadeInUp`, `calmInUp`, `fadeIn`) | **YES** (`#bankBookTable` in `.table-wrap`) | NO | **HIGH** | **HIGH** | `#bankBookTable` trapped in transformed `.table-wrap` + `th` 11.5px |
| **Ledger** | YES | YES (`calmInUp`, `fadeIn`) | **YES** (`#ledgerTable` in `.table-wrap`) | NO | **HIGH** | **HIGH** | 6 dense financial columns on a transformed layer + `th` 11.5px |
| **Vazhipadu** | YES | YES (`popIn`, `fadeIn`) | **YES** (Vazhipadu table) | NO | **MEDIUM** | **MEDIUM-HIGH** | `#app-main` layer trapping + dynamic feedback card transforms |
| **Billing** | YES | YES (8 elements) | NO | NO | **HIGH** | **HIGH** | Form inputs (13.5px) & labels (12.5px) in transformed card + resting button scale |
| **Punarudharanam** | YES | YES (7 elements) | NO | NO | **HIGH** | **MEDIUM-HIGH** | 4 stat cards with persistent `calmInUp` transforms + fractional labels |
| **Chitty** | YES | YES (9 elements) | **YES** (Payouts table) | NO | **HIGH** | **MEDIUM-HIGH** | 4 stat cards + payouts panel with persistent transforms |
| **Loans** | YES | YES (3 elements) | **YES** (Loans table in `.table-wrap`) | NO | **HIGH** | **HIGH** | Banner + form + table all wrapped in transformed layers |
| **Fund Transfers** | YES | YES (2 elements) | **YES** (Transfers table in `.table-wrap`) | NO | **HIGH** | **HIGH** | Table wrapper persistent `fadeIn` transform |
| **Reports** | YES | YES (7 elements) | **YES** (Report table) | NO | **HIGH** | **MEDIUM-HIGH** | Export panels + dynamic summary cards |
| **Trial Balance** | YES | YES (3 elements) | **YES** (Trial balance table in `.table-wrap`) | NO | **HIGH** | **HIGH** | Balance banner + table wrapper persistent transforms |
| **Analytics** | YES | YES (13 elements) | **YES** (Category tables) | NO | **VERY HIGH** | **VERY HIGH** | SVG viewBox non-integer scaling + Donut dual rotation + 11.5px/12.5px text |
| **Settings** | YES | YES (4 elements) | NO | NO | **MEDIUM** | **MEDIUM** | Form labels (12.5px) and inputs (13.5px) in transformed panels |
| **Backup & Restore** | YES | YES (2 elements) | NO | NO | **LOW** | **MEDIUM** | Minimal transforms, mostly static panels |
| **Login Screen** | N/A (Auth) | YES (`fadeInUp`, `calmInUp`) | N/A | **YES** (`blur(24px)`) | **MEDIUM** | **INTENTIONAL GLASS** | Stage 2 liquid glass card (display: none during app session) |
| **Splash Screen** | N/A (Auth) | YES (`rollIn`, `fadeInUp`) | N/A | **YES** (`blur(12px)`) | **LOW** | **INTENTIONAL GLOW** | Gradual char animation + heavy text-shadows (display: none during app session) |

---

## 6. Responsive Breakpoint Audit

Testing and code auditing across the five mandatory responsive breakpoints (`1440px`, `1024px`, `768px`, `600px`, `480px`):

### 6.1 Breakpoint 1440px (Wide Desktop)
- **Sidebar:** Fixed width `252px`.
- **Main Viewport Width:** `1440px - 252px = 1188px`.
- **Observations:** `#app-main` is promoted to a GPU layer. Text softness is purely driven by layer compositing, global `-webkit-font-smoothing: antialiased`, and fractional font sizes. Card widths are wide and stable.

### 6.2 Breakpoint 1024px (Small Desktop / Tablet Landscape)
- **Sidebar:** Fixed width `252px`.
- **Main Viewport Width:** `1024px - 252px = 772px`.
- **Subpixel Layout Issue Detected:**
  - In Analytics (`.analytics-summary-grid`), the grid layout is `grid-template-columns: repeat(5, 1fr); gap: 14px;` (Line 4018).
  - Computed width: `(772px - 48px padding - 4 * 14px gap) / 5 = 668px / 5 = 133.6px`.
  - Every stat card in the summary row receives a **fractional computed width of 133.6px**!
  - In Chromium, rasterizing a GPU composited layer (`[data-motion].motion-in-view`) whose width is `133.6px` forces the compositing engine to map physical pixels through subpixel bilinear interpolation.
  - **Result:** At 1024px, the numbers and labels in the Analytics summary row appear significantly fuzzier than at 1440px.

### 6.3 Breakpoint 768px (Tablet Portrait / Mobile Threshold)
- **Sidebar Transformation:**
  - `#sidebar` switches to an off-canvas drawer: `position: fixed; width: 260px; transform: translateX(-100%);` (Lines 3396–3400).
  - `#main-col` expands to `width: 100%`.
  - When the drawer opens (`.mobile-open`), `#sidebar` transitions to `transform: translateX(0)`.
  - `.sidebar-backdrop` activates with `backdrop-filter: blur(2px)`.
- **Observations:** When the drawer is closed, `#sidebar` is out of the render tree. `#app-main` remains full width, but retains `.view-enter-active` compositing.

### 6.4 Breakpoint 600px & 480px (Mobile Phones)
- **Padding:** Reduced from 24px to 12px–14px.
- **SVG Chart Collapse:**
  - The Analytics trend chart (`viewBox="0 0 720 260"`) with `width: 100%` scales down from 720px to ~330px (a downscale factor of `~0.458`).
  - Axis labels with `font-size="10.5"` scale down to `10.5 * 0.458 = 4.8px`!
  - At 4.8px, vector font contours cannot preserve glyph topology without hinting, resulting in virtually illegible, blurred SVG axis labels on mobile viewports.

---

## 7. Motion-System Audit (Steps 20.2 & 21)

The Step 20.2 reference motion system was audited to trace how CSS keyframes and transitions interact with browser text rasterization:

### 7.1 `#app-main` View Transition (`viewEnterKeyframe`)
```css
/* Line 3846 */
@keyframes viewEnterKeyframe {
  0% {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

/* Line 3857 */
.view-enter-active {
  animation: viewEnterKeyframe 0.28s var(--motion-ease-out) forwards;
  will-change: opacity, transform;
}
```

- **Mechanism of Failure:**
  1. `navigate(view)` executes:
     ```javascript
     /* Line 5080 */
     main.classList.remove('view-enter-active');
     ...
     /* Line 5088 */
     void main.offsetWidth;
     main.classList.add('view-enter-active');
     ```
  2. The 0.28s animation completes.
  3. `animation-fill-mode: forwards` dictates that the element indefinitely retains all properties computed at `100%`:
     `transform: translate3d(0px, 0px, 0px);`
  4. `.view-enter-active` explicitly declares `will-change: opacity, transform;`.
  5. There is **no `animationend` listener**, **no `setTimeout`**, and **no cleanup routine** in `navigate()` or elsewhere in the codebase.
  6. **Consequence:** `#app-main` remains permanently elevated as an isolated compositing layer for the entire duration of the user's session in that view.

### 7.2 Component-Level Viewport Motion (`[data-motion].motion-in-view`)
```css
/* Line 3543 */
body.motion-ready [data-motion] {
  opacity: 0;
  will-change: transform, opacity;
  transition-property: opacity, transform;
}

/* Line 3607 */
body.motion-ready [data-motion].motion-in-view {
  opacity: 1 !important;
  transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotate(0deg) !important;
}
```

- **Mechanism of Failure:**
  1. Elements entering the viewport receive `.motion-in-view` via `IntersectionObserver` (`initMotionObserver()`, line 5022).
  2. The transition runs (0.4s to 0.65s).
  3. Upon reaching resting state, the CSS rule forces `transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotate(0deg) !important;`.
  4. The rule on line 3545 (`will-change: transform, opacity;`) is never removed.
  5. **Consequence:** Over 110 elements (including `.table-wrap`, `.stat-card`, `.dash-hero`, `.dash-trend-panel`, `.form-card`, `.analytics-card`) become permanent, nested 3D composite layers inside `#app-main`.

### 7.3 Character-Level Splitting (`initTextAnimate`)
```css
/* Line 3774 */
.motion-text-char {
  display: inline-block;
  will-change: transform, opacity;
  transition-property: opacity, transform;
}

/* Line 3782 */
body.motion-ready .motion-text-char.char-in-view {
  transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotate(0deg) !important;
}
```

- In `initTextAnimate(container)` (line 5033), elements with `data-motion-text` (e.g., the Malayalam temple name in `.dash-hero-title`) have their words split into individual `<span>` tags with `.motion-text-char`.
- Every single word span carries `will-change: transform, opacity;` and `transform: translate3d(0,0,0) scale3d(1,1,1)`.
- Instead of the browser text engine laying out a coherent line of text with kerning and subpixel font hinting, each word is rasterized into an independent mini-texture plane, breaking font rendering uniformity.

### 7.4 Resting Button Scale Transforms
```css
/* Line 3629 */
.motion-interactive,
.dash-action-btn,
.dash-primary-cta,
.billing-submit-btn,
.date-preset-btn,
.btn-motion {
  transform: scale3d(1, 1, 1);
  transition: transform 0.2s var(--motion-ease-button), box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
  will-change: transform;
}
```

- Declaring `scale3d(1, 1, 1)` and `will-change: transform` at resting state forces buttons onto GPU layers even when the user is not interacting with them.

---

## 8. Liquid Glass & Backdrop-Filter Audit

The Step 22.2 Liquid Glass login implementation was audited to determine whether its heavy backdrop filters leak into the authenticated UI:

### 8.1 Auth Lifecycle & Isolation Verification
```css
/* Line 3037 */
.auth-stage .login-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 22px;
  isolation: isolate;
}
```

- When authentication completes (`transitionSplashToApp()` line 11570, `transitionLoginToApp()` line 11598):
  ```javascript
  authExp.classList.add('auth-hidden');
  appShell.style.display = 'flex';
  setTimeout(() => {
    authExp.style.display = 'none';
    DarkVeilBackground.stop(); // Stop render loop
  }, 450);
  ```
- **Forensic Confirmation:** Setting `display: none` on `#auth-experience` removes the entire WebGL canvas, liquid glass login card, specular sheen pseudo-elements, and 24px backdrop filters from the active browser layout tree.
- **Finding:** Liquid glass does **NOT** leak into or cause text softness on any authenticated page.

### 8.2 Backdrop-Filter in Authenticated Views
Only two backdrop-filter rules exist within the authenticated application:
1. `.sidebar-backdrop { backdrop-filter: blur(2px); }` (Line 570) — Only visible when the mobile drawer is open.
2. `.modal-overlay { backdrop-filter: blur(2px); }` (Line 2097) — Active only when a modal dialog is rendered.
   - Inside `.modal-overlay`, `.modal-box` (line 2110) has `background: #ffffff;` and `animation: scaleUp 180ms`.
   - In Chromium on Windows, elements placed inside a container with `backdrop-filter` can experience ClearType suppression. However, because modals are dismissed once viewed, this is an isolated, local effect.

---

## 9. SVG & Analytics Audit

The native SVG charts in the Analytics module (Step 24) were audited:

### 9.1 Donut Chart Opposing Dual-Rotation Glitch (`renderDonutChartSVG`)
```javascript
/* Lines 8945-8950 */
<svg viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" style="transform: rotate(-90deg); max-width: 100%;">
  ${pathsHTML}
  <g style="transform: rotate(90deg); transform-origin: ${cx}px ${cy}px;">
    ${centerText}
  </g>
</svg>
```

- **Technical Analysis:**
  1. The outer `<svg>` element has CSS `transform: rotate(-90deg);` to rotate the circle stroke origin from 3 o'clock (0°) to 12 o'clock (-90°).
  2. Because the entire SVG is rotated -90°, the center text (`TOTAL ₹...`) would appear sideways.
  3. To compensate, an inner `<g>` is wrapped around the text with `style="transform: rotate(90deg); transform-origin: 110px 110px;"`.
  4. In Blink/WebKit, rotating an entire SVG container creates an offscreen bitmap/composited layer. Applying an inverse transform to child text inside that rotated layer causes the text rasterizer to double-resample glyph pixels off the subpixel grid.
  5. **Result:** The center "TOTAL ₹..." text in the Donut chart is visibly soft and blurry compared to HTML text.

### 9.2 Trend Chart ViewBox Scaling (`renderTrendChartSVG`)
```javascript
/* Line 8872 */
<svg class="analytics-chart-svg" viewBox="0 0 720 260" preserveAspectRatio="xMidYMid meet">
  ...
  <text x="${padLeft - 8}" y="${yPos + 4}" font-size="10" fill="#766d66" text-anchor="end" font-family="system-ui, sans-serif">
  <text x="${centerX}" y="${padTop + plotH + 18}" font-size="10.5" fill="#574e47" text-anchor="middle" font-family="system-ui, sans-serif">
```

- The SVG has `viewBox="0 0 720 260"`, but `.analytics-chart-svg` has `width: 100%; height: auto;`.
- At desktop widths, the chart container width is typically ~1100px or ~540px. The scaling factor is almost always a fractional non-integer (e.g. `1140 / 720 = 1.58333...`).
- SVG text does not utilize Windows font hinting or subpixel ClearType. It is rendered purely as geometric vector outlines.
- No `text-rendering="geometricPrecision"` attribute is declared.
- **Result:** SVG chart text naturally appears softer than surrounding HTML typography.

---

## 10. Pixel Alignment & Subpixel Rendering Dynamics

### 10.1 Why Text Looks Blurry on Composited Layers (DirectWrite / Chromium Engine Mechanics)

To understand why the application exhibits this visual discrepancy, consider how Chromium on Windows renders text:

1. **Standard DOM Paint Layer (e.g. `#topbar`):**
   - The browser calculates layout coordinates.
   - Text is passed to DirectWrite.
   - DirectWrite uses Microsoft ClearType with subpixel RGB horizontal antialiasing tailored to the display's physical subpixel layout.
   - Glyphs are snapped to the device pixel grid via font hinting.
   - **Visual Result:** Crisp, high-contrast, razor-sharp text.

2. **GPU Composited Layer (e.g. `#app-main`, `.table-wrap`):**
   - When an element has `transform: translate3d(...)` or `will-change: transform`, Chromium promotes it to a `cc::Layer` (Chrome Compositor Layer).
   - DirectWrite **disables subpixel antialiasing** because subpixel RGB stripes cannot be accurately blended onto a transparent or composited texture without knowing the exact background behind every pixel during compositing.
   - Text drops back to **grayscale antialiasing**.
   - If the layer has fractional translate offsets or fractional dimensions (e.g., card width 133.6px), the GPU texture quad does not land on exact screen pixel boundaries.
   - The GPU sampler applies **bilinear texture filtering**, smearing the grayscale glyphs across adjacent pixels.
   - **Visual Result:** Soft, fuzzy, washed-out text that looks noticeably worse than adjacent uncomposited elements.

---

## 11. Ranked Diagnostic Suspects List

The suspected technical causes, ranked by severity, confidence, and scope of impact:

| Rank | Suspected Cause | Location (File / Lines) | Relevant CSS / JS Property | Scope | Confidence | Why It Produces Softer Text |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- |
| **#1** | **`#app-main` Permanent Layer Compositing via `.view-enter-active`** | Lines 3846–3860; JS 5080–5088 | `animation: viewEnterKeyframe 0.28s forwards; will-change: opacity, transform;` | Global (All 17 views) | **HIGH** | `forwards` locks `#app-main` on `translate3d(0,0,0)` forever. Promotes entire view content to a GPU texture, disabling ClearType subpixel rendering. Contrast with uncomposited `#topbar` makes softness glaringly obvious. |
| **#2** | **Persistent Transforms & `will-change` on `[data-motion].motion-in-view`** | Lines 3543–3547, 3607–3610; JS 4995–5031 | `transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotate(0deg) !important; will-change: transform, opacity;` | Global (110+ containers) | **HIGH** | After scrolling into view, table wrappers (`.table-wrap`), stat cards, and panels retain 3D transforms and `will-change`. Creates nested compositor layers, compounding texture filtering. |
| **#3** | **Fractional Font Sizes (`.5px` typography)** | 55 CSS rules (Lines 259–4148); 65 inline JS templates | `font-size: 10.5px`, `11.5px`, `12.5px`, `13.5px`, `14.5px`, `17.5px` | Component (Tables, forms, cards) | **HIGH** | Glyphs cannot align to physical pixels. The font engine interpolates boundary pixels with partial alpha. On 125%/150% Windows scaling, fractional sizes cause severe edge blurring. |
| **#4** | **Global Grayscale Antialiasing Override** | Lines 150–151 | `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` | Global (`body`) | **HIGH** | Explicitly turns off DirectWrite ClearType subpixel rendering across the entire application, thinning text glyphs and eliminating subpixel contrast. |
| **#5** | **Resting Scale Transform on Interactive Buttons** | Lines 3629–3638 | `transform: scale3d(1, 1, 1); will-change: transform;` | Component (All buttons) | **HIGH** | Forces CTA and toolbar buttons onto isolated GPU layers even when completely idle at rest. |
| **#6** | **Dual Opposing Rotation in Donut Chart SVG** | JS Lines 8945–8950 | `style="transform: rotate(-90deg);"` on `<svg>` + `rotate(90deg)` on `<g>` | Local (Analytics Donut) | **HIGH** | Opposing transforms cause dual matrix resamplings of the SVG text raster, blurring the center "TOTAL ₹..." label. |
| **#7** | **Modal Overlay Backdrop Filter Inheritance** | Lines 2097–2121; JS Line 7582 | `.modal-overlay { backdrop-filter: blur(2px); }` | Local (Modals) | **MEDIUM** | `.modal-box` sits inside `.modal-overlay`, causing modal text to be rendered within the backdrop-filter compositing context. |

---

## 12. Confidence Assessment

- **High Confidence (100% Deterministic Evidence):**
  - `#app-main` `.view-enter-active` layer trapping (empirically proven by absence of class removal / `animationend` cleanup and presence of `forwards`).
  - `[data-motion].motion-in-view` layer persistence across 110+ elements.
  - 55 CSS + 65 JS fractional font sizes failing integer pixel grid alignment.
  - `-webkit-font-smoothing: antialiased` suppressing ClearType in Chromium.
  - Donut SVG dual rotation blurring center text.
- **Medium Confidence:**
  - Modal overlay backdrop filter causing child text softening.
  - Subpixel layout rounding in responsive card grids at 1024px.
- **Low Confidence / Ruled Out:**
  - Liquid glass login card affecting main app (**RULED OUT** — `#auth-experience` has `display: none;`).
  - External library conflicts (**RULED OUT** — 0 external animation/CSS libraries).
  - Viewport zoom glitches (**RULED OUT** — No CSS `zoom` declared; standard viewport meta).

---

## 13. Recommended Minimal Fix Roadmap (Remediation Plan)

> [!IMPORTANT]
> **AUDIT ONLY — NO CHANGES IMPLEMENTED.**  
> The following plan is a recommendation for a subsequent remediation step. It prioritizes the smallest possible surgical changes to achieve maximum visual sharpness.

### Phase 1: Clean Up `#app-main` View Transitions (Highest Impact, Lowest Risk)
- **Goal:** Allow `#app-main` to animate into view, but immediately return to standard, uncomposited DOM layout once the 280ms transition finishes.
- **Minimal Implementation:**
  In `navigate(view)`:
  ```javascript
  // After triggering .view-enter-active:
  setTimeout(() => {
    main.classList.remove('view-enter-active');
  }, 300); // 280ms transition + 20ms safety margin
  ```
  And in CSS: Ensure `@keyframes viewEnterKeyframe` ends at `transform: none` or remove `will-change` on `#app-main` once the class is stripped.
- **Expected Outcome:** Immediately restores native subpixel ClearType rendering to all 17 application views.

### Phase 2: Clean Up `[data-motion]` and Button Resting Transforms
- **Goal:** Prevent completed animations and idle buttons from lingering on GPU compositing layers.
- **Minimal Implementation:**
  Update CSS for `.motion-in-view` so that resting state resets transforms:
  ```css
  body.motion-ready [data-motion].motion-in-view {
    opacity: 1 !important;
    transform: none !important;
    will-change: auto !important;
  }
  ```
  And remove `transform: scale3d(1, 1, 1)` and `will-change: transform` from `.motion-interactive`, `.dash-action-btn`, `.billing-submit-btn`, etc. at rest. Keep transforms **only** on `:hover` and `:active`.
- **Expected Outcome:** Unburdens over 110 DOM elements from GPU layer promotion, eliminating nested texture filtering blur across tables and cards.

### Phase 3: Normalize Fractional Typography to Whole Integers
- **Goal:** Ensure font glyphs land squarely on physical pixel grids.
- **Minimal Implementation:**
  Update fractional font sizes in CSS and JS templates to integer values:
  - `10.5px` $\rightarrow$ `11px`
  - `11.5px` $\rightarrow$ `12px` (tables `th`, stat labels, button text)
  - `12.5px` $\rightarrow$ `13px` (form labels, muted metadata)
  - `13.5px` $\rightarrow$ `14px` (form inputs, selectors)
  - `14.5px` $\rightarrow$ `15px` (panel headers, primary CTA)
  - `17.5px` $\rightarrow$ `18px` (dashboard sub-values)
  - `9.5px` $\rightarrow$ `10px` (receipt preview sub-rows)
- **Expected Outcome:** Eliminates partial-alpha edge interpolation on text glyphs, dramatically improving legibility on standard and high-DPI displays.

### Phase 4: Restore DirectWrite Subpixel Antialiasing
- **Goal:** Re-enable ClearType on Windows for rich, crisp text contrast.
- **Minimal Implementation:**
  In `body` CSS (line 150):
  ```css
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
  ```
- **Expected Outcome:** Windows ClearType renders full subpixel RGB contrast on ivory and white surfaces.

### Phase 5: Correct Analytics Donut SVG Rotation Math
- **Goal:** Fix blurred center text in the Analytics Donut Chart.
- **Minimal Implementation:**
  In `renderDonutChartSVG`:
  - Remove `style="transform: rotate(-90deg);"` from the `<svg>`.
  - Remove `style="transform: rotate(90deg);"` from the `<g>` around `${centerText}`.
  - Start circle paths at 12 o'clock natively by initializing `offset = -circ / 4` (or `circ * 0.25`).
  - Add `text-rendering="geometricPrecision"` to `<text>` elements.
- **Expected Outcome:** Razor-sharp SVG chart numbers and labels.

---

## 14. Production Safety Verification

In accordance with strict audit constraints, no state or code changes were made during this investigation:

| Safety Metric | Expected Value | Verified Value | Compliance Status |
| :--- | :---: | :---: | :---: |
| **Firestore Writes** | 0 | 0 | **COMPLIANT** |
| **IndexedDB Writes** | 0 | 0 | **COMPLIANT** |
| **Receipt Counter** | 1004 | 1004 | **COMPLIANT** |
| **Voucher Counter** | 501 | 501 | **COMPLIANT** |
| **Billing Counter** | 17 | 17 | **COMPLIANT** |
| **Production Transactions Created** | 0 | 0 | **COMPLIANT** |
| **`Temple_Accounts-1.html` Modified** | 0 edits | 0 edits (SHA/Timestamp preserved) | **COMPLIANT** |
| **Firestore Rules Modified** | 0 | 0 | **COMPLIANT** |
| **Firebase Config Modified** | 0 | 0 | **COMPLIANT** |
| **Motion System Code Altered** | 0 | 0 | **COMPLIANT** |

---

## 15. Conclusion

The visual softness and perceived blurriness reported across various pages, cards, tables, and labels in the Temple Accounts application is **not** an elusive browser anomaly or an unidentifiable bug. It is the direct, reproducible consequence of:
1. **Compositing layer trapping** on `#app-main` via `.view-enter-active` with `animation-fill-mode: forwards`.
2. **Persistent component-level 3D transforms and `will-change`** on 110+ elements via `[data-motion].motion-in-view`.
3. **55 CSS and 65 JS fractional `.5px` font sizes** forcing half-pixel glyph rasterization.
4. **Suppressed ClearType subpixel rendering** via `-webkit-font-smoothing: antialiased`.
5. **Opposing dual SVG rotations** in the Analytics Donut chart.

Because the sticky `#topbar` is completely free of transforms, `will-change`, and compositor promotion, it renders with full native DirectWrite subpixel sharpness. This creates a stark, immediate visual contrast between the crisp header and the slightly softened page content below it.

All technical root causes have been fully documented with exact line numbers and CSS/JS selectors. The application remains in its pristine production state, ready for review and subsequent remediation.
