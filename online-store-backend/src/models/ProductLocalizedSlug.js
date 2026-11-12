const mongoose = require('mongoose');
const { getActiveLangCodes } = require('../config/languageInventory');

const ProductLocalizedSlugSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
      index: true,
    },
    locale: {
      type: String,
      required: true,
      enum: getActiveLangCodes(),
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    sourceName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['canonical', 'alias'],
      default: 'canonical',
    },
  },
  { timestamps: true, collection: 'product_localized_slugs' }
);

ProductLocalizedSlugSchema.index({ slug: 1 }, { unique: true });
ProductLocalizedSlugSchema.index(
  { productId: 1, locale: 1 },
  { unique: true, partialFilterExpression: { status: 'canonical' } }
);
ProductLocalizedSlugSchema.index({ productId: 1, locale: 1, status: 1 });

module.exports = mongoose.model('ProductLocalizedSlug', ProductLocalizedSlugSchema);
