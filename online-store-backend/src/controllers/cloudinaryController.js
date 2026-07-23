const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');
const { getMessage } = require('../i18n/messages');

const sendCloudinaryError = (res, status, code, message) => {
  res.status(status).json({
    success: false,
    code,
    error: message,
    message,
  });
};

/**
 * Get signed parameters for Cloudinary direct upload
 * 
 * POST request to Cloudinary must include:
 * - timestamp
 * - signature (SHA1 hash of params + api_secret)
 * - api_key
 * 
 * @route GET /api/cloudinary/signature
 * @param {String} query.folder - Upload folder (admins, users, reviews)
 * @access Public (but folder validated)
 */
exports.getCloudinarySignature = (req, res) => {
  try {
    const { folder = 'users' } = req.query;

    // Validate folder - only allow specific folders
    const allowedFolders = ['admins', 'users', 'reviewers', 'banners'];
    if (!allowedFolders.includes(folder)) {
      return sendCloudinaryError(
        res,
        400,
        'UPLOAD_FOLDER_INVALID',
        getMessage(req.lang, 'common.upload_failed')
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Build the signature
    const paramsToSign = {
      timestamp,
      folder: `laptop-store/${folder}`,
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto',
    };

    // Create signature string (params sorted by key + api_secret)
    const paramsString = Object.keys(paramsToSign)
      .sort()
      .map((key) => `${key}=${paramsToSign[key]}`)
      .join('&') + process.env.CLOUDINARY_API_SECRET;

    const signature = crypto.createHash('sha1').update(paramsString).digest('hex');

    res.json({
      timestamp,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      folder: `laptop-store/${folder}`,
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto',
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_SIGNATURE_ERROR]', error);
    }
    sendCloudinaryError(
      res,
      500,
      'UPLOAD_SIGNATURE_FAILED',
      getMessage(req.lang, 'common.upload_signature_error')
    );
  }
};

/**
 * Validate uploaded image metadata
 * Called after successful Cloudinary upload
 * 
 * @route POST /api/cloudinary/validate
 * @body {String} publicId - Cloudinary public ID
 * @body {String} url - Cloudinary image URL
 * @body {String} resourceType - Resource type (image)
 * @body {Number} width - Image width
 * @body {Number} height - Image height
 * @body {Number} bytes - File size
 * @body {String} type - Image format (jpeg, png, etc)
 * @access Private (admin only)
 */
exports.validateUploadedImage = (req, res) => {
  try {
    const { publicId, url, width, height, bytes, type } = req.body;

    // Validate required fields
    if (!publicId || !url) {
      return sendCloudinaryError(
        res,
        400,
        'IMAGE_METADATA_INVALID',
        getMessage(req.lang, 'common.image_validation_failed')
      );
    }

    // Validate image dimensions (reasonable range)
    const minDimension = 50;
    const maxDimension = 10000;
    if (width && (width < minDimension || width > maxDimension)) {
      return sendCloudinaryError(
        res,
        400,
        'IMAGE_DIMENSIONS_INVALID',
        getMessage(req.lang, 'common.image_validation_failed')
      );
    }
    if (height && (height < minDimension || height > maxDimension)) {
      return sendCloudinaryError(
        res,
        400,
        'IMAGE_DIMENSIONS_INVALID',
        getMessage(req.lang, 'common.image_validation_failed')
      );
    }

    // Validate file size (max 5MB)
    const maxFileSize = 5 * 1024 * 1024;
    if (bytes && bytes > maxFileSize) {
      return sendCloudinaryError(
        res,
        400,
        'UPLOAD_FILE_TOO_LARGE',
        getMessage(req.lang, 'common.upload_file_too_large')
      );
    }

    // Validate format
    const allowedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    if (type && !allowedFormats.includes(type.toLowerCase())) {
      return sendCloudinaryError(
        res,
        400,
        'IMAGE_FORMAT_INVALID',
        getMessage(req.lang, 'common.upload_file_must_be_image')
      );
    }

    // All validations passed
    res.json({
      success: true,
      image: {
        url,
        publicId,
        width,
        height,
        bytes,
        type,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_VALIDATE_ERROR]', error);
    }
    sendCloudinaryError(
      res,
      500,
      'IMAGE_VALIDATION_REQUEST_FAILED',
      getMessage(req.lang, 'common.image_validation_request_failed')
    );
  }
};
