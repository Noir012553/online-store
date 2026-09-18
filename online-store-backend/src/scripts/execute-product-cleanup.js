require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongoConnection');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { deleteR2Assets } = require('../services/r2AssetService');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const resolveCleanupRun = async (inventoryDir, requestedRunId) => {
  const entries = await fs.readdir(inventoryDir);
  const runIds = entries
    .filter(name => name.startsWith('product-cleanup-inventory-') && name.endsWith('.json'))
    .map(name => name.slice('product-cleanup-inventory-'.length, -'.json'.length))
    .filter(runId => entries.includes(`r2-cleanup-inventory-${runId}.json`)
      && entries.includes(`cleanup-report-${runId}.json`));
  const runId = requestedRunId || runIds.sort().pop();
  if (!runId || !runIds.includes(runId)) throw new Error('CLEANUP_REPORT_RUN_NOT_FOUND');
  return {
    runId,
    productInventoryPath: path.join(inventoryDir, `product-cleanup-inventory-${runId}.json`),
    r2InventoryPath: path.join(inventoryDir, `r2-cleanup-inventory-${runId}.json`),
    reportPath: path.join(inventoryDir, `cleanup-report-${runId}.json`),
  };
};

async function main() {
  const args = process.argv.slice(2);
  const environment = parseArg(args, 'environment');
  const inventoryDir = path.resolve(parseArg(args, 'inventory-dir', path.join(__dirname, '../../reports/cleanup')));
  const requestedRunId = parseArg(args, 'run-id');
  const confirmation = parseArg(args, 'confirm');
  const orderPolicy = parseArg(args, 'orders');

  if (!['development', 'staging'].includes(environment)) {
    throw new Error('CLEANUP_ENVIRONMENT_INVALID: production cleanup requires a separate approved process');
  }
  if (confirmation !== 'DELETE_APPROVED_PRODUCT_CLEANUP') {
    throw new Error('CLEANUP_CONFIRMATION_REQUIRED: pass --confirm=DELETE_APPROVED_PRODUCT_CLEANUP');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  const cleanupRun = await resolveCleanupRun(inventoryDir, requestedRunId);
  const productInventory = await readJson(cleanupRun.productInventoryPath);
  const r2Inventory = await readJson(cleanupRun.r2InventoryPath);
  const previewReport = await readJson(cleanupRun.reportPath);
  const productIds = productInventory.productIds || [];

  if (productInventory.runId !== cleanupRun.runId
    || r2Inventory.runId !== cleanupRun.runId
    || previewReport.runId !== cleanupRun.runId) {
    throw new Error('CLEANUP_MANIFEST_RUN_MISMATCH');
  }
  if (productInventory.environment !== environment || r2Inventory.environment !== environment) {
    throw new Error('CLEANUP_MANIFEST_ENVIRONMENT_MISMATCH');
  }
  if (productInventory.approved !== true || r2Inventory.approved !== true) {
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
  const r2Result = await deleteR2Assets(r2Inventory.assets || []);
  const r2Failed = r2Result.filter(result => result.deleted !== true).length;
  if (r2Failed > 0) {
    const failedReport = {
      ...previewReport,
      dryRun: false,
      r2AssetDeletedCount: r2Result.length - r2Failed,
      r2AssetFailedCount: r2Failed,
      errors: r2Result.filter(result => result.deleted !== true),
      verified: false,
    };
    await fs.writeFile(cleanupRun.reportPath, JSON.stringify(failedReport, null, 2));
    throw new Error('CLEANUP_R2_DELETE_FAILED: database was left unchanged');
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
    runId: cleanupRun.runId,
    dryRun: false,
    confirmationRequired: true,
    productDeletedCount: orderPolicy === 'keep' ? 0 : productCleanup.deletedCount,
    productArchivedCount: orderPolicy === 'keep' ? productCleanup.modifiedCount : 0,
    productCleanupMode: orderPolicy === 'keep' ? 'soft_delete' : 'hard_delete',
    r2AssetDeletedCount: r2Result.length,
    r2AssetFailedCount: 0,
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

  await fs.writeFile(cleanupRun.reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: report.verified, report }, null, 2));
  await mongoose.disconnect();
  if (!report.verified) process.exitCode = 1;
}

main().catch(async error => {
  console.error(error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
