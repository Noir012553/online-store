const mongoose = require('mongoose');

const TranslationQualityLogSchema = new mongoose.Schema(
  {
    translationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveTranslationCache',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['created', 'approved', 'rejected', 'retranslated', 'validated'],
      required: true,
      index: true,
    },
    oldValue: {
      type: String,
      default: null,
    },
    newValue: {
      type: String,
      default: null,
    },
    actor: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Compound index cho audit trail
TranslationQualityLogSchema.index({ translationId: 1, createdAt: -1 });
// Index cho searching by actor
TranslationQualityLogSchema.index({ actor: 1, action: 1 });

// Helper method: Get translation history
TranslationQualityLogSchema.statics.getHistory = async function(translationId) {
  return this.find({ translationId }).sort({ createdAt: -1 }).lean();
};

// Helper method: Get approval statistics
TranslationQualityLogSchema.statics.getApprovalStats = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        action: { $in: ['approved', 'rejected'] }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        reviewers: { $push: '$actor' }
      }
    }
  ]);
};

// Helper method: Get recent validations
TranslationQualityLogSchema.statics.getRecentValidations = async function(limit = 50) {
  return this.find({ action: 'validated' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('TranslationQualityLog', TranslationQualityLogSchema);
