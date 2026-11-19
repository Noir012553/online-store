const express = require('express');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimitMiddleware');
const { uploadMemory } = require('../middleware/uploadMiddleware');
const { validateImageUpload } = require('../middleware/uploadValidationMiddleware');
const storeSettingsController = require('../controllers/storeSettingsController');

const router = express.Router();

router.get('/public', storeSettingsController.getPublicSettings);
router.get('/admin', protect, superAdmin, storeSettingsController.getAdminSettings);
router.put('/admin', protect, superAdmin, storeSettingsController.updateAdminSettings);
router.delete('/admin', protect, superAdmin, storeSettingsController.resetAdminSettings);
router.get('/admin/audit', protect, superAdmin, storeSettingsController.getAuditLogs);
router.post(
  '/admin/branding/assets',
  protect,
  superAdmin,
  uploadLimiter,
  uploadMemory.single('file'),
  validateImageUpload,
  storeSettingsController.uploadBrandAsset,
);

module.exports = router;
