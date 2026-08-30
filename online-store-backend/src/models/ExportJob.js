const mongoose = require('mongoose');

const ExportJobSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    request: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    filePath: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    cancelRequested: {
      type: Boolean,
      default: false,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, collection: 'export_jobs' },
);

ExportJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('ExportJob', ExportJobSchema);
