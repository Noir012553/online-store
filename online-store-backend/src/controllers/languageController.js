const Product = require('../models/Product');
const Language = require('../models/Language');
const Currency = require('../models/Currency');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const LanguageService = require('../services/languageService');
const TranslationSeederService = require('../services/translationSeederService');
const crypto = require('crypto');
const { getMessage } = require('../i18n/messages');

// SSOT: Import from languageInventory.js (unified source)
const { SUPPORTED_LANGUAGES, getLanguageByCode, getDefaultLanguage } = require('../config/languageInventory');

// Helper: Get language from request (admin context)
const getAdminLanguage = (req) => {
  const { getActiveLangCodes } = require('../config/languageInventory');

  if (req.user?.language) {
    return req.user.language.toUpperCase();
  }
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const primaryLang = acceptLang.split(',')[0].split('-')[0].toUpperCase();
    const activeLangs = getActiveLangCodes();
    if (activeLangs.includes(primaryLang)) {
      return primaryLang;
    }
  }
  return getDefaultLanguage().code.toUpperCase();
};

// Get all supported languages with translation keys
exports.getSupportedLanguages = async (req, res) => {
  try {
    const languages = SUPPORTED_LANGUAGES.map((lang) => ({
      code: lang.code,
      translationKey: lang.translationKey,
      priority: lang.priority,
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

exports.getActiveConfig = async (req, res) => {
  try {
    const languages = await Language.find(
      { isActive: true, isReady: true },
      { code: 1, name: 1, nativeName: 1, currencyCode: 1, isSystemDefault: 1 }
    )
      .sort({ isSystemDefault: -1, createdAt: 1 })
      .lean();
    const activeCurrencyCodes = new Set(
      (
        await Currency.find(
          { isActive: true, code: { $in: languages.map((language) => language.currencyCode) } },
          { code: 1 }
        ).lean()
      ).map((currency) => currency.code)
    );
    const locales = languages
      .filter((language) => activeCurrencyCodes.has(language.currencyCode))
      .map(({ code, name, nativeName, currencyCode }) => ({ code, name, nativeName, currencyCode, isReady: true }));
    const defaultLocale = languages.find(
      (language) => language.isSystemDefault && activeCurrencyCodes.has(language.currencyCode)
    )?.code;

    if (!defaultLocale) {
      return res.status(500).json({
        success: false,
        message: 'An active system default locale with an active currency must be configured',
      });
    }

    res.json({ success: true, data: { defaultLocale, locales } });
  } catch (error) {
    console.error('[LanguageController] Error getting active locale config:', error);
    res.status(500).json({ success: false, message: error.message });
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
    const adminLang = getAdminLanguage(req);
    const { code, name, currencyCode: requestedCurrencyCode } = req.body;

    if (!code || !name || !requestedCurrencyCode) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_name_required'),
      });
    }

    const langCode = code.toLowerCase();
    const currencyCode = requestedCurrencyCode.toUpperCase();
    const supportedLang = getLanguageByCode(langCode);

    if (!supportedLang) {
      const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code).join(', ');
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_not_supported', { code, supportedCodes }),
      });
    }

    const currency = await Currency.findOne({ code: currencyCode, isActive: true });
    if (!currency) {
      return res.status(400).json({ success: false, message: 'currencyCode must reference an active currency' });
    }

    const existingLang = await Language.findOne({ code: langCode });
    if (existingLang) {
      return res.status(409).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_already_exists', { code }),
      });
    }

    // ============ T = 0: Create Language Record (< 100ms) ============
    const newLang = await Language.create({
      code: langCode,
      name,
      isActive: true,
      isReady: false,
      setupStartedAt: new Date(),
      nativeName: supportedLang.nativeName,
      currencyCode,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n[Language] 🚀 T=0: Language record created for ${langCode}`);
    }

    res.status(201).json({
      success: true,
      message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_added_setup_started'),
      data: newLang,
    });

    // ============ 3-Phase Background Job ============
    setImmediate(async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`\n[Language] ⏱️  Background Setup Timeline for ${langCode}:`);
          console.log(`  T+0s: Response sent to client`);
          console.log(`  T+1s: PHASE 1 (Clone + Translate UI strings)`);
          console.log(`  T+30s: PHASE 2 (Translate all products with chunking)`);
          console.log(`  T+120s: PHASE 3 (Finalize & activate)\n`);
        }

        // ========== PHASE 1: Clone & Translate UI (T+1s to T+30s) ==========
        try {
          const { getDefaultLanguage } = require('../config/languageInventory');
          const defaultLang = getDefaultLanguage().code;
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Language] 📍 PHASE 1: Clone UI strings từ ${defaultLang.toUpperCase()} sang ${langCode}`);
          }
          const clonedCount = await TranslationSeederService.cloneStaticTranslations(defaultLang, langCode);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Language] ✓ Clone hoàn tất: ${clonedCount} namespaces`);
          }

          if (clonedCount > 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Language] 📍 PHASE 1.5: Dịch UI strings (concurrency=5, throttle=1000ms)`);
            }
            const translatedCount = await TranslationSeederService.translateStaticTranslations(
              langCode,
              defaultLang
            );
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Language] ✓ Dịch xong: ${translatedCount} UI keys`);
            }
          }
        } catch (phase1Error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[Language] ❌ PHASE 1 lỗi: ${phase1Error.message}`);
          }
        }

        // ========== PHASE 2: Translate Products (T+30s to T+120s) ==========
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log(`\n[Language] 📍 PHASE 2: Dịch sản phẩm (chunking=20, concurrency=3, throttle=1500ms)`);
          }
          const ProductTranslationSeederService = require('../services/productTranslationSeederService');

          const { getDefaultLanguage: getDefaultLang } = require('../config/languageInventory');
          const defaultSourceLang = getDefaultLang().code;
          const { successCount, errorCount, totalProcessed } =
            await ProductTranslationSeederService.translateAllProducts(langCode, defaultSourceLang);

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Language] ✓ PHASE 2 hoàn tất:`);
            console.log(`    • Thành công: ${successCount} fields`);
            console.log(`    • Lỗi: ${errorCount} fields`);
            console.log(`    • Tổng xử lý: ${totalProcessed} fields`);
          }
        } catch (phase2Error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[Language] ❌ PHASE 2 lỗi: ${phase2Error.message}`);
          }
        }

        // ========== PHASE 3: Finalize & Activate (T+120s+) ==========
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log(`\n[Language] 📍 PHASE 3: Hoàn tất và kích hoạt`);
          }

          LanguageService.invalidateCache();
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Language] ✓ Language cache invalidated`);
          }

          await Language.updateOne(
            { code: langCode },
            {
              $set: {
                isReady: true,
                setupCompletedAt: new Date(),
              },
            }
          );

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Language] ✓ ${langCode} is READY (isReady=true)`);
            console.log(`\n[Language] 🎉 SETUP COMPLETE for ${langCode}!\n`);
          }
        } catch (phase3Error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[Language] ❌ PHASE 3 lỗi: ${phase3Error.message}`);
          }
          await Language.updateOne(
            { code: langCode },
            { $set: { isReady: false, setupCompletedAt: new Date() } }
          ).catch(err => {
            if (process.env.NODE_ENV === 'development') {
              console.error(`[Language] Cannot update language: ${err.message}`);
            }
          });
        }
      } catch (backgroundError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Language] ❌ Unexpected error in background task: ${backgroundError.message}`);
          console.error(backgroundError.stack);
        }

        try {
          await Language.updateOne(
            { code: langCode },
            { $set: { isReady: false, setupCompletedAt: new Date() } }
          );
        } catch (updateErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[Language] Cannot update language status: ${updateErr.message}`);
          }
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
    const adminLang = getAdminLanguage(req);
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_required'),
      });
    }

    const language = await Language.findOne({ code: code.toLowerCase() });

    if (!language) {
      return res.status(404).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_not_found'),
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
    const { isActive, name, currencyCode: requestedCurrencyCode } = req.body;
    const updates = {};

    if (isActive !== undefined) updates.isActive = isActive;
    if (name !== undefined) updates.name = name;
    if (requestedCurrencyCode !== undefined) {
      const currencyCode = requestedCurrencyCode.toUpperCase();
      const currency = await Currency.findOne({ code: currencyCode, isActive: true });
      if (!currency) {
        return res.status(400).json({ success: false, message: 'currencyCode must reference an active currency' });
      }
      updates.currencyCode = currencyCode;
    }

    const language = await Language.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!language) {
      return res.status(404).json({
        success: false,
        message: getMessage(getAdminLanguage(req), 'admin-controllers-messages', 'admin_lang_not_found'),
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
    const adminLang = getAdminLanguage(req);
    const { id } = req.params;

    const language = await Language.findById(id);
    if (!language) {
      return res.status(404).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_not_found'),
      });
    }

    if (language.isSystemDefault) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_cannot_delete_default'),
      });
    }

    await Language.findByIdAndDelete(id);

    // Invalidate cache when language is deleted
    LanguageService.invalidateCache();

    res.json({
      success: true,
      message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_deleted_success'),
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
    const adminLang = getAdminLanguage(req);
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_required'),
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
    const adminLang = getAdminLanguage(req);
    const { code } = req.params;
    const { entityType, limit = 50 } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_required'),
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
    const adminLang = getAdminLanguage(req);
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'admin-controllers-messages', 'admin_lang_code_required'),
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
