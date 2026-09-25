const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const libretranslateProductService = require('./libretranslateProductService');
const translationValidator = require('../utils/translationValidator');
const { getDefaultLanguage } = require('../config/languageInventory');
const { refreshStorefrontReadiness } = require('./translationHelper');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');

const retranslateProduct = async (productId, targetLang, { sequential = false } = {}) => {
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
  const translateSourceText = async (source, entityType) => {
    if (!source) return { value: source, validation: null };
    const value = await libretranslateProductService.translateWithCloudflare(
      source,
      getDefaultLanguage().code,
      targetLang,
    );
    const validation = await translationValidator.validateTranslation(source, value, targetLang, entityType);
    return { value, validation };
  };
  const translateField = async (field, source, entityType) => (
    manualFields.includes(field)
      ? { value: catalogTranslation?.[field], validation: null }
      : translateSourceText(source, entityType)
  );

  let nameResult;
  let descResult;
  let technicalDescriptionResult;
  if (sequential) {
    nameResult = await translateField('name', product.name, 'product_name');
    descResult = await translateField('description', product.description, 'product_description');
    technicalDescriptionResult = await translateField(
      'technicalDescription',
      product.technicalDescription,
      'product_technical_description',
    );
  } else {
    [nameResult, descResult, technicalDescriptionResult] = await Promise.all([
      translateField('name', product.name, 'product_name'),
      translateField('description', product.description, 'product_description'),
      translateField('technicalDescription', product.technicalDescription, 'product_technical_description'),
    ]);
  }

  const validationResults = [
    nameResult.validation,
    descResult.validation,
    technicalDescriptionResult.validation,
  ].filter(Boolean);
  const specs = {};
  for (const [key, value] of Object.entries(product.specs || {})) {
    if (manualFields.includes('specs')) {
      specs[key] = catalogTranslation?.specs?.[key] || String(value);
    } else {
      const { value: translated, validation } = await translateField('specs', String(value), 'product_spec');
      specs[key] = translated;
      if (validation) validationResults.push(validation);
    }
  }

  const descriptionImages = manualFields.includes('descriptionImages')
    ? catalogTranslation?.descriptionImages || product.descriptionImages || []
    : [];
  if (!manualFields.includes('descriptionImages')) {
    for (const image of product.descriptionImages || []) {
      const { value: alt, validation } = await translateSourceText(image?.alt, 'product_description_image_alt');
      descriptionImages.push({ ...image, alt: alt ?? image?.alt ?? '' });
      if (validation) validationResults.push(validation);
    }
  }

  const promotions = manualFields.includes('promotions')
    ? catalogTranslation?.promotions || product.promotions || []
    : [];
  if (!manualFields.includes('promotions')) {
    for (const promotion of product.promotions || []) {
      const translatedPromotion = { ...promotion };
      for (const field of ['title', 'giftProductName', 'scope', 'discountText']) {
        const { value, validation } = await translateSourceText(promotion?.[field], 'product_promotion');
        if (value) translatedPromotion[field] = value;
        if (validation) validationResults.push(validation);
      }
      promotions.push(translatedPromotion);
    }
  }

  const validationErrors = [...new Set(validationResults.flatMap(({ validationErrors: errors }) => errors))];
  const qualityScore = validationResults.length
    ? Math.min(...validationResults.map(({ qualityScore: score }) => score))
    : 100;
  const hasNeeds = validationResults.some(({ qualityStatus }) => qualityStatus === 'needs_retranslate');
  const hasPending = validationResults.some(({ qualityStatus }) => qualityStatus === 'pending');
  const qualityStatus = hasNeeds ? 'needs_retranslate' : hasPending ? 'pending' : 'approved';
  const translation = await ProductCatalogTranslationCache.findOneAndUpdate(
    { entityId: productId, targetLang },
    {
      $set: {
        sourceHash: getProductTranslationSourceHash(product),
        name: nameResult.value ?? product.name,
        description: descResult.value,
        brand: product.brand,
        specs,
        technicalDescription: technicalDescriptionResult.value ?? product.technicalDescription ?? '',
        descriptionImages,
        promotions,
        status: 'success',
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
