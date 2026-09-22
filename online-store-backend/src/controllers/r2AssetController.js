const asyncHandler = require('express-async-handler');
const { uploadAsset } = require('../services/r2AssetService');

const FOLDERS_BY_ROLE = {
  user: ['users', 'reviewers'],
  admin: ['admins', 'users', 'reviewers', 'banners', 'brands'],
  'super-admin': ['admins', 'users', 'reviewers', 'banners', 'brands'],
};

const ROLE_BY_FOLDER = {
  admins: 'product',
  users: 'avatar',
  reviewers: 'review',
  banners: 'banner',
  brands: 'brand',
};

const uploadR2Asset = asyncHandler(async (req, res) => {
  const folder = String(req.body.folder || 'users').trim().toLowerCase();
  const allowedFolders = FOLDERS_BY_ROLE[req.user.role] || [];
  if (!allowedFolders.includes(folder)) {
    res.status(400);
    throw new Error('Upload folder is not allowed for this account');
  }
  if (!req.file) {
    res.status(400);
    throw new Error('An image file is required');
  }

  const asset = await uploadAsset(req.file.buffer, {
    role: ROLE_BY_FOLDER[folder],
    stableKey: `${req.user._id}:${folder}:${req.file.originalname}`,
    sourceName: req.file.originalname,
    mimeType: req.file.mimetype,
    storagePrefix: `incoming/${folder}/${req.user._id}`,
  });

  res.status(201).json({
    success: true,
    asset: {
      ...asset,
      url: asset.publicUrl,
    },
  });
});

module.exports = { uploadR2Asset };
