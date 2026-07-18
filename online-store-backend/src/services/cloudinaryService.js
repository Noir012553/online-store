/**
 * Cloudinary Service - Quản lý upload & delete file lên Cloudinary
 * 
 * Tại sao Cloudinary thay vì local storage?
 * - Multi-instance: Không cần lo sync file giữa các server
 * - CDN: Ảnh được cache & deliver gần user
 * - Backup: Tự động backup, không sợ mất file
 * - Transformation: Có thể resize, crop, optimize ảnh on-the-fly
 */

const cloudinary = require('cloudinary').v2;

// Configure cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file lên Cloudinary từ buffer (Multer)
 * 
 * @param {Buffer} fileBuffer - File content từ req.file.buffer
 * @param {String} folder - Folder trong Cloudinary (admins, users, reviews)
 * @param {String} publicId - Public ID cho file (optional)
 * @returns {Promise<Object>} - { url, publicId, format }
 */
const uploadToCloudinary = async (fileBuffer, folder = 'admins', publicId = null) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `laptop-store/${folder}`, // Path trong Cloudinary
        public_id: publicId || undefined, // Đặt public_id nếu cần
        resource_type: 'auto', // Auto-detect type (image, video, etc)
        quality: 'auto', // Auto optimize quality
        fetch_format: 'auto', // Auto convert format (webp if supported)
        timeout: 30000, // 30 seconds timeout
      },
      (error, result) => {
        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[CLOUDINARY_ERROR]', error);
          }
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
          });
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
};

/**
 * Upload file lên Cloudinary từ file path (local or URL)
 * Hữu ích cho migration từ local storage
 * 
 * @param {String} filePath - Path/URL của file
 * @param {String} folder - Folder trong Cloudinary
 * @returns {Promise<Object>} - { url, publicId, format }
 */
const uploadFileToCloudinary = async (filePath, folder = 'admins') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `laptop-store/${folder}`,
      resource_type: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_UPLOAD_ERROR]', error);
    }
    throw error;
  }
};

/**
 * Delete file từ Cloudinary
 * 
 * @param {String} publicId - Public ID của file trong Cloudinary
 * @returns {Promise<Object>} - { result, deleted: true/false }
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CLOUDINARY_DELETE] No publicId provided');
      }
      return { deleted: false };
    }

    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      return { deleted: true, result };
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CLOUDINARY_DELETE_WARNING]', { publicId, result });
      }
      return { deleted: false, result };
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_DELETE_ERROR]', error);
    }
    throw error;
  }
};

/**
 * Delete multiple files từ Cloudinary
 * 
 * @param {Array<String>} publicIds - Array của public IDs
 * @returns {Promise<Object>} - { deleted: number, failed: number, errors: [] }
 */
const deleteMultipleFromCloudinary = async (publicIds) => {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    return { deleted: 0, failed: 0, errors: [] };
  }

  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const publicId of publicIds) {
    try {
      const result = await deleteFromCloudinary(publicId);
      if (result.deleted) {
        deleted++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      errors.push({ publicId, error: error.message });
    }
  }

  return { deleted, failed, errors };
};

/**
 * Kiểm tra xem URL có phải từ Cloudinary không
 * Dùng để phân biệt giữa seeded CDN URL (gearvn) vs new Cloudinary URLs
 * 
 * @param {String} url - Image URL
 * @returns {Boolean}
 */
const isCloudinaryUrl = (url) => {
  if (!url) return false;
  return url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
};

/**
 * Extract public ID từ Cloudinary URL
 * 
 * @param {String} cloudinaryUrl - URL từ Cloudinary (https://res.cloudinary.com/.../...)
 * @returns {String} - Public ID (folder/filename)
 */
const extractPublicIdFromUrl = (cloudinaryUrl) => {
  try {
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.{format}
    // Extract: folder/filename
    const match = cloudinaryUrl.match(/\/upload\/(.+?)\.\w+$/);
    return match ? match[1] : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_EXTRACT_ID]', error);
    }
    return null;
  }
};

module.exports = {
  uploadToCloudinary,
  uploadFileToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  isCloudinaryUrl,
  extractPublicIdFromUrl,
};
