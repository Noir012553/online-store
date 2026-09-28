const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROGRESS_DIRECTORY = path.resolve(__dirname, '../../.retranslate-progress');

const sortObjectKeys = value => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = sortObjectKeys(value[key]);
    return sorted;
  }, {});
};

const getSignature = options => crypto
  .createHash('sha256')
  .update(JSON.stringify(sortObjectKeys({
    filter: options.filter || {},
    lang: options.lang || null,
    entityType: options.entityType || null,
    limit: options.limit || 0,
    dryRun: Boolean(options.dryRun),
    validate: options.validate !== false,
    libreTranslateOnly: Boolean(options.libreTranslateOnly),
    checkpointScope: options.checkpointScope || null,
  })))
  .digest('hex');

const getCheckpointPath = (options, directory = PROGRESS_DIRECTORY) => path.join(directory, `${getSignature(options)}.jsonl`);

const getWorkKey = translation => {
  if (translation.retranslateSource === 'catalog') {
    return `catalog:${translation.targetLang}:${translation.entityId}:${translation.sourceHash || 'unversioned'}`;
  }
  const hashKey = String(translation.hashKey || '').replace(/(?::v[0-9]+)+$/, '');
  const sourceHash = crypto.createHash('sha256')
    .update(String(translation.originalText || translation.name || ''))
    .digest('hex');
  return `live:${hashKey || translation._id}:${sourceHash}`;
};

const openCheckpoint = (options, directory = PROGRESS_DIRECTORY) => {
  const signature = getSignature(options);
  const filePath = getCheckpointPath(options, directory);
  const completed = new Map();

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    let header;
    try {
      header = JSON.parse(lines[0]);
    } catch {
      throw new Error(`Retranslate checkpoint is corrupted: ${filePath}`);
    }
    if (header.type !== 'retranslate-checkpoint' || header.version !== 2 || header.signature !== signature) {
      throw new Error(`Retranslate checkpoint does not match the current options: ${filePath}`);
    }
    let validContent = `${lines[0]}\n`;
    for (const line of lines.slice(1)) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (typeof entry.key !== 'string') throw new Error('Checkpoint entry has no key');
        completed.set(entry.key, { fixed: Boolean(entry.fixed), validationErrors: entry.validationErrors || [] });
        validContent += `${line}\n`;
      } catch {
        break;
      }
    }
    if (content !== validContent) fs.writeFileSync(filePath, validContent, 'utf8');
  }

  return { signature, filePath, completed, initialized: fs.existsSync(filePath) };
};

const hasCompleted = (checkpoint, key) => Boolean(checkpoint?.completed.has(key));
const getCompletedResult = (checkpoint, key) => checkpoint?.completed.get(key) || null;

const markCompleted = (checkpoint, key, result = {}) => {
  if (!checkpoint || !key || checkpoint.completed.has(key)) return;

  if (!checkpoint.initialized) {
    fs.mkdirSync(path.dirname(checkpoint.filePath), { recursive: true });
    const header = JSON.stringify({
      type: 'retranslate-checkpoint',
      version: 2,
      signature: checkpoint.signature,
    });
    const temporaryPath = `${checkpoint.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${header}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, checkpoint.filePath);
    checkpoint.initialized = true;
  }

  const entry = {
    key,
    fixed: Boolean(result.fixed),
    validationErrors: Array.isArray(result.validationErrors) ? result.validationErrors : [],
  };
  fs.appendFileSync(checkpoint.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  checkpoint.completed.set(key, entry);
};

const removeCheckpoint = (options, directory = PROGRESS_DIRECTORY) => {
  const filePath = getCheckpointPath(options, directory);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const clearCheckpoint = checkpoint => {
  if (!checkpoint) return;
  if (checkpoint.initialized && fs.existsSync(checkpoint.filePath)) {
    fs.unlinkSync(checkpoint.filePath);
  }
  checkpoint.completed.clear();
  checkpoint.initialized = false;
};

const acquireProgressLock = (directory = PROGRESS_DIRECTORY) => {
  fs.mkdirSync(directory, { recursive: true });
  const lockPath = path.join(directory, 'retranslate.lock');
  const token = crypto.randomUUID();
  const lock = { pid: process.pid, hostname: os.hostname(), token };
  let descriptor;

  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      throw new Error(`Retranslate lock is corrupted; inspect ${lockPath} before removing it`);
    }
    if (existing.hostname !== os.hostname() || !Number.isInteger(existing.pid)) {
      throw new Error(`Retranslate is already running or its lock cannot be verified: ${lockPath}`);
    }
    try {
      process.kill(existing.pid, 0);
      throw new Error(`Retranslate is already running as process ${existing.pid}`);
    } catch (processError) {
      if (processError.code !== 'ESRCH') throw processError;
    }
    fs.unlinkSync(lockPath);
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  }

  try {
    fs.writeFileSync(descriptor, JSON.stringify(lock), 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }

  return () => {
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (current.token === token) fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
};

module.exports = {
  acquireProgressLock,
  clearCheckpoint,
  getCompletedResult,
  getWorkKey,
  hasCompleted,
  markCompleted,
  openCheckpoint,
  removeCheckpoint,
};
