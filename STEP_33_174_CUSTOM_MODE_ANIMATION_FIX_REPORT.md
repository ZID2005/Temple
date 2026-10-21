# Step 33.174 — Fix Custom Payment Mode, Voucher Number Lock, and Radial Glow Animation Report

**Project:** Temple Accounts  
**Main File:** `Temple_Accounts-1.html`  
**Date:** October 21, 2026  
**Status:** ✅ Complete — All 285 Automated Assertions Passed (100%)

---

## 1. Executive Summary

In Step 33.173, custom unnumbered payment capability was introduced. However, the initial implementation treated the CUSTOM button (`#btn-save-custom-payment`) as an immediate form submitter via `onclick="savePayment(false, true)"`. This caused three primary defects:
1. **No Explicit Custom Mode:** The payment form had no persistent mode switch (`isCustomPaymentMode`). Clicking CUSTOM immediately attempted to save the payment rather than placing the form into custom mode for review and subsequent submission.
2. **Voucher Field Was Not Locked During Entry:** The Voucher Number input (`#paymentVoucherNo`) remained editable and showed an auto-generated voucher preview number during data entry. If a user edited details or clicked standard SAVE (`#btn-save-payment`), the payment was saved as a normal numbered payment.
3. **Missing Visual State and Radial Glow Animation:** No visual banner or active state existed to clarify that the form was in custom unnumbered mode. The requested radial glow animation was absent.

In Step 33.174, we completely resolved these deficiencies:
- Implemented an explicit, bidirectional `window.isCustomPaymentMode` state machine with `toggleCustomPaymentMode(forceState)` and `setCustomPaymentMode(active)`.
- Implemented strict voucher field locking: in custom mode, the Voucher Number input is cleared (`""`), disabled (`disabled = true`), marked readonly (`readOnly = true`), set with `aria-disabled="true"`, and placeholder set to `"— (No Voucher Number)"`.
- Guarded `updatePaymentVoucherPreview()` so voucher generation/preview logic is strictly bypassed while custom mode is active.
- Added a high-visibility banner (`#custom-payment-banner`) reading `CUSTOM PAYMENT — NO VOUCHER NUMBER`.
- Adapted the modern `RadialGlowButton` component into native CSS and HTML with CSS `@property` syntax, multi-stop radial gradient background, dynamic conic-gradient shine (`rg-spin`), sliding reflection beam (`rg-slide`), focus-visible ring, disabled states, and full `prefers-reduced-motion: reduce` compliance.
- Preserved user-entered form details (payee, amount, fund, category, payment mode, etc.) across toggle cycles and save validation failures.
- Guaranteed the sequential voucher invariant: `V-011` → `CUSTOM (—)` → `V-012` → `CUSTOM (—)` → `V-013`. Custom payments strictly do not consume sequence counter numbers.

---

## 2. Root Cause Analysis

| Component | Step 33.173 Behavior (Defect) | Step 33.174 Implementation (Fixed) |
|---|---|---|
| **Button Action** | Directly invoked `savePayment(false, true)`, triggering immediate submission. | Invokes `toggleCustomPaymentMode()`, transitioning the form into explicit custom mode. |
| **Form Mode State** | No `isCustomPaymentMode` state existed on the form or window. | Introduced explicit `window.isCustomPaymentMode` boolean state. |
| **Voucher Input Field** | Displayed `V-xxx` preview during entry; remained enabled and editable until submit was pressed. | Immediately cleared, disabled (`disabled = true`, `readOnly = true`), and set with `placeholder="— (No Voucher Number)"`. |
| **Preview Handler Overwrite** | `updatePaymentVoucherPreview()` or auto-numbering routines could repopulate the input field. | `updatePaymentVoucherPreview()` checks `if (window.isCustomPaymentMode) return;` at entry. Additional defensive input listener clears rogue entries. |
| **Standard Save Button** | Clicking standard SAVE (`#btn-save-payment`) ignored custom intent and allocated a voucher number. | `savePayment()` evaluates `effectiveIsCustom = !!(isCustom || window.isCustomPaymentMode)`. Standard SAVE saves as custom when custom mode is active. |
| **Visual Appearance** | Static button; no active styling, no glowing animation, no mode banner. | Full native CSS radial glow button with conic shine, sliding beam, active pulsing state, and `#custom-payment-banner`. |
| **Validation Failure** | N/A (immediate submit threw alert and cleared state). | Preserves custom mode and all user-entered fields so the admin can correct input and retry. |
| **Form Cancellation** | Form cancel left state undefined. | `cancelPaymentForm()` resets `isCustomPaymentMode = false`, stops animations, restores previews, and returns cleanly. |

