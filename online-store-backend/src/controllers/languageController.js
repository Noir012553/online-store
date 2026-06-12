const Language = require('../models/Language');
const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
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
      message: 'Language added. Background translation job started...',
      data: newLang,
    });

    // Background task: Translate all products asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`[i18n] Starting auto-translation of products to language: ${code}`);

        // Get all Vietnamese products
        const allProducts = await Product.find({}).lean();
        console.log(`[i18n] Found ${allProducts.length} products to translate`);

        let successCount = 0;
        let errorCount = 0;

        // OPTIMIZATION: Bulk collect all texts to check cache in ONE query
        const textsToCheck = [];
        allProducts.forEach(product => {
          if (product.name && product.name.trim()) textsToCheck.push(product.name);
          if (product.description && product.description.trim()) textsToCheck.push(product.description);
        });

        // Batch query cache: $in operator (1 query instead of N*2)
        const hashKeysToCheck = textsToCheck.map(text =>
          crypto.createHash('md5').update(`${text}:${code}`).digest('hex')
        );
        const cachedRecords = await LiveTranslationCache.find(
          { hashKey: { $in: hashKeysToCheck } },
          { hashKey: 1 }
        ).lean();

        const cachedHashSet = new Set(cachedRecords.map(r => r.hashKey));

        // Batch translate product names and descriptions
        const translateBatch = [];
        for (const product of allProducts) {
          const fieldsToTranslate = [
            { field: 'name', value: product.name },
            { field: 'description', value: product.description || '' },
          ];

          for (const { field, value } of fieldsToTranslate) {
            if (!value || value.trim() === '') continue;

            const hashKey = crypto
              .createHash('md5')
              .update(`${value}:${code}`)
              .digest('hex');

            // Skip if already cached
            if (cachedHashSet.has(hashKey)) {
              console.log(`[i18n] Cache hit for ${product._id} ${field} to ${code}`);
              successCount++;
              continue;
            }

            translateBatch.push({ hashKey, originalText: value, field, productId: product._id });
          }
        }

        // Translate all uncached items and batch save to DB (1 insertMany instead of N creates)
        for (const item of translateBatch) {
          try {
            const translatedText = await cloudflareAiService.translate(
              item.originalText,
              'vi',
              code
            );

            item.translatedText = translatedText;
            item.targetLang = code;
          } catch (err) {
            errorCount++;
            console.error(
              `[i18n] Error translating product ${item.productId}:`,
              err.message
            );
          }
        }

        // Bulk insert all translations (1 DB write instead of N)
        if (translateBatch.filter(t => t.translatedText).length > 0) {
          try {
            const validBatch = translateBatch.filter(t => t.translatedText).map(t => ({
              hashKey: t.hashKey,
              originalText: t.originalText,
              targetLang: t.targetLang,
              translatedText: t.translatedText,
            }));

            await LiveTranslationCache.insertMany(validBatch, { ordered: false });
            successCount += validBatch.length;
          } catch (err) {
            // Ignore duplicate key errors
            if (err.code !== 11000) {
              console.error('[i18n] Batch insert error:', err.message);
            }
          }
        }

        console.log(`[i18n] Completed bulk translation for language: ${code}. Success: ${successCount}, Errors: ${errorCount}`);
      } catch (error) {
        console.error(`[i18n] Background translation job failed:`, error.message || error);
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
