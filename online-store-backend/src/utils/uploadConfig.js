/**
 * DEPRECATED: Upload configuration moved to src/config/multerConfig.js
 *
 * Use instead:
 * - const { uploadLocal, uploadCloudinary, uploadImport } = require('../config/multerConfig');
 *
 * This file is kept for backward compatibility but should not be used in new code.
 */

const { uploadLocal, uploadCloudinary, uploadImport, UPLOAD_DIR, ensureUploadDir } = require('../config/multerConfig');

// Legacy exports for backward compatibility
const getUploadMiddleware = (maxSize = 5 * 1024 * 1024) => {
  return uploadCloudinary;
};

const getImportUploadMiddleware = () => {
  return uploadImport;
};

module.exports = {
  getUploadMiddleware,
  getImportUploadMiddleware,
  ensureUploadDir,
  UPLOAD_DIR,
  // New exports
  uploadLocal,
  uploadCloudinary,
  uploadImport,
};
