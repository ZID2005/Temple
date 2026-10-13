const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('STEP 33.19 TEST SUITE: CHITTY MODULE FUNCTIONAL & ACCOUNTING AUDIT');
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
// SUITE 1: Static Architecture and Code Integrity Verification
// ================================================================
console.log('--- TEST SUITE 1: Static Architecture & Safety Verification ---');

// Accounting and Active Data Accessors
assert(html.includes('async function activeChittyCollections() { return notVoided(await allChittyCollections()); }'),
  'activeChittyCollections() is defined using notVoided()');

assert(html.includes('async function activeChittyPayouts() { return notVoided(await allChittyPayouts()); }'),
  'activeChittyPayouts() is defined using notVoided()');

assert(html.includes('async function activeChittyMembers() { return notVoided(await allChittyMembers()); }'),
  'activeChittyMembers() is defined using notVoided()');

assert(html.includes('getCashBalance(uptoDate)') && html.includes('activeChittyCollections(), activeChittyPayouts()'),
  'getCashBalance queries activeChittyCollections() and activeChittyPayouts()');

assert(html.includes('getBankBalance(uptoDate)') && html.includes('activeChittyCollections(), activeChittyPayouts()'),
  'getBankBalance queries activeChittyCollections() and activeChittyPayouts()');

assert(html.includes('getFundBalance(fundName, uptoDate)') && html.includes('activeChittyCollections(), activeChittyPayouts()'),
  'getFundBalance queries activeChittyCollections() and activeChittyPayouts()');

assert(html.includes('const colFetcher = (typeof activeChittyCollections === \'function\') ? activeChittyCollections() : allChittyCollections();'),
  'buildCashBookRows queries activeChittyCollections() with allChittyCollections fallback');

assert(html.includes('const payFetcher = (typeof activeChittyPayouts === \'function\') ? activeChittyPayouts() : allChittyPayouts();'),
  'buildCashBookRows queries activeChittyPayouts() with allChittyPayouts fallback');

// Delegation in deleteRecord
assert(html.includes('if (store === \'chittyCollections\') {\n    return await deleteChittyCollection(id);\n  }'),
  'deleteRecord safely delegates chittyCollections to deleteChittyCollection');

assert(html.includes('if (store === \'chittyPayouts\') {\n    return await deleteChittyPayout(id);\n  }'),
  'deleteRecord safely delegates chittyPayouts to deleteChittyPayout');

assert(html.includes('if (store === \'chittyMembers\') {\n    return await deleteChittyMember(id);\n  }'),
  'deleteRecord safely delegates chittyMembers to deleteChittyMember');

// Member Registration Safety
assert(html.includes('if (window.isChittyMemberSaving) return;'),
  'saveChittyMember implements double-submission guard (isChittyMemberSaving)');

assert(html.includes('const name = (fd.get(\'name\') || \'\').trim();\n  if (!name) { alert(\'Member name is required.\'); return; }'),
  'saveChittyMember enforces non-empty member name validation');

assert(html.includes('if (isNaN(instAmt) || instAmt < 0) {\n    alert(\'Installment amount must be 0 or a positive number.\');\n    return;\n  }'),
  'saveChittyMember validates installment amount is non-negative');

assert(html.includes('Member number "') && html.includes('" is already assigned to ') && html.includes('Please enter a unique member number.'),
  'saveChittyMember checks member number uniqueness across active members');

assert(html.includes('rec.firestoreId = targetDocId;') && html.includes('String(editId).startsWith(\'cm_\') ? String(editId) : (\'cm_\' + editId)'),
  'saveChittyMember prevents "cm_cm_" duplicate document ID bug on edit');

// Collection Workflow Safety
assert(html.includes('if (window.isChittyCollectionSaving) return;'),
  'saveChittyCollection implements double-submission guard (isChittyCollectionSaving)');

assert(html.includes('const rawMemberId = fd.get(\'memberId\');\n  if (!rawMemberId) { alert(\'Please select a member.\'); return; }'),
  'saveChittyCollection validates required member selection');

