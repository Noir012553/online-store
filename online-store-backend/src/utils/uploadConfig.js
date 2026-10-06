const { uploadMemory, uploadImport } = require('../config/multerConfig');

const getUploadMiddleware = () => uploadMemory;
const getImportUploadMiddleware = () => uploadImport;

module.exports = {
  getUploadMiddleware,
  getImportUploadMiddleware,
  uploadMemory,
  uploadImport,
};
