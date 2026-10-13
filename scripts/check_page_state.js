const http = require('http');

async function main() {
  const wsUrl = 'ws://127.0.0.1:9222/devtools/page/3E8119AE8AFED51188F4A16066076C3A';
  const ws = new WebSocket(wsUrl);

  ws.onopen = async () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(async () => {
          await navigate('transfers');
          const rows = Array.from(document.querySelectorAll('#app-main tbody tr')).map(tr => ({
            recordId: tr.getAttribute('data-record-id'),
            editScope: tr.getAttribute('data-edit-scope'),
            rowClass: tr.className,
            cells: Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()),
            buttons: Array.from(tr.querySelectorAll('button')).map(b => ({
              text: b.textContent.trim(),
              onclick: b.getAttribute('onclick')
            }))
          }));
          return {
            view: CURRENT_VIEW,
            rowCount: rows.length,
            rows: rows
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.result && data.result.result) {
      console.log('Result:', JSON.stringify(data.result.result.value, null, 2));
    } else {
      console.log('Data:', data);
    }
    ws.close();
    process.exit(0);
  };
}

main();
