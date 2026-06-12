const mongoose = require('mongoose');

const BANNER_SLOTS = [
  'sitewide_top',
  'homepage_hero',
  'homepage_left',
  'homepage_right',
  'homepage_inline',
  'products_top',
  'category_top',
  'product_top',
];

const BANNER_SLOT_LABELS = {
  sitewide_top: 'Toàn site',
  homepage_hero: 'Hero trang chủ',
  homepage_left: 'Lề trái trang chủ',
  homepage_right: 'Lề phải trang chủ',
  homepage_inline: 'Chèn trong nội dung trang chủ',
  products_top: 'Đầu trang sản phẩm',
  category_top: 'Đầu trang danh mục',
  product_top: 'Đầu trang chi tiết sản phẩm',
};

const bannerSchema = mongoose.Schema(
  {
    title: {
      vi: {
        type: String,
        required: true,
        trim: true,
      },
      en: {
        type: String,
        trim: true,
      },
    },
    subtitle: {
      vi: {
        type: String,
        default: '',
        trim: true,
      },
      en: {
        type: String,
        default: '',
        trim: true,
      },
    },
    description: {
      vi: {
        type: String,
        default: '',
        trim: true,
      },
      en: {
        type: String,
        default: '',
        trim: true,
      },
    },
    ctaText: {
      vi: {
        type: String,
        default: '',
        trim: true,
      },
      en: {
        type: String,
        default: '',
        trim: true,
      },
    },
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
  BANNER_SLOT_LABELS,
};
