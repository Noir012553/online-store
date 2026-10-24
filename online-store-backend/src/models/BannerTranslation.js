const mongoose = require('mongoose');

const { getActiveLangCodes } = require('../config/languageInventory');
const SUPPORTED_LANGUAGES = getActiveLangCodes();

const bannerTranslationSchema = mongoose.Schema(
  {
    bannerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Banner',
      required: true,
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    ctaText: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure unique banner + language combination
bannerTranslationSchema.index({ bannerId: 1, language: 1 }, { unique: true });
bannerTranslationSchema.index({ bannerId: 1 });
bannerTranslationSchema.index({ language: 1 });

const BannerTranslation = mongoose.model('BannerTranslation', bannerTranslationSchema);

module.exports = {
  BannerTranslation,
  SUPPORTED_LANGUAGES,
};
