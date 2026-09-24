/**
 * ProductTranslationSeederService
 * 
 * Dịch tất cả sản phẩm từ tiếng Việt (vi) sang ngôn ngữ mới
 * CHIẾN LƯỢC LAYER 2 (Linh hoạt - chấp nhận dính Rate Limit):
 * - Chunking: Xử lý 10 sản phẩm mỗi lần
 * - Concurrency: Có thể cấu hình, mặc định 1 sản phẩm đồng thời
 * - Throttling: Có thể cấu hình, mặc định 1000ms giữa các chunk
 * - 429 Error Handling: Ghi nhận status='failed_rate_limit' thay vì crash
 * - Failover: Dùng LibreTranslate khi Cloudflare quá tải và failover được bật
 */

const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const cloudflareAiService = require('./cloudflareAiService');
const libretranslateProductService = require('./libretranslateProductService');
const RateLimitHandler = require('./rateLimitHandler');
const distributedLockService = require('./distributedLockService');
const translationValidator = require('../utils/translationValidator');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getCanonicalSpecKey } = require('./specKeyTranslationService');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const crypto = require('crypto');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');

const translationMemory = new Map();
const getTranslationMemoryLimit = () => {
  const configured = Number(process.env.PRODUCT_TRANSLATION_MEMORY_CACHE_SIZE || 5000);
  return Number.isInteger(configured) && configured > 0 ? configured : 5000;
};
const getTranslationMemoryKey = (field, sourceLang, targetLang) => JSON.stringify([
  field.entityType,
  field.specKey || null,
  field.originalText,
  sourceLang,
  targetLang,
]);
const getTranslationMemoryValue = (key) => {
  const value = translationMemory.get(key);
  if (value === undefined) return null;
  translationMemory.delete(key);
  translationMemory.set(key, value);
  return value;
};
const setTranslationMemoryValue = (key, value) => {
  translationMemory.delete(key);
  translationMemory.set(key, value);
  while (translationMemory.size > getTranslationMemoryLimit()) {
    translationMemory.delete(translationMemory.keys().next().value);
  }
};
const createTranslationMetrics = () => ({
  durations: [],
  providerCounts: {},
});
const recordTranslationMetric = (metrics, provider, durationMs) => {
  metrics.providerCounts[provider] = (metrics.providerCounts[provider] || 0) + 1;
  if (metrics.durations.length < 10000) metrics.durations.push(durationMs);
};
const mergeTranslationMetrics = (target, source) => {
  if (!source) return;
  Object.entries(source.providerCounts).forEach(([provider, count]) => {
    target.providerCounts[provider] = (target.providerCounts[provider] || 0) + count;
  });
  const remaining = 10000 - target.durations.length;
  if (remaining > 0) target.durations.push(...source.durations.slice(0, remaining));
};
const getPercentile = (values, percentile) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index];
};
const getTranslationLockTtlSeconds = () => {
  const configured = Number(process.env.PRODUCT_TRANSLATION_LOCK_TTL_SECONDS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const productConcurrency = Number(process.env.PRODUCT_TRANSLATION_CONCURRENCY || 1);
  const languageConcurrency = Number(process.env.PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY || 1);
  return Math.max(120, (productConcurrency * 60) + (languageConcurrency * 45));
};

class ProductTranslationSeederService {
  static async _translateDescription(text, sourceLang, targetLang) {
    const translation = await libretranslateProductService.translateWithFailover(
      text,
      sourceLang,
      targetLang,
    );
    if (typeof translation.translatedText !== 'string' || translation.translatedText.trim() === '') {
      throw new Error('Description translation returned empty content');
    }
    return translation;
  }

  /**
   * Dịch tất cả sản phẩm sang ngôn ngữ mới
   * Sử dụng chunking + concurrency + throttling + Rate Limit handling
   *
   * @param {string} targetLang - Ngôn ngữ đích (e.g., 'pt')
   * @param {string} sourceLang - Ngôn ngữ nguồn (mặc định từ config)
   * @returns {Promise<{successCount, rateLimitCount, failoverCount, memoryCacheHits, translationMetrics, errorCount, totalProcessed}>}
   */
  static async translateAllProducts(targetLang, sourceLang) {
    // Validate that sourceLang is provided
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }

    // Use provided sourceLang
    const defaultLang = getDefaultLanguage().code;

    if (!targetLang || targetLang === sourceLang) {
      throw new Error('Target language must be different from source language');
    }

    try {
      console.log(`\n[ProductSeeder] PHASE 2 (Giai đoạn 2): Dịch sản phẩm từ ${sourceLang} sang ${targetLang}`);
      console.log(`[ProductSeeder] Chiến lược Layer 2: Chấp nhận dính Rate Limit, ghi nhận lỗi, cho Admin retry\n`);

      const totalProducts = await Product.countDocuments({ isDeleted: false });
      console.log(`[ProductSeeder] Tổng sản phẩm cần dịch: ${totalProducts}`);

      if (totalProducts === 0) {
        console.log(`[ProductSeeder] Không có sản phẩm để dịch`);
        return {
          successCount: 0,
          rateLimitCount: 0,
          failoverCount: 0,
          memoryCacheHits: 0,
          errorCount: 0,
          totalProcessed: 0,
        };
      }

      let successCount = 0;
      let rateLimitCount = 0;
      let errorCount = 0;
      let failoverCount = 0;
      let memoryCacheHits = 0;
      const translationMetrics = createTranslationMetrics();
      let totalProcessed = 0;
      const processedProductIds = [];

      // Layer 2 Configuration: Thoải mái hơn Layer 1
      const chunkSize = Number(process.env.PRODUCT_TRANSLATION_CHUNK_SIZE || 10);
      const concurrentProducts = Number(process.env.PRODUCT_TRANSLATION_CONCURRENCY || 1);
      const throttleBetweenChunks = Number(process.env.PRODUCT_TRANSLATION_DELAY_MS || 1000);
      const configuredLimit = Number(process.env.PRODUCT_TRANSLATION_LIMIT || 0);
      if (!Number.isInteger(chunkSize) || chunkSize < 1) {
        throw new Error('PRODUCT_TRANSLATION_CHUNK_SIZE must be a positive integer');
      }
      if (!Number.isInteger(concurrentProducts) || concurrentProducts < 1) {
        throw new Error('PRODUCT_TRANSLATION_CONCURRENCY must be a positive integer');
      }
      if (!Number.isInteger(throttleBetweenChunks) || throttleBetweenChunks < 0) {
        throw new Error('PRODUCT_TRANSLATION_DELAY_MS must be a non-negative integer');
      }
      if (!Number.isInteger(configuredLimit) || configuredLimit < 0) {
        throw new Error('PRODUCT_TRANSLATION_LIMIT must be a non-negative integer');
      }
      const CHUNK_SIZE = chunkSize;
      const CONCURRENT_PRODUCTS = concurrentProducts;
      const THROTTLE_BETWEEN_CHUNKS = throttleBetweenChunks;
      const selectedProductCount = configuredLimit > 0
        ? Math.min(totalProducts, configuredLimit)
        : totalProducts;

      console.log(`[ProductSeeder] Phạm vi dịch: ${selectedProductCount}/${totalProducts} sản phẩm`);
      const totalChunks = Math.ceil(selectedProductCount / CHUNK_SIZE);

      // Process sản phẩm theo từng chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const skip = chunkIndex * CHUNK_SIZE;
        
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.package} Chunk ${chunkIndex + 1}/${totalChunks} (skip=${skip}, limit=${CHUNK_SIZE})`);

        // Lấy chunk sản phẩm hiện tại
        const products = await Product.find({ isDeleted: false })
          .sort({ featured: -1, createdAt: -1, _id: 1 })
          .skip(skip)
          .limit(CHUNK_SIZE)
          .lean()
          .select('_id name description brand specs technicalDescription descriptionImages promotions');

        if (products.length === 0) break;
        processedProductIds.push(...products.map(product => product._id.toString()));

        let chunkRateLimitCount = 0;

        // Process với concurrency limit
        for (let i = 0; i < products.length; i += CONCURRENT_PRODUCTS) {
          const concurrent = products.slice(i, i + CONCURRENT_PRODUCTS).map((product, index) =>
            this._translateProduct(product, targetLang, sourceLang, i + index)
          );
          const results = await Promise.allSettled(concurrent);

          for (const result of results) {
            totalProcessed++;
            if (result.status === 'fulfilled') {
              const { success, rateLimitErr, failoverErr, otherErr } = result.value;
              successCount += success;
              rateLimitCount += rateLimitErr;
              chunkRateLimitCount += rateLimitErr + failoverErr;
              failoverCount += failoverErr;
              memoryCacheHits += result.value.memoryCacheHits;
              mergeTranslationMetrics(translationMetrics, result.value.translationMetrics);
              errorCount += otherErr;
            } else {
              errorCount++;
            }
          }
        }

        // Chỉ throttle khi chunk vừa rồi có rate limit; chunk thành công chạy liền.
        if (chunkIndex < totalChunks - 1 && chunkRateLimitCount > 0 && THROTTLE_BETWEEN_CHUNKS > 0) {
          console.log(`[ProductSeeder] ${CLI_SYMBOLS.pause}  Nghỉ ${THROTTLE_BETWEEN_CHUNKS}ms sau ${chunkRateLimitCount} lỗi rate limit...`);
          await this._sleep(THROTTLE_BETWEEN_CHUNKS);
        }
      }

      await this._syncProductCatalogTranslations(targetLang, processedProductIds);

      console.log(`\n[ProductSeeder] ${CLI_SYMBOLS.target} PHASE 2 hoàn tất:`);
      console.log(`  ${CLI_SYMBOLS.success} Thành công: ${successCount}`);
      console.log(`  ${CLI_SYMBOLS.warning}  Rate Limit (ghi nhận): ${rateLimitCount}`);
      console.log(`  ${CLI_SYMBOLS.progress} LibreTranslate failover: ${failoverCount}`);
      console.log(`  ${CLI_SYMBOLS.chart} Memory cache hit: ${memoryCacheHits}`);
      console.log(`  ${CLI_SYMBOLS.chart} Provider: ${JSON.stringify(translationMetrics.providerCounts)}`);
      console.log(`  ${CLI_SYMBOLS.chart} Translation p95: ${getPercentile(translationMetrics.durations, 95) ?? 'n/a'}ms`);
      console.log(`  ${CLI_SYMBOLS.error} Lỗi khác: ${errorCount}`);
      console.log(`  ${CLI_SYMBOLS.chart} Tổng xử lý: ${totalProcessed}`);

      if (rateLimitCount > 0) {
        console.log(`\n[ProductSeeder] ${CLI_SYMBOLS.idea} Gợi ý: Admin có thể bấn nút "${CLI_SYMBOLS.progress} Dịch lại các sản phẩm lỗi" trên Dashboard`);
        console.log(`[ProductSeeder]    để retry các translations bị Rate Limit\n`);
      }

      return {
        successCount,
        rateLimitCount,
        failoverCount,
        memoryCacheHits,
        translationMetrics: {
          providerCounts: translationMetrics.providerCounts,
          sampleCount: translationMetrics.durations.length,
          p95Ms: getPercentile(translationMetrics.durations, 95),
        },
        errorCount,
        totalProcessed,
      };
    } catch (error) {
      console.error(`[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi dịch sản phẩm: ${error.message}`);
      throw error;
    }
  }

  static async _syncProductCatalogTranslations(targetLang, productIds = []) {
    if (productIds.length === 0) return;

    const [products, translations] = await Promise.all([
      Product.find({ isDeleted: false, _id: { $in: productIds } })
        .select('_id name description brand specs technicalDescription descriptionImages promotions')
        .lean(),
      LiveTranslationCache.find({
        entityId: { $in: productIds },
        targetLang,
        status: { $in: ['success', 'translated_via_libre'] },
        qualityStatus: 'approved',
        entityType: {
          $in: [
            'product_name',
            'product_description',
            'product_spec',
            'product_technical_description',
            'product_description_image_alt',
            'product_promotion',
          ],
        },
      }).select('entityId entityType specKey fieldKey originalText translatedText').lean(),
    ]);

    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const isCurrentTranslation = (translation, product) => {
      if (!product || typeof translation.originalText !== 'string') return false;
      if (translation.entityType === 'product_name') return translation.originalText === product.name;
      if (translation.entityType === 'product_description') return translation.originalText === product.description;
      if (translation.entityType === 'product_technical_description') {
        return translation.originalText === product.technicalDescription;
      }
      if (translation.entityType === 'product_spec') {
        return Object.entries(product.specs || {}).some(([key, value]) => (
          getCanonicalSpecKey(key) === getCanonicalSpecKey(translation.specKey)
          && value === translation.originalText
        ));
      }
      const match = translation.fieldKey?.match(/^(descriptionImages|promotions)\.(\d+)\.(.+)$/);
      if (!match) return false;
      const collection = product[match[1]];
      const item = Array.isArray(collection) ? collection[Number(match[2])] : null;
      return item && item[match[3]] === translation.originalText;
    };

    const translationsByProduct = new Map();
    for (const translation of translations) {
      const productId = String(translation.entityId);
      if (!isCurrentTranslation(translation, productsById.get(productId))) continue;
      const entry = translationsByProduct.get(productId) || {
        name: null,
        description: null,
        technicalDescription: null,
        descriptionImageAlts: new Map(),
        promotionTexts: new Map(),
        specs: {},
      };

      if (translation.entityType === 'product_name') entry.name = translation.translatedText;
      if (translation.entityType === 'product_description') entry.description = translation.translatedText;
      if (translation.entityType === 'product_technical_description') {
        entry.technicalDescription = translation.translatedText;
      }
      if (translation.entityType === 'product_description_image_alt' && translation.fieldKey) {
        entry.descriptionImageAlts.set(translation.fieldKey, translation.translatedText);
      }
      if (translation.entityType === 'product_promotion' && translation.fieldKey) {
        entry.promotionTexts.set(translation.fieldKey, translation.translatedText);
      }
      if (translation.entityType === 'product_spec' && translation.specKey) {
        const canonicalKey = getCanonicalSpecKey(translation.specKey);
        if (canonicalKey) entry.specs[canonicalKey] = translation.translatedText;
      }
      translationsByProduct.set(productId, entry);
    }

    const entries = products.map((product) => {
      const translated = translationsByProduct.get(product._id.toString()) || {
        name: null,
        description: null,
        technicalDescription: null,
        descriptionImageAlts: new Map(),
        promotionTexts: new Map(),
        specs: {},
      };
      const descriptionImages = Array.isArray(product.descriptionImages)
        ? product.descriptionImages.map((image, index) => ({
          ...image,
          alt: translated.descriptionImageAlts.get(`descriptionImages.${index}.alt`) || image.alt || '',
        }))
        : [];
      const promotions = Array.isArray(product.promotions)
        ? product.promotions.map((promotion, index) => {
          const localized = { ...promotion };
          ['title', 'giftProductName', 'scope', 'discountText'].forEach((field) => {
            const translation = translated.promotionTexts.get(`promotions.${index}.${field}`);
            if (translation) localized[field] = translation;
          });
          return localized;
        })
        : [];
      const validationErrors = [];
      const sourceSpecKeys = Object.entries(product.specs || {})
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .map(([key]) => getCanonicalSpecKey(key));

      if (!String(translated.name || '').trim()) validationErrors.push('missing_name');
      if (product.description?.trim() && !String(translated.description || '').trim()) {
        validationErrors.push('missing_description');
      }
      if (product.technicalDescription?.trim() && !String(translated.technicalDescription || '').trim()) {
        validationErrors.push('missing_technical_description');
      }
      if (sourceSpecKeys.some((key) => !key || !translated.specs[key])) {
        validationErrors.push('incomplete_specs');
      }
      if (Array.isArray(product.descriptionImages)) {
        product.descriptionImages.forEach((image, index) => {
          if (image?.alt?.trim() && !translated.descriptionImageAlts.get(`descriptionImages.${index}.alt`)) {
            validationErrors.push('incomplete_description_images');
          }
        });
      }
      if (Array.isArray(product.promotions)) {
        product.promotions.forEach((promotion, index) => {
          ['title', 'giftProductName', 'scope', 'discountText'].forEach((field) => {
            if (promotion?.[field]?.trim() && !translated.promotionTexts.get(`promotions.${index}.${field}`)) {
              validationErrors.push('incomplete_promotions');
            }
          });
        });
      }

      return {
        entityId: product._id.toString(),
        targetLang,
        sourceHash: getProductTranslationSourceHash(product),
        name: translated.name || product.name,
        description: translated.description || null,
        brand: product.brand || null,
        specs: translated.specs,
        technicalDescription: translated.technicalDescription || product.technicalDescription || '',
        descriptionImages,
        promotions,
        status: 'success',
        qualityStatus: validationErrors.length === 0 ? 'approved' : 'pending',
        qualityScore: validationErrors.length === 0 ? 100 : 0,
        validationErrors,
        lastTranslatedAt: new Date(),
      };
    });

    if (entries.length === 0) return;

    await ProductCatalogTranslationCache.bulkWrite(entries.map((entry) => ({
      updateOne: {
        filter: { entityId: entry.entityId, targetLang },
        update: entry.qualityStatus === 'approved'
          ? { $set: entry }
          : { $setOnInsert: entry },
        upsert: true,
      },
    })));
  }

  /**
   * Retry translations bị lỗi Rate Limit
   * Admin bấn nút "Dịch lại" -> gọi hàm này
   * 
   * @param {string} targetLang - Language code
   * @param {string} sourceLang - Source language
   * @param {number} maxRetries - Max retry attempts
   * @returns {Promise<{successCount, stillFailedCount}>}
   */
  static async retryFailedTranslations(targetLang, sourceLang, maxRetries = 3) {
    // Validate required parameters
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }
    try {
      console.log(`\n[ProductSeeder] ${CLI_SYMBOLS.progress} RETRY: Đang thử dịch lại các sản phẩm bị lỗi...`);

      // Lấy danh sách translations lỗi
      const failed = await RateLimitHandler.getFailedTranslations(targetLang, null, 1000);
      console.log(`[ProductSeeder] Tìm thấy ${failed.length} translations cần retry`);

      if (failed.length === 0) {
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.success} Không có translations lỗi cần retry`);
        return { successCount: 0, stillFailedCount: 0 };
      }

      let successCount = 0;
      let stillFailedCount = 0;

      // Dịch lại từng entry
      for (const entry of failed) {
        try {
          // Check nếu vượt max retries
          if (entry.retryCount >= maxRetries) {
            console.warn(
              `[ProductSeeder] ${CLI_SYMBOLS.skip}  Bỏ qua ${entry.entityType} (đã retry ${entry.retryCount} lần)`
            );
            stillFailedCount++;
            continue;
          }

          // Thử dịch lại
          const translatedText = await cloudflareAiService.translate(
            entry.originalText,
            sourceLang,
            targetLang
          );

          const validationResult = await translationValidator.validateTranslation(
            entry.originalText,
            translatedText,
            targetLang,
            entry.entityType || 'generic'
          );

          // Cập nhật DB
          await LiveTranslationCache.updateOne(
            { _id: entry._id },
            {
              $set: {
                translatedText,
                status: 'success',
                qualityStatus: validationResult.qualityStatus,
                qualityScore: validationResult.qualityScore,
                validationErrors: validationResult.validationErrors,
                lastErrorMessage: null,
                lastRetryAt: new Date(),
              },
              $inc: { retryCount: 1 }
            }
          );

          successCount++;
        } catch (err) {
          // Vẫn lỗi? Cập nhật retry count
          const failedStatus = err.response?.status === 429
            ? 'failed_rate_limit'
            : 'failed_error';

          await LiveTranslationCache.updateOne(
            { _id: entry._id },
            {
              $set: {
                status: failedStatus,
                lastErrorMessage: err.message,
                lastRetryAt: new Date(),
              },
              $inc: { retryCount: 1 }
            }
          );

          stillFailedCount++;
        }
      }

      console.log(`[ProductSeeder] ${CLI_SYMBOLS.target} RETRY kết thúc:`);
      console.log(`  ${CLI_SYMBOLS.success} Dịch thành công: ${successCount}`);
      console.log(`  ${CLI_SYMBOLS.error} Vẫn lỗi: ${stillFailedCount}`);

      return { successCount, stillFailedCount };
    } catch (error) {
      console.error(`[ProductSeeder] Lỗi retry: ${error.message}`);
      throw error;
    }
  }

  static async _translateWithDraft(text, sourceLang, targetLang) {
    return libretranslateProductService.translateWithFailover(text, sourceLang, targetLang);
  }

  /**
   * Dịch một sản phẩm cụ thể
   * @private
   */
  static async _translateProduct(product, targetLang, sourceLang, index) {
    const productId = product._id.toString();
    const lockKey = `translate:${productId}:${targetLang}`;
    let lockId = null;
    let lockRenewalTimer = null;

    try {
      await distributedLockService.initialize();

      const lockTtlSeconds = getTranslationLockTtlSeconds();
      lockId = await distributedLockService.acquireLock(lockKey, lockTtlSeconds);
      if (!lockId) {
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.skip}  Không thể acquire lock cho ${productId}, skip`);
        return {
          success: 0,
          rateLimitErr: 0,
          failoverErr: 0,
          memoryCacheHits: 0,
          otherErr: 0,
        };
      }

      lockRenewalTimer = setInterval(() => {
        distributedLockService.extendLock(lockKey, lockId, lockTtlSeconds).catch(() => {});
      }, Math.max(1000, Math.floor(lockTtlSeconds * 1000 / 3)));
      lockRenewalTimer.unref?.();

      let successCount = 0;
      let rateLimitCount = 0;
      let failoverCount = 0;
      let memoryCacheHitCount = 0;
      const translationMetrics = createTranslationMetrics();
      let otherErrorCount = 0;

      // Array chứa tất cả field cần dịch
      const fieldsToTranslate = [];
      const cacheWrites = [];

      // 1. Dịch tên sản phẩm
      if (product.name?.trim()) {
        fieldsToTranslate.push({
          originalText: product.name,
          entityType: 'product_name',
        });
      }

      // 2. Dịch mô tả sản phẩm
      if (product.description?.trim()) {
        fieldsToTranslate.push({
          originalText: product.description,
          entityType: 'product_description',
        });
      }

      if (product.specs && typeof product.specs === 'object') {
        Object.entries(product.specs).forEach(([specKey, value]) => {
          if (typeof value === 'string' && value.trim()) {
            fieldsToTranslate.push({
              originalText: value,
              entityType: 'product_spec',
              specKey,
            });
          }
        });
      }

      if (product.technicalDescription?.trim()) {
        fieldsToTranslate.push({
          originalText: product.technicalDescription,
          entityType: 'product_technical_description',
          fieldKey: 'technicalDescription',
        });
      }

      if (Array.isArray(product.descriptionImages)) {
        product.descriptionImages.forEach((image, index) => {
          if (image?.alt?.trim()) {
            fieldsToTranslate.push({
              originalText: image.alt,
              entityType: 'product_description_image_alt',
              fieldKey: `descriptionImages.${index}.alt`,
            });
          }
        });
      }

      if (Array.isArray(product.promotions)) {
        product.promotions.forEach((promotion, index) => {
          ['title', 'giftProductName', 'scope', 'discountText'].forEach((field) => {
            if (promotion?.[field]?.trim()) {
              fieldsToTranslate.push({
                originalText: promotion[field],
                entityType: 'product_promotion',
                fieldKey: `promotions.${index}.${field}`,
              });
            }
          });
        });
      }

      // Dịch từng field
      for (const field of fieldsToTranslate) {
        try {
          const hashKey = crypto
            .createHash('md5')
            .update(JSON.stringify([
              productId,
              field.entityType,
              field.fieldKey || null,
              field.specKey || null,
              field.originalText,
              sourceLang,
              targetLang,
            ]))
            .digest('hex');

          // Check cache trước
          const memoryKey = getTranslationMemoryKey(field, sourceLang, targetLang);
          const memoryTranslation = getTranslationMemoryValue(memoryKey);
          let cached = null;
          if (!memoryTranslation) {
            cached = await LiveTranslationCache.findOne({ hashKey }).lean();
          }
          const hasApprovedCache = ['success', 'translated_via_libre'].includes(cached?.status)
            && cached.qualityStatus === 'approved'
            && !cached.validationErrors?.includes('missing_brand');
          if (hasApprovedCache) {
            setTranslationMemoryValue(memoryKey, {
              translatedText: cached.translatedText,
              provider: cached.provider || 'cloudflare',
            });
            successCount++;
            continue;
          }

          const translationStartedAt = Date.now();
          const translation = memoryTranslation || (['product_description', 'product_technical_description'].includes(field.entityType)
            ? await this._translateDescription(field.originalText, sourceLang, targetLang)
            : await this._translateWithDraft(field.originalText, sourceLang, targetLang));
          if (!memoryTranslation) {
            recordTranslationMetric(translationMetrics, translation.provider, Date.now() - translationStartedAt);
          }
          if (memoryTranslation) memoryCacheHitCount++;
          if (!memoryTranslation) setTranslationMemoryValue(memoryKey, translation);
          const translatedText = translation.translatedText;
          if (translation.provider === 'libretranslate') failoverCount++;

          const validationResult = await translationValidator.validateTranslation(
            field.originalText,
            translatedText,
            targetLang,
            field.entityType
          );
          const isLibreTranslateFailover = translation.provider === 'libretranslate';

          // Lưu cache
          const translationRecord = {
            hashKey,
            originalText: field.originalText,
            translatedText,
            sourceLang,
            targetLang,
            entityId: productId,
            entityType: field.entityType,
            specKey: field.specKey || null,
            fieldKey: field.fieldKey || null,
            status: isLibreTranslateFailover ? 'translated_via_libre' : 'success',
            provider: translation.provider,
            providerSource: isLibreTranslateFailover ? 'secondary_failover' : 'primary',
            metadata: isLibreTranslateFailover ? { secondary_provider: true } : {},
            qualityStatus: validationResult.qualityStatus,
            qualityScore: validationResult.qualityScore,
            validationErrors: validationResult.validationErrors,
            retryCount: 0,
            failoverReason: translation.failoverReason || null,
          };
          cacheWrites.push({
            updateOne: {
              filter: { hashKey },
              update: { $set: translationRecord },
              upsert: true,
            },
          });

          successCount++;
        } catch (err) {
          // ========== Xử lý 429 Rate Limit ==========
          if (err.response?.status === 429 || err.cloudflareRateLimited === true) {
            console.warn(
              `[ProductSeeder] ${CLI_SYMBOLS.warning}  429 Rate Limit: ${field.entityType} (${productId})`
            );

            // Ghi nhận vào DB thay vì crash
            try {
              await RateLimitHandler.recordRateLimitError(
                field.originalText,
                targetLang,
                productId,
                field.entityType,
                err.cloudflareRateLimited === true
                  ? 'Cloudflare overload exhausted; LibreTranslate failover unavailable'
                  : '429 Too Many Requests from Cloudflare AI',
                sourceLang,
                field.fieldKey || null,
              );

              rateLimitCount++;
            } catch (recordErr) {
              console.error(`[ProductSeeder] Lỗi ghi nhận 429: ${recordErr.message}`);
              otherErrorCount++;
            }
          } else {
            // ========== Xử lý lỗi khác ==========
            console.error(
              `[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi dịch field '${field.entityType}' của sản phẩm ${productId}: ${err.message}`
            );
            await RateLimitHandler.recordTranslationError(
              field.originalText,
              targetLang,
              productId,
              field.entityType,
              err.message,
              'failed_error',
              sourceLang,
              field.fieldKey || null,
            );
            otherErrorCount++;
          }
        }
      }

      if (cacheWrites.length > 0) {
        await LiveTranslationCache.bulkWrite(cacheWrites, { ordered: false });
      }

      return {
        success: successCount,
        rateLimitErr: rateLimitCount,
        failoverErr: failoverCount,
        memoryCacheHits: memoryCacheHitCount,
        translationMetrics,
        otherErr: otherErrorCount,
      };
    } catch (err) {
      console.error(`[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi xử lý sản phẩm: ${err.message}`);
      return {
        success: 0,
        rateLimitErr: 0,
        failoverErr: 0,
        memoryCacheHits: 0,
        otherErr: 1,
      };
    } finally {
      if (lockRenewalTimer) clearInterval(lockRenewalTimer);
      if (lockId) await distributedLockService.releaseLock(lockKey, lockId);
    }
  }

  /**
   * Sleep utility
   * @private
   */
  static _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProductTranslationSeederService;
