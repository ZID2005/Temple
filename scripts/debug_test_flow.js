async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        currentReceipt: typeof currentBillingReceipt !== 'undefined' ? currentBillingReceipt : null,
        printerState: ReceiptPrinter.state,
        printerFeedMode: ReceiptPrinter.feedMode,
        feedback: document.getElementById('billingFeedback') ? document.getElementById('billingFeedback').innerText : '',
        nameVal: document.getElementById('name') ? document.getElementById('name').value : null,
        totalVal: document.getElementById('total') ? document.getElementById('total').value : null,
        catVal: document.getElementById('categorySelect') ? document.getElementById('categorySelect').value : null,
        itemVal: document.getElementById('itemSelect') ? document.getElementById('itemSelect').value : null
      };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}
main().catch(console.error);
