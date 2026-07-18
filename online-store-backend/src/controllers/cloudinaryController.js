const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

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
      return res.status(400).json({
        error: 'Invalid folder',
        message: `Folder must be one of: ${allowedFolders.join(', ')}`,
      });
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
    res.status(500).json({
      error: 'Failed to generate signature',
      message: error.message,
    });
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
      return res.status(400).json({
        error: 'Invalid image metadata',
        message: 'publicId and url are required',
      });
    }

    // Validate image dimensions (reasonable range)
    const minDimension = 50;
    const maxDimension = 10000;
    if (width && (width < minDimension || width > maxDimension)) {
      return res.status(400).json({
        error: 'Invalid image dimensions',
        message: `Width must be between ${minDimension}px and ${maxDimension}px`,
      });
    }
    if (height && (height < minDimension || height > maxDimension)) {
      return res.status(400).json({
        error: 'Invalid image dimensions',
        message: `Height must be between ${minDimension}px and ${maxDimension}px`,
      });
    }

    // Validate file size (max 5MB)
    const maxFileSize = 5 * 1024 * 1024;
    if (bytes && bytes > maxFileSize) {
      return res.status(400).json({
        error: 'File too large',
        message: `File must be smaller than ${maxFileSize / 1024 / 1024}MB`,
      });
    }

    // Validate format
    const allowedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    if (type && !allowedFormats.includes(type.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid image format',
        message: `Format must be one of: ${allowedFormats.join(', ')}`,
      });
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
    res.status(500).json({
      error: 'Failed to validate image',
      message: error.message,
    });
  }
};
