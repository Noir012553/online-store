const mongoose = require('mongoose');

const providerRuntimeAuditSchema = new mongoose.Schema(
  {
    providerCode: { type: String, required: true },
    action: { type: String, enum: ['reveal'], required: true },
    changedFields: { type: [String], default: [] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

providerRuntimeAuditSchema.index({ providerCode: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('ProviderRuntimeAudit', providerRuntimeAuditSchema);
