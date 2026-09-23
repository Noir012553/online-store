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
const { waitForPendingTranslations } = require('../services/specKeyTranslationService');
const { refreshStorefrontReadiness } = require('../services/translationHelper');
const User = require('../models/User');
const Product = require('../models/Product');
const SeedStatus = require('../models/SeedStatus');
const { uploadAsset } = require('../services/r2AssetService');

const backendRoot = path.resolve(__dirname, '../..');
const scraperRoot = backendRoot;
const defaultProductDirectory = path.join(backendRoot, 'data', 'scraped-products', 'current');

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
  if (process.platform === 'win32') {
    const npmCommand = `${getNpmCommand()} run ${scriptName}`;
    await runCommand(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', npmCommand], { cwd: scraperRoot });
  } else {
    await runCommand(getNpmCommand(), ['run', scriptName], { cwd: scraperRoot });
  }
};

const chooseProductFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  const ignoredDirectories = new Set(['images', 'manifests', 'staging', 'archive']);
  const candidates = [];
  const visit = currentDirectory => {
    fs.readdirSync(currentDirectory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name.toLowerCase())) visit(entryPath);
        return;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (
        ['.json', '.csv'].includes(extension)
        && !entry.name.toLowerCase().endsWith('.staging.json')
      ) {
        candidates.push(entryPath);
      }
    });
  };
  visit(directory);

  const grouped = new Map();
  candidates.forEach((filePath) => {
    const basename = path.basename(filePath, path.extname(filePath));
    const groupKey = path.join(path.dirname(filePath), basename);
    const current = grouped.get(groupKey) || {};
    current[path.extname(filePath).toLowerCase().slice(1)] = filePath;
    grouped.set(groupKey, current);
  });

  return [...grouped.values()]
    .map(({ json, csv }) => json || csv)
    .filter(Boolean)
    .sort();
};

const normalizeName = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const normalizeSeedCategory = value => {
  const category = String(value || '').trim();
  return category || null;
};

const normalizeSourceCategory = (value, filePath) => {
  const category = normalizeSeedCategory(value);
  if (!category) return null;

  const fileStem = path.basename(filePath, path.extname(filePath));
  if (/^Asus_Laptop_\d{8}$/i.test(fileStem) && normalizeName(category) === 'laptop') {
    console.warn(`[ProductPipeline] Chuẩn hóa output legacy ${path.basename(filePath)}: Laptop -> Laptop Office`);
    return 'Laptop Office';
  }

  return category;
};

const filterSeedProducts = (products) => {
  const acceptedProducts = [];
  const rejectedProducts = [];

  products.forEach((product, index) => {
    const category = normalizeSeedCategory(product.category);
    if (!category) {
      rejectedProducts.push({
        rowIndex: index + 1,
        name: product.name || product.sourceUrl || '(không tên)',
        reason: 'Thiếu danh mục sản phẩm',
      });
      return;
    }

    acceptedProducts.push({ ...product, category });
  });

  return { acceptedProducts, rejectedProducts };
};

