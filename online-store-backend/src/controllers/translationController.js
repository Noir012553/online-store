const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
const Product = require('../models/Product');
const translationValidator = require('../utils/translationValidator');
const cloudflareAiService = require('../services/cloudflareAiService');
const LanguageService = require('../services/languageService');
const TranslationShadowWriteService = require('../services/translationShadowWriteService');
const TranslationBatchRequest = require('../models/TranslationBatchRequest');
const { flattenJson } = require('../utils/jsonFlattener');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const seedTranslations = require('../seeds/translationSeeder');
const retranslateSeeder = require('../seeds/retranslateSeeder');
const { getMessage } = require('../i18n/messages');
const { SUPPORTED_LANGUAGES, getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

const SUPPORTED_LANG_CODES = SUPPORTED_LANGUAGES.map(({ code }) => code);

// Helper to get language from request with dynamic default
const getLanguageParam = (query = {}) => {
  const ACTIVE_LANGS = getActiveLangCodes();
  const DEFAULT_LANG = getDefaultLanguage().code;

  const lang = query.lang || DEFAULT_LANG;
  return ACTIVE_LANGS.includes(lang) ? lang : DEFAULT_LANG;
};

const getRequestLanguage = (req) => req.lang || getLanguageParam(req.query);

const sendTranslationError = (res, status, lang, code, messageKey, values = {}) => (
  res.status(status).json({
    success: false,
    code,
    message: getMessage(
      lang,
      messageKey.includes('.') ? messageKey : `translation-messages.${messageKey}`,
      values
    ),
  })
);

const ENTITY_TYPE_MAP = {
  product: 'product_name',
  description: 'product_description',
  spec: 'product_spec',
  review: 'review',
  category: 'category_name',
  ad_hoc: 'generic',
};

const resolveTranslationRecord = async ({ hashKey, entityId, entityType, targetLang }) => {
  if (hashKey) return LiveTranslationCache.findOne({ hashKey });

  const canonicalEntityType = ENTITY_TYPE_MAP[entityType] || entityType;
  if (!entityId || !canonicalEntityType || !targetLang) return null;

  return LiveTranslationCache.findOne({
    entityId,
    entityType: canonicalEntityType,
    targetLang,
  });
};

exports.getStaticTranslations = async (req, res) => {
  try {
    let { lang, ns = 'common' } = req.query;
    lang = getLanguageParam({ lang });

    // Fallback to 'common' if namespace is empty string or invalid
    if (!ns || ns === 'undefined' || ns.trim() === '') {
      ns = 'common';
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(ns)) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_NAMESPACE_INVALID',
        'admin-errors.failed_load_namespace'
      );
    }

    const translation = await StaticTranslation.findOne({
      code: lang,
      namespace: ns,
      isDeleted: false,
    });

    const defaultLang = getDefaultLanguage().code;
    const defaultLocalePath = path.join(__dirname, '../locales', defaultLang, `${ns}.json`);
    const localePath = path.join(__dirname, '../locales', lang, `${ns}.json`);
    const defaultTranslations = lang !== defaultLang && fs.existsSync(defaultLocalePath)
      ? JSON.parse(fs.readFileSync(defaultLocalePath, 'utf8'))
      : {};
    const translations = {
      ...defaultTranslations,
      ...(translation?.translations || {}),
      ...(fs.existsSync(localePath) ? JSON.parse(fs.readFileSync(localePath, 'utf8')) : {}),
    };

    if (Object.keys(translations).length === 0) {
      return sendTranslationError(
        res,
        404,
        lang,
        'STATIC_TRANSLATIONS_NOT_FOUND',
        'static_translations_not_found'
      );
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'STATIC_TRANSLATIONS_FETCH_FAILED',
      'static_translations_fetch_failed'
    );
  }
};

/**
 * GET /api/products/:id/translations
 * Fetch translated product data (name, description, brand, specs) for a specific language
 * Returns translated data for target languages and source product data for the default language
 */
exports.getProductTranslations = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!isProductId(productId) || !resolvedLang) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_PRODUCT_TARGET_INVALID',
        'product_target_invalid'
      );
    }

    if (resolvedLang === getDefaultLanguage().code) {
      const sourceProduct = await Product.findById(productId)
        .select('name description brand specs')
        .lean();

      if (!sourceProduct) {
        return sendTranslationError(
          res,
          404,
          getRequestLanguage(req),
          'TRANSLATION_PRODUCT_TRANSLATION_NOT_AVAILABLE',
          'product_fetch_failed'
        );
      }

      return res.json({
        success: true,
        data: {
          name: sourceProduct.name,
          description: sourceProduct.description,
          brand: sourceProduct.brand,
          specs: sourceProduct.specs instanceof Map
            ? Object.fromEntries(sourceProduct.specs)
            : sourceProduct.specs || {},
        },
      });
    }

    const data = await getProductTranslationData(productId, resolvedLang, false);
    if (!data) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_PRODUCT_TRANSLATION_NOT_AVAILABLE',
        'product_fetch_failed'
      );
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_PRODUCT_FETCH_FAILED',
      'product_fetch_failed'
    );
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
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TARGET_LANGUAGE_REQUIRED', 'target_language_required');
    }

    if (!sourceLang) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_SOURCE_LANGUAGE_REQUIRED', 'source_language_required');
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TEXT_REQUIRED', 'text_required');
    }

    // Check source language dynamically
    const isSourceSupported = await LanguageService.isSupportedLanguage(sourceLang);
    if (!isSourceSupported) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_SOURCE_LANGUAGE_UNSUPPORTED',
        'source_language_unsupported',
        { language: sourceLang }
      );
    }

    // Layer 2 (Products): Translate to all 9 languages except source language
    // When targetLang === 'all', dịch cả 9 ngôn ngữ (excluding source lang)
    if (targetLang === 'all') {
      const targetLangs = SUPPORTED_LANG_CODES.filter(lang => lang !== sourceLang);

      const translations = {};
      for (const lang of targetLangs) {
        const hashKey = crypto
          .createHash('md5')
          .update(`${text}:${lang}`)
          .digest('hex');

        // Check cache if enabled
        let translatedText;
        if (useCache) {
          const cached = await LiveTranslationCache.findOne({
            hashKey,
            status: 'success',
            qualityStatus: 'approved',
          }).lean();
          if (cached?.status === 'success' && cached?.qualityStatus === 'approved') {
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
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_TARGET_LANGUAGE_UNSUPPORTED',
        'target_language_unsupported',
        { language: targetLang }
      );
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
      const cached = await LiveTranslationCache.findOne({
        hashKey,
        status: 'success',
        qualityStatus: 'approved',
      }).lean();
      if (cached?.status === 'success' && cached?.qualityStatus === 'approved') {
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_REQUEST_FAILED',
      'translation_request_failed'
    );
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
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_SOURCE_LANGUAGE_REQUIRED', 'source_language_required');
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TEXT_REQUIRED', 'text_required');
    }

    if (!entityId || !entityType) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ENTITY_ID_AND_TYPE_REQUIRED',
        'admin-controllers-messages.entity_id_and_type_required'
      );
    }

    // Check source language dynamically
    const isSourceSupported = await LanguageService.isSupportedLanguage(sourceLang);
    if (!isSourceSupported) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_SOURCE_LANGUAGE_UNSUPPORTED',
        'source_language_unsupported',
        { language: sourceLang }
      );
    }

    const targetLangs = SUPPORTED_LANG_CODES.filter(lang => lang !== sourceLang);

    const translations = {};
    for (const lang of targetLangs) {
      const hashKey = crypto
        .createHash('md5')
        .update(`${text}:${lang}`)
        .digest('hex');

      // Check cache if enabled
      let translatedText;
      if (useCache) {
        const cached = await LiveTranslationCache.findOne({
          hashKey,
          status: 'success',
          qualityStatus: 'approved',
        }).lean();
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_REQUEST_FAILED',
      'translation_request_failed'
    );
  }
};

