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
  const allowedTypes = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const extension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes[extension] === file.mimetype) {
    return cb(null, true);
  }

  return cb(new Error('Images Only! Allowed: jpeg, jpg, png, gif, webp'));
};

/**
 * Tạo tên file duy nhất với format: [role]_[userId]_[timestamp].[extension]
 * Ví dụ: admin_507f1f77bcf86cd799439011_1704067200000.png
 * @param {Object} file - File object từ multer
 * @param {Object} req - Express request object (để lấy user info)
 * @returns {String} Tên file mới
 */
const validateImportFile = (file) => {
  const allowedTypes = {
    '.json': ['application/json'],
    '.csv': ['text/csv', 'application/vnd.ms-excel'],
  };
  const extension = path.extname(file?.originalname || '').toLowerCase();

  if (!allowedTypes[extension]?.includes(file?.mimetype)) {
    const error = new Error('IMPORT_FILE_TYPE_MISMATCH');
    error.code = 'IMPORT_FILE_TYPE_MISMATCH';
    throw error;
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.includes(0)) {
    const error = new Error('IMPORT_FILE_CONTENT_INVALID');
    error.code = 'IMPORT_FILE_CONTENT_INVALID';
    throw error;
  }

  const content = file.buffer.toString('utf8').trim();
  if (!content || content.includes(String.fromCharCode(0xfffd))) {
    const error = new Error('IMPORT_FILE_CONTENT_INVALID');
    error.code = 'IMPORT_FILE_CONTENT_INVALID';
    throw error;
  }

  if (extension === '.json') {
    try {
      JSON.parse(content);
    } catch {
      const error = new Error('IMPORT_FILE_CONTENT_INVALID');
      error.code = 'IMPORT_FILE_CONTENT_INVALID';
      throw error;
    }
  } else if (content.startsWith('{') || content.startsWith('[') || !content.includes('\n')) {
    const error = new Error('IMPORT_FILE_CONTENT_INVALID');
    error.code = 'IMPORT_FILE_CONTENT_INVALID';
    throw error;
  }

  return { format: extension.slice(1) };
};

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
  validateImportFile,
  generateFileName,
  deleteImageFile,
};
