/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const path = require('path');

/**
 * Kiểm tra loại file được phép upload
 * Chỉ hỗ trợ các định dạng ảnh: jpeg, jpg, png, gif
 * @param {Object} file - File object từ multer
 * @param {Function} cb - Callback function
 */
const checkFileType = (file, cb) => {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Images Only! Allowed: jpeg, jpg, png, gif'));
  }
};

/**
 * Tạo tên file duy nhất với timestamp
 * Format: {filename}-{timestamp}.{extension}
 * @param {Object} file - File object từ multer
 * @returns {String} Tên file mới
 */
const generateFileName = (file) => {
  const timestamp = Date.now();
  const ext = path.extname(file.originalname);
  const name = path.basename(file.originalname, ext);
  return `${name}-${timestamp}${ext}`;
};

module.exports = {
  checkFileType,
  generateFileName,
};
