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
    source: {
      type: String,
      enum: ['dynamic', 'static'],
      default: 'dynamic',
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
