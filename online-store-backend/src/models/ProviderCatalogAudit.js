const mongoose = require('mongoose');

const providerCatalogAuditSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderCatalogEntry', required: true, index: true },
    providerCode: { type: String, required: true },
    action: { type: String, enum: ['create', 'update', 'delete', 'restore'], required: true },
    changedFields: { type: [String], required: true },
    version: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

providerCatalogAuditSchema.index({ providerId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('ProviderCatalogAudit', providerCatalogAuditSchema);
