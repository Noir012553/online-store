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
  en: { display: 'English (Tiếng Anh)', native: 'English' },
  pt: { display: 'Português (Tiếng Bồ Đào Nha)', native: 'Português' },
  fr: { display: 'Français (Tiếng Pháp)', native: 'Français' },
  de: { display: 'Deutsch (Tiếng Đức)', native: 'Deutsch' },
  it: { display: 'Italiano (Tiếng Ý)', native: 'Italiano' },
  es: { display: 'Español (Tiếng Tây Ban Nha)', native: 'Español' },
  nl: { display: 'Nederlands (Tiếng Hà Lan)', native: 'Nederlands' },
  sv: { display: 'Svenska (Tiếng Thụy Điển)', native: 'Svenska' },
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

// Create new language and trigger bulk translation
exports.createLanguage = async (req, res) => {
  try {
    const { code, name } = req.body;

    // Validate input
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Code and name are required',
      });
    }

    // Validate against supported languages
    console.log('[DEBUG] SUPPORTED_LANGUAGES:', SUPPORTED_LANGUAGES);
    console.log('[DEBUG] code:', code, 'type:', typeof code);
    if (!SUPPORTED_LANGUAGES[code.toLowerCase()]) {
      const supportedCodes = Object.keys(SUPPORTED_LANGUAGES).join(', ');
      return res.status(400).json({
        success: false,
        message: `Language code ${code} is not supported. Supported languages: ${supportedCodes}`,
      });
    }

    // Check if language already exists
    const existingLang = await Language.findOne({ code: code.toLowerCase() });
    if (existingLang) {
      return res.status(409).json({
        success: false,
        message: `Language ${code} already exists in system`,
      });
    }

    // Save language to DB
    const newLang = await Language.create({
      code: code.toLowerCase(),
      name,
      isActive: true,
      nativeName: LANGUAGE_NAMES[code.toLowerCase()]?.native || name,
    });

    // Response immediately to prevent gateway timeout
    res.status(201).json({
      success: true,
      message: 'Language added. Static translations and background job started...',
      data: newLang,
    });

    // Background task: Seed static translations + translate all products asynchronously
    setImmediate(async () => {
      try {
        const langCode = code.toLowerCase();
        console.log(`[Language] Starting background setup for language: ${langCode}`);

        // Step 1: Clone static translations from 'en' to new language
        try {
          const clonedCount = await TranslationSeederService.cloneStaticTranslations('en', langCode);
          console.log(`[Language] Cloned ${clonedCount} static translations for ${langCode}`);

          if (clonedCount === 0) {
            console.warn(`[Language] Warning: No static translations were cloned. UI strings may be missing.`);
          }
        } catch (seedError) {
          console.error(`[Language] Static translation seeding failed:`, seedError.message);
          console.error('[Language] Stack:', seedError.stack);
          // Continue even if seeding fails - still translate products
        }

        // Step 2: Invalidate language cache so endpoints pick up new language
        LanguageService.invalidateCache();
        console.log(`[Language] Language cache invalidated`);

        // Step 3: Translate all products
        console.log(`[Language] Starting auto-translation of products to language: ${langCode}`);

        const allProducts = await Product.find({}).lean();
        console.log(`[Language] Found ${allProducts.length} products to translate`);

        let successCount = 0;
        let errorCount = 0;

        // OPTIMIZATION: Bulk collect all product field texts
        const fieldsToTranslate = [];
        for (const product of allProducts) {
          if (product.name && product.name.trim()) {
            fieldsToTranslate.push({
              productId: product._id,
              originalText: product.name,
              entityType: 'product_name',
            });
          }
          if (product.description && product.description.trim()) {
            fieldsToTranslate.push({
              productId: product._id,
              originalText: product.description,
              entityType: 'product_description',
            });
          }
        }

        console.log(`[Language] Total fields to translate: ${fieldsToTranslate.length}`);

        // Batch check cache
        const hashKeysToCheck = fieldsToTranslate.map(field =>
          crypto.createHash('md5').update(`${field.originalText}:${langCode}`).digest('hex')
        );

        const cachedRecords = await LiveTranslationCache.find(
          {
            hashKey: { $in: hashKeysToCheck },
          },
          { hashKey: 1 }
        ).lean();

        const cachedHashSet = new Set(cachedRecords.map(r => r.hashKey));

        // Prepare translation batch with correct format
        const translateBatch = [];
        for (const field of fieldsToTranslate) {
          const hashKey = crypto
            .createHash('md5')
            .update(`${field.originalText}:${langCode}`)
            .digest('hex');

          // Skip if already cached
          if (cachedHashSet.has(hashKey)) {
            console.log(`[Language] Cache hit for ${field.productId} ${field.entityType} to ${langCode}`);
            successCount++;
            continue;
          }

          translateBatch.push({
            hashKey,
            originalText: field.originalText,
            productId: field.productId,
            entityType: field.entityType,
          });
        }

        // Translate all uncached items
        for (const item of translateBatch) {
          try {
            const translatedText = await cloudflareAiService.translate(
              item.originalText,
              'vi',
              langCode
            );

            item.translatedText = translatedText;
            item.targetLang = langCode;
          } catch (err) {
            errorCount++;
            console.error(`[Language] Error translating product ${item.productId}:`, err.message);
          }
        }

        // Bulk insert with correct format (entityId + entityType)
        if (translateBatch.filter(t => t.translatedText).length > 0) {
          try {
            const validBatch = translateBatch.filter(t => t.translatedText).map(t => ({
              hashKey: t.hashKey,
              originalText: t.originalText,
              targetLang: t.targetLang,
              translatedText: t.translatedText,
              entityId: t.productId,      // [NEW] Required for getProductTranslations
              entityType: t.entityType,   // [NEW] Required for getProductTranslations
            }));

            await LiveTranslationCache.insertMany(validBatch, { ordered: false });
            successCount += validBatch.length;
          } catch (err) {
            if (err.code !== 11000) {
              console.error('[Language] Batch insert error:', err.message);
            }
          }
        }

        console.log(
          `[Language] Completed setup for ${langCode}. Products translated: ${successCount}, Errors: ${errorCount}`
        );
      } catch (error) {
        console.error(`[Language] Background job failed:`, error.message || error);
      }
    });
  } catch (error) {
    console.error('[LanguageController] Error creating language:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
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
