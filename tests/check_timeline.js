const http = require('http');
const { spawn } = require('child_process');

async function testTimer() {
  const port = 9228;
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

    for (let sec = 1; sec <= 18; sec++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
          sec: ${sec},
          gatePhase: document.querySelector('.rgp-gate')?.getAttribute('data-phase'),
          rootPhase: document.getElementById('rangoli-welcome')?.getAttribute('data-phase'),
          rwHidden: document.getElementById('rangoli-welcome')?.classList.contains('rgp-hidden'),
          rwDismissed: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
          rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
          rwComputedDisplay: window.getComputedStyle(document.getElementById('rangoli-welcome')).display,
          authStage: window.AuthExperience ? window.AuthExperience.currentStage : 'no-auth'
        })`,
        returnByValue: true
      });
      const data = JSON.parse(res?.result?.value);
      console.log(data);
      if (data.rwDisplay === 'none' && data.rwComputedDisplay === 'none') {
        console.log('>>> COMPLETE: Overlay fully eradicated at second ' + sec);
        break;
      }
    }
    ws.close();
  } finally {
    chrome.kill();
  }
}
testTimer().catch(console.error);
