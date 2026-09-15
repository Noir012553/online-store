/**
 * Upload Middleware - Xử lý file uploads
 * 
 * Chiến lược lưu trữ:
 * - User/Review Avatars → R2 (via memory buffer)
 * - Product/Banner Images → R2 (via memory buffer)
 * - Import Files → Memory (JSON/CSV/ZIP)
 */

const { uploadLocal, uploadMemory, uploadImport } = require('../config/multerConfig');

/**
 * Default upload middleware (dùng cho product/banner - R2)
 * Route sẽ override nếu cần loại khác
 */
const upload = uploadMemory;

module.exports = upload;
module.exports.uploadLocal = uploadLocal;
module.exports.uploadMemory = uploadMemory;
module.exports.uploadImport = uploadImport;
