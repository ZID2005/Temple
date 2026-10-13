const { spawn } = require('child_process');
const path = require('path');

const javaHome = 'C:\\Users\\sanal\\.antigravity-ide\\extensions\\redhat.java-1.56.0-win32-x64\\jre\\21.0.12.1-win32-x86_64';
const env = { ...process.env };
env.JAVA_HOME = javaHome;
env.PATH = `${path.join(javaHome, 'bin')};${env.PATH || ''}`;

const firebaseCli = 'C:\\Users\\sanal\\AppData\\Local\\npm-cache\\_npx\\7750544ccf494d8b\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

console.log('Starting disposable Firebase emulator with Java 21...');
console.log('Project ID: demo-temple-accounts-step-33-32');
console.log('Config: firebase.json');

const proc = spawn('node', [
  firebaseCli,
  'emulators:start',
  '--only', 'firestore,auth',
  '--project', 'demo-temple-accounts-step-33-32',
  '--config', 'firebase.json'
], {
  cwd: __dirname,
  env,
  stdio: 'inherit'
});

proc.on('exit', (code) => {
  console.log(`Disposable emulator process exited with code ${code}`);
  process.exit(code || 0);
});
