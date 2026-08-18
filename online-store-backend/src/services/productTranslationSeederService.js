/**
 * ProductTranslationSeederService
 * 
 * Dịch tất cả sản phẩm từ tiếng Việt (vi) sang ngôn ngữ mới
 * CHIẾN LƯỢC LAYER 2 (Linh hoạt - chấp nhận dính Rate Limit):
 * - Chunking: Xử lý 10 sản phẩm mỗi lần
 * - Concurrency: Có thể cấu hình, mặc định 1 sản phẩm đồng thời
 * - Throttling: Có thể cấu hình, mặc định 1000ms giữa các chunk
 * - 429 Error Handling: Ghi nhận status='failed_rate_limit' thay vì crash
 * - Fallback: Giữ text gốc (originalText) khi dính Rate Limit
 */

const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('./cloudflareAiService');
const RateLimitHandler = require('./rateLimitHandler');
const distributedLockService = require('./distributedLockService');
const translationValidator = require('../utils/translationValidator');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const crypto = require('crypto');

class ProductTranslationSeederService {
  static _splitDescription(text, maxLength = 6000) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxLength, text.length);
      if (end < text.length) {
        const boundary = Math.max(
          text.lastIndexOf('\n', end),
          text.lastIndexOf('. ', end),
          text.lastIndexOf('! ', end),
          text.lastIndexOf('? ', end),
          text.lastIndexOf(' ', end)
        );
        if (boundary > start) end = boundary + 1;
      }
      chunks.push(text.slice(start, end));
      start = end;
    }

    return chunks;
  }

  static async _translateDescription(text, sourceLang, targetLang) {
    const chunks = this._splitDescription(text);
    const translations = [];

    for (const chunk of chunks) {
      const translatedChunk = await cloudflareAiService.translate(chunk, sourceLang, targetLang);
      if (typeof translatedChunk !== 'string' || translatedChunk.trim() === '') {
        throw new Error('Description translation returned an empty chunk');
      }
      translations.push(translatedChunk);
    }

    const translatedText = translations.join('');
    if (translatedText.trim() === '') {
      throw new Error('Description translation returned empty content');
    }

    return translatedText;
  }

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
      const CONCURRENT_PRODUCTS = Math.max(1, Number(process.env.PRODUCT_TRANSLATION_CONCURRENCY || 1));
      const THROTTLE_BETWEEN_CHUNKS = Math.max(0, Number(process.env.PRODUCT_TRANSLATION_DELAY_MS || 1000));

      const totalChunks = Math.ceil(totalProducts / CHUNK_SIZE);

      // Process sản phẩm theo từng chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const skip = chunkIndex * CHUNK_SIZE;
        
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.package} Chunk ${chunkIndex + 1}/${totalChunks} (skip=${skip}, limit=${CHUNK_SIZE})`);

        // Lấy chunk sản phẩm hiện tại
        const products = await Product.find({})
          .skip(skip)
          .limit(CHUNK_SIZE)
          .lean()
          .select('_id name description brand specs');

        if (products.length === 0) break;

        // Process với concurrency limit
        for (let i = 0; i < products.length; i += CONCURRENT_PRODUCTS) {
          const concurrent = products.slice(i, i + CONCURRENT_PRODUCTS).map((product, index) =>
            this._translateProduct(product, targetLang, sourceLang, i + index)
          );
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
          console.log(`[ProductSeeder] ${CLI_SYMBOLS.pause}  Nghỉ ${THROTTLE_BETWEEN_CHUNKS}ms trước chunk tiếp theo...`);
          await this._sleep(THROTTLE_BETWEEN_CHUNKS);
        }
      }

      console.log(`\n[ProductSeeder] ${CLI_SYMBOLS.target} PHASE 2 hoàn tất:`);
      console.log(`  ${CLI_SYMBOLS.success} Thành công: ${successCount}`);
      console.log(`  ${CLI_SYMBOLS.warning}  Rate Limit (ghi nhận): ${rateLimitCount}`);
      console.log(`  ${CLI_SYMBOLS.error} Lỗi khác: ${errorCount}`);
      console.log(`  ${CLI_SYMBOLS.chart} Tổng xử lý: ${totalProcessed}`);

      if (rateLimitCount > 0) {
        console.log(`\n[ProductSeeder] ${CLI_SYMBOLS.idea} Gợi ý: Admin có thể bấn nút "${CLI_SYMBOLS.progress} Dịch lại các sản phẩm lỗi" trên Dashboard`);
        console.log(`[ProductSeeder]    để retry các translations bị Rate Limit\n`);
      }

      return { successCount, rateLimitCount, errorCount, totalProcessed };
    } catch (error) {
      console.error(`[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi dịch sản phẩm: ${error.message}`);
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

      console.log(`[ProductSeeder] ${CLI_SYMBOLS.target} RETRY kết thúc:`);
      console.log(`  ${CLI_SYMBOLS.success} Dịch thành công: ${successCount}`);
      console.log(`  ${CLI_SYMBOLS.error} Vẫn lỗi: ${stillFailedCount}`);

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
    let lockId = null;

    try {
      await distributedLockService.initialize();

      const isLocked = await distributedLockService.isLocked(lockKey);
      if (isLocked) {
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.skip}  Product ${productId} đang được dịch bởi process khác, skip`);
        return { success: 0, rateLimitErr: 0, otherErr: 0 };
      }

      lockId = await distributedLockService.acquireLock(lockKey, 120);
      if (!lockId) {
        console.log(`[ProductSeeder] ${CLI_SYMBOLS.skip}  Không thể acquire lock cho ${productId}, skip`);
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

      // Dịch từng field
      for (const field of fieldsToTranslate) {
        try {
          const hashKey = crypto
            .createHash('md5')
            .update(`${field.originalText}:${targetLang}`)
            .digest('hex');

          // Check cache trước
          const cached = await LiveTranslationCache.findOne({
            hashKey,
            status: 'success',
          }).lean();
          const cachedNeedsRefresh = cached?.validationErrors?.includes('missing_brand');
          if (cached && !cachedNeedsRefresh) {
            successCount++;
            continue;
          }

          // Dịch text
          const translatedText = field.entityType === 'product_description'
            ? await this._translateDescription(field.originalText, sourceLang, targetLang)
            : await cloudflareAiService.translate(field.originalText, sourceLang, targetLang);

          const validationResult = await translationValidator.validateTranslation(
            field.originalText,
            translatedText,
            targetLang,
            field.entityType
          );

          // Lưu cache
          const translationRecord = {
            hashKey,
            originalText: field.originalText,
            translatedText,
            targetLang,
            entityId: productId,
            entityType: field.entityType,
            specKey: field.specKey || null,
            status: 'success',
            qualityStatus: validationResult.qualityStatus,
            qualityScore: validationResult.qualityScore,
            validationErrors: validationResult.validationErrors,
            retryCount: 0,
          };
          if (cachedNeedsRefresh) {
            await LiveTranslationCache.updateOne({ _id: cached._id }, { $set: translationRecord });
          } else {
            await LiveTranslationCache.create(translationRecord);
          }

          successCount++;
        } catch (err) {
          // ========== Xử lý 429 Rate Limit ==========
          if (err.response?.status === 429) {
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
              `[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi dịch field '${field.entityType}' của sản phẩm ${productId}: ${err.message}`
            );
            otherErrorCount++;
          }
        }
      }

      return { success: successCount, rateLimitErr: rateLimitCount, otherErr: otherErrorCount };
    } catch (err) {
      console.error(`[ProductSeeder] ${CLI_SYMBOLS.error} Lỗi xử lý sản phẩm: ${err.message}`);
      return { success: 0, rateLimitErr: 0, otherErr: 1 };
    } finally {
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
