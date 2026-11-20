const mongoose = require('mongoose');

const providerCatalogEntrySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['email', 'payment', 'shipping', 'deploy', 'storage', 'ai'],
      required: true,
    },
    providerCode: {
      type: String,
      enum: ['smtp', 'sendgrid', 'cod', 'vnpay', 'paypal', 'momo', 'vercel', 'render', 'ghn', 'cloudflare_tunnel', 'cloudflare_r2', 'cloudflare_ai'],
      required: true,
      immutable: true,
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    keyValues: {
      type: [{ _id: false, key: { type: String, required: true, trim: true, maxlength: 100 }, value: { type: String, maxlength: 2048 } }],
      default: [],
      validate: { validator: (items) => items.length <= 50, message: 'A provider catalog entry can have at most 50 key-value fields.' },
    },
    version: { type: Number, default: 1, min: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

providerCatalogEntrySchema.index({ category: 1, isDeleted: 1, updatedAt: -1, _id: -1 });
providerCatalogEntrySchema.index({ providerCode: 1, isDeleted: 1 });

module.exports = mongoose.model('ProviderCatalogEntry', providerCatalogEntrySchema);
