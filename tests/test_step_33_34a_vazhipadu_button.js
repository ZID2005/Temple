// tests/test_step_33_34a_vazhipadu_button.js
// Automated Verification Suite for STEP 33.34A:
// Vazhipadu Label Correction (മറുതക് ചെറിയ പടുക്ക) & Combined Billing Button (നൂൽജപം/അർച്ചന ₹20)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('STEP 33.34A VAZHIPADU LABEL CORRECTION & COMBINED BUTTON SUITE');
console.log('================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testDesc, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testDesc}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testDesc}${detail ? ' — ' + detail : ''}`);
    failedTests++;
  }
}

// ----------------------------------------------------
// TEST GROUP 1: Source Code & Array Definition Verification
// ----------------------------------------------------
console.log('TEST GROUP 1: Master List Source Code Verification');

const oldSpellingPattern = 'മുറുക്ക് ചെറിയ പടുക';
const newSpellingPattern = 'മറുതക് ചെറിയ പടുക്ക';
const combinedItemPattern = 'നൂൽജപം/അർച്ചന';

assert(!html.includes(oldSpellingPattern), 'Incorrect spelling "മുറുക്ക് ചെറിയ പടുക" is absent from Temple_Accounts-1.html');
assert(html.includes(newSpellingPattern), 'Correct spelling "മറുതക് ചെറിയ പടുക്ക" is present in Temple_Accounts-1.html');
assert(html.includes(combinedItemPattern), 'Combined item "നൂൽജപം/അർച്ചന" is present in Temple_Accounts-1.html');

// Extract BILLING_DEFAULT_ITEMS using RegExp
const itemsMatch = html.match(/const\s+BILLING_DEFAULT_ITEMS\s*=\s*(\[[\s\S]*?\]);/);
assert(!!itemsMatch, 'BILLING_DEFAULT_ITEMS array definition extracted from source');

const billingDefaultItems = eval(itemsMatch[1]);
assert(Array.isArray(billingDefaultItems), 'BILLING_DEFAULT_ITEMS parses as valid JavaScript array');

const vazhipaduItems = billingDefaultItems.filter(i => i.cat === 'വഴിപാട്');
assert(vazhipaduItems.length === 13, `Vazhipadu items count is exactly 13 (got ${vazhipaduItems.length})`);

// Check presence of corrected spelling
const correctedItem = vazhipaduItems.find(i => i.name === newSpellingPattern);
assert(!!correctedItem, `"${newSpellingPattern}" exists in master list`);
assert(correctedItem && correctedItem.price === 100, `"${newSpellingPattern}" has price ₹100`);

// Check absence of old spelling
const incorrectItem = vazhipaduItems.find(i => i.name === oldSpellingPattern);
assert(!incorrectItem, `"${oldSpellingPattern}" does not exist anywhere in master list`);

// Check combined button
const combinedItem = vazhipaduItems.find(i => i.name === combinedItemPattern);
assert(!!combinedItem, `"${combinedItemPattern}" exists in master list`);
assert(combinedItem && combinedItem.price === 20, `"${combinedItemPattern}" has fixed rate of ₹20`);
assert(combinedItem && !combinedItem.custom, `"${combinedItemPattern}" is a fixed price item (custom !== true)`);

// Check absence of old separate buttons
const oldNooljapam = vazhipaduItems.find(i => i.name === 'നൂൽജപം');
assert(!oldNooljapam, 'Old separate "നൂൽജപം" item is absent from master list');

const oldArchana = vazhipaduItems.find(i => i.name === 'അർച്ചന');
assert(!oldArchana, 'Old separate "അർച്ചന" item is absent from master list');

// Verify all other 11 Vazhipadu items and rates are preserved exactly
const expectedVazhipaduItems = [
  { name: 'നൂൽജപം/അർച്ചന', price: 20 },
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

let allOtherItemsMatch = true;
expectedVazhipaduItems.forEach(exp => {
  const found = vazhipaduItems.find(i => i.name === exp.name);
  if (!found || found.price !== exp.price || !!found.custom !== !!exp.custom) {
    allOtherItemsMatch = false;
  }
});
assert(allOtherItemsMatch, 'All 13 Vazhipadu items have exact expected names, rates, and custom flags');

// ----------------------------------------------------
// TEST GROUP 2: UI DOM Generation & Interaction Simulation
// ----------------------------------------------------
console.log('\nTEST GROUP 2: Billing UI & Chip Interaction Simulation');

// Setup mock DOM environment
function createMockElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    name: '',
    value: '',
    type: '',
    className: '',
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); el.className = Array.from(this.classes).join(' '); },
      remove(c) { this.classes.delete(c); el.className = Array.from(this.classes).join(' '); },
      contains(c) { return this.classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        } else if (force) {
          this.classes.add(c);
        } else {
          this.classes.delete(c);
        }
        el.className = Array.from(this.classes).join(' ');
      }
    },
    style: {},
    dataset: {},
    options: [],
    selectedIndex: 0,
    innerHTML: '',
    textContent: '',
    placeholder: '',
    readOnly: false,
    children: [],
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

