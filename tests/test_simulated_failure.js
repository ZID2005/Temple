async function run() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
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

  // Create a temporary transfer for error testing
  const simReason = 'SIM_FAIL_' + Date.now();
  const testRec = {
    id: Date.now(),
    firestoreId: 'tx_' + Date.now(),
    date: '2026-10-11',
    fromAcc: 'Cash',
    toAcc: 'Bank',
    amount: 999,
    mode: 'Cash',
    reason: simReason,
    createdAt: Date.now()
  };
  await evaluate(`fsSaveRecordSafe('transfers', ${JSON.stringify(testRec)}, false)`);
  await evaluate(`navigate('transfers')`);
  await new Promise(r => setTimeout(r, 500));

  // Simulate Firestore failure on fsVoidRecordSafe
  const simResult = await evaluate(`(async () => {
    let capturedAlert = null;
    const origAlert = window.alert;
    window.alert = (msg) => { capturedAlert = msg; };

    const origVoid = window.fsVoidRecordSafe;
    window.fsVoidRecordSafe = async () => { throw new Error('Simulated network/Firestore failure'); };

    try {
      await deleteTransfer(${testRec.id}, true);
    } catch(e) {}
    finally {
      window.alert = origAlert;
      window.fsVoidRecordSafe = origVoid;
    }

    const t = await fsGetOneSafe('transfers', ${testRec.id});
    const inTable = !!document.querySelector('tr[data-record-id="${testRec.id}"]');
    const isDeleting = window.isTransferDeleting;

    return {
      capturedAlert,
      isVoided: t ? !!t.voided : null,
      inTable,
      isDeleting
    };
  })()`);

  console.log('Simulated failure result:', JSON.stringify(simResult, null, 2));

  if (!simResult.capturedAlert || !simResult.capturedAlert.includes('Simulated network/Firestore failure')) {
    throw new Error('Error was not properly shown to user!');
  }
  if (simResult.isVoided !== false) {
    throw new Error('Record was wrongly voided despite failure!');
  }
  if (simResult.inTable !== true) {
    throw new Error('Record was wrongly removed from table!');
  }
  if (simResult.isDeleting !== false) {
    throw new Error('isTransferDeleting was not reset in finally block!');
  }

  console.log('PASS: Simulated Firestore failure handled safely with user notification and no state corruption.');

  // Clean up testRec
  await evaluate(`(async () => {
    await fsVoidRecordSafe('transfers', '${testRec.firestoreId}', 'Clean up test');
    await getFirestoreDb().collection('transfers').doc('${testRec.firestoreId}').delete();
    await deleteRec('transfers', ${testRec.id});
    await navigate('transfers');
  })()`);

  ws.close();
}
run().catch(err => {
  console.error('SIM FAILURE TEST FAILED:', err);
  process.exit(1);
});
