const { execSync } = require('child_process');
const fs = require('fs');
const url = process.argv[2] || 'file:///D:/Temple/tests/typography_test.html';
const out = process.argv[3] || 'D:/Temple/tests/typography_candidates.png';
const width = process.argv[4] || 1280;
const height = process.argv[5] || 1000;

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
execSync(`"${chrome}" --headless=new --disable-gpu --window-size=${width},${height} "--screenshot=${out}" "${url}"`);
console.log('Saved:', out, fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'FAILED');
