require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../../config/mongoConnection');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Supplier = require('../../models/Supplier');
const Currency = require('../../models/Currency');
const User = require('../../models/User');
const {
  transformTikiProducts,
  preflightTikiImport,
} = require('./productTransformer');
const config = require('./importConfig');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const getSellerName = (seller) => (
  typeof seller === 'string'
    ? seller.trim()
    : String(seller?.name || seller?.store_name || seller?.seller_name || '').trim()
);

const getSourceSupplierNames = (rawInput) => {
  const items = Array.isArray(rawInput) ? rawInput : rawInput?.products;
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => [
    getSellerName(item.current_seller),
    getSellerName(item.seller),
    getSellerName(item.seller_name),
    ...(Array.isArray(item.configurable_products)
      ? item.configurable_products.flatMap((variant) => [
        getSellerName(variant.current_seller),
        getSellerName(variant.seller),
        getSellerName(variant.seller_name),
      ])
      : []),
  ]).filter(Boolean);
};

async function main() {
  const args = process.argv.slice(2);
  const inputPath = parseArg(args, 'input');
  const outputDir = parseArg(args, 'output-dir', path.resolve(process.cwd(), 'tiki-import-output'));
  const includeRaw = args.includes('--include-raw');

  if (!inputPath) {
    throw new Error('TIKI_INPUT_REQUIRED: use --input=path/to/file.json');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not set');
  }

  const inputText = (await fs.readFile(path.resolve(inputPath), 'utf8'))
    .replace(/^\uFEFF/, '')
    .trim();
  const rawInput = JSON.parse(inputText);
  const sourceSupplierNames = getSourceSupplierNames(rawInput);
  await connectMongo();

  const [categories, suppliers, currency, admin, indexes] = await Promise.all([
    Category.find({ isDeleted: false }).select('name sourceNames isDeleted').lean(),
    Supplier.find({ isDeleted: false }).select('name sourceNames isDeleted').lean(),
    Currency.findOne({ code: config.currency, isActive: true }).select('code isActive').lean(),
    User.findOne({ role: { $in: ['admin', 'super-admin'] } }).select('_id').lean(),
    Product.collection.indexes(),
  ]);
  const sourceIdentityIndexReady = indexes.some(index => (
    index.unique === true
    && index.key?.source === 1
    && index.key?.sourceId === 1
  ));

  const preflight = preflightTikiImport({
    categories,
    suppliers,
    currency: currency || { code: config.currency, isActive: false },
    adminUserId: admin?._id,
    sourceSupplierNames,
    sourceIdentityIndexReady,
  });
  if (!preflight.success) {
    throw new Error(`TIKI_PREFLIGHT_FAILED: ${JSON.stringify(preflight.errors)}`);
  }

  const result = transformTikiProducts(rawInput, {
    categories,
    suppliers,
    includeRaw,
  });
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'ready_for_import.json'), JSON.stringify(result.ready, null, 2)),
    fs.writeFile(path.join(outputDir, 'rejected-products.json'), JSON.stringify(result.rejected, null, 2)),
    fs.writeFile(path.join(outputDir, 'transform-report.json'), JSON.stringify({ ...result.report, preflight }, null, 2)),
  ]);

  console.log(JSON.stringify({
    success: true,
    outputDir,
    report: result.report,
  }, null, 2));
  await mongoose.disconnect();
}

main()
  .catch(async (error) => {
    console.error(error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
  });
