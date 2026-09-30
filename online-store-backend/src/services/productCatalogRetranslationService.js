const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const libretranslateProductService = require('./libretranslateProductService');
const translationValidator = require('../utils/translationValidator');
const translationValidationConfig = require('../config/translationValidation');
const { getDefaultLanguage } = require('../config/languageInventory');
const { refreshStorefrontReadiness } = require('./translationHelper');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const { acquireProductTranslationLock } = require('../utils/productTranslationLock');
const {
  getCompletedResult,
  getProductFieldWorkKey,
  markCompletedDurably,
} = require('../utils/retranslateProgress');

const PRODUCT_ENTITY_TYPES = [
  'product_name',
  'product_description',
  'product_spec',
  'product_technical_description',
  'product_description_image_alt',
  'product_promotion',
];
const FAILED_TRANSLATION_STATUSES = LiveTranslationCache.schema.path('status').enumValues
  .filter(status => status.startsWith('failed_') || status.endsWith('_retry'));
const RETRANSLATE_QUALITY_STATUSES = LiveTranslationCache.schema.path('qualityStatus').enumValues
  .filter(status => /retranslat|reject/i.test(status));

const mapWithConcurrency = async (items, mapper, concurrency) => {
  const results = new Array(items.length);
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const settled = await Promise.allSettled(items.slice(offset, offset + concurrency).map(mapper));
    const rejected = settled.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    settled.forEach(({ value }, index) => {
      results[offset + index] = value;
    });
  }
  return results;
};

