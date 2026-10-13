const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('STEP 33.18 VALIDATION SUITE: FUND TRANSFER DELETE FUNCTIONALITY');
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

assert(html.includes('async function activeTransfers() { return notVoided(await allTransfers()); }'),
  'activeTransfers() is defined using notVoided()');

assert(html.includes('async function getCashBalance(uptoDate)') &&
  html.includes('activeTransfers()') &&
  html.includes('activeChittyCollections(), activeChittyPayouts()'),
  'getCashBalance queries activeTransfers(), activeChittyCollections(), and activeChittyPayouts()');

assert(html.includes('async function getBankBalance(uptoDate)') &&
  html.includes('activeTransfers()') &&
  html.includes('activeChittyCollections(), activeChittyPayouts()'),
  'getBankBalance queries activeTransfers(), activeChittyCollections(), and activeChittyPayouts()');

assert(html.includes('async function buildCashBookRows()') &&
  html.includes("const txFetcher = (typeof activeTransfers === 'function') ? activeTransfers() : allTransfers();") &&
  html.includes("const colFetcher = (typeof activeChittyCollections === 'function') ? activeChittyCollections() : allChittyCollections();") &&
  html.includes("const payFetcher = (typeof activeChittyPayouts === 'function') ? activeChittyPayouts() : allChittyPayouts();") &&
  html.includes('activeReceipts(), activePayments(), txFetcher, allLoans(), colFetcher, payFetcher'),
  'buildCashBookRows queries activeTransfers() with allTransfers fallback AND Chitty fetchers with fallbacks');

assert(html.includes('async function buildBankBookRows()') &&
  html.includes("const isBankMode = (m) => m === 'Bank' || m === 'UPI';") &&
  html.includes("const txFetcher = (typeof activeTransfers === 'function') ? activeTransfers() : allTransfers();") &&
  html.includes('activeReceipts(), activePayments(), txFetcher, allLoans(), colFetcher, payFetcher'),
  'buildBankBookRows queries activeTransfers() with allTransfers fallback AND Chitty fetchers with fallbacks');

assert(html.includes('VIEW_RENDERERS.transfers = async function(editId) {\n  const list = (await activeTransfers()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));'),
  'VIEW_RENDERERS.transfers displays activeTransfers() so voided records disappear from the UI');

assert(html.includes('<button class="btn-sm btn-danger" onclick="deleteTransfer(\'${esc(t.id)}\')">Delete</button>'),
  'Transfer table action buttons invoke deleteTransfer() passing stable document ID');

assert(html.includes('async function deleteTransfer(id) {'),
  'Dedicated deleteTransfer() function is implemented');

assert(html.includes('if (window.isTransferDeleting) return;'),
  'deleteTransfer implements double-submission guard (window.isTransferDeleting)');

assert(html.includes('const user = getCurrentFirebaseUser();'),
  'deleteTransfer verifies Firebase user authentication before action');

assert(html.includes('if (t.voided) {') && html.includes('alert(\'This transfer has already been deleted.\');'),
  'deleteTransfer verifies transfer exists and is not already voided');

assert(html.includes('Delete fund transfer?\\n\\nDate: ') && html.includes('Direction: ') && html.includes('Amount: '),
  'deleteTransfer confirmation prompt identifies date, direction, and amount');

assert(html.includes('await fsVoidRecordSafe(\'transfers\', targetDocId, \'Deleted by user\');'),
  'deleteTransfer performs audit-safe voiding with authoritative targetDocId');

assert(html.includes('window.GlobalEditState.clearEditing(\'transfers\');'),
  'deleteTransfer clears active editing state on deletion');

assert(html.includes('alert(\'Fund transfer deleted successfully.\');'),
  'deleteTransfer alerts user on successful deletion');

assert(html.includes('if (store === \'transfers\') {\n    return await deleteTransfer(id);\n  }'),
  'deleteRecord safely delegates transfers to deleteTransfer for backward compatibility');

assert(html.includes('window.deleteTransfer = deleteTransfer;') && html.includes('window.activeTransfers = activeTransfers;'),
  'deleteTransfer and activeTransfers are exposed on window');

