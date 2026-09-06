const cloudinary = require('cloudinary').v2;
const AboutMedia = require('../models/AboutMedia');
const {
  ABOUT_MEDIA,
  getCloudinaryDeliveryUrl,
  getCloudinaryVideoPosterUrl,
} = require('../config/aboutMedia');

const REQUIRED_ENVIRONMENT = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const toAssetMetadata = (resource) => ({
  publicId: resource.public_id,
  secureUrl: resource.secure_url,
  format: resource.format,
  width: resource.width,
  height: resource.height,
  bytes: resource.bytes,
  resourceType: resource.resource_type,
});

const verifyAsset = (asset, publicId) => {
  const allowedImageFormats = ['jpeg', 'jpg', 'png', 'webp'];
  const isValid = asset.publicId === publicId
    && asset.resourceType === 'image'
    && Boolean(asset.secureUrl)
    && Number.isFinite(asset.width)
    && asset.width > 0
    && Number.isFinite(asset.height)
    && asset.height > 0
    && Number.isFinite(asset.bytes)
    && asset.bytes > 0
    && allowedImageFormats.includes(String(asset.format).toLowerCase());

  if (!isValid) throw new Error(`Invalid Cloudinary asset: ${publicId}`);
  return asset;
};

const ensureCloudinaryAsset = async ({ sourceUrl, publicId }) => {
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    return verifyAsset(toAssetMetadata(resource), publicId);
  } catch (error) {
    const httpCode = error.http_code ?? error.error?.http_code;
    if (httpCode !== 404) throw error;
  }

  const uploaded = await cloudinary.uploader.upload(sourceUrl, {
    public_id: publicId,
    resource_type: 'image',
    overwrite: false,
    unique_filename: false,
  });
  return verifyAsset(toAssetMetadata(uploaded), publicId);
};

const verifyVideoAsset = (asset, publicId) => {
  const isValid = asset.publicId === publicId
    && asset.resourceType === 'video'
    && Boolean(asset.secureUrl)
    && Number.isFinite(asset.bytes)
    && asset.bytes > 0;

  if (!isValid) throw new Error(`Invalid Cloudinary video asset: ${publicId}`);
  return asset;
};

const ensureCloudinaryVideo = async ({ sourceUrl, publicId }) => {
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: 'video' });
    return verifyVideoAsset(toAssetMetadata(resource), publicId);
  } catch (error) {
    const httpCode = error.http_code ?? error.error?.http_code;
    if (httpCode !== 404) throw error;
  }

  if (!sourceUrl) {
    throw new Error(`Missing ABOUT_HERO_SOURCE for Cloudinary asset: ${publicId}`);
  }

  const uploaded = await cloudinary.uploader.upload(sourceUrl, {
    public_id: publicId,
    resource_type: 'video',
    overwrite: false,
    unique_filename: false,
  });
  return verifyVideoAsset(toAssetMetadata(uploaded), publicId);
};

const seedAboutMedia = async ({ dryRun = false } = {}) => {
  if (dryRun) return [];

  const missingEnvironment = REQUIRED_ENVIRONMENT.filter((key) => !process.env[key]);
  if (missingEnvironment.length) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const teamRecords = await Promise.all(ABOUT_MEDIA.team.map(async (media, sortOrder) => {
    const asset = await ensureCloudinaryAsset(media);
    const widths = [640, 1200];
    const srcSet = widths
      .map((width) => `${getCloudinaryDeliveryUrl(media.publicId, width)} ${width}w`)
      .join(', ');

    return {
      key: media.key,
      kind: 'team',
      publicId: asset.publicId,
      url: asset.secureUrl,
      srcSet,
      sourceUrl: media.sourceUrl,
      sortOrder,
    };
  }));

  const heroAsset = await ensureCloudinaryVideo({
    sourceUrl: process.env.ABOUT_HERO_SOURCE,
    publicId: ABOUT_MEDIA.hero.publicId,
  });
  const heroRecord = {
    key: 'about-hero',
    kind: 'hero',
    publicId: heroAsset.publicId,
    url: heroAsset.secureUrl,
    posterUrl: getCloudinaryVideoPosterUrl(heroAsset.publicId),
    sourceUrl: process.env.ABOUT_HERO_SOURCE || null,
    sortOrder: 0,
  };
  const records = [...teamRecords, heroRecord];

  await AboutMedia.bulkWrite(records.map((record) => ({
    updateOne: {
      filter: { key: record.key },
      update: { $set: record },
      upsert: true,
    },
  })));

  return records;
};

module.exports = seedAboutMedia;
