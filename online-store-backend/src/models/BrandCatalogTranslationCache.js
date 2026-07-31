const mongoose = require('mongoose');

const BrandCatalogTranslationCacheSchema = new mongoose.Schema(
  {
    entityId: {
      type: String,
      required: true,
      index: true,
      description: 'Brand ID',
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
      description: 'Translated brand name',
    },
    description: {
      type: String,
      description: 'Translated brand description',
    },
    status: {
      type: String,
      enum: ['success', 'failed_rate_limit', 'failed_error', 'pending_retry'],
      default: 'success',
      index: true,
    },
    retries: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

BrandCatalogTranslationCacheSchema.index({ entityId: 1, targetLang: 1 }, { unique: true });

module.exports = mongoose.model('BrandCatalogTranslationCache', BrandCatalogTranslationCacheSchema);
