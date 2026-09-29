const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RetranslationProgress, RetranslationRunLock } = require('../models/RetranslationProgress');
const { SUPPORTED_LANGUAGES } = require('../config/languageInventory');

const PROGRESS_DIRECTORY = path.resolve(__dirname, '../../.retranslate-progress');

const sortObjectKeys = value => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = sortObjectKeys(value[key]);
    return sorted;
  }, {});
};

const getDatabaseScope = uri => crypto
  .createHash('sha256')
  .update(uri)
  .digest('hex');

const getRetranslationLockKey = scope => `retranslate:${scope}`;

const getSignaturePayload = options => ({
  filter: options.filter || {},
  lang: options.lang || null,
  entityType: options.entityType || null,
  limit: 0,
  dryRun: Boolean(options.dryRun),
  validate: options.validate !== false,
  libreTranslateOnly: Boolean(options.libreTranslateOnly),
  checkpointScope: options.checkpointScope || null,
});

const hashSignature = payload => crypto
  .createHash('sha256')
  .update(JSON.stringify(sortObjectKeys(payload)))
  .digest('hex');

const getSignature = options => hashSignature({ ...getSignaturePayload(options), lang: null });
const getLegacySignatures = options => [null, ...SUPPORTED_LANGUAGES.map(({ code }) => code)]
  .map(lang => hashSignature({ ...getSignaturePayload(options), lang }))
  .filter(signature => signature !== getSignature(options));

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

const getProductFieldWorkKey = ({ productId, targetLang, field, source }) => {
  const fieldHash = crypto.createHash('sha256').update(JSON.stringify(field)).digest('hex');
  const sourceHash = crypto.createHash('sha256').update(String(source ?? '')).digest('hex');
  return `product-field:${targetLang}:${productId}:${fieldHash}:${sourceHash}`;
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
        completed.set(entry.key, {
          fixed: Boolean(entry.fixed),
          validationErrors: entry.validationErrors || [],
          ...(entry.payload === undefined ? {} : { payload: entry.payload }),
        });
        validContent += `${line}\n`;
      } catch {
        break;
      }
    }
    if (content !== validContent) fs.writeFileSync(filePath, validContent, 'utf8');
  }

  return {
    signature,
    legacySignatures: [...new Set(getLegacySignatures(options))],
    filePath,
    completed,
    initialized: fs.existsSync(filePath),
  };
};

const openProductCheckpoint = (checkpointScope, directory = PROGRESS_DIRECTORY) => openCheckpoint({
  filter: {},
  lang: null,
  entityType: null,
  limit: 0,
  dryRun: false,
  validate: true,
  libreTranslateOnly: false,
  checkpointScope,
}, directory);

const hasCompleted = (checkpoint, key) => Boolean(checkpoint?.completed.has(key));
const getCompletedResult = (checkpoint, key) => checkpoint?.completed.get(key) || null;

const markCompleted = (checkpoint, key, result = {}, replace = false) => {
  if (!checkpoint || !key || (checkpoint.completed.has(key) && !replace)) return;

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
    ...(result.payload === undefined ? {} : { payload: result.payload }),
  };
  fs.appendFileSync(checkpoint.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  checkpoint.completed.set(key, entry);
};

const hydrateCheckpoint = async checkpoint => {
  if (!checkpoint) return checkpoint;
  const records = await RetranslationProgress.find({
    signature: { $in: [checkpoint.signature, ...(checkpoint.legacySignatures || [])] },
  }).lean();
  const currentKeys = new Set(records
    .filter(record => record.signature === checkpoint.signature)
    .map(({ key }) => key));
  const legacyRecords = records.filter(record => record.signature !== checkpoint.signature);
  const recordsToMigrate = legacyRecords.filter(record => !currentKeys.has(record.key));
  if (recordsToMigrate.length > 0) {
    await RetranslationProgress.bulkWrite(recordsToMigrate.map(({ key, fixed, validationErrors, payload }) => ({
      updateOne: {
        filter: { signature: checkpoint.signature, key },
        update: {
          $set: {
            fixed: Boolean(fixed),
            validationErrors: validationErrors || [],
            ...(payload === undefined || payload === null ? {} : { payload }),
          },
        },
        upsert: true,
      },
    })));
  }
  if (legacyRecords.length > 0) {
    await RetranslationProgress.deleteMany({ signature: { $in: checkpoint.legacySignatures } });
  }
  checkpoint.completed.clear();
  checkpoint.durableCompletedCount = new Set(records.map(({ key }) => key)).size;
  records
    .filter(record => record.signature === checkpoint.signature || !currentKeys.has(record.key))
    .forEach(({ key, fixed, validationErrors, payload }) => {
      checkpoint.completed.set(key, {
        fixed: Boolean(fixed),
        validationErrors: validationErrors || [],
        ...(payload === undefined || payload === null ? {} : { payload }),
      });
    });
  persistCheckpoint(checkpoint);
  return checkpoint;
};

