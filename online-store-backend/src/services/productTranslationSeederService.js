/**
 * ProductTranslationSeederService
 * 
 * Dịch tất cả sản phẩm từ tiếng Việt (vi) sang ngôn ngữ mới
 * Tối ưu hóa cho production:
 * - Chunking: Xử lý 20 sản phẩm mỗi lần (không load hết lên RAM)
 * - Concurrency: 3 sản phẩm đồng thời
 * - Throttling: 1500ms nghỉ giữa các chunk
 * - Cache check: Kiểm tra cache trước khi dịch
 */

const Product = require('../models/Product');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('./cloudflareAiService');
const crypto = require('crypto');

class ProductTranslationSeederService {
  /**
   * Dịch tất cả sản phẩm sang ngôn ngữ mới
   * Sử dụng chunking + concurrency + throttling để tránh overload
   * 
   * @param {string} targetLang - Ngôn ngữ đích (e.g., 'pt')
   * @param {string} sourceLang - Ngôn ngữ nguồn (mặc định: 'vi')
   * @returns {Promise<{successCount: number, errorCount: number, totalProcessed: number}>}
   */
  static async translateAllProducts(targetLang, sourceLang = 'vi') {
    if (!targetLang || targetLang === sourceLang) {
      throw new Error('Target language must be different from source language');
    }

    try {
      console.log(`\n[ProductSeeder] PHASE 2 (Giai đoạn 2): Dịch sản phẩm từ ${sourceLang} sang ${targetLang}`);

      // Lấy tổng số sản phẩm
      const totalProducts = await Product.countDocuments({});
      console.log(`[ProductSeeder] Tổng sản phẩm cần dịch: ${totalProducts}`);

      if (totalProducts === 0) {
        console.log(`[ProductSeeder] Không có sản phẩm để dịch`);
        return { successCount: 0, errorCount: 0, totalProcessed: 0 };
      }

      let successCount = 0;
      let errorCount = 0;
      let totalProcessed = 0;

      const CHUNK_SIZE = 20; // Lấy 20 sản phẩm mỗi lần
      const CONCURRENT_PRODUCTS = 3; // Dịch 3 sản phẩm đồng thời
      const THROTTLE_BETWEEN_CHUNKS = 1500; // Nghỉ 1500ms giữa các chunk

      const totalChunks = Math.ceil(totalProducts / CHUNK_SIZE);

      // Process sản phẩm theo từng chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const skip = chunkIndex * CHUNK_SIZE;
        
        console.log(`[ProductSeeder] Chunk ${chunkIndex + 1}/${totalChunks} (skip=${skip}, limit=${CHUNK_SIZE})`);

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
              const { success, errorCount: err } = result.value;
              successCount += success;
              errorCount += err;
            } else {
              errorCount++;
            }
          }
        }

        // Throttle giữa các chunk
        if (chunkIndex < totalChunks - 1) {
          console.log(`[ProductSeeder] ⏸️  Nghỉ ${THROTTLE_BETWEEN_CHUNKS}ms trước chunk tiếp theo...`);
          await this._sleep(THROTTLE_BETWEEN_CHUNKS);
        }
      }

      console.log(`\n[ProductSeeder] PHASE 2 hoàn tất:`);
      console.log(`  • Thành công: ${successCount}`);
      console.log(`  • Lỗi: ${errorCount}`);
      console.log(`  • Tổng xử lý: ${totalProcessed}`);

      return { successCount, errorCount, totalProcessed };
    } catch (error) {
      console.error(`[ProductSeeder] Lỗi dịch sản phẩm: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dịch một sản phẩm cụ thể
   * @private
   */
  static async _translateProduct(product, targetLang, sourceLang, index) {
    try {
      let successCount = 0;
      let errorCount = 0;

      const productId = product._id.toString();

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

      // 4. Dịch từng spec
      if (product.specs && typeof product.specs === 'object') {
        for (const [key, value] of Object.entries(product.specs)) {
          if (value && typeof value === 'string' && value.trim()) {
            fieldsToTranslate.push({
              originalText: value,
              entityType: 'product_spec',
              specKey: key,
            });
          }
        }
      }

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
          // Tạo hash key để check cache
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
          });

          successCount++;
        } catch (err) {
          console.error(
            `[ProductSeeder] Lỗi dịch field '${field.entityType}' của sản phẩm ${productId}: ${err.message}`
          );
          errorCount++;
        }
      }

      return { success: successCount, errorCount };
    } catch (err) {
      console.error(`[ProductSeeder] Lỗi xử lý sản phẩm: ${err.message}`);
      return { success: 0, errorCount: 1 };
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