assert(html.includes('if (isNaN(amt) || amt <= 0) { alert(\'Enter a valid amount received.\'); return; }'),
  'saveChittyCollection validates positive amount received');

assert(html.includes('Warning: A collection for ') && html.includes('for Installment #') && html.includes('already exists on '),
  'saveChittyCollection warns about duplicate installment for same member');

assert(html.includes('memberId: member.id'),
  'saveChittyCollection preserves authoritative member.id without corrupting string IDs to NaN');

assert(html.includes('String(editId).startsWith(\'cc_\') ? String(editId) : (\'cc_\' + editId)'),
  'saveChittyCollection prevents "cc_cc_" duplicate document ID bug on edit');

// Payout Workflow Safety
assert(html.includes('if (window.isChittyPayoutSaving) return;'),
  'saveChittyPayout implements double-submission guard (isChittyPayoutSaving)');

assert(html.includes('if (isNaN(amt) || amt <= 0) { alert(\'Enter a valid payout amount.\'); return; }'),
  'saveChittyPayout validates positive net payout amount');

assert(html.includes('String(editId).startsWith(\'cp_\') ? String(editId) : (\'cp_\' + editId)'),
  'saveChittyPayout prevents "cp_cp_" duplicate document ID bug on edit');

// Audit-Safe Voiding & Record Protection
assert(html.includes('async function deleteChittyCollection(id) {') && html.includes('await fsVoidRecordSafe(\'chittyCollections\', targetDocId, \'Deleted by user\');'),
  'deleteChittyCollection performs audit-safe voiding with fsVoidRecordSafe');

assert(html.includes('async function deleteChittyPayout(id) {') && html.includes('await fsVoidRecordSafe(\'chittyPayouts\', targetDocId, \'Deleted by user\');'),
  'deleteChittyPayout performs audit-safe voiding with fsVoidRecordSafe');

assert(html.includes('Cannot delete member "') && html.includes('This member has recorded collections or payouts.'),
  'deleteChittyMember protects members with existing transactions from deletion');

// Search, Filters & Export
assert(html.includes('function filterChittyMembers()') && html.includes('function filterChittyCollections()') && html.includes('function filterChittyPayouts()'),
  'Filter functions for members, collections, and payouts are implemented');

assert(html.includes('type === \'chittyMembers\'') && html.includes('type === \'chittyCollections\'') && html.includes('type === \'chittyPayouts\''),
  'exportCSV supports chittyMembers, chittyCollections, and chittyPayouts with status columns');

assert(html.includes('function printChittyReport()'),
  'printChittyReport function is implemented for statement printing');

// Window exposures
assert(html.includes('window.activeChittyCollections = activeChittyCollections;') && html.includes('window.saveChittyMember = saveChittyMember;'),
  'Authoritative functions are exported on window');

