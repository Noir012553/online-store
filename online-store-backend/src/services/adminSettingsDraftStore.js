'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { editableSettingRegistry, isValidEditableSetting } = require('./adminSettingsRegistry');

const STORE_FILENAME = 'admin-settings-v1.dpapi';
const LOCK_FILENAME = 'admin-settings-v1.lock';
const RECOVERY_LOCK_FILENAME = 'admin-settings-v1-recovery.lock';
const POWERSHELL_RELATIVE_PATH = path.win32.join('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_SECRET_CHARS = 8192;
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;
const WORKER_PUBLIC_KEY_FILENAME = 'settings-worker-heartbeat-public.pem';
const WORKER_ID = 'LaptopStoreSettingsApplyWorker';
const HEARTBEAT_MAX_AGE_MS = 15000;

class SettingsStoreError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = 'SettingsStoreError';
    this.errorCode = code;
    this.statusCode = statusCode;
    this.exposeMessage = true;
  }
}

const unavailable = message => new SettingsStoreError('SETTINGS_STORE_UNAVAILABLE', 503, message);
const invalid = message => new SettingsStoreError('SETTINGS_INVALID', 400, message);
const conflict = message => new SettingsStoreError('SETTINGS_VERSION_CONFLICT', 409, message);

const isSecret = key => editableSettingRegistry[key].secret === true;

const normalizeSettings = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw invalid('Settings must be a plain object.');
  }
  const keys = Object.keys(input);
  const unknownKeys = keys.filter(key => !Object.hasOwn(editableSettingRegistry, key));
  if (unknownKeys.length) throw invalid('Request contains settings that are not editable.');

  const settings = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value !== 'string') throw invalid(`Setting ${key} must be a string.`);
    const definition = editableSettingRegistry[key];
    if (definition.secret && value.trim() === '') continue;
    if (value.length > (definition.secret ? MAX_SECRET_CHARS : 2048)) throw invalid(`Setting ${key} is too long.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw invalid(`Setting ${key} contains invalid characters.`);
    if (!isValidEditableSetting(key, value)) throw invalid(`Setting ${key} has an invalid value.`);
    settings[key] = definition.secret ? value : value.trim();
  }
  return settings;
};

const getStorePaths = () => {
  if (process.platform !== 'win32') return null;
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const expectedProgramData = path.win32.join(path.win32.parse(systemRoot).root, 'ProgramData');
  const configuredProgramData = process.env.ProgramData;
  if (!configuredProgramData || !path.win32.isAbsolute(configuredProgramData) || configuredProgramData.startsWith('\\\\')) return null;
  const root = path.win32.resolve(configuredProgramData);
  if (root.toLowerCase() !== expectedProgramData.toLowerCase()) return null;
  const directory = path.win32.join(root, 'LaptopStore', 'secrets', 'settings');
  return {
    root,
    directory,
    directories: [root, path.win32.join(root, 'LaptopStore'), path.win32.join(root, 'LaptopStore', 'secrets'), directory],
    store: path.win32.join(directory, STORE_FILENAME),
    lock: path.win32.join(directory, LOCK_FILENAME),
    recoveryLock: path.win32.join(directory, RECOVERY_LOCK_FILENAME),
    temporary: null,
    powershell: path.win32.join(systemRoot, POWERSHELL_RELATIVE_PATH),
  };
};

const getAvailability = () => {
  const paths = getStorePaths();
  if (!paths) return { available: false, reason: 'windows-host-required' };
  try {
    for (const directoryPath of paths.directories) {
      const directory = fs.lstatSync(directoryPath);
      if (!directory.isDirectory() || directory.isSymbolicLink()) {
        return { available: false, reason: 'storage-prerequisites-not-ready' };
      }
    }
    const powershell = fs.lstatSync(paths.powershell);
    if (!powershell.isFile() || powershell.isSymbolicLink()) {
      return { available: false, reason: 'storage-prerequisites-not-ready' };
    }
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: 'storage-prerequisites-not-ready' };
  }
};

const requirePaths = () => {
  const availability = getAvailability();
  if (!availability.available) throw unavailable('Encrypted settings storage is unavailable on this host.');
  return getStorePaths();
};

const runDpapi = (mode, input) => {
  const paths = requirePaths();
  const script = mode === 'protect'
    ? "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine); [Console]::Out.Write([Convert]::ToBase64String($p)); [Array]::Clear($b,0,$b.Length)"
    : "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine); [Console]::Out.Write([Convert]::ToBase64String($p)); [Array]::Clear($b,0,$b.Length)";
  const result = spawnSync(paths.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    input: Buffer.from(input).toString('base64'),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    maxBuffer: MAX_STATE_BYTES * 2,
  });
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw unavailable('Windows DPAPI is unavailable for settings storage.');
  }
  try {
    return Buffer.from(result.stdout.trim(), 'base64');
  } catch {
    throw unavailable('Windows DPAPI returned an invalid settings payload.');
  }
};

const readState = paths => {
  let encrypted;
  try {
    const stat = fs.lstatSync(paths.store);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) throw unavailable('Encrypted settings state is invalid.');
    encrypted = fs.readFileSync(paths.store);
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 0, draft: null, active: null, jobs: [], audit: [] };
    if (error instanceof SettingsStoreError) throw error;
    throw unavailable('Encrypted settings state cannot be read.');
  }
  const plaintext = runDpapi('unprotect', encrypted);
  try {
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || parsed.schema !== 1 || !Number.isSafeInteger(parsed.version) || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.audit)) {
      throw unavailable('Encrypted settings state has an unsupported format.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SettingsStoreError) throw error;
    throw unavailable('Encrypted settings state could not be decrypted.');
  } finally {
    plaintext.fill(0);
  }
};

const writeState = (paths, state) => {
  const plaintext = Buffer.from(JSON.stringify({ schema: 1, ...state }), 'utf8');
  if (plaintext.length > MAX_STATE_BYTES) {
    plaintext.fill(0);
    throw unavailable('Settings state exceeds the safe storage limit.');
  }
  let encrypted;
  try {
    encrypted = runDpapi('protect', plaintext);
  } finally {
    plaintext.fill(0);
  }
  const temporary = path.win32.join(paths.directory, `admin-settings-v1-${crypto.randomBytes(12).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, encrypted);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, paths.store);
  } catch (error) {
    if (descriptor !== undefined && descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(temporary); } catch {}
    throw unavailable('Encrypted settings state cannot be written.');
  } finally {
    encrypted.fill(0);
  }
};

