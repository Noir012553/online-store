const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { MAX_IMAGE_ASSET_BYTES } = require('../utils/fileUtils');
const { fetchSafeRemoteImage } = require('../utils/safeRemoteUrl');

const MAX_R2_ACCOUNTS = 9;
const DEFAULT_MAX_ASSET_BYTES = MAX_IMAGE_ASSET_BYTES;
const DEFAULT_MAX_VIDEO_ASSET_BYTES = MAX_IMAGE_ASSET_BYTES;
const DEFAULT_MAX_R2_RETRIES = 2;
const DEFAULT_ASSET_ROLE = 'general';
const TRANSIENT_R2_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH']);
const uploadBudget = { day: null, assets: 0, bytes: 0 };
const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
const MIME_MAGIC = [
  { mimeType: 'image/jpeg', matches: buffer => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { mimeType: 'image/png', matches: buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/gif', matches: buffer => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')) },
  { mimeType: 'image/webp', matches: buffer => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mimeType: 'image/avif', matches: buffer => buffer.subarray(4, 8).toString('ascii') === 'ftyp' && ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii')) },
  { mimeType: 'image/svg+xml', matches: buffer => {
    const source = buffer.subarray(0, 4096).toString('utf8');
    return /^\\s*(?:<\\?xml[^>]*>\\s*)?<svg\\b/i.test(source) && !/<script\\b/i.test(source);
  } },
  { mimeType: 'video/mp4', matches: buffer => buffer.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mimeType: 'video/webm', matches: buffer => buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
];

const clients = new Map();
const PROJECT_R2_PREFIXES = Object.freeze(['products/', 'banners/', 'about/', 'incoming/', 'legacy/', 'assets/']);

const createR2Error = (code, message, details = {}) => {
  const error = new Error(message || code);
  error.code = code;
  error.errorCode = code;
  error.details = details;
  return error;
};

const getNonNegativeInteger = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw createR2Error('R2_CONFIG_INVALID', `${name} must be a non-negative integer`);
  }
  return value;
};

const getPositiveLimit = (name, fallback) => {
  const value = getNonNegativeInteger(name, fallback);
  if (value <= 0) throw createR2Error('R2_CONFIG_INVALID', `${name} must be a positive integer`);
  return value;
};

const getMaxBytesForMime = mimeType => (
  String(mimeType || '').toLowerCase().startsWith('video/')
    ? getPositiveLimit('R2_MAX_VIDEO_BYTES', DEFAULT_MAX_VIDEO_ASSET_BYTES)
    : getPositiveLimit('R2_MAX_IMAGE_BYTES', DEFAULT_MAX_ASSET_BYTES)
);

const getR2UploadPolicy = () => ({
  enabled: process.env.R2_UPLOAD_ENABLED === 'true',
  maxAssets: getNonNegativeInteger('R2_MAX_UPLOAD_COUNT', 0),
  maxBytes: getNonNegativeInteger('R2_MAX_UPLOAD_BYTES', 0),
  maxRetries: getNonNegativeInteger('R2_MAX_RETRIES', DEFAULT_MAX_R2_RETRIES),
});

const assertR2UploadEnabled = () => {
  const policy = getR2UploadPolicy();
  if (!policy.enabled) throw createR2Error('R2_UPLOAD_DISABLED', 'R2 uploads are disabled by policy');
  if (policy.maxAssets <= 0 || policy.maxBytes <= 0) {
    throw createR2Error('R2_UPLOAD_BUDGET_NOT_CONFIGURED', 'R2 upload budget is not configured');
  }
  return policy;
};

const getBudgetDay = () => new Date().toISOString().slice(0, 10);

const resetUploadBudgetIfNeeded = () => {
  const day = getBudgetDay();
  if (uploadBudget.day !== day) {
    uploadBudget.day = day;
    uploadBudget.assets = 0;
    uploadBudget.bytes = 0;
  }
};

