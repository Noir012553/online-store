const mongoose = require('mongoose');

const TranslationBatchRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    payloadHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'translation_batch_requests',
  }
);

TranslationBatchRequestSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
TranslationBatchRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('TranslationBatchRequest', TranslationBatchRequestSchema);
