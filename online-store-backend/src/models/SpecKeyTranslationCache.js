const mongoose = require('mongoose');

const SpecKeyTranslationCacheSchema = new mongoose.Schema(
  {
    canonicalKey: {
      type: String,
      required: true,
      trim: true,
    },
    targetLang: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    normalizedKey: {
      type: String,
      required: true,
      trim: true,
    },
    translatedLabel: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
      index: true,
    },
    qualityStatus: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
      index: true,
    },
    source: {
      type: String,
      enum: ['dynamic', 'static'],
      default: 'dynamic',
    },
    provider: {
      type: String,
      default: 'static',
      trim: true,
    },
    lastTranslatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'spec_key_translation_cache',
  }
);

SpecKeyTranslationCacheSchema.index(
  { canonicalKey: 1, targetLang: 1 },
  { unique: true }
);

module.exports = mongoose.model('SpecKeyTranslationCache', SpecKeyTranslationCacheSchema);