const reserveUploadBudget = (bytes, policy) => {
  resetUploadBudgetIfNeeded();
  if (uploadBudget.assets + 1 > policy.maxAssets) {
    throw createR2Error('R2_UPLOAD_BUDGET_EXCEEDED', 'R2 upload asset limit reached', { assets: uploadBudget.assets, maxAssets: policy.maxAssets });
  }
  if (uploadBudget.bytes + bytes > policy.maxBytes) {
    throw createR2Error('R2_UPLOAD_BUDGET_EXCEEDED', 'R2 upload byte limit reached', { bytes: uploadBudget.bytes, maxBytes: policy.maxBytes });
  }
  uploadBudget.assets += 1;
  uploadBudget.bytes += bytes;
};

const releaseUploadBudget = bytes => {
  uploadBudget.assets = Math.max(0, uploadBudget.assets - 1);
  uploadBudget.bytes = Math.max(0, uploadBudget.bytes - bytes);
};

const getErrorStatus = error => error?.$metadata?.httpStatusCode || error?.response?.status || null;

const isTransientR2Error = error => {
  const status = getErrorStatus(error);
  return status === 429 || (status >= 500 && status < 600) || TRANSIENT_R2_ERROR_CODES.has(error?.code);
};

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const sendR2Command = async (account, createCommand, maxRetries = DEFAULT_MAX_R2_RETRIES) => {
  let attempt = 0;
  while (true) {
    try {
      return await getClient(account).send(createCommand());
    } catch (error) {
      if (!isTransientR2Error(error) || attempt >= maxRetries) throw error;
      await delay(Math.min(1000 * (2 ** attempt), 5000) + Math.floor(Math.random() * 100));
      attempt += 1;
    }
  }
};

const getR2Accounts = (environment = process.env) => {
  const accounts = [];
  const configuredIndexes = [];
  for (let index = 1; index <= MAX_R2_ACCOUNTS; index += 1) {
    const suffix = index === 1 ? '' : `_${index}`;
    const present = [
      environment[`R2_ACCOUNT_ID${suffix}`],
      environment[`R2_ACCESS_KEY_ID${suffix}`],
      environment[`R2_SECRET_ACCESS_KEY${suffix}`],
      environment[`R2_BUCKET_NAME${suffix}`],
      environment[`R2_PUBLIC_BASE_URL${suffix}`],
    ].some(Boolean);
    if (present) configuredIndexes.push(index);
  }
  const highestConfiguredIndex = Math.max(0, ...configuredIndexes);
  for (let index = 1; index <= highestConfiguredIndex; index += 1) {
    if (!configuredIndexes.includes(index)) {
      throw createR2Error('R2_ACCOUNT_GROUP_GAP', `R2 account group ${index} is missing`, { accountId: String(index) });
    }
  }

  for (let index = 1; index <= MAX_R2_ACCOUNTS; index += 1) {
    const suffix = index === 1 ? '' : `_${index}`;
    const values = {
      id: String(index),
      accountId: environment[`R2_ACCOUNT_ID${suffix}`],
      accessKeyId: environment[`R2_ACCESS_KEY_ID${suffix}`],
      secretAccessKey: environment[`R2_SECRET_ACCESS_KEY${suffix}`],
      bucket: environment[`R2_BUCKET_NAME${suffix}`],
      publicBaseUrl: environment[`R2_PUBLIC_BASE_URL${suffix}`],
    };
    const present = Object.values(values).slice(1).some(Boolean);
    if (!present) continue;
    if (!Object.values(values).slice(1).every(value => typeof value === 'string' && value.trim())) {
      throw createR2Error('R2_ACCOUNT_GROUP_INCOMPLETE', `R2 account ${index} is incomplete`, { accountId: values.id });
    }
    accounts.push({
      ...values,
      accountId: values.accountId.trim(),
      accessKeyId: values.accessKeyId.trim(),
      secretAccessKey: values.secretAccessKey.trim(),
      bucket: values.bucket.trim(),
      publicBaseUrl: values.publicBaseUrl.trim().replace(/\/+$/, ''),
    });
  }
  return accounts;
};

const getR2Account = accountId => getR2Accounts().find(account => account.id === String(accountId)) || null;

const normalizeRole = role => String(role || DEFAULT_ASSET_ROLE)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-');

