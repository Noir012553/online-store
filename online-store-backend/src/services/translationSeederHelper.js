/**
 * Translation Seeder Helper - Batch translation for products, reviews, comments
 * Handles: Translation, Caching, Retry logic, Timeout, Memory management
 * Source language: Gearvn always Vietnamese (VI)
 *
 * Optimizations:
 * - Incremental seeding: Skip products already translated
 * - Dry-run mode: Test without AI calls
 * - Batch query cache: Check 20+ items at once
 * - Memory cleanup: Explicit GC + pending cache flush
 */

const cloudflareAiService = require('./cloudflareAiService');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
const Product = require('../models/Product');
const Category = require('../models/Category');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const translationValidator = require('../utils/translationValidator');
const { getDefaultLanguage } = require('../config/languageInventory');
const crypto = require('crypto');

const DEFAULT_CONFIG = {
  BATCH_SIZE: 5,
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,
  TIMEOUT_MS: 30000,
  DRY_RUN: process.env.DRY_RUN === 'true', // Test mode: skip AI calls
  INCREMENTAL: process.env.INCREMENTAL_SEED === 'true', // Skip already-translated items
};

class TranslationSeederHelper {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate MD5 hash for cache key
   */
  generateHashKey(text, targetLang) {
    return crypto
      .createHash('md5')
      .update(`${text}:${targetLang}`)
      .digest('hex');
  }

  /**
   * Translate with retry and timeout
   * Source language: always Vietnamese (vi)
   * DRY_RUN: Return text as-is for testing without AI calls
   */
  async translateWithRetry(text, targetLang, retries = 0, sourceLang = null) {
    if (this.config.DRY_RUN) {
      return text; // Mock: return original text
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.TIMEOUT_MS);

      try {
        const src = sourceLang || getDefaultLanguage().code;
        const result = await cloudflareAiService.translate(text, src, targetLang, controller.signal);
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      if (retries < this.config.MAX_RETRIES) {
        console.warn(
          `  ⚠️ Translation retry ${retries + 1}/${this.config.MAX_RETRIES} for: "${text.substring(0, 30)}..." (${error.message})`
        );
        await new Promise(resolve => setTimeout(resolve, this.config.RETRY_DELAY));
        return this.translateWithRetry(text, targetLang, retries + 1, sourceLang);
      }
      throw error;
    }
  }

  /**
   * Batch query cache for multiple texts
   * Returns: Map of hashKey -> translatedText
   */
  async batchQueryCache(textPairs) {
    if (textPairs.length === 0) return new Map();

    const hashKeys = textPairs.map(({ text, targetLang }) =>
      this.generateHashKey(text, targetLang)
    );

    const cachedRecords = await LiveTranslationCache.find(
      { hashKey: { $in: hashKeys } },
      { hashKey: 1, translatedText: 1 }
    ).lean();

    const cacheMap = new Map();
    cachedRecords.forEach(record => {
      cacheMap.set(record.hashKey, record.translatedText);
    });

    return cacheMap;
  }

  /**
   * Batch save translations to cache with validation
   */
  async batchSaveCache(records, enableValidation = true) {
    if (records.length === 0) return;

    try {
      const recordsToSave = [];
      const logsToCreate = [];

      for (const record of records) {
        let validationResult = null;

        // Run auto-validation if enabled
        if (enableValidation) {
          validationResult = await translationValidator.validateTranslation(
            record.originalText,
            record.translatedText,
            record.targetLang,
            record.entityType || 'generic'
          );

          record.qualityStatus = validationResult.qualityStatus;
          record.qualityScore = validationResult.qualityScore;
          record.validationErrors = validationResult.validationErrors;
        } else {
          // If validation disabled, mark as pending
          record.qualityStatus = 'pending';
          record.qualityScore = null;
          record.validationErrors = [];
        }

        recordsToSave.push(record);

        // Create audit log
        logsToCreate.push({
          action: 'created',
          actor: 'system',
          reason: validationResult?.hasCriticalErrors ? 'auto_validation_error' : 'created',
          metadata: validationResult || {},
        });
      }

      // Save translations
      const savedRecords = await LiveTranslationCache.insertMany(recordsToSave, { ordered: false });

      // Save audit logs with translation IDs
      if (logsToCreate.length > 0) {
        logsToCreate.forEach((log, idx) => {
          if (savedRecords[idx]) {
            log.translationId = savedRecords[idx]._id;
          }
        });
        await TranslationQualityLog.insertMany(logsToCreate, { ordered: false });
      }
    } catch (error) {
      // Ignore duplicate key errors on insert (some may already exist)
      if (error.code !== 11000) throw error;
    }
  }

