require('dotenv').config();

const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Review = require('../models/Review');
const { ABOUT_MEDIA } = require('../config/aboutMedia');

const TEAM_SOURCES = [
  'https://manln.online/images/team/team-1.jpg',
  'https://manln.online/images/team/team-2.jpg',
  'https://manln.online/images/team/team-3.jpg',
  'https://manln.online/images/team/team-4.jpg',
];

const REVIEWER_SOURCES = [
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
];

const requiredEnvironment = ['MONGO_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const toAssetMetadata = (resource) => ({
  publicId: resource.public_id,
  secureUrl: resource.secure_url,
  format: resource.format,
  width: resource.width,
  height: resource.height,
  bytes: resource.bytes,
  resourceType: resource.resource_type,
});

const verifyAsset = (asset, publicId, resourceType) => {
  const allowedImageFormats = ['jpeg', 'jpg', 'png', 'webp'];
  const hasValidDimensions = Number.isFinite(asset.width)
    && Number.isFinite(asset.height)
    && asset.width > 0
    && asset.height > 0;
  const hasValidBytes = Number.isFinite(asset.bytes) && asset.bytes > 0;
  const hasValidFormat = resourceType !== 'image'
    || allowedImageFormats.includes(String(asset.format).toLowerCase());

  if (asset.publicId !== publicId || asset.resourceType !== resourceType
    || !asset.secureUrl || !hasValidDimensions || !hasValidBytes || !hasValidFormat) {
    throw new Error(`Invalid Cloudinary asset: ${publicId}`);
  }

  return asset;
};

const getExistingAsset = async (publicId, resourceType) => {
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
    return verifyAsset(toAssetMetadata(resource), publicId, resourceType);
  } catch (error) {
    const httpCode = error.http_code ?? error.error?.http_code;
    if (httpCode === 404) return null;
    throw error;
  }
};

const uploadAsset = async (source, publicId, resourceType = 'image') => {
  const existingAsset = await getExistingAsset(publicId, resourceType);
  if (existingAsset) return existingAsset;

  const result = await cloudinary.uploader.upload(source, {
    public_id: publicId,
    resource_type: resourceType,
    overwrite: false,
    unique_filename: false,
  });

  return verifyAsset(toAssetMetadata(result), publicId, resourceType);
};

const migrateImages = async () => {
  const teamAssets = await Promise.all(
    ABOUT_MEDIA.team.map((asset, index) => uploadAsset(TEAM_SOURCES[index], asset.publicId))
  );
  const reviewerAssets = await Promise.all(
    ABOUT_MEDIA.reviewers.map((asset, index) => uploadAsset(REVIEWER_SOURCES[index], asset.publicId))
  );

  const reviewerUpdates = await Promise.all(
    ABOUT_MEDIA.reviewers.map((reviewer, index) => Review.updateMany(
      {
        $or: [
          { avatarPublicId: reviewer.publicId },
          { avatar: REVIEWER_SOURCES[index] },
          { name: reviewer.name },
        ],
      },
      { $set: { avatar: reviewerAssets[index].secureUrl, avatarPublicId: reviewerAssets[index].publicId } }
    ))
  );

  const missingReviewers = reviewerUpdates
    .map((result, index) => result.matchedCount === 0 ? ABOUT_MEDIA.reviewers[index].key : null)
    .filter(Boolean);
  if (missingReviewers.length) {
    throw new Error(`No review records found for: ${missingReviewers.join(', ')}`);
  }

  console.table([...teamAssets, ...reviewerAssets]);
};

const migrateOptionalVideo = async () => {
  const heroSource = process.env.ABOUT_HERO_SOURCE;
  if (!heroSource) return;

  const heroAsset = await uploadAsset(heroSource, ABOUT_MEDIA.hero.publicId, 'video');
  console.table([heroAsset]);
};

const main = async () => {
  const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
  if (missingEnvironment.length) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  await mongoose.connect(process.env.MONGO_URI);
  await migrateImages();
  await migrateOptionalVideo();
};

main()
  .catch((error) => {
    console.error(error.message || error.error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
