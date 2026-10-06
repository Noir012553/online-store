require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongoConnection');
const { getReportTimestamp } = require('../utils/reportFilename');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

async function main() {
  const args = process.argv.slice(2);
  const environment = parseArg(args, 'environment');
  const productIds = (parseArg(args, 'product-ids', '') || '').split(',').map(id => id.trim()).filter(Boolean);
  const sourceProfile = parseArg(args, 'source-profile', 'legacy-source');
  const outputDir = parseArg(args, 'output-dir', path.resolve(__dirname, '../../reports/cleanup'));
  const runId = getReportTimestamp();

  if (!['development', 'staging'].includes(environment)) {
    throw new Error('CLEANUP_ENVIRONMENT_INVALID: use --environment=development or --environment=staging');
  }
  if (productIds.length === 0 || productIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
    throw new Error('CLEANUP_PRODUCT_IDS_REQUIRED: provide evidence-backed Mongo IDs with --product-ids=id1,id2');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  await connectMongo();
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const foundIds = products.map(product => product._id.toString());
  const missingIds = productIds.filter(id => !foundIds.includes(id));
  const productObjectIds = products.map(product => product._id);
  const [reviewCount, orderCount, coupons, translationCacheCount] = await Promise.all([
    Review.countDocuments({ product: { $in: productObjectIds } }),
    Order.countDocuments({ 'orderItems.product': { $in: productObjectIds } }),
    Coupon.find({ applicableProducts: { $in: productObjectIds } }).select('_id code applicableProducts').lean(),
    ProductCatalogTranslationCache.countDocuments({ entityId: { $in: foundIds } }),
  ]);

  const productInventory = {
    environment,
    generatedAt: new Date().toISOString(),
    runId,
    sourceProfile,
    productIds: foundIds,
    productCount: products.length,
    missingIds,
    evidence: products.map(product => ({
      _id: product._id.toString(),
      name: product.name,
      brand: product.brand,
      image: product.image,
      images: product.images || [],
      imagePublicId: product.imagePublicId || null,
      imagePublicIds: product.imagePublicIds || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      reason: 'Explicit product ID supplied from operator-reviewed evidence',
    })),
    ambiguous: [],
    approvalRequired: true,
    approved: false,
  };
  const r2Assets = products.flatMap(product => [
    product.imageAsset,
    ...(Array.isArray(product.imageAssets) ? product.imageAssets : []),
    ...(Array.isArray(product.descriptionImages) ? product.descriptionImages : []),
  ]).filter(asset => asset?.storageProvider === 'r2' && asset.storageKey);
  const r2Inventory = {
    environment,
    generatedAt: productInventory.generatedAt,
    runId,
    sourceProfile,
    assets: [...new Map(r2Assets.map(asset => [
      `${asset.storageAccount}:${asset.bucket}:${asset.storageKey}`,
      asset,
    ])).values()],
    productIds: foundIds,
    approvalRequired: true,
    approved: false,
  };
  const report = {
    environment,
    runId,
    profile: `${sourceProfile}-reset`,
    dryRun: true,
    confirmationRequired: true,
    productTargetCount: products.length,
    productDeletedCount: 0,
    r2AssetTargetCount: r2Inventory.assets.length,
    r2AssetDeletedCount: 0,
    r2AssetFailedCount: 0,
    dependentReviewCount: reviewCount,
    dependentCouponCount: coupons.length,
    dependentOrderCount: orderCount,
    translationCacheCount,
    ambiguousProductCount: 0,
    missingProductCount: missingIds.length,
    errors: [],
    verified: false,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, `product-cleanup-inventory-${runId}.json`), JSON.stringify(productInventory, null, 2)),
    fs.writeFile(path.join(outputDir, `r2-cleanup-inventory-${runId}.json`), JSON.stringify(r2Inventory, null, 2)),
    fs.writeFile(path.join(outputDir, `cleanup-report-${runId}.json`), JSON.stringify(report, null, 2)),
  ]);
  console.log(JSON.stringify({ success: true, outputDir, report }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
