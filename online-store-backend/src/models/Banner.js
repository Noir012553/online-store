const mongoose = require('mongoose');

const BANNER_SLOTS = [
  'sitewide_top',
  'homepage_hero',
  'homepage_warranty',
  'homepage_left',
  'homepage_right',
  'homepage_inline',
  'products_top',
  'category_top',
  'product_top',
];

const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');
const SUPPORTED_LANGUAGES = getActiveLangCodes();
const DEFAULT_LANG = getDefaultLanguage().code;

const createMultiLangField = () => {
  const field = {};
  SUPPORTED_LANGUAGES.forEach(lang => {
    field[lang] = {
      type: String,
      default: '',
      trim: true,
    };
  });
  field[DEFAULT_LANG].required = true;
  return field;
};

const bannerSchema = mongoose.Schema(
  {
    title: createMultiLangField(),
    subtitle: createMultiLangField(),
    description: createMultiLangField(),
    ctaText: createMultiLangField(),
    targetUrl: {
      type: String,
      default: '',
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
    imagePublicId: {
      type: String,
      default: null,
    },
    slot: {
      type: String,
      enum: BANNER_SLOTS,
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    openInNewTab: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      default: () => new Date(),
    },
    endDate: {
      type: Date,
      default: () => {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear;
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

bannerSchema.index({ slot: 1, isDeleted: 1, isActive: 1, sortOrder: 1 });
bannerSchema.index({ startDate: 1, endDate: 1 });

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = {
  Banner,
  BANNER_SLOTS,
  SUPPORTED_LANGUAGES,
};
