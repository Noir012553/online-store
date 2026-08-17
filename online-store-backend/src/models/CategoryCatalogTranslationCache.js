const mongoose = require('mongoose');

const CategoryCatalogTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Category ID',
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
      description: 'Translated category name',
    },
    description: {
      type: String,
      description: 'Translated category description',
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
    collection: 'category_catalog_translation_cache',
  }
);

// Compound index: entityId + targetLang (unique per category + language)
CategoryCatalogTranslationCacheSchema.index(
  { entityId: 1, targetLang: 1 },
  { unique: true }
);

// Index for filtering by status
CategoryCatalogTranslationCacheSchema.index({ status: 1, targetLang: 1 });


module.exports = mongoose.model(
  'CategoryCatalogTranslationCache',
  CategoryCatalogTranslationCacheSchema
);