// ================================================================
// SUITE 2: Live Browser Execution in Isolated Emulator
// ================================================================
async function runBrowserTests() {
  console.log('\n--- TEST SUITE 2: Live Browser Execution in Isolated Emulator ---');

  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) {
    throw new Error('No open tab found for Temple_Accounts-1.html on port 9222');
  }

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = msgId++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: msgId++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      return;
    }
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  if (ws.readyState !== 1) {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
  }
  await send('Page.enable');

  console.log('Reloading browser tab to isolated emulator mode (?emulator=true)...');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2500));

  await send('Runtime.enable');

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  // Verify isolated emulator environment
  const envCheck = await evaluate(`({
    isEmulator: window.location.search.includes('emulator=true'),
    dbName: typeof DB_NAME !== 'undefined' ? DB_NAME : null,
    user: (firebase.auth().currentUser ? firebase.auth().currentUser.email : null)
  })`);

  assert(envCheck.isEmulator && envCheck.dbName === 'temple_accounts_test_db',
    `Isolated test database active: ${envCheck.dbName}`);

  // Authenticate user in emulator if not already logged in and wait for boot()
  const authUser = await evaluate(`(async () => {
    try {
      if (!firebase.auth().currentUser) {
        await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
      }
      for (let i = 0; i < 60; i++) {
        const isBooted = window._appBooted;
        const curView = typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null;
        const mainLen = document.getElementById('app-main')?.innerHTML?.length || 0;
        if (isBooted && curView === 'dashboard' && mainLen > 500) break;
        await new Promise(r => setTimeout(r, 100));
      }
      await new Promise(r => setTimeout(r, 400));
      const u = firebase.auth().currentUser;
      return { success: true, email: u ? u.email : null, uid: u ? u.uid : null };
    } catch(e) {
      return { success: false, error: e.message };
    }
  })()`);
  assert(authUser.success === true, `Authenticated user in Auth emulator: ${authUser.email}`);

  // Navigate to Chitty view
  await evaluate(`(async () => {
    await navigate('chitty');
    for (let i = 0; i < 30; i++) {
      if (document.getElementById('chittyMemberForm')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 500));
  })()`);

  const viewRendered = await evaluate(`({
    hasMemberForm: !!document.getElementById('chittyMemberForm'),
    hasColForm: !!document.getElementById('chittyCollectionForm'),
    hasPayForm: !!document.getElementById('chittyPayoutForm'),
    hasMemberSearch: !!document.getElementById('chittyMemberSearch'),
    hasColFilter: !!document.getElementById('chittyCollectionMemberFilter'),
    hasPayFilter: !!document.getElementById('chittyPayoutMemberFilter')
  })`);
  assert(viewRendered.hasMemberForm && viewRendered.hasColForm && viewRendered.hasPayForm,
    'Chitty view rendered with Member, Collection, and Payout forms');
  assert(viewRendered.hasMemberSearch && viewRendered.hasColFilter && viewRendered.hasPayFilter,
    'Chitty view includes real-time member search and collection/payout filters');

  // Baseline balances
  const baseCash = await evaluate(`getCashBalance()`);
  const baseBank = await evaluate(`getBankBalance()`);
  const baseFund = await evaluate(`getFundBalance('Chitty Fund')`);
  const baseTotalCollected = await evaluate(`(async () => sumField(await activeChittyCollections(), 'amountReceived'))()`);
  const baseTotalPayouts = await evaluate(`(async () => sumField(await activeChittyPayouts(), 'amount'))()`);
  console.log(`Baseline Balances: Cash=${baseCash}, Bank=${baseBank}, ChittyFund=${baseFund}, Col=${baseTotalCollected}, Pay=${baseTotalPayouts}`);

  const testSuffix = Date.now().toString().slice(-6);
  const m1Num = `M-TEST-${testSuffix}-1`;
  const m2Num = `M-TEST-${testSuffix}-2`;

  // 2. Member Form Validation Tests
  const emptyNameAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="memberNo"]').value = '';
    form.querySelector('input[name="name"]').value = '   ';
    await saveChittyMember();
    window.alert = orig;
    return captured;
  })()`);
  assert(emptyNameAlert === 'Member name is required.', 'Blank member name rejected with clear validation alert');

  const negAmtAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="name"]').value = 'Negative Test Member';
    form.querySelector('input[name="installmentAmount"]').value = '-100';
    await saveChittyMember();
    window.alert = orig;
    return captured;
  })()`);
  assert(negAmtAlert === 'Installment amount must be 0 or a positive number.', 'Negative installment amount rejected');

  // 3. Create Valid Member 1 (M1)
  await evaluate(`(async () => {
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="memberNo"]').value = '${m1Num}';
    form.querySelector('input[name="name"]').value = 'Chitty Member Alpha ${testSuffix}';
    form.querySelector('input[name="phone"]').value = '9876543210';
    form.querySelector('input[name="installmentAmount"]').value = '500';
    form.querySelector('select[name="frequency"]').value = 'Monthly';
    await saveChittyMember();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const allMembersAfterM1 = await evaluate(`activeChittyMembers()`);
  const m1Rec = allMembersAfterM1.find(m => m.memberNo === m1Num);
  assert(m1Rec && m1Rec.name.includes('Alpha'), `Member 1 successfully registered: ID=${m1Rec ? m1Rec.id : 'N/A'}`);

  // 4. Duplicate Member Number Protection
  const dupMemberAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="memberNo"]').value = '${m1Num}';
    form.querySelector('input[name="name"]').value = 'Duplicate Test Member';
    form.querySelector('input[name="installmentAmount"]').value = '500';
    await saveChittyMember();
    window.alert = orig;
    return captured;
  })()`);
  assert(dupMemberAlert && dupMemberAlert.includes('already assigned'),
    'Duplicate Member Number rejected with descriptive uniqueness warning');

  // 5. Create Valid Member 2 (M2)
  await evaluate(`(async () => {
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="memberNo"]').value = '${m2Num}';
    form.querySelector('input[name="name"]').value = 'Chitty Member Beta ${testSuffix}';
    form.querySelector('input[name="phone"]').value = '9123456780';
    form.querySelector('input[name="installmentAmount"]').value = '1000';
    form.querySelector('select[name="frequency"]').value = 'Monthly';
    await saveChittyMember();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const allMembersAfterM2 = await evaluate(`activeChittyMembers()`);
  const m2Rec = allMembersAfterM2.find(m => m.memberNo === m2Num);
  assert(m2Rec && m2Rec.name.includes('Beta'), `Member 2 successfully registered: ID=${m2Rec ? m2Rec.id : 'N/A'}`);

  // 6. Member Edit & Highlight Transfer
  await evaluate(`navigate('chitty', 'member', '${m1Rec.id}')`);
  await new Promise(r => setTimeout(r, 400));

  const m1EditState = await evaluate(`({
    activeScope: window.GlobalEditState.getEditing('chitty_member'),
    rowClass: document.querySelector('tr[data-record-id="${m1Rec.id}"]')?.className,
    formEditId: document.querySelector('#chittyMemberForm input[name="editId"]')?.value
  })`);
  assert(String(m1EditState.activeScope) === String(m1Rec.id), 'GlobalEditState sets active edit scope for member');
  assert(m1EditState.rowClass && m1EditState.rowClass.includes('row-editing-active'),
    'Editing member row receives pale-gold row-editing-active highlight class');

  // Save Member 1 update
  await evaluate(`(async () => {
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="name"]').value = 'Chitty Member Alpha Renamed';
    await saveChittyMember();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const m1Updated = await evaluate(`fsGetOneSafe('chittyMembers', '${m1Rec.id}')`);
  assert(m1Updated && m1Updated.name === 'Chitty Member Alpha Renamed', 'Member update persisted successfully');
  assert(!m1Updated.firestoreId.includes('cm_cm_'), 'Stable document ID preserved without "cm_cm_" duplicate prefix bug');

  // 7. Member Edit Cancellation
  await evaluate(`navigate('chitty', 'member', '${m2Rec.id}')`);
  await new Promise(r => setTimeout(r, 400));
  assert(String(await evaluate(`window.GlobalEditState.getEditing('chitty_member')`)) === String(m2Rec.id),
    'Edit highlight moved to Member 2');

  await evaluate(`navigate('chitty')`);
  await new Promise(r => setTimeout(r, 400));
  assert(await evaluate(`window.GlobalEditState.getEditing('chitty_member')`) === null,
    'Cancelling member edit clears GlobalEditState highlight');

  // 8. Collection Form Validation
  const colMissingMemberAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '';
    form.querySelector('input[name="amountReceived"]').value = '500';
    await saveChittyCollection();
    window.alert = orig;
    return captured;
  })()`);
  assert(colMissingMemberAlert === 'Please select a member.', 'Collection requires valid member selection');

  const colZeroAmtAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '${m1Rec.id}';
    form.querySelector('input[name="amountReceived"]').value = '0';
    await saveChittyCollection();
    window.alert = orig;
    return captured;
  })()`);
  assert(colZeroAmtAlert === 'Enter a valid amount received.', 'Collection rejects 0 or invalid amount');

  // 9. Dynamic Member Selection & Installment Suggestion
  const dynamicSuggest = await evaluate(`(() => {
    const sel = document.getElementById('colMemberSelect');
    sel.value = '${m1Rec.id}';
    onChittyMemberSelect('${m1Rec.id}');
    return {
      autoAmt: document.getElementById('colAmountReceived').value,
      suggestedInst: document.getElementById('colInstallmentNo').value,
      hintText: document.getElementById('colInstHint').textContent
    };
  })()`);
  assert(dynamicSuggest.autoAmt === '500', `Member installment amount automatically suggested: ${dynamicSuggest.autoAmt}`);
  assert(dynamicSuggest.suggestedInst === '1', `Initial installment suggested as #1: ${dynamicSuggest.suggestedInst}`);

  // 10. Record Collections
  // Collection C1: Member M1, Inst 1, Amount 500, Cash
  await evaluate(`(async () => {
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '${m1Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '1';
    form.querySelector('input[name="amountReceived"]').value = '500';
    form.querySelector('select[name="paymentMode"]').value = 'Cash';
    await saveChittyCollection();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Dynamic Suggestion for next installment
  const nextSuggest = await evaluate(`(() => {
    onChittyMemberSelect('${m1Rec.id}');
    return {
      suggestedInst: document.getElementById('colInstallmentNo').value,
      hint: document.getElementById('colInstHint').textContent
    };
  })()`);
  assert(nextSuggest.suggestedInst === '2', `Next installment correctly suggested as #2: ${nextSuggest.suggestedInst}`);

  // Collection C2: Member M1, Inst 2, Amount 500, Bank
  await evaluate(`(async () => {
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '${m1Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '2';
    form.querySelector('input[name="amountReceived"]').value = '500';
    form.querySelector('select[name="paymentMode"]').value = 'Bank';
    await saveChittyCollection();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Collection C3: Member M2, Inst 1, Amount 1000, Cash
  await evaluate(`(async () => {
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '${m2Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '1';
    form.querySelector('input[name="amountReceived"]').value = '1000';
    form.querySelector('select[name="paymentMode"]').value = 'Cash';
    await saveChittyCollection();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const allCols = await evaluate(`activeChittyCollections()`);
  const c1 = allCols.find(c => String(c.memberId) === String(m1Rec.id) && String(c.installmentNo) === '1');
  const c2 = allCols.find(c => String(c.memberId) === String(m1Rec.id) && String(c.installmentNo) === '2');
  const c3 = allCols.find(c => String(c.memberId) === String(m2Rec.id) && String(c.installmentNo) === '1');
  assert(c1 && c2 && c3, 'All 3 test collections created and linked to active members');
  assert(c1.receiptNo && c1.receiptNo.startsWith('R-'), `Sequential unified receipt number assigned: ${c1.receiptNo}`);

  // 11. Duplicate Installment Warning
  const dupInstWarnResult = await evaluate(`(async () => {
    let promptCaptured = null;
    const origConfirm = window.confirm;
    window.confirm = (msg) => { promptCaptured = msg; return false; }; // Decline duplicate
    const form = document.getElementById('chittyCollectionForm');
    form.querySelector('select[name="memberId"]').value = '${m1Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '1';
    form.querySelector('input[name="amountReceived"]').value = '500';
    await saveChittyCollection();
    window.confirm = origConfirm;
    return promptCaptured;
  })()`);
  assert(dupInstWarnResult && dupInstWarnResult.includes('Installment #1 already exists'),
    'Duplicate installment warning prompted with existing collection details');

  // 12. Payout Workflow & Validation
  const payMissingMemberAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    const form = document.getElementById('chittyPayoutForm');
    form.querySelector('select[name="memberId"]').value = '';
    form.querySelector('input[name="amount"]').value = '400';
    await saveChittyPayout();
    window.alert = orig;
    return captured;
  })()`);
  assert(payMissingMemberAlert === 'Please select a member.', 'Payout requires valid member selection');

  // Record Payout P1: Member M1, Amount 400, Cash
  await evaluate(`(async () => {
    const form = document.getElementById('chittyPayoutForm');
    form.querySelector('select[name="memberId"]').value = '${m1Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '1';
    form.querySelector('input[name="amount"]').value = '400';
    form.querySelector('select[name="paymentMode"]').value = 'Cash';
    form.querySelector('input[name="remarks"]').value = 'Auction Settlement #1';
    await saveChittyPayout();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Record Payout P2: Member M2, Amount 700, Bank
  await evaluate(`(async () => {
    const form = document.getElementById('chittyPayoutForm');
    form.querySelector('select[name="memberId"]').value = '${m2Rec.id}';
    form.querySelector('input[name="installmentNo"]').value = '1';
    form.querySelector('input[name="amount"]').value = '700';
    form.querySelector('select[name="paymentMode"]').value = 'Bank';
    form.querySelector('input[name="remarks"]').value = 'Auction Settlement #2';
    await saveChittyPayout();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const allPays = await evaluate(`activeChittyPayouts()`);
  const p1 = allPays.find(p => String(p.memberId) === String(m1Rec.id));
  const p2 = allPays.find(p => String(p.memberId) === String(m2Rec.id));
  assert(p1 && p2, 'Both test payouts created and linked to members');

  // 13. Financial Balances & Summary Card Reconciliation
  const curCash = await evaluate(`getCashBalance()`);
  const curBank = await evaluate(`getBankBalance()`);
  const curFund = await evaluate(`getFundBalance('Chitty Fund')`);

  // Expected calculations:
  // Collections: C1(Cash +500), C2(Bank +500), C3(Cash +1000)
  // Payouts: P1(Cash -400), P2(Bank -700)
  // Net Cash = +500 +1000 -400 = +1100
  // Net Bank = +500 -700 = -200
  // Net Chitty Fund = +2000 -1100 = +900
  assert(curCash === baseCash + 1100, `Cash balance reflects active Chitty transactions: expected ${baseCash + 1100}, got ${curCash}`);
  assert(curBank === baseBank - 200, `Bank balance reflects active Chitty transactions: expected ${baseBank - 200}, got ${curBank}`);
  assert(curFund === baseFund + 900, `Chitty Fund balance reconciles with active transactions: expected ${baseFund + 900}, got ${curFund}`);

  const cardAmounts = await evaluate(`Array.from(document.querySelectorAll('.card-grid .stat-value')).map(el => parseFloat(el.textContent.replace(/,/g, '').replace(/[^\\d.]/g, '')) || 0)`);
  assert(cardAmounts[0] === baseTotalCollected + 2000, `Summary Card "TOTAL COLLECTED" reflects expected amount: expected ${baseTotalCollected + 2000}, got ${cardAmounts[0]}`);
  assert(cardAmounts[1] === baseTotalPayouts + 1100, `Summary Card "TOTAL PAYOUTS" reflects expected amount: expected ${baseTotalPayouts + 1100}, got ${cardAmounts[1]}`);

  // Cash Book and Bank Book Mathematical Reconciliation
  const cashBookRows = await evaluate(`buildCashBookRows()`);
  const bankBookRows = await evaluate(`buildBankBookRows()`);
  const cashBookFinalBal = cashBookRows.length ? cashBookRows[cashBookRows.length - 1].balance : 0;
  const bankBookFinalBal = bankBookRows.length ? bankBookRows[bankBookRows.length - 1].balance : 0;
  assert(cashBookFinalBal === curCash, `Cash Book closing balance (${cashBookFinalBal}) matches getCashBalance() (${curCash})`);
  assert(bankBookFinalBal === curBank, `Bank Book closing balance (${bankBookFinalBal}) matches getBankBalance() (${curBank})`);

  // 14. Audit-Safe Member Protection (Cannot delete member with active transactions)
  const delMemberBlockAlert = await evaluate(`(async () => {
    let captured = null;
    const orig = window.alert;
    window.alert = (msg) => { captured = msg; };
    await deleteChittyMember('${m1Rec.id}');
    window.alert = orig;
    return captured;
  })()`);
  assert(delMemberBlockAlert && delMemberBlockAlert.includes('This member has recorded collections or payouts'),
    'Member with financial transactions is strictly protected against deletion');

  // 15. Audit-Safe Voiding of Collection C1
  const voidC1Result = await evaluate(`(async () => {
    let confirmPrompt = null;
    let alertMsg = null;
    const origConfirm = window.confirm;
    const origAlert = window.alert;
    window.confirm = (msg) => { confirmPrompt = msg; return true; };
    window.alert = (msg) => { alertMsg = msg; };
    try {
      await deleteChittyCollection('${c1.id}');
    } finally {
      window.confirm = origConfirm;
      window.alert = origAlert;
    }
    const updated = await fsGetOneSafe('chittyCollections', '${c1.id}');
    return {
      confirmPrompt,
      alertMsg,
      isVoided: !!updated.voided,
      voidReason: updated.voidReason
    };
  })()`);
  assert(voidC1Result.confirmPrompt && voidC1Result.confirmPrompt.includes('Void Chitty Collection?') && voidC1Result.confirmPrompt.includes('500.00'),
    'Voiding collection prompted with complete financial details');
  assert(voidC1Result.isVoided === true && voidC1Result.voidReason === 'Deleted by user',
    'Collection preserved with voided:true and voidReason="Deleted by user"');

  // Verify Accounting Effect after C1 voided:
  // Total Collected should drop from 2000 to 1500
  // Net Cash should drop by 500 (from +1100 to +600)
  // Chitty Fund should drop by 500 (from +900 to +400)
  const postVoidC1Cash = await evaluate(`getCashBalance()`);
  const postVoidC1Fund = await evaluate(`getFundBalance('Chitty Fund')`);
  assert(postVoidC1Cash === baseCash + 600, `Cash balance reversed voided collection: expected ${baseCash + 600}, got ${postVoidC1Cash}`);
  assert(postVoidC1Fund === baseFund + 400, `Chitty Fund reversed voided collection: expected ${baseFund + 400}, got ${postVoidC1Fund}`);

  const postVoidC1CardAmt = await evaluate(`parseFloat(document.querySelectorAll('.card-grid .stat-value')[0].textContent.replace(/,/g, '').replace(/[^\\d.]/g, '')) || 0`);
  assert(postVoidC1CardAmt === baseTotalCollected + 1500, `Summary Card "TOTAL COLLECTED" updated to expected amount: expected ${baseTotalCollected + 1500}, got ${postVoidC1CardAmt}`);

  // 16. Audit-Safe Voiding of Payout P1
  const voidP1Result = await evaluate(`(async () => {
    let confirmPrompt = null;
    let alertMsg = null;
    const origConfirm = window.confirm;
    const origAlert = window.alert;
    window.confirm = (msg) => { confirmPrompt = msg; return true; };
    window.alert = (msg) => { alertMsg = msg; };
    try {
      await deleteChittyPayout('${p1.id}');
    } finally {
      window.confirm = origConfirm;
      window.alert = origAlert;
    }
    const updated = await fsGetOneSafe('chittyPayouts', '${p1.id}');
    return {
      confirmPrompt,
      alertMsg,
      isVoided: !!updated.voided,
      voidReason: updated.voidReason
    };
  })()`);
  assert(voidP1Result.isVoided === true && voidP1Result.voidReason === 'Deleted by user',
    'Payout preserved with voided:true in database');

  // Verify Accounting Effect after P1 voided:
  // Total Payout drops from 1100 to 700
  // Cash balance increases by 400 (from +600 to +1000)
  // Chitty Fund increases by 400 (from +400 to +800)
  const postVoidP1Cash = await evaluate(`getCashBalance()`);
  const postVoidP1Fund = await evaluate(`getFundBalance('Chitty Fund')`);
  assert(postVoidP1Cash === baseCash + 1000, `Cash balance reversed voided payout: expected ${baseCash + 1000}, got ${postVoidP1Cash}`);
  assert(postVoidP1Fund === baseFund + 800, `Chitty Fund reversed voided payout: expected ${baseFund + 800}, got ${postVoidP1Fund}`);

  const postVoidP1CardAmt = await evaluate(`parseFloat(document.querySelectorAll('.card-grid .stat-value')[1].textContent.replace(/,/g, '').replace(/[^\\d.]/g, '')) || 0`);
  assert(postVoidP1CardAmt === baseTotalPayouts + 700, `Summary Card "TOTAL PAYOUTS" updated to expected amount: expected ${baseTotalPayouts + 700}, got ${postVoidP1CardAmt}`);

  // 17. Verify Voided Records Visual Styling in DOM
  const voidedStylesInDOM = await evaluate(`({
    c1RowClass: document.querySelector('tr[data-record-id="${c1.id}"]')?.className,
    c1Status: document.querySelector('tr[data-record-id="${c1.id}"] td:nth-child(4)')?.textContent.trim(),
    p1RowClass: document.querySelector('tr[data-record-id="${p1.id}"]')?.className,
    p1Status: document.querySelector('tr[data-record-id="${p1.id}"] td:nth-child(5)')?.textContent.trim()
  })`);
  assert(voidedStylesInDOM.c1RowClass && voidedStylesInDOM.c1RowClass.includes('voided'),
    'Voided collection row displays .voided CSS styling');
  assert(voidedStylesInDOM.c1Status === 'Voided', 'Voided collection displays "Voided" status pill');
  assert(voidedStylesInDOM.p1RowClass && voidedStylesInDOM.p1RowClass.includes('voided'),
    'Voided payout row displays .voided CSS styling');
  assert(voidedStylesInDOM.p1Status === 'Voided', 'Voided payout displays "Voided" status pill');

  // 18. Real-time Search and Filter Verification
  const searchFilterTest = await evaluate(`(() => {
    const searchInput = document.getElementById('chittyMemberSearch');
    searchInput.value = 'Beta';
    filterChittyMembers();
    const rows = Array.from(document.querySelectorAll('#chittyMembersTable tbody tr'));
    const visible = rows.filter(r => r.style.display !== 'none' && !r.querySelector('td[colspan]'));
    const allMatch = visible.length > 0 && visible.every(r => r.textContent.toLowerCase().includes('beta'));

    searchInput.value = '';
    filterChittyMembers();

    return {
      matchCount: visible.length,
      allMatch
    };
  })()`);
  assert(searchFilterTest.matchCount >= 1 && searchFilterTest.allMatch,
    'Member search filters correctly by name in real-time');

  // 19. Clean Member Deletion Test (M3 without transactions)
  await evaluate(`(async () => {
    const form = document.getElementById('chittyMemberForm');
    form.querySelector('input[name="memberNo"]').value = 'TEMP-DEL-${testSuffix}';
    form.querySelector('input[name="name"]').value = 'Temporary Member To Delete';
    await saveChittyMember();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const allM = await evaluate(`activeChittyMembers()`);
  const mTemp = allM.find(m => m.name.includes('Temporary Member To Delete'));
  assert(mTemp, 'Temporary clean member created');

  const delTempResult = await evaluate(`(async () => {
    let confirmPrompt = null;
    let alertMsg = null;
    const origConfirm = window.confirm;
    const origAlert = window.alert;
    window.confirm = (msg) => { confirmPrompt = msg; return true; };
    window.alert = (msg) => { alertMsg = msg; };
    let check = null;
    try {
      await deleteChittyMember('${mTemp.id}');
      check = await fsGetOneSafe('chittyMembers', '${mTemp.id}');
    } finally {
      window.confirm = origConfirm;
      window.alert = origAlert;
    }
    return { confirmPrompt, alertMsg, deleted: !check };
  })()`);
  assert(delTempResult.confirmPrompt && delTempResult.deleted,
    'Member without transactions can be safely deleted with confirmation');

  // 20. Persistence across View Navigation
  await evaluate(`navigate('dashboard')`);
  await new Promise(r => setTimeout(r, 400));
  await evaluate(`navigate('chitty')`);
  await new Promise(r => setTimeout(r, 400));

  const reloadedFund = await evaluate(`getFundBalance('Chitty Fund')`);
  assert(reloadedFund === baseFund + 800, `Chitty Fund balance strictly preserved after view navigation: ${reloadedFund}`);

  ws.close();
}

async function main() {
  try {
    await runBrowserTests();
  } catch (err) {
    console.error('Browser Test Runner Error:', err);
    failedTests++;
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