// ================================================================
// SUITE 2: Live Browser Verification in Isolated Emulator
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
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

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

  // 1. Navigate to isolated emulator URL
  console.log('Navigating browser to isolated emulator mode (?emulator=true)...');
  await evaluate(`window.location.href = "http://localhost:3000/Temple_Accounts-1.html?emulator=true";`);
  await new Promise(r => setTimeout(r, 2500));

  // Wait for settings to load
  await evaluate(`(async () => {
    for (let i = 0; i < 50; i++) {
      if (window.APP_SETTINGS) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  })()`);

  // Re-connect / verify page loaded
  const isEmulatorMode = await evaluate(`window.location.search.includes('emulator=true') && DB_NAME === 'temple_accounts_test_db'`);
  assert(isEmulatorMode === true, 'Browser loaded with DB_NAME = temple_accounts_test_db in emulator mode');

  // Authenticate user in emulator
  const authUser = await evaluate(`(async () => {
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
      for (let i = 0; i < 60; i++) {
        const isBooted = window._appBooted;
        const curView = typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null;
        const mainLen = document.getElementById('app-main')?.innerHTML?.length || 0;
        if (isBooted && curView === 'dashboard' && mainLen > 500) break;
        await new Promise(r => setTimeout(r, 100));
      }
      await new Promise(r => setTimeout(r, 400));
      return { success: true, email: cred.user.email, uid: cred.user.uid };
    } catch(e) {
      return { success: false, error: e.message };
    }
  })()`);
  assert(authUser.success === true, `Authenticated user in Auth emulator: ${authUser.email}`);

  // Navigate to transfers view and verify form rendered
  await evaluate(`(async () => {
    await navigate('transfers');
    for (let i = 0; i < 30; i++) {
      if (document.getElementById('transferForm')) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  })()`);
  const formReady = await evaluate(`!!document.getElementById('transferForm')`);
  assert(formReady === true, 'Fund Transfers view rendered with transferForm in DOM');

  // Get initial balances
  const initialCash = await evaluate(`getCashBalance()`);
  const initialBank = await evaluate(`getBankBalance()`);
  console.log(`Initial balances: Cash = ${initialCash}, Bank = ${initialBank}`);

  const baseTs = Date.now();
  // Create Test Transfer 1: Cash -> Bank ₹1500
  const t1Id = baseTs + 10;
  const t1Data = {
    id: t1Id,
    firestoreId: 'tx_' + t1Id,
    date: '2026-10-11',
    fromAcc: 'Cash',
    toAcc: 'Bank',
    amount: 1500,
    mode: 'Cash',
    reason: 'Test Deposit CashToBank',
    refNo: 'DEP-3318-' + (baseTs % 10000),
    createdAt: baseTs + 10
  };

  // Create Test Transfer 2: Bank -> Cash ₹800
  const t2Id = baseTs + 20;
  const t2Data = {
    id: t2Id,
    firestoreId: 'tx_' + t2Id,
    date: '2026-10-11',
    fromAcc: 'Bank',
    toAcc: 'Cash',
    amount: 800,
    mode: 'Cheque',
    reason: 'Test Withdrawal BankToCash',
    refNo: 'WTH-3318-' + (baseTs % 10000),
    createdAt: baseTs + 20
  };

  // Create Test Transfer 3: Cash -> Bank ₹500 (Control)
  const t3Id = baseTs + 30;
  const t3Data = {
    id: t3Id,
    firestoreId: 'tx_' + t3Id,
    date: '2026-10-11',
    fromAcc: 'Cash',
    toAcc: 'Bank',
    amount: 500,
    mode: 'Cash',
    reason: 'Test Control Transfer',
    refNo: 'DEP-3318-' + ((baseTs + 1) % 10000),
    createdAt: baseTs + 30
  };

  // Save all 3 transfers to Firestore & IDB
  await evaluate(`(async () => {
    await fsSaveRecordSafe('transfers', ${JSON.stringify(t1Data)}, false);
    await fsSaveRecordSafe('transfers', ${JSON.stringify(t2Data)}, false);
    await fsSaveRecordSafe('transfers', ${JSON.stringify(t3Data)}, false);
    await navigate('transfers');
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Check that all 3 appear in UI table
  const rowsAfterAdd = await evaluate(`Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => String(tr.getAttribute('data-record-id')) )`);
  assert(rowsAfterAdd.includes(String(t1Id)), `Transfer T1 (${t1Id}) rendered in table`);
  assert(rowsAfterAdd.includes(String(t2Id)), `Transfer T2 (${t2Id}) rendered in table`);
  assert(rowsAfterAdd.includes(String(t3Id)), `Transfer T3 (${t3Id}) rendered in table`);

  // Check balances with all 3 transfers
  // Net effect on cash: -1500 (T1) + 800 (T2) - 500 (T3) = -1200
  // Net effect on bank: +1500 (T1) - 800 (T2) + 500 (T3) = +1200
  const midCash = await evaluate(`getCashBalance()`);
  const midBank = await evaluate(`getBankBalance()`);
  assert(midCash === initialCash - 1200, `Cash balance reflects transfers (-1200): expected ${initialCash - 1200}, got ${midCash}`);
  assert(midBank === initialBank + 1200, `Bank balance reflects transfers (+1200): expected ${initialBank + 1200}, got ${midBank}`);

  // Test 3: Cancellation check (confirm returns false)
  const cancelTestResult = await evaluate(`(async () => {
    let capturedPrompt = null;
    const origConfirm = window.confirm;
    window.confirm = (msg) => { capturedPrompt = msg; return false; };
    try {
      await deleteTransfer(${t1Id});
    } finally {
      window.confirm = origConfirm;
    }
    const t1 = await fsGetOneSafe('transfers', ${t1Id});
    const renderedIds = Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => String(tr.getAttribute('data-record-id')));
    return { capturedPrompt, isStillActive: !t1.voided, inTable: renderedIds.includes(String(${t1Id})) };
  })()`);
  assert(cancelTestResult.capturedPrompt && cancelTestResult.capturedPrompt.includes('Cash in Hand → Bank') && cancelTestResult.capturedPrompt.includes('₹1,500.00'),
    'Cancellation prompt correctly displayed Direction (Cash in Hand → Bank) and Amount (₹1,500.00)');
  assert(cancelTestResult.isStillActive === true, 'Cancelled transfer record was NOT voided in database');
  assert(cancelTestResult.inTable === true, 'Cancelled transfer remains visible in table');

  // Test 4: Delete Cash -> Bank transfer T1 (confirm returns true)
  const deleteT1Result = await evaluate(`(async () => {
    let capturedPrompt = null;
    let capturedAlert = null;
    const origConfirm = window.confirm;
    const origAlert = window.alert;
    window.confirm = (msg) => { capturedPrompt = msg; return true; };
    window.alert = (msg) => { capturedAlert = msg; };
    try {
      await deleteTransfer(${t1Id});
    } finally {
      window.confirm = origConfirm;
      window.alert = origAlert;
    }
    const t1 = await fsGetOneSafe('transfers', ${t1Id});
    const renderedIds = Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => String(tr.getAttribute('data-record-id')));
    return {
      capturedAlert,
      isVoided: !!t1.voided,
      voidReason: t1.voidReason,
      inTable: renderedIds.includes(String(${t1Id})),
      t2InTable: renderedIds.includes(String(${t2Id})),
      t3InTable: renderedIds.includes(String(${t3Id}))
    };
  })()`);
  assert(deleteT1Result.capturedAlert === 'Fund transfer deleted successfully.', 'Success alert displayed on T1 deletion');
  assert(deleteT1Result.isVoided === true && deleteT1Result.voidReason === 'Deleted by user', 'T1 is voided with voidReason="Deleted by user"');
  assert(deleteT1Result.inTable === false, 'T1 is NO LONGER in the Fund Transfers table');
  assert(deleteT1Result.t2InTable === true && deleteT1Result.t3InTable === true, 'Isolation test: T2 and T3 remain intact in table');

  // Balances after T1 deleted:
  // With T1 (Cash->Bank 1500) voided, Cash increases by 1500, Bank decreases by 1500
  // Net cash effect from T2(+800) and T3(-500) = +300
  // Net bank effect from T2(-800) and T3(+500) = -300
  const postT1Cash = await evaluate(`getCashBalance()`);
  const postT1Bank = await evaluate(`getBankBalance()`);
  assert(postT1Cash === initialCash + 300, `Cash balance updated correctly after voiding Cash->Bank T1: expected ${initialCash + 300}, got ${postT1Cash}`);
  assert(postT1Bank === initialBank - 300, `Bank balance updated correctly after voiding Cash->Bank T1: expected ${initialBank - 300}, got ${postT1Bank}`);

  // Test 5: Delete Bank -> Cash transfer T2 (confirm returns true)
  const deleteT2Result = await evaluate(`(async () => {
    let capturedPrompt = null;
    let capturedAlert = null;
    const origConfirm = window.confirm;
    const origAlert = window.alert;
    window.confirm = (msg) => { capturedPrompt = msg; return true; };
    window.alert = (msg) => { capturedAlert = msg; };
    try {
      await deleteTransfer(${t2Id});
    } finally {
      window.confirm = origConfirm;
      window.alert = origAlert;
    }
    const t2 = await fsGetOneSafe('transfers', ${t2Id});
    const renderedIds = Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => String(tr.getAttribute('data-record-id')));
    return {
      capturedPrompt,
      capturedAlert,
      isVoided: !!t2.voided,
      inTable: renderedIds.includes(String(${t2Id})),
      t3InTable: renderedIds.includes(String(${t3Id}))
    };
  })()`);
  assert(deleteT2Result.capturedPrompt && deleteT2Result.capturedPrompt.includes('Bank → Cash in Hand') && deleteT2Result.capturedPrompt.includes('₹800.00'),
    'T2 confirmation prompt correctly showed Bank → Cash in Hand and ₹800.00');
  assert(deleteT2Result.capturedAlert === 'Fund transfer deleted successfully.', 'Success alert displayed on T2 deletion');
  assert(deleteT2Result.isVoided === true, 'T2 is voided in database');
  assert(deleteT2Result.inTable === false, 'T2 is NO LONGER in the Fund Transfers table');
  assert(deleteT2Result.t3InTable === true, 'T3 remains visible in table');

  // Balances after T2 deleted:
  // Only T3 remains active: Cash->Bank ₹500
  // Net cash effect = -500; Net bank effect = +500
  const postT2Cash = await evaluate(`getCashBalance()`);
  const postT2Bank = await evaluate(`getBankBalance()`);
  assert(postT2Cash === initialCash - 500, `Cash balance updated correctly after voiding Bank->Cash T2: expected ${initialCash - 500}, got ${postT2Cash}`);
  assert(postT2Bank === initialBank + 500, `Bank balance updated correctly after voiding Bank->Cash T2: expected ${initialBank + 500}, got ${postT2Bank}`);

  // Verify Cash Book and Bank Book mathematical consistency
  const cashBookRows = await evaluate(`buildCashBookRows()`);
  const bankBookRows = await evaluate(`buildBankBookRows()`);
  const cashBookFinalBal = cashBookRows.length ? cashBookRows[cashBookRows.length - 1].balance : 0;
  const bankBookFinalBal = bankBookRows.length ? bankBookRows[bankBookRows.length - 1].balance : 0;

  assert(cashBookFinalBal === postT2Cash, `Cash Book final row balance (${cashBookFinalBal}) matches getCashBalance() (${postT2Cash})`);
  assert(bankBookFinalBal === postT2Bank, `Bank Book final row balance (${bankBookFinalBal}) matches getBankBalance() (${postT2Bank})`);

  // Verify no voided transfers appear in Cash Book or Bank Book
  const cashBookT1 = cashBookRows.find(r => r.particulars && r.particulars.includes(t1Data.refNo));
  const bankBookT1 = bankBookRows.find(r => r.particulars && r.particulars.includes(t1Data.refNo));
  const cashBookT2 = cashBookRows.find(r => r.particulars && r.particulars.includes(t2Data.refNo));
  const bankBookT2 = bankBookRows.find(r => r.particulars && r.particulars.includes(t2Data.refNo));
  assert(!cashBookT1 && !bankBookT1, 'Voided transfer T1 does NOT appear in Cash Book or Bank Book');
  assert(!cashBookT2 && !bankBookT2, 'Voided transfer T2 does NOT appear in Cash Book or Bank Book');

  // Test 6: Persistence across page refresh
  console.log('Reloading page to test persistence of deletion...');
  await evaluate(`window.location.reload();`);
  await new Promise(r => setTimeout(r, 2000));

  await evaluate(`(async () => {
    await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
    for (let i = 0; i < 50; i++) {
      if (window._appBooted && window.CURRENT_VIEW === 'dashboard') break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 300));
    await navigate('transfers');
    for (let i = 0; i < 30; i++) {
      if (document.getElementById('transferForm')) break;
      await new Promise(r => setTimeout(r, 100));
    }
  })()`);
  await new Promise(r => setTimeout(r, 500));

  const rowsAfterReload = await evaluate(`Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => String(tr.getAttribute('data-record-id')) )`);
  assert(!rowsAfterReload.includes(String(t1Id)), 'T1 does NOT reappear after page reload');
  assert(!rowsAfterReload.includes(String(t2Id)), 'T2 does NOT reappear after page reload');
  assert(rowsAfterReload.includes(String(t3Id)), 'T3 correctly persists after page reload');

  // Test 7: Double-submission guard check
  const doubleSubmitResult = await evaluate(`(async () => {
    window.isTransferDeleting = true;
    let confirmCalled = false;
    const origConfirm = window.confirm;
    window.confirm = () => { confirmCalled = true; return true; };
    try {
      await deleteTransfer(${t3Id});
    } finally {
      window.confirm = origConfirm;
      window.isTransferDeleting = false;
    }
    return { confirmCalled };
  })()`);
  assert(doubleSubmitResult.confirmCalled === false, 'deleteTransfer immediately returns if window.isTransferDeleting is true');

  // Test 8: Edit, Save, and Highlight regression check
  console.log('Testing Edit, Highlight, and Save on surviving transfer T3...');
  await evaluate(`(async () => {
    await navigate('transfers', ${t3Id});
    for (let i = 0; i < 30; i++) {
      if (document.getElementById('transferForm')) break;
      await new Promise(r => setTimeout(r, 100));
    }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const editStateCheck = await evaluate(`(() => {
    const isEditing = window.GlobalEditState.isEditing('transfers', ${t3Id});
    const activeRow = document.querySelector('tr.row-editing-active');
    const formInput = document.querySelector('#transferForm input[name="amount"]');
    return {
      isEditing,
      hasActiveRowClass: !!activeRow && activeRow.getAttribute('data-record-id') === String(${t3Id}),
      formAmount: formInput ? formInput.value : null
    };
  })()`);
  assert(editStateCheck.isEditing === true, 'GlobalEditState marks T3 as editing');
  assert(editStateCheck.hasActiveRowClass === true, 'T3 row receives .row-editing-active class and highlight animation');
  assert(editStateCheck.formAmount === '500', 'Transfer form populated with existing amount (500)');

  // Update T3 amount to 750
  await evaluate(`(async () => {
    const formInput = document.querySelector('#transferForm input[name="amount"]');
    if (formInput) formInput.value = '750';
    await saveTransfer();
  })()`);
  await new Promise(r => setTimeout(r, 800));

  const updatedT3 = await evaluate(`fsGetOneSafe('transfers', ${t3Id})`);
  assert(updatedT3.amount === 750, 'Transfer T3 successfully updated to ₹750');
  const postEditCash = await evaluate(`getCashBalance()`);
  assert(postEditCash === initialCash - 750, `Cash balance reflects updated T3 amount (₹750): expected ${initialCash - 750}, got ${postEditCash}`);

  // Test 9: Cleanup test data in emulator
  console.log('Cleaning up emulator test transfers (T1, T2, T3)...');
  await evaluate(`(async () => {
    const db = getFirestoreDb();
    if (db) {
      await db.collection('transfers').doc('tx_${t1Id}').delete().catch(()=>{});
      await db.collection('transfers').doc('tx_${t2Id}').delete().catch(()=>{});
      await db.collection('transfers').doc('tx_${t3Id}').delete().catch(()=>{});
    }
    if (typeof deleteRec === 'function') {
      await deleteRec('transfers', ${t1Id}).catch(()=>{});
      await deleteRec('transfers', ${t2Id}).catch(()=>{});
      await deleteRec('transfers', ${t3Id}).catch(()=>{});
    }
  })()`);

  ws.close();
}

async function main() {
  try {
    await runBrowserTests();
  } catch (err) {
    console.error('Browser Test Error:', err);
    totalTests++;
    failedTests++;
  }

  console.log('\n================================================================');
  console.log(`FINAL RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} tests failed.`);
  } else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  }
  console.log('================================================================');
  process.exit(failedTests > 0 ? 1 : 0);
}

main();
