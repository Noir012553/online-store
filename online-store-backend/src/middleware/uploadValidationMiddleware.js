const path = require('path');
const { readImportZip } = require('../utils/zipImport');

const IMAGE_TYPES = {
  jpeg: {
    extensions: ['.jpeg', '.jpg'],
    mimeTypes: ['image/jpeg'],
    signature: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  png: {
    extensions: ['.png'],
    mimeTypes: ['image/png'],
    signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  gif: {
    extensions: ['.gif'],
    mimeTypes: ['image/gif'],
    signature: (buffer) => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  },
  webp: {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
    signature: (buffer) => buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

const getImageType = (buffer) => Object.values(IMAGE_TYPES).find((type) => type.signature(buffer));

const validateImageUpload = (req, res, next) => {
  if (!req.file) return next();

  const imageType = getImageType(req.file.buffer);
  const extension = path.extname(req.file.originalname || '').toLowerCase();
  if (!imageType || !imageType.extensions.includes(extension) || !imageType.mimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      code: 'IMAGE_FILE_INVALID',
      message: 'The uploaded image content does not match its declared file type.',
    });
  }

  return next();
};

const validateImportUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_FILE_REQUIRED',
        message: 'A ZIP import file is required.',
      });
    }

    const extension = path.extname(req.file.originalname || '').toLowerCase();
    if (extension !== '.zip') {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_ZIP_ONLY',
        message: 'Only ZIP import files are allowed.',
      });
    }

    req.importFile = await readImportZip(req.file.buffer);
    return next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: error.code || 'IMPORT_FILE_INVALID',
      message: 'The uploaded import file is invalid.',
    });
  }
};

module.exports = { validateImageUpload, validateImportUpload };
