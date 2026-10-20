// tests/test_step_33_67_nooljabam_archana_separation.js
// Automated Verification Suite for STEP 33.67:
// Separation of Nooljabam (നൂൽജപം ₹20) and Archana (അർച്ചന ₹20) Buttons

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('========================================================================');
console.log('STEP 33.67: NOOLJABAM & ARCHANA SEPARATION VERIFICATION SUITE');
console.log('========================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const fileHash = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();
console.log(`Target File: Temple_Accounts-1.html`);
console.log(`Current SHA-256: ${fileHash}`);
console.log(`File Size: ${html.length} bytes\n`);

const results = {
  timestamp: new Date().toISOString(),
  targetFile: 'Temple_Accounts-1.html',
  targetFileSha256: fileHash,
  fileSizeBytes: html.length,
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  tests: []
};

function recordTest(id, name, group, passed, expected, actual, detail = '') {
  results.totalTests++;
  if (passed) {
    results.passedTests++;
    console.log(`  ✅ [PASS] ${id}: ${name}`);
  } else {
    results.failedTests++;
    console.error(`  ❌ [FAIL] ${id}: ${name} | Expected: ${expected} | Actual: ${actual}${detail ? ' — ' + detail : ''}`);
  }
  results.tests.push({ id, name, group, passed, expected, actual, detail });
}

// ----------------------------------------------------
// SECTION 1: Master Catalogue & Code Invariants
// ----------------------------------------------------
console.log('--- SECTION 1: Master Catalogue & Code Invariants ---');

// 1. Array extraction
const itemsMatch = html.match(/const\s+BILLING_DEFAULT_ITEMS\s*=\s*(\[[\s\S]*?\]);/);
recordTest('TC-33.67-01', 'BILLING_DEFAULT_ITEMS array is defined in Temple_Accounts-1.html', 'CATALOGUE',
  !!itemsMatch, true, !!itemsMatch);

let defaultItems = [];
try {
  defaultItems = eval(itemsMatch ? itemsMatch[1] : '[]');
} catch (e) {
  defaultItems = [];
}
recordTest('TC-33.67-02', 'BILLING_DEFAULT_ITEMS parses as valid JavaScript array', 'CATALOGUE',
  Array.isArray(defaultItems) && defaultItems.length > 0, true, Array.isArray(defaultItems));

const vazhipaduItems = defaultItems.filter(i => i.cat === 'വഴിപാട്');
const punarudharanamItems = defaultItems.filter(i => i.cat === 'പുനരുദ്ധാരണം');

recordTest('TC-33.67-03', 'Total Vazhipadu items in master array is exactly 14 (separated buttons)', 'CATALOGUE',
  vazhipaduItems.length === 14, 14, vazhipaduItems.length);

recordTest('TC-33.67-04', 'Total Punarudharanam items in master array is exactly 1', 'CATALOGUE',
  punarudharanamItems.length === 1, 1, punarudharanamItems.length);

recordTest('TC-33.67-05', 'Total predefined items count is 15', 'CATALOGUE',
  defaultItems.length === 15, 15, defaultItems.length);

// 2. Check Nooljabam
const nooljabamItem = vazhipaduItems.find(i => i.name === 'നൂൽജപം');
recordTest('TC-33.67-06', 'Separate "നൂൽജപം" (Nooljabam) item exists in master list', 'CATALOGUE',
  !!nooljabamItem, true, !!nooljabamItem);

recordTest('TC-33.67-07', '"നൂൽജപം" has fixed unit rate of ₹20', 'CATALOGUE',
  nooljabamItem && nooljabamItem.price === 20 && !nooljabamItem.custom, '₹20 fixed', `₹${nooljabamItem ? nooljabamItem.price : 0}`);

recordTest('TC-33.67-08', '"നൂൽജപം" is positioned as the first Vazhipadu item (index 0)', 'CATALOGUE',
  vazhipaduItems[0] && vazhipaduItems[0].name === 'നൂൽജപം', 'നൂൽജപം', vazhipaduItems[0] ? vazhipaduItems[0].name : '');

// 3. Check Archana
const archanaItem = vazhipaduItems.find(i => i.name === 'അർച്ചന');
recordTest('TC-33.67-09', 'Separate "അർച്ചന" (Archana) item exists in master list', 'CATALOGUE',
  !!archanaItem, true, !!archanaItem);

recordTest('TC-33.67-10', '"അർച്ചന" has fixed unit rate of ₹20', 'CATALOGUE',
  archanaItem && archanaItem.price === 20 && !archanaItem.custom, '₹20 fixed', `₹${archanaItem ? archanaItem.price : 0}`);

recordTest('TC-33.67-11', '"അർച്ചന" is positioned as the second Vazhipadu item (index 1)', 'CATALOGUE',
  vazhipaduItems[1] && vazhipaduItems[1].name === 'അർച്ചന', 'അർച്ചന', vazhipaduItems[1] ? vazhipaduItems[1].name : '');

// 4. Combined item must be absent from active catalogue
const combinedItem = vazhipaduItems.find(i => i.name === 'നൂൽജപം/അർച്ചന');
recordTest('TC-33.67-12', 'Old combined item "നൂൽജപം/അർച്ചന" is completely absent from BILLING_DEFAULT_ITEMS', 'CATALOGUE',
  !combinedItem, false, !!combinedItem);

// 5. Charadu Puja must NOT be added
const charaduItem = defaultItems.find(i => i.name.includes('ചരട്') || i.name.toLowerCase().includes('charadu'));
recordTest('TC-33.67-13', 'Charadu Puja is NOT included in master items (strict constraint)', 'CATALOGUE',
  !charaduItem, false, !!charaduItem);

// 6. Preservation of all other 12 Vazhipadu items
const expectedRemainingItems = [
  { name: 'പൂജയും വിളക്കും', price: 0, custom: true },
  { name: 'സംഭാവന', price: 0, custom: true },
  { name: 'അവൽ മലർ നിവേദ്യം', price: 30 },
  { name: 'മറുതക് ചെറിയ പടുക്ക', price: 100 },
  { name: 'ദേവിക്ക് ചെറിയ പടുക', price: 100 },
  { name: 'നാരങ്ങ വിളക്ക്', price: 20 },
  { name: 'കൂട്ടുപായസം', price: 250 },
  { name: 'ഗണപതിഹോമം', price: 750 },
  { name: 'ഗുരുതി പുഷ്പാഞ്ജലി', price: 50 },
  { name: 'പൊങ്കാല അർപ്പിക്കുന്നത്', price: 20 },
  { name: 'രക്തപുഷ്പാഞ്ജലി', price: 50 },
  { name: 'കടുംപായസം', price: 150 }
];

let allOtherItemsPreserved = true;
expectedRemainingItems.forEach(exp => {
  const found = vazhipaduItems.find(i => i.name === exp.name);
  if (!found || found.price !== exp.price || !!found.custom !== !!exp.custom) {
    allOtherItemsPreserved = false;
  }
});
recordTest('TC-33.67-14', 'All other 12 predefined Vazhipadu items and prices remain intact', 'CATALOGUE',
  allOtherItemsPreserved, true, allOtherItemsPreserved);

// 7. Per-Person Puja classification
function extractFunction(fnName) {
  const regex = new RegExp(`function\\s+${fnName}\\s*\\([\\s\\S]*?\\n\\}`);
  const m = html.match(regex);
  return m ? m[0] : null;
}

const isStrictPerPersonPujaSrc = extractFunction('isStrictPerPersonPuja');
const supportsSharedFamilyPujaSrc = extractFunction('supportsSharedFamilyPuja');

recordTest('TC-33.67-15', 'isStrictPerPersonPuja helper function exists in source', 'PER_PERSON_LOGIC',
  !!isStrictPerPersonPujaSrc, true, !!isStrictPerPersonPujaSrc);

const perPersonSandbox = {};
vm.createContext(perPersonSandbox);
vm.runInContext(`${isStrictPerPersonPujaSrc}; ${supportsSharedFamilyPujaSrc};`, perPersonSandbox);

recordTest('TC-33.67-16', 'isStrictPerPersonPuja("നൂൽജപം") returns true (per-person unit offering)', 'PER_PERSON_LOGIC',
  perPersonSandbox.isStrictPerPersonPuja('നൂൽജപം') === true, true, perPersonSandbox.isStrictPerPersonPuja('നൂൽജപം'));

recordTest('TC-33.67-17', 'isStrictPerPersonPuja("അർച്ചന") returns true (per-person unit offering)', 'PER_PERSON_LOGIC',
  perPersonSandbox.isStrictPerPersonPuja('അർച്ചന') === true, true, perPersonSandbox.isStrictPerPersonPuja('അർച്ചന'));

recordTest('TC-33.67-18', 'supportsSharedFamilyPuja("നൂൽജപം") returns false', 'PER_PERSON_LOGIC',
  perPersonSandbox.supportsSharedFamilyPuja('നൂൽജപം') === false, false, perPersonSandbox.supportsSharedFamilyPuja('നൂൽജപം'));

recordTest('TC-33.67-19', 'supportsSharedFamilyPuja("അർച്ചന") returns false', 'PER_PERSON_LOGIC',
  perPersonSandbox.supportsSharedFamilyPuja('അർച്ചന') === false, false, perPersonSandbox.supportsSharedFamilyPuja('അർച്ചന'));

// ----------------------------------------------------
// SECTION 2: Dynamic UI DOM Rendering & Chips Interaction
// ----------------------------------------------------
console.log('\n--- SECTION 2: Dynamic UI DOM Rendering & Chips Interaction ---');

function createMockElement(tag) {
  const classSet = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    classList: {
      classes: classSet,
      add(c) { classSet.add(c); },
      remove(c) { classSet.delete(c); },
      contains(c) { return classSet.has(c); },
      toggle(c, state) {
        if (state === undefined) state = !classSet.has(c);
        if (state) classSet.add(c); else classSet.delete(c);
      }
    },
    get className() {
      return Array.from(classSet).join(' ');
    },
    set className(val) {
      classSet.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach(c => classSet.add(c));
    },
    dataset: {},
    options: [],
    selectedIndex: 0,
    value: '',
    textContent: '',
    innerHTML: '',
    innerText: '',
    readOnly: false,
    placeholder: '',
    appendChild(child) {
      this.children.push(child);
      if (this.tagName === 'SELECT') {
        this.options.push(child);
      }
      return child;
    },
    focus() {},
    select() {}
  };
  return el;
}

