/**
 * Multer Configuration - Cấu hình upload file
 * Tách biệt: Local Storage vs Memory Storage
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { checkFileType } = require('../utils/fileUtils');

const UPLOAD_DIR = 'uploads';

/**
 * Tạo thư mục nếu chưa tồn tại
 */
const ensureUploadDir = (subDir = '') => {
  const fullPath = subDir ? path.join(UPLOAD_DIR, subDir) : UPLOAD_DIR;
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
};

/**
 * LOCAL STORAGE - Cho User Avatars & Review Avatars
 * Lưu trữ trực tiếp vào đĩa (uploads/users/ hoặc uploads/reviewers/)
 */
const createLocalStorage = () => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      // Xác định folder con dựa trên route
      let subFolder = 'users';
      
      if (req.baseUrl.includes('/reviews')) {
        subFolder = 'reviewers';
      } else if (req.baseUrl.includes('/users') && req.baseUrl.includes('/avatar')) {
        subFolder = 'users';
      }
      
      const uploadPath = ensureUploadDir(subFolder);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      // Tạo filename duy nhất: fieldname-timestamp-random.ext
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });
};

/**
 * MEMORY STORAGE - Cho Product & Banner Images
 * Lưu vào RAM, sẽ được upload lên Cloudinary trong controller
 */
const memoryStorage = multer.memoryStorage();

/**
 * FILE FILTER - Bộ lọc định dạng file cho cả local và memory
 */
const imageFileFilter = (req, file, cb) => {
  checkFileType(file, cb);
};

/**
 * LOCAL UPLOAD - Dành cho User & Review Avatars
 * Lưu trực tiếp vào uploads/ folder trên server
 */
const uploadLocal = multer({
  storage: createLocalStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/**
 * CLOUDINARY UPLOAD - Dành cho Product & Banner Images
 * Lưu vào memory buffer, sẽ được upload lên Cloudinary
 */
const uploadCloudinary = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/**
 * IMPORT UPLOAD - Dành cho nhập khẩu dữ liệu (JSON/CSV)
 */
const uploadImport = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/json', 'text/csv', 'application/vnd.ms-excel'];
    const allowedExtensions = ['.json', '.csv'];
    
    const ext = path.extname(file.originalname).toLowerCase();
    const isMimeValid = allowedMimes.includes(file.mimetype);
    const isExtValid = allowedExtensions.includes(ext);
    
    if (isExtValid || isMimeValid) {
      cb(null, true);
    } else {
      cb(new Error('Only .json and .csv files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

module.exports = {
  uploadLocal,      // Cho user/review avatars
  uploadCloudinary, // Cho product/banner images
  uploadImport,     // Cho import files (JSON/CSV)
  ensureUploadDir,
  UPLOAD_DIR,
};
