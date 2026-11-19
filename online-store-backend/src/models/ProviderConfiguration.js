const mongoose = require('mongoose');

const providerConfigurationSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderCatalogEntry', required: true, unique: true },
    providerCode: { type: String, required: true, immutable: true },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    encryptedSecrets: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ProviderConfiguration', providerConfigurationSchema);
