const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function run() {
  const url = process.argv[2] || 'http://localhost:3001/Temple_Accounts-1.html';
  console.log('Testing live application with URL:', url);
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--window-size=1280,800',
    url
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const targets = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:9222/json', (res) => {
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
        callbacks.get(msg.id)(msg);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', msg.params.args.map(a => a.value || a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
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

    async function captureScreenshot(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      if (res.result?.data) {
        fs.writeFileSync(path.join('D:\\Temple\\tests', filename), Buffer.from(res.result.data, 'base64'));
        console.log('Captured screenshot:', filename);
      }
    }

    // 1. Drawing at ~1.5s
    console.log('--- At 1.5s (drawing phase) ---');
    await new Promise(r => setTimeout(r, 1500));
    let state = await evaluate(`({
      stage: window.AuthExperience?.currentStage,
      rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
      rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase'),
      authExpDisplay: window.getComputedStyle(document.getElementById('auth-experience')).display,
      loginStageDisplay: document.getElementById('login-stage')?.style?.display
    })`);
    console.log('State at 1.5s:', state);
    await captureScreenshot('app_step33_114_1.5s_draw.png');

    // 2. Bloom & greeting entrance at ~5.0s
    console.log('--- At 5.0s (blossom & greeting entrance) ---');
    await new Promise(r => setTimeout(r, 3500));
    state = await evaluate(`({
      stage: window.AuthExperience?.currentStage,
      count: document.getElementById('rangoli-count')?.textContent,
      greetingVisible: document.querySelector('#rangoli-welcome .rgp-close')?.classList.contains('rgp-visible'),
      rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
    })`);
    console.log('State at 5.0s:', state);
    await captureScreenshot('app_step33_114_5.0s_bloom.png');

    // 3. Hold phase with serene completed design at ~7.5s
    console.log('--- At 7.5s (serene appreciation hold) ---');
    await new Promise(r => setTimeout(r, 2500));
    state = await evaluate(`({
      stage: window.AuthExperience?.currentStage,
      rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
    })`);
    console.log('State at 7.5s:', state);
    await captureScreenshot('app_step33_114_7.5s_hold.png');

    // 4. Wind sweep phase at ~11.0s
    console.log('--- At 11.0s (wind sweep & powder dispersal) ---');
    await new Promise(r => setTimeout(r, 3500));
    state = await evaluate(`({
      stage: window.AuthExperience?.currentStage,
      rwPhase: document.querySelector('#rangoli-welcome .rgp-gate')?.getAttribute('data-phase')
    })`);
    console.log('State at 11.0s:', state);
    await captureScreenshot('app_step33_114_11.0s_wind.png');

    // 5. Revealed destination at ~15.0s
    console.log('--- At 15.0s (destination screen fully revealed) ---');
    await new Promise(r => setTimeout(r, 4000));
    state = await evaluate(`({
      stage: window.AuthExperience?.currentStage,
      rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
      rwComputedDisplay: window.getComputedStyle(document.getElementById('rangoli-welcome')).display,
      rwPhase: document.getElementById('rangoli-welcome')?.getAttribute('data-phase'),
      authExpDisplay: window.getComputedStyle(document.getElementById('auth-experience')).display,
      loginStageDisplay: window.getComputedStyle(document.getElementById('login-stage')).display,
      loginCardRect: document.querySelector('.login-card')?.getBoundingClientRect(),
      authBgRunning: window.DarkVeilBackground?.isRunning
    })`);
    console.log('State at 15.0s:', state);
    await captureScreenshot('app_step33_114_15.0s_revealed_login.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