  /**
   * Batch check cache for multiple texts
   * OPTIMIZATION: Instead of N findOne calls, do 1 bulk query with $in
   * Returns: Map of hashKey -> translatedText
   */
  async batchCheckCache(textLangPairs) {
    if (!textLangPairs || textLangPairs.length === 0) return new Map();

    const hashKeys = textLangPairs.map(({ text, targetLang }) =>
      this.generateHashKey(text, targetLang)
    );

    const cachedRecords = await LiveTranslationCache.find(
      { hashKey: { $in: hashKeys } },
      { hashKey: 1, translatedText: 1 }
    ).lean();

    const cacheMap = new Map();
    cachedRecords.forEach(record => {
      cacheMap.set(record.hashKey, record.translatedText);
    });

    return cacheMap;
  }

  /**
   * Translate product fields with cache check
   * Returns: { originalText, translatedText, fromCache }
   * Optional: entityId, entityType, specKey for tracking product translations
   *
   * OPTIMIZATION: When called in batch, use batchCheckCache() instead
   */
  async translateField(text, targetLang, entityId = null, entityType = 'generic', specKey = null, sourceLang = null) {
    if (!text || typeof text !== 'string') {
      return { originalText: text, translatedText: text, fromCache: false };
    }

    const hashKey = this.generateHashKey(text, targetLang);

    // Check cache (fallback single query if needed)
    const cached = await LiveTranslationCache.findOne({ hashKey }, { translatedText: 1 }).lean();
    if (cached) {
      return {
        originalText: text,
        translatedText: cached.translatedText,
        fromCache: true,
      };
    }

    // Not in cache - translate
    const translatedText = await this.translateWithRetry(text, targetLang, 0, sourceLang);

    // Queue for batch save (don't save individually)
    // Will be saved via batchSaveCache() to avoid middleware issues
    this._pendingCache = this._pendingCache || [];
    const cacheRecord = {
      hashKey,
      originalText: text,
      targetLang,
      translatedText,
    };

    // Add optional fields for tracking
    if (entityId) cacheRecord.entityId = entityId;
    if (entityType !== 'generic') cacheRecord.entityType = entityType;
    if (specKey) cacheRecord.specKey = specKey;

    this._pendingCache.push(cacheRecord);

    return {
      originalText: text,
      translatedText,
      fromCache: false,
    };
  }

  /**
   * Translate product object (name, description, brand, specs values, features)
   * Returns: { name, description, brand } with translations + queued specs/features
   * Tracks translations with productId so they can be retrieved later
   *
   * OPTIMIZATION: Collect all specs/features texts first, batch check cache, then translate
   */
  async translateProduct(product, targetLang) {
    const productId = product._id ? String(product._id) : null;
    const fieldsToTranslate = ['name', 'description', 'brand'];
    const results = {};

    const promises = fieldsToTranslate.map(field =>
      this.translateField(
        product[field],
        targetLang,
        productId,
        field === 'name' ? 'product_name' : field === 'description' ? 'product_description' : 'product_brand'
      ).then(result => {
        results[field] = result;
      })
    );

    await Promise.all(promises);

    // OPTIMIZATION: Collect all specs/features texts for batch cache lookup
    const specsAndFeatures = [];
    const specMap = new Map(); // Track which text corresponds to which spec key
    const featureSet = new Set();

    if (product.specs && typeof product.specs === 'object') {
      for (const [key, value] of Object.entries(product.specs)) {
        if (typeof value === 'string') {
          const hashKey = this.generateHashKey(value, targetLang);
          specsAndFeatures.push({ text: value, targetLang });
          specMap.set(hashKey, key);
        }
      }
    }

    if (Array.isArray(product.features)) {
      for (const feature of product.features) {
        if (typeof feature === 'string') {
          specsAndFeatures.push({ text: feature, targetLang });
          featureSet.add(feature);
        }
      }
    }

    // Batch check cache for all specs/features in ONE query (O(log n) instead of O(n))
    if (specsAndFeatures.length > 0) {
      const cacheMap = await this.batchCheckCache(specsAndFeatures);

      // Translate only missing items
      const toTranslate = [];
      specsAndFeatures.forEach(({ text }) => {
        const hashKey = this.generateHashKey(text, targetLang);
        if (!cacheMap.has(hashKey)) {
          toTranslate.push({ text, hashKey });
        }
      });

      // Batch translate missing items
      const translatePromises = toTranslate.map(async ({ text, hashKey }) => {
        const translatedText = await this.translateWithRetry(text, targetLang);
        cacheMap.set(hashKey, translatedText);

        // Queue for batch save
        this._pendingCache = this._pendingCache || [];
        const cacheRecord = {
          hashKey,
          originalText: text,
          targetLang,
          translatedText,
        };

        // Add entity type based on whether it's a spec or feature
        if (specMap.has(hashKey)) {
          cacheRecord.entityId = productId;
          cacheRecord.entityType = 'product_spec';
          cacheRecord.specKey = specMap.get(hashKey);
        } else if (featureSet.has(text)) {
          cacheRecord.entityId = productId;
          cacheRecord.entityType = 'product_feature';
        }

        this._pendingCache.push(cacheRecord);
      });

      await Promise.all(translatePromises);
    }

    return results;
  }

