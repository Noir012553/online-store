'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const commandExists = command => {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const isPortOpen = port => new Promise(resolve => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => { socket.destroy(); resolve(false); });
});

const findUnixPortPids = port => {
  if (!commandExists('lsof')) return [];
  try {
    return execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' })
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger);
  } catch {
    return [];
  }
};

const stopPortProcesses = async port => {
  for (const pid of findUnixPortPids(port)) {
    try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  for (let attempt = 0; attempt < 10 && await isPortOpen(port); attempt += 1) await sleep(500);
};

const serviceIsActive = () => commandExists('systemctl') && spawnSync('systemctl', ['is-active', '--quiet', 'laptop-store-backend']).status === 0;
const stopService = async port => {
  if (serviceIsActive()) {
    execFileSync('sudo', ['systemctl', 'stop', 'laptop-store-backend'], { stdio: 'inherit' });
    return;
  }
  if (commandExists('pm2')) {
    spawnSync('pm2', ['stop', 'laptop-store-backend'], { stdio: 'inherit' });
    await sleep(2000);
    return;
  }
  await stopPortProcesses(port);
};

const startService = async () => {
  if (commandExists('systemctl')) {
    execFileSync('sudo', ['systemctl', 'start', 'laptop-store-backend'], { stdio: 'inherit' });
    return;
  }
  if (commandExists('pm2')) {
    spawnSync('pm2', ['start', 'ecosystem.config.js', '--name', 'laptop-store-backend'], { cwd: projectRoot, stdio: 'inherit' });
    return;
  }
  const output = fs.openSync('/tmp/backend.log', 'a');
  const child = spawn(process.execPath, ['src/app.js'], { cwd: projectRoot, detached: true, stdio: ['ignore', output, output], env: process.env });
  child.unref();
};

const waitForHealth = async baseUrl => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/readyz`);
      if (response.ok) return true;
    } catch {}
    await sleep(2000);
  }
  return false;
};

(async () => {
  const port = Number(process.env.PORT || 5000);
  const storage = process.env.EXPORT_STORAGE || 'local';
  const exportJobDir = process.env.EXPORT_JOB_DIR || '/var/lib/laptop-store/export-jobs';
  const baseUrl = (process.env.BACKEND_URL || `http://localhost:${port}`).replace(/\/$/, '');

  if (!fs.existsSync(path.join(projectRoot, '.env'))) throw new Error('.env file not found');
  if (storage === 'local') {
    fs.mkdirSync(exportJobDir, { recursive: true });
    fs.accessSync(exportJobDir, fs.constants.W_OK);
  } else if (storage === 's3') {
    if (!process.env.EXPORT_S3_BUCKET || !(process.env.EXPORT_S3_REGION || process.env.AWS_REGION)) {
      throw new Error('EXPORT_S3_BUCKET and EXPORT_S3_REGION/AWS_REGION are required for S3 export storage');
    }
  } else {
    throw new Error(`Unsupported EXPORT_STORAGE: ${storage}`);
  }

  console.log('========== SAFE SEEDING DEPLOYMENT ==========');
  if (await isPortOpen(port)) {
    console.log(`Port ${port} is in use, stopping API server...`);
    await stopService(port);
    if (await isPortOpen(port)) throw new Error('Failed to stop API server');
  } else {
    console.log(`Port ${port} is free`);
  }

  console.log('Running seed with exposed GC...');
  const seed = spawnSync(process.execPath, ['--expose-gc', 'src/seed.js'], { cwd: projectRoot, env: process.env, stdio: 'inherit' });
  if (seed.status !== 0) throw new Error(`Seed failed with exit code ${seed.status}`);

  console.log('Restarting API server...');
  await startService();
  const healthy = await waitForHealth(baseUrl);
  if (!healthy) console.warn('Server may still be starting; health check did not pass within the timeout');
  else console.log('Server health check passed');

  try {
    const cacheResponse = await fetch(`${baseUrl}/health/cache`);
    console.log('Cache status:', await cacheResponse.text());
  } catch (error) {
    console.warn(`Could not retrieve cache status: ${error.message}`);
  }
  console.log('========== DEPLOYMENT COMPLETE ==========');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
