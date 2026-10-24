const mongoose = require('mongoose');

const TestimonialTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Testimonial ID',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code (e.g., "en", "fr")',
    },
    content: {
      type: String,
      description: 'Translated testimonial content/text',
    },
    authorName: {
      type: String,
      description: 'Translated author name',
    },
    authorTitle: {
      type: String,
      description: 'Translated author title/role',
    },
    authorCompany: {
      type: String,
      description: 'Translated author company name',
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
    collection: 'testimonial_translation_cache',
  }
);

TestimonialTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

TestimonialTranslationCacheSchema.index({ status: 1, targetLang: 1 });

TestimonialTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 }
);

TestimonialTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, limit = 100) {
  return this.find({
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  })
    .limit(limit)
    .lean();
};

TestimonialTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
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

TestimonialTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
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
  'TestimonialTranslationCache',
  TestimonialTranslationCacheSchema
);
