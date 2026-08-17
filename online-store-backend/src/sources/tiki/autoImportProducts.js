require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const {
  connectMongo,
  getMongoState,
} = require('../../config/mongoConnection');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Supplier = require('../../models/Supplier');
const User = require('../../models/User');
const { transformTikiProducts } = require('./productTransformer');
const {
  validateProductArray,
} = require('../../utils/productImportValidator');
const { prepareTikiProductImages } = require('./imageUploadService');
const { enqueueCloudinaryCleanup } = require('../../services/cloudinaryCleanupOutbox');
const { normalizeSpecs } = require('../../utils/specNormalizer');
const { sanitizePlainText, sanitizeDescriptionText } = require('../../utils/plainTextSanitizer');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../../data');
const REPORT_DIR_NAME = '.auto-import-reports';
const PROCESSED_DIR_NAME = '.processed';
const FAILED_DIR_NAME = '.failed';
const POLL_DELAY_MS = 500;
const STABLE_CHECKS = 2;

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const isAutoImportDebugEnabled = ['1', 'true', 'yes'].includes(
  String(process.env.AUTO_IMPORT_DEBUG || '').toLowerCase(),
);

const autoImportDebug = (event, details = {}) => {
  if (isAutoImportDebugEnabled) {
    console.log(`[AUTO_IMPORT_DEBUG] ${event}`, { ...getMongoState(), ...details });
  }
};

const ensureMongoConnection = async () => {
  autoImportDebug('connection:ensure:start');
  if (mongoose.connection.readyState === 0) {
    autoImportDebug('connection:ensure:connect');
    await connectMongo();
  }
  await mongoose.connection.asPromise();
  autoImportDebug('connection:ensure:ready');
};

const normalizeLookup = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const getItems = payload => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  throw new Error('AUTO_IMPORT_JSON_MUST_CONTAIN_PRODUCT_ARRAY');
};

const hasNormalizedShape = items => {
  const first = items[0];
  return Boolean(first
    && first.name !== undefined
    && first.brand !== undefined
    && first.price !== undefined
    && first.category !== undefined
    && first.supplier !== undefined);
};

async function ensureCategories() {
  autoImportDebug('query:categories:start');
  const categories = await Category.find({ isDeleted: false }).lean();
  autoImportDebug('query:categories:done', { count: categories.length });
  return { categories, created: [] };
}

async function ensureSuppliers() {
  autoImportDebug('query:suppliers:start');
  const suppliers = await Supplier.find({ isDeleted: false }).lean();
  autoImportDebug('query:suppliers:done', { count: suppliers.length });
  return { suppliers, created: [] };
}

const getProductFilter = product => (
  product.source && product.sourceId
    ? {
      source: String(product.source).toUpperCase(),
      sourceId: String(product.sourceId),
      isDeleted: false,
    }
    : {
      name: product.name,
      brand: product.brand,
      isDeleted: false,
    }
);

const getProductIdentity = product => (
  product.source && product.sourceId
    ? `${String(product.source).toUpperCase()}|${String(product.sourceId)}`
    : `${product.name}|${product.brand}`
);

const getCloudinaryPublicIds = product => [
  product.imagePublicId,
  ...(Array.isArray(product.imagePublicIds) ? product.imagePublicIds : []),
].filter(Boolean);

const getImportDocument = (product, userId, categories, suppliers) => {
  const category = categories.find(candidate => (
    normalizeLookup(candidate.name) === normalizeLookup(product.category)
    && candidate.isDeleted !== true
  ));
  const supplier = suppliers.find(candidate => (
    normalizeLookup(candidate.name) === normalizeLookup(product.supplier)
    && candidate.isDeleted !== true
  ));
  if (!category) throw new Error(`AUTO_IMPORT_CATEGORY_NOT_FOUND: ${product.category}`);
  if (!supplier) throw new Error(`AUTO_IMPORT_SUPPLIER_NOT_FOUND: ${product.supplier}`);

  return {
    ...product,
    name: sanitizePlainText(product.name),
    brand: sanitizePlainText(product.brand),
    description: sanitizeDescriptionText(product.description),
    specs: normalizeSpecs(product.specs || {}),
    source: product.source ? String(product.source).toUpperCase() : null,
    sourceId: product.sourceId ? String(product.sourceId) : null,
    sourceParentId: product.sourceParentId ? String(product.sourceParentId) : null,
    category: category._id,
    supplier: supplier._id,
    user: userId,
    isDeleted: false,
  };
};