const inferCategoryFromFilename = (product, filePath) => {
  const sourceCategory = normalizeSourceCategory(product.category, filePath);
  if (sourceCategory) return sourceCategory;

  const name = path.basename(filePath, path.extname(filePath)).replace(/_\d{8}$/, '');
  const parts = name.split('_').filter(Boolean);
  const brandKey = normalizeName(product.brand || product.Brand);
  for (let index = 1; index < parts.length; index++) {
    if (normalizeName(parts.slice(0, index).join('_')) === brandKey) {
      return normalizeSourceCategory(parts.slice(index).join(' '), filePath);
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

const getProductIdentityHash = product => {
  const identity = product.sourceProductId
    || product.sku
    || product.sourceUrl
    || `${product.brand}:${product.name}`;
  return crypto.createHash('sha256').update(String(identity)).digest('hex').slice(0, 24);
};

const getProductStoragePrefix = (product, role) => `products/${getProductIdentityHash(product)}/${role}`;

const getProductImagePublicId = (product, slot, index = 0) => (
  `${getProductIdentityHash(product)}/${slot}${slot === 'gallery' ? `-${index}` : ''}`
);

const uploadProductImage = async (sourceUrl, publicId, role = 'main', product = {}) => {
  const normalizedSource = String(sourceUrl || '').trim();
  if (!normalizedSource) throw new Error('Thiếu nguồn ảnh sản phẩm');
  const source = /^https?:\/\//i.test(normalizedSource)
    ? normalizedSource
    : resolveProductImagePath(normalizedSource);
  const asset = await uploadAsset(source, {
    role,
    stableKey: publicId,
    publicKey: product.sourceProductId || product.sku || product.sourceUrl,
    storagePrefix: getProductStoragePrefix(product, role),
  });
  return {
    ...asset,
    url: asset.publicUrl,
    publicUrl: asset.publicUrl,
    publicId: asset.publicId || asset.storageKey,
  };
};

const getProductImageErrorMessage = (error) => {
  const cause = error?.cause;
  const causeMessage = cause?.code || cause?.message || cause?.name;
  return causeMessage
    ? `${error.message} (cause: ${causeMessage})`
    : error.message;
};

const uploadProductImages = async (product) => {
  const sourceImage = String(product.image || '').trim();
  const sourceGallery = Array.isArray(product.images)
    ? product.images.map(image => String(image || '').trim()).filter(Boolean)
    : [];

  const mainImage = await uploadProductImage(
    sourceImage,
    getProductImagePublicId(product, 'main'),
    'main',
    product,
  );
  const galleryImages = [];
  const galleryAssets = [];

  for (let index = 0; index < sourceGallery.length; index += 1) {
    try {
      const uploadedImage = await uploadProductImage(
        sourceGallery[index],
        getProductImagePublicId(product, 'gallery', index),
        'gallery',
        product,
      );
      galleryImages.push(uploadedImage.url);
      galleryAssets.push(uploadedImage);
    } catch (error) {
      console.warn(`[ProductPipeline] Bỏ qua ảnh gallery ${index + 1} của "${product.name}": ${getProductImageErrorMessage(error)}`);
    }
  }

  const descriptionImages = [];
  for (let index = 0; index < (Array.isArray(product.descriptionImages) ? product.descriptionImages.length : 0); index += 1) {
    const descriptionImage = product.descriptionImages[index];
    const descriptionEntry = typeof descriptionImage === 'string' ? { url: descriptionImage } : descriptionImage || {};
    const source = descriptionEntry.url ?? descriptionEntry.sourceUrl;
    if (!source) continue;
    try {
      const uploadedImage = await uploadProductImage(
        source,
        getProductImagePublicId(product, 'description', index),
        'description',
        product,
      );
      descriptionImages.push({
        ...descriptionEntry,
        ...uploadedImage,
        url: uploadedImage.url,
        publicUrl: uploadedImage.publicUrl,
      });
    } catch (error) {
      console.warn(`[ProductPipeline] Bỏ qua ảnh mô tả ${index + 1} của "${product.name}": ${getProductImageErrorMessage(error)}`);
    }
  }

  return {
    ...product,
    image: mainImage.url,
    imagePublicId: null,
    imageAsset: mainImage,
    images: galleryImages,
    imagePublicIds: [],
    imageAssets: galleryAssets,
    descriptionImages,
  };
};

const prepareProductImages = async (products) => {
  const preparedProducts = [];
  for (const product of products) {
    try {
      preparedProducts.push(await uploadProductImages(product));
    } catch (error) {
      console.warn(`[ProductPipeline] Bỏ qua sản phẩm "${product.name}" vì không tải được ảnh chính: ${getProductImageErrorMessage(error)}`);
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

const getSeedIdentityKey = (product) => {
  const identities = [
    ['sourceProductId', product.sourceProductId],
    ['sku', product.sku],
    ['sourceUrl', product.sourceUrl],
  ];
  const identity = identities.find(([, value]) => value !== undefined && value !== null && String(value).trim());
  return identity ? `${identity[0]}:${String(identity[1]).trim().toLowerCase()}` : null;
};

const dedupeProducts = (products) => {
  const seen = new Set();
  const unique = [];
  let duplicateCount = 0;

  products.forEach((product) => {
    const dedupeKey = getSeedIdentityKey(product);

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
  await ensureSourceCategories(parsedProducts, filePath, dryRun);
  const { acceptedProducts, rejectedProducts } = filterSeedProducts(parsedProducts);
  const { unique: dedupedProducts, duplicateCount } = dedupeProducts(acceptedProducts);
  const validation = await manager.validate(dedupedProducts, format);
  const productsToImport = initializeHighlights && !dryRun
    ? assignInitialHighlights(validation.validProducts)
    : validation.validProducts;
  const unique = dryRun
    ? productsToImport
    : await prepareProductImages(productsToImport);
  const totalBatches = Math.ceil(unique.length / batchSize);
  const summary = {
    file: filePath,
    read: parsedProducts.length,
    invalid: validation.invalidProducts.length,
    warnings: validation.warnings.length,
    filteredOut: rejectedProducts.length,
    duplicates: duplicateCount,
    inserted: 0,
    updated: 0,
    skipped: 0,
    batches: 0,
  };

  console.log(`[ProductPipeline] ${path.basename(filePath)}: ${parsedProducts.length} dòng, loại ${rejectedProducts.length} dòng ngoài phạm vi, ${validation.invalidProducts.length} dòng lỗi, ${unique.length} dòng hợp lệ sau dedupe`);
  if (rejectedProducts.length > 0) {
    const filteredExamples = rejectedProducts
      .slice(0, 5)
      .map(item => `row ${item.rowIndex}: ${item.name} (${item.reason})`)
      .join(' | ');
    console.warn(`[ProductPipeline] Đã loại sản phẩm ngoài phạm vi: ${filteredExamples}`);
  }
  if (validation.invalidProducts.length > 0) {
    const validationExamples = validation.invalidProducts
      .slice(0, 3)
      .map(item => `row ${item.rowIndex}: ${item.errors.join('; ')}`)
      .join(' | ');
    console.warn(`[ProductPipeline] Lý do validation mẫu: ${validationExamples}`);
  }

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
  const hasExplicitInput = Boolean(options.file || options.directory);
  const inputDirectory = options.directory
    ? path.resolve(backendRoot, options.directory)
    : getProductDataDirectory();
  const existingFiles = options.file ? [] : chooseProductFiles(inputDirectory);
  const forceScrape = Boolean(options.forceScrape || options.scrapeTarget);
  const skipScrape = Boolean(
    dryRun
      || options.skipScrape
      || hasExplicitInput
      || (!forceScrape && existingFiles.length > 0),
  );
  const batchSize = Number(options.batchSize || 50);

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize phải là số nguyên dương');
  }

  if (!skipScrape) {
    await runScraper(options.scrapeTarget || 'all');
  } else if (existingFiles.length > 0) {
    console.log(`[ProductPipeline] Phát hiện ${existingFiles.length} file dữ liệu hiện có, bỏ qua crawler`);
  } else {
    console.log('[ProductPipeline] Bỏ qua crawler, dùng file sản phẩm được chỉ định');
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

  if (!dryRun) {
    await waitForPendingTranslations();
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
  const productIds = await Product.find({ isDeleted: false }).distinct('_id');
  const storefrontReadiness = await refreshStorefrontReadiness(productIds);
  return { files, imports, translations, storefrontReadiness, initializeHighlights };
};

module.exports = {
  getProductIdentityHash,
  getProductStoragePrefix,
  getProductImagePublicId,
  uploadProductImage,
  uploadProductImages,
  assignInitialHighlights,
  getInitialStock,
  filterSeedProducts,
  normalizeSeedCategory,
  inferCategoryFromFilename,
  getSeedIdentityKey,
  dedupeProducts,
  getProductDataDirectory,
  runScraper,
  runProductSeedPipeline,
};