exports.getProductCatalogTranslations = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!productId) {
      return sendTranslationError(
        res,
        400,
        resolvedLang,
        'TRANSLATION_PRODUCT_ID_REQUIRED',
        'product_id_required'
      );
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return sendTranslationError(
        res,
        400,
        resolvedLang,
        'TRANSLATION_TARGET_LANGUAGE_UNSUPPORTED',
        'target_language_unsupported',
        { language: resolvedLang }
      );
    }

    const result = {
      name: null,
      description: null,
      brand: null,
      specs: {},
    };

    // Phase 3: Try to read from NEW schema first
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
    const newSchemaData = await ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: resolvedLang,
      status: 'success',
      qualityStatus: 'approved',
    }).lean();

    if (newSchemaData) {
      Object.assign(result, {
        name: newSchemaData.name,
        description: newSchemaData.description,
        brand: newSchemaData.brand,
        specs: newSchemaData.specs || {},
      });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({
        success: true,
        data: result,
      });
    }

    if (process.env.TRANSLATION_LEGACY_FALLBACK === 'false') {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({ success: true, data: result });
    }

    // Fallback: Read from OLD schema
    const translations = await LiveTranslationCache.find({
      entityId: productId,
      targetLang: resolvedLang,
      status: 'success',
      qualityStatus: 'approved',
    }).lean();

    const specs = {};
    let hasSpecs = false;

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
      }
    }

    if (hasSpecs) {
      result.specs = specs;
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_PRODUCT_FETCH_FAILED',
      'product_fetch_failed'
    );
  }
};

exports.getReviewTranslations = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { lang } = req.query;
    const resolvedLang = req.lang || getLanguageParam({ lang });

    if (!reviewId) {
      return sendTranslationError(
        res,
        400,
        resolvedLang,
        'TRANSLATION_REVIEW_ID_REQUIRED',
        'product_id_required'
      );
    }

    // Check language dynamically from DB
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return sendTranslationError(
        res,
        400,
        resolvedLang,
        'TRANSLATION_TARGET_LANGUAGE_UNSUPPORTED',
        'target_language_unsupported',
        { language: resolvedLang }
      );
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
      targetLang: resolvedLang,
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_PRODUCT_FETCH_FAILED',
      'product_fetch_failed'
    );
  }
};