const createLock = lockPath => {
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeSync(descriptor, `${process.pid}\n`);
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    }
    throw error;
  }
};

const recoverStaleLock = paths => {
  let recoveryDescriptor;
  try {
    recoveryDescriptor = createLock(paths.recoveryLock);
  } catch {
    return false;
  }
  try {
    let ownerPid;
    try { ownerPid = Number(fs.readFileSync(paths.lock, 'utf8').trim()); } catch { return false; }
    if (!Number.isSafeInteger(ownerPid) || ownerPid < 1) return false;
    try {
      process.kill(ownerPid, 0);
      return false;
    } catch (error) {
      if (error.code !== 'ESRCH') return false;
    }
    try {
      fs.unlinkSync(paths.lock);
      return true;
    } catch (error) {
      return error.code === 'ENOENT';
    }
  } finally {
    try { fs.closeSync(recoveryDescriptor); } catch {}
    try { fs.unlinkSync(paths.recoveryLock); } catch {}
  }
};

const withLock = async operation => {
  const paths = requirePaths();
  let descriptor;
  try {
    descriptor = createLock(paths.lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw unavailable('Settings storage lock is unavailable.');
    if (!recoverStaleLock(paths)) throw conflict('Another settings operation is in progress.');
    try {
      descriptor = createLock(paths.lock);
    } catch (retryError) {
      if (retryError.code === 'EEXIST') throw conflict('Another settings operation is in progress.');
      throw unavailable('Settings storage lock is unavailable.');
    }
  }
  try {
    return await operation(paths);
  } finally {
    try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(paths.lock); } catch {}
  }
};

const draftSummary = draft => {
  if (!draft) return null;
  const settings = {};
  for (const [key, value] of Object.entries(draft.settings)) {
    settings[key] = isSecret(key) ? { configured: Boolean(value) } : value;
  }
  return { version: draft.version, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, settings };
};

const auditRecord = (action, userId, version, keys, jobId = null) => ({
  action,
  userId: String(userId),
  version,
  keys: [...keys].sort(),
  jobId,
  timestamp: new Date().toISOString(),
});

const getDraft = async () => {
  const paths = requirePaths();
  return draftSummary(readState(paths).draft);
};

