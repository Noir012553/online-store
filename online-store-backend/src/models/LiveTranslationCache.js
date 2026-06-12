const mongoose = require('mongoose');
const crypto = require('crypto');

const LiveTranslationCacheSchema = new mongoose.Schema(
  {
    hashKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originalText: {
      type: String,
      required: true,
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
    },
    translatedText: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['product_name', 'product_description', 'product_brand', 'product_spec', 'product_feature', 'review', 'category_name', 'category_description', 'generic'],
      default: 'generic',
    },
    specKey: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000,
    },
  },
  {
    timestamps: false,
  }
);

LiveTranslationCacheSchema.pre('save', function (next) {
  if (!this.hashKey) {
    const hash = crypto
      .createHash('md5')
      .update(`${this.originalText}:${this.targetLang}`)
      .digest('hex');
    this.hashKey = hash;
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('LiveTranslationCache', LiveTranslationCacheSchema);