const mockCategorySelect = createMockElement('select');
mockCategorySelect.id = 'categorySelect';
mockCategorySelect.value = 'വഴിപാട്';

const mockItemSelect = createMockElement('select');
mockItemSelect.id = 'itemSelect';

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

const mockElements = {
  categorySelect: mockCategorySelect,
  itemSelect: mockItemSelect,
  billingItemChips: mockChipsContainer,
  total: mockTotalInput,
  qty: mockQtyInput,
  billingAmountHelp: mockHelpText,
  billingDisplayTotal: mockDisplayTotal,
  billingDonationInputRow: mockDonationRow,
  billingQtyGroup: mockQtyGroup,
  billingDonationLabel: createMockElement('label')
};

// Mock DOM queries
const sandbox = {
  BILLING_DEFAULT_ITEMS: billingDefaultItems,
  masterItems: [...billingDefaultItems],
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
  isNaN: isNaN
};

// Extract functions from html: loadCategoryItems, updatePrice, syncItemChipsUI, syncCategorySegmentedUI
const funcMatches = {
  loadCategoryItems: html.match(/function loadCategoryItems\(\)\s*\{[\s\S]*?\n\}/)[0],
  updatePrice: html.match(/function updatePrice\(\)\s*\{[\s\S]*?\n\}/)[0],
  syncItemChipsUI: html.match(/function syncItemChipsUI\(\)\s*\{[\s\S]*?\n\}/)[0]
};

const scriptCode = `
  function syncCategorySegmentedUI() {}
  ${funcMatches.syncItemChipsUI}
  ${funcMatches.updatePrice}
  ${funcMatches.loadCategoryItems}
`;

vm.createContext(sandbox);
vm.runInContext(scriptCode, sandbox);

// Execute loadCategoryItems
sandbox.loadCategoryItems();

assert(mockItemSelect.options.length === 13, `Item select dropdown populated with 13 options (got ${mockItemSelect.options.length})`);
assert(mockChipsContainer.children.length === 13, `Billing chips container populated with 13 chips (got ${mockChipsContainer.children.length})`);

// Verify Option 0 is നൂൽജപം/അർച്ചന
const firstOpt = mockItemSelect.options[0];
assert(firstOpt && firstOpt.dataset.name === 'നൂൽജപം/അർച്ചന', `First dropdown option is "നൂൽജപം/അർച്ചന" (got "${firstOpt ? firstOpt.dataset.name : ''}")`);
assert(firstOpt && String(firstOpt.dataset.price) === '20', `First option price dataset is "20" (got "${firstOpt ? firstOpt.dataset.price : ''}")`);
assert(firstOpt && firstOpt.innerText === 'നൂൽജപം/അർച്ചന — ₹20', `First option label is "നൂൽജപം/അർച്ചന — ₹20"`);

// Verify Option 4 is മറുതക് ചെറിയ പടുക്ക
const padukkaOpt = mockItemSelect.options[4];
assert(padukkaOpt && padukkaOpt.dataset.name === 'മറുതക് ചെറിയ പടുക്ക', `Option 4 is "മറുതക് ചെറിയ പടുക്ക" (got "${padukkaOpt ? padukkaOpt.dataset.name : ''}")`);
assert(padukkaOpt && String(padukkaOpt.dataset.price) === '100', `Option 4 price dataset is "100"`);
assert(padukkaOpt && padukkaOpt.innerText === 'മറുതക് ചെറിയ പടുക്ക — ₹100', `Option 4 label is "മറുതക് ചെറിയ പടുക്ക — ₹100"`);

// Verify chips content
const firstChip = mockChipsContainer.children[0];
assert(firstChip && firstChip.dataset.name === 'നൂൽജപം/അർച്ചന', `First chip dataset name is "നൂൽജപം/അർച്ചന"`);
assert(firstChip && firstChip.innerHTML.includes('നൂൽജപം/അർച്ചന'), 'First chip contains name "നൂൽജപം/അർച്ചന"');
assert(firstChip && firstChip.innerHTML.includes('₹20'), 'First chip contains price "₹20"');

