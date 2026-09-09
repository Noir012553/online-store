'use strict';

const path = require('path');
const { spawn } = require('child_process');

const executable = path.join(__dirname, '..', 'cloudflared.exe');
const config = path.join(__dirname, '..', '.cloudflared', 'config.windows.yml');
const child = spawn(executable, ['tunnel', '--protocol', 'auto', '--ha-connections', '2', '--config', config, 'run'], {
  cwd: path.resolve(__dirname, '..'),
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