const markCompletedDurably = async (checkpoint, key, result = {}, replace = false) => {
  if (!checkpoint || !key || (checkpoint.completed.has(key) && !replace)) return;
  const entry = {
    fixed: Boolean(result.fixed),
    validationErrors: Array.isArray(result.validationErrors) ? result.validationErrors : [],
    ...(result.payload === undefined ? {} : { payload: result.payload }),
  };
  await RetranslationProgress.updateOne(
    { signature: checkpoint.signature, key },
    { $set: entry },
    { upsert: true },
  );
  markCompleted(checkpoint, key, entry, replace);
};

const removeCheckpoint = (options, directory = PROGRESS_DIRECTORY) => {
  const filePaths = [getSignature(options), ...getLegacySignatures(options)]
    .map(signature => path.join(directory, `${signature}.jsonl`));
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
};

const removeDurableCheckpoint = options => RetranslationProgress.deleteMany({
  signature: { $in: [getSignature(options), ...getLegacySignatures(options)] },
});

const persistCheckpoint = checkpoint => {
  if (!checkpoint?.initialized || !fs.existsSync(checkpoint.filePath)) return;
  const header = JSON.stringify({
    type: 'retranslate-checkpoint',
    version: 2,
    signature: checkpoint.signature,
  });
  const entries = [...checkpoint.completed].map(([key, result]) => JSON.stringify({ key, ...result }));
  const temporaryPath = `${checkpoint.filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${header}\n${entries.length ? `${entries.join('\n')}\n` : ''}`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, checkpoint.filePath);
};

const clearCheckpointEntries = async (checkpoint, keys) => {
  if (!checkpoint || keys.length === 0) return;
  await RetranslationProgress.deleteMany({ signature: checkpoint.signature, key: { $in: keys } });
  keys.forEach(key => checkpoint.completed.delete(key));
  persistCheckpoint(checkpoint);
};

const clearProductFieldCheckpoint = async (checkpoint, productId, targetLang) => {
  if (!checkpoint) return;
  const prefix = `product-field:${targetLang}:${productId}:`;
  const keys = [...checkpoint.completed.keys()].filter(key => key.startsWith(prefix));
  await clearCheckpointEntries(checkpoint, keys);
};

const clearProductRetranslationCheckpoint = async (checkpoint, productId, targetLang) => {
  if (!checkpoint) return;
  const prefixes = [
    `catalog:${targetLang}:${productId}:`,
    `product-field:${targetLang}:${productId}:`,
  ];
  const keys = [...checkpoint.completed.keys()].filter(key => prefixes.some(prefix => key.startsWith(prefix)));
  await clearCheckpointEntries(checkpoint, keys);
};

const clearUnfixedCheckpointEntries = async (checkpoint, { lang = null, filter = {} } = {}) => {
  if (!checkpoint) return 0;
  const unresolvedKeys = [...checkpoint.completed]
    .filter(([key, result]) => (
      !key.startsWith('product-field:')
      && !result.fixed
      && (!lang || key.startsWith(`catalog:${lang}:`))
      && (!filter.validationErrors || result.validationErrors.includes(filter.validationErrors))
    ))
    .map(([key]) => key);
  const productJobs = [...new Set(unresolvedKeys
    .filter(key => key.startsWith('catalog:'))
    .map(key => {
      const [, targetLang, productId] = key.split(':');
      return JSON.stringify([productId, targetLang]);
    }))].map(job => JSON.parse(job));
  const fieldPrefixes = productJobs.map(([productId, targetLang]) => `product-field:${targetLang}:${productId}:`);
  const fieldKeys = [...checkpoint.completed.keys()]
    .filter(key => fieldPrefixes.some(prefix => key.startsWith(prefix)));

  await clearCheckpointEntries(checkpoint, [...unresolvedKeys, ...fieldKeys]);
  return unresolvedKeys.length;
};

