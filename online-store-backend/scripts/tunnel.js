'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const executable = isWindows ? path.join(backendRoot, 'cloudflared.exe') : 'cloudflared';
const config = path.join(backendRoot, '.cloudflared', isWindows ? 'config.windows.yml' : 'config.yaml');

if (isWindows && !fs.existsSync(executable)) {
  throw new Error(`cloudflared binary not found: ${executable}`);
}
if (!fs.existsSync(config)) {
  throw new Error(`Cloudflare tunnel config not found: ${config}`);
}

const child = spawn(executable, ['tunnel', '--protocol', 'auto', '--ha-connections', '2', '--config', config, 'run'], {
  cwd: backendRoot,
  stdio: 'inherit',
});

child.on('error', error => {
  console.error(`Unable to start cloudflared: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
