const mongoose = require('mongoose');

const SpecKeyRegistrySchema = new mongoose.Schema(
  {
    canonicalKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    sourceKeys: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'ignored'],
      default: 'pending',
      index: true,
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'spec_key_registry',
  }
);

SpecKeyRegistrySchema.index({ canonicalKey: 1 }, { unique: true });

module.exports = mongoose.model('SpecKeyRegistry', SpecKeyRegistrySchema);
