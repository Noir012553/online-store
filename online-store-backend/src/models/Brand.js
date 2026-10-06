const mongoose = require('mongoose');

const assetMetadataSchema = new mongoose.Schema({
  sourceUrl: { type: String, default: null },
  storageProvider: { type: String, default: null },
  storageAccount: { type: String, default: null },
  bucket: { type: String, default: null },
  storageKey: { type: String, default: null },
  publicUrl: { type: String, default: null },
  publicId: { type: String, default: null },
  contentHash: { type: String, default: null },
  mimeType: { type: String, default: null },
  bytes: { type: Number, default: null },
}, { _id: false });

const brandSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    logoAsset: {
      type: assetMetadataSchema,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    key: {
      type: String,
      unique: true,
      sparse: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

brandSchema.index({ name: 1, isDeleted: 1 });

module.exports = mongoose.model('Brand', brandSchema);