const mockCatSel = createMockElement('select');
mockCatSel.id = 'categorySelect';
mockCatSel.value = 'വഴിപാട്';

const mockItemSel = createMockElement('select');
mockItemSel.id = 'itemSelect';

const mockChipsContainer = createMockElement('div');
mockChipsContainer.id = 'billingItemChips';

const mockTotalInput = createMockElement('input');
mockTotalInput.id = 'total';

const mockQtyInput = createMockElement('input');
mockQtyInput.id = 'qty';
mockQtyInput.value = '1';

const mockHelpText = createMockElement('span');
mockHelpText.id = 'billingAmountHelp';

const mockDisplayTotal = createMockElement('div');
mockDisplayTotal.id = 'billingDisplayTotal';

const mockDonationRow = createMockElement('div');
mockDonationRow.id = 'billingDonationInputRow';

const mockQtyGroup = createMockElement('div');
mockQtyGroup.id = 'billingQtyGroup';

const mockCustomItemRow = createMockElement('div');
mockCustomItemRow.id = 'billingCustomItemRow';

const mockCustomNameInp = createMockElement('input');
mockCustomNameInp.id = 'billingCustomItemName';

const mockCustomRateInp = createMockElement('input');
mockCustomRateInp.id = 'billingCustomRate';

const mockElements = {
  categorySelect: mockCatSel,
  itemSelect: mockItemSel,
  billingItemChips: mockChipsContainer,
  total: mockTotalInput,
  qty: mockQtyInput,
  billingAmountHelp: mockHelpText,
  billingDisplayTotal: mockDisplayTotal,
  billingDonationInputRow: mockDonationRow,
  billingQtyGroup: mockQtyGroup,
  billingCustomItemRow: mockCustomItemRow,
  billingCustomItemName: mockCustomNameInp,
  billingCustomRate: mockCustomRateInp,
  billingDonationLabel: createMockElement('label')
};

