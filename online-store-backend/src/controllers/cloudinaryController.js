const cloudinary = require('cloudinary').v2;
const { getMessage } = require('../i18n/messages');
const { validateCloudinaryImage } = require('../services/cloudinaryService');
const CloudinaryUploadClaim = require('../models/CloudinaryUploadClaim');
const { writeCloudinaryAudit } = require('../services/cloudinaryAuditService');

const sendCloudinaryError = (res, status, code, message, params) => {
  res.status(status).json({
    success: false,
    code,
    ...(params && { params }),
    error: message,
    message,
  });
};

const UPLOAD_QUOTAS_BY_ROLE = {
  user: 10,
  admin: 50,
  'super-admin': 100,
};

const FOLDERS_BY_ROLE = {
  user: ['users', 'reviewers'],
  admin: ['admins', 'users', 'reviewers', 'banners'],
  'super-admin': ['admins', 'users', 'reviewers', 'banners'],
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
exports.getCloudinarySignature = async (req, res) => {
  try {
    const { folder = 'users', purpose } = req.query;

    // Validate folder - only allow specific folders
    const allowedFolders = FOLDERS_BY_ROLE[req.user.role] || [];
    if (!allowedFolders.includes(folder)) {
      return sendCloudinaryError(
        res,
        400,
        'UPLOAD_FOLDER_INVALID',
        getMessage(req.lang, 'common.upload_failed')
      );
    }

    const purposeByFolder = {
      admins: 'product',
      banners: 'banner',
      users: 'avatar',
      reviewers: 'review',
    };
    const resolvedPurpose = purpose || purposeByFolder[folder];
    if (resolvedPurpose !== purposeByFolder[folder]) {
      return sendCloudinaryError(res, 400, 'UPLOAD_PURPOSE_INVALID', getMessage(req.lang, 'common.upload_failed'));
    }

    const now = new Date();
    const quota = UPLOAD_QUOTAS_BY_ROLE[req.user.role] || UPLOAD_QUOTAS_BY_ROLE.admin;
    const quotaWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [activeUploads, uploadsInQuotaWindow] = await Promise.all([
      CloudinaryUploadClaim.countDocuments({
        ownerId: req.user._id,
        status: { $in: ['issued', 'validating'] },
        expiresAt: { $gt: now },
      }),
      CloudinaryUploadClaim.countDocuments({
        ownerId: req.user._id,
        createdAt: { $gte: quotaWindowStart },
      }),
    ]);
    if (activeUploads >= 3) {
      return sendCloudinaryError(
        res,
        429,
        'UPLOAD_CONCURRENCY_LIMIT',
        getMessage(req.lang, 'common.upload_failed'),
        { limit: 3 }
      );
    }
    if (uploadsInQuotaWindow >= quota) {
      return sendCloudinaryError(
        res,
        429,
        'UPLOAD_QUOTA_EXCEEDED',
        getMessage(req.lang, 'common.upload_failed'),
        { limit: quota, windowHours: 24 }
      );
    }

    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const claim = await CloudinaryUploadClaim.create({
      ownerId: req.user._id,
      folder,
      purpose: resolvedPurpose,
      expiresAt,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `laptop-store/${folder}/${claim._id}`;
    claim.publicId = publicId;
    await claim.save();

    // Build the signature
    const paramsToSign = {
      allowed_formats: 'jpg,jpeg,png,webp,gif',
      overwrite: false,
      timestamp,
      public_id: publicId,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      timestamp,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      public_id: publicId,
      allowed_formats: 'jpg,jpeg,png,webp,gif',
      overwrite: false,
      resource_type: 'image',
      claimId: String(claim._id),
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
exports.validateUploadedImage = async (req, res) => {
  let claim;
  const { publicId, url, claimId } = req.body;

  try {

    if (!publicId || !url || !claimId) {
      return sendCloudinaryError(
        res,
        400,
        'IMAGE_METADATA_INVALID',
        getMessage(req.lang, 'common.image_validation_failed')
      );
    }

    claim = await CloudinaryUploadClaim.findOneAndUpdate(
      {
        _id: claimId,
        ownerId: req.user._id,
        publicId,
        status: 'issued',
        expiresAt: { $gt: new Date() },
      },
      { $set: { status: 'validating' } },
      { returnDocument: 'after' }
    );
    if (!claim) {
      return sendCloudinaryError(res, 400, 'UPLOAD_CLAIM_INVALID', getMessage(req.lang, 'common.image_validation_failed'));
    }

    try {
      const resource = await validateCloudinaryImage({ publicId, url });
      claim.url = resource.secure_url;
      claim.status = 'validated';
      await claim.save();

      await writeCloudinaryAudit({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'upload',
        cloudinaryPublicId: resource.public_id,
        claimId: claim._id,
        metadata: { bytes: resource.bytes, format: resource.format, width: resource.width, height: resource.height },
      });

      return res.json({
        success: true,
        image: {
          url: resource.secure_url,
          publicId: resource.public_id,
          width: resource.width,
          height: resource.height,
          bytes: resource.bytes,
          type: resource.format,
          claimId: String(claim._id),
        },
      });
    } catch (error) {
      claim.status = 'failed';
      await claim.save();
      await writeCloudinaryAudit({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'validate_failed',
        cloudinaryPublicId: publicId,
        claimId: claim._id,
        metadata: { errorCode: error.code || 'IMAGE_RESOURCE_INVALID' },
      });
      throw error;
    }


  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_VALIDATE_ERROR]', error);
    }
    sendCloudinaryError(
      res,
      400,
      'IMAGE_RESOURCE_INVALID',
      getMessage(req.lang, 'common.image_validation_failed')
    );
  }
};