const selectR2Account = ({ stableKey, publicKey, role } = {}) => {
  const accounts = getR2Accounts();
  if (accounts.length === 0) throw createR2Error('R2_NOT_CONFIGURED', 'No complete R2 account group is configured');

  const normalizedRole = normalizeRole(role);
  const configuredId = process.env[`R2_ACCOUNT_ROLE_${normalizedRole.toUpperCase().replace(/-/g, '_')}`]
    || process.env.R2_ACCOUNT_ROLE;
  if (configuredId) {
    const configured = accounts.find(account => account.id === String(configuredId).trim());
    if (!configured) {
      throw createR2Error('R2_ACCOUNT_ROLE_INVALID', `Configured R2 account role points to account ${configuredId}`);
    }
    return configured;
  }

  const identity = String(stableKey || publicKey || normalizedRole);
  const digest = crypto.createHash('sha256').update(identity).digest();
  return accounts[digest.readUInt32BE(0) % accounts.length];
};

const inferMimeType = buffer => {
  if (!Buffer.isBuffer(buffer)) return null;
  return MIME_MAGIC.find(candidate => candidate.matches(buffer))?.mimeType || null;
};

const validateAssetBuffer = (buffer, { mimeType, maxBytes, allowedMimeTypes } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createR2Error('R2_ASSET_EMPTY', 'Asset content must be a non-empty buffer');
  }

  const detectedMimeType = inferMimeType(buffer);
  const normalizedMimeType = mimeType ? String(mimeType).split(';')[0].trim().toLowerCase() : detectedMimeType;
  const configuredMaxBytes = getMaxBytesForMime(normalizedMimeType || detectedMimeType);
  const effectiveMaxBytes = Number.isFinite(maxBytes) ? Math.min(maxBytes, configuredMaxBytes) : configuredMaxBytes;
  if (effectiveMaxBytes <= 0 || buffer.length > effectiveMaxBytes) {
    throw createR2Error('R2_ASSET_TOO_LARGE', 'Asset exceeds the configured size limit', { maxBytes: effectiveMaxBytes, bytes: buffer.length });
  }

  const allowed = allowedMimeTypes ? new Set(allowedMimeTypes.map(value => String(value).toLowerCase())) : null;
  if (!detectedMimeType || !normalizedMimeType || detectedMimeType !== normalizedMimeType || (allowed && !allowed.has(normalizedMimeType))) {
    throw createR2Error('R2_ASSET_CONTENT_INVALID', 'Asset MIME type does not match its magic bytes', {
      detectedMimeType,
      mimeType: normalizedMimeType,
    });
  }

  return { mimeType: normalizedMimeType, bytes: buffer.length };
};

