const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { getCloudinarySignature, validateUploadedImage } = require('../controllers/cloudinaryController');

const router = express.Router();

/**
 * GET /api/cloudinary/signature
 * Get signed parameters for direct Cloudinary upload
 * - Public endpoint (no auth required for unsigned params)
 * - Returns timestamp, signature, API key, cloud_name
 */
router.get('/signature', getCloudinarySignature);

/**
 * POST /api/cloudinary/validate
 * Validate uploaded image metadata
 * - Check image size, dimensions, format
 * - Save image reference to database
 * - Admin only
 */
router.post('/validate', protect, authorize('admin', 'super-admin'), validateUploadedImage);

module.exports = router;