exports.refetchStaticTranslations = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      const lang = getLanguageParam({ lang: req.lang });
      return sendTranslationError(
        res,
        403,
        lang,
        'TRANSLATION_DEV_MODE_ONLY',
        'payment-messages.dev_mode_only'
      );
    }

    const results = await seedTranslations();

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.static_translations_reloaded'),
      data: results,
    });
  } catch (error) {
    console.error('[TranslationController] Error reloading translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.syncTranslationsFromJSON = async (req, res) => {
  try {
    const { language, namespace, translations } = req.body;

    if (!language || !namespace || !translations) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_CODE_NAMESPACE_TRANSLATIONS_REQUIRED',
        'admin-controllers-messages.code_namespace_translations_required'
      );
    }

    const result = await StaticTranslation.findOneAndUpdate(
      { code: language, namespace },
      { translations, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translations_synced_successfully'),
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error syncing translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

const PRODUCT_TRANSLATION_ENTITY_TYPES = [
  'product_name',
  'product_description',
  'product_spec',
];
const PRODUCT_TRANSLATION_FIELDS = ['name', 'description', 'specs'];

const PRODUCT_TRANSLATION_QUALITY_STATUSES = new Set([
  'pending',
  'approved',
  'needs_retranslate',
  'rejected',
]);

const productTranslationStatus = (translation) => {
  if (!translation) return 'missing';
  if (translation.status !== 'success') return 'rejected';
  return PRODUCT_TRANSLATION_QUALITY_STATUSES.has(translation.qualityStatus)
    ? translation.qualityStatus
    : 'pending';
};

const isProductId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const buildLegacyProductTranslation = (translations) => {
  if (translations.length === 0) return null;

  const data = { specs: {} };
  translations.forEach((translation) => {
    switch (translation.entityType) {
      case 'product_name':
        data.name = translation.translatedText;
        break;
      case 'product_description':
        data.description = translation.translatedText;
        break;
      case 'product_spec':
        if (translation.specKey) data.specs[translation.specKey] = translation.translatedText;
        break;
    }
  });

  return data;
};


const getSpecEntries = (specs) => (
  specs instanceof Map
    ? [...specs.entries()]
    : specs && typeof specs === 'object'
      ? Object.entries(specs)
      : []
);

const hasCompleteProductTranslation = (sourceProduct, translation) => {
  const requiredFields = ['name', 'brand'];
  if (typeof sourceProduct?.description === 'string' && sourceProduct.description.trim()) {
    requiredFields.push('description');
  }
  if (requiredFields.some((field) => typeof translation?.[field] !== 'string' || !translation[field].trim())) {
    return false;
  }

  const sourceSpecs = getSpecEntries(sourceProduct?.specs).filter(([, value]) => value !== null && value !== undefined && String(value).trim());
  const translatedSpecs = getSpecEntries(translation?.specs).filter(([, value]) => typeof value === 'string' && value.trim());
  return translatedSpecs.length >= sourceSpecs.length;
};

const getProductTranslationData = async (productId, targetLang, includeNonSuccess) => {
  const catalogQuery = { entityId: productId, targetLang };
  const legacyQuery = {
    entityId: productId,
    targetLang,
    entityType: { $in: PRODUCT_TRANSLATION_ENTITY_TYPES },
  };
  if (!includeNonSuccess) {
    catalogQuery.status = 'success';
    catalogQuery.qualityStatus = 'approved';
    legacyQuery.status = 'success';
    legacyQuery.qualityStatus = 'approved';
  }

  const translation = await ProductCatalogTranslationCache.findOne(catalogQuery).lean();
  const sourceProduct = includeNonSuccess
    ? null
    : await Product.findById(productId).select('name description brand specs').lean();

  if (translation) {
    const data = {
      name: translation.name || undefined,
      description: translation.description || undefined,
      brand: translation.brand || undefined,
      specs: translation.specs instanceof Map ? Object.fromEntries(translation.specs) : translation.specs || {},
    };
    if (!includeNonSuccess && !hasCompleteProductTranslation(sourceProduct, data)) return null;
    return data;
  }

  const legacyTranslations = await LiveTranslationCache.find(legacyQuery).lean();
  const legacyTranslation = buildLegacyProductTranslation(legacyTranslations);
  if (!legacyTranslation) return null;
  legacyTranslation.brand = sourceProduct.brand;
  if (!includeNonSuccess && !hasCompleteProductTranslation(sourceProduct, legacyTranslation)) return null;

  return legacyTranslation;
};

exports.getProductTranslationForAdmin = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang } = req.query;
    if (!isProductId(productId) || typeof lang !== 'string' || !SUPPORTED_LANG_CODES.includes(lang)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_PRODUCT_TARGET_INVALID', 'product_target_invalid');
    }

    const data = await getProductTranslationData(productId, lang, true);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translation for admin:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_PRODUCT_FETCH_FAILED', 'product_fetch_failed');
  }
};

exports.getProductTranslationStatuses = async (req, res) => {
  try {
    const { lang } = req.query;
    if (typeof lang !== 'string' || !SUPPORTED_LANG_CODES.includes(lang)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TARGET_LANGUAGE_INVALID', 'target_language_invalid');
    }
    const productIds = (req.query.productIds || '').split(',').filter(isProductId);

    if (productIds.length === 0 || productIds.length > 50) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_PRODUCT_IDS_INVALID', 'product_ids_invalid');
    }

    const [catalogTranslations, products] = await Promise.all([
      ProductCatalogTranslationCache.find({ entityId: { $in: productIds }, targetLang: lang }).lean(),
      Product.find({ _id: { $in: productIds } }).select('specs').lean(),
    ]);
    const catalogByProductId = new Map(catalogTranslations.map((translation) => [translation.entityId, translation]));
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));
    const missingCatalogProductIds = productIds.filter((productId) => !catalogByProductId.has(productId));
    const legacyTranslations = missingCatalogProductIds.length > 0
      ? await LiveTranslationCache.find({
        entityId: { $in: missingCatalogProductIds },
        targetLang: lang,
        entityType: { $in: PRODUCT_TRANSLATION_ENTITY_TYPES },
      }).lean()
      : [];
    const legacyByProductId = new Map();

    legacyTranslations.forEach((translation) => {
      const current = legacyByProductId.get(translation.entityId) || [];
      current.push(translation);
      legacyByProductId.set(translation.entityId, current);
    });

    const data = productIds.map((productId) => {
      const catalogTranslation = catalogByProductId.get(productId);
      if (catalogTranslation) {
        return {
          productId,
          status: productTranslationStatus(catalogTranslation),
          manualFields: catalogTranslation.manualFields || [],
          updatedAt: catalogTranslation.updatedAt || catalogTranslation.lastTranslatedAt || null,
          validationErrors: catalogTranslation.validationErrors || [],
        };
      }

      const legacyRecords = legacyByProductId.get(productId) || [];
      const currentLegacyRecords = legacyRecords.filter((record) => record.qualityStatus !== 'retranslated');
      const translatedTypes = new Set(currentLegacyRecords.map((record) => record.entityType));
      const product = productsById.get(productId);
      const expectedSpecKeys = Object.keys(product?.specs || {});
      const translatedSpecKeys = new Set(
        currentLegacyRecords
          .filter((record) => record.entityType === 'product_spec' && record.specKey)
          .map((record) => record.specKey)
      );
      const isComplete = ['product_name', 'product_description', 'product_brand'].every((type) => translatedTypes.has(type))
        && expectedSpecKeys.every((key) => translatedSpecKeys.has(key));
      const legacyStatus = currentLegacyRecords.some((record) => record.qualityStatus === 'needs_retranslate')
        ? 'needs_retranslate'
        : currentLegacyRecords.some((record) => record.qualityStatus === 'rejected' || record.status !== 'success')
          ? 'rejected'
          : currentLegacyRecords.some((record) => record.qualityStatus === 'pending')
            ? 'pending'
            : isComplete ? 'approved' : 'missing';

      return { productId, status: legacyStatus, manualFields: [], updatedAt: null, validationErrors: [] };
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[TranslationController] Error fetching product translation statuses:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_STATUSES_FETCH_FAILED', 'statuses_fetch_failed');
  }
};