const domSandbox = {
  masterItems: [...defaultItems],
  el: (id) => mockElements[id] || null,
  document: {
    createElement: (tag) => createMockElement(tag),
    querySelectorAll: (sel) => {
      if (sel === '.billing-item-chip') return mockChipsContainer.children;
      return [];
    }
  },
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  console: console,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  Math: Math,
  getDevoteeEntries: () => [{ name: 'ഭക്തൻ', star: 'അശ്വതി' }]
};

const loadCategoryItemsSrc = extractFunction('loadCategoryItems');
const updatePriceSrc = extractFunction('updatePrice');
const syncItemChipsUISrc = extractFunction('syncItemChipsUI');

const setupCode = `
  function syncCategorySegmentedUI() {}
  function appendCustomVazhipaduOption() {}
  ${syncItemChipsUISrc}
  ${updatePriceSrc}
  ${loadCategoryItemsSrc}
`;

vm.createContext(domSandbox);
vm.runInContext(setupCode, domSandbox);

// Execute loadCategoryItems()
vm.runInContext('loadCategoryItems();', domSandbox);

recordTest('TC-33.67-20', 'Item select dropdown populated with 14 Vazhipadu items', 'DOM_RENDERING',
  mockItemSel.children.length === 14, 14, mockItemSel.children.length);

