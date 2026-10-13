const http = require('http');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function run() {
  const ws = await getBrowserWs();
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

  console.log('1. Reloading active browser tab...');
  await send('Page.reload', { ignoreCache: true });

  console.log('2. Waiting for App Shell...');
  await evaluate(`
    new Promise((resolve) => {
      const check = setInterval(() => {
        if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'dashboard' && window._appBooted) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 12000);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  console.log('3. Navigating to Billing view...');
  const navResult = await evaluate(`(async () => {
    await navigate('billing');
    return {
      currentView: CURRENT_VIEW,
      btnCreateBill: !!document.getElementById('btnCreateBill'),
      billingFormCard: !!document.querySelector('.billing-form-card')
    };
  })()`);
  console.log('3. Nav result:', navResult);

  const btnCreateBillInfo = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      if (!btn) return { notFound: true };
      const cs = window.getComputedStyle(btn);
      return {
        exists: true,
        height: cs.height,
        borderRadius: cs.borderRadius,
        hasPrimaryClass: btn.classList.contains('dynamic-btn-primary')
      };
    })()
  `);
  console.log('4. btnCreateBill info:', btnCreateBillInfo);
  ws.close();
}

run().catch(console.error);
