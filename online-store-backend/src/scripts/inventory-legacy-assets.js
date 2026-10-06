const mongoose = require('mongoose');
const Product = require('../models/Product');
const { Banner } = require('../models/Banner');
const Review = require('../models/Review');
const User = require('../models/User');
const AboutMedia = require('../models/AboutMedia');

const isLegacyCloudinaryUrl = value => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'res.cloudinary.com' || hostname.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
};

const collectUrlAsset = (assets, { recordType, recordId, fieldPath, role, url, metadata = null }) => {
  if (!isLegacyCloudinaryUrl(url)) return;
  assets.push({
    recordType,
    recordId: String(recordId),
    fieldPath,
    role,
    url,
    legacyPublicId: metadata?.publicId || metadata?.public_id || null,
    legacyAccountId: metadata?.cloudinaryAccountId || null,
    target: {
      storageProvider: 'r2',
      storageAccount: null,
      bucket: null,
      storageKey: null,
      publicUrl: null,
      contentHash: null,
      status: 'pending',
    },
  });
};

const collectProductAssets = product => {
  const assets = [];
  collectUrlAsset(assets, {
    recordType: 'Product',
    recordId: product._id,
    fieldPath: 'image',
    role: 'main',
    url: product.image,
    metadata: product.imageAsset,
  });
  (product.images || []).forEach((url, index) => collectUrlAsset(assets, {
    recordType: 'Product',
    recordId: product._id,
    fieldPath: `images.${index}`,
    role: 'gallery',
    url,
    metadata: product.imageAssets?.[index],
  }));
  (product.descriptionImages || []).forEach((image, index) => collectUrlAsset(assets, {
    recordType: 'Product',
    recordId: product._id,
    fieldPath: `descriptionImages.${index}.url`,
    role: 'description',
    url: image?.url,
    metadata: image,
  }));
  return assets;
};

const collectEntityImage = (entity, recordType, urlField, assetField, role) => {
  const assets = [];
  collectUrlAsset(assets, {
    recordType,
    recordId: entity._id,
    fieldPath: urlField,
    role,
    url: entity[urlField],
    metadata: entity[assetField],
  });
  return assets;
};

const main = async () => {
  if (process.argv.includes('--apply') || process.argv.includes('--delete')) {
    throw new Error('This command is inventory-only. R2 migration and legacy cleanup require a separately reviewed manifest workflow.');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  await mongoose.connect(process.env.MONGO_URI);
  const [products, banners, reviews, users, aboutMedia] = await Promise.all([
    Product.find({}).select('_id image images imageAsset imageAssets descriptionImages').lean(),
    Banner.find({}).select('_id image imageAsset').lean(),
    Review.find({}).select('_id avatar avatarAsset').lean(),
    User.find({}).select('_id profileImage profileImageAsset').lean(),
    AboutMedia.find({}).select('_id kind url posterUrl asset').lean(),
  ]);

  const assets = [
    ...products.flatMap(collectProductAssets),
    ...banners.flatMap(entity => collectEntityImage(entity, 'Banner', 'image', 'imageAsset', 'banner')),
    ...reviews.flatMap(entity => collectEntityImage(entity, 'Review', 'avatar', 'avatarAsset', 'review')),
    ...users.flatMap(entity => collectEntityImage(entity, 'User', 'profileImage', 'profileImageAsset', 'avatar')),
    ...aboutMedia.flatMap(entity => [
      ...collectEntityImage(entity, 'AboutMedia', 'url', 'asset', entity.kind || 'about'),
      ...collectEntityImage(entity, 'AboutMedia', 'posterUrl', 'asset', 'poster'),
    ]),
  ];

  process.stdout.write(`${JSON.stringify({
    migration: 'legacy-assets-to-r2',
    mode: 'inventory-only',
    destructiveActions: false,
    generatedAt: new Date().toISOString(),
    recordCounts: {
      Product: products.length,
      Banner: banners.length,
      Review: reviews.length,
      User: users.length,
      AboutMedia: aboutMedia.length,
    },
    legacyAssetCount: assets.length,
    assets,
  }, null, 2)}\n`);
};

main()
  .catch(error => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
