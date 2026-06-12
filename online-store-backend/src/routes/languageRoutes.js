const express = require('express');
const router = express.Router();
const languageController = require('../controllers/languageController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public: Get supported AI languages
router.get('/supported', languageController.getSupportedLanguages);

// Admin: Get all languages in system (used in admin UI)
router.get('/', protect, languageController.getAllLanguages);

// Admin: Get language setup status
router.get('/:code/setup-status', protect, admin, languageController.getLanguageSetupStatus);

// Admin: Create new language
router.post('/', protect, admin, languageController.createLanguage);

// Admin: Update language
router.put('/:id', protect, admin, languageController.updateLanguage);

// Admin: Delete language
router.delete('/:id', protect, admin, languageController.deleteLanguage);

module.exports = router;