exports.saveProductTranslation = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const requestedLang = req.query.lang;
    if (typeof requestedLang !== 'string' || !SUPPORTED_LANG_CODES.includes(requestedLang)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TARGET_LANGUAGE_INVALID', 'target_language_invalid');
    }
    const lang = requestedLang;
    if (lang === getDefaultLanguage().code) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_SOURCE_LANGUAGE_INVALID', 'source_language_invalid');
    }
    const translations = req.body || {};
    const allowedFields = ['name', 'description', 'specs'];
    const fields = Object.keys(translations).filter((field) => allowedFields.includes(field));

    if (!isProductId(productId) || fields.length === 0) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_FIELDS_REQUIRED', 'translation_fields_required');
    }
    if (fields.some((field) => ['name', 'description'].includes(field) && typeof translations[field] !== 'string')
      || ('specs' in translations && (!translations.specs || typeof translations.specs !== 'object' || Array.isArray(translations.specs)))) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_PAYLOAD_INVALID', 'invalid_translation_data');
    }

    const [product, existing] = await Promise.all([
      Product.findById(productId).lean(),
      ProductCatalogTranslationCache.findOne({ entityId: productId, targetLang: lang }).lean(),
    ]);
    if (!product) return sendTranslationError(res, 404, getRequestLanguage(req), 'TRANSLATION_PRODUCT_NOT_FOUND', 'product_not_found');

    const manualFields = [...new Set([...(existing?.manualFields || []), ...fields])];
    const allowedTranslations = Object.fromEntries(fields.map((field) => [field, translations[field]]));
    const update = {
      ...allowedTranslations,
      name: allowedTranslations.name ?? existing?.name ?? product.name,
      brand: product.brand,
      status: 'success',
      qualityStatus: 'approved',
      validationErrors: [],
      manualFields,
      lastTranslatedAt: new Date(),
    };
    const translation = await ProductCatalogTranslationCache.findOneAndUpdate(
      { entityId: productId, targetLang: lang },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, data: translation });
  } catch (error) {
    console.error('[TranslationController] Error saving product translation:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_PRODUCT_SAVE_FAILED', 'product_save_failed');
  }
};

exports.exportProductTranslationCache = async (req, res) => {
  try {
    const productIds = (req.query.productIds || '').split(',').filter(isProductId);
    const targetLangs = (req.query.languages || '').split(',').filter((lang) => SUPPORTED_LANG_CODES.includes(lang));
    const fields = (req.query.fields || PRODUCT_TRANSLATION_FIELDS.join(',')).split(',').filter((field) => PRODUCT_TRANSLATION_FIELDS.includes(field));

    if (productIds.length === 0 || productIds.length > 50 || targetLangs.length === 0 || fields.length === 0) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_EXPORT_FILTER_INVALID', 'operation_failed');
    }

    const translations = await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      targetLang: { $in: targetLangs },
    }).lean();
    const records = translations.map((translation) => ({
      productId: translation.entityId,
      targetLang: translation.targetLang,
      translations: Object.fromEntries(fields.map((field) => [field, translation[field]]).filter(([, value]) => value !== undefined)),
      manualFields: (translation.manualFields || []).filter((field) => fields.includes(field)),
      updatedAt: translation.updatedAt || translation.lastTranslatedAt || null,
    }));

    return res.json({ success: true, data: { records } });
  } catch (error) {
    console.error('[TranslationController] Error exporting product translation cache:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_EXPORT_FAILED', 'operation_failed');
  }
};

exports.importProductTranslationCache = async (req, res) => {
  let batchRequest;
  try {
    const { records, idempotencyKey } = req.body || {};
    if (!Array.isArray(records) || records.length === 0 || records.length > 50) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_IMPORT_RECORDS_INVALID', 'operation_failed');
    }
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_IDEMPOTENCY_KEY_INVALID', 'operation_failed');
    }

    const normalizedRecords = records.map((record) => {
      const productId = record?.productId;
      const targetLang = record?.targetLang;
      const translations = record?.translations;
      const fields = translations && typeof translations === 'object' && !Array.isArray(translations)
        ? Object.keys(translations).filter((field) => PRODUCT_TRANSLATION_FIELDS.includes(field))
        : [];
      const manualFields = Array.isArray(record?.manualFields)
        ? record.manualFields.filter((field) => fields.includes(field))
        : fields;
      return { productId, targetLang, translations, fields, manualFields };
    });
    const recordKeys = new Set();
    const isValid = normalizedRecords.every(({ productId, targetLang, translations, fields }) => {
      const key = `${productId}:${targetLang}`;
      if (recordKeys.has(key)) return false;
      recordKeys.add(key);
      return isProductId(productId)
        && targetLang !== getDefaultLanguage().code
        && SUPPORTED_LANG_CODES.includes(targetLang)
        && fields.length > 0
        && typeof translations === 'object'
        && !Array.isArray(translations)
        && (!('name' in translations) || typeof translations.name === 'string')
        && (!('description' in translations) || typeof translations.description === 'string')
        && (!('brand' in translations) || typeof translations.brand === 'string')
        && (!('specs' in translations) || (translations.specs && typeof translations.specs === 'object' && !Array.isArray(translations.specs)));
    });
    if (!isValid) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_IMPORT_RECORD_INVALID', 'operation_failed');
    }

    const userId = req.user?.id || req.user?._id?.toString() || 'anonymous';
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(normalizedRecords)).digest('hex');
    try {
      batchRequest = await TranslationBatchRequest.create({ userId, idempotencyKey, payloadHash });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existingRequest = await TranslationBatchRequest.findOne({ userId, idempotencyKey }).lean();
      if (!existingRequest || existingRequest.payloadHash !== payloadHash) {
        return sendTranslationError(res, 409, getRequestLanguage(req), 'TRANSLATION_IDEMPOTENCY_KEY_CONFLICT', 'operation_failed');
      }
      if (existingRequest.status === 'completed' && existingRequest.response) return res.json(existingRequest.response);
      return sendTranslationError(res, 409, getRequestLanguage(req), 'TRANSLATION_BATCH_ALREADY_PROCESSING', 'operation_failed');
    }

    const productIds = normalizedRecords.map(({ productId }) => productId);
    const [products, existingTranslations] = await Promise.all([
      Product.find({ _id: { $in: productIds }, isDeleted: false }).select('name').lean(),
      ProductCatalogTranslationCache.find({
        $or: normalizedRecords.map(({ productId, targetLang }) => ({ entityId: productId, targetLang })),
      }).lean(),
    ]);
    const productNames = new Map(products.map((product) => [product._id.toString(), product.name]));
    if (productNames.size !== new Set(productIds).size) {
      await batchRequest.deleteOne();
      return sendTranslationError(res, 404, getRequestLanguage(req), 'TRANSLATION_PRODUCT_NOT_FOUND', 'product_not_found');
    }
    const existingByKey = new Map(existingTranslations.map((translation) => [`${translation.entityId}:${translation.targetLang}`, translation]));
    const operations = normalizedRecords.map(({ productId, targetLang, translations, fields, manualFields }) => {
      const existing = existingByKey.get(`${productId}:${targetLang}`);
      const importedFields = Object.fromEntries(fields.map((field) => [field, translations[field]]));
      return {
        updateOne: {
          filter: { entityId: productId, targetLang },
          update: {
            $set: {
              ...importedFields,
              name: importedFields.name ?? existing?.name ?? productNames.get(productId),
              status: 'success',
              qualityStatus: 'approved',
              validationErrors: [],
              manualFields: [...new Set([...(existing?.manualFields || []), ...manualFields])],
              lastTranslatedAt: new Date(),
            },
          },
          upsert: true,
        },
      };
    });
    const result = await ProductCatalogTranslationCache.bulkWrite(operations);
    const response = {
      success: true,
      data: {
        totalProcessed: normalizedRecords.length,
        importedCount: result.modifiedCount + result.upsertedCount,
      },
    };
    await TranslationBatchRequest.updateOne({ _id: batchRequest._id }, { $set: { status: 'completed', response } });
    return res.json(response);
  } catch (error) {
    if (batchRequest) await batchRequest.deleteOne();
    console.error('[TranslationController] Error importing product translation cache:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_IMPORT_FAILED', 'operation_failed');
  }
};