const saveDraft = async ({ expectedVersion, settings, userId }) => {
  const updates = normalizeSettings(settings);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw invalid('expectedVersion must be a non-negative integer.');
  return withLock(async paths => {
    const state = readState(paths);
    const currentVersion = state.draft?.version || 0;
    if (currentVersion !== expectedVersion) throw conflict('Draft version does not match expectedVersion.');
    const merged = { ...(state.draft?.settings || {}), ...updates };
    const version = currentVersion + 1;
    const draft = {
      version,
      updatedAt: new Date().toISOString(),
      updatedBy: String(userId),
      settings: merged,
    };
    const audit = auditRecord('draft-saved', userId, version, Object.keys(updates));
    writeState(paths, { ...state, version, draft, audit: [...state.audit, audit].slice(-200) });
    console.info('[AdminSettings] Draft saved', { userId: String(userId), version, keys: audit.keys });
    return draftSummary(draft);
  });
};

const getWorkerStatusFromState = (paths, state, now = Date.now()) => {
  try {
    const publicKeyPath = path.win32.join(paths.root, 'LaptopStore', 'services', WORKER_ID, WORKER_PUBLIC_KEY_FILENAME);
    const keyStat = fs.lstatSync(publicKeyPath);
    if (!keyStat.isFile() || keyStat.isSymbolicLink()) return { available: false, reason: 'worker-key-unavailable' };
    const heartbeat = state.workerHeartbeat;
    if (!heartbeat || heartbeat.workerId !== WORKER_ID || !Number.isSafeInteger(heartbeat.timestamp)) {
      return { available: false, reason: 'worker-heartbeat-missing' };
    }
    const ageMs = now - heartbeat.timestamp;
    if (ageMs < -5000 || ageMs > HEARTBEAT_MAX_AGE_MS) return { available: false, reason: 'worker-heartbeat-stale' };
    const signed = Buffer.from(JSON.stringify({ workerId: heartbeat.workerId, timestamp: heartbeat.timestamp, version: 1 }));
    const signature = Buffer.from(heartbeat.signature || '', 'base64');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    if (!crypto.verify(null, signed, publicKey, signature)) return { available: false, reason: 'worker-heartbeat-invalid' };
    return { available: true, reason: null, lastHeartbeatAt: new Date(heartbeat.timestamp).toISOString() };
  } catch {
    return { available: false, reason: 'worker-key-unavailable' };
  }
};

const getWorkerStatus = () => {
  const paths = getStorePaths();
  if (!paths || !getAvailability().available) return { available: false, reason: 'settings-store-unavailable' };
  try {
    return getWorkerStatusFromState(paths, readState(paths));
  } catch {
    return { available: false, reason: 'settings-store-unavailable' };
  }
};

const createApplyJob = async ({ expectedVersion, userId }) => {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw invalid('expectedVersion must be a positive integer.');
  return withLock(async paths => {
    const state = readState(paths);
    if (!getWorkerStatusFromState(paths, state).available) throw unavailable('Settings apply worker is unavailable or its authenticated heartbeat is stale.');
    if (!state.draft || state.draft.version !== expectedVersion) throw conflict('Draft version does not match expectedVersion.');
    if (state.jobs.some(job => ['queued', 'claimed', 'applying', 'rolling-back'].includes(job.status))) {
      throw conflict('Another settings apply job is already in progress.');
    }
    const job = {
      id: crypto.randomBytes(16).toString('hex'),
      status: 'queued',
      applied: false,
      version: state.draft.version,
      settings: { ...state.draft.settings },
      createdAt: new Date().toISOString(),
      createdBy: String(userId),
      completedAt: null,
      message: 'Apply request queued for the fixed settings worker.',
    };
    const audit = auditRecord('apply-request-queued', userId, state.draft.version, Object.keys(state.draft.settings), job.id);
    writeState(paths, { ...state, jobs: [...state.jobs, job].slice(-100), audit: [...state.audit, audit].slice(-200) });
    console.info('[AdminSettings] Apply request queued', { userId: String(userId), version: job.version, jobId: job.id, keys: audit.keys });
    return publicJob(job);
  });
};

const publicJob = job => {
  if (!job) return null;
  return Object.fromEntries(Object.entries(job).filter(([key]) => !['settings', 'previousActive'].includes(key)));
};

const getApplyJob = async id => {
  if (!JOB_ID_PATTERN.test(id)) throw invalid('Apply job id is invalid.');
  const paths = requirePaths();
  return publicJob(readState(paths).jobs.find(entry => entry.id === id));
};

