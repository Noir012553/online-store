const mongoose = require('mongoose');

const UserContentTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Review or Comment ID',
    },
    entityType: {
      type: String,
      enum: ['review', 'comment'],
      required: true,
      index: true,
      description: 'Type of content being translated',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code',
    },
    originalText: {
      type: String,
      required: true,
      description: 'Original text before translation',
    },
    translatedText: {
      type: String,
      required: true,
      description: 'Translated text',
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
    collection: 'user_content_translation_cache',
  }
);

// Compound index: entityId + entityType + targetLang (unique per content + language)
UserContentTranslationCacheSchema.index(
  { entityId: 1, entityType: 1, targetLang: 1 },
  { unique: true }
);

// Index for filtering by status
UserContentTranslationCacheSchema.index({ status: 1, targetLang: 1 });

// Index for content-type filtering
UserContentTranslationCacheSchema.index({ entityType: 1, targetLang: 1 });

// TTL Index: Auto-delete after 30 days (shorter than product cache)
UserContentTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000 } // 30 days
);

// Helper method: Get failed translations for retry
UserContentTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, entityType = null, limit = 100) {
  const query = {
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  };

  if (entityType) {
    query.entityType = entityType;
  }

  return this.find(query)
    .limit(limit)
    .lean();
};

// Helper method: Get error statistics
UserContentTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
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

// Helper method: Get cache statistics
UserContentTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
  return this.aggregate([
    {
      $match: { targetLang }
    },
    {
      $group: {
        _id: { status: '$status', entityType: '$entityType' },
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model(
  'UserContentTranslationCache',
  UserContentTranslationCacheSchema
);