exports.retranslateProduct = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { lang: targetLang } = req.body || {};

    if (!isProductId(productId)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_PRODUCT_ID_INVALID', 'product_id_invalid');
    }
    if (typeof targetLang !== 'string' || !SUPPORTED_LANG_CODES.includes(targetLang)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TARGET_LANGUAGE_INVALID', 'target_language_invalid');
    }
    if (targetLang === getDefaultLanguage().code) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_SOURCE_LANGUAGE_INVALID', 'source_language_invalid');
    }

    const [product, catalogTranslation] = await Promise.all([
      Product.findById(productId).lean(),
      ProductCatalogTranslationCache.findOne({ entityId: productId, targetLang }).lean(),
    ]);
    if (!product) return sendTranslationError(res, 404, getRequestLanguage(req), 'TRANSLATION_PRODUCT_NOT_FOUND', 'product_not_found');

    const legacyTranslations = catalogTranslation
      ? []
      : await LiveTranslationCache.find({
        entityId: productId,
        targetLang,
        entityType: { $in: PRODUCT_TRANSLATION_ENTITY_TYPES },
      }).lean();
    const existing = catalogTranslation || buildLegacyProductTranslation(legacyTranslations);
    const manualFields = catalogTranslation?.manualFields || [];
    const translateField = async (field, source, entityType) => {
      if (manualFields.includes(field) || !source) return { value: existing?.[field], validation: null };
      const value = await cloudflareAiService.translate(source, getDefaultLanguage().code, targetLang);
      const validation = await translationValidator.validateTranslation(source, value, targetLang, entityType);
      return { value, validation };
    };

    const [nameResult, descResult] = await Promise.all([
      translateField('name', product.name, 'product_name'),
      translateField('description', product.description, 'product_description'),
    ]);

    const validationResults = [nameResult.validation, descResult.validation].filter(Boolean);
    const specs = {};
    for (const [key, value] of Object.entries(product.specs || {})) {
      if (manualFields.includes('specs')) {
        specs[key] = existing?.specs?.[key] || String(value);
      } else {
        const { value: translated, validation } = await translateField('specs', String(value), 'product_spec');
        specs[key] = translated;
        if (validation) validationResults.push(validation);
      }
    }
    const validationErrors = [...new Set(validationResults.flatMap(({ validationErrors: errs }) => errs))];
    const qualityScore = validationResults.length
      ? Math.min(...validationResults.map(({ qualityScore: score }) => score))
      : 100;
    const hasNeeds = validationResults.some(({ qualityStatus: s }) => s === 'needs_retranslate');
    const hasPending = validationResults.some(({ qualityStatus: s }) => s === 'pending');
    const qualityStatus = hasNeeds ? 'needs_retranslate' : hasPending ? 'pending' : 'approved';

    const translated = {
      name: nameResult.value ?? product.name,
      description: descResult.value,
      brand: product.brand,
      specs,
      status: 'success',
      qualityStatus,
      qualityScore,
      validationErrors,
      manualFields,
      lastTranslatedAt: new Date(),
    };
    const translation = await ProductCatalogTranslationCache.findOneAndUpdate(
      { entityId: productId, targetLang },
      { $set: translated },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        productId,
        lang: targetLang,
        status: translation.qualityStatus,
        skippedManualFields: manualFields,
        updatedAt: translation.updatedAt || translation.lastTranslatedAt || null,
        validationErrors: translation.validationErrors || [],
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error retranslating product:', error);
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_RETRANSLATE_FAILED', 'product_retranslate_failed');
  }
};

