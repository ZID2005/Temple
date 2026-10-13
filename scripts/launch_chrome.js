const { spawn } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile',
  '--window-size=1440,900',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:3000/Temple_Accounts-1.html?emulator=true'
];

console.log('Spawning Chrome on port 9222...');
const p = spawn(chromePath, args, { stdio: 'pipe' });

p.stdout.on('data', d => console.log(d.toString()));
p.stderr.on('data', d => console.log(d.toString()));

p.on('exit', (code) => {
  console.log('Chrome exited with code:', code);
  process.exit(code || 0);
});
