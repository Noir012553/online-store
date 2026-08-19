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

const ALLOWED_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const isSupportedImageBuffer = (fileBuffer) => {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length < 12 || fileBuffer.length > MAX_IMAGE_BYTES) return false;

  const isJpeg = fileBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isPng = fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = fileBuffer.subarray(0, 6).toString('ascii') === 'GIF87a'
    || fileBuffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  const isWebp = fileBuffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && fileBuffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return isJpeg || isPng || isGif || isWebp;
};

const isValidImageResource = (resource) => {
  const minDimension = 50;
  const maxDimension = 10000;

  return resource.resource_type === 'image'
    && Number.isFinite(resource.width)
    && Number.isFinite(resource.height)
    && resource.width >= minDimension
    && resource.width <= maxDimension
    && resource.height >= minDimension
    && resource.height <= maxDimension
    && Number.isFinite(resource.bytes)
    && resource.bytes > 0
    && resource.bytes <= MAX_IMAGE_BYTES
    && ALLOWED_IMAGE_FORMATS.includes(String(resource.format).toLowerCase());
};

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
  if (!isSupportedImageBuffer(fileBuffer)) {
    throw new Error('Unsupported image content');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `laptop-store/${folder}`,
        public_id: publicId || undefined,
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto',
        timeout: 30000,
      },
      async (error, result) => {
        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[CLOUDINARY_ERROR]', error);
          }
          reject(error);
          return;
        }

        if (!isValidImageResource(result)) {
          try {
            await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' });
          } catch (cleanupError) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[CLOUDINARY_INVALID_UPLOAD_CLEANUP_ERROR]', cleanupError);
            }
          }
          reject(new Error('Cloudinary image metadata is invalid'));
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
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
 * @param {String|null} publicId - Public ID ổn định để ghi đè asset khi cần
 * @returns {Promise<Object>} - { url, publicId, format }
 */
const uploadFileToCloudinary = async (filePath, folder = 'admins', publicId = null) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `laptop-store/${folder}`,
      public_id: publicId || undefined,
      overwrite: Boolean(publicId),
      invalidate: Boolean(publicId),
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto',
    });

    if (!isValidImageResource(result)) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' });
      throw new Error('Cloudinary image metadata is invalid');
    }

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

const deleteCloudinaryImagesByPrefix = async (prefix) => {
  let nextCursor;
  let deleted = 0;

  do {
    const resources = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'upload',
      prefix,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });

    const publicIds = resources.resources.map(resource => resource.public_id);
    for (let index = 0; index < publicIds.length; index += 100) {
      const batch = publicIds.slice(index, index + 100);
      const result = await cloudinary.api.delete_resources(batch, {
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
      });
      deleted += Object.keys(result.deleted || {}).length;
    }

    nextCursor = resources.next_cursor;
  } while (nextCursor);

  return { deleted };
};

/**
 * Kiểm tra xem URL có phải từ Cloudinary không
 * Dùng để phân biệt URL CDN bên ngoài với URL Cloudinary mới
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
const getCloudinaryResource = async (publicId) => {
  return cloudinary.api.resource(publicId, { resource_type: 'image' });
};

const validateCloudinaryImage = async ({ publicId, url, allowedFolders = ['admins', 'users', 'reviewers', 'banners'] }) => {
  if (!publicId || !url) {
    throw new Error('Cloudinary image metadata is required');
  }

  const resource = await getCloudinaryResource(publicId);
  const folderPrefix = 'laptop-store/';
  const isAllowedResource = resource.resource_type === 'image'
    && resource.public_id.startsWith(folderPrefix)
    && allowedFolders.some((folder) => resource.public_id.startsWith(`${folderPrefix}${folder}/`));

  if (!isAllowedResource || resource.secure_url !== url) {
    throw new Error('Cloudinary image resource is invalid');
  }

  if (!isValidImageResource(resource)) {
    throw new Error('Cloudinary image metadata is invalid');
  }

  return resource;
};

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
  deleteCloudinaryImagesByPrefix,
  isCloudinaryUrl,
  extractPublicIdFromUrl,
  getCloudinaryResource,
  validateCloudinaryImage,
};
