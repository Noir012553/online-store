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
      enum: ['team', 'hero'],
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
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

aboutMediaSchema.index({ kind: 1, sortOrder: 1 });

module.exports = mongoose.model('AboutMedia', aboutMediaSchema);
