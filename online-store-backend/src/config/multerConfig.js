const multer = require('multer');
const path = require('path');
const {
  checkFileType,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ZIP_FILE_SIZE_BYTES,
} = require('../utils/fileUtils');

const memoryStorage = multer.memoryStorage();
const imageFileFilter = (req, file, cb) => checkFileType(file, cb);

const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadImport = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      '.zip': ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
    };
    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedTypes[extension]?.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only valid .zip files are allowed'), false);
    }
  },
  limits: { fileSize: MAX_IMPORT_ZIP_FILE_SIZE_BYTES },
});

module.exports = {
  uploadMemory,
  uploadImport,
  MAX_IMPORT_FILE_SIZE_BYTES,
};
