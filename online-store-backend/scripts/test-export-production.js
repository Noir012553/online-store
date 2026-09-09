'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'test-export-dynamic.js');
const args = [
  '--environment', 'production',
  '--target', 'frontend',
  '--limit', '100',
  '--max-wait-minutes', '30',
  '--request-timeout-seconds', '120',
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, [scriptPath, ...args], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