// Check that only 1 chip has നൂൽജപം/അർച്ചന
const nooljapamArchanaChips = mockChipsContainer.children.filter(c => c.dataset.name === 'നൂൽജപം/അർച്ചന');
assert(nooljapamArchanaChips.length === 1, `Exactly ONE selectable chip exists for "നൂൽജപം/അർച്ചന" (count: ${nooljapamArchanaChips.length})`);

// Check that 0 chips exist for old individual options
const separateNoolChips = mockChipsContainer.children.filter(c => c.dataset.name === 'നൂൽജപം');
assert(separateNoolChips.length === 0, 'Zero separate chips for "നൂൽജപം"');
const separateArchanaChips = mockChipsContainer.children.filter(c => c.dataset.name === 'അർച്ചന');
assert(separateArchanaChips.length === 0, 'Zero separate chips for "അർച്ചന"');
const separateOldPadukkaChips = mockChipsContainer.children.filter(c => c.dataset.name === 'മുറുക്ക് ചെറിയ പടുക');
assert(separateOldPadukkaChips.length === 0, 'Zero chips for incorrect spelling "മുറുക്ക് ചെറിയ പടുക"');

// Check default total calculation for index 0 (നൂൽജപം/അർച്ചന ₹20, qty: 1)
assert(mockTotalInput.value === '20' || mockTotalInput.value === 20, `Default calculated total is ₹20 (got ${mockTotalInput.value})`);
assert(mockDisplayTotal.textContent.includes('20.00'), `Display total shows ₹20.00 (got ${mockDisplayTotal.textContent})`);
assert(mockHelpText.textContent === '₹20 × 1 = ₹20', `Help text displays "₹20 × 1 = ₹20" (got "${mockHelpText.textContent}")`);

// Check quantity adjustment: qty = 3
mockQtyInput.value = '3';
sandbox.updatePrice();
assert(mockTotalInput.value === '60' || mockTotalInput.value === 60, `Calculated total for Qty 3 is ₹60 (got ${mockTotalInput.value})`);
assert(mockDisplayTotal.textContent.includes('60.00'), `Display total shows ₹60.00 for Qty 3`);
assert(mockHelpText.textContent === '₹20 × 3 = ₹60', `Help text displays "₹20 × 3 = ₹60"`);

// Reset qty to 1 and simulate chip click on മറുതക് ചെറിയ പടുക്ക (index 4)
mockQtyInput.value = '1';
padukkaChip = mockChipsContainer.children[4];
padukkaChip.onclick();
assert(mockItemSelect.selectedIndex === 4, `Selecting padukka chip updates selectedIndex to 4`);
assert(mockTotalInput.value === '100' || mockTotalInput.value === 100, `Calculated total for മറുതക് ചെറിയ പടുക്ക is ₹100 (got ${mockTotalInput.value})`);
assert(mockDisplayTotal.textContent.includes('100.00'), `Display total shows ₹100.00`);
assert(mockHelpText.textContent === '₹100 × 1 = ₹100', `Help text displays "₹100 × 1 = ₹100"`);

// ----------------------------------------------------
// TEST GROUP 3: Receipt Formatting & Accounting Integration
// ----------------------------------------------------
console.log('\nTEST GROUP 3: Receipt Rendering & Accounting Mapping');

// Extract renderThermalReceiptHTML, billingCategoryToFund, billingCategoryToIncomeCategory
const renderReceiptCode = html.match(/function renderThermalReceiptHTML\([\s\S]*?\n\}/)[0];
const fundMapCode = html.match(/function billingCategoryToFund\([\s\S]*?\n\}/)[0];
const incomeCatMapCode = html.match(/async function billingCategoryToIncomeCategory\([\s\S]*?\n\}/)[0];

const group3Sandbox = {
  esc: sandbox.esc,
  allIncomeCategories: async () => [{ name: 'Vazhipadu Income' }, { name: 'Donation Income' }]
};
vm.createContext(group3Sandbox);
vm.runInContext(`${renderReceiptCode}\n${fundMapCode}\n${incomeCatMapCode}`, group3Sandbox);

// Render thermal receipt for combined item
const sampleCombinedReceipt = {
  receiptNo: 'BILL-101',
  date: '12/10/2026',
  time: '04:15 PM',
  devoteeName: 'Anil Kumar',
  star: 'Rohini',
  category: 'വഴിപാട്',
  item: 'നൂൽജപം/അർച്ചന',
  quantity: 1,
  unitPrice: 20,
  totalAmount: 20,
  paymentMode: 'Cash'
};

const renderedCombinedReceiptHtml = group3Sandbox.renderThermalReceiptHTML(
  sampleCombinedReceipt,
  'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  'ആശാരിവിളാകം കേരളദിത്യപുരം'
);

