/**
 * test_transfer_delete_behavior.js
 * Test the exact Temple_Accounts-1.html logic against the emulator
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-temple-accounts-test';

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

// Extract functions from Temple_Accounts-1.html
const html = fs.readFileSync((fs.existsSync(path.join(__dirname, 'Temple_Accounts-1.html')) ? path.join(__dirname, 'Temple_Accounts-1.html') : path.join(__dirname, '..', 'Temple_Accounts-1.html')), 'utf8');

console.log('HTML loaded, size:', html.length);
