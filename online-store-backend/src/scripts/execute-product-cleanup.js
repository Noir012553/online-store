require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongoConnection');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { deleteMultipleFromCloudinary } = require('../services/cloudinaryService');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  const environment = parseArg(args, 'environment');
  const inventoryDir = path.resolve(parseArg(args, 'inventory-dir', './product-cleanup-inventory'));
  const confirmation = parseArg(args, 'confirm');
  const orderPolicy = parseArg(args, 'orders');

  if (!['development', 'staging'].includes(environment)) {
    throw new Error('CLEANUP_ENVIRONMENT_INVALID: production cleanup requires a separate approved process');
  }
  if (confirmation !== 'DELETE_APPROVED_PRODUCT_CLEANUP') {
    throw new Error('CLEANUP_CONFIRMATION_REQUIRED: pass --confirm=DELETE_APPROVED_PRODUCT_CLEANUP');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  const productInventory = await readJson(path.join(inventoryDir, 'product-cleanup-inventory.json'));
  const cloudinaryInventory = await readJson(path.join(inventoryDir, 'cloudinary-cleanup-inventory.json'));
  const previewReport = await readJson(path.join(inventoryDir, 'cleanup-report.json'));
  const productIds = productInventory.productIds || [];

  if (productInventory.environment !== environment || cloudinaryInventory.environment !== environment) {
    throw new Error('CLEANUP_MANIFEST_ENVIRONMENT_MISMATCH');
  }
  if (productInventory.approved !== true || cloudinaryInventory.approved !== true) {
    throw new Error('CLEANUP_MANIFEST_APPROVAL_REQUIRED: review both manifests and set approved=true');
  }
  if (productInventory.ambiguous?.length > 0 || productInventory.missingIds?.length > 0) {
    throw new Error('CLEANUP_MANIFEST_INCOMPLETE');
  }
  if (previewReport.dependentOrderCount > 0 && orderPolicy !== 'keep') {
    throw new Error('CLEANUP_ORDER_POLICY_REQUIRED: pass --orders=keep to preserve order history');
  }
  if (productIds.length === 0) throw new Error('CLEANUP_EMPTY_MANIFEST');

  await connectMongo();
  const cloudinaryResult = await deleteMultipleFromCloudinary(cloudinaryInventory.publicIds || []);
  if (cloudinaryResult.failed > 0) {
    const failedReport = {
      ...previewReport,
      dryRun: false,
      cloudinaryDeletedCount: cloudinaryResult.deleted,
      cloudinaryFailedCount: cloudinaryResult.failed,
      errors: cloudinaryResult.errors,
      verified: false,
    };
    await fs.writeFile(path.join(inventoryDir, 'cleanup-report.json'), JSON.stringify(failedReport, null, 2));
    throw new Error('CLEANUP_CLOUDINARY_DELETE_FAILED: database was left unchanged');
  }

  const objectIds = productIds.map(id => new mongoose.Types.ObjectId(id));
  const [reviews, coupons, translationCache] = await Promise.all([
    Review.deleteMany({ product: { $in: objectIds } }),
    Coupon.updateMany(
      { applicableProducts: { $in: objectIds } },
      { $pull: { applicableProducts: { $in: objectIds } } }
    ),
    ProductCatalogTranslationCache.deleteMany({ entityId: { $in: productIds } }),
  ]);
  const productCleanup = orderPolicy === 'keep'
    ? await Product.updateMany(
      { _id: { $in: objectIds } },
      { $set: { isDeleted: true } }
    )
    : await Product.deleteMany({ _id: { $in: objectIds } });
  const remainingProducts = await Product.countDocuments({ _id: { $in: objectIds }, isDeleted: false });
  const remainingReviews = await Review.countDocuments({ product: { $in: objectIds } });
  const remainingCoupons = await Coupon.countDocuments({ applicableProducts: { $in: objectIds } });
  const report = {
    ...previewReport,
    dryRun: false,
    confirmationRequired: true,
    productDeletedCount: orderPolicy === 'keep' ? 0 : productCleanup.deletedCount,
    productArchivedCount: orderPolicy === 'keep' ? productCleanup.modifiedCount : 0,
    productCleanupMode: orderPolicy === 'keep' ? 'soft_delete' : 'hard_delete',
    cloudinaryDeletedCount: cloudinaryResult.deleted,
    cloudinaryFailedCount: 0,
    dependentReviewCount: reviews.deletedCount,
    dependentCouponCount: coupons.modifiedCount,
    translationCacheCount: translationCache.deletedCount,
    orderPolicy: orderPolicy || null,
    verified: remainingProducts === 0 && remainingReviews === 0 && remainingCoupons === 0,
    verification: {
      remainingActiveProducts: remainingProducts,
      remainingReviews,
      remainingCoupons,
      preservedOrderReferences: orderPolicy === 'keep' ? previewReport.dependentOrderCount : 0,
    },
    errors: [],
  };

  await fs.writeFile(path.join(inventoryDir, 'cleanup-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: report.verified, report }, null, 2));
  await mongoose.disconnect();
  if (!report.verified) process.exitCode = 1;
}

main().catch(async error => {
  console.error(error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
