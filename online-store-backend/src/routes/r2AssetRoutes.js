const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimitMiddleware');
const { uploadMemory } = require('../middleware/uploadMiddleware');
const { validateImageUpload } = require('../middleware/uploadValidationMiddleware');
const { uploadR2Asset } = require('../controllers/r2AssetController');

const router = express.Router();

router.post('/upload', protect, uploadLimiter, uploadMemory.single('file'), validateImageUpload, uploadR2Asset);

module.exports = router;
