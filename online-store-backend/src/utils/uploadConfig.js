/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { checkFileType, generateFileName } = require('./fileUtils');

const UPLOAD_DIR = 'uploads';

/**
 * Tạo thư mục upload nếu chưa tồn tại
 */
const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};

/**
 * Cấu hình lưu trữ file với multer
 * - Destination: uploads folder
 * - Filename: Auto-generated với timestamp để tránh trùng lặp
 */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const fileName = generateFileName(file);
    cb(null, fileName);
  },
});

/**
 * Tạo multer middleware instance
 * Hỗ trợ:
 * - File type validation (chỉ hình ảnh)
 * - File size limit (mặc định 5MB)
 * @param {Number} maxSize - Kích thước tối đa file (bytes)
 * @returns {Object} Multer middleware instance
 */
const getUploadMiddleware = (maxSize = 5 * 1024 * 1024) => {
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      checkFileType(file, cb);
    },
    limits: {
      fileSize: maxSize,
    },
  });
};

module.exports = {
  getUploadMiddleware,
  ensureUploadDir,
  UPLOAD_DIR,
};
