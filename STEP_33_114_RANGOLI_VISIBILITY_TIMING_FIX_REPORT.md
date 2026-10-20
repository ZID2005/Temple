# STEP 33.114: Rangoli Animation Visibility, Timing & Login Background Fix Report

**Project:** Temple Accounts & Fund Management  
**Application File:** `D:\Temple\Temple_Accounts-1.html`  
**Date:** October 19, 2026  
**Status:** COMPLETE & VERIFIED (32/32 Automated Tests Passed)

---

## 1. Executive Summary

In STEP 33.113, a canvas-based Rangoli particle animation preloader was introduced for page load and refresh. However, visual and lifecycle review identified three critical defects:
1. **Login Page Background Leak / Stuck Overlay:** After animation completion, the Rangoli / red-oxide background presentation remained visible over or behind the login page instead of restoring the unauthenticated login screen's original dark purple/black liquid-glass background.
2. **Malayalam Greeting Legibility:** The white text (`#fffaf0`) lacked sufficient contrast against the white rice-flour and bright turmeric powder grains at the centre of the mandala bloom.
3. **Pacing Too Rapid:** The sequence completed in ~4 seconds, which did not afford devotees adequate time to appreciate the sacred geometric artistry and blessings.

**STEP 33.114 targeted corrections executed:**
- **Full Teardown & Transition Lifecycle:** The `#rangoli-welcome` overlay container is now equipped with an explicit 900ms opacity and visibility transition. On sequence completion, it immediately detaches pointer events (`pointer-events: none !important`), triggers fade-out, applies `opacity: 0 !important; visibility: hidden !important;`, followed by a comprehensive cleanup that sets `display: none !important;`, clears 2D canvas contexts, zeroes canvas dimensions (`width = 0; height = 0;`), and dereferences offscreen memory buffers.
- **Original Login Background Restored:** Unauthenticated users now cleanly see the authentic dark purple/black background (`#0d0b0e` / WebGL dark liquid-glass canvas / `#1e1724` fallback) and glassmorphic login card with zero red-oxide or powder grain remnants.
- **Warm Muted Temple Typography with Illumination Aura:** The Malayalam blessing (`മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം`) and welcome greeting (`സ്വാഗതം`) were updated from pale white to warm, traditional non-black tones (`#38140c` terracotta and `#260c06` deep warm dark brown) backed by a soft, feathered radial warm cream illumination aura plate (`radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90) 0%, rgba(255, 244, 222, 0.58) 55%, rgba(255, 244, 222, 0) 80%)`). This delivers crisp contrast across both the red-oxide floor and powder grains on both desktop and mobile displays.
- **Deliberate ~12.9s Sequence:** Timings were retuned to match the requested 12–15s experience: drawing (5.5s), bloom greeting fade-in at 75% progress, completed Rangoli hold (3.5s), wind sweep & powder dispersal (3.0s total), and gentle destination reveal (0.9s).
- **Reduced Motion & Safety Guard:** Devotees with `prefers-reduced-motion` bypass the multi-second animation and receive a prompt, safe transition. A 16-second watchdog timer guarantees the application will never hang on the overlay even under extreme browser canvas failures.
- **Logout Isolation:** `AuthExperience.showLoginOnLogout()` explicitly destroys and hides `#rangoli-welcome`, ensuring logout navigates straight to the login card with zero animation replay.

---

## 2. Mandatory Baseline, Backup & Integrity

| Metric | Pre-Edit Value | Post-Edit Value | Match / Status |
| :--- | :--- | :--- | :--- |
| **File Path** | `D:\Temple\Temple_Accounts-1.html` | `D:\Temple\Temple_Accounts-1.html` | Modified in-place |
| **File Size** | `1,648,419 bytes` | `1,651,944 bytes` | +3,525 bytes |
| **SHA-256 Hash** | `87DC36B2BC25B08F786CB28BB86D5916FBE76CF45F18EEBB051EFD8B7A8EB3FE` | `749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35` | Verified |
| **Primary Backup** | `D:\Temple\backups\Temple_Accounts-1_PreStep33_114_RangoliVisibilityTimingFix_Backup_20261019_001700.html` | Byte-for-byte identical to pre-edit baseline | `87DC36B2BC25B08F786CB28BB86D5916FBE76CF45F18EEBB051EFD8B7A8EB3FE` |
| **Root Backup Copy** | `D:\Temple\Temple_Accounts-1_PreStep33_114_RangoliVisibilityTimingFix_Backup_20261019_001700.html` | Byte-for-byte identical to pre-edit baseline | `87DC36B2BC25B08F786CB28BB86D5916FBE76CF45F18EEBB051EFD8B7A8EB3FE` |
| **firestore.rules** | `7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD` | Unchanged | Exact Match |
| **Line Endings** | Pure LF (`\n`) | Pure LF (`\n`, 0 CR bytes) | Preserved |
| **JS Syntax Check** | Valid | `node --check` passed | 0 Errors |

