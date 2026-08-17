const mongoose = require('mongoose');

const CloudinaryUploadClaimSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    folder: {
      type: String,
      required: true,
      enum: ['admins', 'users', 'reviewers', 'banners'],
    },
    purpose: {
      type: String,
      required: true,
      enum: ['product', 'banner', 'avatar', 'review'],
    },
    publicId: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['issued', 'validating', 'validated', 'attaching', 'attached', 'expired', 'failed'],
      default: 'issued',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, collection: 'cloudinary_upload_claims' }
);

CloudinaryUploadClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
CloudinaryUploadClaimSchema.index({ ownerId: 1, status: 1, expiresAt: 1 });

CloudinaryUploadClaimSchema.statics.reserve = function ({ claimId, ownerId, publicId, purpose }) {
  return this.findOneAndUpdate(
    {
      _id: claimId,
      ownerId,
      publicId,
      purpose,
      status: 'validated',
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: 'attaching' } },
    { returnDocument: 'after' }
  );
};

CloudinaryUploadClaimSchema.statics.release = function (claimId, ownerId) {
  return this.updateOne(
    { _id: claimId, ownerId, status: 'attaching' },
    { $set: { status: 'validated' } }
  );
};

CloudinaryUploadClaimSchema.statics.attach = function (claimId, ownerId) {
  return this.updateOne(
    { _id: claimId, ownerId, status: 'attaching' },
    { $set: { status: 'attached' } }
  );
};

module.exports = mongoose.model('CloudinaryUploadClaim', CloudinaryUploadClaimSchema);
