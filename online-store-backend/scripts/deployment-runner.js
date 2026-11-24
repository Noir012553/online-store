const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 10_000;
const RUNNER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const JOB_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

const readConfig = () => {
  const routerUrl = process.env.DEPLOYMENT_ROUTER_URL;
  const runnerId = process.env.DEPLOYMENT_RUNNER_ID;
  const tokenPath = process.env.DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE;
  let parsed;
  try {
    parsed = new URL(routerUrl);
  } catch {
    throw new Error('Deployment runner URL is not configured.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Deployment runner URL must be an HTTPS origin.');
  }
  if (!RUNNER_ID_PATTERN.test(runnerId || '') || !tokenPath || !path.isAbsolute(tokenPath)) {
    throw new Error('Deployment runner configuration is invalid.');
  }
  const token = execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'read-dpapi-secret.ps1'), '-Path', tokenPath,
  ], { encoding: 'utf8', windowsHide: true }).trim();
  if (token.length < 16) throw new Error('Deployment runner token is invalid.');
  return { routerOrigin: parsed.origin, runnerId, token };
};

const requestControlPlane = async (config, route, options = {}) => {
  const response = await fetch(`${config.routerOrigin}${route}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${config.token}`,
      'x-deployment-runner-id': config.runnerId,
      ...(options.leaseVersion === undefined ? {} : { 'x-deployment-lease-version': String(options.leaseVersion) }),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Deployment control plane returned ${response.status}.`);
  return payload;
};

const runFixedAction = async (action) => {
  const scripts = {
    stopTunnelApps: ['stop-tunnel-apps.ps1', '-ConfirmStop'],
    startTunnelApps: ['start-tunnel-apps.ps1', '-ConfirmStart'],
  };
  const selected = scripts[action];
  if (!selected) throw new Error('Runner received a non-allowlisted action.');
  const scriptPath = path.join(__dirname, selected[0]);
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, selected[1],
  ], { windowsHide: true, timeout: 120_000, maxBuffer: 64 * 1024 });
};

const processJob = async (config, job) => {
  if (!job || !JOB_ID_PATTERN.test(job.id || '') || job.status !== 'processing'
    || !Number.isSafeInteger(job.leaseVersion)
    || !['stopTunnelApps', 'startTunnelApps'].includes(job.action)) {
    throw new Error('Deployment job is invalid.');
  }

  let result = 'failed';
  try {
    await runFixedAction(job.action);
    result = job.action === 'stopTunnelApps' ? 'stopped' : 'started';
  } catch {
    result = 'failed';
  }

  return requestControlPlane(config, `/__deployment/runner/job/${job.id}/complete`, {
    method: 'POST',
    leaseVersion: job.leaseVersion,
    body: { result },
  });
};

const run = async () => {
  if (process.platform !== 'win32') throw new Error('Deployment runner must run on Windows.');
  const config = readConfig();
  while (true) {
    try {
      await requestControlPlane(config, '/__deployment/runner/heartbeat', { method: 'POST' });
      const response = await requestControlPlane(config, '/__deployment/runner/job');
      if (response.job) await processJob(config, response.job);
    } catch (error) {
      console.error(`[DEPLOYMENT_RUNNER] ${error.message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`[DEPLOYMENT_RUNNER] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readConfig, requestControlPlane, runFixedAction, processJob };
