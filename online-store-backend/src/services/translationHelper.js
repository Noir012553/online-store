/**
 * Translation Helper - Single Source of Truth (SSOT)
 * 
 * 🎯 Mục đích: Overlay translation từ cache table lên original data
 * Áp dụng QUY TẮC #2 (Dynamic Data) - Dữ liệu từ DB phải được dịch trước khi return Client
 * 
 * ✅ Cách dùng:
 * 1. Batch overlay: overlayTranslationBatch(entities, 'product', lang)
 * 2. Single overlay: overlayTranslation(entity, 'brand', lang)
 * 3. Advanced: applyTranslationCache({ data, type, lang, cacheFields })
 */

const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const BrandCatalogTranslationCache = require('../models/BrandCatalogTranslationCache');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const CouponTranslationCache = require('../models/CouponTranslationCache');
const OrderTranslationCache = require('../models/OrderTranslationCache');
const BannerTranslationCache = require('../models/BannerTranslationCache');
const TestimonialTranslationCache = require('../models/TestimonialTranslationCache');
const { getActiveLangCodes } = require('../config/languageInventory');

/**
 * Map entity type → Cache model (8+ entity types supported)
 */
const CACHE_MODELS = {
  product: ProductCatalogTranslationCache,
  brand: BrandCatalogTranslationCache,
  userContent: UserContentTranslationCache,
  coupon: CouponTranslationCache,
  order: OrderTranslationCache,
  banner: BannerTranslationCache,
  testimonial: TestimonialTranslationCache,
};

/**
 * Map entity type → Translatable fields
 */
const TRANSLATABLE_FIELDS = {
  product: ['name', 'description', 'brand', 'specs', 'features'],
  brand: ['name', 'description'],
  userContent: ['title', 'content'],
  coupon: ['name', 'description', 'codeDescription', 'termsAndConditions'],
  order: ['customerNotes', 'shippingNotes', 'adminNotes', 'statusMessage'],
  banner: ['title', 'description', 'ctaText', 'altText'],
  testimonial: ['content', 'authorName', 'authorTitle', 'authorCompany'],
};

/**
 * Overlay translation cho single entity
 * @param {Object} entity - Original entity từ DB
 * @param {String} entityType - 'product' | 'brand' | 'userContent'
 * @param {String} targetLang - Target language (ví dụ 'en', 'fr')
 * @param {Object} translation - Translation cache object từ DB
 * @returns {Object} Entity với translation overlay
 */
function applyTranslationOverlay(entity, entityType, translation) {
  // If no translation found, return entity as-is
  if (!translation) return entity;
  if (!entity) return entity;

  const result = { ...entity };
  const translatableFields = TRANSLATABLE_FIELDS[entityType] || [];

  translatableFields.forEach(field => {
    if (field in translation && translation[field]) {
      // Xử lý Map fields (ví dụ specs)
      if (field === 'specs' && translation[field] instanceof Map) {
        result[field] = new Map(translation[field]);
      } else {
        result[field] = translation[field];
      }
    }
  });

  return result;
}

/**
 * Overlay nested brand translations in a product while preserving its category master data.
 * @param {Object} product - Product object (có thể chứa nested category/brand)
 * @param {String} targetLang - Target language
 * @param {Object} brandTranslationMap - Pre-fetched brand translations
 * @returns {Object} Product with translated brand name
 */
function applyNestedTranslations(product, targetLang, brandTranslationMap = {}) {
  if (!product) return product;

  const result = { ...product };

  // Translate nested brand if exists (though usually brand is a string)
  if (result.brand && typeof result.brand === 'object' && result.brand._id) {
    const brandId = result.brand._id?.toString() || result.brand.id;

    if (brandTranslationMap[brandId]) {
      result.brand = {
        ...result.brand,
        name: brandTranslationMap[brandId].name || result.brand.name,
      };
    }
    // If still no translation, keep the original brand.name (usually Vietnamese)
  }

  return result;
}

/**
 * Overlay translation cho array entities (BATCH MODE)
 * @param {Array} entities - Array of entities
 * @param {String} entityType - 'product' | 'brand' | 'userContent'
 * @param {String} targetLang - Target language
 * @returns {Promise<Array>} Entities with translation overlay
 */
