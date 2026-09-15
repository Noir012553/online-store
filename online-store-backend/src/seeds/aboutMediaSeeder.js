const fs = require('fs');
const path = require('path');
const AboutMedia = require('../models/AboutMedia');
const { uploadAsset } = require('../services/r2AssetService');
const { ABOUT_MEDIA } = require('../config/aboutMedia');

const FRONTEND_PUBLIC_DIR = path.resolve(__dirname, '../../../online-store-frontend/public');
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

const getLocalTeamSource = key => path.join(FRONTEND_PUBLIC_DIR, 'images', 'team', `${key}.jpg`);
const getLocalHeroSource = () => path.join(FRONTEND_PUBLIC_DIR, 'assets', 'videos', 'about-hero.mp4');
const getLocalLoadingSource = () => path.join(FRONTEND_PUBLIC_DIR, 'animations', 'loading.svg');
const resolveMediaSource = (preferredSource, localSource) => fs.existsSync(localSource) ? localSource : preferredSource;
const getErrorMessage = error => error?.message || String(error || 'Unknown R2 error');

const toRecordAsset = asset => ({
  publicId: asset.storageKey,
  url: asset.publicUrl,
  sourceUrl: asset.sourceUrl,
  storageProvider: asset.storageProvider,
  storageAccount: asset.storageAccount,
  bucket: asset.bucket,
  storageKey: asset.storageKey,
  publicUrl: asset.publicUrl,
  contentHash: asset.contentHash,
  mimeType: asset.mimeType,
  bytes: asset.bytes,
  asset,
});

const ensureAsset = async ({ source, role, stableKey, mimeType }) => uploadAsset(source, {
  role,
  stableKey,
  sourceName: typeof source === 'string' ? source : stableKey,
  storagePrefix: `about/${role}/${stableKey}`,
  ...(mimeType ? { mimeType } : {}),
});

const seedAboutReviewers = async ({ dryRun = false } = {}) => {
  if (dryRun) return [];
  return Promise.all(ABOUT_MEDIA.reviewers.map((reviewer, index) => ensureAsset({
    source: REVIEWER_SOURCES[index],
    role: 'about-reviewer',
    stableKey: reviewer.key,
  })));
};

const seedLoadingMedia = async ({ dryRun = false, requireSource = false } = {}) => {
  if (dryRun) return null;
  const sourcePath = getLocalLoadingSource();
  if (!fs.existsSync(sourcePath)) {
    if (requireSource) throw new Error(`Missing loading asset: ${sourcePath}`);
    return null;
  }

  const asset = await ensureAsset({
    source: sourcePath,
    role: 'about-loading',
    stableKey: 'global-loading',
    mimeType: 'image/svg+xml',
  });
  const record = {
    key: 'global-loading',
    kind: 'loading',
    ...toRecordAsset(asset),
    sourceUrl: '/animations/loading.svg',
    sortOrder: 0,
  };

  await AboutMedia.updateOne({ key: record.key }, { $set: record }, { upsert: true });
  return record;
};

const seedAboutMedia = async ({ dryRun = false } = {}) => {
  if (dryRun) return [];

  const teamRecords = [];
  for (const [sortOrder, media] of ABOUT_MEDIA.team.entries()) {
    try {
      const source = resolveMediaSource(media.sourceUrl, getLocalTeamSource(media.key));
      const asset = await ensureAsset({ source, role: 'about-team', stableKey: media.key });
      const recordAsset = toRecordAsset(asset);
      teamRecords.push({
        key: media.key,
        kind: 'team',
        ...recordAsset,
        srcSet: `${asset.publicUrl} 640w, ${asset.publicUrl} 1200w`,
        sourceUrl: media.sourceUrl,
        sortOrder,
      });
    } catch (error) {
      throw new Error(`About media ${media.key} failed: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  let heroAsset;
  try {
    const source = resolveMediaSource(process.env.ABOUT_HERO_SOURCE, getLocalHeroSource());
    if (!source) throw new Error('ABOUT_HERO_SOURCE is required when the local hero video is missing');
    heroAsset = await ensureAsset({ source, role: 'about-hero', stableKey: 'about-hero' });
  } catch (error) {
    throw new Error(`About hero media failed: ${getErrorMessage(error)}`, { cause: error });
  }

  const heroRecord = {
    key: 'about-hero',
    kind: 'hero',
    ...toRecordAsset(heroAsset),
    posterUrl: null,
    sourceUrl: process.env.ABOUT_HERO_SOURCE || null,
    sortOrder: 0,
  };
  const loadingRecord = await seedLoadingMedia({ dryRun });
  const records = [...teamRecords, heroRecord, ...(loadingRecord ? [loadingRecord] : [])];

  await AboutMedia.bulkWrite(records.map(record => ({
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
module.exports.seedAboutReviewers = seedAboutReviewers;
