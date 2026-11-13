'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { editableSettingRegistry, isValidEditableSetting } = require('./adminSettingsRegistry');

const STORE_FILENAME = 'admin-settings-v1.dpapi';
const LOCK_FILENAME = 'admin-settings-v1.lock';
const POWERSHELL_RELATIVE_PATH = path.win32.join('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_SECRET_CHARS = 8192;
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;

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
    if (error.code === 'ENOENT') return { version: 0, draft: null, jobs: [], audit: [] };
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

const withLock = async operation => {
  const paths = requirePaths();
  let descriptor;
  try {
    descriptor = fs.openSync(paths.lock, 'wx', 0o600);
    fs.writeSync(descriptor, `${process.pid}\n`);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.unlinkSync(paths.lock); } catch {}
    }
    if (error.code !== 'EEXIST') throw unavailable('Settings storage lock is unavailable.');
    let ownerPid;
    try { ownerPid = Number(fs.readFileSync(paths.lock, 'utf8').trim()); } catch {}
    if (Number.isSafeInteger(ownerPid) && ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
      } catch (ownerError) {
        if (ownerError.code === 'ESRCH') {
          try {
            fs.unlinkSync(paths.lock);
            return withLock(operation);
          } catch (recoveryError) {
            if (recoveryError.code !== 'ENOENT' && !(recoveryError instanceof SettingsStoreError)) {
              throw unavailable('Stale settings lock could not be recovered.');
            }
          }
        }
      }
    }
    throw conflict('Another settings operation is in progress.');
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

const createApplyJob = async ({ expectedVersion, userId }) => {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw invalid('expectedVersion must be a positive integer.');
  return withLock(async paths => {
    const state = readState(paths);
    if (!state.draft || state.draft.version !== expectedVersion) throw conflict('Draft version does not match expectedVersion.');
    const job = {
      id: crypto.randomBytes(16).toString('hex'),
      status: 'unavailable',
      applied: false,
      adapter: 'winsw-fixed-service-adapter-unconfigured',
      version: state.draft.version,
      createdAt: new Date().toISOString(),
      createdBy: String(userId),
      completedAt: new Date().toISOString(),
      message: 'No verified fixed WinSW apply worker is installed; no settings were applied and no service was restarted.',
    };
    const audit = auditRecord('apply-request-unavailable', userId, state.draft.version, Object.keys(state.draft.settings), job.id);
    writeState(paths, { ...state, jobs: [...state.jobs, job].slice(-100), audit: [...state.audit, audit].slice(-200) });
    console.info('[AdminSettings] Apply request recorded as unavailable', { userId: String(userId), version: job.version, jobId: job.id, keys: audit.keys });
    return job;
  });
};

const getApplyJob = async id => {
  if (!JOB_ID_PATTERN.test(id)) throw invalid('Apply job id is invalid.');
  const paths = requirePaths();
  const job = readState(paths).jobs.find(entry => entry.id === id);
  if (!job) return null;
  return job;
};

module.exports = {
  SettingsStoreError,
  createApplyJob,
  getApplyJob,
  getAvailability,
  getDraft,
  normalizeSettings,
  saveDraft,
};
