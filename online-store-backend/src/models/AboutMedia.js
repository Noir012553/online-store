const mongoose = require('mongoose');

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
      enum: ['team'],
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
    sourceUrl: {
      type: String,
      required: true,
    },
    sortOrder: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

aboutMediaSchema.index({ kind: 1, sortOrder: 1 });

module.exports = mongoose.model('AboutMedia', aboutMediaSchema);