const getClient = account => {
  const clientKey = `${account.id}:${account.accountId}`;
  if (!clients.has(clientKey)) {
    clients.set(clientKey, new S3Client({
      region: 'auto',
      endpoint: `https://${account.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
      },
    }));
  }
  return clients.get(clientKey);
};

const getExtension = (mimeType, sourceName = '') => (
  MIME_EXTENSIONS[mimeType] || path.extname(sourceName).slice(1).toLowerCase() || 'bin'
);

const normalizeStoragePrefix = prefix => {
  const normalized = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\\') || !/^[a-zA-Z0-9/_-]+$/.test(normalized)) {
    throw createR2Error('R2_STORAGE_PREFIX_INVALID', 'R2 storage prefix is invalid');
  }
  return normalized;
};

const buildStorageKey = ({ contentHash, mimeType, role = DEFAULT_ASSET_ROLE, sourceName = '', storagePrefix = null }) => {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new TypeError('contentHash must be a SHA-256 hex digest');
  const prefix = storagePrefix
    ? normalizeStoragePrefix(storagePrefix)
    : `assets/${normalizeRole(role)}`;
  return `${prefix}/${contentHash}.${getExtension(mimeType, sourceName)}`;
};

const buildPublicUrl = (account, storageKey) => `${account.publicBaseUrl}/${storageKey}`;

const isSafeStorageKey = storageKey => (
  typeof storageKey === 'string'
  && storageKey.length > 0
  && !storageKey.startsWith('/')
  && !storageKey.includes('..')
  && !storageKey.includes('\\')
);

const uploadBuffer = async (buffer, options = {}) => {
  const policy = assertR2UploadEnabled();
  const validation = validateAssetBuffer(buffer, options);
  const sourceName = options.sourceName || options.filePath || '';
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const role = normalizeRole(options.role);
  const storageKey = options.storageKey || buildStorageKey({
    contentHash,
    mimeType: validation.mimeType,
    role,
    sourceName,
    storagePrefix: options.storagePrefix,
  });
  if (!isSafeStorageKey(storageKey)) throw createR2Error('R2_STORAGE_KEY_INVALID', 'R2 storage key is invalid');

  const account = options.accountId
    ? getR2Account(options.accountId)
    : selectR2Account({ stableKey: options.stableKey || contentHash, publicKey: options.publicKey, role });
  if (!account) throw createR2Error('R2_ACCOUNT_NOT_FOUND', `R2 account ${options.accountId} is not configured`);

  const reference = {
    sourceUrl: options.sourceUrl || null,
    storageProvider: 'r2',
    storageAccount: account.id,
    bucket: account.bucket,
    storageKey,
    publicUrl: buildPublicUrl(account, storageKey),
    publicId: storageKey,
    contentHash,
    mimeType: validation.mimeType,
    bytes: validation.bytes,
  };

  let exists = false;
  try {
    const head = await sendR2Command(
      account,
      () => new HeadObjectCommand({ Bucket: account.bucket, Key: storageKey }),
      policy.maxRetries,
    );
    exists = Number(head.ContentLength) === buffer.length;
  } catch (error) {
    if (getErrorStatus(error) !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchKey') throw error;
  }

  if (!exists) {
    reserveUploadBudget(buffer.length, policy);
    try {
      await sendR2Command(
        account,
        () => new PutObjectCommand({
          Bucket: account.bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: validation.mimeType,
          ContentLength: buffer.length,
          Metadata: { sha256: contentHash },
        }),
        policy.maxRetries,
      );
    } catch (error) {
      releaseUploadBudget(buffer.length);
      throw error;
    }
  }

  return reference;
};

const readRemoteBuffer = async (sourceUrl, options = {}) => {
  const response = await fetchSafeRemoteImage(sourceUrl, {
    headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'User-Agent': 'LaptopStoreR2AssetService/1.0' },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 30000),
  });
  if (!response.ok) throw createR2Error('R2_REMOTE_FETCH_FAILED', `Remote asset request failed with status ${response.status}`);
  const contentLength = Number(response.headers.get('content-length'));
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.min(options.maxBytes, getMaxBytesForMime(response.headers.get('content-type')))
    : getMaxBytesForMime(response.headers.get('content-type'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw createR2Error('R2_ASSET_TOO_LARGE', 'Remote asset exceeds the configured size limit');
  if (!response.body) throw createR2Error('R2_REMOTE_FETCH_FAILED', 'Remote asset response has no body');

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw createR2Error('R2_ASSET_TOO_LARGE', 'Remote asset exceeds the configured size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return { buffer: Buffer.concat(chunks, totalBytes), mimeType: response.headers.get('content-type') };
};

const uploadRemoteUrl = async (sourceUrl, options = {}) => {
  const { buffer, mimeType } = await readRemoteBuffer(sourceUrl, options);
  return uploadBuffer(buffer, { ...options, mimeType, sourceUrl });
};

const uploadLocalFile = async (filePath, options = {}) => {
  const buffer = await fs.promises.readFile(filePath);
  return uploadBuffer(buffer, { ...options, sourceUrl: options.sourceUrl || filePath, sourceName: options.sourceName || filePath });
};

const uploadAsset = async (source, options = {}) => {
  assertR2UploadEnabled();
  if (Buffer.isBuffer(source)) return uploadBuffer(source, options);
  const normalizedSource = String(source || '').trim();
  if (/^https?:\/\//i.test(normalizedSource)) return uploadRemoteUrl(normalizedSource, options);
  return uploadLocalFile(normalizedSource, options);
};

const validateR2AssetReference = async reference => {
  if (!reference || reference.storageProvider !== 'r2') {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'Asset reference must use R2');
  }
  if (!isSafeStorageKey(reference.storageKey)) {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset reference has an invalid storage key');
  }

  const account = getR2Account(reference.storageAccount);
  if (!account || account.bucket !== reference.bucket) {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset reference does not match a configured bucket');
  }
  if (reference.publicUrl !== buildPublicUrl(account, reference.storageKey)) {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset reference has an invalid public URL');
  }

  const head = await sendR2Command(
    account,
    () => new HeadObjectCommand({
      Bucket: account.bucket,
      Key: reference.storageKey,
    }),
    getR2UploadPolicy().maxRetries,
  );
  if (reference.contentHash && head.Metadata?.sha256 && reference.contentHash !== head.Metadata.sha256) {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset content hash does not match the stored object');
  }

  return {
    ...reference,
    storageProvider: 'r2',
    storageAccount: account.id,
    bucket: account.bucket,
    publicUrl: buildPublicUrl(account, reference.storageKey),
    publicId: reference.publicId || reference.storageKey,
    mimeType: reference.mimeType || head.ContentType || null,
    bytes: reference.bytes || Number(head.ContentLength) || null,
  };
};

const deleteR2Asset = async reference => {
  if (!reference || reference.storageProvider !== 'r2') return { deleted: false, skipped: true };
  if (!isSafeStorageKey(reference.storageKey)) throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset reference has an invalid storage key');
  const account = getR2Account(reference.storageAccount);
  if (!account || account.bucket !== reference.bucket) {
    throw createR2Error('R2_ASSET_REFERENCE_INVALID', 'R2 asset reference does not match a configured bucket');
  }
  await sendR2Command(
    account,
    () => new DeleteObjectCommand({ Bucket: account.bucket, Key: reference.storageKey }),
    getR2UploadPolicy().maxRetries,
  );
  return { deleted: true, storageAccount: account.id, bucket: account.bucket, storageKey: reference.storageKey };
};

const deleteR2Assets = async references => {
  const results = [];
  for (const reference of Array.isArray(references) ? references : []) results.push(await deleteR2Asset(reference));
  return results;
};

const deleteR2ProjectAssets = async () => {
  const accounts = getR2Accounts();
  if (accounts.length === 0) {
    throw createR2Error('R2_NOT_CONFIGURED', 'R2 account configuration is required before clearing project assets');
  }
  const maxRetries = getR2UploadPolicy().maxRetries;
  let deletedCount = 0;

  for (const account of accounts) {
    for (const prefix of PROJECT_R2_PREFIXES) {
      let continuationToken;
      do {
        const listed = await sendR2Command(
          account,
          () => new ListObjectsV2Command({
            Bucket: account.bucket,
            Prefix: prefix,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }),
          maxRetries,
        );
        const keys = (listed.Contents || [])
          .map(object => object.Key)
          .filter(Boolean);

        if (keys.length > 0) {
          const deleted = await sendR2Command(
            account,
            () => new DeleteObjectsCommand({
              Bucket: account.bucket,
              Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
            }),
            maxRetries,
          );
          if (deleted.Errors?.length) {
            throw createR2Error('R2_DELETE_FAILED', `Failed to delete ${deleted.Errors.length} R2 objects`, {
              accountId: account.id,
              bucket: account.bucket,
              prefix,
              errors: deleted.Errors,
            });
          }
          deletedCount += keys.length;
        }

        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : null;
      } while (continuationToken);
    }
  }

  return { deletedCount, accounts: accounts.length, prefixes: PROJECT_R2_PREFIXES };
};

const getR2StorageStatus = () => {
  const accounts = getR2Accounts();
  const policy = getR2UploadPolicy();
  return {
    configured: accounts.length > 0,
    uploadEnabled: policy.enabled,
    uploadBudgetConfigured: policy.maxAssets > 0 && policy.maxBytes > 0,
    accounts: accounts.map(account => ({ id: account.id, bucket: account.bucket, publicBaseUrl: account.publicBaseUrl })),
  };
};

module.exports = {
  DEFAULT_MAX_ASSET_BYTES,
  MIME_EXTENSIONS,
  getR2Accounts,
  getR2Account,
  getR2UploadPolicy,
  isTransientR2Error,
  selectR2Account,
  inferMimeType,
  validateAssetBuffer,
  buildStorageKey,
  normalizeStoragePrefix,
  isSafeStorageKey,
  uploadBuffer,
  uploadRemoteUrl,
  uploadLocalFile,
  uploadAsset,
  validateR2AssetReference,
  deleteR2Asset,
  deleteR2Assets,
  deleteR2ProjectAssets,
  getR2StorageStatus,
};