const claimApplyJob = async () => withLock(async paths => {
  const state = readState(paths);
  if (!getWorkerStatusFromState(paths, state).available) return null;
  const staleBefore = Date.now() - 120000;
  let index = state.jobs.findIndex(job => job.status === 'queued');
  if (index < 0) {
    index = state.jobs.findIndex(job => ['claimed', 'applying', 'rolling-back'].includes(job.status)
      && Number.isFinite(Date.parse(job.claimedAt || job.startedAt))
      && Date.parse(job.claimedAt || job.startedAt) < staleBefore);
  }
  if (index < 0) return null;
  const existing = state.jobs[index];
  const job = { ...existing, status: 'claimed', claimedAt: new Date().toISOString(), previousActive: existing.previousActive ?? state.active ?? null };
  const jobs = [...state.jobs];
  jobs[index] = job;
  writeState(paths, { ...state, jobs });
  return { ...job };
});

const activateClaimedJob = async jobId => withLock(async paths => {
  const state = readState(paths);
  const index = state.jobs.findIndex(job => job.id === jobId && job.status === 'claimed');
  if (index < 0) throw conflict('Apply job is not claimable.');
  const job = { ...state.jobs[index], status: 'applying', startedAt: new Date().toISOString() };
  const jobs = [...state.jobs];
  jobs[index] = job;
  const active = { version: job.version, settings: { ...job.settings }, activatedAt: new Date().toISOString() };
  writeState(paths, { ...state, active, jobs });
  return { version: active.version };
});

const beginApplyRollback = async jobId => withLock(async paths => {
  const state = readState(paths);
  const index = state.jobs.findIndex(job => job.id === jobId && job.status === 'applying');
  if (index < 0) throw conflict('Apply job is not active.');
  const job = { ...state.jobs[index], status: 'rolling-back', rollbackStartedAt: new Date().toISOString() };
  const jobs = [...state.jobs];
  jobs[index] = job;
  writeState(paths, { ...state, active: job.previousActive || null, jobs });
  return publicJob(job);
});

const completeApplyJob = async (jobId, { succeeded, message, rollbackVerified = true }) => withLock(async paths => {
  const state = readState(paths);
  const index = state.jobs.findIndex(job => job.id === jobId && ['claimed', 'applying', 'rolling-back'].includes(job.status));
  if (index < 0) throw conflict('Apply job is not active.');
  const previous = state.jobs[index].previousActive || null;
  const now = new Date().toISOString();
  const status = succeeded ? 'succeeded' : rollbackVerified ? 'failed' : 'rollback-failed';
  const job = { ...state.jobs[index], status, applied: Boolean(succeeded), message, completedAt: now };
  const jobs = [...state.jobs];
  jobs[index] = job;
  const active = succeeded || rollbackVerified ? succeeded ? state.active : previous : state.active;
  const audit = auditRecord(succeeded ? 'apply-succeeded' : 'apply-failed', job.createdBy, job.version, Object.keys(job.settings || {}), job.id);
  writeState(paths, { ...state, active, jobs, audit: [...state.audit, audit].slice(-200) });
  return publicJob(job);
});

const loadActiveOverrides = () => {
  const paths = getStorePaths();
  if (!paths || !getAvailability().available) return { version: 0, loaded: false };
  const state = readState(paths);
  const active = state.active;
  if (!active) return { version: 0, loaded: true };
  if (!Number.isSafeInteger(active.version) || !active.settings || typeof active.settings !== 'object') {
    throw unavailable('Active settings state is invalid.');
  }
  const settings = normalizeSettings(active.settings);
  for (const [key, value] of Object.entries(settings)) process.env[key] = value;
  return { version: active.version, loaded: true };
};

const getActiveSettingsVersion = () => {
  const paths = getStorePaths();
  if (!paths || !getAvailability().available) return 0;
  return readState(paths).active?.version || 0;
};

const publishWorkerHeartbeat = async ({ workerId, timestamp, signature }) => withLock(async paths => {
  if (workerId !== WORKER_ID || !Number.isSafeInteger(timestamp) || typeof signature !== 'string') throw invalid('Worker heartbeat is invalid.');
  const state = readState(paths);
  writeState(paths, { ...state, workerHeartbeat: { workerId, timestamp, signature } });
});

module.exports = {
  SettingsStoreError,
  activateClaimedJob,
  beginApplyRollback,
  claimApplyJob,
  completeApplyJob,
  createApplyJob,
  getActiveSettingsVersion,
  getApplyJob,
  getAvailability,
  getDraft,
  getWorkerStatus,
  loadActiveOverrides,
  normalizeSettings,
  publishWorkerHeartbeat,
  saveDraft,
};