async function overlayTranslationBatch(entities, entityType, targetLang) {
  if (!entities || entities.length === 0) {
    return entities;
  }

  const CacheModel = CACHE_MODELS[entityType];
  if (!CacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return entities;
  }

  try {
    // Query tất cả translation cache cho batch này
    const entityIds = entities.map(e => e._id?.toString() || e.id);
    const translations = await CacheModel.find({
      entityId: { $in: entityIds },
      targetLang,
      status: 'success',
      ...(entityType === 'product' ? { qualityStatus: { $nin: ['needs_retranslate', 'rejected'] } } : {}),
    }).lean();

    // Debug logging
    if (entityType === 'product') {
      console.log(`[translationHelper] Query ${entityType} cache for lang=${targetLang}: found ${translations.length} of ${entityIds.length} entities`);
    }

    // Map translations by entityId để quick lookup
    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId] = t;
    });

    // For products: pre-fetch nested brand translations.
    let brandTranslationMap = {};

    if (entityType === 'product') {
      // Collect all nested brand IDs
      const brandIds = entities
        .filter(e => e.brand && typeof e.brand === 'object' && e.brand._id)
        .map(e => e.brand._id?.toString() || e.brand.id);

      if (brandIds.length > 0) {
        const brandTranslations = await BrandCatalogTranslationCache.find({
          entityId: { $in: brandIds },
          targetLang,
          status: 'success',
        }).lean();

        brandTranslations.forEach(t => {
          brandTranslationMap[t.entityId] = t;
        });
      }
    }

    // Overlay translation lên mỗi entity
    const result = entities.map((entity, idx) => {
      const entityId = entity._id?.toString() || entity.id;
      const translation = translationMap[entityId];
      let overlayed = applyTranslationOverlay(entity, entityType, translation);

      // Apply nested translations for products
      if (entityType === 'product') {
        overlayed = applyNestedTranslations(overlayed, targetLang, brandTranslationMap);
      }

      // Debug: Log first entity to see structure
      if (idx === 0 && entityType === 'product') {
        console.log(`[translationHelper][${entityType}][${targetLang}] First entity keys:`, Object.keys(overlayed));
      }

      return overlayed;
    });

    return result;
  } catch (error) {
    console.error(`[translationHelper] Error overlaying ${entityType} translations:`, error);
    // Fallback: trả về original entities nếu lỗi
    return entities;
  }
}

/**
 * Overlay translation cho single entity
 * @param {Object} entity - Single entity
 * @param {String} entityType - 'product' | 'brand' | 'userContent'
 * @param {String} targetLang - Target language
 * @returns {Promise<Object>} Entity with translation overlay
 */
async function overlayTranslation(entity, entityType, targetLang) {
  if (!entity) {
    return entity;
  }

  const CacheModel = CACHE_MODELS[entityType];
  if (!CacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return entity;
  }

  try {
    const entityId = entity._id?.toString() || entity.id;
    const translation = await CacheModel.findOne({
      entityId,
      targetLang,
      status: 'success',
      ...(entityType === 'product' ? { qualityStatus: { $nin: ['needs_retranslate', 'rejected'] } } : {}),
    }).lean();

    let overlayed = applyTranslationOverlay(entity, entityType, translation);

    // Apply nested translations for products
    if (entityType === 'product') {
      let brandTranslationMap = {};

      // Fetch nested brand translation if exists
      if (overlayed.brand && typeof overlayed.brand === 'object' && overlayed.brand._id) {
        const brandId = overlayed.brand._id?.toString() || overlayed.brand.id;
        const brandTranslation = await BrandCatalogTranslationCache.findOne({
          entityId: brandId,
          targetLang,
          status: 'success',
        }).lean();
        if (brandTranslation) {
          brandTranslationMap[brandId] = brandTranslation;
        }
      }

      overlayed = applyNestedTranslations(overlayed, targetLang, brandTranslationMap);
    }

    return overlayed;
  } catch (error) {
    console.error(`[translationHelper] Error overlaying ${entityType} translation:`, error);
    return entity;
  }
}

/**
 * Overlay translation cho single entity với fallback chain
 * @param {Object} entity - Single entity
 * @param {String} entityType - 'product' | 'brand' | 'userContent'
 * @param {String} targetLang - Target language
 * @returns {Promise<Object>} Entity with translation overlay (fallback applied)
 */
