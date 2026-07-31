const mongoose = require('mongoose');

const CloudinaryAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ['upload', 'replace', 'delete', 'validate_failed', 'attach_failed'],
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      default: 'image',
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    cloudinaryPublicId: {
      type: String,
      default: null,
    },
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CloudinaryUploadClaim',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'cloudinary_audit_logs' }
);

CloudinaryAuditLogSchema.index({ actorId: 1, createdAt: -1 });
CloudinaryAuditLogSchema.index({ cloudinaryPublicId: 1, createdAt: -1 });

module.exports = mongoose.model('CloudinaryAuditLog', CloudinaryAuditLogSchema);
