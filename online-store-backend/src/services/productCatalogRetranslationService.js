const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const productTranslationService = require('./productTranslationService');
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
const isApproved = validation => (
  validation?.qualityStatus === 'approved'
  && (validation.validationErrors || []).length === 0
);

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
  { checkpoint = null, parallelProducts = 1 } = {},
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
  const sourceHash = getProductTranslationSourceHash(product);
  const catalogWorkKey = `catalog:${targetLang}:${productId}:${sourceHash}`;
  const sourceHashMatches = catalogTranslation?.sourceHash === sourceHash;
  let providerUsed = false;
  let allFieldsVerified = true;
  const translateSourceText = async (source, entityType, field, currentValue, manual = false) => {
    const sourceText = source == null ? '' : String(source);
    const existingValue = currentValue ?? sourceText;
    if (!sourceText.trim()) {
      return { value: manual ? existingValue : sourceText, validation: null };
    }

    if (manual) return { value: existingValue, validation: null };

    let currentValidation = null;
    if (sourceHashMatches && typeof currentValue === 'string' && currentValue.trim()) {
      currentValidation = await translationValidator.validateTranslation(
        sourceText,
        currentValue,
        targetLang,
        entityType,
      );
      if (isApproved(currentValidation)) {
        return { value: currentValue, validation: currentValidation };
      }
    }

    const workKey = getProductFieldWorkKey({
      productId: String(productId),
      targetLang,
      field,
      source: sourceText,
    });
    const completed = getCompletedResult(checkpoint, workKey);
    if (completed?.payload && isApproved(completed.payload.validation)) {
      providerUsed = true;
      return { value: completed.payload.value, validation: completed.payload.validation };
    }
    const useApprovedCanonical = async validation => {
      if (!validation?.validationErrors?.includes('inconsistent')) return null;
      const canonical = await LiveTranslationCache.findOne({
        originalText: sourceText,
        targetLang,
        entityType,
        status: 'success',
        provider: 'cloudflare',
        qualityStatus: 'approved',
        version: 1,
      }).select('translatedText').lean();
      if (!canonical?.translatedText) return null;
      const canonicalValidation = await translationValidator.validateTranslation(
        sourceText,
        canonical.translatedText,
        targetLang,
        entityType,
      );
      if (!isApproved(canonicalValidation)) return null;
      providerUsed = true;
      await markCompletedDurably(checkpoint, workKey, {
        fixed: true,
        validationErrors: [],
        payload: {
          value: canonical.translatedText,
          validation: canonicalValidation,
          providersUsed: ['cloudflare'],
          catalogWorkKey,
        },
      }, true);
      return { value: canonical.translatedText, validation: canonicalValidation };
    };
    const currentCanonical = await useApprovedCanonical(currentValidation);
    if (currentCanonical) return currentCanonical;

    const result = await productTranslationService.translateWithCloudflare(
      sourceText,
      getDefaultLanguage().code,
      targetLang,
    );
    providerUsed = true;
    const validation = await translationValidator.validateTranslation(
      sourceText,
      result.translatedText,
      targetLang,
      entityType,
    );
    if (!isApproved(validation)) {
      const canonical = await useApprovedCanonical(validation);
      if (canonical) return canonical;
    }
    const accepted = isApproved(validation);
    if (!accepted) allFieldsVerified = false;
    await markCompletedDurably(checkpoint, workKey, {
      fixed: accepted,
      validationErrors: validation.validationErrors || [],
      payload: {
        value: result.translatedText,
        validation,
        providersUsed: result.providersUsed || ['cloudflare'],
        catalogWorkKey,
      },
    }, true);
    return {
      value: accepted ? result.translatedText : existingValue,
      validation,
    };
  };
  const translateField = (
    field,
    source,
    entityType,
    fieldPath = field,
    currentValue = catalogTranslation?.[field],
  ) => translateSourceText(
    source,
    entityType,
    fieldPath,
    currentValue,
    manualFields.includes(field),
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
    const { value: translated, validation } = await translateField(
      'specs',
      String(value),
      'product_spec',
      ['specs', key],
      catalogTranslation?.specs?.[key],
    );
    return { key, value: translated, validation };
  }, fieldConcurrency);
  const translatedSpecs = Object.fromEntries(specResults.map(({ key, value, validation }) => {
    if (validation) validationResults.push(validation);
    return [key, value];
  }));
  const specs = manualFields.includes('specs')
    ? { ...(catalogTranslation?.specs || {}), ...translatedSpecs }
    : translatedSpecs;

  const imageResults = manualFields.includes('descriptionImages')
    ? null
    : await mapWithConcurrency(product.descriptionImages || [], async (image, index) => {
      const { value: alt, validation } = await translateSourceText(
        image?.alt,
        'product_description_image_alt',
        ['descriptionImages', index, 'alt'],
        catalogTranslation?.descriptionImages?.[index]?.alt,
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
          catalogTranslation?.promotions?.[index]?.[field],
        );
        if (validation) validations.push(validation);
        if (value !== undefined) translatedPromotion[field] = value;
      }
      return { translatedPromotion, validations };
    }, fieldConcurrency);
  const promotions = promotionResults
    ? promotionResults.map(({ translatedPromotion, validations }) => {
      validationResults.push(...validations);
      return translatedPromotion;
    })
    : catalogTranslation?.promotions || product.promotions || [];

  const qualityScore = validationResults.length
    ? Math.min(...validationResults.map(({ qualityScore: score }) => score))
    : catalogTranslation?.qualityScore ?? null;
  const hasNeeds = validationResults.some(({ qualityStatus }) => qualityStatus === 'needs_retranslate');
  const hasPending = validationResults.some(validation => (
    validation.qualityStatus === 'pending'
    || (validation.qualityStatus !== 'needs_retranslate' && !isApproved(validation))
  ));
  const qualityStatus = hasNeeds
    ? 'needs_retranslate'
    : hasPending
      ? 'pending'
      : validationResults.length > 0
        ? 'approved'
        : catalogTranslation?.qualityStatus || 'pending';
  const validationErrors = validationResults.length > 0
    ? [...new Set(validationResults.flatMap(({ validationErrors: errors }) => errors))]
    : catalogTranslation?.validationErrors || [];
  const catalogUpdate = {
    sourceHash,
    name: nameResult.value ?? product.name,
    description: descResult.value,
    brand: catalogTranslation?.brand ?? product.brand,
    specs,
    technicalDescription: technicalDescriptionResult.value ?? product.technicalDescription ?? '',
    descriptionImages,
    promotions,
    status: 'success',
    qualityStatus,
    qualityScore,
    validationErrors,
    manualFields,
  };
  if (providerUsed) {
    Object.assign(catalogUpdate, {
      provider: 'cloudflare',
      providersUsed: ['cloudflare'],
      providerSource: 'primary',
      failoverReason: null,
      lastTranslatedAt: new Date(),
    });
  }
  const candidateApproved = allFieldsVerified
    && qualityStatus === 'approved'
    && validationErrors.length === 0;
  if (!candidateApproved) {
    return {
      translation: catalogTranslation,
      candidate: catalogUpdate,
      committed: false,
      skippedManualFields: manualFields,
    };
  }

  const translation = await ProductCatalogTranslationCache.findOneAndUpdate(
    { entityId: productId, targetLang },
    { $set: catalogUpdate },
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
  return {
    translation,
    candidate: translation,
    committed: true,
    skippedManualFields: manualFields,
  };
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