---

## 3. State Transition Model

```
                    ┌─────────────────────────┐
                    │    Normal Mode Form     │
                    │ isCustomPaymentMode = F │
                    │ Voucher Input: "V-011"  │
                    │ Banner: Hidden          │
                    │ Button: Resting State   │
                    └───────────┬─────────────┘
                                │
                 Click CUSTOM   │   Click CUSTOM (Toggle off)
             or Edit Custom Pmt │   or Cancel Form
                                ▼
                    ┌─────────────────────────┐
                    │    Custom Mode Form     │
                    │ isCustomPaymentMode = T │
                    │ Voucher Input: ""       │
                    │ Voucher Input: Disabled │
                    │ Banner: Displayed       │
                    │ Button: Active + Glow   │
                    └───────────┬─────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            │ Validation Fails                      │ Save Succeeded (SAVE / SAVE & PRINT)
            ▼                                       ▼
┌─────────────────────────┐             ┌─────────────────────────┐
│  Custom Mode Preserved  │             │ Form Reset & Exit Mode  │
│ isCustomPaymentMode = T │             │ isCustomPaymentMode = F │
│ User Form Data Retained │             │ Animation Stopped       │
│ Voucher Remains Locked  │             │ Next Preview: "V-011"   │
└─────────────────────────┘             │ Counter: 10 (Untouched) │
                                        └─────────────────────────┘
```

### Transition Specifications:
1. **Normal → Custom Activation:**
   - Trigger: Admin clicks `#btn-save-custom-payment` or opens an existing custom payment for editing.
   - Actions:
     - `window.isCustomPaymentMode = true`
     - Cached voucher preview stored in `window._cachedVoucherPreview`.
     - `#paymentVoucherNo` cleared (`value = ''`), disabled (`disabled = true`, `readOnly = true`), `aria-disabled="true"`, and placeholder set to `"— (No Voucher Number)"`.
     - `#custom-payment-banner` displayed (`display: block`).
     - `#btn-save-custom-payment` receives `.is-active`, `aria-pressed="true"`, text changed to `CUSTOM ACTIVE`.
     - Radial glow / shine animation activates.
     - All user-entered payment fields (payee, amount, fund, category, notes, payment mode) remain intact.
2. **Custom → Normal Deactivation:**
   - Trigger: Admin clicks `#btn-save-custom-payment` while active, or calls `toggleCustomPaymentMode(false)`.
   - Actions:
     - `window.isCustomPaymentMode = false`
     - `#paymentVoucherNo` re-enabled (`disabled = false`, `readOnly = false`), `aria-disabled="false"`, placeholder restored to `"V-001"`.
     - Cached preview restored (e.g., `V-011`) without consuming any sequence numbers.
     - `#custom-payment-banner` hidden (`display: none`).
     - `#btn-save-custom-payment` loses `.is-active`, `aria-pressed="false"`, text restored to `CUSTOM`.
     - Radial glow / shine animation returns to resting state.
     - User-entered form fields remain intact.
3. **Save Execution in Custom Mode:**
   - Trigger: Admin clicks standard SAVE (`#btn-save-payment`), SAVE & PRINT, or CUSTOM.
   - Actions:
     - Form validates payee, amount, fund, category.
     - `effectiveIsCustom` is `true`.
     - Record saved with `voucherNo = ''`, `voucherType = 'custom'`, unique id prefixed with `c_`, and firestoreId prefixed with `pmt_c_`.
     - Sequence counter strictly untouched.
     - Form resets to normal mode; animation stopped; next normal payment receives exact sequential voucher (e.g., `V-011`).
4. **Validation Failure in Custom Mode:**
   - Trigger: Empty payee, invalid amount, or network fault during custom payment submission.
   - Actions:
     - Error displayed to admin.
     - `window.isCustomPaymentMode` remains `true`.
     - All entered fields retained.
     - Voucher input remains locked and blank.
     - Save buttons re-enabled for retry.
5. **Form Cancellation:**
   - Trigger: Admin clicks `#btn-cancel-payment` or navigates away.
   - Actions:
     - `cancelPaymentForm()` resets `isCustomPaymentMode = false`.
     - Removes `.is-active` from CUSTOM button.
     - Re-enables voucher input for subsequent form opens.

---

## 4. Radial Glow Animation Implementation

