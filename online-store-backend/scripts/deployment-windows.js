'use strict';

const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const serviceIds = ['LaptopStoreBackend', 'LaptopStoreFrontend'];
const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

const readDpapiSecret = filePath => {
  if (process.platform !== 'win32') throw new Error('DPAPI secrets can only be read on Windows.');
  const encodedPath = Buffer.from(filePath, 'utf8').toString('base64');
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    `$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))`,
    '$protected = [IO.File]::ReadAllBytes($path)',
    '$secret = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)',
    'try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($secret)) } finally { [Array]::Clear($secret, 0, $secret.Length); [Array]::Clear($protected, 0, $protected.Length) }',
  ].join('; ');
  return execFileSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command,
  ], { encoding: 'utf8', windowsHide: true }).trim();
};

const getServiceState = async serviceId => {
  const { stdout } = await execFileAsync('sc.exe', ['query', serviceId], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  const match = stdout.match(/\bSTATE\s*:\s*(\d+)/i);
  if (!match) throw new Error(`Could not determine the state of service ${serviceId}.`);
  const state = Number(match[1]);
  if (state === 4) return 'running';
  if (state === 1) return 'stopped';
  return 'pending';
};

const waitForServiceState = async (serviceId, expectedState, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await getServiceState(serviceId) === expectedState) return;
    await sleep(1_000);
  }
  throw new Error(`Service ${serviceId} did not reach ${expectedState}.`);
};

const invokeServiceCommand = async (command, serviceId) => {
  await execFileAsync('sc.exe', [command, serviceId], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  });
};

const stopTunnelApps = async () => {
  const services = await Promise.all(serviceIds.map(async id => ({ id, state: await getServiceState(id) })));
  if (services.some(service => service.state === 'pending')) {
    throw new Error('A managed application service is in a pending state.');
  }
  const stopped = [];
  try {
    for (const service of services.filter(item => item.state === 'running')) {
      await invokeServiceCommand('stop', service.id);
      stopped.push(service.id);
      await waitForServiceState(service.id, 'stopped', 45_000);
    }
  } catch (error) {
    for (const serviceId of stopped.reverse()) {
      try {
        await invokeServiceCommand('start', serviceId);
        await waitForServiceState(serviceId, 'running', 45_000);
      } catch {
        console.error(`[DEPLOYMENT_RUNNER] Rollback could not restart ${serviceId}. Manual recovery is required.`);
      }
    }
    throw error;
  }
};

const startTunnelApps = async () => {
  const services = await Promise.all(serviceIds.map(async id => ({ id, state: await getServiceState(id) })));
  if (services.some(service => service.state === 'pending')) {
    throw new Error('A managed application service is in a pending state.');
  }
  const started = [];
  try {
    for (const service of services.filter(item => item.state === 'stopped')) {
      await invokeServiceCommand('start', service.id);
      started.push(service.id);
      await waitForServiceState(service.id, 'running', 60_000);
    }
  } catch (error) {
    for (const serviceId of started.reverse()) {
      try {
        await invokeServiceCommand('stop', serviceId);
        await waitForServiceState(serviceId, 'stopped', 45_000);
      } catch {
        console.error(`[DEPLOYMENT_RUNNER] Rollback could not stop ${serviceId}. Manual recovery is required.`);
      }
    }
    throw error;
  }
};

if (require.main === module) {
  const [action, confirmation] = process.argv.slice(2);
  const actions = {
    stop: { run: stopTunnelApps, confirmation: '--confirm-stop' },
    start: { run: startTunnelApps, confirmation: '--confirm-start' },
  };
  const selected = actions[action];
  if (process.platform !== 'win32' || !selected || confirmation !== selected.confirmation) {
    console.error('Usage: node deployment-windows.js <stop|start> <matching-confirmation-flag> (Windows only)');
    process.exitCode = 1;
  } else {
    selected.run().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { readDpapiSecret, startTunnelApps, stopTunnelApps };