const DYNAMIC_ENTITY_TYPES = new Set([
  'product_name',
  'product_description',
  'product_brand',
  'product_spec',
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
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_RETRANSLATE_LIMIT_INVALID', 'retranslate_limit_invalid');
    }

    if (!entityType || !DYNAMIC_ENTITY_TYPES.has(entityType)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_DYNAMIC_ENTITY_TYPE_INVALID', 'dynamic_entity_type_invalid');
    }

    const result = await retranslateSeeder.retranslate({
      lang: lang || null,
      entityType,
      limit: parsedLimit,
      validate: true,
      verbose: false,
      actor: req.user?._id?.toString() || 'admin',
    });

    const { totalToRetranslate, fixedCount, stillBrokenCount } = result.stats;
    const completedWithoutChanges = totalToRetranslate === 0;
    return res.json({
      success: true,
      code: completedWithoutChanges ? 'TRANSLATION_RETRANSLATE_NOT_NEEDED' : 'TRANSLATION_RETRANSLATE_COMPLETED',
      message: getMessage(
        getRequestLanguage(req),
        `translation-messages.${completedWithoutChanges ? 'retranslate_not_needed' : 'retranslate_completed'}`
      ),
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
    return sendTranslationError(res, 500, getRequestLanguage(req), 'TRANSLATION_DYNAMIC_RETRANSLATE_FAILED', 'dynamic_retranslate_failed');
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
      code: 'TRANSLATION_CACHE_CLEARED',
      message: getMessage(getRequestLanguage(req), 'translation-messages.cache_cleared', {
        count: result.deletedCount,
      }),
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error clearing cache:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.deleteCacheRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await LiveTranslationCache.findByIdAndDelete(id);

    if (!result) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_CACHE_NOT_FOUND',
        'cache_not_found'
      );
    }

    res.json({
      success: true,
      code: 'TRANSLATION_CACHE_RECORD_DELETED',
      message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.cache_record_deleted'),
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error deleting cache record:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.getTranslationById = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    res.json({
      success: true,
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id_format'
      );
    }
    console.error('[TranslationController] Error fetching translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.updateTranslationKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_KEY_REQUIRED',
        'admin-controllers-messages.key_is_required'
      );
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    translation.translations[key] = value;
    await translation.save();

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_updated_successfully'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id_format'
      );
    }
    console.error('[TranslationController] Error updating translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.deleteTranslationKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key } = req.body;

    if (!key) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_KEY_REQUIRED',
        'admin-controllers-messages.key_is_required'
      );
    }

    const translation = await StaticTranslation.findById(id);

    if (!translation || translation.isDeleted) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    delete translation.translations[key];
    await translation.save();

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_key_deleted'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id_format'
      );
    }
    console.error('[TranslationController] Error deleting translation key:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.softDeleteTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!translation) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_soft_deleted'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id'
      );
    }
    console.error('[TranslationController] Error soft deleting translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.hardDeleteTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndDelete(id);

    if (!translation) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_hard_deleted'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id'
      );
    }
    console.error('[TranslationController] Error hard deleting translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.restoreTranslation = async (req, res) => {
  try {
    const { id } = req.params;

    const translation = await StaticTranslation.findByIdAndUpdate(
      id,
      { isDeleted: false, deletedAt: null },
      { returnDocument: 'after' }
    );

    if (!translation) {
      return sendTranslationError(
        res,
        404,
        getRequestLanguage(req),
        'TRANSLATION_NOT_FOUND',
        'admin-controllers-messages.translation_not_found'
      );
    }

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_restored'),
      data: translation,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_ID_INVALID',
        'admin-controllers-messages.invalid_translation_id'
      );
    }
    console.error('[TranslationController] Error restoring translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.createStaticTranslation = async (req, res) => {
  try {
    const { code, namespace, translations } = req.body;

    if (!code || !namespace || !translations) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_CODE_NAMESPACE_TRANSLATIONS_REQUIRED',
        'admin-controllers-messages.code_namespace_translations_required'
      );
    }

    const existing = await StaticTranslation.findOne({ code, namespace });
    if (existing) {
      return sendTranslationError(
        res,
        409,
        getRequestLanguage(req),
        'TRANSLATION_ALREADY_EXISTS',
        'admin-controllers-messages.translation_already_exists',
        { code, namespace }
      );
    }

    const newTranslation = await StaticTranslation.create({
      code,
      namespace,
      translations,
    });

    res.status(201).json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_created'),
      data: newTranslation,
    });
  } catch (error) {
    console.error('[TranslationController] Error creating translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.getAllTranslationsByLang = async (req, res) => {
  try {
    const { lang } = req.params;
    const { ns } = req.query;

    if (!lang) {
      return res.status(400).json({
        success: false,
        code: 'LANGUAGE_CODE_REQUIRED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.language_code_required'),
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.bulkTranslateStaticUI = async (req, res) => {
  try {
    const defaultLang = getDefaultLanguage().code;
    const { items, targetLang = defaultLang, namespace = 'common' } = req.body || {};

    if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_NAMESPACE_INVALID', 'invalid_translation_data');
    }
    if (!SUPPORTED_LANG_CODES.includes(targetLang)) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_TARGET_LANGUAGE_INVALID', 'target_language_invalid');
    }

    let sourceItems = items;
    if (!sourceItems) {
      const sourceTranslation = await StaticTranslation.findOne({
        code: defaultLang,
        namespace,
        isDeleted: false,
      }).lean();
      const sourceFilePath = path.join(__dirname, '../locales', defaultLang, `${namespace}.json`);
      const sourceTranslations = {
        ...(fs.existsSync(sourceFilePath) ? JSON.parse(fs.readFileSync(sourceFilePath, 'utf8')) : {}),
        ...(sourceTranslation?.translations || {}),
      };
      sourceItems = Object.entries(flattenJson(sourceTranslations)).map(([key, text]) => ({ key, text }));
    }

    if (!Array.isArray(sourceItems) || sourceItems.length === 0 || sourceItems.some((item) => typeof item?.key !== 'string' || typeof item.text !== 'string')) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_ITEMS_INVALID', 'invalid_translation_data');
    }

    const translations = {};
    for (const item of sourceItems) {
      translations[item.key] = await cloudflareAiService.translate(item.text, defaultLang, targetLang);
    }

    const result = await StaticTranslation.findOneAndUpdate(
      { code: targetLang, namespace },
      { $set: { translations } },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({
      success: true,
      code: 'BULK_TRANSLATIONS_COMPLETED',
      message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.bulk_translations_completed'),
      data: {
        translation: result,
        translatedCount: sourceItems.length,
        failedCount: 0,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error bulk translating:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'LANGUAGE_CODE_REQUIRED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.language_code_required'),
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
          code: 'UI_STATIC',
          progress: Math.round(uiProgress),
          totalNamespaces: Math.round(totalUINamespaces),
          completedNamespaces: translatedUINamespaces,
        },
        layer2: {
          code: 'PRODUCT_DYNAMIC',
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'LANGUAGE_CODE_REQUIRED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.language_code_required'),
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'LANGUAGE_CODE_REQUIRED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.language_code_required'),
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
      code: 'TRANSLATION_RETRY_SCHEDULED',
      message: getMessage(getRequestLanguage(req), 'translation-messages.retry_scheduled', { count: updateResult.modifiedCount }),
      data: {
        resetCount: updateResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error retrying translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'TRANSLATION_FIELDS_REQUIRED',
        message: getMessage(req.lang, 'admin-controllers-messages.hash_key_translated_text_required'),
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const updated = await RateLimitHandler.manualOverride(hashKey, translatedText);

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_updated_successfully'),
      data: updated,
    });
  } catch (error) {
    console.error('[TranslationController] Error editing translation:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'TRANSLATION_UPDATES_REQUIRED',
        message: getMessage(req.lang, 'admin-controllers-messages.updates_array_required'),
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const result = await RateLimitHandler.batchManualOverride(updates);

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.updated_translations_count', { count: result.modifiedCount }),
      data: result,
    });
  } catch (error) {
    console.error('[TranslationController] Error batch editing translations:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

// Manual Override: Admin sửa dịch thủ công cho Layer 2 (Products)
// Khi dịch tự động bị lỗi hoặc không chuẩn, Admin gõ vào ô này để sửa
exports.manualOverrideTranslation = async (req, res) => {
  try {
    const { hashKey, entityId, entityType, targetLang, newValue, translatedText, reason = null } = req.body;
    const defaultLang = getDefaultLanguage().code.toUpperCase();
    const unknownUser = getMessage(defaultLang, 'common.unknown');
    const userId = req.user?.id || 'anonymous';
    const userName = req.user?.name || unknownUser;
    const replacementText = translatedText || newValue;

    if ((!hashKey && (!entityId || !entityType || !targetLang)) || !replacementText) {
      return res.status(400).json({
        success: false,
        code: 'TRANSLATION_FIELDS_REQUIRED',
        message: getMessage(req.lang, 'admin-controllers-messages.hash_key_translated_text_required'),
      });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const oldRecord = await resolveTranslationRecord({ hashKey, entityId, entityType, targetLang });
    if (!oldRecord) {
      return res.status(404).json({
        success: false,
        message: getMessage(req.lang, 'admin-controllers-messages.translation_not_found'),
      });
    }

    const resolvedHashKey = oldRecord.hashKey;
    const oldValue = oldRecord.translatedText || null;
    const updated = await RateLimitHandler.manualOverride(resolvedHashKey, replacementText);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: getMessage(req.lang, 'admin-controllers-messages.translation_not_found'),
      });
    }

    // Log audit trail
    await TranslationShadowWriteService.logAuditTrail({
      userId,
      userName,
      action: 'manual_override',
      oldValue,
      newValue: replacementText,
      entityId: oldRecord?.entityId,
      entityType: oldRecord?.entityType,
      targetLang: oldRecord?.targetLang,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.translation_updated_successfully'),
      data: {
        hashKey: updated.hashKey,
        translatedText: updated.translatedText,
        entityId: updated.entityId,
        entityType: updated.entityType,
        targetLang: updated.targetLang,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error manual override:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

// Batch Manual Override: Admin sửa nhiều dịch cùng lúc (Layer 2 - Products only)
exports.batchManualOverride = async (req, res) => {
  try {
    const updates = req.body.updates || req.body.overrides;
    const idempotencyKey = req.body.idempotencyKey;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'TRANSLATION_UPDATES_REQUIRED',
        message: getMessage(req.lang, 'admin-controllers-messages.updates_array_required'),
      });
    }

    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return sendTranslationError(
        res,
        400,
        getRequestLanguage(req),
        'TRANSLATION_IDEMPOTENCY_KEY_INVALID',
        'operation_failed'
      );
    }

    const userId = req.user?.id || 'anonymous';
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(updates)).digest('hex');
    let batchRequest;

    try {
      batchRequest = await TranslationBatchRequest.create({
        userId,
        idempotencyKey,
        payloadHash,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;

      const existingRequest = await TranslationBatchRequest.findOne({ userId, idempotencyKey }).lean();
      if (!existingRequest || existingRequest.payloadHash !== payloadHash) {
        return sendTranslationError(
          res,
          409,
          getRequestLanguage(req),
          'TRANSLATION_IDEMPOTENCY_KEY_CONFLICT',
          'operation_failed'
        );
      }

      if (existingRequest.status === 'completed' && existingRequest.response) {
        return res.json(existingRequest.response);
      }

      return sendTranslationError(
        res,
        409,
        getRequestLanguage(req),
        'TRANSLATION_BATCH_ALREADY_PROCESSING',
        'operation_failed'
      );
    }

    const resolvedUpdates = [];
    const auditRecords = [];
    for (const update of updates) {
      const replacementText = update.translatedText || update.newValue;
      const record = await resolveTranslationRecord(update);
      if (!record || !replacementText) {
        await batchRequest.deleteOne();
        return res.status(400).json({
          success: false,
          code: 'TRANSLATION_UPDATE_FIELDS_REQUIRED',
          message: getMessage(req.lang, 'admin-controllers-messages.each_update_must_have_hash_key'),
        });
      }

      resolvedUpdates.push({ hashKey: record.hashKey, translatedText: replacementText });
      auditRecords.push({ record, replacementText, reason: update.reason || null });
    }

    const RateLimitHandler = require('../services/rateLimitHandler');
    const result = await RateLimitHandler.batchManualOverride(resolvedUpdates);
    const userName = req.user?.name || getMessage(getDefaultLanguage().code.toUpperCase(), 'common.unknown');

    await Promise.all(auditRecords.map(({ record, replacementText, reason }) =>
      TranslationShadowWriteService.logAuditTrail({
        userId,
        userName,
        action: 'batch_update',
        oldValue: record.translatedText,
        newValue: replacementText,
        entityId: record.entityId,
        entityType: record.entityType,
        targetLang: record.targetLang,
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      })
    ));

    const response = {
      success: true,
      message: getMessage(req.lang, 'admin-controllers-messages.updated_translations_count', { count: result.modifiedCount }),
      result: {
        totalProcessed: updates.length,
        successCount: result.modifiedCount,
        failureCount: updates.length - result.modifiedCount,
        failures: [],
      },
      data: { modified_count: result.modifiedCount },
    };

    await TranslationBatchRequest.updateOne(
      { _id: batchRequest._id },
      { $set: { status: 'completed', response } }
    );

    return res.json(response);
  } catch (error) {
    console.error('[TranslationController] Error batch manual override:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

exports.importNestedJSON = async (req, res) => {
  try {
    const { code, namespace, translations: nestedTranslations } = req.body;

    if (!code || !namespace || !nestedTranslations || typeof nestedTranslations !== 'object') {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_NESTED_IMPORT_FIELDS_REQUIRED', 'nested_import_fields_required');
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
      { upsert: true, returnDocument: 'after' }
    );

    res.json({
      success: true,
      code: 'TRANSLATION_NESTED_IMPORT_COMPLETED',
      message: getMessage(getRequestLanguage(req), 'translation-messages.nested_import_completed'),
      data: {
        code: result.code,
        namespace: result.namespace,
        keysCount: Object.keys(flatTranslations).length,
        sample: Object.entries(flatTranslations).slice(0, 3),
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error importing nested JSON:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'LANGUAGE_UNSUPPORTED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.unsupported_language', { lang }),
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
          code: 'FALLBACK_TRANSLATIONS_NOT_FOUND',
          message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.fallback_translations_not_found', { lang }),
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'TRANSLATION_REQUEST_BODY_INVALID',
        message: getMessage(resolvedLang, 'admin-controllers-messages.request_body_array_required'),
      });
    }

    if (!entityType) {
      return res.status(400).json({
        success: false,
        code: 'TRANSLATION_ENTITY_TYPE_REQUIRED',
        message: getMessage(resolvedLang, 'admin-controllers-messages.entity_type_query_parameter_required'),
      });
    }

    // Check if language is supported
    const isLangSupported = await LanguageService.isSupportedLanguage(resolvedLang);
    if (!isLangSupported) {
      return res.status(400).json({
        success: false,
        code: 'TRANSLATION_LANGUAGE_UNSUPPORTED',
        message: getMessage(resolvedLang, 'admin-controllers-messages.unsupported_language', { lang: resolvedLang }),
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
            status: 'success',
            qualityStatus: 'approved',
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
          const BrandCatalogTranslationCache = require('../models/BrandCatalogTranslationCache');
          const translation = await BrandCatalogTranslationCache.findOne({
            entityId: String(entityId),
            targetLang: resolvedLang,
            status: 'success',
          }).lean();
          translatedValue = translation?.name;
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
      return sendTranslationError(res, 400, resolvedLang, 'TRANSLATION_ENTITY_ID_REQUIRED', 'entity_id_required');
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
        code: 'TRANSLATION_LANGUAGE_UNSUPPORTED',
        message: getMessage(resolvedLang, 'admin-controllers-messages.unsupported_language', { lang: resolvedLang }),
      });
    }

    // For now, return true if any translation cache entry exists
    // In future, could check for specific fields (name, description, etc.)
    const translationCaches = [
      ProductCatalogTranslationCache,
      CategoryCatalogTranslationCache,
      require('../models/BrandCatalogTranslationCache'),
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
        code: 'TRANSLATION_LANGUAGE_REQUIRED',
        message: getMessage(getRequestLanguage(req), 'admin-controllers-messages.lang_ns_required'),
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
        code: 'TRANSLATION_FALLBACK_NOT_FOUND',
        message: getMessage(resolvedLang, 'admin-controllers-messages.translations_not_found_in_fallback_chain', { ns }),
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
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
      return sendTranslationError(
        res,
        400,
        resolvedLang,
        'TRANSLATION_LANGUAGE_UNSUPPORTED',
        'target_language_unsupported',
        { language: resolvedLang }
      );
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
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};

/**
 * POST /api/translations/admin/regenerate-product-cache
 * Backfill missing ProductCatalogTranslationCache records from LiveTranslationCache
 * Used when products only show in Vietnamese (other languages missing)
 */
exports.regenerateProductCache = async (req, res) => {
  try {
    console.log('[TranslationController] Starting product cache regeneration...');

    // Check LiveTranslationCache
    const liveRecordCount = await LiveTranslationCache.countDocuments();
    console.log(`  Found ${liveRecordCount} records in LiveTranslationCache`);

    if (liveRecordCount === 0) {
      return sendTranslationError(res, 400, getRequestLanguage(req), 'TRANSLATION_CACHE_EMPTY', 'cache_regeneration_empty');
    }

    // Run a non-destructive aggregation from LiveTranslationCache.
    console.log('[TranslationController] Backfilling missing records from LiveTranslationCache...');
    const specTranslationSeeder = require('../seeds/specTranslationSeeder');
    const result = await specTranslationSeeder();

    // Verify result
    const newCacheCount = await ProductCatalogTranslationCache.countDocuments();
    console.log(`[TranslationController] ✅ Cache backfill complete: ${newCacheCount} cache entries`);

    res.json({
      success: true,
      code: 'TRANSLATION_CACHE_REGENERATED',
      message: getMessage(getRequestLanguage(req), 'translation-messages.cache_regeneration_completed'),
      stats: {
        ...result,
        cacheEntries: newCacheCount,
      },
    });
  } catch (error) {
    console.error('[TranslationController] Error regenerating product cache:', error);
    return sendTranslationError(
      res,
      500,
      getRequestLanguage(req),
      'TRANSLATION_OPERATION_FAILED',
      'operation_failed'
    );
  }
};