async function overlayTranslationWithFallback(entity, entityType, targetLang) {
  if (!entity) {
    return entity;
  }

  const CacheModel = CACHE_MODELS[entityType];
  if (!CacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return entity;
  }

  try {
    const entityId = entity._id?.toString() || entity.id;

    // No fallback chain - only request exact language
    let translation = await CacheModel.findOne({
      entityId,
      targetLang,
      status: 'success',
      ...(entityType === 'product' ? { qualityStatus: { $nin: ['needs_retranslate', 'rejected'] } } : {}),
    }).lean();

    let overlayed = applyTranslationOverlay(entity, entityType, translation);

    // Apply nested translations for products
    if (entityType === 'product') {
      let brandTranslationMap = {};

      // Fetch nested brand translation if exists
      if (overlayed.brand && typeof overlayed.brand === 'object' && overlayed.brand._id) {
        const brandId = overlayed.brand._id?.toString() || overlayed.brand.id;

        // Only request exact language for brand
        const brandTranslation = await BrandCatalogTranslationCache.findOne({
          entityId: brandId,
          targetLang,
          status: 'success',
        }).lean();

        if (brandTranslation) {
          brandTranslationMap[brandId] = brandTranslation;
        }
      }

      overlayed = applyNestedTranslations(overlayed, targetLang, brandTranslationMap);
    }

    return overlayed;
  } catch (error) {
    console.error(`[translationHelper] Error overlaying ${entityType} translation with fallback:`, error);
    return entity;
  }
}

/**
 * Advanced: Apply translation cache với custom field mapping
 * @param {Object} config
 * @returns {Promise<Object>}
 */
async function applyTranslationCache(config) {
  const { data, type, lang, cacheFields = {} } = config;

  if (!data) return data;

  const CacheModel = CACHE_MODELS[type];
  if (!CacheModel) return data;

  try {
    const ids = Array.isArray(data) ? data.map(d => d._id || d.id) : [data._id || data.id];
    const isBatch = Array.isArray(data);

    const translations = await CacheModel.find({
      entityId: { $in: ids },
      targetLang: lang,
      status: 'success',
      ...(type === 'product' ? { qualityStatus: { $nin: ['needs_retranslate', 'rejected'] } } : {}),
    }).lean();

    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId] = t;
    });

    const mapTranslation = (entity) => {
      const entityId = entity._id?.toString() || entity.id;
      const translation = translationMap[entityId];

      if (!translation) return entity;

      const result = { ...entity };
      Object.entries(cacheFields).forEach(([originalField, translationField]) => {
        if (translation[translationField]) {
          result[originalField] = translation[translationField];
        }
      });

      return result;
    };

    return isBatch ? data.map(mapTranslation) : mapTranslation(data);
  } catch (error) {
    console.error(`[translationHelper] Error in applyTranslationCache:`, error);
    return data;
  }
}

/**
 * Batch helper: Popular use case (product list)
 * @param {Array} products - Products from DB
 * @param {String} lang - Target language
 * @returns {Promise<Array>}
 */
async function overlayProductTranslations(products, lang) {
  return overlayTranslationBatch(products, 'product', lang);
}

/**
 * Batch helper: Brand list
 */
async function overlayBrandTranslations(brands, lang) {
  return overlayTranslationBatch(brands, 'brand', lang);
}

/**
 * Batch helper: User Content (orders, banners, etc)
 */
async function overlayUserContentTranslations(items, lang) {
  return overlayTranslationBatch(items, 'userContent', lang);
}

/**
 * Batch helpers for new entity types
 */
async function overlayCouponTranslations(coupons, lang) {
  return overlayTranslationBatch(coupons, 'coupon', lang);
}

async function overlayOrderTranslations(orders, lang) {
  return overlayTranslationBatch(orders, 'order', lang);
}

async function overlayBannerTranslations(banners, lang) {
  return overlayTranslationBatch(banners, 'banner', lang);
}

async function overlayTestimonialTranslations(testimonials, lang) {
  return overlayTranslationBatch(testimonials, 'testimonial', lang);
}

/**
 * Fallback chain: [requestedLang, ...otherLanguages]
 * Dynamic fallback supporting all 9 languages: VI, EN, PT, FR, DE, IT, ES, NL, SV
 * Returns translation from first available language in chain
 * @param {String} entityId - Entity ID
 * @param {String} entityType - Entity type
 * @param {String} requestedLang - Requested language
 * @returns {Promise<Object>} Translation object or null
 */