assert(renderedCombinedReceiptHtml.includes('<span>ഇനം:</span> <b>നൂൽജപം/അർച്ചന</b>'), 'Receipt renders item as "നൂൽജപം/അർച്ചന"');
assert(renderedCombinedReceiptHtml.includes('Qty: <b>1</b> &times; ₹20.00'), 'Receipt renders unit price ₹20.00');
assert(renderedCombinedReceiptHtml.includes('Amt: <b>₹20.00</b>'), 'Receipt renders amount ₹20.00');
assert(renderedCombinedReceiptHtml.includes('ആകെ (Total):</span>\n        <span>₹20.00</span>') || renderedCombinedReceiptHtml.includes('₹20.00'), 'Receipt renders grand total ₹20.00');

// Render thermal receipt for corrected spelling item
const samplePadukkaReceipt = {
  receiptNo: 'BILL-102',
  date: '12/10/2026',
  time: '04:16 PM',
  devoteeName: 'Suresh',
  star: 'Aswathy',
  category: 'വഴിപാട്',
  item: 'മറുതക് ചെറിയ പടുക്ക',
  quantity: 2,
  unitPrice: 100,
  totalAmount: 200,
  paymentMode: 'Cash'
};

const renderedPadukkaReceiptHtml = group3Sandbox.renderThermalReceiptHTML(
  samplePadukkaReceipt,
  'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  'ആശാരിവിളാകം കേരളദിത്യപുരം'
);

assert(renderedPadukkaReceiptHtml.includes('<span>ഇനം:</span> <b>മറുതക് ചെറിയ പടുക്ക</b>'), 'Receipt renders item as "മറുതക് ചെറിയ പടുക്ക"');
assert(renderedPadukkaReceiptHtml.includes('Qty: <b>2</b> &times; ₹100.00'), 'Receipt renders unit price ₹100.00');
assert(renderedPadukkaReceiptHtml.includes('Amt: <b>₹200.00</b>'), 'Receipt renders amount ₹200.00');

// Verify Category & Fund Mappings
const vazhipaduFund = group3Sandbox.billingCategoryToFund('വഴിപാട്');
assert(vazhipaduFund === 'General Temple Fund', `Vazhipadu maps to "General Temple Fund" (got "${vazhipaduFund}")`);

const punarudharanamFund = group3Sandbox.billingCategoryToFund('പുനരുദ്ധാരണം');
assert(punarudharanamFund === 'Punarudharanam Fund', `Punarudharanam maps to "Punarudharanam Fund" (got "${punarudharanamFund}")`);

// ----------------------------------------------------
// TEST GROUP 4: Historical Records Protection & Immobility
// ----------------------------------------------------
console.log('\nTEST GROUP 4: Historical Record Protection');

// Verify that pre-existing historical bills retain their exact original particulars
const historicalBillArchana = {
  receiptNo: 'BILL-0005',
  date: '01/10/2026',
  time: '09:05 PM',
  devoteeName: 'manoj',
  star: 'bharani',
  category: 'വഴിപാട്',
  item: 'അർച്ചന',
  quantity: 1,
  unitPrice: 20,
  totalAmount: 20,
  paymentMode: 'UPI'
};

const historicalReceiptArchanaHtml = group3Sandbox.renderThermalReceiptHTML(
  historicalBillArchana,
  'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  'ആശാരിവിളാകം കേരളദിത്യപുരം'
);
assert(historicalReceiptArchanaHtml.includes('<span>ഇനം:</span> <b>അർച്ചന</b>'), 'Historical bill for "അർച്ചന" is rendered with exact original particulars');

const historicalBillPadukka = {
  receiptNo: 'BILL-0008',
  date: '05/10/2026',
  time: '10:00 AM',
  devoteeName: 'rajesh',
  category: 'വഴിപാട്',
  item: 'മുറുക്ക് ചെറിയ പടുക',
  quantity: 1,
  unitPrice: 100,
  totalAmount: 100,
  paymentMode: 'Cash'
};

const historicalReceiptPadukkaHtml = group3Sandbox.renderThermalReceiptHTML(
  historicalBillPadukka,
  'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  'ആശാരിവിളാകം കേരളദിത്യപുരം'
);
assert(historicalReceiptPadukkaHtml.includes('<span>ഇനം:</span> <b>മുറുക്ക് ചെറിയ പടുക</b>'), 'Historical bill with previous spelling "മുറുക്ക് ചെറിയ പടുക" renders intact without rewriting');

// ----------------------------------------------------
// TEST SUMMARY
// ----------------------------------------------------
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✨ ALL STEP 33.34A VERIFICATION TESTS PASSED SUCCESSFULLY! ✨\n');
}
