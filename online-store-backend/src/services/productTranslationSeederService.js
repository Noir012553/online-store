/**
 * ProductTranslationSeederService
 * 
 * Dịch tất cả sản phẩm từ tiếng Việt (vi) sang ngôn ngữ mới
 * CHIẾN LƯỢC LAYER 2 (Linh hoạt - chấp nhận dính Rate Limit):
 * - Chunking: Xử lý 10 sản phẩm mỗi lần (chấp nhận dính Rate Limit)
 * - Concurrency: 8 sản phẩm đồng thời (thoải mái hơn Layer 1)
 * - Throttling: 500ms - mềm mại hơn Layer 1 (1500ms)
 * - 429 Error Handling: Ghi nhận status='failed_rate_limit' thay vì crash
 * - Fallback: Giữ text gốc (originalText) khi dính Rate Limit
 */

const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('./cloudflareAiService');
const RateLimitHandler = require('./rateLimitHandler');
const distributedLockService = require('./distributedLockService');
const { getDefaultLanguage } = require('../config/languageInventory');
const crypto = require('crypto');

class ProductTranslationSeederService {
  /**
   * Dịch tất cả sản phẩm sang ngôn ngữ mới
   * Sử dụng chunking + concurrency + throttling + Rate Limit handling
   *
   * @param {string} targetLang - Ngôn ngữ đích (e.g., 'pt')
   * @param {string} sourceLang - Ngôn ngữ nguồn (mặc định từ config)
   * @returns {Promise<{successCount, rateLimitCount, errorCount, totalProcessed}>}
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

      const totalProducts = await Product.countDocuments({});
      console.log(`[ProductSeeder] Tổng sản phẩm cần dịch: ${totalProducts}`);

      if (totalProducts === 0) {
        console.log(`[ProductSeeder] Không có sản phẩm để dịch`);
        return { successCount: 0, rateLimitCount: 0, errorCount: 0, totalProcessed: 0 };
      }

      let successCount = 0;
      let rateLimitCount = 0;
      let errorCount = 0;
      let totalProcessed = 0;

      // Layer 2 Configuration: Thoải mái hơn Layer 1
      const CHUNK_SIZE = 10;
      const CONCURRENT_PRODUCTS = 8;
      const THROTTLE_BETWEEN_CHUNKS = 500;

      const totalChunks = Math.ceil(totalProducts / CHUNK_SIZE);

      // Process sản phẩm theo từng chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const skip = chunkIndex * CHUNK_SIZE;
        
        console.log(`[ProductSeeder] 📦 Chunk ${chunkIndex + 1}/${totalChunks} (skip=${skip}, limit=${CHUNK_SIZE})`);

        // Lấy chunk sản phẩm hiện tại
        const products = await Product.find({})
          .skip(skip)
          .limit(CHUNK_SIZE)
          .lean()
          .select('_id name description brand specs features');

        if (products.length === 0) break;

        // Dịch từng sản phẩm trong chunk
        const productPromises = products.map((product, idx) =>
          this._translateProduct(product, targetLang, sourceLang, idx)
        );

        // Process với concurrency limit
        for (let i = 0; i < productPromises.length; i += CONCURRENT_PRODUCTS) {
          const concurrent = productPromises.slice(i, i + CONCURRENT_PRODUCTS);
          const results = await Promise.allSettled(concurrent);

          for (const result of results) {
            totalProcessed++;
            if (result.status === 'fulfilled') {
              const { success, rateLimitErr, otherErr } = result.value;
              successCount += success;
              rateLimitCount += rateLimitErr;
              errorCount += otherErr;
            } else {
              errorCount++;
            }
          }
        }

        // Throttle giữa các chunk (mềm mại hơn Layer 1)
        if (chunkIndex < totalChunks - 1) {
          console.log(`[ProductSeeder] ⏸️  Nghỉ ${THROTTLE_BETWEEN_CHUNKS}ms trước chunk tiếp theo...`);
          await this._sleep(THROTTLE_BETWEEN_CHUNKS);
        }
      }

      console.log(`\n[ProductSeeder] 🎯 PHASE 2 hoàn tất:`);
      console.log(`  ✅ Thành công: ${successCount}`);
      console.log(`  ⚠️  Rate Limit (ghi nhận): ${rateLimitCount}`);
      console.log(`  ❌ Lỗi khác: ${errorCount}`);
      console.log(`  📊 Tổng xử lý: ${totalProcessed}`);

      if (rateLimitCount > 0) {
        console.log(`\n[ProductSeeder] 💡 Gợi ý: Admin có thể bấn nút "🔄 Dịch lại các sản phẩm lỗi" trên Dashboard`);
        console.log(`[ProductSeeder]    để retry các translations bị Rate Limit\n`);
      }

      return { successCount, rateLimitCount, errorCount, totalProcessed };
    } catch (error) {
      console.error(`[ProductSeeder] ❌ Lỗi dịch sản phẩm: ${error.message}`);
      throw error;
    }
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
      console.log(`\n[ProductSeeder] 🔄 RETRY: Đang thử dịch lại các sản phẩm bị lỗi...`);

      // Lấy danh sách translations lỗi
      const failed = await RateLimitHandler.getFailedTranslations(targetLang, null, 1000);
      console.log(`[ProductSeeder] Tìm thấy ${failed.length} translations cần retry`);

      if (failed.length === 0) {
        console.log(`[ProductSeeder] ✅ Không có translations lỗi cần retry`);
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
              `[ProductSeeder] ⏭️  Bỏ qua ${entry.entityType} (đã retry ${entry.retryCount} lần)`
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

          // Cập nhật DB
          await LiveTranslationCache.updateOne(
            { _id: entry._id },
            {
              $set: {
                translatedText,
                status: 'success',
                lastRetryAt: new Date(),
              },
              $inc: { retryCount: 1 }
            }
          );

          successCount++;
        } catch (err) {
          // Vẫn lỗi? Cập nhật retry count
          if (err.response?.status === 429) {
            // Vẫn dính Rate Limit - chỉ tăng counter, không thay đổi status
            await LiveTranslationCache.updateOne(
              { _id: entry._id },
              {
                $set: { lastRetryAt: new Date() },
                $inc: { retryCount: 1 }
              }
            );
          }

          stillFailedCount++;
        }
      }

      console.log(`[ProductSeeder] 🎯 RETRY kết thúc:`);
      console.log(`  ✅ Dịch thành công: ${successCount}`);
      console.log(`  ❌ Vẫn lỗi: ${stillFailedCount}`);

      return { successCount, stillFailedCount };
    } catch (error) {
      console.error(`[ProductSeeder] Lỗi retry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dịch một sản phẩm cụ thể
   * @private
   */
  static async _translateProduct(product, targetLang, sourceLang, index) {
    const productId = product._id.toString();
    const lockKey = `translate:${productId}:${targetLang}`;

    try {
      await distributedLockService.initialize();

      const isLocked = await distributedLockService.isLocked(lockKey);
      if (isLocked) {
        console.log(`[ProductSeeder] ⏭️  Product ${productId} đang được dịch bởi process khác, skip`);
        return { success: 0, rateLimitErr: 0, otherErr: 0 };
      }

      const lockId = await distributedLockService.acquireLock(lockKey, 120);
      if (!lockId) {
        console.log(`[ProductSeeder] ⏭️  Không thể acquire lock cho ${productId}, skip`);
        return { success: 0, rateLimitErr: 0, otherErr: 0 };
      }

      let successCount = 0;
      let rateLimitCount = 0;
      let otherErrorCount = 0;

      // Array chứa tất cả field cần dịch
      const fieldsToTranslate = [];

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

      // 3. Dịch thương hiệu
      if (product.brand?.trim()) {
        fieldsToTranslate.push({
          originalText: product.brand,
          entityType: 'product_brand',
        });
      }

      // 4. ⚠️  NOTE: Spec translation (both keys & values) is handled by translationSeederHelper
      // Spec keys are translated via specKeyTranslations.json lookup
      // Spec values are translated via product_spec entityType
      // Do NOT add spec translation here to avoid duplicate/conflicting entityType values

      // 5. Dịch từng feature
      if (Array.isArray(product.features) && product.features.length > 0) {
        for (const feature of product.features) {
          if (feature && typeof feature === 'string' && feature.trim()) {
            fieldsToTranslate.push({
              originalText: feature,
              entityType: 'product_feature',
            });
          }
        }
      }

      // Dịch từng field
      for (const field of fieldsToTranslate) {
        try {
          const hashKey = crypto
            .createHash('md5')
            .update(`${field.originalText}:${targetLang}`)
            .digest('hex');

          // Check cache trước
          const cached = await LiveTranslationCache.findOne({ hashKey }).lean();
          if (cached) {
            successCount++;
            continue;
          }

          // Dịch text
          const translatedText = await cloudflareAiService.translate(
            field.originalText,
            sourceLang,
            targetLang
          );

          // Lưu cache
          await LiveTranslationCache.create({
            hashKey,
            originalText: field.originalText,
            translatedText,
            targetLang,
            entityId: productId,
            entityType: field.entityType,
            specKey: field.specKey || null,
            status: 'success',
            retryCount: 0,
          });

          successCount++;
        } catch (err) {
          // ========== Xử lý 429 Rate Limit ==========
          if (err.response?.status === 429) {
            console.warn(
              `[ProductSeeder] ⚠️  429 Rate Limit: ${field.entityType} (${productId})`
            );

            // Ghi nhận vào DB thay vì crash
            try {
              await RateLimitHandler.recordRateLimitError(
                field.originalText,
                targetLang,
                productId,
                field.entityType,
                `429 Too Many Requests from Cloudflare AI`
              );

              rateLimitCount++;
            } catch (recordErr) {
              console.error(`[ProductSeeder] Lỗi ghi nhận 429: ${recordErr.message}`);
              otherErrorCount++;
            }
          } else {
            // ========== Xử lý lỗi khác ==========
            console.error(
              `[ProductSeeder] ❌ Lỗi dịch field '${field.entityType}' của sản phẩm ${productId}: ${err.message}`
            );
            otherErrorCount++;
          }
        }
      }

      return { success: successCount, rateLimitErr: rateLimitCount, otherErr: otherErrorCount };
    } catch (err) {
      console.error(`[ProductSeeder] ❌ Lỗi xử lý sản phẩm: ${err.message}`);
      return { success: 0, rateLimitErr: 0, otherErr: 1 };
    } finally {
      await distributedLockService.releaseLock(lockKey, lockId);
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
