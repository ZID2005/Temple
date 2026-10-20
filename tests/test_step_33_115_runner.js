const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runVisualTests() {
  console.log('Starting Step 33.115 Visual Harness Tests...');
  const port = 9226;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--window-size=1280,800',
    'file:///D:/Temple/tests/test_harness_step33_115.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('Target page not found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', msg.params.args.map(a => a.value || a.description).join(' '));
      }
    };

    function send(method, params = {}) {
      return new Promise(r => {
        const i = id++;
        callbacks.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    async function snap(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join('D:\\Temple\\tests', filename);
      fs.writeFileSync(p, Buffer.from(res.result.data, 'base64'));
      console.log(`Saved screenshot: ${filename} (${fs.statSync(p).size} bytes)`);
    }

    // 1. Drawing phase at 3.0s
    console.log('Testing at 3.0s (Drawing phase)...');
    await new Promise(r => setTimeout(r, 3000));
    let domCheck = await send('Runtime.evaluate', {
      expression: `({
        hasCountEl: !!document.getElementById('rangoli-count'),
        hasRgpBr: !!document.querySelector('.rgp-br'),
        hasPercentText: document.body.innerText.includes('%')
      })`,
      returnByValue: true
    });
    console.log('DOM check at 3.0s (HUD removal):', domCheck.result?.result?.value);
    await snap('step33_115_desktop_3s_drawing.png');

    // 2. Completed Hold phase with greeting at 7.5s
    console.log('Testing at 7.5s (Completed hold phase)...');
    await new Promise(r => setTimeout(r, 4500));
    let greetingCheck = await send('Runtime.evaluate', {
      expression: `({
        closeBg: window.getComputedStyle(document.querySelector('.rgp-close')).background,
        closeBoxShadow: window.getComputedStyle(document.querySelector('.rgp-close')).boxShadow,
        closeVisible: document.querySelector('.rgp-close').classList.contains('rgp-visible'),
        hasPercentText: document.body.innerText.includes('%')
      })`,
      returnByValue: true
    });
    console.log('DOM check at 7.5s (Greeting card styling):', greetingCheck.result?.result?.value);
    await snap('step33_115_desktop_7.5s_hold.png');

    // 3. Wind & clear phase at 11.0s
    console.log('Testing at 11.0s (Wind & dispersal phase)...');
    await new Promise(r => setTimeout(r, 3500));
    await snap('step33_115_desktop_11s_wind.png');

    // 4. Revealed login screen at 14.5s
    console.log('Testing at 14.5s (Revealed login screen)...');
    await new Promise(r => setTimeout(r, 3500));
    let loginCheck = await send('Runtime.evaluate', {
      expression: `({
        rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
        rwComputedDisplay: window.getComputedStyle(document.getElementById('rangoli-welcome')).display,
        rwGateDisplay: window.getComputedStyle(document.querySelector('.rgp-gate')).display,
        rwHasHiddenClass: document.getElementById('rangoli-welcome')?.classList.contains('rgp-hidden'),
        rwHasDismissedClass: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
        authExpDisplay: window.getComputedStyle(document.getElementById('auth-experience')).display,
        loginCardVisible: !!document.querySelector('.login-card'),
        loginStageDisplay: window.getComputedStyle(document.getElementById('login-stage')).display
      })`,
      returnByValue: true
    });
    console.log('DOM check at 14.5s (Revealed Login state):', loginCheck.result?.result?.value);
    await snap('step33_115_desktop_14.5s_login.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

runVisualTests().catch(console.error);
