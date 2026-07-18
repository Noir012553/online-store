const mongoose = require('mongoose');

const OrderTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Order ID',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code (e.g., "en", "fr")',
    },
    customerNotes: {
      type: String,
      description: 'Translated customer notes',
    },
    shippingNotes: {
      type: String,
      description: 'Translated shipping notes',
    },
    adminNotes: {
      type: String,
      description: 'Translated admin notes',
    },
    statusMessage: {
      type: String,
      description: 'Translated order status message',
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
    collection: 'order_translation_cache',
  }
);

OrderTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

OrderTranslationCacheSchema.index({ status: 1, targetLang: 1 });

OrderTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 }
);

OrderTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, limit = 100) {
  return this.find({
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  })
    .limit(limit)
    .lean();
};

OrderTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
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

OrderTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
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
  'OrderTranslationCache',
  OrderTranslationCacheSchema
);