---

## 3. Revised Animation Timeline & Progression

The animation timeline was re-engineered from a rushed ~4.2s sequence to an authentic, serene ~12.9s temple greeting sequence:

| Phase | Previous Timing (STEP 33.113) | Revised Target (STEP 33.114) | Actual Implementation | Description & Visual Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **1. Ground Setup** | 0 ms | Immediate | Immediate (0 ms) | Red-oxide floor (`#5c1a12`) renders immediately without login page flash. |
| **2. Sacred Drawing** | 2,200 ms | ~5,000 – 6,000 ms | **5,500 ms** (`DURATION_MS`) | Concentric powder particles pour outward progressively across 12 layers: core, lotus, marigolds, foliage, and sacred necklace. |
| **3. Greeting Fade-In** | At 100% (abrupt) | Smooth fade at blossom | **At 75% bloom (~4,125 ms)** | `.rgp-close.rgp-visible` fades in smoothly over 800ms before drawing ends, ensuring seamless integration. |
| **4. Mandala Hold** | 1,200 ms | ~3,000 – 4,000 ms | **3,500 ms** (`HOLD_MS`) | Devotees contemplate the fully rendered sacred mandala, temple name, and blessing. |
| **5. Wind & Powder Dispersal** | 800 ms | ~2,500 – 3,500 ms | **3,000 ms** (2,200ms wind + 800ms clear) | Gentle horizontal breeze sweeps grains towards the right edge, gracefully clearing the floor. |
| **6. Gate Open & Reveal** | 300 ms (abrupt) | ~800 – 1,000 ms | **900 ms** (`OPEN_MS`) | Seamless opacity transition (`opacity: 0 !important; visibility: hidden !important`) revealing destination screen. |
| **Total Sequence** | **~4.2 seconds** | **~12 – 15 seconds** | **~12.9 seconds** | Perfect alignment with serene temple greeting requirements. |

---

## 4. Typography & Contrast Analysis

### 4.1 Greeting Color & Atmosphere Palette
| Element | Selector | Previous (Pale) | Revised (Warm Muted) | Backlight / Aura Treatment | Readability Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Temple Title** | `.rgp-blessing` | `#fbf8f0` (pale) | `#38140c` (deep terracotta) | `0 1px 2px rgba(255, 255, 255, 0.80)` | High contrast against both floor and white rice powder |
| **Blessing Word** | `.rgp-message` | `#fffaf0` (pure pale) | `#260c06` (deep warm dark brown) | `0 1px 3px rgba(255, 255, 255, 0.85), 0 0 14px rgba(247, 207, 42, 0.35)` | Crisp, bold Malayalam typography (`സ്വാഗതം`), zero glare |
| **Subtitle** | `.rgp-subnote` | `rgba(255, 248, 235, 0.70)` | `#3d140b` (deep warm earthy) | `0 1px 2px rgba(255, 255, 255, 0.70)` | Legible English subtitle with `.22em` letter spacing |
| **Greeting Backing Plate** | `.rgp-close` | `none` (particles directly behind text) | `radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90) 0%, rgba(255, 244, 222, 0.58) 55%, rgba(255, 244, 222, 0) 80%)` | Soft, feathered golden aura plate separating text from dense powder particles | Completely eliminates visual noise or blending during drawing and hold |

### 4.2 Unicode Preservation
All Malayalam graphemes and Unicode strings remain exact:
- `മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം`
- `സ്വാഗതം`
- `TEMPLE ACCOUNTS & MANAGEMENT`

---

## 5. Overlay Teardown & Lifecycle Verification

### 5.1 CSS Scoping & Invisibility Guarantees
```css
#rangoli-welcome {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  overflow: hidden;
  background: #5c1a12;
  opacity: 1;
  visibility: visible;
  transition: opacity 900ms cubic-bezier(.65, 0, .35, 1), visibility 0s linear 900ms;
  will-change: opacity;
}

#rangoli-welcome.rgp-hidden,
#rangoli-welcome[data-phase="open"] {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
```