async function persistProducts(products, userId, categories, suppliers, dryRun) {
  const documents = products.map(product => getImportDocument(product, userId, categories, suppliers));
  if (dryRun || documents.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0, obsoleteImagePublicIds: [] };
  }

  const filters = documents.map(getProductFilter);
  const existing = await Product.find({ $or: filters }).lean();
  const existingByIdentity = new Map(existing.map(product => [getProductIdentity(product), product]));
  const obsoleteImagePublicIds = [];
  const operations = documents.map(document => {
    const current = existingByIdentity.get(getProductIdentity(document));
    if (current) {
      const previousImages = new Set(getCloudinaryPublicIds(current));
      const nextImages = new Set(getCloudinaryPublicIds(document));
      previousImages.forEach(publicId => {
        if (!nextImages.has(publicId)) obsoleteImagePublicIds.push(publicId);
      });
    }
    return {
      updateOne: {
        filter: getProductFilter(document),
        update: { $set: document },
        upsert: true,
      },
    };
  });

  const result = await Product.bulkWrite(operations, { ordered: false });
  return {
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    unchanged: result.matchedCount - result.modifiedCount,
    obsoleteImagePublicIds: [...new Set(obsoleteImagePublicIds)],
  };
}

async function waitForStableFile(filePath) {
  let previous = null;
  let stableChecks = 0;
  for (let attempt = 0; attempt < 20 && stableChecks < STABLE_CHECKS; attempt += 1) {
    const stats = await fs.stat(filePath);
    const current = `${stats.size}:${stats.mtimeMs}`;
    stableChecks = current === previous ? stableChecks + 1 : 0;
    previous = current;
    await sleep(POLL_DELAY_MS);
  }
}

const getArchivePath = async (directory, fileName) => {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let suffix = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${stem}-${Date.now()}-${suffix}${extension}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
};

