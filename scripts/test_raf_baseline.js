async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result ? res.result.value : undefined;
  }

  console.log('Testing standalone rAF without animation...');
  const baselineRaf = await evaluate(`(() => {
    return new Promise(resolve => {
      const frames = [];
      let start = performance.now();
      const cb = (now) => {
        frames.push(now - start);
        start = now;
        if (frames.length < 60) requestAnimationFrame(cb);
        else resolve(frames);
      };
      requestAnimationFrame(cb);
    });
  })()`);

  console.log('Baseline rAF deltas (sample 10):', baselineRaf.slice(0, 10).map(d => Number(d.toFixed(1))));
  const avgBase = baselineRaf.reduce((a, b) => a + b, 0) / baselineRaf.length;
  console.log('Baseline average delta:', avgBase.toFixed(2), 'ms (', (1000 / avgBase).toFixed(1), 'fps)');

  ws.close();
}
main().catch(console.error);
