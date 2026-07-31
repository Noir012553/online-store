const mongoose = require('mongoose');

const TranslationAuditLogSchema = new mongoose.Schema(
  {
    hashKey: {
      type: String,
      required: true,
      index: true,
      description: 'Hash of original text + language for tracking',
    },
    userId: {
      type: String,
      required: true,
      index: true,
      description: 'Admin/User ID who made the change',
    },
    userName: {
      type: String,
      description: 'Admin/User name for readability',
    },
    action: {
      type: String,
      enum: ['manual_override', 'batch_update', 'auto_translate', 'delete'],
      required: true,
      index: true,
      description: 'Type of action performed',
    },
    oldValue: {
      type: String,
      description: 'Previous translation value (null if new)',
    },
    newValue: {
      type: String,
      required: true,
      description: 'New translation value',
    },
    entityId: {
      type: String,
      index: true,
      description: 'Product/Review ID affected (null for system-wide)',
    },
    entityType: {
      type: String,
      enum: [
        'product_name',
        'product_description',
        'product_brand',
        'product_spec',
        'product_feature',
        'category_name',
        'category_description',
        'review',
        'comment',
        'generic'
      ],
      description: 'Type of entity being modified',
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
      description: 'Language code of the translation',
    },
    reason: {
      type: String,
      description: 'Why this change was made (optional, for audit trail)',
    },
    ipAddress: {
      type: String,
      description: 'IP address of the request',
    },
    userAgent: {
      type: String,
      description: 'User agent of the request',
    },
    status: {
      type: String,
      enum: ['success', 'error'],
      default: 'success',
      description: 'Whether the action succeeded',
    },
    errorMessage: {
      type: String,
      description: 'Error message if action failed',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: 'translation_audit_log',
  }
);

// Index for querying audit logs by user
TranslationAuditLogSchema.index({ userId: 1, timestamp: -1 });

// Index for querying audit logs by entity
TranslationAuditLogSchema.index({ entityId: 1, targetLang: 1, timestamp: -1 });

// Index for auditing by action type
TranslationAuditLogSchema.index({ action: 1, timestamp: -1 });

// TTL Index for log retention (optional: keep for 1 year for compliance)
// Comment out if you want to keep logs indefinitely
// TranslationAuditLogSchema.index(
//   { timestamp: 1 },
//   { expireAfterSeconds: 31536000 } // 1 year
// );

// Helper method: Get audit logs for a specific entity
TranslationAuditLogSchema.statics.getEntityAuditLogs = async function(entityId, targetLang, limit = 50) {
  return this.find({
    entityId,
    targetLang,
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

// Helper method: Get audit logs for a specific user
TranslationAuditLogSchema.statics.getUserAuditLogs = async function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

// Helper method: Get audit stats by action type
TranslationAuditLogSchema.statics.getAuditStats = async function(targetLang, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        targetLang,
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        users: { $addToSet: '$userId' }
      }
    }
  ]);
};

// Helper method: Detect anomalies (multiple changes by same user)
TranslationAuditLogSchema.statics.getAnomalies = async function(targetLang, threshold = 50, timeWindowMinutes = 60) {
  const timeWindow = new Date(Date.now() - timeWindowMinutes * 60000);
  
  return this.aggregate([
    {
      $match: {
        targetLang,
        timestamp: { $gte: timeWindow },
        status: 'success'
      }
    },
    {
      $group: {
        _id: '$userId',
        changeCount: { $sum: 1 },
        actions: { $push: '$action' },
        timeRange: { $max: '$timestamp' }
      }
    },
    {
      $match: {
        changeCount: { $gt: threshold }
      }
    }
  ]);
};

module.exports = mongoose.model(
  'TranslationAuditLog',
  TranslationAuditLogSchema
);