### 5.2 JavaScript Cleanup Execution
```javascript
function openGate(onDone) {
  if (phase === "open") return;
  setLocal("open");
  if (root) {
    root.setAttribute('data-phase', 'open');
    root.classList.add('rgp-hidden');
    root.style.pointerEvents = 'none';
  }
  setTimeout(function () {
    if (root) {
      root.style.display = 'none';
      root.style.visibility = 'hidden';
      root.setAttribute('aria-hidden', 'true');
    }
    destroy();
    if (typeof onDone === 'function') {
      try { onDone(); } catch (e) { console.error(e); }
    }
  }, OPEN_MS);
}

function destroy() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  // Free canvas context and dimensions
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }
  floorTex = null;
  powder = null;
}
```

### 5.3 Lifecycle Scenario Verification
| Scenario | Behavior | Verified |
| :--- | :--- | :--- |
| **Full Page Load / Refresh** | Plays Rangoli animation once, waits for Firebase auth, and smoothly transitions to target. | YES |
| **Unauthenticated Session** | Fades out Rangoli completely; reveals original `#0d0b0e` login screen with liquid-glass card. | YES |
| **Authenticated Session** | Transitions straight into `#app-shell` without exposing login screen or protected data prematurely. | YES |
| **Internal Navigation** | Navigating between billing, vouchers, ledger, and reports never touches `RangoliPreloader`. | YES |
| **User Logout** | `showLoginOnLogout()` calls `RangoliPreloader.destroy()` and ensures overlay is hidden; shows login page directly. | YES |
| **Canvas Failure Fallback** | Try-catch block catches context initialization errors, immediately hides `#rangoli-welcome`, and resolves `rangoliFinished = true`. | YES |
| **16-Second Safety Watchdog** | If requestAnimationFrame is throttled or suspended in background tab, the 16s watchdog forces transition. | YES |
| **Reduced Motion Preference** | Detects `(prefers-reduced-motion: reduce)`, draws instantaneously (100%), holds for 600ms, and reveals destination safely. | YES |

---

## 6. Visual Evidence & Artifacts

All visual milestones were recorded via automated headless Chrome runs at 1280x800 (Desktop) and 375x667 (Mobile):

1. **`tests/app_step33_114_1.5s_draw.png`**: Concentric mandala drawing at 1.5s with outward radial particle deposition.
2. **`tests/app_step33_114_5.0s_bloom.png`**: Mandala bloom nearing completion, with the warm terracotta greeting card smoothly fading into view.
3. **`tests/app_step33_114_7.5s_hold.png`**: Completed 12-layer Rangoli during the serene 3.5s hold phase, with high-contrast Malayalam greeting.
4. **`tests/app_step33_114_11.0s_wind.png`**: Wind sweep and powder dispersal phase gracefully clearing the floor.
5. **`tests/app_step33_114_15.0s_revealed_login.png`**: Complete post-transition state showing the unauthenticated login screen with its authentic dark purple/black background (`#0d0b0e`), liquid-glass card, and zero red-oxide residue.
6. **`tests/desktop_v2_8s_hold.png` & `tests/desktop_v2_14s_revealed_login.png`**: High-resolution desktop harness verification.
7. **`tests/mobile_v2_8s_hold.png` & `tests/mobile_v2_14s_revealed_login.png`**: Proportionate mobile viewport (375x667) verification.

---

## 7. Automated Test Suite Results

The dedicated automated test suite `tests/test_step_33_114_rangoli_fix.js` verified all 32 requirements across 6 test groups:

```text
================================================================================
STEP 33.114: RANGOLI VISIBILITY, TIMING & LOGIN BACKGROUND FIX VERIFICATION
================================================================================

--- TEST GROUP 1: Baseline, Backups, and File Integrity ---
  ✅ [PASS] GROUP-1 / T1.1: Main HTML file exists at Temple_Accounts-1.html
  ✅ [PASS] GROUP-1 / T1.2: Main HTML file has updated content and valid file size (Size: 1651944 bytes, Hash: 749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35)
  ✅ [PASS] GROUP-1 / T1.3: Pre-implementation backup exists in backups directory
  ✅ [PASS] GROUP-1 / T1.4: Backup file hash matches exact pre-change baseline hash (Backup Hash: 87DC36B2BC25B08F786CB28BB86D5916FBE76CF45F18EEBB051EFD8B7A8EB3FE, Size: 1648419)
  ✅ [PASS] GROUP-1 / T1.5: firestore.rules remains untouched and unmodified (Rules Hash: 7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD)
  ✅ [PASS] GROUP-1 / T1.6: Main HTML file preserves pure LF line endings (0 CR bytes) (CR count: 0)

--- TEST GROUP 2: Login Page Background and Overlay Stacking Order ---
  ✅ [PASS] GROUP-2 / T2.1: #rangoli-welcome root has transition for opacity and visibility
  ✅ [PASS] GROUP-2 / T2.2: #rangoli-welcome.rgp-hidden and [data-phase="open"] enforces total invisibility and pointer-events none
  ✅ [PASS] GROUP-2 / T2.3: Unauthenticated login stage retains original dark purple/black background (#0d0b0e)
  ✅ [PASS] GROUP-2 / T2.4: openGate immediately detaches pointer events and sets rgp-hidden on root
  ✅ [PASS] GROUP-2 / T2.5: openGate cleanup clears canvas context, sets display none and visibility hidden
  ✅ [PASS] GROUP-2 / T2.6: destroy() zeroes canvas dimensions and dereferences particle offscreen canvases

--- TEST GROUP 3: Malayalam Greeting Readability and Typography ---
  ✅ [PASS] GROUP-3 / T3.1: Temple blessing Malayalam greeting uses warm terracotta tone (#38140c)
  ✅ [PASS] GROUP-3 / T3.2: Swagatham Malayalam greeting uses deep warm dark brown tone (#260c06, not pure black)
  ✅ [PASS] GROUP-3 / T3.3: Greeting card is backlit with feathered radial illumination aura plate
  ✅ [PASS] GROUP-3 / T3.4: Malayalam Unicode characters are accurately preserved
  ✅ [PASS] GROUP-3 / T3.5: Greeting fade-in is synchronized with Rangoli bloom completion (shown >= 75%)

--- TEST GROUP 4: Revised Timing Constants and Deliberate Experience ---
  ✅ [PASS] GROUP-4 / T4.1: DURATION_MS set to 5500ms (5.5s drawing target: 5-6s)
  ✅ [PASS] GROUP-4 / T4.2: HOLD_MS set to 3500ms (3.5s hold target: 3-4s)
  ✅ [PASS] GROUP-4 / T4.3: WIND_MS set to 2200ms and CLEAR_MS set to 800ms (3.0s total dispersal target: 2.5-3.5s)
  ✅ [PASS] GROUP-4 / T4.4: OPEN_MS set to 900ms (0.9s transition target: 0.8-1s)
  ✅ [PASS] GROUP-4 / T4.5: Total sequence duration equals 12900ms (~12.9s, within 12-15s target) (Calculated: 12.9s)
  ✅ [PASS] GROUP-4 / T4.6: 16-second watchdog safety timeout prevents permanently hung overlay
  ✅ [PASS] GROUP-4 / T4.7: prefers-reduced-motion triggers immediate completion and safe transition

--- TEST GROUP 5: Overlay Lifecycle, Navigation and Logout Safeguards ---
  ✅ [PASS] GROUP-5 / T5.1: showLoginOnLogout actively tears down and hides #rangoli-welcome to prevent replay on logout
  ✅ [PASS] GROUP-5 / T5.2: Internal view navigation (navigate) does not trigger RangoliPreloader
  ✅ [PASS] GROUP-5 / T5.3: Canvas failure fallback immediately clears overlay and marks rangoliFinished = true
  ✅ [PASS] GROUP-5 / T5.4: AuthExperience coordinates Rangoli completion with Firebase auth resolution without premature content reveal

--- TEST GROUP 6: Preserved Accounting, Billing, and Core Functionality ---
  ✅ [PASS] GROUP-6 / T6.1: renderThermalReceiptHTML preserved untouched
  ✅ [PASS] GROUP-6 / T6.2: Production Firebase configuration preserved with project ID temple-f4f7d
  ✅ [PASS] GROUP-6 / T6.3: Receipt print CSS and thermal layout specifications intact
  ✅ [PASS] GROUP-6 / T6.4: Accounting and database transaction functions preserved intact

================================================================================
TEST SUITE RESULTS: 32 PASSED, 0 FAILED (TOTAL: 32)
================================================================================
```

---

## 8. Safety & Compliance Confirmation

- **Zero Production Database Touched:** No read, write, update, or delete operations were performed on production Firestore.
- **Security Rules Untouched:** `firestore.rules` remained byte-for-byte identical (`7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD`).
- **No Accounting Logic Alterations:** No billing formulas, receipt numbers, financial counters, ledger balances, or voucher operations were touched.
- **No Deployment:** Staging/production deployment was strictly avoided.
- **Single File Architectural Integrity:** All application edits were confined exclusively to `Temple_Accounts-1.html`.
