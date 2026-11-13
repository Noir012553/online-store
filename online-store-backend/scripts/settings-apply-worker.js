'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settingsStore = require('../src/services/adminSettingsDraftStore');

const execFileAsync = promisify(execFile);
const WORKER_ID = 'LaptopStoreSettingsApplyWorker';
const BACKEND_SERVICE = 'LaptopStoreBackend';
const BACKEND_HEALTH_URL = 'http://127.0.0.1:5000/readyz';
const SC_EXE = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'sc.exe');
const HEARTBEAT_INTERVAL_MS = 4000;
const POLL_INTERVAL_MS = 3000;
const SERVICE_TIMEOUT_MS = 45000;
const HEALTH_TIMEOUT_MS = 90000;
const programData = process.env.ProgramData;
const privateKeyPath = programData
  ? path.win32.join(programData, 'LaptopStore', 'services', WORKER_ID, 'heartbeat-private.pem')
  : null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const createProcessAdapter = ({ exec = execFileAsync, fetchImpl = globalThis.fetch, clock = Date.now } = {}) => {
  const runSc = async args => {
    const result = await exec(SC_EXE, args, { windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024 });
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  };

  const serviceState = async () => {
    const output = await runSc(['query', BACKEND_SERVICE]);
    const match = output.match(/STATE\s*:\s*(\d+)/i);
    if (!match) throw new Error('Fixed backend service state could not be verified.');
    return Number(match[1]);
  };

  const waitForServiceState = async (expected, timeoutMs = SERVICE_TIMEOUT_MS) => {
    const deadline = clock() + timeoutMs;
    while (clock() < deadline) {
      if (await serviceState() === expected) return;
      await sleep(500);
    }
    throw new Error('Fixed backend service did not reach the required state.');
  };

  const restartBackend = async () => {
    const state = await serviceState();
    if (state !== 1) {
      await runSc(['stop', BACKEND_SERVICE]);
      await waitForServiceState(1);
    }
    await runSc(['start', BACKEND_SERVICE]);
    await waitForServiceState(4);
  };

  const waitForHealthyVersion = async (version, timeoutMs = HEALTH_TIMEOUT_MS) => {
    if (typeof fetchImpl !== 'function') throw new Error('Health check HTTP client is unavailable.');
    const deadline = clock() + timeoutMs;
    while (clock() < deadline) {
      try {
        const response = await fetchImpl(BACKEND_HEALTH_URL, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
        if (response.ok) {
          const body = await response.json();
          if (body.status === 'ready' && body.activeSettingsVersion === version) return body;
        }
      } catch {}
      await sleep(1000);
    }
    throw new Error('Backend health/version check did not confirm the requested settings version.');
  };

  return { restartBackend, waitForHealthyVersion };
};

const createHeartbeatPublisher = ({ store = settingsStore, privateKey, clock = Date.now } = {}) => async () => {
  const payload = { workerId: WORKER_ID, timestamp: clock(), version: 1 };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
  await store.publishWorkerHeartbeat({ workerId: payload.workerId, timestamp: payload.timestamp, signature });
};

const processOneJob = async ({ store = settingsStore, adapter = createProcessAdapter() } = {}) => {
  const job = await store.claimApplyJob();
  if (!job) return false;
  let activated = job.status === 'applying' || job.status === 'rolling-back';
  let rollingBack = job.status === 'rolling-back';
  try {
    store.normalizeSettings(job.settings);
    if (rollingBack) {
      await adapter.restartBackend();
      await adapter.waitForHealthyVersion(job.previousActive?.version || 0);
      await store.completeApplyJob(job.id, {
        succeeded: false,
        rollbackVerified: true,
        message: 'Apply failed; the previous settings version was restored and verified.',
      });
      return true;
    }
    if (!activated) {
      await store.activateClaimedJob(job.id);
      activated = true;
    }
    await adapter.restartBackend();
    await adapter.waitForHealthyVersion(job.version);
    await store.completeApplyJob(job.id, {
      succeeded: true,
      message: 'Settings activated and backend health/version check succeeded.',
    });
  } catch (error) {
    let rollbackVerified = !activated;
    if (activated) {
      if (!rollingBack) {
        await store.beginApplyRollback(job.id);
        rollingBack = true;
      }
      rollbackVerified = false;
      try {
        const previousVersion = job.previousActive?.version || 0;
        await adapter.restartBackend();
        await adapter.waitForHealthyVersion(previousVersion);
        rollbackVerified = true;
      } catch {
        console.error('[SettingsApplyWorker] Rollback restart/health verification failed; backend requires operator review.');
      }
    }
    await store.completeApplyJob(job.id, {
      succeeded: false,
      rollbackVerified,
      message: rollbackVerified
        ? 'Apply failed; the previous settings version was restored and verified.'
        : 'Apply failed and rollback could not be verified; operator review is required.',
    });
    console.error('[SettingsApplyWorker] Apply job failed', { jobId: job.id, reason: error?.message || 'unknown' });
  }
  return true;
};

const runWorker = async ({ store = settingsStore, adapter = createProcessAdapter(), heartbeat = null, sleepImpl = sleep } = {}) => {
  if (process.platform !== 'win32' || !privateKeyPath) throw new Error('The fixed settings apply worker requires its installed Windows service identity.');
  const privateKeyStat = fs.lstatSync(privateKeyPath);
  if (!privateKeyStat.isFile() || privateKeyStat.isSymbolicLink()) throw new Error('Worker heartbeat signing key is unavailable.');
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const publish = heartbeat || createHeartbeatPublisher({ store, privateKey });
  let stopping = false;
  let heartbeatInFlight = false;
  const stop = () => { stopping = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await publish();
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight || stopping) return;
    heartbeatInFlight = true;
    Promise.resolve(publish())
      .catch(error => console.error('[SettingsApplyWorker] Heartbeat update failed', { reason: error?.message || 'unknown' }))
      .finally(() => { heartbeatInFlight = false; });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  try {
    while (!stopping) {
      try {
        await processOneJob({ store, adapter });
      } catch (error) {
        console.error('[SettingsApplyWorker] Job poll failed; worker will retry', { reason: error?.message || 'unknown' });
      }
      await sleepImpl(POLL_INTERVAL_MS);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
};

if (require.main === module) {
  runWorker().catch(error => {
    console.error('[SettingsApplyWorker] Worker stopped safely', { reason: error?.message || 'unknown' });
    process.exitCode = 1;
  });
}

module.exports = { BACKEND_HEALTH_URL, BACKEND_SERVICE, SC_EXE, createHeartbeatPublisher, createProcessAdapter, processOneJob, runWorker };
