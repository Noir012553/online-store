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

const aboutMediaSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ['team', 'hero', 'loading'],
      required: true,
      index: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    srcSet: {
      type: String,
      default: '',
    },
    posterUrl: {
      type: String,
      default: null,
    },
    sourceUrl: {
      type: String,
      default: null,
    },
    asset: {
      type: assetMetadataSchema,
      default: null,
    },
    storageProvider: {
      type: String,
      default: null,
    },
    storageAccount: {
      type: String,
      default: null,
    },
    bucket: {
      type: String,
      default: null,
    },
    storageKey: {
      type: String,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

aboutMediaSchema.index({ kind: 1, sortOrder: 1 });

module.exports = mongoose.model('AboutMedia', aboutMediaSchema);
