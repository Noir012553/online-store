const mongoose = require('mongoose');

const storeSettingsAuditSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['update', 'logo_upload', 'reset'], required: true },
    changedFields: { type: [String], required: true },
    version: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

storeSettingsAuditSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model('StoreSettingsAudit', storeSettingsAuditSchema);
