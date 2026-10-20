const http = require('http');
const { spawn } = require('child_process');

async function testRW() {
  const port = 9230;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--disable-gpu',
    'file:///D:/Temple/tests/test_harness_step33_115.html'
  ]);
  try {
    await new Promise(r => setTimeout(r, 1500));
    const targets = await new Promise((res, rej) => http.get('http://127.0.0.1:' + port + '/json', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej));
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 1;
    const send = (m, p = {}) => new Promise(r => {
      const i = id++;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === i) { ws.removeEventListener('message', handler); r(msg.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    await send('Runtime.enable');
    const res = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        rw: !!document.getElementById('rangoli-welcome'),
        gate: !!document.querySelector('.rgp-gate'),
        gatePhase: document.querySelector('.rgp-gate')?.getAttribute('data-phase'),
        closeVisible: document.querySelector('.rgp-close')?.classList.contains('rgp-visible'),
        canvasWidth: document.getElementById('rangoli-canvas')?.width
      })`,
      returnByValue: true
    });
    console.log('Result:', JSON.parse(res?.result?.value));
    ws.close();
  } finally {
    chrome.kill();
  }
}
testRW().catch(console.error);