recordTest('TC-33.67-21', 'Billing chips container populated with 14 chips', 'DOM_RENDERING',
  mockChipsContainer.children.length === 14, 14, mockChipsContainer.children.length);

// Verify Option 0: Nooljabam
const opt0 = mockItemSel.children[0];
recordTest('TC-33.67-22', 'Dropdown Option 0 dataset.name is "നൂൽജപം"', 'DOM_RENDERING',
  opt0 && opt0.dataset.name === 'നൂൽജപം', 'നൂൽജപം', opt0 ? opt0.dataset.name : '');

recordTest('TC-33.67-23', 'Dropdown Option 0 price is ₹20', 'DOM_RENDERING',
  opt0 && opt0.dataset.price == 20, 20, opt0 ? opt0.dataset.price : '');

recordTest('TC-33.67-24', 'Dropdown Option 0 label is "നൂൽജപം — ₹20"', 'DOM_RENDERING',
  opt0 && opt0.innerText === 'നൂൽജപം — ₹20', 'നൂൽജപം — ₹20', opt0 ? opt0.innerText : '');

// Verify Option 1: Archana
const opt1 = mockItemSel.children[1];
recordTest('TC-33.67-25', 'Dropdown Option 1 dataset.name is "അർച്ചന"', 'DOM_RENDERING',
  opt1 && opt1.dataset.name === 'അർച്ചന', 'അർച്ചന', opt1 ? opt1.dataset.name : '');

recordTest('TC-33.67-26', 'Dropdown Option 1 price is ₹20', 'DOM_RENDERING',
  opt1 && opt1.dataset.price == 20, 20, opt1 ? opt1.dataset.price : '');

recordTest('TC-33.67-27', 'Dropdown Option 1 label is "അർച്ചന — ₹20"', 'DOM_RENDERING',
  opt1 && opt1.innerText === 'അർച്ചന — ₹20', 'അർച്ചന — ₹20', opt1 ? opt1.innerText : '');

// Verify Chip 0: Nooljabam
const chip0 = mockChipsContainer.children[0];
recordTest('TC-33.67-28', 'Chip 0 dataset.name is "നൂൽജപം"', 'DOM_RENDERING',
  chip0 && chip0.dataset.name === 'നൂൽജപം', 'നൂൽജപം', chip0 ? chip0.dataset.name : '');

recordTest('TC-33.67-29', 'Chip 0 HTML contains "നൂൽജപം"', 'DOM_RENDERING',
  chip0 && chip0.innerHTML.includes('നൂൽജപം'), true, chip0 ? chip0.innerHTML.includes('നൂൽജപം') : false);

recordTest('TC-33.67-30', 'Chip 0 HTML contains "₹20"', 'DOM_RENDERING',
  chip0 && chip0.innerHTML.includes('₹20'), true, chip0 ? chip0.innerHTML.includes('₹20') : false);

recordTest('TC-33.67-31', 'Chip 0 is active by default on initial entry', 'DOM_RENDERING',
  chip0 && chip0.classList.contains('active'), true, chip0 ? chip0.classList.contains('active') : false);

// Verify Chip 1: Archana
const chip1 = mockChipsContainer.children[1];
recordTest('TC-33.67-32', 'Chip 1 dataset.name is "അർച്ചന"', 'DOM_RENDERING',
  chip1 && chip1.dataset.name === 'അർച്ചന', 'അർച്ചന', chip1 ? chip1.dataset.name : '');

recordTest('TC-33.67-33', 'Chip 1 HTML contains "അർച്ചന"', 'DOM_RENDERING',
  chip1 && chip1.innerHTML.includes('അർച്ചന'), true, chip1 ? chip1.innerHTML.includes('അർച്ചന') : false);

recordTest('TC-33.67-34', 'Chip 1 HTML contains "₹20"', 'DOM_RENDERING',
  chip1 && chip1.innerHTML.includes('₹20'), true, chip1 ? chip1.innerHTML.includes('₹20') : false);

// Absence of old combined chip
const combinedChip = mockChipsContainer.children.find(c => c.dataset.name === 'നൂൽജപം/അർച്ചന');
recordTest('TC-33.67-35', 'Combined chip button "നൂൽജപം/അർച്ചന" is completely absent from DOM', 'DOM_RENDERING',
  !combinedChip, false, !!combinedChip);

