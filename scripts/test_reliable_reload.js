const http = require('http');

async function testReload() {
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

  let loadFired = false;
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Page.loadEventFired') {
      loadFired = true;
    }
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

  await send('Page.enable');
  loadFired = false;
  console.log('Reloading page...');
  await send('Page.reload', { ignoreCache: true });

  console.log('Waiting for Page.loadEventFired...');
  while (!loadFired) {
    await new Promise(r => setTimeout(r, 50));
  }
  console.log('Page loaded! Now polling for boot completion (dashboard)...');

  const start = Date.now();
  let booted = false;
  while (!booted && (Date.now() - start < 15000)) {
    try {
      const state = await evaluate(`({
        booted: window._appBooted,
        view: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
        mainLength: document.getElementById('app-main') ? document.getElementById('app-main').innerHTML.length : 0
      })`);
      if (state && state.booted && state.view === 'dashboard' && state.mainLength > 500) {
        booted = true;
        console.log('Boot completed in', Date.now() - start, 'ms:', state);
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Now navigating to billing...');
  await evaluate(`(async () => { await navigate('billing'); })()`);
  await new Promise(r => setTimeout(r, 1000));

  const afterNav = await evaluate(`({
    view: CURRENT_VIEW,
    btn: !!document.getElementById('btnCreateBill'),
    overlay: !!document.getElementById('receiptPrinterOverlay')
  })`);
  console.log('After nav state:', afterNav);
  ws.close();
}

testReload().catch(console.error);
