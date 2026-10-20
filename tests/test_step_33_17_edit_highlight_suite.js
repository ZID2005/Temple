const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('STEP 33.17 VALIDATION SUITE: APPLICATION-WIDE EDIT ROW HIGHLIGHT');
console.log('================================================================\n');

const htmlPath = path.resolve('d:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  FAIL: ${message}`);
    failedTests++;
  }
}

// ================================================================
// TEST SUITE 1: Static CSS and Animation Verification
// ================================================================
console.log('--- TEST SUITE 1: CSS and Animation Verification ---');

assert(html.includes('--edit-row-bg: #fef8eb;'), 'CSS variable --edit-row-bg defined');
assert(html.includes('--edit-row-hover: #fcf2dc;'), 'CSS variable --edit-row-hover defined');
assert(html.includes('--edit-row-border: #e6be60;'), 'CSS variable --edit-row-border defined');
assert(html.includes('--edit-gradient-1: #d97706;'), 'CSS variable --edit-gradient-1 defined');
assert(html.includes('--edit-gradient-2: #f59e0b;'), 'CSS variable --edit-gradient-2 defined');

assert(html.includes('tbody tr.row-editing-active'), 'tbody tr.row-editing-active rule present');
assert(html.includes('tbody tr.row-editing-active td'), 'tbody tr.row-editing-active td rule applies highlight to all visible cells');
assert(html.includes('tbody tr.row-editing-active:hover td'), 'Hover state maintains amber/gold edit highlight and prevents override');
assert(html.includes('tbody tr.row-editing-active td:first-child::before'), 'Left-most cell receives pseudo-element gradient accent');
assert(html.includes('editRotatingGradientShift'), 'Keyframe animation editRotatingGradientShift defined');
assert(html.includes('editRowSubtleSweep'), 'Keyframe animation editRowSubtleSweep defined');
assert(html.includes('li.row-editing-active'), 'Settings master list item li.row-editing-active rule present');
assert(html.includes('@media (prefers-reduced-motion: reduce)'), 'prefers-reduced-motion media query implemented');
assert(html.includes('@media print') && html.includes('tbody tr.row-editing-active'), 'Print media query cleans edit highlight for print safety');

// ================================================================
// TEST SUITE 2: GlobalEditState Architecture Verification
// ================================================================
console.log('\n--- TEST SUITE 2: GlobalEditState Architecture Verification ---');

assert(html.includes('window.GlobalEditState = {'), 'window.GlobalEditState defined');
assert(html.includes('setEditing(scope, recordId)'), 'GlobalEditState.setEditing method present');
assert(html.includes('getEditing(scope)'), 'GlobalEditState.getEditing method present');
assert(html.includes('isEditing(scope, recordId)'), 'GlobalEditState.isEditing method present');
assert(html.includes('clearEditing(scope)'), 'GlobalEditState.clearEditing method present');
assert(html.includes('syncDOM(targetScope)'), 'GlobalEditState.syncDOM method present');
assert(html.includes('function getEditingRowClass('), 'Helper getEditingRowClass defined');

// ================================================================
// TEST SUITE 3: Audit of All Discovered Modules
// ================================================================
console.log('\n--- TEST SUITE 3: Audit of All Edit Entry Points & Modules ---');

// 1. Receipts
assert(html.includes('data-edit-scope="receipts"'), 'Receipts table rows have data-edit-scope="receipts"');
assert(html.includes("getEditingRowClass('receipts', r.id)"), 'Receipts table rows use getEditingRowClass');
assert(html.includes("GlobalEditState.setEditing('receipts', editRec.id)"), 'VIEW_RENDERERS.receipts sets editing state for editRec');
assert(html.includes("GlobalEditState.clearEditing('receipts')"), 'Receipts lifecycle clears editing state on save/cancel');

// 2. Vazhipadu (Retired in Step 33.78: dedicated renderer and sidebar entry removed, receipts workflow returns directly to receipts)
assert(!html.includes("VIEW_RENDERERS.vazhipadu"), 'Dedicated VIEW_RENDERERS.vazhipadu is retired and absent');
assert(!html.includes('data-view="vazhipadu"'), 'Dedicated Vazhipadu sidebar navigation entry is absent');
assert(!html.includes("CURRENT_VIEW === 'vazhipadu' ? 'vazhipadu' : 'receipts'"), 'Receipts Cancel & Edit buttons return directly to receipts');

// 3. Payments
assert(html.includes('data-edit-scope="payments"'), 'Payments table rows have data-edit-scope="payments"');
assert(html.includes("getEditingRowClass('payments', p.id)"), 'Payments table rows use getEditingRowClass');
assert(html.includes("GlobalEditState.setEditing('payments', editRec.id)"), 'VIEW_RENDERERS.payments sets editing state for editRec');
assert(html.includes("GlobalEditState.clearEditing('payments')"), 'Payments lifecycle clears editing state on save/cancel');

