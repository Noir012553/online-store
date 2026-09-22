const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const { uploadAsset, deleteR2Asset } = require('../services/r2AssetService');

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_LOGO_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  'online-store-frontend',
  'public',
  'assets',
  'brands',
);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);

const normalizeName = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const getLogoDirectory = () => path.resolve(
  process.env.BRAND_LOGO_DIR || DEFAULT_LOGO_DIRECTORY,
);

const getLogoFiles = directory => fs.readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
  .map(entry => ({
    name: entry.name,
    path: path.join(directory, entry.name),
    key: normalizeName(path.basename(entry.name, path.extname(entry.name))),
  }));

const shouldMigrate = brand => (
  process.env.FORCE_BRAND_LOGO_MIGRATION === 'true'
  || brand.logoAsset?.storageProvider !== 'r2'
);

const migrate = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  const logoDirectory = getLogoDirectory();
  if (!fs.existsSync(logoDirectory)) {
    throw new Error(`Brand logo directory does not exist: ${logoDirectory}`);
  }

  const dryRun = process.env.DRY_RUN === 'true';
  const logoFiles = getLogoFiles(logoDirectory);
  const logosByKey = new Map(logoFiles.map(file => [file.key, file]));
  const brands = await Brand.find({ isDeleted: false }).sort({ name: 1 });
  const summary = { migrated: 0, skipped: 0, missing: [] };

  for (const brand of brands) {
    const logoFile = logosByKey.get(normalizeName(brand.name));
    if (!logoFile) {
      summary.missing.push(brand.name);
      continue;
    }
    if (!shouldMigrate(brand)) {
      summary.skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY_RUN] ${brand.name} <- ${logoFile.name}`);
      continue;
    }

    const previousAsset = brand.logoAsset?.toObject
      ? brand.logoAsset.toObject()
      : brand.logoAsset;
    const asset = await uploadAsset(logoFile.path, {
      role: 'brand',
      stableKey: `brand:${brand._id}`,
      sourceName: logoFile.name,
      sourceUrl: `brand:${brand.name}`,
      storagePrefix: 'brands',
    });

    brand.logo = asset.publicUrl;
    brand.logoAsset = asset;
    await brand.save();

    if (
      previousAsset?.storageProvider === 'r2'
      && previousAsset.storageKey
      && previousAsset.storageKey !== asset.storageKey
    ) {
      await deleteR2Asset(previousAsset);
    }

    summary.migrated += 1;
    console.log(`${brand.name} -> ${asset.publicUrl}`);
  }

  console.table(summary);
  if (summary.missing.length) {
    console.warn(`Missing logo files: ${summary.missing.join(', ')}`);
  }
};

migrate()
  .catch(error => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