const clearFixedCheckpointEntries = async (checkpoint, candidateKeys) => {
  if (!checkpoint) return;
  const fixedKeys = candidateKeys.filter(key => checkpoint.completed.get(key)?.fixed);
  await clearCheckpointEntries(checkpoint, fixedKeys);
};

const clearCheckpoint = checkpoint => {
  if (!checkpoint) return;
  if (checkpoint.initialized && fs.existsSync(checkpoint.filePath)) {
    fs.unlinkSync(checkpoint.filePath);
  }
  checkpoint.completed.clear();
  checkpoint.initialized = false;
};

const acquireDatabaseLock = async (key, leaseMs = 10 * 60 * 1000) => {
  const owner = crypto.randomUUID();
  const createLockedError = () => Object.assign(
    new Error('Retranslate is already running for this database'),
    { code: 'RETRANSLATE_LOCKED' },
  );
  const renew = async () => {
    let lock;
    try {
      const expiresAt = new Date(Date.now() + leaseMs);
      lock = await RetranslationRunLock.findOneAndUpdate(
        { key, $or: [{ expiresAt: { $lte: new Date() } }, { owner }] },
        { $set: { owner, expiresAt } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).lean();
    } catch (error) {
      if (error?.code === 11000) throw createLockedError();
      throw error;
    }
    if (!lock || lock.owner !== owner) throw createLockedError();
  };

  await renew();

  let heartbeatError = null;
  let heartbeatInFlight = null;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = renew()
      .then(() => {
        heartbeatError = null;
      })
      .catch((error) => {
        heartbeatError = error;
      })
      .finally(() => {
        heartbeatInFlight = null;
      });
  }, Math.max(1, Math.floor(leaseMs / 3)));
  heartbeat.unref?.();

  return {
    renew: async () => {
      try {
        await renew();
        heartbeatError = null;
      } catch (error) {
        heartbeatError = error;
        throw error;
      }
    },
    release: async () => {
      clearInterval(heartbeat);
      await heartbeatInFlight;
      return RetranslationRunLock.deleteOne({ key, owner });
    },
  };
};

const acquireProgressLock = (directory = PROGRESS_DIRECTORY) => {
  fs.mkdirSync(directory, { recursive: true });
  const lockPath = path.join(directory, 'retranslate.lock');
  const recoveryPath = `${lockPath}.recovery`;
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
    if (existing.hostname !== os.hostname() || !Number.isInteger(existing.pid) || typeof existing.token !== 'string') {
      throw new Error(`Retranslate is already running or its lock cannot be verified: ${lockPath}`);
    }

    let recoveryDescriptor;
    try {
      recoveryDescriptor = fs.openSync(recoveryPath, 'wx', 0o600);
    } catch (recoveryError) {
      if (recoveryError.code === 'EEXIST') {
        throw new Error(`Retranslate lock recovery is already in progress: ${recoveryPath}`);
      }
      throw recoveryError;
    }

    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (current.token !== existing.token) {
        throw new Error(`Retranslate lock changed during recovery: ${lockPath}`);
      }
      try {
        process.kill(current.pid, 0);
        throw new Error(`Retranslate is already running as process ${current.pid}`);
      } catch (processError) {
        if (processError.code !== 'ESRCH') throw processError;
      }
      fs.unlinkSync(lockPath);
    } finally {
      fs.closeSync(recoveryDescriptor);
      fs.unlinkSync(recoveryPath);
    }
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
  acquireDatabaseLock,
  getDatabaseScope,
  getRetranslationLockKey,
  acquireProgressLock,
  clearCheckpoint,
  clearCheckpointEntries,
  clearFixedCheckpointEntries,
  clearProductFieldCheckpoint,
  clearProductRetranslationCheckpoint,
  clearUnfixedCheckpointEntries,
  getCompletedResult,
  getWorkKey,
  getProductFieldWorkKey,
  hasCompleted,
  hydrateCheckpoint,
  markCompleted,
  markCompletedDurably,
  openCheckpoint,
  openProductCheckpoint,
  removeCheckpoint,
  removeDurableCheckpoint,
};
