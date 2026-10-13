const { spawn } = require('child_process');
const path = require('path');

const testScript = process.argv[2];
if (!testScript) {
  console.error('Usage: node run_disposable_test.js <path_to_test_script>');
  process.exit(1);
}

const targetPath = path.isAbsolute(testScript) ? testScript : path.resolve(process.cwd(), testScript);

const env = {
  ...process.env,
  EMULATOR_HOST: '127.0.0.1',
  FIRESTORE_PORT: '8280',
  AUTH_PORT: '9199',
  PROJECT_ID: 'demo-temple-accounts-step-33-32'
};

console.log('========================================================================');
console.log('  DISPOSABLE EMULATOR TEST RUNNER');
console.log(`  Target Script:  ${targetPath}`);
console.log(`  Target Project: ${env.PROJECT_ID}`);
console.log(`  Firestore:      http://${env.EMULATOR_HOST}:${env.FIRESTORE_PORT}`);
console.log(`  Auth:           http://${env.EMULATOR_HOST}:${env.AUTH_PORT}`);
console.log('========================================================================\n');

const proc = spawn('node', [targetPath], { env, stdio: 'inherit' });
proc.on('exit', (code) => {
  console.log(`\n[DISPOSABLE RUNNER] Completed with exit code ${code}`);
  process.exit(code || 0);
});
