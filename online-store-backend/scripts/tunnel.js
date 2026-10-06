'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const executable = isWindows ? path.join(backendRoot, 'cloudflared.exe') : 'cloudflared';
const config = path.join(backendRoot, '.cloudflared', isWindows ? 'config.windows.yml' : 'config.yaml');

if (isWindows && !fs.existsSync(executable)) {
  throw new Error(`cloudflared binary not found: ${executable}`);
}

const tokenFile = process.env.CLOUDFLARED_TUNNEL_TOKEN_FILE?.trim()
  || (isWindows ? path.join(os.homedir(), '.cloudflared', 'online-store.token') : null);
const tokenFromFile = tokenFile && fs.existsSync(tokenFile)
  ? fs.readFileSync(tokenFile, 'utf8').trim()
  : '';
const token = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim() || tokenFromFile;

if (isWindows && !token) {
  throw new Error(`Cloudflare tunnel token not found. Create ${tokenFile} or set CLOUDFLARED_TUNNEL_TOKEN`);
}

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
