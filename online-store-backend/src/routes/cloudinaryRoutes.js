const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimitMiddleware');
const { getCloudinarySignature, validateUploadedImage } = require('../controllers/cloudinaryController');

const router = express.Router();

/**
 * GET /api/cloudinary/signature
 * Get signed parameters for direct Cloudinary upload
 * - Admin authentication required
 * - Returns timestamp, signature, API key, cloud_name
 */
router.get('/signature', protect, uploadLimiter, getCloudinarySignature);

/**
 * POST /api/cloudinary/validate
 * Validate uploaded image metadata
 * - Check image size, dimensions, format
 * - Save image reference to database
 * - Admin only
 */
router.post('/validate', protect, uploadLimiter, validateUploadedImage);

module.exports = router;