const retranslateProductUnlocked = async (
  productId,
  targetLang,
  { libreTranslateOnly = false, checkpoint = null, parallelProducts = 1 } = {},
) => {
  const configuredConcurrency = Number(process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY || 1);
  if (!Number.isInteger(configuredConcurrency) || configuredConcurrency < 1) {
    throw new Error('PRODUCT_RETRANSLATION_FIELD_CONCURRENCY must be a positive integer');
  }
  const totalConcurrency = Math.max(configuredConcurrency, parallelProducts);
  const fieldConcurrency = Math.max(1, Math.floor(totalConcurrency / parallelProducts));
  const [product, catalogTranslation] = await Promise.all([
    Product.findById(productId).lean(),
    ProductCatalogTranslationCache.findOne({ entityId: productId, targetLang }).lean(),
  ]);
  if (!product) {
    const error = new Error('Product not found');
    error.code = 'PRODUCT_NOT_FOUND';
    throw error;
  }

  const manualFields = catalogTranslation?.manualFields || [];
  const providersUsed = new Set();
  const sourceHash = getProductTranslationSourceHash(product);
  const translateSourceText = async (source, entityType, field) => {
    if (!source) return { value: source, validation: null };
    const workKey = getProductFieldWorkKey({
      productId: String(productId),
      targetLang,
      field,
      source,
    });
    const completed = getCompletedResult(checkpoint, workKey);
    if (completed?.payload) {
      (completed.payload.providersUsed || []).forEach(provider => providersUsed.add(provider));
      return { value: completed.payload.value, validation: completed.payload.validation };
    }

    const translate = libreTranslateOnly
      ? libretranslateProductService.translateWithLibreTranslateOnly
      : libretranslateProductService.translateWithFailover;
    const result = await translate(source, getDefaultLanguage().code, targetLang);
    const usedProviders = result.providersUsed || [result.provider || 'cloudflare'];
    usedProviders.forEach(provider => providersUsed.add(provider));
    const validation = await translationValidator.validateTranslation(
      source,
      result.translatedText,
      targetLang,
      entityType,
    );
    await markCompletedDurably(checkpoint, workKey, {
      fixed: validation?.qualityStatus === 'approved' && (validation.validationErrors || []).length === 0,
      validationErrors: validation?.validationErrors || [],
      payload: { value: result.translatedText, validation, providersUsed: usedProviders },
    });
    return { value: result.translatedText, validation };
  };
  const translateField = async (field, source, entityType, fieldPath = field) => (
    manualFields.includes(field)
      ? { value: catalogTranslation?.[field], validation: null }
      : translateSourceText(source, entityType, fieldPath)
  );

  const [nameResult, descResult, technicalDescriptionResult] = await mapWithConcurrency([
    ['name', product.name, 'product_name'],
    ['description', product.description, 'product_description'],
    ['technicalDescription', product.technicalDescription, 'product_technical_description'],
  ], ([field, source, entityType]) => translateField(field, source, entityType), fieldConcurrency);

  const validationResults = [
    nameResult.validation,
    descResult.validation,
    technicalDescriptionResult.validation,
  ].filter(Boolean);
  const specResults = await mapWithConcurrency(Object.entries(product.specs || {}), async ([key, value]) => {
    if (manualFields.includes('specs')) {
      return { key, value: catalogTranslation?.specs?.[key] || String(value), validation: null };
    }
    const { value: translated, validation } = await translateField('specs', String(value), 'product_spec', ['specs', key]);
    return { key, value: translated, validation };
  }, fieldConcurrency);
  const specs = Object.fromEntries(specResults.map(({ key, value, validation }) => {
    if (validation) validationResults.push(validation);
    return [key, value];
  }));

  const imageResults = manualFields.includes('descriptionImages')
    ? null
    : await mapWithConcurrency(product.descriptionImages || [], async (image, index) => {
      const { value: alt, validation } = await translateSourceText(
        image?.alt,
        'product_description_image_alt',
        ['descriptionImages', index, 'alt'],
      );
      return { image, alt: alt ?? image?.alt ?? '', validation };
    }, fieldConcurrency);
  const descriptionImages = imageResults
    ? imageResults.map(({ image, alt, validation }) => {
      if (validation) validationResults.push(validation);
      return { ...image, alt };
    })
    : catalogTranslation?.descriptionImages || product.descriptionImages || [];

  const promotionResults = manualFields.includes('promotions')
    ? null
    : await mapWithConcurrency(product.promotions || [], async (promotion, index) => {
      const translatedPromotion = { ...promotion };
      const validations = [];
      for (const field of ['title', 'giftProductName', 'scope', 'discountText']) {
        const { value, validation } = await translateSourceText(
          promotion?.[field],
          'product_promotion',
          ['promotions', index, field],
        );
        if (validation) validations.push(validation);
        if (value) translatedPromotion[field] = value;
      }
      return { translatedPromotion, validations };
    }, fieldConcurrency);
  const promotions = promotionResults
    ? promotionResults.map(({ translatedPromotion, validations }) => {
      validationResults.push(...validations);
      return translatedPromotion;
    })
    : catalogTranslation?.promotions || product.promotions || [];

  const validationErrors = [...new Set(validationResults.flatMap(({ validationErrors: errors }) => errors))];
  const qualityScore = validationResults.length
    ? Math.min(...validationResults.map(({ qualityScore: score }) => score))
    : 100;
  const hasNeeds = validationResults.some(({ qualityStatus }) => qualityStatus === 'needs_retranslate');
  const hasPending = validationResults.some(({ qualityStatus }) => qualityStatus === 'pending');
  const qualityStatus = hasNeeds ? 'needs_retranslate' : hasPending ? 'pending' : 'approved';
  const resolvedProviders = [...providersUsed].sort();
  const translation = await ProductCatalogTranslationCache.findOneAndUpdate(
    { entityId: productId, targetLang },
    {
      $set: {
        sourceHash,
        name: nameResult.value ?? product.name,
        description: descResult.value,
        brand: manualFields.includes('brand') ? catalogTranslation?.brand : product.brand,
        specs,
        technicalDescription: technicalDescriptionResult.value ?? product.technicalDescription ?? '',
        descriptionImages,
        promotions,
        status: 'success',
        provider: providersUsed.has('libretranslate') ? 'libretranslate' : 'cloudflare',
        providersUsed: resolvedProviders.length > 0 ? resolvedProviders : ['cloudflare'],
        providerSource: !libreTranslateOnly && providersUsed.has('libretranslate')
          ? 'secondary_failover'
          : 'primary',
        failoverReason: !libreTranslateOnly && providersUsed.has('libretranslate') ? 'cloudflare_overload' : null,
        qualityStatus,
        qualityScore,
        validationErrors,
        manualFields,
        lastTranslatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();

  await LiveTranslationCache.updateMany({
    entityId: String(productId),
    targetLang,
    entityType: { $in: PRODUCT_ENTITY_TYPES },
    $or: [
      { status: { $in: FAILED_TRANSLATION_STATUSES } },
      { qualityStatus: { $in: RETRANSLATE_QUALITY_STATUSES } },
      {
        qualityStatus: { $ne: 'approved' },
        $or: [
          { qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL } },
          { validationErrors: { $exists: true, $ne: [] } },
        ],
      },
    ],
  }, {
    $set: {
      qualityStatus: 'retranslated',
      reviewNotes: `Superseded by product translation ${sourceHash}`,
    },
  });

  await refreshStorefrontReadiness([productId]);
  return { translation, skippedManualFields: manualFields };
};

const retranslateProduct = async (productId, targetLang, options = {}) => {
  const releaseLock = await acquireProductTranslationLock(productId, targetLang);
  try {
    return await retranslateProductUnlocked(productId, targetLang, options);
  } finally {
    await releaseLock();
  }
};

module.exports = { retranslateProduct };
