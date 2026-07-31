/**
 * Upload Middleware - Xử lý file uploads
 * 
 * Chiến lược lưu trữ:
 * - User/Review Avatars → Local disk (uploads/users/, uploads/reviewers/)
 * - Product/Banner Images → Cloudinary (via memory buffer)
 * - Import Files → Memory (JSON/CSV)
 */

const { uploadLocal, uploadCloudinary, uploadImport } = require('../config/multerConfig');

/**
 * Default upload middleware (dùng cho product/banner - Cloudinary)
 * Route sẽ override nếu cần loại khác
 */
const upload = uploadCloudinary;

module.exports = upload;
module.exports.uploadLocal = uploadLocal;
module.exports.uploadCloudinary = uploadCloudinary;
module.exports.uploadImport = uploadImport;
