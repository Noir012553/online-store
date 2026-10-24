const mongoose = require('mongoose');

const BannerTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Banner ID',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code (e.g., "en", "fr")',
    },
    title: {
      type: String,
      description: 'Translated banner title',
    },
    description: {
      type: String,
      description: 'Translated banner description/content',
    },
    ctaText: {
      type: String,
      description: 'Translated call-to-action button text',
    },
    altText: {
      type: String,
      description: 'Translated banner alt text for accessibility',
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
    collection: 'banner_translation_cache',
  }
);

BannerTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

BannerTranslationCacheSchema.index({ status: 1, targetLang: 1 });

BannerTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 }
);

BannerTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, limit = 100) {
  return this.find({
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  })
    .limit(limit)
    .lean();
};

BannerTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
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

BannerTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
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
  'BannerTranslationCache',
  BannerTranslationCacheSchema
);
