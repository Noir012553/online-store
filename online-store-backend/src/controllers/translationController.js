const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const LanguageService = require('../services/languageService');
const TranslationShadowWriteService = require('../services/translationShadowWriteService');
const { flattenJson } = require('../utils/jsonFlattener');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const seedTranslations = require('../seeds/translationSeeder');
const retranslateSeeder = require('../seeds/retranslateSeeder');
const { getMessage } = require('../i18n/messages');
const { SUPPORTED_LANGUAGES, getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

// Helper to get language from request with dynamic default
const getLanguageParam = (query = {}) => {
  const ACTIVE_LANGS = getActiveLangCodes();
  const DEFAULT_LANG = getDefaultLanguage().code;

  const lang = query.lang || DEFAULT_LANG;
  return ACTIVE_LANGS.includes(lang) ? lang : DEFAULT_LANG;
};

exports.getStaticTranslations = async (req, res) => {
  try {
    let { lang, ns = 'common' } = req.query;
    lang = getLanguageParam({ lang });

    if (!lang) {
      return res.status(400).json({
        success: false,
        message: getMessage(lang, 'api.emailRequired'),
      });
    }

    // Fallback to 'common' if namespace is empty string or invalid
    if (!ns || ns === 'undefined' || ns.trim() === '') {
      ns = 'common';
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(ns)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid translation namespace',
      });
    }

    const translation = await StaticTranslation.findOne({
      code: lang,
      namespace: ns,
      isDeleted: false,
    });

    let translations = translation?.translations || null;
    const localePath = path.join(__dirname, '../locales', lang, `${ns}.json`);

    if (fs.existsSync(localePath)) {
      const fileTranslations = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      translations = { ...fileTranslations, ...(translations || {}) };
    }

    if (!translations) {
      return res.status(404).json({
        success: false,
        message: `Translations not found for language: ${lang}, namespace: ${ns}`,
      });
    }

    const flattenedTranslations = flattenJson(translations);

    res.set('Cache-Control', 'public, max-age=300');
    if (translation?._id) {
      res.set('ETag', `"${translation._id}"`);
    }
    res.set('Expires', new Date(Date.now() + 300 * 1000).toUTCString());

    res.json({
      success: true,
      data: {
        code: lang,
        namespace: ns,
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

/**
 * GET /api/products/:id/translations
 * Fetch translated product data (specs, features, name, etc.) for a specific language
 * Only returns data for non-VI languages (VI is default/source)
 */
exports.getProductTranslations = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!resolvedLang) {
      return res.json({ success: true, data: null });
    }

    const translation = await ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: resolvedLang,
      status: 'success',
    }).lean();

    if (!translation) {
      return res.json({ success: true, data: null });
    }

    // Convert MongoDB Map to plain object if needed
    const specs = translation.specs instanceof Map
      ? Object.fromEntries(translation.specs)
      : translation.specs || {};

    res.json({
      success: true,
      data: {
        name: translation.name || undefined,
        description: translation.description || undefined,
        brand: translation.brand || undefined,
        specs,
        features: translation.features || [],
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// REMOVED: Hardcoded SUPPORTED_LANGUAGES
// Now using dynamic check via LanguageService.isSupportedLanguage()

/**
 * POST /api/translations/translate
 * Layer 1 (UI Strings) & Layer 2 (Products)
 *
 * Layer 1: targetLang = specific language (en, pt, fr, etc.)
 * Layer 2: targetLang = 'all' → dịch cả 9 ngôn ngữ
 *
 * Lưu ý: Layer 1 không dịch từ 'vi' vì đã hoàn thiện
 */
exports.translateText = async (req, res) => {
  try {
    const { text, targetLang, sourceLang, useCache = true } = req.body;

    // Validate required parameters
    if (!targetLang) {
      return res.status(400).json({
        success: false,
        message: 'Target language (targetLang) is required',
      });
    }

    if (!sourceLang) {
      return res.status(400).json({
        success: false,
        message: 'Source language (sourceLang) is required',
      });
    }

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

    // Layer 2 (Products): Translate to all 9 languages except source language
    // When targetLang === 'all', dịch cả 9 ngôn ngữ (excluding source lang)
    if (targetLang === 'all') {
      const allLangCodes = getActiveLangCodes();
      const targetLangs = allLangCodes.filter(lang => lang !== sourceLang);

      const translations = {};
      for (const lang of targetLangs) {
        const hashKey = crypto
          .createHash('md5')
          .update(`${text}:${lang}`)
          .digest('hex');

        // Check cache if enabled
        let translatedText;
        if (useCache) {
          const cached = await LiveTranslationCache.findOne({ hashKey }).lean();
          if (cached) {
            translatedText = cached.translatedText;
            translations[lang] = translatedText;
            continue;
          }
        }

        // Translate using Cloudflare AI
        translatedText = await cloudflareAiService.translate(text, sourceLang, lang);
        translations[lang] = translatedText;

        // Save to cache (OLD schema)
        await LiveTranslationCache.create({
          hashKey,
          originalText: text,
          targetLang: lang,
          translatedText,
        });

        // Shadow write to NEW schema (Phase 1)
        if (TranslationShadowWriteService.isShadowWriteEnabled()) {
          await TranslationShadowWriteService.writeShadowUserContentTranslation(
            hashKey,
            'generic',
            lang,
            {
              originalText: text,
              translatedText,
              status: 'success',
            }
          );
        }
      }

      return res.json({
        success: true,
        data: {
          originalText: text,
          translations,
          allLangs: true,
          fromCache: false,
        },
      });
    }

    // Layer 1 (UI): Translate to single language
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

    // Save to cache (OLD schema)
    await LiveTranslationCache.create({
      hashKey,
      originalText: text,
      targetLang,
      translatedText,
    });

    // Shadow write to NEW schema (Phase 1)
    if (TranslationShadowWriteService.isShadowWriteEnabled()) {
      await TranslationShadowWriteService.writeShadowUserContentTranslation(
        hashKey,
        'generic',
        targetLang,
        {
          originalText: text,
          translatedText,
          status: 'success',
        }
      );
    }

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

/**
 * POST /api/translations/translate-products-all
 * Layer 2 (Products): Dịch sản phẩm sang cả 9 ngôn ngữ (trừ Vi)
 * Request body: { text, entityId, entityType, sourceLang = 'vi' }
 * Response: { translations: { pt, fr, de, it, es, nl, sv, en } }
 */
exports.translateProductAll9Languages = async (req, res) => {
  try {
    const { text, entityId, entityType, sourceLang, useCache = true } = req.body;

    // Validate required parameter
    if (!sourceLang) {
      return res.status(400).json({
        success: false,
        message: 'Source language (sourceLang) is required',
      });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: getMessage(req.lang, 'text_to_translate_required'),
      });
    }

    if (!entityId || !entityType) {
      return res.status(400).json({
        success: false,
        message: getMessage(req.lang, 'entity_id_and_type_required'),
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

    const allLangCodes = getActiveLangCodes();
    const targetLangs = allLangCodes.filter(lang => lang !== sourceLang);

    const translations = {};
    for (const lang of targetLangs) {
      const hashKey = crypto
        .createHash('md5')
        .update(`${text}:${lang}`)
        .digest('hex');

      // Check cache if enabled
      let translatedText;
      if (useCache) {
        const cached = await LiveTranslationCache.findOne({ hashKey }).lean();
        if (cached) {
          translatedText = cached.translatedText;
          translations[lang] = translatedText;
          continue;
        }
      }

      // Translate using Cloudflare AI
      translatedText = await cloudflareAiService.translate(text, sourceLang, lang);
      translations[lang] = translatedText;

      // Save to cache (OLD schema)
      await LiveTranslationCache.create({
        hashKey,
        originalText: text,
        targetLang: lang,
        translatedText,
        entityId,
        entityType,
        status: 'success',
      });

      // Shadow write to NEW schema (Phase 1)
      if (TranslationShadowWriteService.isShadowWriteEnabled()) {
        await TranslationShadowWriteService.writeShadowUserContentTranslation(
          hashKey,
          entityType,
          lang,
          {
            originalText: text,
            translatedText,
            status: 'success',
            entityId,
          }
        );
      }
    }

    res.json({
      success: true,
      data: {
        originalText: text,
        entityId,
        entityType,
        translations,
        allLangs: true,
        fromCache: false,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error translating product to all languages:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getProductCatalogTranslations = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: getMessage(resolvedLang, 'translation.productIdRequired'),
      });
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${resolvedLang}. Please ensure the language is added and activated in the system.`,
      });
    }

    const result = {
      name: null,
      description: null,
      brand: null,
      specs: {},
      features: [],
    };

    // Phase 3: Try to read from NEW schema first
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
    const newSchemaData = await ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: resolvedLang,
    }).lean();

    if (newSchemaData) {
      Object.assign(result, {
        name: newSchemaData.name,
        description: newSchemaData.description,
        brand: newSchemaData.brand,
        specs: newSchemaData.specs || {},
        features: newSchemaData.features || [],
      });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({
        success: true,
        data: result,
      });
    }

    // Fallback: Read from OLD schema
    const translations = await LiveTranslationCache.find({
      entityId: productId,
      targetLang: lang,
    }).lean();

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

exports.getReviewTranslations = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!reviewId) {
      return res.status(400).json({
        success: false,
        message: getMessage(resolvedLang, 'translation.productIdRequired'),
      });
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${resolvedLang}. Please ensure the language is added and activated in the system.`,
      });
    }

    const result = {
      name: null,
      comment: null,
    };

    // Phase 3: Try to read from NEW schema first
    const UserContentTranslationCache = require('../models/UserContentTranslationCache');
    const reviewTranslation = await UserContentTranslationCache.findOne({
      entityId: reviewId,
      entityType: 'review',
      targetLang: resolvedLang,
    }).lean();

    if (reviewTranslation) {
      Object.assign(result, {
        comment: reviewTranslation.translatedText,
        name: reviewTranslation.originalText,
      });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({
        success: true,
        data: result,
      });
    }

    // Fallback: Read from OLD schema
    const translations = await LiveTranslationCache.find({
      entityId: reviewId,
      entityType: { $in: ['review_name', 'review_comment'] },
      targetLang: lang,
    }).lean();

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
      const lang = getLanguageParam({ lang: req.lang });
      return res.status(403).json({
        success: false,
        message: getMessage(lang, 'payment.devModeOnly'),
      });
    }

    const results = await seedTranslations();

    res.json({
      success: true,
      message: getMessage(req.lang, 'static_translations_reloaded'),
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
        message: getMessage(req.lang, 'code_namespace_translations_required'),
      });
    }

    const result = await StaticTranslation.findOneAndUpdate(
      { code: language, namespace },
      { translations, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: getMessage(req.lang, 'translations_synced_successfully'),
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

const DYNAMIC_ENTITY_TYPES = new Set([
  'product_name',
  'product_description',
  'product_brand',
  'product_spec',
  'product_feature',
  'category_name',
  'category_description',
  'review',
  'generic',
]);

exports.retranslateDynamic = async (req, res) => {
  try {
    const { lang, limit = 100, entityType } = req.body || {};
    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return res.status(400).json({
        success: false,
        message: 'limit must be an integer between 1 and 500',
      });
    }

    if (entityType && !DYNAMIC_ENTITY_TYPES.has(entityType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dynamic entity type',
      });
    }

    const result = await retranslateSeeder.retranslate({
      lang: lang || null,
      entityType: entityType || null,
      limit: parsedLimit,
      validate: true,
      verbose: false,
      actor: req.user?._id?.toString() || 'admin',
    });

    const { totalToRetranslate, fixedCount, stillBrokenCount } = result.stats;
    return res.json({
      success: true,
      message: totalToRetranslate === 0
        ? 'No dynamic translations need retranslation'
        : 'Dynamic translations retranslation completed',
      data: {
        totalToRetranslate,
        fixedCount,
        stillBrokenCount,
        results: result.results.map(({ originalId, newId, status, wasFixed, validationErrors }) => ({
          originalId,
          newId,
          status,
          wasFixed,
          validationErrors,
        })),
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error retranslating dynamic translations:', error);
    return res.status(500).json({
      success: false,
      message: 'Dynamic retranslation failed',
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
      const lang = getLanguageParam({ lang: req.lang });
      return res.status(404).json({
        success: false,
        message: getMessage(lang, 'translation.cacheNotFound'),
      });
    }

    res.json({
      success: true,
      message: getMessage(req.lang, 'cache_record_deleted'),
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
        message: getMessage(req.lang, 'translation_not_found'),
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
        message: getMessage(req.lang, 'invalid_translation_id_format'),
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
        message: getMessage(req.lang, 'key_is_required'),
      });
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: getMessage(req.lang, 'translation_not_found'),
      });
    }

    translation.translations[key] = value;
    await translation.save();

    res.json({
      success: true,
      message: getMessage(req.lang, 'translation_updated_successfully'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: getMessage(req.lang, 'invalid_translation_id_format'),
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
        message: getMessage(req.lang, 'key_is_required'),
      });
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: getMessage(req.lang, 'translation_not_found'),
      });
    }

    delete translation.translations[key];
    await translation.save();

    res.json({
      success: true,
      message: getMessage(req.lang, 'translation_key_deleted'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: getMessage(req.lang, 'invalid_translation_id_format'),
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
        message: getMessage(req.lang, 'admin-controllers-messages.invalid_translation_id'),
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
        message: getMessage(req.lang, 'admin-controllers-messages.invalid_translation_id'),
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
        message: getMessage(req.lang, 'admin-controllers-messages.invalid_translation_id'),
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
    const defaultLang = getDefaultLanguage().code;
    const { items, targetLang = defaultLang, namespace = 'common' } = req.body;

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
        defaultLang,
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
 * Layer 2 (Products) only - không retry Layer 1 (UI strings)
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
        const { getDefaultLanguage } = require('../config/languageInventory');
        const defaultLang = getDefaultLanguage().code;
        const result = await ProductTranslationSeederService.retryFailedTranslations(lang, defaultLang, 3);
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
    const { hashKey, translatedText, reason = null } = req.body;
    const defaultLang = getDefaultLanguage().code.toUpperCase();
    const unknownUser = getMessage(defaultLang, 'common.unknown');
    const userId = req.user?.id || 'anonymous';
    const userName = req.user?.name || unknownUser;

    if (!hashKey || !translatedText) {
      return res.status(400).json({
        success: false,
        message: 'hashKey and translatedText are required',
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');

    // Get old value before update
    const oldRecord = await LiveTranslationCache.findOne({ hashKey }).lean();
    const oldValue = oldRecord?.translatedText || null;

    const updated = await RateLimitHandler.manualOverride(hashKey, translatedText);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Translation not found',
      });
    }

    // Log audit trail
    await TranslationShadowWriteService.logAuditTrail({
      userId,
      userName,
      action: 'manual_override',
      oldValue,
      newValue: translatedText,
      entityId: oldRecord?.entityId,
      entityType: oldRecord?.entityType,
      targetLang: oldRecord?.targetLang,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

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

// Batch Manual Override: Admin sửa nhiều dịch cùng lúc (Layer 2 - Products only)
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

// Get fallback translations for offline support (Rule #1: Static UI)
// Used by Frontend when API is unavailable - ensures no "khung một đằng, ruột một nẻo"
// SSOT: Loads from StaticTranslation database, not hardcoded JSON
exports.getFallbackTranslations = async (req, res) => {
  try {
    const { lang } = req.query;
    const { isSupportedLanguage } = require('../config/languageInventory');

    // Validate language if specified
    if (lang && !isSupportedLanguage(lang)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${lang}`,
      });
    }

    // Cache for 24 hours (fallback translations are relatively stable)
    res.set('Cache-Control', 'public, max-age=86400');

    // If specific language requested, return only that language
    if (lang) {
      const staticTrans = await StaticTranslation.find({
        code: lang,
        isDeleted: false,
      }).lean();

      if (!staticTrans || staticTrans.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Fallback translations not found for language: ${lang}`,
        });
      }

      // Build translations object from all namespaces
      const translations = {};
      for (const ns of staticTrans) {
        translations[ns.namespace] = ns.translations;
      }

      return res.json({
        success: true,
        data: {
          locale: lang,
          translations,
        },
      });
    }

    // Return all 9 languages if no specific language requested
    const allTranslations = await StaticTranslation.find({
      isDeleted: false,
    }).lean();

    const result = {};
    for (const trans of allTranslations) {
      if (!result[trans.code]) {
        result[trans.code] = {};
      }
      result[trans.code][trans.namespace] = trans.translations;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error getting fallback translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * QUY TẮC #2: Dynamic overlay endpoint
 * Frontend calls this to fetch entity-specific translations (products, categories, brands, etc.)
 * @route POST /api/translations/dynamic
 * @query lang - Target language (vi, en, fr, etc.)
 * @query entityType - Type of entity (product, category, brand, coupon, order, banner)
 * @body Array of { entityId, entityType, originalValue }
 */
exports.getDynamicTranslations = async (req, res) => {
  try {
    const { lang, entityType } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });
    const items = req.body || [];

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be an array of translation requests',
      });
    }

    if (!entityType) {
      return res.status(400).json({
        success: false,
        message: 'entityType query parameter is required',
      });
    }

    // Check if language is supported
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${resolvedLang}`,
      });
    }


    const result = {};

    // Fetch translations based on entity type
    for (const item of items) {
      const { entityId, entityType: itemType, originalValue } = item;

      try {
        let translatedValue = null;

        // Use the correct translation endpoint based on entity type
        if (itemType === 'product') {
          const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
          const translation = await ProductCatalogTranslationCache.findOne({
            entityId,
            targetLang: resolvedLang,
          }).lean();
          translatedValue = translation?.name || translation?.translatedContent?.name;
        } else if (itemType === 'category') {
          const translation = await CategoryCatalogTranslationCache.findOne({
            entityId: String(entityId),
            targetLang: resolvedLang,
            status: 'success',
          }).lean();
          translatedValue = translation?.name;
        } else if (itemType === 'brand') {
          const BrandTranslationCache = require('../models/BrandTranslationCache');
          const translation = await BrandTranslationCache.findOne({
            brandId: entityId,
            targetLang: resolvedLang,
          }).lean();
          translatedValue = translation?.name || translation?.translatedContent?.name;
        }

        // Use original value if no translation found
        result[entityId] = translatedValue || originalValue;
      } catch (error) {
        console.error(`[getDynamicTranslations] Error translating ${itemType}:${entityId}:`, error);
        result[entityId] = originalValue;
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error getting dynamic translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * QUY TẮC #1 + #2: Verify translation consistency
 * Checks if an entity has complete translation coverage for a given language
 * @route GET /api/translations/verify
 * @query entityId - Entity ID to verify
 * @query lang - Language to verify
 */
exports.verifyTranslationConsistency = async (req, res) => {
  try {
    const { entityId, lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!entityId) {
      return res.status(400).json({
        success: false,
        message: 'entityId query parameter is required',
      });
    }

    // Vietnamese is always considered complete (source language)
    const DEFAULT_LANG = getDefaultLanguage().code;
    if (resolvedLang === DEFAULT_LANG) {
      return res.json({
        success: true,
        data: {
          isConsistent: true,
          lang: resolvedLang,
          entityId,
        },
      });
    }

    // Check if language is supported
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: ${resolvedLang}`,
      });
    }

    // For now, return true if any translation cache entry exists
    // In future, could check for specific fields (name, description, etc.)
    const translationCaches = [
      ProductCatalogTranslationCache,
      CategoryCatalogTranslationCache,
      require('../models/BrandTranslationCache'),
    ];

    let hasTranslation = false;
    for (const cache of translationCaches) {
      const entry = await cache.findOne({
        $or: [
          { entityId, targetLang: resolvedLang },
          { categoryId: entityId, targetLang: resolvedLang },
          { brandId: entityId, targetLang: resolvedLang },
        ],
      }).lean();

      if (entry) {
        hasTranslation = true;
        break;
      }
    }

    res.json({
      success: true,
      data: {
        isConsistent: hasTranslation,
        lang,
        entityId,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error verifying translation consistency:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/translations/fallback
 * Return fallback chain for a language + namespace
 * Dynamic fallback: [requestedLang, DEFAULT_LANG, ...otherLanguages]
 * Supports all 9 languages: VI, EN, PT, FR, DE, IT, ES, NL, SV
 */
exports.getFallbackTranslations = async (req, res) => {
  try {
    let { lang, ns = 'common' } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });
    const TranslationCacheService = require('../services/translationCacheService');

    if (!resolvedLang) {
      return res.status(400).json({
        success: false,
        message: 'Language (lang) is required',
      });
    }

    // Fallback to 'common' if namespace is empty string or invalid
    if (!ns || ns === 'undefined' || ns.trim() === '') {
      ns = 'common';
    }

    // Check cache first
    const cached = TranslationCacheService.get('fallback', resolvedLang, ns);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('X-Cache', 'HIT');
      return res.json({
        success: true,
        data: cached,
      });
    }

    // Fallback chain: [requested lang, default lang, then all other active languages]
    const DEFAULT_LANG = getDefaultLanguage().code;
    const allActiveLangs = getActiveLangCodes();
    const fallbackChain = [
      resolvedLang,
      DEFAULT_LANG,
      ...allActiveLangs.filter(l => l !== resolvedLang && l !== DEFAULT_LANG)
    ];

    let translation = null;
    let appliedLang = null;

    // Try each language in fallback chain
    for (const fallbackLang of fallbackChain) {
      translation = await StaticTranslation.findOne({
        code: fallbackLang,
        namespace: ns,
        isDeleted: false,
      }).lean();

      if (translation) {
        appliedLang = fallbackLang;
        break;
      }
    }

    if (!translation) {
      return res.status(404).json({
        success: false,
        message: `Translations not found in fallback chain for namespace: ${ns}`,
      });
    }

    // Flatten translations
    const { flattenJson } = require('../utils/jsonFlattener');
    const flattenedTranslations = flattenJson(translation.translations);

    const responseData = {
      requestedLang: lang,
      appliedLang,
      fallbackChain,
      fallbackUsed: appliedLang !== lang,
      namespace: ns,
      translations: flattenedTranslations,
    };

    // Cache the response
    TranslationCacheService.set('fallback', lang, responseData, ns);

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('X-Cache', 'MISS');

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching fallback translations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/translations/health
 * Return health check for translation system
 * Shows coverage % per language
 */
exports.getTranslationHealth = async (req, res) => {
  try {
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });
    const TranslationCacheService = require('../services/translationCacheService');

    // Check cache first
    const cached = TranslationCacheService.get('health', resolvedLang);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('X-Cache', 'HIT');
      return res.json({
        success: true,
        data: cached,
      });
    }

    // Check if language is supported
    const LanguageService = require('../services/languageService');
    const isSupported = await LanguageService.isSupportedLanguage(resolvedLang);

    if (!isSupported) {
      return res.status(400).json({
        success: false,
        message: `Language not supported: ${resolvedLang}`,
      });
    }

    // Get total namespaces for this language
    const translationDocs = await StaticTranslation.find({
      code: lang,
      isDeleted: false,
    }).lean();

    const totalNamespaces = translationDocs.length;
    const completeNamespaces = translationDocs.filter(doc =>
      doc.translations && Object.keys(doc.translations).length > 0
    ).length;
    const partialNamespaces = totalNamespaces - completeNamespaces;

    // Get last update time
    const lastUpdate = translationDocs.length > 0
      ? new Date(Math.max(...translationDocs.map(d => d.updatedAt || d.createdAt)))
      : null;

    const responseData = {
      lang,
      isReady: completeNamespaces > 0,
      coverage: {
        namespaces: totalNamespaces,
        complete: completeNamespaces,
        partial: partialNamespaces,
        coverage: totalNamespaces > 0 ? Math.round((completeNamespaces / totalNamespaces) * 100) : 0,
      },
      lastUpdated: lastUpdate ? lastUpdate.toISOString() : null,
      timestamp: new Date().toISOString(),
    };

    // Cache the response
    TranslationCacheService.set('health', lang, responseData);

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('X-Cache', 'MISS');

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('[TranslationController] Error checking translation health:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/translations/admin/regenerate-product-cache
 * Regenerate ProductCatalogTranslationCache from LiveTranslationCache
 * Used when products only show in Vietnamese (other languages missing)
 */
exports.regenerateProductCache = async (req, res) => {
  try {
    console.log('[TranslationController] Starting product cache regeneration...');

    // Check LiveTranslationCache
    const liveRecordCount = await LiveTranslationCache.countDocuments();
    console.log(`  Found ${liveRecordCount} records in LiveTranslationCache`);

    if (liveRecordCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No translations found in LiveTranslationCache. Run seeding first: npm run seed',
      });
    }

    // Clear old ProductCatalogTranslationCache
    console.log('[TranslationController] Clearing old ProductCatalogTranslationCache...');
    const deletedCount = await ProductCatalogTranslationCache.deleteMany({});
    console.log(`  Deleted ${deletedCount.deletedCount} old cache entries`);

    // Run specTranslationSeeder to aggregate
    console.log('[TranslationController] Running aggregation from LiveTranslationCache...');
    const specTranslationSeeder = require('../seeds/specTranslationSeeder');
    const result = await specTranslationSeeder();

    // Verify result
    const newCacheCount = await ProductCatalogTranslationCache.countDocuments();
    console.log(`[TranslationController] ✅ Regeneration complete: ${newCacheCount} cache entries`);

    res.json({
      success: true,
      message: 'Product translation cache regenerated successfully',
      stats: {
        ...result,
        cacheEntries: newCacheCount,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error regenerating product cache:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
