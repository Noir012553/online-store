/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const path = require('path');
const fs = require('fs');

/**
 * Kiểm tra loại file được phép upload
 * Chỉ hỗ trợ các định dạng ảnh: jpeg, jpg, png, gif, webp
 * @param {Object} file - File object từ multer
 * @param {Function} cb - Callback function
 */
const checkFileType = (file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Images Only! Allowed: jpeg, jpg, png, gif'));
  }
};

/**
 * Tạo tên file duy nhất với format: [role]_[userId]_[timestamp].[extension]
 * Ví dụ: admin_507f1f77bcf86cd799439011_1704067200000.png
 * @param {Object} file - File object từ multer
 * @param {Object} req - Express request object (để lấy user info)
 * @returns {String} Tên file mới
 */
const generateFileName = (file, req) => {
  const ext = path.extname(file.originalname);
  const timestamp = Date.now();
  const userId = req.user?._id || 'unknown';

  let prefix = 'user';
  if (req.user) {
    if (req.user.role === 'admin' || req.user.role === 'super-admin') {
      prefix = 'admin';
    } else if (req.user.role === 'reviewer') {
      prefix = 'reviewer';
    }
  }

  return `${prefix}_${userId}_${timestamp}${ext}`;
};

/**
 * Xóa file ảnh từ disk
 * @param {String} filePath - Path của file (từ DB, vd: "/uploads/admins/...")
 * @returns {Boolean} true nếu xóa thành công, false nếu không
 */
const deleteImageFile = (filePath) => {
  if (!filePath) return false;

  try {
    // Chuyển đổi path: "/uploads/..." -> "uploads/..."
    const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = path.join(process.cwd(), relativePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
};

module.exports = {
  checkFileType,
  generateFileName,
  deleteImageFile,
};
