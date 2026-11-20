const mongoose = require('mongoose');

const providerRuntimeConfigurationSchema = new mongoose.Schema({
  providerCode: { type: String, enum: ['vnpay'], required: true, unique: true, immutable: true },
  values: { type: mongoose.Schema.Types.Mixed, default: {} },
  encryptedSecrets: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1, min: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.models.ProviderRuntimeConfiguration || mongoose.model('ProviderRuntimeConfiguration', providerRuntimeConfigurationSchema);
