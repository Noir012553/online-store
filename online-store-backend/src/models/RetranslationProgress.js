const mongoose = require('mongoose');

const RetranslationProgressSchema = new mongoose.Schema({
  signature: { type: String, required: true, index: true },
  key: { type: String, required: true },
  fixed: { type: Boolean, default: false },
  validationErrors: { type: [String], default: [] },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

RetranslationProgressSchema.index({ signature: 1, key: 1 }, { unique: true });

const RetranslationRunLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

RetranslationRunLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RetranslationProgress = mongoose.models.RetranslationProgress
  || mongoose.model('RetranslationProgress', RetranslationProgressSchema);
const RetranslationRunLock = mongoose.models.RetranslationRunLock
  || mongoose.model('RetranslationRunLock', RetranslationRunLockSchema);

module.exports = { RetranslationProgress, RetranslationRunLock };
