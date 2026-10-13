// scripts/verify_live_billing_ui.js
const http = require('http');

async function runLiveVerification() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === id) {
          ws.removeEventListener('message', handler);
          if (d.error) reject(d.error);
          else resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  console.log('1. Reloading active browser tab...');
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Waiting for App Shell initialization...');
  const bootStart = Date.now();
  while (Date.now() - bootStart < 15000) {
    try {
      const state = await send('Runtime.evaluate', {
        expression: `(async () => {
          if (!firebase.auth().currentUser) {
            try {
              await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
            } catch(e) {}
          }
          if (!db && typeof boot === 'function') {
            await boot();
          }
          return {
            booted: !!window._appBooted,
            view: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
            main: !!document.getElementById('app-main')
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (state.result && state.result.value && state.result.value.booted) {
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 500));

  console.log('3. Navigating to Billing view...');
  await send('Runtime.evaluate', {
    expression: 'navigate("billing")',
    awaitPromise: true
  });
  await new Promise(r => setTimeout(r, 1500));

  console.log('4. Inspecting live Billing DOM state...');
  const stateRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const itemSel = document.getElementById("itemSelect");
      const chips = Array.from(document.querySelectorAll("#billingItemChips .billing-item-chip")).map(c => ({
        name: c.dataset.name,
        text: c.innerText.replace(/\\s+/g, ' ').trim(),
        active: c.classList.contains("active")
      }));
      const totalInp = document.getElementById("total");
      const displayTotal = document.getElementById("billingDisplayTotal");
      return {
        optionsCount: itemSel ? itemSel.options.length : 0,
        options: itemSel ? Array.from(itemSel.options).map(o => ({ value: o.value, text: o.innerText, name: o.dataset.name })) : [],
        chipsCount: chips.length,
        chips: chips,
        selectedValue: itemSel ? itemSel.value : null,
        selectedText: itemSel && itemSel.selectedIndex >= 0 ? itemSel.options[itemSel.selectedIndex].innerText : null,
        totalValue: totalInp ? totalInp.value : null,
        displayTotal: displayTotal ? displayTotal.innerText : null
      };
    })()`,
    returnByValue: true
  });

  const state = stateRes.result.value;
  console.log('Live Options Count:', state.optionsCount);
  console.log('Live Chips Count:', state.chipsCount);
  console.log('Default Selected Value:', state.selectedValue);
  console.log('Default Selected Text:', state.selectedText);
  console.log('Default Total Value:', state.totalValue);
  console.log('Default Display Total:', state.displayTotal);
  console.log('\nChips inventory:');
  state.chips.forEach((c, idx) => {
    console.log(`  [${idx + 1}] "${c.name}" -> ${c.text} (active: ${c.active})`);
  });

  // Verify assertions
  console.log('\nAssertions:');
  const hasCombined = state.chips.some(c => c.name === 'നൂൽജപം/അർച്ചന');
  console.log('  Has combined "നൂൽജപം/അർച്ചന" chip:', hasCombined);

  const combinedCount = state.chips.filter(c => c.name === 'നൂൽജപം/അർച്ചന').length;
  console.log('  Count of "നൂൽജപം/അർച്ചന" chips:', combinedCount === 1 ? 'EXACTLY 1 (PASS)' : `FAIL (${combinedCount})`);

  const hasSeparateNool = state.chips.some(c => c.name === 'നൂൽജപം');
  console.log('  Separate "നൂൽജപം" chip absent:', !hasSeparateNool ? 'PASS' : 'FAIL');

  const hasSeparateArchana = state.chips.some(c => c.name === 'അർച്ചന');
  console.log('  Separate "അർച്ചന" chip absent:', !hasSeparateArchana ? 'PASS' : 'FAIL');

  const hasNewPadukka = state.chips.some(c => c.name === 'മറുതക് ചെറിയ പടുക്ക');
  console.log('  Correct spelling "മറുതക് ചെറിയ പടുക്ക" present:', hasNewPadukka ? 'PASS' : 'FAIL');

  // Scroll chips into view and capture screenshot
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("billingItemChips").scrollIntoView({ block: "center" })'
  });
  await new Promise(r => setTimeout(r, 600));

  const fs = require('fs');
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('step_33_34a_billing_chips_scrolled.png', Buffer.from(ss.data, 'base64'));
  console.log('Saved step_33_34a_billing_chips_scrolled.png');

  ws.close();
}

runLiveVerification().catch(err => {
  console.error('Error running live verification:', err);
  process.exit(1);
});
