require('dotenv').config();

const mongoose = require('mongoose');
const Product = require('../models/Product');
const { isCloudinaryUrl } = require('../services/cloudinaryService');

const collectProductAssets = product => {
  const assets = [];
  const add = (role, url, index = null, metadata = null) => {
    if (!isCloudinaryUrl(url)) return;
    assets.push({
      recordType: 'Product',
      recordId: String(product._id),
      role,
      index,
      url,
      publicId: metadata?.publicId || product.imagePublicId || null,
      accountId: metadata?.cloudinaryAccountId || null,
    });
  };

  add('main', product.image, null, product.imageAsset);
  (product.images || []).forEach((url, index) => add('gallery', url, index, product.imageAssets?.[index]));
  (product.descriptionImages || []).forEach((image, index) => add('description', image?.url, index, image));
  return assets;
};

const main = async () => {
  if (process.argv.includes('--apply') || process.argv.includes('--delete')) {
    throw new Error('This skeleton is inventory-only. Copy, verify, database update, and deletion require a separately reviewed migration pass.');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

  await mongoose.connect(process.env.MONGO_URI);
  const products = await Product.find({ isDeleted: false })
    .select('_id image imagePublicId images imagePublicIds imageAsset imageAssets descriptionImages')
    .lean();
  const assets = products.flatMap(collectProductAssets);
  process.stdout.write(`${JSON.stringify({
    migration: 'cloudinary-to-r2',
    mode: 'inventory-only',
    destructiveActions: false,
    generatedAt: new Date().toISOString(),
    productCount: products.length,
    cloudinaryAssetCount: assets.length,
    assets,
  }, null, 2)}\n`);
};

main()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
