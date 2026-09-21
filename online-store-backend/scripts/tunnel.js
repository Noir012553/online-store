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

const token = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim();
const args = token
  ? ['tunnel', 'run', '--token', token]
  : ['tunnel', '--protocol', 'auto', '--ha-connections', '2', '--config', config, 'run'];

if (!token && !fs.existsSync(config)) {
  throw new Error(`Cloudflare tunnel config not found: ${config}`);
}

const childEnv = { ...process.env };
delete childEnv.CLOUDFLARED_TUNNEL_TOKEN;

const child = spawn(executable, args, {
  cwd: backendRoot,
  env: childEnv,
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
