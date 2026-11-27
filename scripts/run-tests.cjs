const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const electronExe =
  process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(rootDir, 'node_modules', '.bin', 'electron');
const testEntry = path.join(__dirname, 'test-e2e.cjs');
const reportPath = path.join(os.tmpdir(), `celsketch-e2e-${Date.now()}.json`);

const res = spawnSync(electronExe, [testEntry], {
  env: { ...process.env, CELSKETCH_TEST_REPORT: reportPath },
  stdio: 'inherit'
});

if (!fs.existsSync(reportPath)) {
  console.error('E2E test failed: no report written (exit code ' + res.status + ')');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
try {
  fs.unlinkSync(reportPath);
} catch {
  // ignore cleanup
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('CelSketch E2E test suite FAILED.');
  process.exit(1);
}
console.log('CelSketch E2E test suite PASSED!');
process.exit(0);
