const unzipper = require('unzipper');
const {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ZIP_FILE_SIZE_BYTES,
  MAX_IMAGE_ASSET_BYTES,
  validateImportFile,
} = require('./fileUtils');

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_SPANNED_SIGNATURE = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_ZIP_IMAGE_ENTRIES = 5000;
const MAX_ZIP_IMAGE_BYTES = MAX_IMAGE_ASSET_BYTES;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const DATA_ENTRY_NAMES = new Set(['products.json', 'products.csv']);

const createZipImportError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const hasZipSignature = (buffer) => (
  buffer.subarray(0, 4).equals(ZIP_SIGNATURE)
  || buffer.subarray(0, 4).equals(ZIP_EMPTY_SIGNATURE)
  || buffer.subarray(0, 4).equals(ZIP_SPANNED_SIGNATURE)
);

const isSafeEntryName = (entryName) => {
  if (!entryName || entryName.includes('\0') || entryName.includes('\\') || entryName.startsWith('/')) {
    return false;
  }

  const nameWithoutTrailingSlash = entryName.endsWith('/') ? entryName.slice(0, -1) : entryName;
  if (!nameWithoutTrailingSlash) return false;

  const segments = nameWithoutTrailingSlash.split('/');
  return !segments.includes('')
    && !segments.includes('.')
    && !segments.includes('..')
    && !entryName.includes(':');
};

const getEntrySize = (entry) => Number(entry.vars?.uncompressedSize ?? 0);

const readImportZip = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMPORT_ZIP_FILE_SIZE_BYTES) {
    throw createZipImportError('IMPORT_ZIP_SIZE_INVALID');
  }

  if (!hasZipSignature(buffer)) {
    throw createZipImportError('IMPORT_ZIP_CONTENT_INVALID');
  }

  let directory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch {
    throw createZipImportError('IMPORT_ZIP_CONTENT_INVALID');
  }

  if (!directory.files.length || directory.files.length > MAX_ZIP_ENTRIES) {
    throw createZipImportError('IMPORT_ZIP_ENTRY_LIMIT_EXCEEDED');
  }

  const seenNames = new Set();
  const dataEntries = [];
  const imageEntries = new Map();
  let totalUncompressedBytes = 0;
  let imageEntryCount = 0;

  for (const entry of directory.files) {
    const entryName = entry.path;
    const normalizedName = entryName.toLowerCase();

    if (!isSafeEntryName(entryName) || seenNames.has(normalizedName)) {
      throw createZipImportError('IMPORT_ZIP_PATH_INVALID');
    }
    seenNames.add(normalizedName);

    const entrySize = getEntrySize(entry);
    const compressedSize = Number(entry.vars?.compressedSize ?? 0);
    if (entry.type === 'File' && entrySize > 0
      && (!compressedSize || entrySize / compressedSize > MAX_ZIP_COMPRESSION_RATIO)) {
      throw createZipImportError('IMPORT_ZIP_COMPRESSION_RATIO_INVALID');
    }

    totalUncompressedBytes += entrySize;
    if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw createZipImportError('IMPORT_ZIP_UNCOMPRESSED_LIMIT_EXCEEDED');
    }

    if (entry.type === 'Directory') continue;
    if (entry.type !== 'File') {
      throw createZipImportError('IMPORT_ZIP_ENTRY_TYPE_INVALID');
    }

    if (DATA_ENTRY_NAMES.has(entryName)) {
      if (entrySize > MAX_IMPORT_FILE_SIZE_BYTES) {
        throw createZipImportError('IMPORT_FILE_CONTENT_INVALID');
      }
      dataEntries.push(entry);
      continue;
    }

    if (entryName.startsWith('assets/images/')) {
      imageEntryCount += 1;
      if (imageEntryCount > MAX_ZIP_IMAGE_ENTRIES) {
        throw createZipImportError('IMPORT_ZIP_IMAGE_LIMIT_EXCEEDED');
      }
      if (entrySize === 0 || entrySize > MAX_ZIP_IMAGE_BYTES) {
        throw createZipImportError('IMPORT_ZIP_IMAGE_SIZE_INVALID');
      }
      imageEntries.set(entryName, entry);
      continue;
    }

    throw createZipImportError('IMPORT_ZIP_ENTRY_NOT_ALLOWED');
  }

  if (dataEntries.length !== 1) {
    throw createZipImportError('IMPORT_ZIP_DATA_ENTRY_INVALID');
  }

  const dataEntry = dataEntries[0];
  let contentBuffer;
  try {
    contentBuffer = await dataEntry.buffer();
  } catch {
    throw createZipImportError('IMPORT_ZIP_CONTENT_INVALID');
  }

  const format = dataEntry.path.endsWith('.json') ? 'json' : 'csv';
  validateImportFile({
    buffer: contentBuffer,
    originalname: dataEntry.path,
    mimetype: format === 'json' ? 'application/json' : 'text/csv',
  });

  const assets = new Map();
  try {
    for (const [entryName, entry] of imageEntries) {
      assets.set(entryName, await entry.buffer());
    }
  } catch {
    throw createZipImportError('IMPORT_ZIP_CONTENT_INVALID');
  }

  return {
    format,
    content: contentBuffer.toString('utf8'),
    entryName: dataEntry.path,
    imageEntryCount,
    assets,
  };
};

module.exports = {
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  MAX_ZIP_IMAGE_ENTRIES,
  MAX_ZIP_IMAGE_BYTES,
  hasZipSignature,
  isSafeEntryName,
  readImportZip,
};
