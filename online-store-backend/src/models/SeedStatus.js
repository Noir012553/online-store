/**
 * SeedStatus Model
 * Tầng 1: Track seed initialization status
 * Cơ chế bảo vệ: Chạy seed một lần duy nhất (không ghi đè dữ liệu)
 */

const mongoose = require('mongoose');

const SeedStatusSchema = new mongoose.Schema(
  {
    // Unique identifier cho seed phase
    phase: {
      type: String,
      enum: ['INITIAL_SEED', 'TIER1_PRODUCTS'],
      required: true,
      unique: true,
      index: true,
    },

    // Status của seed
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    // Timestamp
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0, // milliseconds
    },

    // Statistics
    totalItems: {
      type: Number,
      default: 0,
    },
    processedItems: {
      type: Number,
      default: 0,
    },
    failedItems: {
      type: Number,
      default: 0,
    },

    // Error tracking
    lastError: {
      type: String,
      default: null,
    },
    errorCount: {
      type: Number,
      default: 0,
    },

    // Metadata
    version: {
      type: String,
      default: '1.0.0',
    },
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
SeedStatusSchema.index({ phase: 1, status: 1 });
SeedStatusSchema.index({ completedAt: -1 });

module.exports = mongoose.model('SeedStatus', SeedStatusSchema);
