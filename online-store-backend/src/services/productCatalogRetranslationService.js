const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const productTranslationService = require('./productTranslationService');
const translationValidator = require('../utils/translationValidator');
const translationValidationConfig = require('../config/translationValidation');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getCanonicalSpecKey } = require('./specKeyTranslationService');
const { refreshTranslationReadiness } = require('./translationHelper');
const {
  getProductTranslationFieldHash,
  getProductTranslationFieldHashes,
  getProductTranslationFieldKey,
  getProductTranslationSourceHash,
} = require('../utils/productTranslationFingerprint');
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
  let nextIndex = 0;
  let hasError = false;
  let firstError;
  const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (nextIndex < items.length && !hasError) {
      const index = nextIndex++;
      try {
        results[index] = await mapper(items[index], index, items);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
  });
  await Promise.all(workers);
  if (hasError) throw firstError;
  return results;
};

const retranslateProductUnlocked = async (
  productId,
  targetLang,
  { checkpoint = null, parallelProducts = 1, retryMixedLanguage = true, force = false } = {},
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

  const liveFieldTranslations = await LiveTranslationCache.find({
    entityId: String(productId),
    targetLang,
    status: 'success',
    qualityStatus: 'approved',
    $or: [
      { validationErrors: { $exists: false } },
      { validationErrors: { $size: 0 } },
    ],
  }).select('originalText translatedText entityType specKey fieldKey').lean();
  const manualFields = catalogTranslation?.manualFields || [];
  const sourceHash = getProductTranslationSourceHash(product);
  const fieldSourceHashes = getProductTranslationFieldHashes(product);
  const catalogWorkKey = `catalog:${targetLang}:${productId}:${sourceHash}`;
  let providerUsed = false;
  let allFieldsVerified = true;
  const getLiveFieldValue = (sourceText, entityType, field) => {
    const fieldPath = Array.isArray(field) ? field.join('.') : field;
    const specKey = Array.isArray(field) && field[0] === 'specs' ? field[1] : null;
    return liveFieldTranslations.find(translation => (
      translation.entityType === entityType
      && translation.originalText === sourceText
      && (entityType !== 'product_spec'
        || getCanonicalSpecKey(translation.specKey) === getCanonicalSpecKey(specKey))
      && (!['product_description_image_alt', 'product_promotion'].includes(entityType)
        || translation.fieldKey === fieldPath)
    ))?.translatedText;
  };
  const translateSourceText = async (source, entityType, field, currentValue, manual = false, optional = false) => {
    const sourceText = source == null
      || (entityType === 'product_description_image_alt' && String(source).trim() === '0')
      ? ''
      : String(source);
    const fieldPath = Array.isArray(field) ? field : [field];
    const fieldKey = getProductTranslationFieldKey(fieldPath);
    const storedFieldHash = catalogTranslation?.fieldSourceHashes?.[fieldKey];
    const currentFieldHash = getProductTranslationFieldHash(fieldPath, sourceText);
    const catalogValueMatchesSource = !storedFieldHash || storedFieldHash === currentFieldHash;
    const catalogValue = catalogValueMatchesSource ? currentValue : null;
    const resolvedCurrentValue = typeof catalogValue === 'string' && catalogValue.trim()
      ? catalogValue
      : getLiveFieldValue(sourceText, entityType, fieldPath);
    const existingValue = resolvedCurrentValue ?? sourceText;
    if (!sourceText.trim()) {
      return { value: manual ? existingValue : sourceText, validation: null };
    }

    if (manual) return { value: existingValue, validation: null };

    let currentValidation = null;
    if (typeof resolvedCurrentValue === 'string' && resolvedCurrentValue.trim()) {
      currentValidation = await translationValidator.validateTranslation(
        sourceText,
        resolvedCurrentValue,
        targetLang,
        entityType,
      );
      if (!force && isApproved(currentValidation)) {
        return { value: resolvedCurrentValue, validation: currentValidation };
      }
    }

    const workKey = getProductFieldWorkKey({
      productId: String(productId),
      targetLang,
      field,
      source: sourceText,
    });
    const completed = force ? null : getCompletedResult(checkpoint, workKey);
    let checkpointValidation = null;
    if (completed?.payload) {
      checkpointValidation = await translationValidator.validateTranslation(
        sourceText,
        completed.payload.value,
        targetLang,
        entityType,
      );
      if (isApproved(checkpointValidation)) {
        providerUsed = true;
        await markCompletedDurably(checkpoint, workKey, {
          fixed: true,
          validationErrors: [],
          payload: {
            ...completed.payload,
            validation: checkpointValidation,
            catalogWorkKey,
          },
        }, true);
        return { value: completed.payload.value, validation: checkpointValidation };
      }
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
    const currentCanonical = force ? null : await useApprovedCanonical(checkpointValidation || currentValidation);
    if (currentCanonical) return currentCanonical;

    const checkpointErrors = checkpointValidation?.validationErrors || [];
    const retryableCheckpointCandidate = Boolean(completed?.payload && checkpointErrors.some(error => (
      ['missing_technical_token', 'unexpected_technical_token', 'truncated', 'extra_commentary'].includes(error)
      || (retryMixedLanguage && error === 'mixed_language')
    )));
    let result = retryableCheckpointCandidate
      ? {
        translatedText: completed.payload.value,
        providersUsed: completed.payload.providersUsed || ['cloudflare'],
      }
      : await productTranslationService.translateWithCloudflare(
        sourceText,
        getDefaultLanguage().code,
        targetLang,
      );
    providerUsed = true;
    let validation = retryableCheckpointCandidate
      ? checkpointValidation
      : await translationValidator.validateTranslation(
        sourceText,
        result.translatedText,
        targetLang,
        entityType,
      );
    const validationErrors = validation.validationErrors || [];
    const hasTechnicalTokenError = validationErrors.some(error => (
      error === 'missing_technical_token' || error === 'unexpected_technical_token'
    ));
    const hasTruncationError = validationErrors.includes('truncated');
    const hasExtraCommentaryError = validationErrors.includes('extra_commentary');
    const hasMixedLanguageError = retryMixedLanguage && validationErrors.includes('mixed_language');
    if (hasTechnicalTokenError || hasTruncationError || hasExtraCommentaryError || hasMixedLanguageError) {
      const technicalTokenIssue = hasTechnicalTokenError
        ? translationValidator.checkTechnicalTokens(sourceText, result.translatedText)
        : null;
      const tokenInstruction = technicalTokenIssue?.error === 'missing_technical_token'
        ? `Include the missing source token exactly as written: ${JSON.stringify(technicalTokenIssue.token)}.`
        : technicalTokenIssue?.error === 'unexpected_technical_token'
          ? `Remove the unsupported token ${JSON.stringify(technicalTokenIssue.token)}; do not add specifications absent from the source.`
          : '';
      const mixedLanguageIssue = hasMixedLanguageError
        ? translationValidator.checkSourceLanguageLeak(sourceText, result.translatedText, targetLang, entityType)
        : null;
      const mixedLanguageInstruction = mixedLanguageIssue?.phrase
        ? `Translate this remaining source-language phrase into ${targetLang}: ${JSON.stringify(mixedLanguageIssue.phrase)}. Do not copy it unchanged.`
        : '';
      const retryInstructions = [
        'Translate the entire source through its final sentence. Return only the translation; do not add notes, explanations, apologies, or comments.',
        hasTechnicalTokenError
          ? 'Preserve every technical token, model, number, and unit from the source with the same count. Do not omit or change storage types such as SSD or NVMe, or their capacity. Keep a space between ordinary words and nearby units; never join them (write "the 144Hz", not "the144Hz"). Do not infer or add values.'
          : '',
        tokenInstruction,
        hasExtraCommentaryError
          ? 'Translate all source content, including short interjections. Do not explain, classify, or comment on any word in the source.'
          : '',
        hasMixedLanguageError
          ? `Translate any remaining Vietnamese prose into ${targetLang}. Keep brands, proper names, models, SKUs, and technical tokens unchanged.`
          : '',
        mixedLanguageInstruction,
      ].filter(Boolean).join(' ');
      result = await productTranslationService.translateWithCloudflare(
        sourceText,
        getDefaultLanguage().code,
        targetLang,
        retryInstructions,
      );
      validation = await translationValidator.validateTranslation(
        sourceText,
        result.translatedText,
        targetLang,
        entityType,
      );
    }
    if (!isApproved(validation)) {
      const canonical = await useApprovedCanonical(validation);
      if (canonical) return canonical;
    }
    const accepted = isApproved(validation);
    if (!accepted && !optional) allFieldsVerified = false;
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
  const optionalFieldWarnings = [];
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
      const manualImageAlt = manualFields.includes('descriptionImages');
      const { value: alt, validation } = await translateSourceText(
        image?.alt,
        'product_description_image_alt',
        ['descriptionImages', index, 'alt'],
        catalogTranslation?.descriptionImages?.[index]?.alt,
        manualImageAlt,
        true,
      );
      const optionalValidation = validation || (manualImageAlt
        && typeof image?.alt === 'string'
        && image.alt.trim()
        ? await translationValidator.validateTranslation(
          image.alt,
          alt ?? image.alt,
          targetLang,
          'product_description_image_alt',
        )
        : null);
      return { image, alt: alt ?? image?.alt ?? '', validation: optionalValidation, index };
    }, fieldConcurrency);
  const descriptionImages = imageResults
    ? imageResults.map(({ image, alt, validation, index }) => {
      if (validation?.validationErrors?.length) {
        optionalFieldWarnings.push({
          fieldKey: `descriptionImages.${index}.alt`,
          validationErrors: validation.validationErrors,
        });
      }
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
        if (promotion?.[field] !== undefined) translatedPromotion[field] = value;
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
    fieldSourceHashes,
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
    optionalFieldWarnings,
    manualFields,
  };
  if (providerUsed) {
    Object.assign(catalogUpdate, {
      provider: 'cloudflare',
      providersUsed: ['cloudflare'],
      providerSource: 'primary',
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

  const latestProduct = await Product.findById(productId).lean();
  if (!latestProduct || getProductTranslationSourceHash(latestProduct) !== sourceHash) {
    return {
      translation: catalogTranslation,
      candidate: catalogUpdate,
      committed: false,
      staleSourceHash: true,
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

  await refreshTranslationReadiness([productId]);
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