async function getTranslationWithFallback(entityId, entityType, requestedLang) {
  if (!entityId || !entityType) {
    return null;
  }

  const CacheModel = CACHE_MODELS[entityType];
  if (!CacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return null;
  }

  // No fallback chain - only request exact language
  try {
    const translation = await CacheModel.findOne({
      entityId: String(entityId),
      targetLang: requestedLang,
      status: 'success',
    }).lean();

    if (translation) {
      return {
        ...translation,
        appliedLang: requestedLang,
        fallbackUsed: false,
      };
    }

    // No translation found for requested language
    return null;
  } catch (error) {
    console.error(`[translationHelper] Error fetching translation with fallback:`, error);
    return null;
  }
}

/**
 * Overlay with fallback chain support
 * @param {Array} entities - Entities to overlay
 * @param {String} entityType - Entity type
 * @param {String} targetLang - Target language
 * @returns {Promise<Array>} Entities with translations (fallback applied)
 */
async function overlayTranslationBatchWithFallback(entities, entityType, targetLang) {
  if (!entities || entities.length === 0) {
    return entities;
  }

  const CacheModel = CACHE_MODELS[entityType];
  if (!CacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return entities;
  }

  try {
    const entityIds = entities.map(e => e._id?.toString() || e.id);

    // No fallback chain - only request exact language
    const translations = await CacheModel.find({
      entityId: { $in: entityIds },
      targetLang,
      status: 'success',
    }).lean();

    const translationMap = {};
    translations.forEach(t => {
      translationMap[t.entityId] = {
        ...t,
        appliedLang: targetLang,
        fallbackUsed: false,
      };
    });

    // For products: pre-fetch nested brand translations.
    let brandTranslationMap = {};

    if (entityType === 'product') {
      // Collect all nested brand IDs
      const brandIds = entities
        .filter(e => e.brand && typeof e.brand === 'object' && e.brand._id)
        .map(e => e.brand._id?.toString() || e.brand.id);

      if (brandIds.length > 0) {
        // Only request exact language for brands
        const brandTranslations = await BrandCatalogTranslationCache.find({
          entityId: { $in: brandIds },
          targetLang,
          status: 'success',
        }).lean();

        brandTranslations.forEach(t => {
          brandTranslationMap[t.entityId] = t;
        });
      }
    }

    // Overlay translations
    const result = entities.map(entity => {
      const entityId = entity._id?.toString() || entity.id;
      const translation = translationMap[entityId];
      let overlayed = translation ? applyTranslationOverlay(entity, entityType, translation) : entity;

      // Apply nested translations for products
      if (entityType === 'product') {
        overlayed = applyNestedTranslations(overlayed, targetLang, brandTranslationMap);
      }

      return overlayed;
    });

    return result;
  } catch (error) {
    console.error(`[translationHelper] Error overlaying ${entityType} translations with fallback:`, error);
    return entities;
  }
}

/**
 * Get localized entity by ID
 */
async function getLocalizedEntity(entityId, entityType, locale) {
  if (!entityId || !entityType || !locale) {
    return null;
  }

  const cacheModel = CACHE_MODELS[entityType];
  if (!cacheModel) {
    console.warn(`[translationHelper] Unknown entity type: ${entityType}`);
    return null;
  }

  try {
    const cache = await cacheModel.findOne({
      entityId: String(entityId),
      targetLang: locale,
      status: 'success',
    }).lean();

    if (!cache) {
      return null;
    }

    return cache.toObject ? cache.toObject() : cache;
  } catch (error) {
    console.error(`[translationHelper] Error fetching localized entity:`, error);
    return null;
  }
}

module.exports = {
  // Batch overlay (original 4 types)
  overlayTranslationBatch,
  overlayProductTranslations,
  overlayBrandTranslations,
  overlayUserContentTranslations,

  // Batch overlay (new 4 types)
  overlayCouponTranslations,
  overlayOrderTranslations,
  overlayBannerTranslations,
  overlayTestimonialTranslations,

  // Fallback chain
  getTranslationWithFallback,
  overlayTranslationBatchWithFallback,
  overlayTranslationWithFallback,

  // Single overlay
  overlayTranslation,
  getLocalizedEntity,

  // Advanced
  applyTranslationCache,

  // Constants
  CACHE_MODELS,
  TRANSLATABLE_FIELDS,
};
