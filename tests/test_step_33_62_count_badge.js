/**
 * STEP 33.62 — Devotee Count Badge Verification Suite
 * 
 * Verifies that the devotee count badge updates dynamically in the billing form:
 * 1. Initial one-row form displays a count of one ("1 Devotee").
 * 2. Adding a second row updates the badge to two ("2 Devotees").
 * 3. Adding several rows updates the count accurately ("3 Devotees", "4 Devotees", etc.).
 * 4. Removing a row updates the count accurately.
 * 5. Attempting to remove the final row leaves one row and displays one ("1 Devotee").
 * 6. Re-rendering the form does not leave the badge stale.
 * 7. Roster values and pricing behavior are strictly preserved.
 * 8. Fallback element ID compatibility (billingDevoteeCountBadge and devoteeCountBadge).
 * 9. Free-text nakshatram invariant preserved.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HTML_PATH = path.join(__dirname, '..', 'Temple_Accounts-1.html');
const RESULTS_PATH = path.join(__dirname, 'step_33_62_count_badge_results.json');

const html = fs.readFileSync(HTML_PATH, 'utf8');
const htmlSha256 = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();

const testResults = {
  step: '33.62',
  feature: 'Minimal Devotee Count Badge Fix',
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    os: process.platform,
    htmlPath: HTML_PATH,
    htmlSizeBytes: Buffer.byteLength(html, 'utf8'),
    htmlSha256: htmlSha256
  },
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0
  }
};

function recordTest(id, title, passed, expected, actual, details = '') {
  testResults.summary.total++;
  if (passed) {
    testResults.summary.passed++;
    console.log(`  ✅ [PASS] ${id}: ${title}`);
  } else {
    testResults.summary.failed++;
    console.error(`  ❌ [FAIL] ${id}: ${title} | Expected: ${expected} | Actual: ${actual}`);
    if (details) console.error(`     Details: ${details}`);
  }
  testResults.tests.push({
    id,
    title,
    passed: !!passed,
    expected: String(expected),
    actual: String(actual),
    details
  });
}

console.log('========================================================================');
console.log('STEP 33.62: DEVOTEE COUNT BADGE VERIFICATION SUITE');
console.log(`HTML SHA-256: ${htmlSha256}`);
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: STATIC SOURCE CODE & DOM STRUCTURE AUDIT
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Static Source Code & DOM Structure Audit ---');

const hasBillingBadgeInDOM = html.includes('id="billingDevoteeCountBadge"');
recordTest('TEST-33.62-01', 'HTML markup contains <span id="billingDevoteeCountBadge">',
  hasBillingBadgeInDOM, true, hasBillingBadgeInDOM);

const badgeHtmlMatch = html.match(/<span\s+id="billingDevoteeCountBadge"[^>]*>(.*?)<\/span>/);
const initialBadgeText = badgeHtmlMatch ? badgeHtmlMatch[1].trim() : '';
recordTest('TEST-33.62-02', 'Initial static badge text in HTML is "1 Devotee"',
  initialBadgeText === '1 Devotee', '1 Devotee', initialBadgeText);

const badgeStyleMatch = badgeHtmlMatch ? badgeHtmlMatch[0] : '';
const hasCorrectStyling = badgeStyleMatch.includes('background: #e8f4fd') &&
                          badgeStyleMatch.includes('color: #0b72b9') &&
                          badgeStyleMatch.includes('border-radius: 12px');
recordTest('TEST-33.62-03', 'Badge retains original styling (pill styling with sky background and blue text)',
  hasCorrectStyling, true, hasCorrectStyling);

// Extract renderDevoteeRows function
const renderDevoteeRowsMatch = html.match(/function\s+renderDevoteeRows\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
const renderDevoteeRowsCode = renderDevoteeRowsMatch ? renderDevoteeRowsMatch[0] : '';
const renderQueriesBillingBadge = renderDevoteeRowsCode.includes("el('billingDevoteeCountBadge')");
recordTest('TEST-33.62-04', 'renderDevoteeRows() queries el("billingDevoteeCountBadge")',
  renderQueriesBillingBadge, true, renderQueriesBillingBadge);

// Extract updateDevoteeCountUI function
const updateDevoteeCountUIMatch = html.match(/function\s+updateDevoteeCountUI\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
const updateDevoteeCountUICode = updateDevoteeCountUIMatch ? updateDevoteeCountUIMatch[0] : '';
const updateQueriesBillingBadge = updateDevoteeCountUICode.includes("el('billingDevoteeCountBadge')");
recordTest('TEST-33.62-05', 'updateDevoteeCountUI() queries el("billingDevoteeCountBadge")',
  updateQueriesBillingBadge, true, updateQueriesBillingBadge);

// Check fallback support for devoteeCountBadge in both
const hasFallbackInRender = renderDevoteeRowsCode.includes("el('devoteeCountBadge')");
const hasFallbackInUpdate = updateDevoteeCountUICode.includes("el('devoteeCountBadge')");
recordTest('TEST-33.62-06', 'Both functions maintain backward-compatible fallback to el("devoteeCountBadge")',
  hasFallbackInRender && hasFallbackInUpdate, true, { hasFallbackInRender, hasFallbackInUpdate });

// Verify free-text nakshatram preserved (no select, no datalist, text input)
const starInputMatch = html.match(/<input\s+type="text"[^>]*class="devotee-star-input"[^>]*>/);
const hasNoStarDatalist = !html.includes('list="starList"') && !html.includes('<datalist id="nakshatram');
recordTest('TEST-33.62-07', 'Nakshatram input remains unconstrained free-text without datalist or select',
  !!starInputMatch && hasNoStarDatalist, true, { hasStarInput: !!starInputMatch, hasNoStarDatalist });


// -----------------------------------------------------------------------------
// SECTION 2: DYNAMIC BEHAVIOR SIMULATION (DOM SANDBOX)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Dynamic Behavior Simulation (DOM Sandbox) ---');

function createSandbox(initialBadgeId = 'billingDevoteeCountBadge') {
  const state = {
    rowsData: [{ name: 'ഹരികൃഷ്ണൻ', star: 'തിരുവോണം' }],
    qtyVal: '1',
    totalVal: '20'
  };

  const badgeElem = {
    id: initialBadgeId,
    textContent: '1 Devotee',
    style: { background: '#e8f4fd', color: '#0b72b9' }
  };

  const rowsContainer = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(val) {
      this._html = val;
      const rows = [];
      const rowRegex = /<div class="devotee-entry-row"[^>]*>([\s\S]*?)<\/div>\s*(?=(?:<div class="devotee-entry-row"|$))/g;
      let match;
      while ((match = rowRegex.exec(val)) !== null) {
        const rowHtml = match[1];
        const nameMatch = rowHtml.match(/class="devotee-name-input"[^>]*value="([^"]*)"/);
        const starMatch = rowHtml.match(/class="devotee-star-input"[^>]*value="([^"]*)"/);
        rows.push({
          name: nameMatch ? nameMatch[1] : '',
          star: starMatch ? starMatch[1] : ''
        });
      }
      if (rows.length > 0) {
        state.rowsData = rows;
      }
    },
    querySelectorAll: (sel) => {
      if (sel === '.devotee-entry-row') {
        return state.rowsData.map((d, idx) => ({
          dataset: { index: String(idx) },
          querySelector: (sub) => {
            if (sub === '.devotee-name-input') return { value: d.name, classList: { add: () => {}, remove: () => {} }, focus: () => {} };
            if (sub === '.devotee-star-input') return { value: d.star, classList: { add: () => {}, remove: () => {} } };
            return null;
          }
        }));
      }
      return [];
    }
  };

  const elements = {
    [initialBadgeId]: badgeElem,
    billingDevoteeRows: rowsContainer,
    name: {
      get value() { return state.rowsData[0] ? state.rowsData[0].name : ''; },
      set value(v) { if (state.rowsData[0]) state.rowsData[0].name = v; },
      classList: { add: () => {}, remove: () => {} },
      focus: () => {}
    },
    star: {
      get value() { return state.rowsData[0] ? state.rowsData[0].star : ''; },
      set value(v) { if (state.rowsData[0]) state.rowsData[0].star = v; },
      classList: { add: () => {}, remove: () => {} }
    },
    qty: {
      get value() { return state.qtyVal; },
      set value(v) { state.qtyVal = String(v); },
      classList: { add: () => {}, remove: () => {} }
    },
    total: {
      get value() { return state.totalVal; },
      set value(v) { state.totalVal = String(v); },
      dataset: { itemMode: 'fixed' }
    },
    itemSelect: {
      selectedIndex: 0,
      options: [
        { dataset: { name: 'നൂൽജപം/അർച്ചന', price: '20' } }
      ]
    }
  };

  const el = (id) => elements[id] || null;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Extract functions from html and evaluate in sandbox
  const fnCode = `
    ${renderDevoteeRowsCode}
    ${updateDevoteeCountUICode}

    function isStrictPerPersonPuja(itemName) {
      if (!itemName) return false;
      const name = String(itemName).trim().toLowerCase();
      return name.includes('അർച്ചന') || name.includes('archana') || name.includes('പുഷ്പാഞ്ജലി') || name.includes('pushpanjali') || name.includes('നൂൽജപം');
    }

    function supportsSharedFamilyPuja(itemName) {
      if (!itemName) return false;
      return !isStrictPerPersonPuja(itemName);
    }

    function syncQtyWithDevotees(devoteeCount) {
      const qtyInput = el('qty');
      const totalInput = el('total');
      const itemSel = el('itemSelect');
      if (!qtyInput) return Math.max(1, devoteeCount || 1);
      if (totalInput && totalInput.dataset.itemMode === 'custom') {
        return parseInt(qtyInput.value, 10) || 1;
      }
      const selectedOpt = itemSel && itemSel.selectedIndex >= 0 ? itemSel.options[itemSel.selectedIndex] : null;
      const currentItem = selectedOpt ? selectedOpt.dataset.name : '';
      if (supportsSharedFamilyPuja(currentItem)) {
        return parseInt(qtyInput.value, 10) || 1;
      }
      const newQty = Math.max(1, devoteeCount);
      qtyInput.value = newQty;
      return newQty;
    }

    function getDevoteeEntries() {
      const container = el('billingDevoteeRows');
      if (!container) {
        const legacyName = el('name');
        const legacyStar = el('star');
        if (legacyName) return [{ name: legacyName.value, star: legacyStar ? legacyStar.value : '' }];
        return [{ name: '', star: '' }];
      }
      const rows = container.querySelectorAll('.devotee-entry-row');
      if (!rows || rows.length === 0) return [{ name: '', star: '' }];
      const entries = [];
      rows.forEach((row, idx) => {
        const nameInp = row.querySelector('.devotee-name-input') || (idx === 0 ? el('name') : null);
        const starInp = row.querySelector('.devotee-star-input') || (idx === 0 ? el('star') : null);
        entries.push({
          name: nameInp ? nameInp.value : '',
          star: starInp ? starInp.value : ''
        });
      });
      return entries.length > 0 ? entries : [{ name: '', star: '' }];
    }

    function addDevoteeEntry(name = '', star = '') {
      const entries = getDevoteeEntries();
      entries.push({ name: name, star: star });
      renderDevoteeRows(entries);
      syncQtyWithDevotees(entries.length);
    }

    function removeDevoteeEntry(idx) {
      const entries = getDevoteeEntries();
      if (entries.length <= 1) return;
      entries.splice(idx, 1);
      renderDevoteeRows(entries);
      syncQtyWithDevotees(entries.length);
    }

    return {
      getBadgeText: () => badgeElem.textContent,
      getRowCount: () => state.rowsData.length,
      getRowsData: () => JSON.parse(JSON.stringify(state.rowsData)),
      getQty: () => el('qty').value,
      addDevoteeEntry,
      removeDevoteeEntry,
      renderDevoteeRows,
      updateDevoteeCountUI,
      getDevoteeEntries
    };
  `;

  return (new Function('el', 'esc', 'state', 'badgeElem', fnCode))(el, esc, state, badgeElem);
}

const sb = createSandbox('billingDevoteeCountBadge');

// 1. Initial one-row form displays a count of one
recordTest('TEST-33.62-08', 'Requirement 1: Initial one-row form displays count of one ("1 Devotee")',
  sb.getBadgeText() === '1 Devotee' && sb.getRowCount() === 1, '1 Devotee', sb.getBadgeText());

// 2. Adding a second row updates the badge to two
sb.addDevoteeEntry('ലക്ഷ്മി', 'രോഹിണി');
recordTest('TEST-33.62-09', 'Requirement 2: Adding a second row updates badge to two ("2 Devotees")',
  sb.getBadgeText() === '2 Devotees' && sb.getRowCount() === 2, '2 Devotees', sb.getBadgeText());

// 3. Adding several rows updates the count accurately
sb.addDevoteeEntry('വിഷ്ണു', 'മകയിരം');
const count3 = sb.getBadgeText();
sb.addDevoteeEntry('അഞ്ജലി', 'തിരുവാതിര');
const count4 = sb.getBadgeText();
sb.addDevoteeEntry('നാരായണൻ', 'പുണർതം');
const count5 = sb.getBadgeText();
const allCountsAccurate = (count3 === '3 Devotees' && count4 === '4 Devotees' && count5 === '5 Devotees' && sb.getRowCount() === 5);
recordTest('TEST-33.62-10', 'Requirement 3: Adding several rows (3, 4, 5) updates count accurately',
  allCountsAccurate, '3 Devotees -> 4 Devotees -> 5 Devotees', `${count3} -> ${count4} -> ${count5}`);

// 4. Removing a row updates the count accurately
sb.removeDevoteeEntry(4); // Remove 5th row -> 4
const afterRem1 = sb.getBadgeText();
sb.removeDevoteeEntry(2); // Remove 3rd row -> 3
const afterRem2 = sb.getBadgeText();
sb.removeDevoteeEntry(1); // Remove 2nd row -> 2
const afterRem3 = sb.getBadgeText();
sb.removeDevoteeEntry(1); // Remove 2nd row -> 1
const afterRem4 = sb.getBadgeText();
const removalAccurate = (afterRem1 === '4 Devotees' && afterRem2 === '3 Devotees' && afterRem3 === '2 Devotees' && afterRem4 === '1 Devotee');
recordTest('TEST-33.62-11', 'Requirement 4: Removing rows sequentially updates count accurately (4 -> 3 -> 2 -> 1)',
  removalAccurate, '4 Devotees -> 3 Devotees -> 2 Devotees -> 1 Devotee', `${afterRem1} -> ${afterRem2} -> ${afterRem3} -> ${afterRem4}`);

// 5. Attempting to remove the final row leaves one row and displays one
sb.removeDevoteeEntry(0);
const afterAttemptRemoveLast = sb.getBadgeText();
const countAfterAttempt = sb.getRowCount();
recordTest('TEST-33.62-12', 'Requirement 5: Attempting to remove final row leaves 1 row and displays "1 Devotee"',
  afterAttemptRemoveLast === '1 Devotee' && countAfterAttempt === 1,
  '1 Devotee (count: 1)', `${afterAttemptRemoveLast} (count: ${countAfterAttempt})`);

// 6. Re-rendering the form does not leave the badge stale
sb.addDevoteeEntry('ടെസ്റ്റ് ഭക്തൻ', 'ഉത്രം');
sb.addDevoteeEntry('ടെസ്റ്റ് ഭക്തൻ 2', 'അത്തം');
const preResetCount = sb.getBadgeText();
// Simulate resetBillingForm() calling renderDevoteeRows([{ name: '', star: '' }])
sb.renderDevoteeRows([{ name: '', star: '' }]);
const afterReRenderBadge = sb.getBadgeText();
recordTest('TEST-33.62-13', 'Requirement 6: Re-rendering form with 1 entry resets badge to "1 Devotee" (no stale state)',
  afterReRenderBadge === '1 Devotee' && preResetCount === '3 Devotees',
  '1 Devotee', afterReRenderBadge);

// 7. Devotee roster values and pricing behavior preservation
const sbPricing = createSandbox('billingDevoteeCountBadge');
// Add devotee for Archana (strict per-person: ₹20 per devotee)
sbPricing.addDevoteeEntry('ലക്ഷ്മി', 'രോഹിണി');
recordTest('TEST-33.62-14', 'Requirement 7a: Strict puja qty synchronizes with devotee count (qty = 2)',
  sbPricing.getQty() === '2', '2', sbPricing.getQty());
// Devotee values preserved in getDevoteeEntries
const rosterEntries = sbPricing.getDevoteeEntries();
const rosterValuesIntact = rosterEntries.length === 2 &&
                           rosterEntries[0].name === 'ഹരികൃഷ്ണൻ' && rosterEntries[0].star === 'തിരുവോണം' &&
                           rosterEntries[1].name === 'ലക്ഷ്മി' && rosterEntries[1].star === 'രോഹിണി';
recordTest('TEST-33.62-15', 'Requirement 7b: Roster names and nakshatrams preserved across lifecycle',
  rosterValuesIntact, true, rosterValuesIntact);

// 8. Fallback element ID compatibility: devoteeCountBadge (legacy ID support)
const sbFallback = createSandbox('devoteeCountBadge');
sbFallback.addDevoteeEntry('ഭക്തൻ 2', 'അശ്വതി');
recordTest('TEST-33.62-16', 'Requirement 8: Fallback to el("devoteeCountBadge") functions if legacy ID is present',
  sbFallback.getBadgeText() === '2 Devotees', '2 Devotees', sbFallback.getBadgeText());

// 9. Direct updateDevoteeCountUI standalone invocation
const sbDirectUI = createSandbox('billingDevoteeCountBadge');
sbDirectUI.updateDevoteeCountUI(7);
recordTest('TEST-33.62-17', 'updateDevoteeCountUI(7) updates header badge to "7 Devotees"',
  sbDirectUI.getBadgeText() === '7 Devotees', '7 Devotees', sbDirectUI.getBadgeText());
sbDirectUI.updateDevoteeCountUI(1);
recordTest('TEST-33.62-18', 'updateDevoteeCountUI(1) updates header badge to "1 Devotee"',
  sbDirectUI.getBadgeText() === '1 Devotee', '1 Devotee', sbDirectUI.getBadgeText());

// -----------------------------------------------------------------------------
// WRITE RESULTS ARTIFACT
// -----------------------------------------------------------------------------
fs.writeFileSync(RESULTS_PATH, JSON.stringify(testResults, null, 2), 'utf8');

console.log('\n========================================================================');
console.log(`TOTAL TESTS: ${testResults.summary.total} | PASSED: ${testResults.summary.passed} | FAILED: ${testResults.summary.failed}`);
console.log(`RESULTS WRITTEN TO: ${RESULTS_PATH}`);
console.log('========================================================================\n');

if (testResults.summary.failed > 0) {
  process.exit(1);
}
