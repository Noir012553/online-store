const mongoose = require('mongoose');

const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, immutable: true, default: 'storefront' },
    branding: {
      storeName: { type: String, default: '', trim: true, maxlength: 120 },
      siteUrl: { type: String, default: '', trim: true, maxlength: 300 },
      supportEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
      logoUrl: { type: String, default: '', trim: true, maxlength: 2048 },
      darkLogoUrl: { type: String, default: '', trim: true, maxlength: 2048 },
      faviconUrl: { type: String, default: '', trim: true, maxlength: 2048 },
    },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: '', trim: true, maxlength: 1000 },
      scheduledStart: { type: Date, default: null },
      scheduledEnd: { type: Date, default: null },
    },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StoreSettings', storeSettingsSchema);
