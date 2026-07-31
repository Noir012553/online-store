const CloudinaryAuditLog = require('../models/CloudinaryAuditLog');

const writeCloudinaryAudit = async ({
  actorId,
  actorRole,
  action,
  resourceType = 'image',
  resourceId = null,
  cloudinaryPublicId = null,
  claimId = null,
  metadata = {},
}) => {
  if (!actorId || !actorRole || !action) return null;

  return CloudinaryAuditLog.create({
    actorId,
    actorRole,
    action,
    resourceType,
    resourceId,
    cloudinaryPublicId,
    claimId,
    metadata,
  });
};

module.exports = { writeCloudinaryAudit };
