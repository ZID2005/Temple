const http = require('http');

async function main() {
  const wsUrl = 'ws://127.0.0.1:9222/devtools/page/3E8119AE8AFED51188F4A16066076C3A';
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const cbs = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      cbs.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  ws.onopen = async () => {
    try {
      console.log('Connected to CDP');
      await send('Runtime.enable');

      const evalCode = `(async () => {
        const transfers = await allTransfers();
        const rows = Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => ({
          recordId: tr.getAttribute('data-record-id'),
          editScope: tr.getAttribute('data-edit-scope'),
          className: tr.className,
          cells: Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()),
          buttons: Array.from(tr.querySelectorAll('button')).map(b => ({
            text: b.textContent.trim(),
            onclick: b.getAttribute('onclick')
          }))
        }));
        const currentUser = typeof getCurrentFirebaseUser === 'function' ? getCurrentFirebaseUser() : null;
        return {
          currentView: window.CURRENT_VIEW,
          user: currentUser ? { email: currentUser.email, uid: currentUser.uid } : null,
          transfersCount: transfers.length,
          transfers: transfers,
          rows: rows
        };
      })()`;

      const res = await send('Runtime.evaluate', {
        expression: evalCode,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('Result:', JSON.stringify(res.result, null, 2));
      ws.close();
      process.exit(0);
    } catch (e) {
      console.error(e);
      ws.close();
      process.exit(1);
    }
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && cbs.has(data.id)) {
      const { resolve, reject } = cbs.get(data.id);
      cbs.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data);
    }
  };
}

main();
