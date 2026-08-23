const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const ImportAdapterManager = require('../utils/importAdapters/ImportAdapterManager');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const distributedLockService = require('../services/distributedLockService');
const Category = require('../models/Category');
const {
  getActiveLangCodes,
  getDefaultLanguage,
  isSupportedLanguage,
} = require('../config/languageInventory');
const ProductImportController = require('../controllers/productImportController');
const User = require('../models/User');
const Product = require('../models/Product');
const SeedStatus = require('../models/SeedStatus');
const {
  extractPublicIdFromUrl,
  isCloudinaryUrl,
  uploadFileToCloudinary,
} = require('../services/cloudinaryService');

const backendRoot = path.resolve(__dirname, '../..');
const scraperRoot = path.join(backendRoot, 'python');
const defaultProductDirectory = path.join(backendRoot, 'data', 'scraped-products');

const getProductDataDirectory = () => {
  const configuredDirectory = process.env.SCRAPER_OUTPUT_DIR;
  return path.resolve(backendRoot, configuredDirectory || defaultProductDirectory);
};

const resolveProductImagePath = (sourcePath) => {
  const outputDirectory = getProductDataDirectory();
  const resolvedPath = path.resolve(outputDirectory, sourcePath);
  const relativePath = path.relative(outputDirectory, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Đường dẫn ảnh nằm ngoài thư mục dữ liệu sản phẩm: ${sourcePath}`);
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Không tìm thấy file ảnh sản phẩm: ${resolvedPath}`);
  }

  return resolvedPath;
};

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    ...options,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', reject);
  child.on('close', (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${command} kết thúc với mã ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`));
  });
});

const getNpmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const runScraper = async (scrapeTarget = 'all') => {
  const scriptName = scrapeTarget === 'all'
    ? 'scrape:all'
    : scrapeTarget.startsWith('scrape:')
      ? scrapeTarget
      : `scrape:${scrapeTarget}`;

  if (!/^scrape:[a-z0-9-]+$/.test(scriptName)) {
    throw new Error(`Tên scraper không hợp lệ: ${scrapeTarget}`);
  }

  console.log(`[ProductPipeline] Bắt đầu crawler: ${scriptName}`);
  console.log(`[ProductPipeline] Thư mục scraper: ${scraperRoot}`);
  console.log(`[ProductPipeline] Thư mục output: ${process.env.SCRAPER_OUTPUT_DIR || defaultProductDirectory}`);
  const scraperStartedAt = Date.now() / 1000;

  if (process.platform === 'win32') {
    const npmCommand = `${getNpmCommand()} run ${scriptName}`;
    await runCommand(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', npmCommand], { cwd: scraperRoot });
  } else {
    await runCommand(getNpmCommand(), ['run', scriptName], { cwd: scraperRoot });
  }

  await runCommand(
    process.env.PYTHON_COMMAND || 'python',
    ['prepare_product_images.py', '--since', String(scraperStartedAt)],
    { cwd: scraperRoot }
  );
};

const chooseProductFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && ['.json', '.csv'].includes(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name);

  const grouped = new Map();
  candidates.forEach((filename) => {
    const basename = filename.slice(0, -path.extname(filename).length);
    const current = grouped.get(basename) || {};
    current[path.extname(filename).toLowerCase().slice(1)] = filename;
    grouped.set(basename, current);
  });

  return [...grouped.values()]
    .map(({ json, csv }) => json || csv)
    .filter(Boolean)
    .sort()
    .map(filename => path.join(directory, filename));
};

const normalizeName = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const inferCategoryFromFilename = (product, filePath) => {
  if (product.category?.trim()) return product.category.trim();

  const name = path.basename(filePath, path.extname(filePath)).replace(/_\d{8}$/, '');
  const parts = name.split('_').filter(Boolean);
  const brandKey = normalizeName(product.brand || product.Brand);
  for (let index = 1; index < parts.length; index++) {
    if (normalizeName(parts.slice(0, index).join('_')) === brandKey) {
      return parts.slice(index).join(' ');
    }
  }

  return null;
};

const getSourceCategoryNames = (products) => [...new Set(
  products
    .map(product => product.category)
    .filter(category => typeof category === 'string' && category.trim())
    .map(category => category.trim())
)];

const ensureSourceCategories = async (products, filePath, dryRun) => {
  const categoryNames = getSourceCategoryNames(products);
  const existingCategories = await Category.find({ isDeleted: false }).lean();
  const categoryMap = new Map();

  existingCategories.forEach((category) => {
    [category.name, ...(category.sourceNames || [])]
      .filter(Boolean)
      .forEach(name => categoryMap.set(String(name).trim().toLowerCase(), category));
  });

  const missingCategories = categoryNames.filter(name => !categoryMap.has(name.toLowerCase()));
  if (missingCategories.length === 0 || dryRun) {
    if (missingCategories.length > 0) {
      console.log(`[ProductPipeline] Category chưa có trong DB (${path.basename(filePath)}): ${missingCategories.join(', ')}`);
    }
    return missingCategories;
  }

  for (const name of missingCategories) {
    const key = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const category = await Category.findOneAndUpdate(
      { name },
      {
        $set: { isDeleted: false },
        $setOnInsert: { name, key, slug: key.replace(/_/g, '-'), sourceNames: [] },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    categoryMap.set(name.toLowerCase(), category);
    console.log(`[ProductPipeline] Đã đồng bộ category từ crawler: ${name}`);
  }

  return [];
};

const getProductImagePublicId = (product, slot, index = 0) => {
  const identity = product.sku || product.URL || `${product.brand}:${product.name}`;
  const identityHash = crypto.createHash('sha256').update(String(identity)).digest('hex').slice(0, 24);
  return `${identityHash}/${slot}${slot === 'gallery' ? `-${index}` : ''}`;
};

const uploadProductImage = async (sourceUrl, publicId) => {
  if (isCloudinaryUrl(sourceUrl)) {
    return {
      url: sourceUrl,
      publicId: extractPublicIdFromUrl(sourceUrl) || publicId,
    };
  }

  const normalizedSource = String(sourceUrl || '').trim();
  if (/^https?:\/\//i.test(normalizedSource)) {
    return uploadFileToCloudinary(normalizedSource, 'products', publicId);
  }

  return uploadFileToCloudinary(resolveProductImagePath(normalizedSource), 'products', publicId);
};

const uploadProductImages = async (product) => {
  const sourceImage = String(product.image || '').trim();
  const sourceGallery = Array.isArray(product.images)
    ? product.images.map(image => String(image || '').trim()).filter(Boolean)
    : [];

  const mainImage = await uploadProductImage(
    sourceImage,
    getProductImagePublicId(product, 'main')
  );
  const galleryImages = [];
  const galleryPublicIds = [];

  for (let index = 0; index < sourceGallery.length; index += 1) {
    try {
      const uploadedImage = await uploadProductImage(
        sourceGallery[index],
        getProductImagePublicId(product, 'gallery', index)
      );
      galleryImages.push(uploadedImage.url);
      galleryPublicIds.push(uploadedImage.publicId);
    } catch (error) {
      console.warn(`[ProductPipeline] Bỏ qua ảnh gallery ${index + 1} của "${product.name}": ${error.message}`);
    }
  }

  return {
    ...product,
    image: mainImage.url,
    imagePublicId: mainImage.publicId,
    images: galleryImages,
    imagePublicIds: galleryPublicIds,
  };
};

const prepareProductImages = async (products) => {
  const preparedProducts = [];
  for (const product of products) {
    try {
      preparedProducts.push(await uploadProductImages(product));
    } catch (error) {
      console.warn(`[ProductPipeline] Bỏ qua sản phẩm "${product.name}" vì không tải được ảnh chính: ${error.message}`);
    }
  }
  return preparedProducts;
};

const getInputFiles = ({ file, directory }) => {
  if (file) {
    const resolvedFile = path.resolve(backendRoot, file);
    if (!fs.existsSync(resolvedFile)) {
      throw new Error(`Không tìm thấy file sản phẩm: ${resolvedFile}`);
    }
    return [resolvedFile];
  }

  const resolvedDirectory = path.resolve(backendRoot, directory || defaultProductDirectory);
  const files = chooseProductFiles(resolvedDirectory);
  if (files.length === 0) {
    throw new Error(`Không tìm thấy file CSV/JSON trong: ${resolvedDirectory}`);
  }
  return files;
};

const dedupeProducts = (products) => {
  const seen = new Set();
  const unique = [];
  let duplicateCount = 0;

  products.forEach((product) => {
    const dedupeKey = product.sku
      ? `sku:${String(product.sku).trim().toLowerCase()}`
      : product.URL
        ? `url:${String(product.URL).trim()}`
        : null;

    if (dedupeKey && seen.has(dedupeKey)) {
      duplicateCount++;
      return;
    }

    if (dedupeKey) seen.add(dedupeKey);
    unique.push(product);
  });

  return { unique, duplicateCount };
};

const INITIAL_HIGHLIGHT_RATIO = 0.1;
const DEAL_DURATION_DAYS = 7;
const PRODUCT_HIGHLIGHTS_SEED_PHASE = 'PRODUCT_HIGHLIGHTS';

const getInitialStock = () => {
  const configuredValue = process.env.SEED_INITIAL_STOCK;
  if (configuredValue === undefined || configuredValue.trim() === '') return undefined;

  const initialStock = Number(configuredValue);
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    throw new Error('SEED_INITIAL_STOCK phải là số nguyên không âm');
  }

  return initialStock;
};

const selectRandomItems = (items) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  const count = Math.min(
    shuffled.length,
    Math.max(1, Math.round(shuffled.length * INITIAL_HIGHLIGHT_RATIO))
  );
  return shuffled.slice(0, count);
};

const assignInitialHighlights = (products) => {
  const seededProducts = products.map(product => ({ ...product }));
  const featuredCandidates = seededProducts.filter(product => product.featured === undefined);
  const dealCandidates = seededProducts.filter(product => product.deal === undefined);

  selectRandomItems(featuredCandidates).forEach((product) => {
    product.featured = true;
  });

  selectRandomItems(dealCandidates).forEach((product) => {
    const durationDays = Math.floor(Math.random() * DEAL_DURATION_DAYS) + 1;
    product.deal = {
      discount: Math.floor(Math.random() * 21) + 10,
      endTime: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
    };
  });

  return seededProducts;
};

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const importBatch = async ({ products, format, adminUser, dryRun }) => {
  const response = createResponse();
  await ProductImportController.importProducts({
    body: {
      products,
      format,
      mode: 'upsert',
      dryRun,
    },
    seedOptions: { preserveExistingStock: true },
    user: { _id: adminUser._id },
    lang: getDefaultLanguage().code,
  }, response);

  if (response.statusCode >= 400 || !response.payload?.success) {
    const message = response.payload?.message || 'Import sản phẩm thất bại';
    throw new Error(message);
  }

  return response.payload;
};

const importProductFile = async ({ filePath, adminUser, batchSize, dryRun, initializeHighlights }) => {
  const format = path.extname(filePath).toLowerCase().slice(1);
  const manager = new ImportAdapterManager({ initialStock: getInitialStock() });
  const content = fs.readFileSync(filePath, 'utf8');
  const parsedProducts = (await manager.parse(content, format)).map(product => ({
    ...product,
    category: inferCategoryFromFilename(product, filePath),
  }));
  const { unique: dedupedProducts, duplicateCount } = dedupeProducts(parsedProducts);
  const validation = await manager.validate(dedupedProducts, format);
  const productsToImport = initializeHighlights && !dryRun
    ? assignInitialHighlights(validation.validProducts)
    : validation.validProducts;
  await ensureSourceCategories(productsToImport, filePath, dryRun);
  const unique = dryRun
    ? productsToImport
    : await prepareProductImages(productsToImport);
  const totalBatches = Math.ceil(unique.length / batchSize);
  const summary = {
    file: filePath,
    read: parsedProducts.length,
    invalid: validation.invalidProducts.length,
    warnings: validation.warnings.length,
    duplicates: duplicateCount,
    inserted: 0,
    updated: 0,
    skipped: 0,
    batches: 0,
  };

  console.log(`[ProductPipeline] ${path.basename(filePath)}: ${parsedProducts.length} dòng, ${validation.invalidProducts.length} dòng lỗi, ${unique.length} dòng hợp lệ sau dedupe`);

  for (let offset = 0; offset < unique.length; offset += batchSize) {
    const batch = unique.slice(offset, offset + batchSize);
    const result = await importBatch({
      products: batch,
      format,
      adminUser,
      dryRun,
    });
    const counts = result.results || {};
    summary.inserted += counts.inserted || 0;
    summary.updated += counts.updated || 0;
    summary.skipped += counts.skipped || 0;
    summary.batches++;
    if (dryRun && !summary.preview) summary.preview = result.preview;
    console.log(`[ProductPipeline] Batch ${summary.batches}/${totalBatches} hoàn tất (${batch.length} sản phẩm)`);
  }

  return summary;
};

const translateProducts = async (languages) => {
  const previousLockMode = process.env.PRODUCT_SEED_LOCK_MODE;
  process.env.PRODUCT_SEED_LOCK_MODE = 'memory';
  await distributedLockService.initialize();

  try {
    const sourceLang = getDefaultLanguage().code;
  const targetLanguages = languages?.length
    ? [...new Set(languages)]
    : getActiveLangCodes().filter(language => language !== sourceLang);
  const unsupportedLanguage = targetLanguages.find(language => !isSupportedLanguage(language) || language === sourceLang);
  if (unsupportedLanguage) {
    throw new Error(`Ngôn ngữ dịch không được hỗ trợ: ${unsupportedLanguage}`);
  }

  const summaries = {};

  for (const targetLang of targetLanguages) {
    console.log(`[ProductPipeline] Dịch sản phẩm: ${sourceLang} -> ${targetLang}`);
    summaries[targetLang] = await ProductTranslationSeederService.translateAllProducts(targetLang, sourceLang);
  }

    return summaries;
  } finally {
    if (previousLockMode === undefined) {
      delete process.env.PRODUCT_SEED_LOCK_MODE;
    } else {
      process.env.PRODUCT_SEED_LOCK_MODE = previousLockMode;
    }
  }
};

const runProductSeedPipeline = async (options = {}) => {
  const dryRun = Boolean(options.dryRun);
  const skipScrape = Boolean(options.skipScrape || dryRun || options.file || options.directory);
  const batchSize = Number(options.batchSize || 50);

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize phải là số nguyên dương');
  }

  if (!skipScrape) {
    await runScraper(options.scrapeTarget || 'all');
  } else {
    console.log('[ProductPipeline] Bỏ qua crawler, dùng file sản phẩm hiện có');
  }

  const files = getInputFiles(options);
  const highlightSeedStatus = await SeedStatus.findOne({ phase: PRODUCT_HIGHLIGHTS_SEED_PHASE })
    .select('status')
    .lean();
  const initializeHighlights = !dryRun && highlightSeedStatus?.status !== 'completed';
  const adminUser = await User.findOne({
    role: { $in: ['admin', 'super-admin'] },
    isDeleted: false,
  }).select('_id').lean();

  if (!adminUser) {
    throw new Error('Không tìm thấy tài khoản admin để gán cho sản phẩm import');
  }

  if (initializeHighlights) {
    console.log('[ProductPipeline] Khởi tạo ngẫu nhiên featured và hot deal cho seed đầu tiên');
  }

  const imports = [];
  for (const filePath of files) {
    imports.push(await importProductFile({
      filePath,
      adminUser,
      batchSize,
      dryRun,
      initializeHighlights,
    }));
  }

  if (initializeHighlights && await Product.exists({})) {
    await SeedStatus.findOneAndUpdate(
      { phase: PRODUCT_HIGHLIGHTS_SEED_PHASE },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          notes: 'Initial featured and hot deal values assigned during product seed',
        },
        $setOnInsert: {
          phase: PRODUCT_HIGHLIGHTS_SEED_PHASE,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  if (dryRun || options.skipTranslate) {
    console.log('[ProductPipeline] Kết thúc ở bước import preview');
    return { files, imports, translations: {}, initializeHighlights };
  }

  const translations = await translateProducts(options.languages);
  return { files, imports, translations, initializeHighlights };
};

module.exports = {
  getProductImagePublicId,
  uploadProductImage,
  uploadProductImages,
  assignInitialHighlights,
  getInitialStock,
  getProductDataDirectory,
  runScraper,
  runProductSeedPipeline,
};
