const mongoose = require('mongoose');

const providerConfigurationAuditSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderCatalogEntry', required: true, index: true },
    providerCode: { type: String, required: true },
    action: { type: String, enum: ['create', 'update', 'reveal'], required: true },
    changedFields: { type: [String], default: [] },
    version: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

providerConfigurationAuditSchema.index({ providerId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('ProviderConfigurationAudit', providerConfigurationAuditSchema);