  /**
   * Flush pending cache to database + cleanup
   */
  async flushPendingCache() {
    if (!this._pendingCache || this._pendingCache.length === 0) {
      return;
    }

    try {
      const records = [...this._pendingCache];
      this._pendingCache = []; // Clear pending

      await LiveTranslationCache.insertMany(records, { ordered: false });
    } catch (error) {
      if (error.code !== 11000) {
        console.warn(`  ⚠️ Failed to flush cache batch: ${error.message}`);
      }
      // 11000 = duplicate key, expected for some records
    }

    // Memory cleanup: explicitly clear references
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Translate category fields using the canonical category translation cache.
   */
  async translateCategory(category, targetLang) {
    const sourceLang = 'en';
    const [name, description] = await Promise.all([
      this.translateWithRetry(category.name, targetLang, 0, sourceLang),
      this.translateWithRetry(category.description, targetLang, 0, sourceLang),
    ]);

    return { name, description };
  }

  /**
   * Translate review object (name, comment)
   */
  async translateReview(review, targetLang, reviewId) {
    const fieldsToTranslate = [
      { field: 'name', entityType: 'review_name' },
      { field: 'comment', entityType: 'review_comment' },
    ];
    const results = {};

    const promises = fieldsToTranslate.map(({ field, entityType }) =>
      this.translateField(review[field], targetLang, reviewId, entityType).then(result => {
        results[field] = result;
      })
    );

    await Promise.all(promises);
    return results;
  }


  /**
   * Batch translate products with progress logging
   * targetLanguages: array of language codes to translate to (defaults to all supported except base)
   * INCREMENTAL: Skip products already translated
   * OPTIMIZATION: Bulk fetch translated products in ONE query instead of N findById calls
   */
  async translateProductsBatch(products, targetLanguages = null) {
    const { getActiveLangCodes } = require('../config/languageInventory');
    const targetLangs = targetLanguages || getActiveLangCodes();
    const stats = {
      total: 0,
      cached: 0,
      translated: 0,
      failed: 0,
      skipped: 0,
    };

    let processedCount = 0;
    const productsToTranslate = [];

    // OPTIMIZATION: Bulk fetch all product translations in one query instead of N findById
    if (this.config.INCREMENTAL) {
      console.log(`  🔄 INCREMENTAL MODE: Checking existing translations...`);

      const productIds = products.map(p => p._id);
      const translatedProducts = await Product.find(
        { _id: { $in: productIds } },
        { _id: 1, translations: 1 }
      ).lean();

      const translatedMap = new Map();
      translatedProducts.forEach(p => {
        translatedMap.set(String(p._id), p.translations || {});
      });

      for (const product of products) {
        for (const targetLang of targetLangs) {
          const productTranslations = translatedMap.get(String(product._id)) || {};
          if (!productTranslations[targetLang]) {
            productsToTranslate.push({ product, targetLang });
          } else {
            stats.skipped++;
          }
        }
      }
      console.log(`  ⏭️ Skipping ${stats.skipped} already-translated items`);
    } else {
      for (const product of products) {
        for (const targetLang of targetLanguages) {
          productsToTranslate.push({ product, targetLang });
        }
      }
    }

    for (const { product, targetLang } of productsToTranslate) {
      try {
        const translations = await this.translateProduct(product, targetLang);

        Object.entries(translations).forEach(([field, result]) => {
          stats.total++;
          if (result.fromCache) {
            stats.cached++;
          } else {
            stats.translated++;
          }
        });
      } catch (error) {
        stats.failed += 3;
        console.error(
          `  ❌ Failed to translate ${product.name.substring(0, 30)}... to ${targetLang}: ${error.message}`
        );
      }

      processedCount++;
      if (processedCount % 10 === 0) {
        await this.flushPendingCache();
      }
    }

    await this.flushPendingCache();

    return stats;
  }

  /**
   * Check if category already has translations in cache
   * Uses CategoryCatalogTranslationCache, not embedded field
   */
  async isCategoryTranslated(categoryId, targetLang = getDefaultLanguage().code) {
    if (!this.config.INCREMENTAL) {
      return false;
    }

    try {
      const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
      const translation = await CategoryCatalogTranslationCache.findOne({
        entityId: String(categoryId),
        targetLang
      }).lean();

      return Boolean(translation);
    } catch (error) {
      console.warn(`  ⚠️ Failed to check category translation status: ${error.message}`);
      return false;
    }
  }

  /**
   * Batch translate categories with progress logging
   * INCREMENTAL: Skip categories already translated
   * OPTIMIZATION: Bulk fetch translated categories in ONE query instead of N findById calls
   */
  async translateCategoriesBatch(categories, targetLanguages = null) {
    const { getActiveLangCodes } = require('../config/languageInventory');
    const targetLangs = targetLanguages || getActiveLangCodes();
    const stats = {
      total: 0,
      cached: 0,
      translated: 0,
      failed: 0,
      skipped: 0,
    };

    let processedCount = 0;
    const categoriesToTranslate = [];

    // OPTIMIZATION: Bulk fetch all category translations in one query instead of N findById
    if (this.config.INCREMENTAL) {
      console.log(`  🔄 INCREMENTAL MODE: Checking existing category translations...`);

      const categoryIds = categories.map(category => String(category._id));
      const existingTranslations = await CategoryCatalogTranslationCache.find({
        entityId: { $in: categoryIds },
        targetLang: { $in: targetLangs },
        status: 'success',
      }).select({ entityId: 1, targetLang: 1 }).lean();
      const translatedKeys = new Set(
        existingTranslations.map(translation => `${translation.entityId}:${translation.targetLang}`)
      );

      for (const category of categories) {
        for (const targetLang of targetLangs) {
          if (!translatedKeys.has(`${category._id}:${targetLang}`)) {
            categoriesToTranslate.push({ category, targetLang });
          } else {
            stats.skipped++;
          }
        }
      }
      console.log(`  ⏭️ Skipping ${stats.skipped} already-translated categories`);
    } else {
      for (const category of categories) {
        for (const targetLang of targetLangs) {
          categoriesToTranslate.push({ category, targetLang });
        }
      }
    }

    for (const { category, targetLang } of categoriesToTranslate) {
      try {
        const translations = await this.translateCategory(category, targetLang);
        await CategoryCatalogTranslationCache.updateOne(
          { entityId: String(category._id), targetLang },
          {
            $set: {
              entityId: String(category._id),
              targetLang,
              name: translations.name,
              description: translations.description,
              status: 'success',
              retryCount: 0,
              lastErrorMessage: null,
              lastRetryAt: null,
            },
          },
          { upsert: true }
        );
        stats.total += 2;
        stats.translated += 2;
      } catch (error) {
        stats.failed += 2;
        console.error(
          `  ❌ Failed to translate category ${category.name.substring(0, 30)}... to ${targetLang}: ${error.message}`
        );
      }

      processedCount++;
      if (processedCount % 5 === 0) {
        await this.flushPendingCache();
      }
    }

    await this.flushPendingCache();

    return stats;
  }

  /**
   * Batch translate reviews with progress logging
   * Auto-detect source language from review comment
   */
  async translateReviewsBatch(reviews, targetLanguages = null) {
    const { getActiveLangCodes } = require('../config/languageInventory');
    const targetLangs = targetLanguages || getActiveLangCodes();
    const stats = {
      total: 0,
      cached: 0,
      translated: 0,
      failed: 0,
    };

    let processedCount = 0;

    for (const review of reviews) {
      for (const targetLang of targetLangs) {
        try {
          const translations = await this.translateReview(review, targetLang, review._id);

          Object.entries(translations).forEach(([field, result]) => {
            stats.total++;
            if (result.fromCache) {
              stats.cached++;
            } else {
              stats.translated++;
            }

          });
        } catch (error) {
          stats.failed += 2; // name + comment
          console.error(
            `  ❌ Failed to translate review by ${review.name.substring(0, 30)}... to ${targetLang}: ${error.message}`
          );
        }
      }

      processedCount++;
      if (processedCount % 5 === 0) {
        await this.flushPendingCache();
      }
    }

    await this.flushPendingCache();

    return stats;
  }
}

module.exports = new TranslationSeederHelper();
