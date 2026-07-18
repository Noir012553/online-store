const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const TranslationAuditLog = require('../models/TranslationAuditLog');
const crypto = require('crypto');

const SHADOW_WRITES_ENABLED = process.env.SHADOW_WRITES_ENABLED === 'true';

class TranslationShadowWriteService {
  /**
   * Write product translation to NEW schema (for Phase 1)
   * Aggregates specs & features into single document
   */
  static async writeShadowProductTranslation(productId, targetLang, translationData) {
    if (!SHADOW_WRITES_ENABLED) return null;

    try {
      const { name, description, brand, specs = {}, features = [], status = 'success', retryCount = 0, lastErrorMessage = null, lastRetryAt = null } = translationData;

      const updateData = {
        entityId: productId,
        targetLang,
        name,
        description,
        brand,
        specs: new Map(Object.entries(specs)),
        features: Array.isArray(features) ? features : [],
        status,
        retryCount,
        lastErrorMessage,
        lastRetryAt,
      };

      const saved = await ProductCatalogTranslationCache.findOneAndUpdate(
        { entityId: productId, targetLang },
        updateData,
        { upsert: true, new: true }
      );

      return saved;
    } catch (error) {
      console.error('[ShadowWrite] Error writing product translation:', error);
      throw error;
    }
  }

  /**
   * Write review/comment translation to NEW schema
   */
  static async writeShadowUserContentTranslation(entityId, entityType, targetLang, translationData) {
    if (!SHADOW_WRITES_ENABLED) return null;

    try {
      const { originalText, translatedText, status = 'success', retryCount = 0, lastErrorMessage = null, lastRetryAt = null } = translationData;

      const updateData = {
        entityId,
        entityType,
        targetLang,
        originalText,
        translatedText,
        status,
        retryCount,
        lastErrorMessage,
        lastRetryAt,
      };

      const saved = await UserContentTranslationCache.findOneAndUpdate(
        { entityId, entityType, targetLang },
        updateData,
        { upsert: true, new: true }
      );

      return saved;
    } catch (error) {
      console.error('[ShadowWrite] Error writing user content translation:', error);
      throw error;
    }
  }

  /**
   * Log audit trail when admin overrides translation
   */
  static async logAuditTrail(auditData) {
    try {
      const { userId, userName, action, oldValue, newValue, entityId, entityType, targetLang, reason, ipAddress, userAgent } = auditData;

      const hashKey = crypto
        .createHash('md5')
        .update(`${newValue}:${targetLang}`)
        .digest('hex');

      const auditLog = await TranslationAuditLog.create({
        hashKey,
        userId,
        userName,
        action,
        oldValue,
        newValue,
        entityId,
        entityType,
        targetLang,
        reason,
        ipAddress,
        userAgent,
        status: 'success',
        timestamp: new Date(),
      });

      return auditLog;
    } catch (error) {
      console.error('[AuditLog] Error logging audit trail:', error);
      throw error;
    }
  }

  /**
   * Get all product translations from NEW schema
   */
  static async getProductTranslationFromNewSchema(productId, targetLang) {
    try {
      const translation = await ProductCatalogTranslationCache.findOne({
        entityId: productId,
        targetLang,
      }).lean();

      if (!translation) return null;

      return {
        name: translation.name,
        description: translation.description,
        brand: translation.brand,
        specs: translation.specs ? Object.fromEntries(translation.specs) : {},
        features: translation.features || [],
        categoryName: translation.categoryName,
      };
    } catch (error) {
      console.error('[ShadowWrite] Error fetching product translation:', error);
      throw error;
    }
  }

  /**
   * Get user content translation from NEW schema
   */
  static async getUserContentTranslationFromNewSchema(entityId, entityType, targetLang) {
    try {
      const translation = await UserContentTranslationCache.findOne({
        entityId,
        entityType,
        targetLang,
      }).lean();

      if (!translation) return null;

      return {
        translatedText: translation.translatedText,
      };
    } catch (error) {
      console.error('[ShadowWrite] Error fetching user content translation:', error);
      throw error;
    }
  }

  /**
   * Check if shadow writes are enabled
   */
  static isShadowWriteEnabled() {
    return SHADOW_WRITES_ENABLED;
  }
}

module.exports = TranslationShadowWriteService;
