const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACT_DIR = 'C:\\Users\\sanal\\.gemini\\antigravity-ide\\brain\\2d3d2c50-65e7-494c-90de-67dbb7bac9e4';

async function captureTimeline() {
  const port = 9244;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--disable-gpu',
    '--window-size=1280,800',
    'file:///D:/Temple/Temple_Accounts-1.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
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
    await send('Page.enable');

    async function takeScreenshot(filename) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log(`Saved screenshot: ${outPath}`);
    }

    // 1. Capture at 2.5s (drawing phase)
    await new Promise(r => setTimeout(r, 1000));
    await takeScreenshot('step33_115_desktop_01_drawing.png');

    // 2. Capture at 7s (hold phase with greeting blossomed)
    await new Promise(r => setTimeout(r, 4500));
    await takeScreenshot('step33_115_desktop_02_hold_greeting.png');

    // 3. Capture at 10.5s (wind dispersal phase)
    await new Promise(r => setTimeout(r, 3500));
    await takeScreenshot('step33_115_desktop_03_wind_dispersal.png');

    // 4. Capture at 14s (revealed login screen)
    await new Promise(r => setTimeout(r, 4000));
    await takeScreenshot('step33_115_desktop_04_login_revealed.png');

    // Inspect DOM state at 14s
    const domState = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        rangoliDisplay: getComputedStyle(document.getElementById('rangoli-welcome')).display,
        rangoliOpacity: getComputedStyle(document.getElementById('rangoli-welcome')).opacity,
        rangoliVisibility: getComputedStyle(document.getElementById('rangoli-welcome')).visibility,
        rangoliClasses: document.getElementById('rangoli-welcome').className,
        loginStageDisplay: getComputedStyle(document.getElementById('login-stage')).display,
        authExpDisplay: getComputedStyle(document.getElementById('auth-experience')).display,
        authExpBg: getComputedStyle(document.getElementById('auth-experience')).backgroundColor,
        percentElementExists: !!document.getElementById('rangoli-count'),
        hudCornerExists: !!document.querySelector('.rgp-br')
      })`,
      returnByValue: true
    });
    console.log('DOM State after completion:', JSON.parse(domState?.result?.value || '{}'));

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function captureMobile() {
  const port = 9245;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--disable-gpu',
    '--window-size=375,667',
    'file:///D:/Temple/Temple_Accounts-1.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
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
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });

    async function takeScreenshot(filename) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log(`Saved screenshot: ${outPath}`);
    }

    // 1. Mobile hold greeting
    await new Promise(r => setTimeout(r, 6500));
    await takeScreenshot('step33_115_mobile_01_hold_greeting.png');

    // 2. Mobile login revealed
    await new Promise(r => setTimeout(r, 7000));
    await takeScreenshot('step33_115_mobile_02_login_revealed.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function captureLogout() {
  const port = 9246;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--disable-gpu',
    '--window-size=1280,800',
    'file:///D:/Temple/Temple_Accounts-1.html?logout=true'
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
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
    await send('Page.enable');

    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(ARTIFACT_DIR, 'step33_115_desktop_logout_direct.png');
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`Saved screenshot: ${outPath}`);

    const logoutState = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        rangoliDisplay: getComputedStyle(document.getElementById('rangoli-welcome')).display,
        loginVisible: getComputedStyle(document.getElementById('login-stage')).display === 'flex'
      })`,
      returnByValue: true
    });
    console.log('Logout Immediate State:', JSON.parse(logoutState?.result?.value || '{}'));

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function runAll() {
  console.log('--- Capturing Desktop Lifecycle ---');
  await captureTimeline();
  console.log('--- Capturing Mobile Lifecycle ---');
  await captureMobile();
  console.log('--- Capturing Logout Direct View ---');
  await captureLogout();
  console.log('--- All captures complete ---');
}

runAll().catch(console.error);