Adapted from the provided `RadialGlowButton` React component to pure native CSS and HTML without any external libraries or React dependencies.

### 4.1 Native CSS Architecture
```css
/* Custom CSS Properties with @property for smooth CSS variable transitions */
@property --rg-pos-x { syntax: '<percentage>'; initial-value: 40%; inherits: false; }
@property --rg-pos-y { syntax: '<percentage>'; initial-value: 140%; inherits: false; }
@property --rg-spread-x { syntax: '<percentage>'; initial-value: 130%; inherits: false; }
@property --rg-spread-y { syntax: '<percentage>'; initial-value: 170%; inherits: false; }
@property --rg-color-1 { syntax: '<color>'; initial-value: #000022; inherits: false; }
@property --rg-color-2 { syntax: '<color>'; initial-value: #1f3f6d; inherits: false; }
@property --rg-color-3 { syntax: '<color>'; initial-value: #469396; inherits: false; }
@property --rg-color-4 { syntax: '<color>'; initial-value: #f1ffa5; inherits: false; }
@property --rg-color-5 { syntax: '<color>'; initial-value: hsl(250 80% 2.5%); inherits: false; }
@property --rg-border-angle { syntax: '<angle>'; initial-value: 180deg; inherits: true; }
@property --rg-border-color-1 { syntax: '<color>'; initial-value: hsla(230, 75%, 90%, 0.7); inherits: true; }
@property --rg-border-color-2 { syntax: '<color>'; initial-value: hsla(230, 50%, 90%, 0.25); inherits: true; }
@property --rg-stop-1 { syntax: '<percentage>'; initial-value: 37.35%; inherits: false; }
@property --rg-stop-2 { syntax: '<percentage>'; initial-value: 61.36%; inherits: false; }
@property --rg-stop-3 { syntax: '<percentage>'; initial-value: 78.42%; inherits: false; }
@property --rg-stop-4 { syntax: '<percentage>'; initial-value: 93.52%; inherits: false; }
@property --rg-stop-5 { syntax: '<percentage>'; initial-value: 100%; inherits: false; }
```

### 4.2 Multi-Layer Button Structure
```html
<button type="button"
        id="btn-save-custom-payment"
        class="btn-custom-payment rg-button"
        title="Custom — Save without voucher number"
        aria-label="Custom — Save without voucher number"
        aria-pressed="false"
        onclick="toggleCustomPaymentMode()">
  <span class="rg-shine" aria-hidden="true"><span></span></span>
  <span class="rg-bg" aria-hidden="true"></span>
  <span class="rg-label" id="btn-save-custom-payment-text">⚙️ CUSTOM</span>
</button>
```

### 4.3 Keyframes and Visual Features
- **Conic Spinning Shine (`rg-spin`):** Rotates a conical beam (`conic-gradient`) around the border and inner edge every 2.4s.
- **Sliding Beam (`rg-slide`):** Smoothly oscillates the shine across the button container width every 1.2s.
- **Active State (`.rg-button.is-active`):** Shifts the radial focal point, increases `--button-line-opacity` to 1, and projects an outer gold/amber glow (`box-shadow: 0 0 16px rgba(245, 158, 11, 0.45)`).
- **Accessibility & Focus-Visible:** Outlines with high-contrast amber ring on keyboard focus (`outline: 2px solid #f59e0b; outline-offset: 2px;`).
- **Reduced Motion Support:** Under `@media (prefers-reduced-motion: reduce)`, dynamic animations (`rg-spin`, `rg-slide`) are strictly disabled (`animation: none !important; transform: none !important`), replaced with a subtle, static high-contrast highlight.

---

## 5. Voucher Number Field Lock Verification

### 5.1 Defense-in-Depth Mechanisms
1. **State-Level Guard in Preview Function:**
   ```javascript
   function updatePaymentVoucherPreview() {
     if (window.isCustomPaymentMode) {
       var vInput = document.getElementById('paymentVoucherNo');
       if (vInput) {
         vInput.value = '';
         vInput.placeholder = '— (No Voucher Number)';
         vInput.disabled = true;
         vInput.readOnly = true;
       }
       return;
     }
     // ... normal preview generation ...
   }
   ```
2. **DOM-Level Input Attributes:**
   - `disabled = true`
   - `readOnly = true`
   - `aria-disabled = "true"`
   - `value = ""`
   - `placeholder = "— (No Voucher Number)"`
3. **Event Listener Quarantine:**
   An input event listener attached during form initialization immediately forces `this.value = ''` if custom mode is active, preventing scripted or autofill injection into the voucher number field.
