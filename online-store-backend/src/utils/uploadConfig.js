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
 * @param {String} subDir - Thư mục con (users, admins, reviewers)
 */
const ensureUploadDir = (subDir = '') => {
  const fullPath = subDir ? path.join(UPLOAD_DIR, subDir) : UPLOAD_DIR;
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
};

/**
 * Cấu hình lưu trữ file với multer
 *
 * Strategy:
 * - Hình ảnh sản phẩm từ admin: dùng memory storage → upload lên Cloudinary
 * - Hình ảnh từ user (avatar, review): dùng memory storage → upload lên Cloudinary
 * - Seed data từ gearvn: keep CDN URL cũ
 *
 * Dùng memoryStorage để file có sẵn trong req.file.buffer, controller sẽ upload lên Cloudinary
 */
const storage = multer.memoryStorage();

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

/**
 * Create multer middleware for data file imports (JSON, CSV)
 * - Accepts JSON & CSV files
 * - Larger file size limit (10MB)
 * - Does not save to disk (memoryStorage)
 * @returns {Object} Multer middleware instance
 */
const getImportUploadMiddleware = () => {
  const memoryStorage = multer.memoryStorage();

  return multer({
    storage: memoryStorage,
    fileFilter: (req, file, cb) => {
      // Accept JSON and CSV files only
      const allowedMimes = ['application/json', 'text/csv', 'application/vnd.ms-excel'];
      const allowedExtensions = ['.json', '.csv'];

      const ext = path.extname(file.originalname).toLowerCase();
      const isMimeValid = allowedMimes.includes(file.mimetype);
      const isExtValid = allowedExtensions.includes(ext);

      if (isExtValid || isMimeValid) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Only .json and .csv are allowed`), false);
      }
    },
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB - supports large descriptions and multiple images
    },
  });
};

module.exports = {
  getUploadMiddleware,
  getImportUploadMiddleware,
  ensureUploadDir,
  UPLOAD_DIR,
};
