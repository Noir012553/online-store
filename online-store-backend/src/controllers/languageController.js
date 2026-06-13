const Language = require('../models/Language');
const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const LanguageService = require('../services/languageService');
const TranslationSeederService = require('../services/translationSeederService');
const crypto = require('crypto');

const SUPPORTED_LANGUAGES = {
  en: 'English',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  nl: 'Nederlands',
  sv: 'Svenska',
};

const LANGUAGE_NAMES = {
  en: { display: 'English', native: 'English' },
  pt: { display: 'Português', native: 'Português' },
  fr: { display: 'Français', native: 'Français' },
  de: { display: 'Deutsch', native: 'Deutsch' },
  it: { display: 'Italiano', native: 'Italiano' },
  es: { display: 'Español', native: 'Español' },
  nl: { display: 'Nederlands', native: 'Nederlands' },
  sv: { display: 'Svenska', native: 'Svenska' },
};

// Get all supported languages
exports.getSupportedLanguages = async (req, res) => {
  try {
    const languages = Object.keys(SUPPORTED_LANGUAGES).map((code) => ({
      code,
      name: LANGUAGE_NAMES[code].display,
      nativeName: LANGUAGE_NAMES[code].native,
    }));

    res.json({
      success: true,
      data: languages,
    });
  } catch (error) {
    console.error('[LanguageController] Error getting supported languages:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all active languages in system
exports.getAllLanguages = async (req, res) => {
  try {
    const languages = await Language.find().sort({ isSystemDefault: -1, createdAt: 1 });

    res.json({
      success: true,
      data: languages,
    });
  } catch (error) {
    console.error('[LanguageController] Error getting languages:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new language - 3-Phase Timeline Implementation
exports.createLanguage = async (req, res) => {
  try {
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Code and name are required',
      });
    }

    if (!SUPPORTED_LANGUAGES[code.toLowerCase()]) {
      const supportedCodes = Object.keys(SUPPORTED_LANGUAGES).join(', ');
      return res.status(400).json({
        success: false,
        message: `Language code ${code} is not supported. Supported languages: ${supportedCodes}`,
      });
    }

    const existingLang = await Language.findOne({ code: code.toLowerCase() });
    if (existingLang) {
      return res.status(409).json({
        success: false,
        message: `Language ${code} already exists in system`,
      });
    }

    const langCode = code.toLowerCase();

    // ============ T = 0: Create Language Record (< 100ms) ============
    const newLang = await Language.create({
      code: langCode,
      name,
      isActive: true,
      isReady: false,
      setupStartedAt: new Date(),
      nativeName: LANGUAGE_NAMES[langCode]?.native || name,
    });

    console.log(`\n[Language] 🚀 T=0: Language record created for ${langCode}`);

    res.status(201).json({
      success: true,
      message: `Language added. Background setup started (PHASE 1-3). Check setupStatus endpoint to monitor progress.`,
      data: newLang,
    });

    // ============ 3-Phase Background Job ============
    setImmediate(async () => {
      try {
        console.log(`\n[Language] ⏱️  Background Setup Timeline for ${langCode}:`);
        console.log(`  T+0s: Response sent to client`);
        console.log(`  T+1s: PHASE 1 (Clone + Translate UI strings)`);
        console.log(`  T+30s: PHASE 2 (Translate all products with chunking)`);
        console.log(`  T+120s: PHASE 3 (Finalize & activate)\n`);

        // ========== PHASE 1: Clone & Translate UI (T+1s to T+30s) ==========
        try {
          console.log(`[Language] 📍 PHASE 1: Clone UI strings từ English sang ${langCode}`);
          const clonedCount = await TranslationSeederService.cloneStaticTranslations('en', langCode);
          console.log(`[Language] ✓ Clone hoàn tất: ${clonedCount} namespaces`);

          if (clonedCount > 0) {
            console.log(`[Language] 📍 PHASE 1.5: Dịch UI strings (concurrency=5, throttle=1000ms)`);
            const translatedCount = await TranslationSeederService.translateStaticTranslations(
              langCode,
              'en'
            );
            console.log(`[Language] ✓ Dịch xong: ${translatedCount} UI keys`);
          }
        } catch (phase1Error) {
          console.error(`[Language] ❌ PHASE 1 lỗi: ${phase1Error.message}`);
        }

        // ========== PHASE 2: Translate Products (T+30s to T+120s) ==========
        try {
          console.log(`\n[Language] 📍 PHASE 2: Dịch sản phẩm (chunking=20, concurrency=3, throttle=1500ms)`);
          const ProductTranslationSeederService = require('../services/productTranslationSeederService');

          const { successCount, errorCount, totalProcessed } =
            await ProductTranslationSeederService.translateAllProducts(langCode, 'vi');

          console.log(`[Language] ✓ PHASE 2 hoàn tất:`);
          console.log(`    • Thành công: ${successCount} fields`);
          console.log(`    • Lỗi: ${errorCount} fields`);
          console.log(`    • Tổng xử lý: ${totalProcessed} fields`);
        } catch (phase2Error) {
          console.error(`[Language] ❌ PHASE 2 lỗi: ${phase2Error.message}`);
        }

        // ========== PHASE 3: Finalize & Activate (T+120s+) ==========
        try {
          console.log(`\n[Language] 📍 PHASE 3: Hoàn tất và kích hoạt`);

          LanguageService.invalidateCache();
          console.log(`[Language] ✓ Language cache invalidated`);

          await Language.updateOne(
            { code: langCode },
            {
              $set: {
                isReady: true,
                setupCompletedAt: new Date(),
              },
            }
          );

          console.log(`[Language] ✓ ${langCode} is READY (isReady=true)`);
          console.log(`\n[Language] 🎉 SETUP COMPLETE for ${langCode}!\n`);
        } catch (phase3Error) {
          console.error(`[Language] ❌ PHASE 3 lỗi: ${phase3Error.message}`);
          await Language.updateOne(
            { code: langCode },
            { $set: { isReady: false, setupCompletedAt: new Date() } }
          ).catch(err => console.error(`[Language] Cannot update language: ${err.message}`));
        }
      } catch (backgroundError) {
        console.error(`[Language] ❌ Unexpected error in background task: ${backgroundError.message}`);
        console.error(backgroundError.stack);

        try {
          await Language.updateOne(
            { code: langCode },
            { $set: { isReady: false, setupCompletedAt: new Date() } }
          );
        } catch (updateErr) {
          console.error(`[Language] Cannot update language status: ${updateErr.message}`);
        }
      }
    });
  } catch (error) {
    console.error('[LanguageController] Error creating language:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get language setup status
exports.getLanguageSetupStatus = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const language = await Language.findOne({ code: code.toLowerCase() });

    if (!language) {
      return res.status(404).json({
        success: false,
        message: 'Language not found',
      });
    }

    const setupDurationSeconds = language.setupCompletedAt && language.setupStartedAt
      ? (language.setupCompletedAt - language.setupStartedAt) / 1000
      : null;

    res.json({
      success: true,
      data: {
        code: language.code,
        name: language.name,
        isReady: language.isReady,
        setupStartedAt: language.setupStartedAt,
        setupCompletedAt: language.setupCompletedAt,
        setupDurationSeconds,
        status: language.isReady ? 'READY' : 'SETTING_UP',
      },
    });
  } catch (error) {
    console.error('[LanguageController] Error getting setup status:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update language status
exports.updateLanguage = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, name } = req.body;

    const language = await Language.findByIdAndUpdate(
      id,
      { isActive, name },
      { new: true, runValidators: true }
    );

    if (!language) {
      return res.status(404).json({
        success: false,
        message: 'Language not found',
      });
    }

    // Invalidate cache when language status changes
    LanguageService.invalidateCache();

    res.json({
      success: true,
      data: language,
    });
  } catch (error) {
    console.error('[LanguageController] Error updating language:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete language
exports.deleteLanguage = async (req, res) => {
  try {
    const { id } = req.params;

    const language = await Language.findById(id);
    if (!language) {
      return res.status(404).json({
        success: false,
        message: 'Language not found',
      });
    }

    if (language.isSystemDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system default language',
      });
    }

    await Language.findByIdAndDelete(id);

    // Invalidate cache when language is deleted
    LanguageService.invalidateCache();

    res.json({
      success: true,
      message: 'Language deleted successfully',
    });
  } catch (error) {
    console.error('[LanguageController] Error deleting language:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get translation progress/statistics for a language
exports.getTranslationProgress = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    // Get error statistics
    const errorStats = await RateLimitHandler.getErrorStatistics(code);

    // Get language info
    const language = await Language.findOne({ code: code.toLowerCase() });

    res.json({
      success: true,
      data: {
        language: language || { code: code.toLowerCase() },
        translation_status: errorStats,
        failed_translations_total: errorStats.total_failed,
        is_ready: language?.isReady || false,
      },
    });
  } catch (error) {
    console.error('[LanguageController] Error getting translation progress:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get failed translations list for a language (for Admin Dashboard)
exports.getFailedTranslations = async (req, res) => {
  try {
    const { code } = req.params;
    const { entityType, limit = 50 } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    const failed = await RateLimitHandler.getFailedTranslations(
      code.toLowerCase(),
      entityType || null,
      Math.min(parseInt(limit) || 50, 500)
    );

    res.json({
      success: true,
      data: {
        language_code: code.toLowerCase(),
        total_failed: failed.length,
        failed_translations: failed.map(f => ({
          hashKey: f.hashKey,
          originalText: f.originalText,
          translatedText: f.translatedText,
          entityType: f.entityType,
          entityId: f.entityId,
          status: f.status,
          retryCount: f.retryCount,
          lastRetryAt: f.lastRetryAt,
        })),
      },
    });
  } catch (error) {
    console.error('[LanguageController] Error getting failed translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Retry failed translations for a language (triggered by Admin)
exports.retryFailedTranslations = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    // Reset status để Background Job xử lý lại
    const updateResult = await RateLimitHandler.resetFailedForRetry(code.toLowerCase());

    res.json({
      success: true,
      message: `Marked ${updateResult.modifiedCount} failed translations for retry. Check setupStatus endpoint to monitor progress.`,
      data: {
        modified_count: updateResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error('[LanguageController] Error retrying failed translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
