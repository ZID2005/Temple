const { spawn } = require('child_process');
const path = require('path');

const javaHome = 'C:\\Users\\sanal\\.antigravity-ide\\extensions\\redhat.java-1.57.0-win32-x64\\jre\\25.0.4.1-win32-x86_64';
const env = { ...process.env };
env.JAVA_HOME = javaHome;
env.PATH = `${path.join(javaHome, 'bin')};${env.PATH || ''}`;

const firebaseCli = 'C:\\Users\\sanal\\AppData\\Local\\npm-cache\\_npx\\7750544ccf494d8b\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

console.log('Spawning Firebase CLI with piped output...');

const proc = spawn('node', [
  firebaseCli,
  'emulators:start',
  '--only', 'firestore,auth',
  '--project', 'demo-temple-accounts-test',
  '--config', 'firebase.emulator.json',
  '--non-interactive'
], {
  cwd: path.resolve(__dirname, '..'),
  env
});

proc.stdout.on('data', data => {
  process.stdout.write('[EMU] ' + data.toString());
});

proc.stderr.on('data', data => {
  process.stderr.write('[EMU ERR] ' + data.toString());
});

proc.on('error', err => {
  console.error('[EMU SPAWN ERR]', err);
});

proc.on('exit', (code, sig) => {
  console.log(`[EMU EXIT] code: ${code}, signal: ${sig}`);
});
