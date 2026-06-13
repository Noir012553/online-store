const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const LanguageService = require('../services/languageService');
const { flattenJson } = require('../utils/jsonFlattener');
const crypto = require('crypto');
const seedTranslations = require('../seeds/translationSeeder');
const { getMessage } = require('../i18n/messages');

exports.getStaticTranslations = async (req, res) => {
  try {
    const { lang = 'en', ns = 'common' } = req.query;

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: getMessage('VI', 'api.emailRequired'),
      });
    }

    const translation = await StaticTranslation.findOne({
      code: lang,
      namespace: ns,
      isDeleted: false,
    });

    if (!translation) {
      return res.status(404).json({
        success: false,
        message: `Translations not found for language: ${lang}, namespace: ${ns}`,
      });
    }

    // Flatten translations to dot-notation for frontend
    const flattenedTranslations = flattenJson(translation.translations);

    res.set('Cache-Control', 'public, max-age=300');
    res.set('ETag', `"${translation._id}"`);
    res.set('Expires', new Date(Date.now() + 300 * 1000).toUTCString());

    res.json({
      success: true,
      data: {
        code: translation.code,
        namespace: translation.namespace,
        translations: flattenedTranslations,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching static translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// REMOVED: Hardcoded SUPPORTED_LANGUAGES
// Now using dynamic check via LanguageService.isSupportedLanguage()

exports.translateText = async (req, res) => {
  try {
    const { text, targetLang = 'en', sourceLang = 'vi', useCache = true } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Text to translate is required and must be a non-empty string',
      });
    }

    // Check source language dynamically
    const isSourceSupported = await LanguageService.isSupportedLanguage(sourceLang);
    if (!isSourceSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported source language: ${sourceLang}`,
      });
    }

    // Check target language dynamically
    const isTargetSupported = await LanguageService.isSupportedLanguage(targetLang);
    if (!isTargetSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported target language: ${targetLang}`,
      });
    }

    if (sourceLang === targetLang) {
      return res.json({
        success: true,
        data: {
          originalText: text,
          translatedText: text,
          targetLang,
          fromCache: false,
        },
      });
    }

    const hashKey = crypto
      .createHash('md5')
      .update(`${text}:${targetLang}`)
      .digest('hex');

    // Check cache if enabled
    if (useCache) {
      const cached = await LiveTranslationCache.findOne({ hashKey }).lean();
      if (cached) {
        return res.json({
          success: true,
          data: {
            originalText: text,
            translatedText: cached.translatedText,
            targetLang,
            fromCache: true,
          },
        });
      }
    }

    // Translate using Cloudflare AI
    const translatedText = await cloudflareAiService.translate(text, sourceLang, targetLang);

    // Save to cache
    await LiveTranslationCache.create({
      hashKey,
      originalText: text,
      targetLang,
      translatedText,
    });

    res.json({
      success: true,
      data: {
        originalText: text,
        translatedText,
        targetLang,
        fromCache: false,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error translating text:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getProductTranslations = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang = 'en' } = req.query;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: getMessage('VI', 'translation.productIdRequired'),
      });
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(lang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${lang}. Please ensure the language is added and activated in the system.`,
      });
    }

    // If requesting Vietnamese, return empty (no translation needed)
    if (lang === 'vi') {
      return res.json({
        success: true,
        data: {
          name: null,
          description: null,
          brand: null,
          categoryName: null,
          specs: {},
          features: [],
        },
      });
    }

    // Fetch translations from cache for this product
    const translations = await LiveTranslationCache.find({
      entityId: productId,
      targetLang: lang,
    }).lean();

    const result = {
      name: null,
      description: null,
      brand: null,
      categoryName: null,
    };

    const specs = {};
    const features = [];
    let hasSpecs = false;
    let hasFeatures = false;

    // Map translations by entity type
    for (const trans of translations) {
      if (trans.entityType === 'product_name') {
        result.name = trans.translatedText;
      } else if (trans.entityType === 'product_description') {
        result.description = trans.translatedText;
      } else if (trans.entityType === 'product_brand') {
        result.brand = trans.translatedText;
      } else if (trans.entityType === 'product_category_name') {
        result.categoryName = trans.translatedText;
      } else if (trans.entityType === 'product_spec' && trans.specKey) {
        specs[trans.specKey] = trans.translatedText;
        hasSpecs = true;
      } else if (trans.entityType === 'product_feature') {
        features.push(trans.translatedText);
        hasFeatures = true;
      }
    }

    // Only include specs/features if they have actual translation data
    if (hasSpecs) {
      result.specs = specs;
    }
    if (hasFeatures) {
      result.features = features;
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCategoryTranslations = async (req, res) => {
  try {
    const { id: categoryId } = req.params;
    const { lang = 'en' } = req.query;

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: getMessage('VI', 'translation.productIdRequired'),
      });
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(lang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${lang}. Please ensure the language is added and activated in the system.`,
      });
    }

    // If requesting Vietnamese, return empty (no translation needed)
    if (lang === 'vi') {
      return res.json({
        success: true,
        data: {
          name: null,
          description: null,
        },
      });
    }

    // Fetch translations from cache for this category
    const translations = await LiveTranslationCache.find({
      entityId: categoryId,
      entityType: { $in: ['category_name', 'category_description'] },
      targetLang: lang,
    }).lean();

    const result = {
      name: null,
      description: null,
    };

    // Map translations by entity type
    for (const trans of translations) {
      if (trans.entityType === 'category_name') {
        result.name = trans.translatedText;
      } else if (trans.entityType === 'category_description') {
        result.description = trans.translatedText;
      }
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching category translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getReviewTranslations = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { lang = 'en' } = req.query;

    if (!reviewId) {
      return res.status(400).json({
        success: false,
        message: getMessage('VI', 'translation.productIdRequired'),
      });
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(lang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${lang}. Please ensure the language is added and activated in the system.`,
      });
    }

    // If requesting Vietnamese, return empty (no translation needed)
    if (lang === 'vi') {
      return res.json({
        success: true,
        data: {
          name: null,
          comment: null,
        },
      });
    }

    // Fetch translations from cache for this review
    const translations = await LiveTranslationCache.find({
      entityId: reviewId,
      entityType: { $in: ['review_name', 'review_comment'] },
      targetLang: lang,
    }).lean();

    const result = {
      name: null,
      comment: null,
    };

    // Map translations by entity type
    for (const trans of translations) {
      if (trans.entityType === 'review_name') {
        result.name = trans.translatedText;
      } else if (trans.entityType === 'review_comment') {
        result.comment = trans.translatedText;
      }
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching review translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.refetchStaticTranslations = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: getMessage('VI', 'payment.devModeOnly'),
      });
    }

    const results = await seedTranslations();

    res.json({
      success: true,
      message: 'Static translations reloaded',
      data: results,
    });
  } catch (error) {
    console.error('[TranslationController] Error reloading translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getSupportedNamespaces = async (req, res) => {
  try {
    const namespaces = await StaticTranslation.distinct('namespace', { isDeleted: false });
    res.json({
      success: true,
      data: namespaces,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching namespaces:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.syncTranslationsFromJSON = async (req, res) => {
  try {
    const { language, namespace, translations } = req.body;

    if (!language || !namespace || !translations) {
      return res.status(400).json({
        success: false,
        message: 'Language, namespace, and translations are required',
      });
    }

    const result = await StaticTranslation.findOneAndUpdate(
      { code: language, namespace },
      { translations, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Translations synced successfully',
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error syncing translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCacheStats = async (req, res) => {
  try {
    const total = await LiveTranslationCache.countDocuments();
    const byLanguage = await LiveTranslationCache.aggregate([
      {
        $group: {
          _id: '$targetLang',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const stats = {
      totalCachedTranslations: total,
      byLanguage: byLanguage,
      createdAt: new Date(),
    };
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.clearOldCache = async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await LiveTranslationCache.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} old cache records`,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCacheRecords = async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const records = await LiveTranslationCache.find()
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await LiveTranslationCache.countDocuments();

    res.json({
      success: true,
      data: records,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching cache records:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteCacheRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await LiveTranslationCache.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: getMessage('VI', 'translation.cacheNotFound'),
      });
    }

    res.json({
      success: true,
      message: 'Cache record deleted',
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error deleting cache record:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.listTranslations = async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const translations = await StaticTranslation.find({ isDeleted: false })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await StaticTranslation.countDocuments({ isDeleted: false });

    res.json({
      success: true,
      data: {
        translations,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
        },
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error listing translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getTranslationById = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    res.json({
      success: true,
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error fetching translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateTranslationKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        message: getMessage('VI', 'translation.updated'),
      });
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    translation.translations[key] = value;
    await translation.save();

    res.json({
      success: true,
      message: getMessage('VI', 'translation.updated'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error updating translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteTranslationKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Key is required',
      });
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    delete translation.translations[key];
    await translation.save();

    res.json({
      success: true,
      message: 'Translation key deleted',
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error deleting translation key:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.softDeleteTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!translation) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    res.json({
      success: true,
      message: 'Translation soft deleted',
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error soft deleting translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.hardDeleteTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndDelete(id);

    if (!translation) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    res.json({
      success: true,
      message: 'Translation hard deleted',
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error hard deleting translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.restoreTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndUpdate(
      id,
      { isDeleted: false, deletedAt: null },
      { new: true }
    );

    if (!translation) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    res.json({
      success: true,
      message: 'Translation restored',
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation ID format',
      });
    }
    console.error('[TranslationController] Error restoring translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.createStaticTranslation = async (req, res) => {
  try {
    const { code, namespace, translations } = req.body;

    if (!code || !namespace || !translations) {
      return res.status(400).json({
        success: false,
        message: 'Code, namespace, and translations are required',
      });
    }

    const existing = await StaticTranslation.findOne({ code, namespace });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Translation already exists for language: ${code}, namespace: ${namespace}`,
      });
    }

    const newTranslation = await StaticTranslation.create({
      code,
      namespace,
      translations,
    });

    res.status(201).json({
      success: true,
      message: 'Translation created',
      data: newTranslation,
    });
  } catch (error) {
    console.error('[TranslationController] Error creating translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllTranslationsByLang = async (req, res) => {
  try {
    const { lang } = req.params;
    const { ns } = req.query;

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const filter = { code: lang, isDeleted: false };
    if (ns) {
      filter.namespace = ns;
    }

    const translations = await StaticTranslation.find(filter).lean();

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      success: true,
      data: translations,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching translations by language:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.bulkTranslateStaticUI = async (req, res) => {
  try {
    const { items, targetLang = 'en', namespace = 'common' } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required',
      });
    }

    const translations = {};
    for (const item of items) {
      const translated = await cloudflareAiService.translate(
        item.text,
        'vi',
        targetLang
      );
      translations[item.key] = translated;
    }

    const result = await StaticTranslation.findOneAndUpdate(
      { code: targetLang, namespace },
      { $set: { translations } },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Bulk translations completed',
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error bulk translating:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============ ADMIN DASHBOARD APIs (NEW - Phase 2) ============

/**
 * GET /api/admin/translation-status/:lang
 * Lấy tiến độ dịch cho ngôn ngữ (Layer 1 & 2)
 * Trả về: %UI dịch, %sản phẩm dịch, danh sách lỗi
 */
exports.getTranslationStatus = async (req, res) => {
  try {
    const { lang } = req.params;

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    // Layer 1: UI strings progress
    const totalUINamespaces = await StaticTranslation.countDocuments({
      isDeleted: false,
    }) / 2; // Chia cho 2 vì mỗi namespace có ở en + vi

    const translatedUINamespaces = await StaticTranslation.countDocuments({
      code: lang,
      isDeleted: false,
    });

    const uiProgress = totalUINamespaces > 0 ? (translatedUINamespaces / totalUINamespaces) * 100 : 0;

    // Layer 2: Product translations progress
    const totalProducts = await Product.countDocuments({});

    // Estimate: mỗi sản phẩm có ~5 fields (name, desc, brand, 2 specs)
    const expectedProductTranslations = totalProducts * 5;
    const actualProductTranslations = await LiveTranslationCache.countDocuments({
      targetLang: lang,
      status: 'success',
      entityType: { $regex: '^product_' }
    });

    const productProgress = expectedProductTranslations > 0
      ? (actualProductTranslations / expectedProductTranslations) * 100
      : 0;

    // Count errors
    const errorStats = await LiveTranslationCache.aggregate([
      {
        $match: {
          targetLang: lang,
          status: { $ne: 'success' }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const errors = {
      failed_rate_limit: 0,
      failed_error: 0,
      pending_retry: 0,
    };

    for (const stat of errorStats) {
      errors[stat._id] = stat.count;
    }

    res.json({
      success: true,
      data: {
        code: lang,
        layer1: {
          name: 'UI Strings (Static)',
          progress: Math.round(uiProgress),
          totalNamespaces: Math.round(totalUINamespaces),
          completedNamespaces: translatedUINamespaces,
        },
        layer2: {
          name: 'Products (Dynamic)',
          progress: Math.round(productProgress),
          expectedTranslations: expectedProductTranslations,
          actualTranslations: actualProductTranslations,
        },
        errors,
        totalErrors: Object.values(errors).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching translation status:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/admin/failed-translations/:lang
 * Lấy danh sách các translations lỗi (429, error, pending_retry)
 * Admin Dashboard sử dụng để hiển thị & sửa
 */
exports.getFailedTranslations = async (req, res) => {
  try {
    const { lang } = req.params;
    const { limit = 100, skip = 0, status = null, entityType = null } = req.query;

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const query = {
      targetLang: lang,
      status: { $ne: 'success' }
    };

    if (status && ['failed_rate_limit', 'failed_error', 'pending_retry'].includes(status)) {
      query.status = status;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    const failed = await LiveTranslationCache.find(query)
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ lastRetryAt: -1, createdAt: -1 })
      .lean();

    const total = await LiveTranslationCache.countDocuments(query);

    res.json({
      success: true,
      data: {
        items: failed,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: total > (parseInt(skip) + parseInt(limit))
        }
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching failed translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/admin/retry-translations/:lang
 * Admin bấn nút "Dịch lại các sản phẩm lỗi"
 * Trigger background job để retry translations bị 429
 */
exports.retryFailedTranslations = async (req, res) => {
  try {
    const { lang } = req.params;
    const { entityType = null } = req.body;

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const ProductTranslationSeederService = require('../services/productTranslationSeederService');

    // Đánh dấu lỗi để retry
    const updateResult = await RateLimitHandler.resetFailedForRetry(lang, entityType);
    console.log(`[TranslationController] Reset ${updateResult.modifiedCount} for retry`);

    // Trigger background job (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`[TranslationController] 🔄 Starting retry background job for ${lang}`);
        const result = await ProductTranslationSeederService.retryFailedTranslations(lang, 'vi', 3);
        console.log(`[TranslationController] ✅ Retry completed:`, result);
      } catch (err) {
        console.error(`[TranslationController] Retry failed:`, err.message);
      }
    });

    res.json({
      success: true,
      message: `Marked ${updateResult.modifiedCount} translations for retry. Background job started.`,
      data: {
        resetCount: updateResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error retrying translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/admin/edit-translation
 * Admin sửa tay bản dịch (Manual Override)
 */
exports.editTranslationManual = async (req, res) => {
  try {
    const { hashKey, translatedText } = req.body;

    if (!hashKey || !translatedText) {
      return res.status(400).json({
        success: false,
        message: 'hashKey and translatedText are required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const updated = await RateLimitHandler.manualOverride(hashKey, translatedText);

    res.json({
      success: true,
      message: 'Translation updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('[TranslationController] Error editing translation:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/admin/batch-edit-translations
 * Admin sửa multiple translations cùng lúc
 */
exports.batchEditTranslations = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'updates array is required and must not be empty',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const result = await RateLimitHandler.batchManualOverride(updates);

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} translations`,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error batch editing translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Manual Override: Admin sửa dịch thủ công cho Layer 2 (Products)
// Khi dịch tự động bị lỗi hoặc không chuẩn, Admin gõ vào ô này để sửa
exports.manualOverrideTranslation = async (req, res) => {
  try {
    const { hashKey, translatedText } = req.body;

    if (!hashKey || !translatedText) {
      return res.status(400).json({
        success: false,
        message: 'hashKey and translatedText are required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    const updated = await RateLimitHandler.manualOverride(hashKey, translatedText);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    res.json({
      success: true,
      message: 'Translation updated successfully',
      data: {
        hashKey: updated.hashKey,
        translatedText: updated.translatedText,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error manual override:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Batch Manual Override: Admin sửa nhiều dịch cùng lúc
exports.batchManualOverride = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'updates array is required and must not be empty',
      });
    }

    // Validate each update
    for (const update of updates) {
      if (!update.hashKey || !update.translatedText) {
        return res.status(400).json({
          success: false,
          message: 'Each update must have hashKey and translatedText',
        });
      }
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    const result = await RateLimitHandler.batchManualOverride(updates);

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} translations`,
      data: {
        modified_count: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error batch manual override:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.importNestedJSON = async (req, res) => {
  try {
    const { code, namespace, translations: nestedTranslations } = req.body;

    if (!code || !namespace || !nestedTranslations || typeof nestedTranslations !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Code, namespace, and translations (object) are required',
      });
    }

    // Flatten nested JSON to dot-notation
    const flatTranslations = flattenJson(nestedTranslations);

    // Upsert into database
    const result = await StaticTranslation.findOneAndUpdate(
      { code, namespace },
      {
        code,
        namespace,
        translations: flatTranslations,
        isDeleted: false,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Nested JSON imported and flattened successfully',
      data: {
        code: result.code,
        namespace: result.namespace,
        keysCount: Object.keys(flatTranslations).length,
        sample: Object.entries(flatTranslations).slice(0, 3),
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error importing nested JSON:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
