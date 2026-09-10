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

const readEntryBuffer = async (entry, maxBytes, limitErrorCode) => {
  const chunks = [];
  let totalBytes = 0;
  let stream;

  try {
    stream = entry.stream();
    for await (const chunk of stream) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        stream.destroy();
        throw createZipImportError(limitErrorCode);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error.code === limitErrorCode) throw error;
    throw createZipImportError('IMPORT_ZIP_CONTENT_INVALID');
  }

  return Buffer.concat(chunks, totalBytes);
};

const getActualCompressedSize = (buffer, entry, directory) => {
  const localHeaderOffset = Number(entry.vars?.offsetToLocalFileHeader);
  if (!Number.isSafeInteger(localHeaderOffset) || localHeaderOffset < 0
    || localHeaderOffset + 30 > buffer.length
    || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    return null;
  }

  const flags = buffer.readUInt16LE(localHeaderOffset + 6);
  const localCompressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;

  if (dataStart > buffer.length) return null;
  if (!(flags & 0x08) || localCompressedSize > 0) {
    return dataStart + localCompressedSize <= buffer.length ? localCompressedSize : null;
  }

  const centralDirectoryOffset = Number(directory.vars?.offsetToStartOfCentralDirectory);
  const nextLocalHeaderOffset = directory.files
    .map(file => Number(file.vars?.offsetToLocalFileHeader))
    .filter(offset => Number.isSafeInteger(offset) && offset > localHeaderOffset)
    .sort((left, right) => left - right)[0];
  const dataEnd = Math.min(
    Number.isSafeInteger(nextLocalHeaderOffset) ? nextLocalHeaderOffset : buffer.length,
    Number.isSafeInteger(centralDirectoryOffset) && centralDirectoryOffset > dataStart
      ? centralDirectoryOffset
      : buffer.length,
  );

  if (dataEnd <= dataStart) return null;

  let descriptorLength = 12;
  if (dataEnd - dataStart >= 16 && buffer.readUInt32LE(dataEnd - 16) === 0x08074b50) {
    descriptorLength = 16;
  }
  return dataEnd - dataStart - descriptorLength >= 0
    ? dataEnd - dataStart - descriptorLength
    : null;
};

const validateActualCompressionRatio = (buffer, entry, directory, actualSize) => {
  if (actualSize === 0) return;

  const compressedSize = getActualCompressedSize(buffer, entry, directory);
  if (!compressedSize || actualSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO) {
    throw createZipImportError('IMPORT_ZIP_COMPRESSION_RATIO_INVALID');
  }
};

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

  let actualUncompressedBytes = contentBuffer.length;
  if (actualUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw createZipImportError('IMPORT_ZIP_UNCOMPRESSED_LIMIT_EXCEEDED');
  }

  const assets = new Map();
  try {
    for (const [entryName, entry] of imageEntries) {
      const assetBuffer = await entry.buffer();
      if (assetBuffer.length === 0 || assetBuffer.length > MAX_ZIP_IMAGE_BYTES) {
        throw createZipImportError('IMPORT_ZIP_IMAGE_SIZE_INVALID');
      }
      actualUncompressedBytes += assetBuffer.length;
      if (actualUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw createZipImportError('IMPORT_ZIP_UNCOMPRESSED_LIMIT_EXCEEDED');
      }
      assets.set(entryName, assetBuffer);
    }
  } catch (error) {
    if (error.code === 'IMPORT_ZIP_IMAGE_SIZE_INVALID') throw error;
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
