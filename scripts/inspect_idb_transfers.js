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
          // Open IndexedDB temple_accounts_db directly and inspect transfers store
          const idbRecords = await new Promise((resolve, reject) => {
            const req = indexedDB.open('temple_accounts_db', 3);
            req.onsuccess = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('transfers')) {
                resolve({ error: 'no transfers store' });
                return;
              }
              const tx = db.transaction('transfers', 'readonly');
              const store = tx.objectStore('transfers');
              const keyReq = store.getAllKeys();
              const valReq = store.getAll();
              keyReq.onsuccess = () => {
                valReq.onsuccess = () => {
                  resolve({
                    keyPath: store.keyPath,
                    autoIncrement: store.autoIncrement,
                    keys: keyReq.result,
                    records: valReq.result
                  });
                };
              };
            };
            req.onerror = (e) => resolve({ error: e.target.error.message });
          });
          return idbRecords;
        })()`,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.result && data.result.result) {
      console.log('IndexedDB Transfers Store:', JSON.stringify(data.result.result.value, null, 2));
    }
    ws.close();
    process.exit(0);
  };
}

main();