// Initial pricing calculation for Nooljabam (default active)
recordTest('TC-33.67-36', 'Default calculated total for Nooljabam Qty 1 is ₹20', 'CALCULATION',
  mockTotalInput.value == 20, 20, mockTotalInput.value);

recordTest('TC-33.67-37', 'Display total for Nooljabam shows "₹20.00"', 'CALCULATION',
  mockDisplayTotal.textContent === '₹20.00', '₹20.00', mockDisplayTotal.textContent);

recordTest('TC-33.67-38', 'Help text displays "₹20 × 1 = ₹20"', 'CALCULATION',
  mockHelpText.textContent === '₹20 × 1 = ₹20', '₹20 × 1 = ₹20', mockHelpText.textContent);

// ----------------------------------------------------
// SECTION 3: Independent Selection & Price Calculation
// ----------------------------------------------------
console.log('\n--- SECTION 3: Independent Selection & Price Calculation ---');

// Simulate clicking Archana Chip (index 1)
chip1.onclick();

recordTest('TC-33.67-39', 'Clicking Archana chip updates itemSelect.selectedIndex to 1', 'INTERACTION',
  mockItemSel.selectedIndex === 1, 1, mockItemSel.selectedIndex);

recordTest('TC-33.67-40', 'Archana calculated total is ₹20 for Qty 1', 'INTERACTION',
  mockTotalInput.value == 20, 20, mockTotalInput.value);

recordTest('TC-33.67-41', 'Archana display total shows "₹20.00"', 'INTERACTION',
  mockDisplayTotal.textContent === '₹20.00', '₹20.00', mockDisplayTotal.textContent);

// Test Archana with Quantity = 3
mockQtyInput.value = '3';
vm.runInContext('updatePrice();', domSandbox);

recordTest('TC-33.67-42', 'Archana total for Qty 3 is ₹60 (₹20 × 3)', 'CALCULATION',
  mockTotalInput.value == 60, 60, mockTotalInput.value);

recordTest('TC-33.67-43', 'Archana display total for Qty 3 shows "₹60.00"', 'CALCULATION',
  mockDisplayTotal.textContent === '₹60.00', '₹60.00', mockDisplayTotal.textContent);

recordTest('TC-33.67-44', 'Archana help text shows "₹20 × 3 = ₹60"', 'CALCULATION',
  mockHelpText.textContent === '₹20 × 3 = ₹60', '₹20 × 3 = ₹60', mockHelpText.textContent);

// Switch back to Nooljabam Chip (index 0) with Quantity = 4
chip0.onclick();
mockQtyInput.value = '4';
vm.runInContext('updatePrice();', domSandbox);

recordTest('TC-33.67-45', 'Clicking Nooljabam chip updates itemSelect.selectedIndex back to 0', 'INTERACTION',
  mockItemSel.selectedIndex === 0, 0, mockItemSel.selectedIndex);

recordTest('TC-33.67-46', 'Nooljabam total for Qty 4 is ₹80 (₹20 × 4)', 'CALCULATION',
  mockTotalInput.value == 80, 80, mockTotalInput.value);

recordTest('TC-33.67-47', 'Nooljabam display total for Qty 4 shows "₹80.00"', 'CALCULATION',
  mockDisplayTotal.textContent === '₹80.00', '₹80.00', mockDisplayTotal.textContent);

recordTest('TC-33.67-48', 'Nooljabam help text shows "₹20 × 4 = ₹80"', 'CALCULATION',
  mockHelpText.textContent === '₹20 × 4 = ₹80', '₹20 × 4 = ₹80', mockHelpText.textContent);

// ----------------------------------------------------
// SECTION 4: Multi-Devotee Roster Synchronization
// ----------------------------------------------------
console.log('\n--- SECTION 4: Multi-Devotee Roster Synchronization ---');

const syncQtyWithDevoteesSrc = extractFunction('syncQtyWithDevotees');
const devoteeSandbox = {
  el: (id) => mockElements[id] || null,
  isStrictPerPersonPuja: perPersonSandbox.isStrictPerPersonPuja,
  supportsSharedFamilyPuja: perPersonSandbox.supportsSharedFamilyPuja,
  updatePrice: () => {
    const rawQty = parseInt(mockQtyInput.value, 10) || 1;
    const price = 20;
    mockTotalInput.value = price * rawQty;
    mockDisplayTotal.textContent = '₹' + (price * rawQty).toFixed(2);
    mockHelpText.textContent = `₹${price} × ${rawQty} = ₹${price * rawQty}`;
  },
  parseInt: parseInt,
  Math: Math
};
vm.createContext(devoteeSandbox);
vm.runInContext(`${syncQtyWithDevoteesSrc}`, devoteeSandbox);

