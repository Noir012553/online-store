const mongoose = require('mongoose');

const deploymentAuditSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['status', 'preflight', 'cutover', 'rollback'],
    required: true,
  },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true, maxlength: 160 },
  mode: { type: String, enum: ['tunnel', 'vercel-render'], default: null },
  jobId: { type: String, default: null, maxlength: 64 },
  outcome: { type: String, required: true, maxlength: 40 },
}, { timestamps: { createdAt: true, updatedAt: false } });

deploymentAuditSchema.index({ createdAt: -1 });

deploymentAuditSchema.set('toJSON', {
  transform(_document, returned) {
    delete returned.__v;
    return returned;
  },
});

module.exports = mongoose.models.DeploymentAudit
  || mongoose.model('DeploymentAudit', deploymentAuditSchema);
