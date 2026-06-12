const express = require('express');
const router = express.Router();
const languageController = require('../controllers/languageController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public: Get supported AI languages
router.get('/supported', languageController.getSupportedLanguages);

// Admin: Get all languages in system (used in admin UI)
router.get('/', protect, languageController.getAllLanguages);

// Admin: Get language setup status (for monitoring 3-phase setup)
router.get('/:code/setup-status', protect, admin, languageController.getLanguageSetupStatus);

// Admin: Get translation progress & error statistics
router.get('/:code/translation-progress', protect, admin, languageController.getTranslationProgress);

// Admin: Get failed translations list (for manual override)
router.get('/:code/failed-translations', protect, admin, languageController.getFailedTranslations);

// Admin: Retry failed translations (trigger background job)
router.post('/:code/retry-failed', protect, admin, languageController.retryFailedTranslations);

// Admin: Create new language
router.post('/', protect, admin, languageController.createLanguage);

// Admin: Update language
router.put('/:id', protect, admin, languageController.updateLanguage);

// Admin: Delete language
router.delete('/:id', protect, admin, languageController.deleteLanguage);

module.exports = router;
