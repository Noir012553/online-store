const mongoose = require('mongoose');

const StaticTranslationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      index: true,
    },
    namespace: {
      type: String,
      required: true,
      index: true,
    },
    translations: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

StaticTranslationSchema.index({ code: 1, namespace: 1 }, { unique: true });

// Scope query để không lấy deleted records mặc định
StaticTranslationSchema.query.notDeleted = function () {
  return this.where({ isDeleted: false });
};

StaticTranslationSchema.query.deleted = function () {
  return this.where({ isDeleted: true });
};

module.exports = mongoose.model('StaticTranslation', StaticTranslationSchema);
