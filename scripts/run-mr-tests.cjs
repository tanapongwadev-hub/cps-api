// Run jest tests for materials-receiving via child_process
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/jest/bin/jest.js'), '--testPathPatterns=materials-receiving', '--verbose', '--no-coverage'],
  { cwd: root, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 },
);
console.log('STDOUT:');
console.log(result.stdout);
console.log('STDERR:');
console.log(result.stderr);
console.log('EXIT:', result.status);
