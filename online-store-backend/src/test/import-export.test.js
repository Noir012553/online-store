'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'test-export-dynamic.js');
const args = [
  '--environment', 'local',
  '--target', 'backend',
  '--format', 'json',
  '--mode', 'upsert',
  '--limit', '10',
  '--max-wait-minutes', '30',
  '--request-timeout-seconds', '120',
  '--poll-interval-seconds', '5',
  '--import',
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, [scriptPath, ...args], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
