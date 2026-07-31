const mongoose = require('mongoose');

const ProductCatalogTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Product ID',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Target language code (e.g., "en", "fr")',
    },
    name: {
      type: String,
      required: true,
      description: 'Translated product name',
    },
    description: {
      type: String,
      description: 'Translated product description',
    },
    brand: {
      type: String,
      description: 'Translated brand name',
    },
    specs: {
      type: Map,
      of: String,
      default: new Map(),
      description: 'Aggregated specs: { "RAM": "16GB DDR5", "Storage": "512GB NVMe" }',
    },
    features: {
      type: [String],
      default: [],
      description: 'Array of translated features',
    },
    status: {
      type: String,
      enum: ['success', 'failed_rate_limit', 'failed_error', 'pending_retry'],
      default: 'success',
      index: true,
    },
    qualityStatus: {
      type: String,
      enum: ['approved', 'pending', 'needs_retranslate', 'rejected'],
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
    manualFields: {
      type: [String],
      default: [],
    },
    lastTranslatedAt: {
      type: Date,
      default: null,
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
    collection: 'product_catalog_translation_cache',
  }
);

// Compound index: entityId + targetLang (unique per product + language)
ProductCatalogTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

// Index for filtering by status
ProductCatalogTranslationCacheSchema.index({ status: 1, targetLang: 1 });
ProductCatalogTranslationCacheSchema.index({ qualityStatus: 1, targetLang: 1 });

// TTL Index: Auto-delete after 90 days
ProductCatalogTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 } // 90 days
);

// Helper method: Get failed translations for retry
ProductCatalogTranslationCacheSchema.statics.getFailedTranslations = async function(targetLang, limit = 100) {
  return this.find({
    status: { $in: ['failed_rate_limit', 'failed_error', 'pending_retry'] },
    targetLang,
  })
    .limit(limit)
    .lean();
};

// Helper method: Get error statistics
ProductCatalogTranslationCacheSchema.statics.getErrorStats = async function(targetLang) {
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

// Helper method: Get cache hit statistics
ProductCatalogTranslationCacheSchema.statics.getCacheStats = async function(targetLang) {
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
  'ProductCatalogTranslationCache',
  ProductCatalogTranslationCacheSchema
);
