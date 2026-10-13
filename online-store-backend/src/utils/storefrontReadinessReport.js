const { getProductTranslationSourceHash } = require('./productTranslationFingerprint');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');
const { containsNoInputTranslationResponse } = require('./translationResponseGuard');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const getId = (product) => String(product?._id ?? product?.id ?? '');
const getSpecEntries = (specs) => (
  specs instanceof Map ? [...specs.entries()] : specs && typeof specs === 'object' ? Object.entries(specs) : []
);
const hasNoValidationErrors = (translation) => (
  !Object.prototype.hasOwnProperty.call(translation, 'validationErrors')
  || (Array.isArray(translation.validationErrors) && translation.validationErrors.length === 0)
);

const getMissingProductSourceFields = (product) => ['name', 'brand']
  .filter((field) => !hasText(product?.[field]));

const getTranslationReasons = (product, translation) => {
  const reasons = [];
  if (translation.sourceHash !== getProductTranslationSourceHash(product)) reasons.push('stale_source_hash');
  if (translation.status !== 'success') reasons.push('status_not_success');
  if (translation.qualityStatus !== 'approved') reasons.push('quality_not_approved');
  if (!hasNoValidationErrors(translation)) reasons.push('validation_errors');
  if (containsNoInputTranslationResponse(translation)) reasons.push('invalid_translation_response');
  if (!hasText(translation.name) || !hasText(translation.brand)) reasons.push('missing_required_translation_fields');
  if (hasText(product.description) && !hasText(translation.description)) reasons.push('missing_description');

  const translatedSpecKeys = new Set(getSpecEntries(translation.specs)
    .filter(([, value]) => hasText(value))
    .map(([key]) => getCanonicalSpecKey(key))
    .filter(Boolean));
  const missingSpecKeys = getSpecEntries(product.specs)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key]) => getCanonicalSpecKey(key))
    .filter((key) => key && !translatedSpecKeys.has(key));

  if (missingSpecKeys.length > 0) reasons.push('missing_specs');
  return { reasons, missingSpecKeys: [...new Set(missingSpecKeys)] };
};

const analyzeStorefrontReadiness = (products, translations, requiredLanguages) => {
  const translationsByProduct = new Map();
  const translationCounts = new Map();

  translations.forEach((translation) => {
    const productId = String(translation.entityId);
    const byLanguage = translationsByProduct.get(productId) || new Map();
    const languageTranslations = byLanguage.get(translation.targetLang) || [];
    languageTranslations.push(translation);
    byLanguage.set(translation.targetLang, languageTranslations);
    translationsByProduct.set(productId, byLanguage);

    const countKey = `${translation.targetLang}\u0000${translation.status || ''}\u0000${translation.qualityStatus || ''}`;
    const count = translationCounts.get(countKey) || {
      targetLang: translation.targetLang,
      status: translation.status || null,
      qualityStatus: translation.qualityStatus || null,
      records: 0,
      productIds: new Set(),
    };
    count.records += 1;
    count.productIds.add(productId);
    translationCounts.set(countKey, count);
  });

  const reasonCounts = {};
  const productResults = products.map((product) => {
    const productId = getId(product);
    const missingSourceFields = getMissingProductSourceFields(product);
    const locales = requiredLanguages.map((targetLang) => {
      const translationsForLanguage = translationsByProduct.get(productId)?.get(targetLang) || [];
      if (translationsForLanguage.length === 0) {
        reasonCounts.missing_translation = (reasonCounts.missing_translation || 0) + 1;
        return { targetLang, reasons: ['missing_translation'], missingSpecKeys: [] };
      }

      const evaluations = translationsForLanguage.map((translation) => getTranslationReasons(product, translation));
      const validTranslation = evaluations.find(({ reasons }) => reasons.length === 0);
      if (validTranslation) return { targetLang, reasons: [], missingSpecKeys: [] };

      const reasons = [...new Set(evaluations.flatMap(({ reasons }) => reasons))];
      const missingSpecKeys = [...new Set(evaluations.flatMap(({ missingSpecKeys: keys }) => keys))];
      reasons.forEach((reason) => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
      return { targetLang, reasons, missingSpecKeys };
    });

    if (missingSourceFields.length > 0) {
      reasonCounts.source_missing_required_fields = (reasonCounts.source_missing_required_fields || 0) + 1;
    }

    const ready = missingSourceFields.length === 0 && locales.every(({ reasons }) => reasons.length === 0);
    return {
      productId,
      ready,
      missingSourceFields,
      locales: locales.filter(({ reasons }) => reasons.length > 0),
    };
  });

  const storedReadyCount = products.filter((product) => product.storefrontReady === true).length;
  const computedReadyCount = productResults.filter((product) => product.ready).length;
  const uncheckedCount = products.filter((product) => !product.storefrontReadinessCheckedAt).length;

  return {
    productCount: products.length,
    readyCount: computedReadyCount,
    notReadyCount: products.length - computedReadyCount,
    storedReadyCount,
    uncheckedCount,
    readinessMismatchCount: productResults.filter((result, index) => (
      result.ready !== (products[index].storefrontReady === true)
    )).length,
    requiredLanguages,
    reasonCounts,
    translationCounts: [...translationCounts.values()]
      .map(({ productIds, ...count }) => ({ ...count, uniqueProducts: productIds.size }))
      .sort((a, b) => a.targetLang.localeCompare(b.targetLang)
        || String(a.status).localeCompare(String(b.status))
        || String(a.qualityStatus).localeCompare(String(b.qualityStatus))),
    products: productResults,
  };
};

module.exports = { analyzeStorefrontReadiness };
