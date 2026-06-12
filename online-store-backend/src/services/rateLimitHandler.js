/**
 * Rate Limit Handler Service
 * 
 * Chiến lược xử lý 429 (Too Many Requests) cho Layer 2 (Products)
 * - Chấp nhận dính Rate Limit
 * - Ghi nhận lỗi với status = 'failed_rate_limit'
 * - Tự động retry với exponential backoff
 * - Cho Admin manual override
 */

const LiveTranslationCache = require('../models/LiveTranslationCache');

class RateLimitHandler {
  /**
   * Xử lý lỗi 429 (Rate Limit) từ Cloudflare AI
   * Ghi nhận vào DB thay vì crash toàn bộ process
   * 
   * @param {string} originalText - Text gốc cần dịch
   * @param {string} targetLang - Ngôn ngữ đích
   * @param {string} entityId - ID sản phẩm/danh mục
   * @param {string} entityType - product_name, product_description, etc
   * @param {string} errorMessage - Chi tiết lỗi từ API
   * @returns {Promise<Object>} Document được lưu vào DB
   */
  static async recordRateLimitError(
    originalText,
    targetLang,
    entityId,
    entityType,
    errorMessage
  ) {
    try {
      const crypto = require('crypto');
      const hashKey = crypto
        .createHash('md5')
        .update(`${originalText}:${targetLang}`)
        .digest('hex');

      // Upsert vào cache với status failed_rate_limit
      const cacheEntry = await LiveTranslationCache.findOneAndUpdate(
        { hashKey },
        {
          $set: {
            originalText,
            targetLang,
            translatedText: originalText, // Fallback: giữ text gốc
            entityId,
            entityType,
            status: 'failed_rate_limit',
            lastErrorMessage: errorMessage,
            lastRetryAt: new Date(),
            retryCount: 1,
          }
        },
        { upsert: true, new: true }
      );

      console.log(
        `[RateLimitHandler] 📌 Ghi nhận 429 error: ${entityType} (${entityId})`
      );

      return cacheEntry;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi ghi nhận Rate Limit: ${err.message}`);
      throw err;
    }
  }

  /**
   * Exponential Backoff Retry
   * Chờ lâu hơn mỗi lần retry để tránh spam API
   * 
   * @param {number} retryCount - Số lần retry đã cố gắng
   * @returns {number} Thời gian chờ (ms)
   */
  static getBackoffDelay(retryCount) {
    // Công thức: 2^retryCount * 1000ms (với jitter ngẫu nhiên)
    // Retry 1: 2000ms
    // Retry 2: 4000ms
    // Retry 3: 8000ms
    // Retry 4: 16000ms
    const baseDelay = Math.pow(2, retryCount) * 1000;
    const jitter = Math.random() * 0.1 * baseDelay; // Random 0-10%
    return Math.min(baseDelay + jitter, 60000); // Max 60 seconds
  }

  /**
   * Lấy danh sách translations lỗi để Admin retry
   * 
   * @param {string} targetLang - Language code
   * @param {string} entityType - Filter by entity type (optional)
   * @param {number} limit - Giới hạn số records
   * @returns {Promise<Array>} Danh sách lỗi
   */
  static async getFailedTranslations(targetLang, entityType = null, limit = 100) {
    try {
      const query = {
        status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
        targetLang,
      };

      if (entityType) {
        query.entityType = entityType;
      }

      const failed = await LiveTranslationCache.find(query)
        .limit(limit)
        .sort({ lastRetryAt: -1 })
        .lean();

      return failed;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi fetch failed translations: ${err.message}`);
      throw err;
    }
  }

  /**
   * Lấy thống kê lỗi theo từng loại
   * Dùng để Admin dashboard hiển thị
   * 
   * @param {string} targetLang - Language code
   * @returns {Promise<Object>} Statistics
   */
  static async getErrorStatistics(targetLang) {
    try {
      const stats = await LiveTranslationCache.aggregate([
        {
          $match: {
            targetLang,
            status: { $ne: 'success' }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            entityTypes: { $addToSet: '$entityType' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Format response
      const formatted = {
        failed_rate_limit: 0,
        failed_error: 0,
        pending_retry: 0,
        total_failed: 0,
        by_entity_type: {}
      };

      for (const stat of stats) {
        formatted[stat._id] = stat.count;
        formatted.total_failed += stat.count;
      }

      return formatted;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi fetch error stats: ${err.message}`);
      throw err;
    }
  }

  /**
   * Admin bấn nút "Dịch lại các sản phẩm lỗi"
   * Reset status về pending_retry để Background Job xử lý tiếp
   * 
   * @param {string} targetLang - Language code
   * @param {string} entityType - Filter by entity type (optional)
   * @returns {Promise<Object>} Updated count
   */
  static async resetFailedForRetry(targetLang, entityType = null) {
    try {
      const query = {
        status: { $in: ['failed_rate_limit', 'failed_error'] },
        targetLang,
      };

      if (entityType) {
        query.entityType = entityType;
      }

      const result = await LiveTranslationCache.updateMany(
        query,
        {
          $set: {
            status: 'pending_retry',
            retryCount: 0,
            lastRetryAt: new Date(),
          }
        }
      );

      console.log(
        `[RateLimitHandler] 🔄 Reset ${result.modifiedCount} translations để retry`
      );

      return result;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi reset for retry: ${err.message}`);
      throw err;
    }
  }

  /**
   * Admin sửa tay bản dịch - Manual Override
   * Cập nhật translatedText và đánh dấu status = 'success'
   * 
   * @param {string} hashKey - Key của translation entry
   * @param {string} translatedText - Nội dung dịch mới
   * @returns {Promise<Object>} Updated document
   */
  static async manualOverride(hashKey, translatedText) {
    try {
      const updated = await LiveTranslationCache.findOneAndUpdate(
        { hashKey },
        {
          $set: {
            translatedText,
            status: 'success',
            lastRetryAt: new Date(),
            retryCount: 0,
          }
        },
        { new: true }
      );

      if (!updated) {
        throw new Error(`Translation with hashKey ${hashKey} not found`);
      }

      console.log(
        `[RateLimitHandler] ✏️ Admin sửa tay: ${hashKey}`
      );

      return updated;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi manual override: ${err.message}`);
      throw err;
    }
  }

  /**
   * Batch update: Admin sửa nhiều translations cùng lúc
   * 
   * @param {Array<{hashKey, translatedText}>} updates - List updates
   * @returns {Promise<Object>} Bulk update result
   */
  static async batchManualOverride(updates) {
    try {
      const operations = updates.map(({ hashKey, translatedText }) => ({
        updateOne: {
          filter: { hashKey },
          update: {
            $set: {
              translatedText,
              status: 'success',
              lastRetryAt: new Date(),
              retryCount: 0,
            }
          }
        }
      }));

      const result = await LiveTranslationCache.bulkWrite(operations);

      console.log(
        `[RateLimitHandler] 📝 Batch sửa tay: ${result.modifiedCount} entries`
      );

      return result;
    } catch (err) {
      console.error(`[RateLimitHandler] Lỗi batch manual override: ${err.message}`);
      throw err;
    }
  }

  /**
   * Kiểm tra có nên dừng retry hay không (max 3 lần)
   * 
   * @param {number} retryCount - Số lần retry hiện tại
   * @returns {boolean} True nếu nên bỏ cuộc, False nếu tiếp tục
   */
  static shouldGiveUp(retryCount) {
    const MAX_RETRIES = 3;
    return retryCount >= MAX_RETRIES;
  }
}

module.exports = RateLimitHandler;
