const express = require('express');
const router = express.Router();
const translationController = require('../controllers/translationController');
const { protect, admin } = require('../middleware/authMiddleware');

// Admin namespaces
router.get('/namespaces', translationController.getSupportedNamespaces);

// Admin static routes (must come before :id pattern)
router.post(
  '/admin/sync-from-json',
  protect,
  admin,
  translationController.syncTranslationsFromJSON
);

router.post(
  '/admin/cache-stats',
  protect,
  admin,
  translationController.getCacheStats
);

router.post(
  '/admin/clear-cache',
  protect,
  admin,
  translationController.clearOldCache
);

router.get(
  '/admin/cache-records',
  protect,
  admin,
  translationController.getCacheRecords
);

router.get(
  '/admin/list',
  protect,
  admin,
  translationController.listTranslations
);

// Admin dynamic routes (with :id parameter)
router.get(
  '/admin/:id',
  protect,
  admin,
  translationController.getTranslationById
);

router.put(
  '/admin/:id/key',
  protect,
  admin,
  translationController.updateTranslationKey
);

router.delete(
  '/admin/:id/key',
  protect,
  admin,
  translationController.deleteTranslationKey
);

router.delete(
  '/admin/:id/soft',
  protect,
  admin,
  translationController.softDeleteTranslation
);

router.delete(
  '/admin/:id/hard',
  protect,
  admin,
  translationController.hardDeleteTranslation
);

router.post(
  '/admin/:id/restore',
  protect,
  admin,
  translationController.restoreTranslation
);

// Public routes
router.post('/translate', translationController.translateText);

router.get('/reviews/:id', translationController.getReviewTranslations);

router.get('/', translationController.getStaticTranslations);

router.post('/', protect, admin, translationController.createStaticTranslation);

router.get('/lang/:lang', translationController.getAllTranslationsByLang);

router.post(
  '/bulk-sync',
  protect,
  admin,
  translationController.bulkTranslateStaticUI
);

router.post(
  '/bulk-translate-static',
  protect,
  admin,
  translationController.bulkTranslateStaticUI
);

router.post(
  '/static',
  protect,
  admin,
  translationController.createStaticTranslation
);

// ============ ADMIN DASHBOARD APIs (Phase 2) ============

router.get(
  '/admin/status/:lang',
  protect,
  admin,
  translationController.getTranslationStatus
);

router.get(
  '/admin/failed/:lang',
  protect,
  admin,
  translationController.getFailedTranslations
);

router.post(
  '/admin/retry/:lang',
  protect,
  admin,
  translationController.retryFailedTranslations
);

router.post(
  '/admin/edit-manual',
  protect,
  admin,
  translationController.editTranslationManual
);

router.post(
  '/admin/batch-edit',
  protect,
  admin,
  translationController.batchEditTranslations
);

// ============ MANUAL OVERRIDE APIs (Layer 2 - Products) ============

router.post(
  '/admin/manual-override',
  protect,
  admin,
  translationController.manualOverrideTranslation
);

router.post(
  '/admin/batch-manual-override',
  protect,
  admin,
  translationController.batchManualOverride
);

module.exports = router;
