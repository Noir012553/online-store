const crypto = require('node:crypto');
const fs = require('node:fs');
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
  })))
  .digest('hex');

const getCheckpointPath = (options, directory = PROGRESS_DIRECTORY) => path.join(directory, `${getSignature(options)}.jsonl`);

const getWorkKey = translation => {
  if (translation.retranslateSource === 'catalog') {
    return `catalog:${translation.targetLang}:${translation.entityId}`;
  }
  const hashKey = String(translation.hashKey || '').replace(/(:v\d+)+$/, '');
  return `live:${hashKey || translation._id}`;
};

const openCheckpoint = (options, directory = PROGRESS_DIRECTORY) => {
  const signature = getSignature(options);
  const filePath = getCheckpointPath(options, directory);
  const completedKeys = new Set();

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    let header;
    try {
      header = JSON.parse(lines[0]);
    } catch {
      throw new Error(`Retranslate checkpoint is corrupted: ${filePath}`);
    }
    if (header.type !== 'retranslate-checkpoint' || header.version !== 1 || header.signature !== signature) {
      throw new Error(`Retranslate checkpoint does not match the current options: ${filePath}`);
    }
    let validContent = `${lines[0]}\n`;
    for (const line of lines.slice(1)) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (typeof entry.key === 'string') completedKeys.add(entry.key);
        validContent += `${line}\n`;
      } catch {
        break;
      }
    }
    if (content !== validContent) fs.writeFileSync(filePath, validContent, 'utf8');
  }

  return { signature, filePath, completedKeys, initialized: fs.existsSync(filePath) };
};

const hasCompleted = (checkpoint, key) => Boolean(checkpoint?.completedKeys.has(key));

const markCompleted = (checkpoint, keys) => {
  if (!checkpoint) return;

  if (!checkpoint.initialized) {
    fs.mkdirSync(path.dirname(checkpoint.filePath), { recursive: true });
    const header = JSON.stringify({
      type: 'retranslate-checkpoint',
      version: 1,
      signature: checkpoint.signature,
    });
    const temporaryPath = `${checkpoint.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${header}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, checkpoint.filePath);
    checkpoint.initialized = true;
  }

  for (const key of keys.filter(Boolean)) {
    if (checkpoint.completedKeys.has(key)) continue;
    fs.appendFileSync(checkpoint.filePath, `${JSON.stringify({ key })}\n`, { encoding: 'utf8', mode: 0o600 });
    checkpoint.completedKeys.add(key);
  }
};

const clearCheckpoint = checkpoint => {
  if (!checkpoint) return;
  if (checkpoint.initialized && fs.existsSync(checkpoint.filePath)) {
    fs.unlinkSync(checkpoint.filePath);
  }
  checkpoint.completedKeys.clear();
  checkpoint.initialized = false;
};

module.exports = { openCheckpoint, hasCompleted, markCompleted, clearCheckpoint, getWorkKey };
