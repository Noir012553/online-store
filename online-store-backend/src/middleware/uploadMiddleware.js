const { uploadMemory, uploadImport } = require('../config/multerConfig');

const upload = uploadMemory;

module.exports = upload;
module.exports.uploadMemory = uploadMemory;
module.exports.uploadImport = uploadImport;
