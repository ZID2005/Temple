async function run() {
  console.log('================================================================');
  console.log('STEP 33.18A LIVE FAILURE DIAGNOSIS & FIX VALIDATION');
  console.log('Testing Real Browser UI Flow (Click Delete -> Modal -> Confirm)');
  console.log('================================================================\n');

  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

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

  // Ensure transfers view is active
  await evaluate(`navigate('transfers')`);
  await new Promise(r => setTimeout(r, 600));

  // Step 1: Create a uniquely identified test transfer
  const testReason = 'STEP33_18A_TEST_' + Date.now();
  console.log('Step 1: Creating uniquely identified test transfer:', testReason);
  await evaluate(`(() => {
    const form = document.getElementById('transferForm');
    form.querySelector('[name="date"]').value = '2026-10-11';
    form.querySelector('[name="fromAcc"]').value = 'Cash';
    form.querySelector('[name="toAcc"]').value = 'Bank';
    form.querySelector('[name="amount"]').value = '1888.00';
    form.querySelector('[name="mode"]').value = 'Cash';
    form.querySelector('[name="reason"]').value = '${testReason}';
    form.querySelector('[name="refNo"]').value = 'REF_33_18A';
  })()`);
  await evaluate(`saveTransfer()`);
  await new Promise(r => setTimeout(r, 1000));

  // Find created record in active transfers
  const testRec = await evaluate(`(async () => {
    const active = await activeTransfers();
    return active.find(t => t.reason === '${testReason}');
  })()`);
  console.log('Created test record:', testRec ? { id: testRec.id, firestoreId: testRec.firestoreId, amount: testRec.amount } : 'NOT FOUND');
  if (!testRec) throw new Error('Test record was not created');

  const testId = testRec.id;
  const testDocId = testRec.firestoreId || ('tx_' + testId);

  // Verify it rendered in UI table
  const rowInDomBefore = await evaluate(`!!document.querySelector('tr[data-record-id="${testId}"]')`);
  console.log('Test record row rendered in table:', rowInDomBefore);
  if (!rowInDomBefore) throw new Error('Test row not found in DOM');

  // Step 2: Click the Delete button via UI
  console.log('\nStep 2: Clicking Delete button in table row via UI click...');
  await evaluate(`(() => {
    const row = document.querySelector('tr[data-record-id="${testId}"]');
    const delBtn = row.querySelector('.btn-danger');
    delBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Step 3: Record whether the confirmation dialog appears
  console.log('\nStep 3: Checking if confirmation dialog / modal appears...');
  const modalInfo = await evaluate(`(() => {
    const modal = document.getElementById('delete-transfer-modal');
    if (!modal) return { visible: false };
    return {
      visible: true,
      html: modal.innerText,
      hasCancelBtn: !!document.getElementById('btn-cancel-delete-transfer'),
      hasConfirmBtn: !!document.getElementById('btn-confirm-delete-transfer')
    };
  })()`);
  console.log('Confirmation dialog state:', JSON.stringify(modalInfo, null, 2));
  if (!modalInfo.visible) throw new Error('Confirmation modal did NOT appear in UI!');

  // Step 4: Test Cancellation (leaves record unchanged)
  console.log('\nStep 4: Testing Cancel button on confirmation dialog...');
  await evaluate(`(() => {
    document.getElementById('btn-cancel-delete-transfer').click();
  })()`);
  await new Promise(r => setTimeout(r, 300));

  const afterCancelState = await evaluate(`(async () => {
    const modal = document.getElementById('delete-transfer-modal');
    const docSnap = await getFirestoreDb().collection('transfers').doc('${testDocId}').get();
    const idbRec = await getOne('transfers', '${testId}');
    const inTable = !!document.querySelector('tr[data-record-id="${testId}"]');
    return {
      modalOpen: !!modal,
      firestoreVoided: docSnap.exists ? !!docSnap.data().voided : false,
      idbVoided: idbRec ? !!idbRec.voided : false,
      inTable
    };
  })()`);
  console.log('State after Cancel:', JSON.stringify(afterCancelState, null, 2));
  if (afterCancelState.modalOpen) throw new Error('Modal did not close on Cancel');
  if (afterCancelState.firestoreVoided) throw new Error('Record was wrongly voided on Cancel');
  if (!afterCancelState.inTable) throw new Error('Record was wrongly removed on Cancel');
  console.log(' PASS: Cancellation leaves transfer intact and visible in table.');

  // Step 5: Click Delete again and CONFIRM the action
  console.log('\nStep 5: Clicking Delete button again to test Confirmation...');
  await evaluate(`(() => {
    const row = document.querySelector('tr[data-record-id="${testId}"]');
    row.querySelector('.btn-danger').click();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log('Step 6: Clicking Confirm Delete button in modal...');
  await evaluate(`(() => {
    document.getElementById('btn-confirm-delete-transfer').click();
  })()`);
  await new Promise(r => setTimeout(r, 1500));

  // Step 7: Inspect Firestore, IndexedDB, and UI after Confirmation
  console.log('\nStep 7: Verifying Firestore, IndexedDB, and UI after confirmed deletion...');
  const afterDeleteState = await evaluate(`(async () => {
    const db = getFirestoreDb();
    const docSnap = await db.collection('transfers').doc('${testDocId}').get();
    const idbRec = await getOne('transfers', '${testId}');
    const active = await activeTransfers();
    const inActive = !!active.find(t => t.id === '${testId}' || t.firestoreId === '${testDocId}');
    const inTable = !!document.querySelector('tr[data-record-id="${testId}"]');
    const modal = document.getElementById('delete-transfer-modal');
    return {
      firestoreExists: docSnap.exists,
      firestoreVoided: docSnap.exists ? docSnap.data().voided : null,
      firestoreVoidReason: docSnap.exists ? docSnap.data().voidReason : null,
      firestoreVoidDate: docSnap.exists ? docSnap.data().voidDate : null,
      idbVoided: idbRec ? idbRec.voided : null,
      inActive,
      inTable,
      modalOpen: !!modal
    };
  })()`);
  console.log('State after Confirm Delete:', JSON.stringify(afterDeleteState, null, 2));

  if (afterDeleteState.firestoreVoided !== true) throw new Error('Firestore document was NOT voided!');
  if (afterDeleteState.idbVoided !== true) throw new Error('IndexedDB cache was NOT voided!');
  if (afterDeleteState.inActive !== false) throw new Error('activeTransfers() still includes voided transfer!');
  if (afterDeleteState.inTable !== false) throw new Error('Table row is still visible in UI!');
  console.log(' PASS: Firestore doc voided, IDB synced, activeTransfers() excludes it, table row removed.');

  // Step 8: Test Persistence Across Page Reload
  console.log('\nStep 8: Reloading page to test persistence...');
  await evaluate(`window.location.reload()`);
  await new Promise(r => setTimeout(r, 2500));

  await evaluate(`(async () => {
    try {
      await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
    } catch(e) {}
    for (let i = 0; i < 50; i++) {
      if (window._appBooted) break;
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

  const afterReloadState = await evaluate(`(async () => {
    const active = await activeTransfers();
    const inActive = !!active.find(t => t.id === '${testId}' || t.firestoreId === '${testDocId}');
    const inTable = !!document.querySelector('tr[data-record-id="${testId}"]');
    return { inActive, inTable };
  })()`);
  console.log('State after Page Reload:', JSON.stringify(afterReloadState, null, 2));
  if (afterReloadState.inActive || afterReloadState.inTable) throw new Error('Voided transfer reappeared after reload!');
  console.log(' PASS: Voided transfer does not reappear after reload.');

  // Step 9: Verify Surviving Records are Intact (e.g. ₹12,000 transfer)
  console.log('\nStep 9: Verifying pre-existing ₹12,000 record is intact...');
  const survivorCheck = await evaluate(`(async () => {
    const active = await activeTransfers();
    const rec12k = active.find(t => t.amount === 12000);
    const row12k = document.querySelector('tr[data-record-id="' + (rec12k ? rec12k.id : '') + '"]');
    return {
      found12k: !!rec12k,
      data: rec12k ? { id: rec12k.id, amount: rec12k.amount, from: rec12k.fromAcc, to: rec12k.toAcc } : null,
      rowVisible: !!row12k
    };
  })()`);
  console.log('Survivor check for ₹12,000 transfer:', JSON.stringify(survivorCheck, null, 2));
  if (!survivorCheck.found12k || !survivorCheck.rowVisible) throw new Error('Pre-existing ₹12,000 transfer was affected!');
  console.log(' PASS: Pre-existing ₹12,000 record is intact and visible.');

  // Step 10: Clean up DIAG_TEST_777 if still in active
  const cleanup777 = await evaluate(`(async () => {
    const active = await activeTransfers();
    const test777 = active.find(t => t.reason === 'DIAG_TEST_777');
    if (test777) {
      await deleteTransfer(test777.id, true);
      return { cleaned: true, id: test777.id };
    }
    return { cleaned: false };
  })()`);
  console.log('Cleaned up diagnostic 777 record:', cleanup777);

  console.log('\n================================================================');
  console.log('ALL LIVE BROWSER UI TESTS PASSED SUCCESSFULLY (100%)');
  console.log('================================================================');
  ws.close();
}
run().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