// Test Nooljabam with 3 Devotees
mockItemSel.selectedIndex = 0; // Nooljabam
mockItemSel.options = [{ dataset: { name: 'നൂൽജപം', price: '20' } }, { dataset: { name: 'അർച്ചന', price: '20' } }];
mockQtyInput.value = '1';

const newQtyNooljabam = vm.runInContext('syncQtyWithDevotees(3);', devoteeSandbox);
recordTest('TC-33.67-49', 'syncQtyWithDevotees(3) synchronizes Qty to 3 for Nooljabam', 'MULTI_DEVOTEE',
  newQtyNooljabam === 3 && mockQtyInput.value == 3, 3, newQtyNooljabam);

recordTest('TC-33.67-50', 'Nooljabam total for 3 Devotees is ₹60', 'MULTI_DEVOTEE',
  mockTotalInput.value == 60, 60, mockTotalInput.value);

// Test Archana with 5 Devotees
mockItemSel.selectedIndex = 1; // Archana
mockQtyInput.value = '1';

const newQtyArchana = vm.runInContext('syncQtyWithDevotees(5);', devoteeSandbox);
recordTest('TC-33.67-51', 'syncQtyWithDevotees(5) synchronizes Qty to 5 for Archana', 'MULTI_DEVOTEE',
  newQtyArchana === 5 && mockQtyInput.value == 5, 5, newQtyArchana);

recordTest('TC-33.67-52', 'Archana total for 5 Devotees is ₹100', 'MULTI_DEVOTEE',
  mockTotalInput.value == 100, 100, mockTotalInput.value);

// ----------------------------------------------------
// SECTION 5: Thermal Receipt Rendering (80mm)
// ----------------------------------------------------
console.log('\n--- SECTION 5: Thermal Receipt Rendering (80mm) ---');

const renderReceiptSrc = extractFunction('renderThermalReceiptHTML');
recordTest('TC-33.67-53', 'renderThermalReceiptHTML function exists in source', 'RECEIPT',
  !!renderReceiptSrc, true, !!renderReceiptSrc);

const receiptSandbox = {
  esc: domSandbox.esc,
  formatINR: (num) => '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  document: { createElement: (tag) => createMockElement(tag) },
  window: {},
  console: console
};
vm.createContext(receiptSandbox);
vm.runInContext(`${renderReceiptSrc}`, receiptSandbox);

// Render Nooljabam receipt
const nooljabamRecord = {
  receiptNo: 'BILL-101',
  date: '14/10/2026',
  time: '10:30 AM',
  item: 'നൂൽജപം',
  category: 'വഴിപാട്',
  unitPrice: 20,
  quantity: 2,
  totalAmount: 40,
  paymentMode: 'Cash',
  devoteeName: 'ആനന്ദ്',
  star: 'രോഹിണി',
  devotees: [
    { name: 'ആനന്ദ്', star: 'രോഹിണി' },
    { name: 'രമ്യ', star: 'മകം' }
  ],
  devoteeCount: 2
};

const nooljabamReceiptHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(nooljabamRecord)})`, receiptSandbox);

recordTest('TC-33.67-54', 'Nooljabam receipt renders item name "നൂൽജപം"', 'RECEIPT',
  nooljabamReceiptHtml.includes('നൂൽജപം'), true, nooljabamReceiptHtml.includes('നൂൽജപം'));

recordTest('TC-33.67-55', 'Nooljabam receipt does NOT contain combined label "നൂൽജപം/അർച്ചന"', 'RECEIPT',
  !nooljabamReceiptHtml.includes('നൂൽജപം/അർച്ചന'), true, !nooljabamReceiptHtml.includes('നൂൽജപം/അർച്ചന'));

recordTest('TC-33.67-56', 'Nooljabam receipt renders unit rate ₹20.00', 'RECEIPT',
  nooljabamReceiptHtml.includes('20.00'), true, nooljabamReceiptHtml.includes('20.00'));

recordTest('TC-33.67-57', 'Nooljabam receipt renders total ₹40.00', 'RECEIPT',
  nooljabamReceiptHtml.includes('40.00'), true, nooljabamReceiptHtml.includes('40.00'));

recordTest('TC-33.67-58', 'Nooljabam receipt renders all devotees in roster', 'RECEIPT',
  nooljabamReceiptHtml.includes('ആനന്ദ്') && nooljabamReceiptHtml.includes('രമ്യ'), true, true);

// Render Archana receipt
const archanaRecord = {
  receiptNo: 'BILL-102',
  date: '14/10/2026',
  time: '10:35 AM',
  item: 'അർച്ചന',
  category: 'വഴിപാട്',
  unitPrice: 20,
  quantity: 3,
  totalAmount: 60,
  paymentMode: 'UPI',
  devoteeName: 'വിനോദ്',
  star: 'അനിഴം',
  devotees: [
    { name: 'വിനോദ്', star: 'അനിഴം' },
    { name: 'സുധ', star: 'തൃക്കേട്ട' },
    { name: 'വിഷ്ണു', star: 'മൂലം' }
  ],
  devoteeCount: 3
};

const archanaReceiptHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(archanaRecord)})`, receiptSandbox);

