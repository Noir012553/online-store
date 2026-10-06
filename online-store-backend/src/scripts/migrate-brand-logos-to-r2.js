const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const Brand = require('../models/Brand');
const { connectMongo } = require('../config/mongoConnection');
const { getR2StorageStatus, getR2UploadPolicy, uploadAsset } = require('../services/r2AssetService');

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
  .map(entry => {
    const filePath = path.join(directory, entry.name);
    return {
      name: entry.name,
      path: filePath,
      bytes: fs.statSync(filePath).size,
      key: normalizeName(path.basename(entry.name, path.extname(entry.name))),
    };
  });

const groupByKey = (items, getKey) => {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
};

const createLogoPlan = (brands, logoFiles) => {
  const brandsByKey = groupByKey(brands, brand => normalizeName(brand.name));
  const filesByKey = groupByKey(logoFiles, file => file.key);
  const keys = new Set([...brandsByKey.keys(), ...filesByKey.keys()]);
  const matches = [];
  const missingBrands = [];
  const unmatchedFiles = [];
  const ambiguities = [];

  for (const key of keys) {
    const matchingBrands = brandsByKey.get(key) || [];
    const matchingFiles = filesByKey.get(key) || [];

    if (!key || matchingBrands.length > 1 || matchingFiles.length > 1) {
      ambiguities.push({
        key,
        brands: matchingBrands.map(brand => brand.name),
        files: matchingFiles.map(file => file.name),
      });
    } else if (matchingBrands.length === 0) {
      unmatchedFiles.push(matchingFiles[0].name);
    } else if (matchingFiles.length === 0) {
      missingBrands.push(matchingBrands[0].name);
    } else {
      matches.push({ brand: matchingBrands[0], file: matchingFiles[0] });
    }
  }

  return { matches, missingBrands, unmatchedFiles, ambiguities };
};

const getReport = (mode, plan) => ({
  mode,
  matched: plan.matches.map(({ brand, file }) => ({
    brand: brand.name,
    file: file.name,
    action: brand.logoAsset?.storageProvider === 'r2'
      ? 'skip-existing-r2'
      : mode === 'apply' ? 'upload' : 'would-upload',
  })),
  missingBrands: plan.missingBrands,
  unmatchedFiles: plan.unmatchedFiles,
  ambiguities: plan.ambiguities,
});

const applyPlan = async plan => {
  const pending = plan.matches.filter(({ brand }) => brand.logoAsset?.storageProvider !== 'r2');
  if (pending.length === 0) return 0;

  const storageStatus = getR2StorageStatus();
  const uploadPolicy = getR2UploadPolicy();
  const totalBytes = pending.reduce((sum, { file }) => sum + file.bytes, 0);

  if (!storageStatus.configured) throw new Error('R2 account configuration is missing');
  if (!uploadPolicy.enabled) throw new Error('R2_UPLOAD_ENABLED must be true before applying this migration');
  if (pending.length > uploadPolicy.maxAssets || totalBytes > uploadPolicy.maxBytes) {
    throw new Error(`Upload budget is too small for this batch: ${pending.length} files, ${totalBytes} bytes`);
  }

  let uploaded = 0;
  for (const { brand, file } of pending) {
    const asset = await uploadAsset(file.path, {
      role: 'brand',
      stableKey: `brand:${brand._id}`,
      sourceName: file.name,
      sourceUrl: `brand:${brand.name}`,
      storagePrefix: 'brands',
    });

    brand.logo = asset.publicUrl;
    brand.logoAsset = asset;
    await brand.save();
    uploaded += 1;
    console.log(`${brand.name} <- ${file.name}`);
  }

  return uploaded;
};

const migrate = async ({ apply = false } = {}) => {
  const logoDirectory = getLogoDirectory();
  if (!fs.existsSync(logoDirectory)) {
    throw new Error(`Brand logo directory does not exist: ${logoDirectory}`);
  }

  const logoFiles = getLogoFiles(logoDirectory);
  if (logoFiles.length === 0) throw new Error(`No supported logo files found in ${logoDirectory}`);

  await connectMongo();
  try {
    const brands = await Brand.find({ isDeleted: false }).sort({ name: 1 });
    const plan = createLogoPlan(brands, logoFiles);
    const report = getReport(apply ? 'apply' : 'dry-run', plan);
    console.log(JSON.stringify(report, null, 2));

    if (plan.ambiguities.length > 0) {
      throw new Error('Resolve ambiguous brand or file names before applying the migration');
    }

    if (!apply) return;

    report.uploaded = await applyPlan(plan);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter(argument => argument !== '--apply');
  if (unknownArgs.length > 0) {
    console.error(`Unknown arguments: ${unknownArgs.join(', ')}`);
    process.exitCode = 1;
  } else {
    migrate({ apply: args.includes('--apply') }).catch(error => {
      console.error(error.message || String(error));
      process.exitCode = 1;
    });
  }
}

module.exports = { normalizeName, getLogoFiles, createLogoPlan, getReport, migrate };
