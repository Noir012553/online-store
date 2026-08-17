const mongoose = require('mongoose');

const CloudinaryCleanupOutboxSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true, collection: 'cloudinary_cleanup_outbox' }
);

CloudinaryCleanupOutboxSchema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });

module.exports = mongoose.model('CloudinaryCleanupOutbox', CloudinaryCleanupOutboxSchema);
