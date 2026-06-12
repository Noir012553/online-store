const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystemDefault: {
      type: Boolean,
      default: false,
    },
    nativeName: {
      type: String,
      trim: true,
    },
    isReady: {
      type: Boolean,
      default: false,
      index: true,
    },
    setupStartedAt: {
      type: Date,
      default: null,
    },
    setupCompletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Language', LanguageSchema);
