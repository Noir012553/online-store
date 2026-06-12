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
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000,
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

module.exports = mongoose.model('LiveTranslationCache', LiveTranslationCacheSchema);
