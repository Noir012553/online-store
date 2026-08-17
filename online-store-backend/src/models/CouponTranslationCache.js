const mongoose = require('mongoose');

const CouponTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Coupon ID',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code (e.g., "en", "fr")',
    },
    name: {
      type: String,
      description: 'Translated coupon name/title',
    },
    description: {
      type: String,
      description: 'Translated coupon description',
    },
    codeDescription: {
      type: String,
      description: 'Translated coupon code description',
    },
    termsAndConditions: {
      type: String,
      description: 'Translated terms and conditions',
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
      description: 'Number of times translation was retried',
    },
    lastErrorMessage: {
      type: String,
      default: null,
      description: 'Last error message if translation failed',
    },
    lastRetryAt: {
      type: Date,
      default: null,
      description: 'Timestamp of last retry attempt',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'coupon_translation_cache',
  }
);

CouponTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

CouponTranslationCacheSchema.index({ status: 1, targetLang: 1 });

CouponTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 }
);

CouponTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, limit = 100) {
  return this.find({
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  })
    .limit(limit)
    .lean();
};

CouponTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
  return this.aggregate([
    {
      $match: { targetLang, status: { $ne: 'success' } }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

CouponTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
  return this.aggregate([
    {
      $match: { targetLang }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        statuses: { $push: { status: '$_id', count: '$count' } }
      }
    }
  ]);
};

module.exports = mongoose.model(
  'CouponTranslationCache',
  CouponTranslationCacheSchema
);
