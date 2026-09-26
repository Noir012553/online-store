const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const libretranslateProductService = require('./libretranslateProductService');
const translationValidator = require('../utils/translationValidator');
const { getDefaultLanguage } = require('../config/languageInventory');
const { refreshStorefrontReadiness } = require('./translationHelper');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');

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

const retranslateProduct = async (productId, targetLang, { libreTranslateOnly = false } = {}) => {
  const configuredConcurrency = Number(process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY || 3);
  if (!Number.isInteger(configuredConcurrency) || configuredConcurrency < 1) {
    throw new Error('PRODUCT_RETRANSLATION_FIELD_CONCURRENCY must be a positive integer');
  }
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
  const translateSourceText = async (source, entityType) => {
    if (!source) return { value: source, validation: null };
    const translate = libreTranslateOnly
      ? libretranslateProductService.translateWithLibreTranslateOnly
      : libretranslateProductService.translateWithFailover;
    const result = await translate(source, getDefaultLanguage().code, targetLang);
    (result.providersUsed || [result.provider || 'cloudflare']).forEach((provider) => providersUsed.add(provider));
    const validation = await translationValidator.validateTranslation(
      source,
      result.translatedText,
      targetLang,
      entityType,
    );
    return { value: result.translatedText, validation };
  };
  const translateField = async (field, source, entityType) => (
    manualFields.includes(field)
      ? { value: catalogTranslation?.[field], validation: null }
      : translateSourceText(source, entityType)
  );

  const [nameResult, descResult, technicalDescriptionResult] = await mapWithConcurrency([
    ['name', product.name, 'product_name'],
    ['description', product.description, 'product_description'],
    ['technicalDescription', product.technicalDescription, 'product_technical_description'],
  ], ([field, source, entityType]) => translateField(field, source, entityType), configuredConcurrency);

  const validationResults = [
    nameResult.validation,
    descResult.validation,
    technicalDescriptionResult.validation,
  ].filter(Boolean);
  const specResults = await mapWithConcurrency(Object.entries(product.specs || {}), async ([key, value]) => {
    if (manualFields.includes('specs')) {
      return { key, value: catalogTranslation?.specs?.[key] || String(value), validation: null };
    }
    const { value: translated, validation } = await translateField('specs', String(value), 'product_spec');
    return { key, value: translated, validation };
  }, configuredConcurrency);
  const specs = Object.fromEntries(specResults.map(({ key, value, validation }) => {
    if (validation) validationResults.push(validation);
    return [key, value];
  }));

  const imageResults = manualFields.includes('descriptionImages')
    ? null
    : await mapWithConcurrency(product.descriptionImages || [], async (image) => {
      const { value: alt, validation } = await translateSourceText(image?.alt, 'product_description_image_alt');
      return { image, alt: alt ?? image?.alt ?? '', validation };
    }, configuredConcurrency);
  const descriptionImages = imageResults
    ? imageResults.map(({ image, alt, validation }) => {
      if (validation) validationResults.push(validation);
      return { ...image, alt };
    })
    : catalogTranslation?.descriptionImages || product.descriptionImages || [];

  const promotionResults = manualFields.includes('promotions')
    ? null
    : await mapWithConcurrency(product.promotions || [], async (promotion) => {
      const translatedPromotion = { ...promotion };
      const validations = [];
      for (const field of ['title', 'giftProductName', 'scope', 'discountText']) {
        const { value, validation } = await translateSourceText(promotion?.[field], 'product_promotion');
        if (validation) validations.push(validation);
        if (value) translatedPromotion[field] = value;
      }
      return { translatedPromotion, validations };
    }, configuredConcurrency);
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
        sourceHash: getProductTranslationSourceHash(product),
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

  await refreshStorefrontReadiness([productId]);
  return { translation, skippedManualFields: manualFields };
};

module.exports = { retranslateProduct };
