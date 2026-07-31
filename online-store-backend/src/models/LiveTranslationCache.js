const mongoose = require('mongoose');
const crypto = require('crypto');

const LiveTranslationCacheSchema = new mongoose.Schema(
  {
    hashKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originalText: {
      type: String,
      required: true,
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
    },
    translatedText: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['product_name', 'product_description', 'product_brand', 'product_spec', 'product_feature', 'review', 'category_name', 'category_description', 'generic'],
      default: 'generic',
    },
    specKey: {
      type: String,
    },
    status: {
      type: String,
      enum: ['success', 'failed_rate_limit', 'failed_error', 'pending_retry'],
      default: 'success',
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastErrorMessage: {
      type: String,
      default: null,
    },
    lastRetryAt: {
      type: Date,
      default: null,
    },
    // ========== CHẤT LƯỢNG DỊCH ==========
    qualityStatus: {
      type: String,
      enum: ['approved', 'pending', 'needs_retranslate', 'rejected', 'retranslated'],
      default: 'pending',
      index: true,
    },
    qualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    validationErrors: {
      type: [String],
      default: [],
    },
    // ========== LỊCH SỬ DUYỆT ==========
    reviewedBy: {
      type: String,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: null,
    },
    // ========== VERSION CONTROL ==========
    version: {
      type: Number,
      default: 1,
      index: true,
    },
    previousVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveTranslationCache',
      default: null,
    },
    retranslateReason: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

LiveTranslationCacheSchema.pre('save', function (next) {
  if (!this.hashKey) {
    const hash = crypto
      .createHash('md5')
      .update(`${this.originalText}:${this.targetLang}`)
      .digest('hex');
    this.hashKey = hash;
  }
  if (typeof next === 'function') {
    next();
  }
});

// Compound index cho lookup nhanh: entityId + targetLang + entityType
LiveTranslationCacheSchema.index({ entityId: 1, targetLang: 1, entityType: 1 });
// Index cho admin lọc lỗi
LiveTranslationCacheSchema.index({ status: 1, targetLang: 1 });
// Index cho quality status filtering
LiveTranslationCacheSchema.index({ qualityStatus: 1, targetLang: 1 });
LiveTranslationCacheSchema.index({ qualityStatus: 1, validationErrors: 1 });
// Index cho version control
LiveTranslationCacheSchema.index({ hashKey: 1, version: 1 });
// TTL Index: Tự động xóa sau 30 ngày
LiveTranslationCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// Helper method: Get failed translations for retry
LiveTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, entityType = null, limit = 100) {
  const query = {
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  };

  if (entityType) {
    query.entityType = entityType;
  }

  return this.find(query).limit(limit).lean();
};

// Helper method: Get error statistics
LiveTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
  return this.aggregate([
    {
      $match: { targetLang, status: { $ne: 'success' } }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        entityTypes: { $push: '$entityType' }
      }
    }
  ]);
};

// Helper method: Get translations needing retranslation
LiveTranslationCacheSchema.statics.getNeedsRetranslate = async function(filter = {}, limit = 100) {
  const query = { qualityStatus: 'needs_retranslate', ...filter };
  return this.find(query).limit(limit).lean();
};

// Helper method: Get quality statistics
LiveTranslationCacheSchema.statics.getQualityStats = async function(targetLang, entityType = null) {
  const match = { targetLang };
  if (entityType) match.entityType = entityType;

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalTranslations: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'approved'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'pending'] }, 1, 0] } },
        needsRetranslate: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'needs_retranslate'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'rejected'] }, 1, 0] } },
        avgQualityScore: { $avg: '$qualityScore' }
      }
    }
  ]);
};

// Helper method: Get validation error statistics
LiveTranslationCacheSchema.statics.getValidationErrorStats = async function(targetLang, entityType = null) {
  const match = { targetLang, validationErrors: { $exists: true, $ne: [] } };
  if (entityType) match.entityType = entityType;

  return this.aggregate([
    { $match: match },
    { $unwind: '$validationErrors' },
    {
      $group: {
        _id: '$validationErrors',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = mongoose.model('LiveTranslationCache', LiveTranslationCacheSchema);