const writeReport = async (reportsDir, fileName, report) => {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension).replace(/[^a-z0-9_-]+/gi, '-');
  const reportPath = path.join(reportsDir, `${stem}-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
};

async function prepareProducts(payload, dryRun) {
  const items = getItems(payload);
  if (items.length === 0) throw new Error('AUTO_IMPORT_EMPTY_PRODUCT_ARRAY');

  if (hasNormalizedShape(items)) {
    const validation = validateProductArray(items);
    const categories = await ensureCategories();
    const suppliers = await ensureSuppliers();
    return {
      products: validation.validProducts,
      rejected: validation.invalidProducts,
      categories,
      suppliers,
      sourceType: 'normalized',
      validation,
    };
  }

  const categories = await ensureCategories();
  const suppliers = await ensureSuppliers();
  const transformed = transformTikiProducts(items, {
    categories: categories.categories,
    suppliers: suppliers.suppliers,
  });
  return {
    products: transformed.ready,
    rejected: transformed.rejected,
    categories,
    suppliers,
    sourceType: 'raw-tiki',
    validation: null,
    transformReport: transformed.report,
  };
}

async function processFile(filePath, options) {
  const fileName = path.basename(filePath);
  const startedAt = new Date().toISOString();
  let report;
  let createdImagePublicIds = [];

  try {
    await ensureMongoConnection();
    await waitForStableFile(filePath);
    const inputText = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '').trim();
    const payload = JSON.parse(inputText);
    autoImportDebug('file:parsed', { fileName, inputCount: getItems(payload).length, dryRun: options.dryRun });
    const prepared = await prepareProducts(payload, options.dryRun);
    autoImportDebug('file:prepared', {
      fileName,
      sourceType: prepared.sourceType,
      qualifiedCount: prepared.products.length,
      rejectedCount: prepared.rejected.length,
    });
    autoImportDebug('query:admin:start');
    const admin = await User.findOne({ role: { $in: ['admin', 'super-admin'] } }).select('_id').lean();
    autoImportDebug('query:admin:done', { found: Boolean(admin) });
    if (!admin) throw new Error('AUTO_IMPORT_ADMIN_NOT_FOUND');

    let products = prepared.products;
    let imageSummary = { productsProcessed: 0, imagesUploaded: 0, imagesReused: 0 };
    if (!options.dryRun && products.length > 0) {
      const imagePreparation = await prepareTikiProductImages(products);
      products = imagePreparation.products;
      createdImagePublicIds = imagePreparation.createdPublicIds;
      imageSummary = imagePreparation.summary;
    }

    autoImportDebug('persistence:start', { fileName, count: products.length, dryRun: options.dryRun });
    const persistence = await persistProducts(
      products,
      admin._id,
      prepared.categories.categories,
      prepared.suppliers.suppliers,
      options.dryRun,
    );
    autoImportDebug('persistence:done', { fileName, ...persistence });

    if (!options.dryRun) {
      await Promise.all([
        ...persistence.obsoleteImagePublicIds.map(publicId => enqueueCloudinaryCleanup(publicId)),
      ]);
    }

    report = {
      success: true,
      status: prepared.products.length > 0 ? 'completed' : 'completed_with_rejections',
      file: fileName,
      sourceType: prepared.sourceType,
      startedAt,
      completedAt: new Date().toISOString(),
      dryRun: options.dryRun,
      inputCount: getItems(payload).length,
      qualifiedCount: prepared.products.length,
      rejectedCount: prepared.rejected.length,
      rejected: prepared.rejected,
      createdCategories: prepared.categories.created,
      createdSuppliers: prepared.suppliers.created,
      imageSummary,
      persistence: {
        inserted: persistence.inserted,
        updated: persistence.updated,
        unchanged: persistence.unchanged,
      },
      transformReport: prepared.transformReport || null,
      validationWarnings: prepared.validation?.warnings || [],
    };

    const reportPath = await writeReport(options.reportsDir, fileName, report);
    if (!options.dryRun) {
      const archivedPath = await getArchivePath(options.processedDir, fileName);
      await fs.rename(filePath, archivedPath);
      report.archivedPath = archivedPath;
    }
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } catch (error) {
    if (createdImagePublicIds.length > 0) {
      await Promise.all(createdImagePublicIds.map(publicId => enqueueCloudinaryCleanup(publicId)));
    }
    report = {
      success: false,
      status: 'failed',
      file: fileName,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error.message,
    };
    const reportPath = await writeReport(options.reportsDir, fileName, report);
    if (!options.dryRun) {
      const archivedPath = await getArchivePath(options.failedDir, fileName);
      await fs.rename(filePath, archivedPath);
      report.archivedPath = archivedPath;
    }
    autoImportDebug('file:failed', {
      fileName,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    });
    console.error(JSON.stringify({ ...report, reportPath }, null, 2));
  }
}

const isInputFile = entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json');

async function listInputFiles(dataDir) {
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  return entries.filter(isInputFile).map(entry => path.join(dataDir, entry.name));
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = path.resolve(parseArg(args, 'data-dir', DEFAULT_DATA_DIR));
  const options = {
    dataDir,
    dryRun: args.includes('--dry-run'),
    once: args.includes('--once'),
    reportsDir: path.join(dataDir, REPORT_DIR_NAME),
    processedDir: path.join(dataDir, PROCESSED_DIR_NAME),
    failedDir: path.join(dataDir, FAILED_DIR_NAME),
  };
  autoImportDebug('main:options', {
    dataDir: options.dataDir,
    dryRun: options.dryRun,
    once: options.once,
  });

  await Promise.all([
    fs.mkdir(options.dataDir, { recursive: true }),
    fs.mkdir(options.reportsDir, { recursive: true }),
    fs.mkdir(options.processedDir, { recursive: true }),
    fs.mkdir(options.failedDir, { recursive: true }),
  ]);
  await ensureMongoConnection();
  autoImportDebug('model:init:start');
  await Product.init();
  autoImportDebug('model:init:done');

  const queue = new Set();
  let draining = false;
  const drainQueue = async () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.size > 0) {
        const [filePath] = queue;
        queue.delete(filePath);
        try {
          await fs.access(filePath);
          await processFile(filePath, options);
        } catch (error) {
          if (error.code !== 'ENOENT') console.error(`[AUTO_IMPORT_QUEUE_ERROR] ${error.message}`);
        }
      }
    } finally {
      draining = false;
    }
  };

  const enqueue = filePath => {
    if (path.dirname(filePath) !== dataDir || !filePath.toLowerCase().endsWith('.json')) return;
    queue.add(filePath);
    drainQueue().catch(error => console.error(`[AUTO_IMPORT_DRAIN_ERROR] ${error.message}`));
  };

  (await listInputFiles(options.dataDir)).forEach(enqueue);
  await drainQueue();

  if (options.once) {
    await mongoose.disconnect();
    return;
  }

  const watcher = require('fs').watch(options.dataDir, (eventType, fileName) => {
    if (!fileName) return;
    enqueue(path.join(options.dataDir, fileName.toString()));
  });

  const shutdown = async () => {
    watcher.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`Watching ${options.dataDir} for JSON product files`);
}

main().catch(async error => {
  console.error(`[AUTO_IMPORT_FATAL] ${error.message}`);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