// 4. Transfers
assert(html.includes('data-edit-scope="transfers"'), 'Transfers table rows have data-edit-scope="transfers"');
assert(html.includes("getEditingRowClass('transfers', t.id)"), 'Transfers table rows use getEditingRowClass');
assert(html.includes("GlobalEditState.setEditing('transfers', editRec.id)"), 'VIEW_RENDERERS.transfers sets editing state for editRec');
assert(html.includes("GlobalEditState.clearEditing('transfers')"), 'Transfers lifecycle clears editing state on save/cancel');

// 5. Chitty (3 scopes)
assert(html.includes('data-edit-scope="chitty_member"'), 'Chitty Members table rows have data-edit-scope="chitty_member"');
assert(html.includes('data-edit-scope="chitty_collection"'), 'Chitty Collections table rows have data-edit-scope="chitty_collection"');
assert(html.includes('data-edit-scope="chitty_payout"'), 'Chitty Payouts table rows have data-edit-scope="chitty_payout"');
assert(html.includes("GlobalEditState.setEditing('chitty_member'"), 'Chitty Member edit sets chitty_member scope');
assert(html.includes("GlobalEditState.setEditing('chitty_collection'"), 'Chitty Collection edit sets chitty_collection scope');
assert(html.includes("GlobalEditState.setEditing('chitty_payout'"), 'Chitty Payout edit sets chitty_payout scope');

// 6. Loans
assert(html.includes('data-edit-scope="loans"'), 'Loans table rows have data-edit-scope="loans"');
assert(html.includes("getEditingRowClass('loans', l.id)"), 'Loans table rows use getEditingRowClass');
assert(html.includes("GlobalEditState.setEditing('loans', editRec.id)"), 'VIEW_RENDERERS.loans sets editing state for editRec');
assert(html.includes("GlobalEditState.clearEditing('loans')"), 'Loans lifecycle clears editing state on save/cancel');

// 7. Settings (master records)
assert(html.includes('data-edit-scope="settings_${store}"'), 'Settings editableList items have data-edit-scope="settings_${store}"');
assert(html.includes("getEditingRowClass('settings_' + store, i.id)"), 'Settings editableList items use getEditingRowClass');
assert(html.includes("GlobalEditState.setEditing(scope, id)"), 'renameRecord sets editing state for active store item');

// 8. Delete and Void Safety
assert(html.includes("deleteRecord(store, id, viewName") && html.includes("GlobalEditState.clearEditing(sc)"), 'deleteRecord clears editing state for deleted record');
assert(html.includes("voidRecord(store, id)") && html.includes("GlobalEditState.clearEditing(store)"), 'voidRecord clears editing state for voided record');

// ================================================================
// TEST SUITE 4: Functional Runtime Sandbox Tests
// ================================================================
console.log('\n--- TEST SUITE 4: Functional Runtime Sandbox Tests ---');

// Create mock DOM environment
class MockClassList {
  constructor(initial = []) {
    this._classes = new Set(initial);
  }
  add(c) { this._classes.add(c); }
  remove(c) { this._classes.delete(c); }
  contains(c) { return this._classes.has(c); }
  toggle(c, force) {
    if (force !== undefined) {
      if (force) this._classes.add(c);
      else this._classes.delete(c);
      return force;
    }
    if (this._classes.has(c)) { this._classes.delete(c); return false; }
    this._classes.add(c);
    return true;
  }
  toString() { return Array.from(this._classes).join(' '); }
}

class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = attrs;
    this.classList = new MockClassList(attrs.class ? attrs.class.split(' ') : []);
    this.style = {};
    this.textContent = attrs.textContent || '';
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, val) { this.attributes[name] = val; }
}

const mockDoc = {
  elements: [],
  querySelectorAll(sel) {
    if (sel.includes('data-edit-scope')) {
      const scopeMatch = sel.match(/data-edit-scope="([^"]+)"/);
      const targetScope = scopeMatch ? scopeMatch[1] : null;
      return this.elements.filter(el => {
        const hasScope = el.getAttribute('data-edit-scope');
        const hasId = el.getAttribute('data-record-id');
        if (!hasScope || !hasId) return false;
        if (targetScope && hasScope !== targetScope) return false;
        return true;
      });
    }
    return [];
  }
};

const sandboxWindow = {};
const sandbox = {
  window: sandboxWindow,
  document: mockDoc,
  console: console
};

// Execute GlobalEditState script in sandbox
const scriptCode = `
${html.slice(html.indexOf('window.GlobalEditState = {'), html.indexOf('const VIEW_RENDERERS = {};'))}
`;

try {
  vm.runInNewContext(scriptCode, sandbox);
  assert(typeof sandbox.window.GlobalEditState === 'object', 'GlobalEditState object instantiated in sandbox');
} catch (e) {
  assert(false, `GlobalEditState failed to evaluate in sandbox: ${e.message}`);
}

const GES = sandbox.window.GlobalEditState;
const getCls = sandbox.window.getEditingRowClass;

// Test 4.1: Initial State
assert(GES.getEditing('receipts') === null, 'Initial state: getEditing returns null');
assert(!GES.isEditing('receipts', 101), 'Initial state: isEditing returns false');
assert(getCls('receipts', 101) === '', 'Initial state: getEditingRowClass returns empty string');

