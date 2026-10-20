const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runLiveSession(width, height, isMobile, prefix) {
  console.log(`\n================================================================`);
  console.log(`Starting Live Application Test: ${prefix} (${width}x${height})`);
  console.log(`================================================================`);

  const port = isMobile ? 9245 : 9244;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--window-size=${width},${height}`,
    'http://localhost:3001/Temple_Accounts-1.html'
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
    if (!pageTarget) throw new Error('Target page not found: ' + JSON.stringify(targets));

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        cb(msg);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    async function evaluate(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return res.result?.result?.value;
    }

    async function snap(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      if (res.result?.data) {
        const p = path.join('D:\\Temple\\tests', filename);
        fs.writeFileSync(p, Buffer.from(res.result.data, 'base64'));
        console.log(`📸 Saved screenshot: ${filename} (${fs.statSync(p).size} bytes)`);
      }
    }

    if (!isMobile) {
      // 1. Drawing phase at ~2.5s
      console.log('--- At 2.5s (drawing phase) ---');
      await new Promise(r => setTimeout(r, 2500));
      let state = await evaluate(`({
        stage: window.AuthExperience?.currentStage,
        rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
      })`);
      console.log('State at 2.5s:', state);
      await snap(`${prefix}_01_early_drawing.png`);

      // 2. Bloom & greeting fade-in at ~5.2s
      console.log('--- At 5.2s (blossom & greeting fade-in) ---');
      await new Promise(r => setTimeout(r, 2700));
      state = await evaluate(`({
        greetingVisible: document.querySelector('#rangoli-welcome .rgp-close')?.classList.contains('rgp-visible'),
        rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
      })`);
      console.log('State at 5.2s:', state);
      await snap(`${prefix}_02_greeting_fadein.png`);

      // 3. Hold phase with complete greeting at ~7.8s
      console.log('--- At 7.8s (serene appreciation hold) ---');
      await new Promise(r => setTimeout(r, 2600));
      const styles = await evaluate(`({
        stage: window.AuthExperience?.currentStage,
        rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase'),
        closeBg: window.getComputedStyle(document.querySelector('.rgp-close')).background,
        blessingColor: window.getComputedStyle(document.querySelector('.rgp-blessing')).color,
        messageColor: window.getComputedStyle(document.querySelector('.rgp-message')).color,
        subnoteColor: window.getComputedStyle(document.querySelector('.rgp-subnote')).color,
        closeVisible: document.querySelector('.rgp-close')?.classList.contains('rgp-visible')
      })`);
      console.log('Greeting styles and phase at 7.8s:', styles);
      await snap(`${prefix}_03_hold_greeting.png`);

      // 4. Wind sweep phase at ~10.5s
      console.log('--- At 10.5s (wind sweep & powder dispersal) ---');
      await new Promise(r => setTimeout(r, 2700));
      state = await evaluate(`({
        stage: window.AuthExperience?.currentStage,
        rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
      })`);
      console.log('State at 10.5s:', state);
      await snap(`${prefix}_04_wind_dispersal.png`);

      // 5. Revealed login screen at ~14.5s
      console.log('--- At 14.5s (revealed login screen) ---');
      await new Promise(r => setTimeout(r, 4000));
      state = await evaluate(`({
        stage: window.AuthExperience?.currentStage,
        rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
        rwComputedDisplay: window.getComputedStyle(document.getElementById('rangoli-welcome')).display,
        rwDismissed: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
        loginStageDisplay: window.getComputedStyle(document.getElementById('login-stage')).display,
        loginCardPresent: !!document.querySelector('.login-card')
      })`);
      console.log('State at 14.5s:', state);
      await snap(`${prefix}_05_login_revealed.png`);
    } else {
      // Mobile sequence
      console.log('Mobile: Waiting for hold phase (~7.8s)...');
      await new Promise(r => setTimeout(r, 7800));
      await snap(`${prefix}_01_hold_greeting.png`);

      console.log('Mobile: Waiting for revealed login screen (~14.5s)...');
      await new Promise(r => setTimeout(r, 6700));
      await snap(`${prefix}_02_login_revealed.png`);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  console.log('================================================================');
  console.log('STEP 33.116 LIVE HTTP APPLICATION VISUAL SUITE');
  console.log('================================================================');
  await runLiveSession(1280, 800, false, 'step33_116_live_desktop');
  await new Promise(r => setTimeout(r, 1500));
  await runLiveSession(390, 844, true, 'step33_116_live_mobile');
  console.log('\nAll Live Application Tests Completed Successfully.');
}

main().catch(err => {
  console.error('Fatal live suite error:', err);
  process.exit(1);
});
