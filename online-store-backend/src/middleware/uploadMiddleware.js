/**
 * Middleware - Xử lý request/response, xác thực, phân quyền
 */

const { getUploadMiddleware } = require('../utils/uploadConfig');

/**
 * Middleware xử lý upload file cho sản phẩm
 * - Tối đa 5MB
 * - Chỉ hỗ trợ image files
 * - Admin only (thông qua protect + admin middleware)
 */
const upload = getUploadMiddleware(5 * 1024 * 1024);

module.exports = upload;