4. **Submission Invariance:**
   `savePayment()` enforces:
   ```javascript
   var effectiveIsCustom = !!(isCustom || window.isCustomPaymentMode);
   if (effectiveIsCustom) {
     voucherNo = '';
     voucherType = 'custom';
   }
   ```
   No sequence counter is incremented or reserved.

### 5.2 Sequential Numbering Verification
| Step | Action | Mode | Voucher Number Stored | Sequence Counter State |
|---|---|---|---|---|
| 1 | Baseline Payment | Normal | `V-011` | 10 → 11 |
| 2 | Activate CUSTOM & Save | Custom | `""` (Empty / `—`) | 11 (Untouched) |
| 3 | Normal Payment | Normal | `V-012` | 11 → 12 |
| 4 | Activate CUSTOM & Save | Custom | `""` (Empty / `—`) | 12 (Untouched) |
| 5 | Normal Payment | Normal | `V-013` | 12 → 13 |

---

## 6. Automated Testing Results

All 5 test suites were executed and verified against the implementation.

### Summary Table

| Test Suite File | Type | Target Feature | Assertions | Passed | Failed | Success Rate |
|---|---|---|---|---|---|---|
| `test_step_33_174_custom_mode_suite.js` | Node.js DOM / State | Custom Mode, State Transitions, Voucher Lock | 68 | 68 | 0 | **100%** |
| `test_step_33_174_browser_e2e.js` | Headless Chrome (CDP) | Full E2E Form Lifecycle, Radial Glow, Sequence | 66 | 66 | 0 | **100%** |
| `test_step_33_173_custom_payment_suite.js` | Node.js DOM / State | Custom Payment Persistence Regression | 75 | 75 | 0 | **100%** |
| `test_step_33_173_browser_e2e.js` | Headless Chrome (CDP) | Cash Book, Table Rendering, Edit Regression | 29 | 29 | 0 | **100%** |
| `test_step_33_163_voucher_suite.js` | Node.js DOM / State | Voucher Numbering, Deletion, Reuse Regression | 47 | 47 | 0 | **100%** |
| **TOTAL** | — | — | **285** | **285** | **0** | **100%** |

### Key Test Scenarios Verified:
- **T1.1–T1.13:** Form initialization opens with normal mode active, voucher field enabled, banner hidden, resting button state.
- **T2.1–T2.21:** Activating CUSTOM locks and blanks voucher field, displays banner, applies `.is-active`, updates button text, and preserves form inputs. Toggling off restores preview `V-011` without consuming numbers.
- **T3.1–T3.3:** Voucher preview generator strictly prevented from overwriting blank field while custom mode is active.
- **T4.1–T4.11:** Saving custom payment stores blank voucher number, sets `voucherType="custom"`, generates `c_` ID, leaves counter untouched, and restores normal preview for next payment.
- **T5.1–T5.10:** Validation error preserves custom mode, locked voucher field, and user data for retry.
- **T6.1–T6.4:** Editing an existing custom payment automatically re-enters custom mode with voucher field disabled.
- **T7.1–T7.3:** Form cancellation cleanly resets custom mode and navigates back to payments list.

---

## 7. Constraint and Governance Compliance

- **Single-File HTML Architecture:** All CSS styles, keyframes, HTML elements, and JavaScript state management logic reside cleanly inside `Temple_Accounts-1.html`. No external CSS or JS files required.
- **No External Framework Dependencies:** The radial glow animation was faithfully recreated using native standard CSS and HTML (`@property`, conic gradient, radial gradient, mix-blend-mode). No React, JSX, or `@/lib/utils` imported.
- **Production Safety:** All testing was conducted against isolated local mocks and a local HTTP/CDP test harness. No production Firestore counters, rules, or genuine records were modified.
- **Backward Compatibility:** Preserved `data-legacy-onclick="savePayment(false, true)"` on the button and supported direct `isCustom` flag invocation in `savePayment()` while prioritizing the unified `window.isCustomPaymentMode` state.
- **Pre-change Backup:** Verified backup created at:
  - `Temple_Accounts-1_PreStep33_174_CustomModeAnimationFix_Backup_20261021_174500.html` (SHA-256: `7bf8e58b728c01ab8d75d281d79e60396d73e37f695a9e28219bd35406d88214`).

---

## 8. Unresolved Issues

There are **0 unresolved issues**. All requirements for Step 33.174 have been implemented and verified with 100% passing automated tests.
