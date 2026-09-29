const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const translationValidationConfig = require('../config/translationValidation');

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
const CATALOG_RETRYABLE_STATUSES = ProductCatalogTranslationCache.schema.path('status').enumValues
  .filter(status => status.startsWith('failed_') || status.endsWith('_retry'));
const LIVE_RETRANSLATE_QUALITY_STATUSES = LiveTranslationCache.schema.path('qualityStatus').enumValues
  .filter(status => /retranslat|reject/i.test(status));
const CATALOG_RETRANSLATE_QUALITY_STATUSES = ProductCatalogTranslationCache.schema.path('qualityStatus').enumValues
  .filter(status => /retranslat|reject/i.test(status));

const getQualityConditions = qualityStatuses => [
  { qualityStatus: { $in: qualityStatuses } },
  {
    qualityStatus: { $ne: 'approved' },
    $or: [
      { qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL } },
      { validationErrors: { $exists: true, $ne: [] } },
    ],
  },
];

const buildLiveProductRetranslationQuery = (filter = {}) => ({
  ...filter,
  provider: { $in: LiveTranslationCache.schema.path('provider').enumValues },
  status: { $in: [...LiveTranslationCache.schema.path('status').enumValues, 'fallback_libretranslate'] },
  qualityStatus: { $ne: 'retranslated' },
  $or: [
    { status: { $in: FAILED_TRANSLATION_STATUSES } },
    ...getQualityConditions(LIVE_RETRANSLATE_QUALITY_STATUSES),
  ],
});

const buildCatalogProductRetranslationQuery = (filter = {}) => ({
  ...filter,
  $or: [
    { status: { $in: CATALOG_RETRYABLE_STATUSES } },
    ...getQualityConditions(CATALOG_RETRANSLATE_QUALITY_STATUSES),
  ],
});

const hasValidationErrors = translation => translation?.validationErrors !== undefined
  && !(Array.isArray(translation.validationErrors) && translation.validationErrors.length === 0);

const isProductRetranslatable = (translation, retryableStatuses, qualityStatuses) => (
  retryableStatuses.includes(translation?.status)
  || qualityStatuses.includes(translation?.qualityStatus)
  || (
    translation?.qualityStatus !== 'approved'
    && (
      (typeof translation?.qualityScore === 'number'
        && translation.qualityScore < translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL)
      || hasValidationErrors(translation)
    )
  )
);

const isLiveProductRetranslatable = (translation) => (
  LiveTranslationCache.schema.path('provider').enumValues.includes(translation?.provider)
  && [
    ...LiveTranslationCache.schema.path('status').enumValues,
    'fallback_libretranslate',
  ].includes(translation?.status)
  && translation?.qualityStatus !== 'retranslated'
  && isProductRetranslatable(
    translation,
    FAILED_TRANSLATION_STATUSES,
    LIVE_RETRANSLATE_QUALITY_STATUSES,
  )
);

const isCatalogProductRetranslatable = translation => isProductRetranslatable(
  translation,
  CATALOG_RETRYABLE_STATUSES,
  CATALOG_RETRANSLATE_QUALITY_STATUSES,
);

module.exports = {
  PRODUCT_ENTITY_TYPES,
  buildCatalogProductRetranslationQuery,
  buildLiveProductRetranslationQuery,
  isCatalogProductRetranslatable,
  isLiveProductRetranslatable,
};
