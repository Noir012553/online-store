const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const AboutMedia = require('../models/AboutMedia');
const {
  getCloudinaryResource,
  uploadFileToCloudinary,
  uploadVideoFileToCloudinary,
} = require('../services/cloudinaryService');
const {
  ABOUT_MEDIA,
  getCloudinaryDeliveryUrl,
  getCloudinaryVideoPosterUrl,
} = require('../config/aboutMedia');

const FRONTEND_PUBLIC_DIR = path.resolve(__dirname, '../../../online-store-frontend/public');

const getLocalTeamSource = (key) => path.join(
  FRONTEND_PUBLIC_DIR,
  'images',
  'team',
  `${key}.jpg`,
);

const getLocalHeroSource = () => path.join(
  FRONTEND_PUBLIC_DIR,
  'assets',
  'videos',
  'about-hero.mp4',
);

const getLocalLoadingSource = () => path.join(
  FRONTEND_PUBLIC_DIR,
  'animations',
  'loading.svg',
);

const resolveMediaSource = (preferredSource, localSource) => (
  fs.existsSync(localSource) ? localSource : preferredSource
);

const getErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  return error?.message
    || error?.error?.message
    || (error ? JSON.stringify(error) : null)
    || 'Unknown Cloudinary error';
};

const toAssetMetadata = (resource) => ({
  publicId: resource.public_id,
  secureUrl: resource.secure_url,
  format: resource.format,
  width: resource.width,
  height: resource.height,
  bytes: resource.bytes,
  resourceType: resource.resource_type,
  cloudinaryAccountId: resource.cloudinaryAccountId,
  cloudName: resource.cloudName,
});

const toServiceAssetMetadata = (resource, resourceType) => ({
  publicId: resource.publicId,
  secureUrl: resource.url,
  format: resource.format,
  width: resource.width,
  height: resource.height,
  bytes: resource.bytes,
  resourceType: resource.resourceType || resourceType,
  cloudinaryAccountId: resource.cloudinaryAccountId,
  cloudName: resource.cloudName,
});

const verifyAsset = (asset, publicId, { allowSvg = false } = {}) => {
  const allowedImageFormats = allowSvg
    ? ['jpeg', 'jpg', 'png', 'webp', 'svg']
    : ['jpeg', 'jpg', 'png', 'webp'];
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

const ensureCloudinaryAsset = async ({ sourceUrl, publicId, folder = 'about', allowSvg = false }) => {
  try {
    const resource = await getCloudinaryResource(publicId, null, 'image');
    return verifyAsset(toAssetMetadata(resource), publicId, { allowSvg });
  } catch (error) {
    const httpCode = error?.http_code ?? error?.error?.http_code;
    if (httpCode !== 404) {
      throw new Error(`Cloudinary lookup failed for ${publicId}: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  try {
    const uploaded = await uploadFileToCloudinary(sourceUrl, folder, publicId, { allowSvg });
    return verifyAsset(toServiceAssetMetadata(uploaded, 'image'), publicId, { allowSvg });
  } catch (error) {
    throw new Error(`Cloudinary upload failed for ${publicId} from ${sourceUrl}: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
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
    const resource = await getCloudinaryResource(publicId, null, 'video');
    return verifyVideoAsset(toAssetMetadata(resource), publicId);
  } catch (error) {
    const httpCode = error?.http_code ?? error?.error?.http_code;
    if (httpCode !== 404) {
      throw new Error(`Cloudinary lookup failed for ${publicId}: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  if (!sourceUrl) {
    throw new Error(`Missing ABOUT_HERO_SOURCE for Cloudinary asset: ${publicId}`);
  }

  try {
    const uploaded = await uploadVideoFileToCloudinary(sourceUrl, publicId);
    return verifyVideoAsset(toServiceAssetMetadata(uploaded, 'video'), publicId);
  } catch (error) {
    throw new Error(`Cloudinary video upload failed for ${publicId} from ${sourceUrl}: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
};

const seedLoadingMedia = async ({ dryRun = false, requireSource = false } = {}) => {
  if (dryRun) return null;

  const sourcePath = getLocalLoadingSource();
  if (!fs.existsSync(sourcePath)) {
    if (requireSource) {
      throw new Error(`Missing loading asset: ${sourcePath}`);
    }
    return null;
  }

  const media = ABOUT_MEDIA.loading;
  const asset = await ensureCloudinaryAsset({
    sourceUrl: sourcePath,
    publicId: media.publicId,
    folder: 'ui',
    allowSvg: true,
  });
  const record = {
    key: 'global-loading',
    kind: 'loading',
    publicId: asset.publicId,
    url: asset.secureUrl,
    sourceUrl: '/animations/loading.svg',
    sortOrder: 0,
    cloudinaryAccountId: asset.cloudinaryAccountId || '1',
    cloudName: asset.cloudName || process.env.CLOUDINARY_CLOUD_NAME,
  };

  await AboutMedia.updateOne(
    { key: record.key },
    { $set: record },
    { upsert: true },
  );

  return record;
};

const seedAboutMedia = async ({ dryRun = false } = {}) => {
  if (dryRun) return [];

  const teamRecords = [];
  for (const [sortOrder, media] of ABOUT_MEDIA.team.entries()) {
    try {
      const asset = await ensureCloudinaryAsset({
        ...media,
        sourceUrl: resolveMediaSource(media.sourceUrl, getLocalTeamSource(media.key)),
      });
      const widths = [640, 1200];
      const srcSet = widths
        .map((width) => `${getCloudinaryDeliveryUrl(media.publicId, width, asset.cloudName)} ${width}w`)
        .join(', ');

      teamRecords.push({
        key: media.key,
        kind: 'team',
        publicId: asset.publicId,
        url: asset.secureUrl,
        srcSet,
        sourceUrl: media.sourceUrl,
        sortOrder,
        cloudinaryAccountId: asset.cloudinaryAccountId || '1',
        cloudName: asset.cloudName || process.env.CLOUDINARY_CLOUD_NAME,
      });
    } catch (error) {
      throw new Error(`About media ${media.key} failed: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  let heroAsset;
  try {
    heroAsset = await ensureCloudinaryVideo({
      sourceUrl: resolveMediaSource(process.env.ABOUT_HERO_SOURCE, getLocalHeroSource()),
      publicId: ABOUT_MEDIA.hero.publicId,
    });
  } catch (error) {
    throw new Error(`About hero media failed: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
  const heroRecord = {
    key: 'about-hero',
    kind: 'hero',
    publicId: heroAsset.publicId,
    url: heroAsset.secureUrl,
    posterUrl: getCloudinaryVideoPosterUrl(heroAsset.publicId, heroAsset.cloudName),
    sourceUrl: process.env.ABOUT_HERO_SOURCE || null,
    sortOrder: 0,
    cloudinaryAccountId: heroAsset.cloudinaryAccountId || '1',
    cloudName: heroAsset.cloudName || process.env.CLOUDINARY_CLOUD_NAME,
  };
  const loadingRecord = await seedLoadingMedia({ dryRun });
  const records = [...teamRecords, heroRecord, ...(loadingRecord ? [loadingRecord] : [])];

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
module.exports.seedLoadingMedia = seedLoadingMedia;
