const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const EXPORT_DIR = path.resolve(
  process.env.EXPORT_JOB_DIR || path.join(require('os').tmpdir(), 'online-store-export-jobs'),
);
const STORAGE_MODE = String(process.env.EXPORT_STORAGE || 'local').trim().toLowerCase();
const S3_BUCKET = process.env.EXPORT_S3_BUCKET;
const S3_REGION = process.env.EXPORT_S3_REGION || process.env.AWS_REGION;
const S3_PREFIX = String(process.env.EXPORT_S3_PREFIX || 'exports').replace(/^\/+|\/+$/g, '');

let s3Client = null;

const createStorageError = (message, code = 'EXPORT_STORAGE_CONFIG_INVALID') => {
  const error = new Error(message);
  error.errorCode = code;
  return error;
};

const assertStorageConfigured = () => {
  if (STORAGE_MODE === 'local') return;
  if (STORAGE_MODE !== 's3') {
    throw createStorageError(`Unsupported EXPORT_STORAGE: ${STORAGE_MODE}`);
  }
  if (!S3_BUCKET || !S3_REGION) {
    throw createStorageError('EXPORT_S3_BUCKET and EXPORT_S3_REGION are required when EXPORT_STORAGE=s3');
  }
};

const getS3Client = () => {
  assertStorageConfigured();
  if (!s3Client) {
    s3Client = new S3Client({
      region: S3_REGION,
      endpoint: process.env.EXPORT_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.EXPORT_S3_FORCE_PATH_STYLE === 'true',
    });
  }
  return s3Client;
};

const getStorageStatus = () => ({
  mode: STORAGE_MODE,
  required: STORAGE_MODE === 's3',
  configured: STORAGE_MODE === 'local'
    || (STORAGE_MODE === 's3' && Boolean(S3_BUCKET && S3_REGION)),
  bucket: STORAGE_MODE === 's3' ? S3_BUCKET : undefined,
  prefix: STORAGE_MODE === 's3' ? S3_PREFIX : undefined,
});

const getObjectKey = jobKey => `${S3_PREFIX}/${jobKey}`.replace(/^\/+/, '');
const getRemotePath = key => `s3://${S3_BUCKET}/${getObjectKey(key)}`;

const isManagedStoragePath = filePath => {
  if (STORAGE_MODE === 'local') {
    if (typeof filePath !== 'string') return false;
    const relativePath = path.relative(EXPORT_DIR, path.resolve(filePath));
    return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }
  if (typeof filePath !== 'string' || !filePath.startsWith(`s3://${S3_BUCKET}/`)) return false;
  const key = filePath.slice(`s3://${S3_BUCKET}/`.length);
  return key.startsWith(`${S3_PREFIX}/`) && key.endsWith('.zip') && !key.includes('..');
};

const writeLocalExport = async (filePath, sourcePath) => {
  if (filePath !== sourcePath) await fs.promises.rename(sourcePath, filePath);
  return filePath;
};

const putFile = async (sourcePath, jobKey) => {
  assertStorageConfigured();
  if (STORAGE_MODE === 'local') return sourcePath;

  const key = getObjectKey(jobKey);
  await getS3Client().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fs.createReadStream(sourcePath),
    ContentType: 'application/zip',
  }));
  await fs.promises.unlink(sourcePath).catch(() => {});
  return getRemotePath(jobKey);
};

const deleteFile = async filePath => {
  if (!filePath || !isManagedStoragePath(filePath)) return;
  if (STORAGE_MODE === 'local') {
    await fs.promises.unlink(filePath).catch(() => {});
    return;
  }

  const key = filePath.slice(`s3://${S3_BUCKET}/`.length);
  await getS3Client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
};

const downloadFile = async (filePath, res, next, filename = 'products-export.zip') => {
  if (!isManagedStoragePath(filePath)) {
    const error = new Error('EXPORT_FILE_NOT_READY');
    error.statusCode = 404;
    error.errorCode = 'EXPORT_FILE_NOT_READY';
    next(error);
    return;
  }
  if (STORAGE_MODE === 'local') {
    res.download(filePath, filename, next);
    return;
  }

  try {
    const key = filePath.slice(`s3://${S3_BUCKET}/`.length);
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    res.setHeader('Content-Type', result.ContentType || 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await pipeline(result.Body, res);
  } catch (error) {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  }
};

module.exports = {
  EXPORT_DIR,
  STORAGE_MODE,
  assertStorageConfigured,
  getStorageStatus,
  isManagedStoragePath,
  putFile,
  deleteFile,
  downloadFile,
  writeLocalExport,
};