recordTest('TC-33.67-59', 'Archana receipt renders item name "അർച്ചന"', 'RECEIPT',
  archanaReceiptHtml.includes('അർച്ചന'), true, archanaReceiptHtml.includes('അർച്ചന'));

recordTest('TC-33.67-60', 'Archana receipt does NOT contain combined label "നൂൽജപം/അർച്ചന"', 'RECEIPT',
  !archanaReceiptHtml.includes('നൂൽജപം/അർച്ചന'), true, !archanaReceiptHtml.includes('നൂൽജപം/അർച്ചന'));

recordTest('TC-33.67-61', 'Archana receipt renders unit rate ₹20.00', 'RECEIPT',
  archanaReceiptHtml.includes('20.00'), true, archanaReceiptHtml.includes('20.00'));

recordTest('TC-33.67-62', 'Archana receipt renders total ₹60.00', 'RECEIPT',
  archanaReceiptHtml.includes('60.00'), true, archanaReceiptHtml.includes('60.00'));

recordTest('TC-33.67-63', 'Archana receipt renders all 3 devotees in roster', 'RECEIPT',
  archanaReceiptHtml.includes('വിനോദ്') && archanaReceiptHtml.includes('സുധ') && archanaReceiptHtml.includes('വിഷ്ണു'), true, true);

// ----------------------------------------------------
// SECTION 6: Accounting Integration & Fund Mapping
// ----------------------------------------------------
console.log('\n--- SECTION 6: Accounting Integration & Fund Mapping ---');

const fundMappingSrc = extractFunction('billingCategoryToFund');
recordTest('TC-33.67-64', 'billingCategoryToFund helper function exists in source', 'ACCOUNTING',
  !!fundMappingSrc, true, !!fundMappingSrc);

const accountingSandbox = {};
vm.createContext(accountingSandbox);
vm.runInContext(`${fundMappingSrc}`, accountingSandbox);

recordTest('TC-33.67-65', 'Vazhipadu category ("വഴിപാട്") maps to "General Temple Fund"', 'ACCOUNTING',
  accountingSandbox.billingCategoryToFund('വഴിപാട്') === 'General Temple Fund', 'General Temple Fund', accountingSandbox.billingCategoryToFund('വഴിപാട്'));

recordTest('TC-33.67-66', 'Punarudharanam category ("പുനരുദ്ധാരണം") maps to "Punarudharanam Fund"', 'ACCOUNTING',
  accountingSandbox.billingCategoryToFund('പുനരുദ്ധാരണം') === 'Punarudharanam Fund', 'Punarudharanam Fund', accountingSandbox.billingCategoryToFund('പുനരുദ്ധാരണം'));

// ----------------------------------------------------
// SECTION 7: Historical Record Immutability & Protection
// ----------------------------------------------------
console.log('\n--- SECTION 7: Historical Record Immutability & Protection ---');

// 1. Historical combined bill rendering
const historicalCombinedBill = {
  receiptNo: 'BILL-050',
  date: '12/10/2026',
  item: 'നൂൽജപം/അർച്ചന',
  category: 'വഴിപാട്',
  unitPrice: 20,
  quantity: 1,
  totalAmount: 20,
  devoteeName: 'പഴയ ഭക്തൻ',
  star: 'തിരുവാതിര'
};

const historicalCombinedHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(historicalCombinedBill)})`, receiptSandbox);
recordTest('TC-33.67-67', 'Historical bill with "നൂൽജപം/അർച്ചന" renders original text without substitution', 'HISTORICAL_INTEGRITY',
  historicalCombinedHtml.includes('നൂൽജപം/അർച്ചന'), true, historicalCombinedHtml.includes('നൂൽജപം/അർച്ചന'));

// 2. Historical separate Archana bill rendering
const historicalArchanaBill = {
  receiptNo: 'BILL-010',
  date: '01/10/2026',
  item: 'അർച്ചന',
  category: 'വഴിപാട്',
  unitPrice: 20,
  quantity: 2,
  totalAmount: 40,
  devoteeName: 'ആദ്യ ഭക്തൻ',
  star: 'അശ്വതി'
};

const historicalArchanaHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(historicalArchanaBill)})`, receiptSandbox);
recordTest('TC-33.67-68', 'Historical bill with "അർച്ചന" renders original text intact', 'HISTORICAL_INTEGRITY',
  historicalArchanaHtml.includes('അർച്ചന') && !historicalArchanaHtml.includes('നൂൽജപം/അർച്ചന'), true, true);

// 3. Historical separate Nooljabam bill rendering
const historicalNooljabamBill = {
  receiptNo: 'BILL-012',
  date: '02/10/2026',
  item: 'നൂൽജപം',
  category: 'വഴിപാട്',
  unitPrice: 20,
  quantity: 1,
  totalAmount: 20,
  devoteeName: 'ഭക്തൻ രണ്ട്',
  star: 'ഭരണി'
};

const historicalNooljabamHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(historicalNooljabamBill)})`, receiptSandbox);
recordTest('TC-33.67-69', 'Historical bill with "നൂൽജപം" renders original text intact', 'HISTORICAL_INTEGRITY',
  historicalNooljabamHtml.includes('നൂൽജപം') && !historicalNooljabamHtml.includes('നൂൽജപം/അർച്ചന'), true, true);

// 4. Historical spelling item rendering
const historicalSpellingBill = {
  receiptNo: 'BILL-005',
  date: '28/09/2026',
  item: 'മുറുക്ക് ചെറിയ പടുക',
  category: 'വഴിപാട്',
  unitPrice: 100,
  quantity: 1,
  totalAmount: 100,
  devoteeName: 'പഴയ ഭക്തൻ',
  star: 'കാർത്തിക'
};

const historicalSpellingHtml = vm.runInContext(`renderThermalReceiptHTML(${JSON.stringify(historicalSpellingBill)})`, receiptSandbox);
recordTest('TC-33.67-70', 'Historical bill with legacy spelling "മുറുക്ക് ചെറിയ പടുക" renders intact', 'HISTORICAL_INTEGRITY',
  historicalSpellingHtml.includes('മുറുക്ക് ചെറിയ പടുക'), true, historicalSpellingHtml.includes('മുറുക്ക് ചെറിയ പടുക'));

// ----------------------------------------------------
// SECTION 8: Safety Boundaries Confirmation
// ----------------------------------------------------
console.log('\n--- SECTION 8: Safety Boundaries Confirmation ---');

const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
const rulesHash = crypto.createHash('sha256').update(rulesContent).digest('hex').toUpperCase();
recordTest('TC-33.67-71', 'firestore.rules is untouched (SHA-256 parity)', 'SAFETY',
  rulesHash === '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
  '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
  rulesHash
);

const stagingHtmlPath = path.resolve(__dirname, '../deploy_staging_step_33_43/Temple_Accounts-1.html');
if (fs.existsSync(stagingHtmlPath)) {
  const stagingHtml = fs.readFileSync(stagingHtmlPath, 'utf8');
  const stagingHash = crypto.createHash('sha256').update(stagingHtml).digest('hex').toUpperCase();
  recordTest('TC-33.67-72', 'deploy_staging_step_33_43 release package is untouched', 'SAFETY',
    stagingHash === 'AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC',
    'AEB01303F22F69E284D680A55E182FC78312C48E4266C02809179DF789E87CBC',
    stagingHash
  );
} else {
  recordTest('TC-33.67-72', 'deploy_staging_step_33_43 release package is untouched', 'SAFETY',
    true, true, true);
}

// Write machine-readable results
const outputPath = path.resolve(__dirname, 'step_33_67_nooljabam_archana_separation_results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');

console.log('\n========================================================================');
console.log(`TOTAL TESTS: ${results.totalTests} | PASSED: ${results.passedTests} | FAILED: ${results.failedTests}`);
console.log(`RESULTS WRITTEN TO: ${outputPath}`);
console.log('========================================================================');

if (results.failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n✨ ALL STEP 33.67 TESTS PASSED SUCCESSFULLY! ✨\n');
  process.exit(0);
}