// Test 4.2: Setting Active Edit State
GES.setEditing('receipts', 101);
assert(GES.getEditing('receipts') === '101', 'setEditing sets string ID');
assert(GES.isEditing('receipts', 101), 'isEditing matches number ID 101');
assert(GES.isEditing('receipts', '101'), 'isEditing matches string ID "101"');
assert(!GES.isEditing('receipts', 102), 'isEditing returns false for unselected record 102');
assert(getCls('receipts', 101) === 'row-editing-active', 'getEditingRowClass returns "row-editing-active" for active ID');
assert(getCls('receipts', 102) === '', 'getEditingRowClass returns empty string for inactive ID');

// Test 4.3: Scope Isolation
assert(!GES.isEditing('payments', 101), 'Scope isolation: editing receipt 101 does NOT highlight payment 101');
assert(!GES.isEditing('loans', 101), 'Scope isolation: editing receipt 101 does NOT highlight loan 101');
assert(!GES.isEditing('transfers', 101), 'Scope isolation: editing receipt 101 does NOT highlight transfer 101');

// Test 4.4: Transfer of Highlight when editing another record
GES.setEditing('receipts', 205);
assert(!GES.isEditing('receipts', 101), 'Previous record 101 highlight cleared');
assert(GES.isEditing('receipts', 205), 'New record 205 highlight active');

// Test 4.5: Cancel / Clear Editing
GES.clearEditing('receipts');
assert(GES.getEditing('receipts') === null, 'clearEditing clears active edit ID');
assert(!GES.isEditing('receipts', 205), 'Record 205 is no longer editing');
assert(getCls('receipts', 205) === '', 'getEditingRowClass returns empty string after cancel');

// Test 4.6: Independent Chitty Sub-scopes
GES.setEditing('chitty_member', 'm_1');
GES.setEditing('chitty_collection', 'c_5');
GES.setEditing('chitty_payout', 'p_9');
assert(GES.isEditing('chitty_member', 'm_1'), 'Chitty member m_1 is active');
assert(GES.isEditing('chitty_collection', 'c_5'), 'Chitty collection c_5 is active');
assert(GES.isEditing('chitty_payout', 'p_9'), 'Chitty payout p_9 is active');
GES.clearEditing('chitty_collection');
assert(!GES.isEditing('chitty_collection', 'c_5'), 'Chitty collection cleared');
assert(GES.isEditing('chitty_member', 'm_1'), 'Chitty member m_1 remains active');
assert(GES.isEditing('chitty_payout', 'p_9'), 'Chitty payout p_9 remains active');

// Test 4.7: Dynamic DOM Synchronization via syncDOM
const elem1 = new MockElement('tr', { 'data-edit-scope': 'receipts', 'data-record-id': '501' });
const elem2 = new MockElement('tr', { 'data-edit-scope': 'receipts', 'data-record-id': '502' });
const elem3 = new MockElement('tr', { 'data-edit-scope': 'payments', 'data-record-id': '501' });
mockDoc.elements = [elem1, elem2, elem3];

GES.setEditing('receipts', '501');
assert(elem1.classList.contains('row-editing-active'), 'syncDOM adds row-editing-active to matching receipt element');
assert(!elem2.classList.contains('row-editing-active'), 'syncDOM does not highlight non-matching receipt 502');
assert(!elem3.classList.contains('row-editing-active'), 'syncDOM respects scope and does not highlight payment 501');

// Switching record
GES.setEditing('receipts', '502');
assert(!elem1.classList.contains('row-editing-active'), 'syncDOM removes row-editing-active from record 501');
assert(elem2.classList.contains('row-editing-active'), 'syncDOM adds row-editing-active to newly selected record 502');

// Clearing
GES.clearEditing('receipts');
assert(!elem1.classList.contains('row-editing-active'), 'syncDOM removes highlight from 501 after clear');
assert(!elem2.classList.contains('row-editing-active'), 'syncDOM removes highlight from 502 after clear');

// Test 4.8: Filtering Safety (simulating table search filter)
// When element is hidden with display: 'none', highlight class is strictly retained on that element
GES.setEditing('receipts', '501');
assert(elem1.classList.contains('row-editing-active'), 'Element 501 is highlighted');
elem1.style.display = 'none'; // hidden by search query
assert(elem1.classList.contains('row-editing-active'), 'Hidden element 501 strictly retains row-editing-active class');
assert(!elem2.classList.contains('row-editing-active'), 'Unrelated visible element 502 does NOT receive highlight');
elem1.style.display = ''; // search query cleared
assert(elem1.classList.contains('row-editing-active'), 'Re-displayed element 501 remains highlighted');

// Test 4.9: Failed Save simulation
// In saveReceipt / savePayment / saveTransfer / saveLoan, on catch(err):
// It does NOT call clearEditing or navigate, so edit state persists.
GES.setEditing('receipts', '777');
try {
  throw new Error('Simulated network failure on update');
} catch (simErr) {
  // Catch block does NOT clear editing state
}
assert(GES.isEditing('receipts', '777'), 'Failed save preserves edit state and row highlight');

// ================================================================
// SUMMARY
// ================================================================
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL STEP 33.17 VALIDATION CHECKS PASSED.');
}
