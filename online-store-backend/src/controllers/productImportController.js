/**
 * Product Import/Export Controller
 * Xử lý API import/export products từ JSON, CSV, hoặc các format khác
 *
 * Sử dụng Adapter Pattern:
 * - JSONAdapter: Parse JSON format
 * - CSVAdapter: Parse CSV format
 * - Dễ add adapters mới (Excel, XML, API, etc.)
 *
 * Import Endpoints:
 * - POST /api/admin/products/import - Import products
 * - GET /api/admin/products/import-template - Download template
 * - GET /api/admin/products/import-guide - Hướng dẫn import
 * - GET /api/admin/products/import-formats - List supported formats
 *
 * Export Endpoints:
 * - GET /api/admin/products/export?format=json|csv&category=...&brand=... - Export products
 */

const asyncHandler = require('express-async-handler');
const { finished } = require('stream/promises');
const { Readable } = require('stream');
const archiverModule = require('archiver');
const archiveFactory = [
  archiverModule.create,
  archiverModule.default?.create,
  archiverModule,
  archiverModule.default,
].find(candidate => typeof candidate === 'function');
const createZipArchive = archiveFactory
  ? (options) => archiveFactory('zip', options)
  : typeof archiverModule.ZipArchive === 'function'
    ? (options) => new archiverModule.ZipArchive(options)
    : null;

if (!createZipArchive) {
  throw new TypeError('The archiver package does not expose a ZIP archive factory');
}
const mongoose = require('mongoose');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Product = require('../models/Product');
const Category = require('../models/Category');
let CategoryCatalogTranslationCache = null;
try {
  CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
} catch (error) {
  console.error('[EXPORT_CATEGORY_TRANSLATION_CACHE_UNAVAILABLE]', { message: error.message });
}
const Language = require('../models/Language');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const ImportAdapterManager = require('../utils/importAdapters/ImportAdapterManager');
const { validateCategoryName, sanitizeCategoryName } = require('../utils/productImportValidator');
const { normalizeSpecs } = require('../utils/specNormalizer');
const { registerUnknownSpecKeys } = require('../services/specKeyTranslationService');
const { getMessage } = require('../i18n/messages');
const {
  getDefaultLanguage,
  getActiveLangCodes,
  isSupportedLanguage,
} = require('../config/languageInventory');
const LanguageService = require('../services/languageService');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { enqueueCloudinaryCleanup } = require('../services/cloudinaryCleanupOutbox');
const { withTimeout } = require('../utils/mongooseUtils');

const configuredExportQueryTimeout = Number(process.env.EXPORT_QUERY_TIMEOUT_MS);
const MIN_EXPORT_QUERY_TIMEOUT_MS = 120000;
const EXPORT_QUERY_TIMEOUT_MS = Number.isFinite(configuredExportQueryTimeout) && configuredExportQueryTimeout > 0
  ? Math.max(configuredExportQueryTimeout, MIN_EXPORT_QUERY_TIMEOUT_MS)
  : MIN_EXPORT_QUERY_TIMEOUT_MS;
const MAX_EXPORT_LOCALES = getActiveLangCodes().length;

const withExportTimeout = (operation, operationName = 'unknown') => (
  withTimeout(operation, EXPORT_QUERY_TIMEOUT_MS).catch((error) => {
    console.error('[EXPORT_QUERY_FAILED]', {
      operation: operationName,
      timeoutMs: EXPORT_QUERY_TIMEOUT_MS,
      message: error.message,
    });
    throw error;
  })
);

const buildCategoryNameQuery = (name) => {
  if (!name || typeof name !== 'string') return null;
  return { name: name.trim() };
};

const resolveProductExportFilter = async (category, brand) => {
  const filter = { isDeleted: false };

  if (category && category !== 'all') {
    if (mongoose.Types.ObjectId.isValid(category)) {
      const categoryId = new mongoose.Types.ObjectId(category);
      const categoryExists = await withExportTimeout(
        Category.exists({ _id: categoryId, isDeleted: false }).maxTimeMS(EXPORT_QUERY_TIMEOUT_MS),
        'category_exists',
      );
      if (!categoryExists) return null;
      filter.category = categoryId;
    } else {
      const categoryQuery = buildCategoryNameQuery(category);
      const categoryDoc = categoryQuery
        ? await withExportTimeout(
          Category.findOne({ ...categoryQuery, isDeleted: false })
            .select('_id')
            .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
            .lean(),
          'category_lookup',
        )
        : null;
      if (!categoryDoc) return null;
      filter.category = categoryDoc._id;
    }
  }

  if (brand && brand !== 'all') {
    filter.brand = brand.trim();
  }

  return filter;
};

const EXPORT_BATCH_SIZE = 50;

const getExportProductQuery = async filter => {
  const activeCategoryIds = filter.category
    ? null
    : await withExportTimeout(
      Category.distinct('_id', { isDeleted: false }).maxTimeMS(EXPORT_QUERY_TIMEOUT_MS),
      'category_distinct',
    );
  return {
    ...filter,
    category: { $in: filter.category ? [filter.category] : activeCategoryIds },
  };
};

const getExportProductBatchFilter = (exportFilter, lastId = null) => (
  lastId ? { ...exportFilter, _id: { $gt: lastId } } : exportFilter
);

const getExportProductBatch = async (exportFilter, limit, lastId = null) => (
  withExportTimeout(
    Product.find(getExportProductBatchFilter(exportFilter, lastId))
      .select('-__v')
      .populate({ path: 'category', select: 'name', match: { isDeleted: false } })
      .sort({ _id: 1 })
      .limit(limit)
      .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
      .lean(),
    'product_batch',
  )
);

const createExportProductBatchStream = async (filter, limit) => {
  const exportFilter = await getExportProductQuery(filter);
  const matchedTotal = await withExportTimeout(
    Product.countDocuments(exportFilter).maxTimeMS(EXPORT_QUERY_TIMEOUT_MS),
    'product_count',
  );

  return {
    matchedTotal,
    hasMore: matchedTotal > limit,
    exportFilter,
  };
};

const normalizeExportLocale = (locale) => (
  typeof locale === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(locale.trim())
    ? locale.trim().toLowerCase()
    : null
);

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const getConfiguredExportLocales = () => (
  String(process.env.EXPORT_LOCALES || '')
    .split(',')
    .map(normalizeExportLocale)
    .filter(Boolean)
);

const getExportFallbacks = () => {
  const rawFallbacks = process.env.EXPORT_TRANSLATION_FALLBACKS;
  if (!rawFallbacks) return {};

  try {
    const parsedFallbacks = JSON.parse(rawFallbacks);
    if (!parsedFallbacks || typeof parsedFallbacks !== 'object' || Array.isArray(parsedFallbacks)) {
      throw new TypeError('EXPORT_TRANSLATION_FALLBACKS must be a JSON object');
    }

    return Object.fromEntries(Object.entries(parsedFallbacks)
      .map(([locale, fallbacks]) => [
        normalizeExportLocale(locale),
        Array.isArray(fallbacks)
          ? fallbacks.map(normalizeExportLocale).filter(isSupportedLanguage)
          : [],
      ])
      .filter(([locale]) => locale && isSupportedLanguage(locale)));
  } catch (error) {
    console.error('[EXPORT_TRANSLATION_FALLBACK_CONFIG_INVALID]', { message: error.message });
    return {};
  }
};

const getTranslationWithFallback = (translations, locale, fallbacks, defaultLocale) => {
  const fallbackChain = uniqueValues([
    locale,
    ...(fallbacks[locale] || []),
    defaultLocale,
  ]);

  for (const candidate of fallbackChain) {
    const translation = translations.get(candidate);
    if (!translation) continue;

    return {
      ...translation,
      appliedLocale: candidate,
      fallback: candidate !== locale,
    };
  }

  return null;
};

const toExportTranslation = (translation) => ({
  name: translation.name,
  description: translation.description,
  brand: translation.brand,
  specs: translation.specs || {},
  manualFields: translation.manualFields || [],
  status: translation.status,
  qualityStatus: translation.qualityStatus,
  qualityScore: translation.qualityScore,
  validationErrors: translation.validationErrors || [],
  lastTranslatedAt: translation.lastTranslatedAt,
  retryCount: translation.retryCount,
  lastErrorMessage: translation.lastErrorMessage,
  lastRetryAt: translation.lastRetryAt,
});

const getTranslationLookupLocales = (locales, fallbacks, defaultLocale) => uniqueValues(
  locales.flatMap(locale => [locale, ...(fallbacks[locale] || []), defaultLocale])
);

const getProductTranslationsForExport = async (products, locales, fallbacks, defaultLocale) => {
  if (products.length === 0) return [];

  const productIds = products.map(product => product._id.toString());
  const lookupLocales = getTranslationLookupLocales(locales, fallbacks, defaultLocale)
    .filter(locale => locale !== defaultLocale);
  let translationDocuments = [];

  if (lookupLocales.length > 0) {
    try {
      translationDocuments = await withExportTimeout(
        ProductCatalogTranslationCache.find({
          entityId: { $in: productIds },
          targetLang: { $in: lookupLocales },
          status: 'success',
        })
          .select('entityId targetLang name description brand specs manualFields status qualityStatus qualityScore validationErrors lastTranslatedAt retryCount lastErrorMessage lastRetryAt')
          .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
          .lean(),
        'translation_cache',
      );
    } catch (error) {
      console.error('[EXPORT_TRANSLATION_CACHE_ERROR]', {
        productCount: products.length,
        locales: lookupLocales,
        message: error.message,
      });
    }
  }

  const translationsByProduct = new Map();
  translationDocuments.forEach((translation) => {
    if (!translation.targetLang) return;
    const productTranslations = translationsByProduct.get(translation.entityId) || new Map();
    productTranslations.set(translation.targetLang, toExportTranslation(translation));
    translationsByProduct.set(translation.entityId, productTranslations);
  });

  return products.map((product) => {
    const productTranslations = translationsByProduct.get(product._id.toString()) || new Map();
    productTranslations.set(defaultLocale, {
      name: product.name,
      description: product.description,
      brand: product.brand,
      specs: product.specs || {},
    });

    return {
      product,
      translations: Object.fromEntries(locales.map(locale => [
        locale,
        getTranslationWithFallback(productTranslations, locale, fallbacks, defaultLocale),
      ]).filter(([, translation]) => translation)),
    };
  });
};

const getExportImages = (productData) => {
  const imageEntries = [];
  const addImage = ({ url, publicId, alt, type }) => {
    if (!url || imageEntries.some(image => image.url === url)) return;
    imageEntries.push({
      url,
      alt: alt || productData.name || '',
      position: imageEntries.length,
      type,
      ...(publicId ? { publicId } : {}),
    });
  };

  addImage({
    url: productData.image,
    publicId: productData.imagePublicId,
    type: 'main',
  });

  const galleryImages = Array.isArray(productData.images) ? productData.images : [];
  const galleryPublicIds = Array.isArray(productData.imagePublicIds)
    ? productData.imagePublicIds
    : [];

  galleryImages.forEach((image, index) => {
    const source = typeof image === 'string' ? { url: image } : image || {};
    addImage({
      url: source.url,
      publicId: source.publicId || galleryPublicIds[index],
      alt: source.alt,
      type: source.type || 'gallery',
    });
  });

  return imageEntries;
};

const serializeProductForExport = (product, translations = {}) => {
  const { _id, category, ...productData } = product;
  const images = getExportImages(productData);

  return {
    ...productData,
    productId: _id.toString(),
    categoryId: category?._id?.toString(),
    category: category?.name,
    images,
    imagePublicIds: uniqueValues(images.map(image => image.publicId)),
    translations,
  };
};

// Initialize adapter manager
const adapterManager = new ImportAdapterManager();

// Config: Max new categories per import (to prevent abuse)
const MAX_NEW_CATEGORIES_PER_IMPORT = 10;
const TRANSLATABLE_PRODUCT_FIELDS = ['name', 'description', 'brand', 'specs'];

const isDryRun = (value) => value === true || value === 'true';
const IMPORT_MODES = new Set(['insert', 'update', 'upsert']);

const findDuplicateImportIssues = (products) => {
  const seen = new Map();
  const issues = [];
  products.forEach((product, index) => {
    const identities = [
      ['productId', product.productId],
      ['sku', product.sku],
      ['name_brand', `${product.name}|${product.brand}`],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    identities.forEach(([field, value]) => {
      const key = `${field}:${String(value)}`;
      if (seen.has(key)) {
        issues.push({ index: index + 1, code: 'IMPORT_DUPLICATE_INPUT', field, value });
      } else {
        seen.set(key, index + 1);
      }
    });
  });
  return issues;
};

const toCategorySlug = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const toImportIssues = (issues, code) => issues.map((_, index) => ({
  code,
  index: index + 1,
}));

const importErrorMessageKeys = {
  IMPORT_DUPLICATE_KEY: 'admin-controllers-messages.duplicate_key_error',
  IMPORT_CATEGORY_LIMIT_EXCEEDED: 'admin-controllers-messages.too_many_new_categories',
  IMPORT_CATEGORY_UNRESOLVED: 'admin-controllers-messages.product_category_not_resolve',
  IMPORT_CATEGORY_NOT_FOUND: 'admin-controllers-messages.product_category_not_found',
  IMPORT_PRODUCTS_NOT_FOUND: 'admin-controllers-messages.products_not_found_count',
  IMPORT_PRODUCT_ID_REQUIRED_FOR_UPDATE: 'admin-controllers-messages.product_id_required_for_update',
};

const createImportError = (code, params) => {
  const error = new Error(code);
  error.code = code;
  error.params = params;
  return error;
};

const getImportErrorMessage = (lang, code, params) => getMessage(
  lang,
  importErrorMessageKeys[code] || 'admin-controllers-messages.error_importing_products',
  params
);

const getImportErrorStatus = (error) => (
  error?.name === 'ValidationError'
  || (typeof error?.code === 'string' && error.code.startsWith('IMPORT_'))
    ? 400
    : 500
);

const getImportProductId = (product) => (
  mongoose.Types.ObjectId.isValid(product.productId) ? product.productId.toString() : null
);

const getProductLookupFilter = (product) => {
  const productId = getImportProductId(product);
  if (productId) return { _id: productId, isDeleted: false };
  if (product.sku) return { sku: product.sku, isDeleted: false };
  return { name: product.name, brand: product.brand, isDeleted: false };
};

const getChangedTranslatableFields = (existing, product) => (
  TRANSLATABLE_PRODUCT_FIELDS.filter((field) => (
    JSON.stringify(existing[field] ?? null) !== JSON.stringify(product[field] ?? null)
  ))
);

const withoutImportProductId = (product) => {
  const { productId, translations, ...productData } = product;
  return productData;
};

const buildUpsertProductUpdate = (product, preserveExistingStock) => {
  const update = withoutImportProductId(product);
  if (preserveExistingStock) delete update.countInStock;
  return update;
};

const getProductTranslationImportRecords = (products) => {
  const defaultLanguage = getDefaultLanguage().code;
  return products.flatMap((product) => {
    if (!product.productId || !product.translations || typeof product.translations !== 'object') return [];

    return Object.entries(product.translations)
      .filter(([targetLang, translation]) => (
        targetLang !== defaultLanguage
        && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(targetLang)
        && translation
        && typeof translation === 'object'
        && !Array.isArray(translation)
        && translation.fallback !== true
      ))
      .map(([targetLang, translation]) => ({
        productId: String(product.productId),
        targetLang,
        translations: Object.fromEntries(
          ['name', 'description', 'brand', 'specs']
            .map(field => [field, translation[field]])
            .filter(([, value]) => value !== undefined && value !== null)
        ),
        manualFields: Array.isArray(translation.manualFields) ? translation.manualFields : [],
      }));
  });
};

const importProductTranslations = async (products) => {
  const records = getProductTranslationImportRecords(products);
  if (records.length === 0) return { imported: 0 };

  const operations = records.map(({ productId, targetLang, translations, manualFields }) => ({
    updateOne: {
      filter: { entityId: productId, targetLang },
      update: {
        $set: {
          ...translations,
          status: 'success',
          qualityStatus: 'approved',
          validationErrors: [],
          manualFields,
          lastTranslatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));
  await ProductCatalogTranslationCache.bulkWrite(operations);
  return { imported: records.length };
};

const getProductImagePublicIds = (product) => [
  product.imagePublicId,
  ...(Array.isArray(product.imagePublicIds) ? product.imagePublicIds : []),
].filter(Boolean);

const queueObsoleteProductImages = async (publicIds = []) => {
  await Promise.all([...new Set(publicIds)].map(publicId => enqueueCloudinaryCleanup(publicId)));
};

const findExistingProduct = (byId, bySku, byNameAndBrand, product) => {
  const productId = getImportProductId(product);
  if (productId) return byId.get(productId);
  if (product.sku) return bySku.get(product.sku);
  return byNameAndBrand.get(`${product.name}|${product.brand}`);
};

const addCategoryToMap = (categoryMap, category) => {
  const names = [category.name, ...(category.sourceNames || [])];
  names.filter(Boolean).forEach((name) => {
    categoryMap[name] = category._id;
    categoryMap[String(name).toLowerCase()] = category._id;
  });
};

async function invalidateChangedProductTranslations(affectedProducts = []) {
  if (affectedProducts.length === 0) {
    return {
      markedForRetranslation: 0,
      preservedManualTranslations: 0,
    };
  }

  const affectedFieldsByProduct = new Map(
    affectedProducts.map(({ productId, fields }) => [productId.toString(), fields])
  );
  const productIds = [...affectedFieldsByProduct.keys()];
  const caches = await ProductCatalogTranslationCache.find({
    entityId: { $in: productIds },
  }).lean();
  const operations = [];
  let preservedManualTranslations = 0;

  for (const cache of caches) {
    const changedFields = affectedFieldsByProduct.get(cache.entityId) || [];
    const hasMachineManagedChange = changedFields.some((field) => !cache.manualFields?.includes(field));
    if (!hasMachineManagedChange) {
      preservedManualTranslations++;
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: cache._id },
        update: {
          $set: {
            qualityStatus: 'needs_retranslate',
            validationErrors: ['source_content_changed'],
          },
        },
      },
    });
  }

  if (operations.length > 0) {
    await ProductCatalogTranslationCache.bulkWrite(operations);
  }

  await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { storefrontReady: false, storefrontReadinessCheckedAt: null } },
  );

  return {
    markedForRetranslation: operations.length,
    preservedManualTranslations,
  };
}

/**
 * Import products từ file upload (FormData)
 * @route POST /api/admin/products/import-file
 * @access Private/Admin
 * @body { file: File, format: 'json|csv', mode: 'insert|update|upsert', dryRun: boolean }
 *
 * Xử lý: Upload file → parse content → import products
 * Tương tự importProducts nhưng nhận file từ FormData
 */
const importProductsFromFile = asyncHandler(async (req, res) => {
  const { mode = 'upsert', dryRun = true } = req.body;
  const normalizedMode = typeof mode === 'string' ? mode.toLowerCase() : '';
  if (!IMPORT_MODES.has(normalizedMode)) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_MODE_UNSUPPORTED',
      message: getMessage(req.lang, 'errors.generic_error'),
      supportedModes: [...IMPORT_MODES],
    });
  }
  const allowCreateReferences = req.body.allowCreateReferences === true || req.body.allowCreateReferences === 'true';
  const adminUserId = req.user._id;

  // Validate file
  if (!req.file) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_FILE_REQUIRED',
      message: getMessage(req.lang, 'admin-controllers-messages.please_upload_file'),
    });
  }


  try {
    const file = req.file;

    if (!file.buffer) {
      const error = new Error(getMessage(req.lang, 'admin-controllers-messages.file_buffer_missing'));
      error.code = 'IMPORT_FILE_BUFFER_MISSING';
      throw error;
    }

    const fileContent = file.buffer.toString('utf-8');

    const format = req.importFile?.format;
    if (!format) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_FILE_INVALID',
        message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported'),
      });
    }

    // Parse file content sử dụng adapter
    const adapter = adapterManager.getAdapter(format);
    if (!adapter) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_FORMAT_UNSUPPORTED',
        message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format }),
      });
    }

    let parsedProducts;
    try {
      parsedProducts = await adapter.parse(fileContent);
    } catch (parseError) {
      console.error('[IMPORT_FILE_PARSE_ERROR]', parseError);
      return res.status(400).json({
        success: false,
        code: 'IMPORT_FILE_PARSE_FAILED',
        message: getMessage(req.lang, 'errors.generic_error'),
      });
    }

    // Validate format
    const validation = await adapterManager.validate(parsedProducts, format);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_DATA_INVALID',
        message: getMessage(req.lang, 'admin-controllers-messages.invalid_import_data', { count: validation.errors.length }),
        errors: toImportIssues(validation.errors, 'IMPORT_PRODUCT_INVALID'),
        warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
        invalidProducts: validation.invalidProducts,
      });
    }

    // Thông báo warnings
    if (validation.warnings.length > 0) {
    }


    const validProducts = validation.validProducts.map((product) => ({
      ...product,
      specs: normalizeSpecs(product.specs || {}),
    }));
    const duplicateIssues = findDuplicateImportIssues(validProducts);
    if (duplicateIssues.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_DUPLICATE_INPUT',
        message: getMessage(req.lang, 'errors.generic_error'),
        errors: duplicateIssues,
      });
    }

    if (normalizedMode === 'update' && validProducts.some((product) => (
      !getImportProductId(product)
    ))) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_PRODUCT_ID_REQUIRED_FOR_UPDATE',
        message: getImportErrorMessage(req.lang, 'IMPORT_PRODUCT_ID_REQUIRED_FOR_UPDATE'),
      });
    }

    if (isDryRun(dryRun)) {
      return res.json({
        success: true,
        message: getMessage(req.lang, 'admin-controllers-messages.dry_run_preview_import'),
        dryRun: true,
        format,
        mode,
        totalProducts: validProducts.length,
        createdCategories: [],
        warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
        preview: validProducts.slice(0, 3),
      });
    }

    await registerUnknownSpecKeys(validProducts);

    // Map category names → IDs (Filter isDeleted = false)
    const categoryMap = {};
    const categories = await Category.find({ isDeleted: false });
    categories.forEach(cat => addCategoryToMap(categoryMap, cat));

    if (!allowCreateReferences) {
      const missingCategory = validProducts.find(product => (
        !categoryMap[product.category]
        && !categoryMap[String(product.category).toLowerCase()]
        && !mongoose.Types.ObjectId.isValid(product.category)
      ));
      if (missingCategory) {
        throw createImportError('IMPORT_CATEGORY_NOT_FOUND', {
          name: missingCategory.name,
          category: missingCategory.category,
        });
      }

    }

    // Pre-identify missing categories and create them in bulk.
    if (process.env.NODE_ENV === 'development') {
      console.time(`${CLI_SYMBOLS.duration} Bulk category creation`);
    }

    const createdCategories = [];

    // Identify missing categories
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.search} Scanning for missing categories...`);
    }
    const categoriesToCreate = [];
    const categoryLookup = new Map();

    for (const product of validProducts) {
      let categoryId = categoryMap[product.category] || categoryMap[String(product.category).toLowerCase()];
      if (!categoryId && mongoose.Types.ObjectId.isValid(product.category)) {
        categoryId = product.category;
      }

      if (!categoryId) {
        const sanitizedName = sanitizeCategoryName(product.category);
        if (!categoryLookup.has(sanitizedName)) {
          const validation = validateCategoryName(product.category);
          if (!validation.isValid) {
            throw createImportError('IMPORT_CATEGORY_NAME_INVALID', { name: product.category });
          }

          categoryLookup.set(sanitizedName, null); // Mark for creation
          const slug = toCategorySlug(sanitizedName);
          categoriesToCreate.push({
            name: sanitizedName,
            key: slug.replace(/-/g, '_'),
            slug,
            isDeleted: false,
          });
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.chart} Found ${categoriesToCreate.length} categories to create`);
    }

    if (categoriesToCreate.length > MAX_NEW_CATEGORIES_PER_IMPORT) {
      throw createImportError('IMPORT_CATEGORY_LIMIT_EXCEEDED', {
        count: categoriesToCreate.length,
        max: MAX_NEW_CATEGORIES_PER_IMPORT,
      });
    }

    // Bulk create missing categories
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.save} Bulk creating categories...`);
    }
    if (categoriesToCreate.length > 0) {
      try {
        const newCategories = await Category.insertMany(categoriesToCreate, { ordered: false });
        newCategories.forEach(cat => {
          categoryLookup.set(cat.name, cat._id);
          categoryMap[cat.name] = cat._id;
          categoryMap[cat.name.toLowerCase()] = cat._id;
          createdCategories.push(cat.name);
        });
        if (process.env.NODE_ENV === 'development') {
          console.log(`${CLI_SYMBOLS.success} Created ${newCategories.length} categories`);
        }
      } catch (err) {
        if (err.code === 11000) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`${CLI_SYMBOLS.warning} Some categories already exist, fetching them...`);
          }
          for (const { name } of categoriesToCreate) {
            const existing = await Category.findOne({ name, isDeleted: false });
            if (existing) {
              categoryLookup.set(name, existing._id);
              categoryMap[name] = existing._id;
              categoryMap[name.toLowerCase()] = existing._id;
            }
          }
        } else {
          throw err;
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`${CLI_SYMBOLS.duration} Bulk category creation`);
    }

    // Now enrich all products in a single pass (category already resolved)
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.edit} Enriching products with resolved IDs...`);
    }
    const enrichedProducts = validProducts.map((product, idx) => {
      const enriched = { ...product, user: adminUserId };

      // Resolve category
      let categoryId = categoryMap[product.category] || categoryMap[String(product.category).toLowerCase()];
      if (!categoryId && mongoose.Types.ObjectId.isValid(product.category)) {
        categoryId = product.category;
      }
      if (!categoryId) {
        const sanitizedName = sanitizeCategoryName(product.category);
        categoryId = categoryLookup.get(sanitizedName);
      }
      if (!categoryId) {
        throw createImportError('IMPORT_CATEGORY_UNRESOLVED', { idx: idx + 1 });
      }
      enriched.category = categoryId;

      return enriched;
    });

    console.log(`[FILE_UPLOAD] ${CLI_SYMBOLS.success} Successfully enriched ${enrichedProducts.length} products (created ${createdCategories.length} categories)`);


    // Xử lý theo mode
    let results;
    switch (normalizedMode) {
      case 'insert':
        results = await handleInsertMode(enrichedProducts);
        break;
      case 'update':
        results = await handleUpdateMode(enrichedProducts);
        break;
      case 'upsert':
      default:
        results = await handleUpsertMode(enrichedProducts);
    }

    await queueObsoleteProductImages(results.obsoleteImagePublicIds);
    const translationSummary = await invalidateChangedProductTranslations(results.affectedTranslations);
    const importedTranslationSummary = await importProductTranslations(validProducts);
    res.json({
      success: true,
      code: 'IMPORT_COMPLETED',
      message: getMessage(req.lang, 'frontend-import.import_success'),
      format,
      mode,
      results: {
        ...results,
        affectedTranslations: undefined,
        obsoleteImagePublicIds: undefined,
      },

      translationSummary,
      createdCategories,
      warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
    });
  } catch (error) {

    console.error('[IMPORT_FILE_ERROR]', error);
    res.status(getImportErrorStatus(error)).json({
      success: false,
      code: error.code || 'IMPORT_FILE_FAILED',
      params: error.params,
      message: getImportErrorMessage(req.lang, error.code, error.params),
    });
  }
});

/**
 * Import products từ JSON, CSV, hoặc các format khác
 * @route POST /api/admin/products/import
 * @access Private/Admin
 * @body { data: String|Object, format: 'json|csv', mode: 'insert|update|upsert' }
 *
 * Examples:
 * 1. JSON: { data: {...}, format: "json", ... }
 * 2. CSV: { data: "name,price,...\nProduct,1000,...", format: "csv", ... }
 */
const importProducts = asyncHandler(async (req, res) => {
  const { data, products, format = 'json', mode = 'upsert', dryRun = false } = req.body;
  const preserveExistingStock = req.seedOptions?.preserveExistingStock === true;
  const normalizedMode = typeof mode === 'string' ? mode.toLowerCase() : '';
  if (!IMPORT_MODES.has(normalizedMode)) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_MODE_UNSUPPORTED',
      message: getMessage(req.lang, 'errors.generic_error'),
      supportedModes: [...IMPORT_MODES],
    });
  }
  const adminUserId = req.user._id;

  // Validate input
  if (!data && !products) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_DATA_REQUIRED',
      message: getMessage(req.lang, 'admin-controllers-messages.missing_data_products_field'),
      supportedFormats: adapterManager.getSupportedFormats(),
    });
  }

  // Check format support
  if (!adapterManager.supports(format)) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_FORMAT_UNSUPPORTED',
      message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format }),
      supportedFormats: adapterManager.getSupportedFormats(),
    });
  }


  try {
    // Parse every raw payload through the adapter so crawler field names are normalized.
    const adapter = adapterManager.getAdapter(format);
    const parsedProducts = Array.isArray(products) && !data
      ? products
      : await adapter.parse(data || products);

    // Validate format
    const validation = await adapterManager.validate(parsedProducts, format);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_DATA_INVALID',
        message: getMessage(req.lang, 'admin-controllers-messages.invalid_import_data', { count: validation.errors.length }),
        errors: toImportIssues(validation.errors, 'IMPORT_PRODUCT_INVALID'),
        warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
        invalidProducts: validation.invalidProducts,
      });
    }

    // Thông báo warnings
    if (validation.warnings.length > 0) {
    }


    const validProducts = validation.validProducts.map((product) => ({
      ...product,
      specs: normalizeSpecs(product.specs || {}),
    }));
    const duplicateIssues = findDuplicateImportIssues(validProducts);
    if (duplicateIssues.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_DUPLICATE_INPUT',
        message: getMessage(req.lang, 'errors.generic_error'),
        errors: duplicateIssues,
      });
    }

    if (normalizedMode === 'update' && validProducts.some((product) => (
      !getImportProductId(product)
    ))) {
      return res.status(400).json({
        success: false,
        code: 'IMPORT_PRODUCT_ID_REQUIRED_FOR_UPDATE',
        message: getImportErrorMessage(req.lang, 'IMPORT_PRODUCT_ID_REQUIRED_FOR_UPDATE'),
      });
    }

    if (isDryRun(dryRun)) {
      return res.json({
        success: true,
        message: getMessage(req.lang, 'admin-controllers-messages.dry_run_preview_import'),
        dryRun: true,
        format,
        mode,
        totalProducts: validProducts.length,
        warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
        preview: validProducts.slice(0, 3),
      });
    }

    await registerUnknownSpecKeys(validProducts);

    // Map category names → IDs (FIX #1: Filter isDeleted = false)
    const categoryMap = {};
    const categories = await Category.find({ isDeleted: false });
    categories.forEach(cat => addCategoryToMap(categoryMap, cat));

    // Enrich products with category IDs
    const enrichedProducts = validProducts.map(product => {
      const enriched = { ...product, user: adminUserId };

      // Resolve category
      let categoryId = categoryMap[product.category]
        || categoryMap[String(product.category).toLowerCase()];
      if (!categoryId && mongoose.Types.ObjectId.isValid(product.category)) {
        categoryId = product.category;
      }
      if (!categoryId) {
        throw createImportError('IMPORT_CATEGORY_NOT_FOUND', {
          name: product.name,
          category: product.category,
        });
      }
      enriched.category = categoryId;

      return enriched;
    });

    // Xử lý theo mode
    let results;
    switch (normalizedMode) {
      case 'insert':
        results = await handleInsertMode(enrichedProducts);
        break;
      case 'update':
        results = await handleUpdateMode(enrichedProducts);
        break;
      case 'upsert':
      default:
        results = await handleUpsertMode(enrichedProducts, preserveExistingStock);
    }

    await queueObsoleteProductImages(results.obsoleteImagePublicIds);
    const translationSummary = await invalidateChangedProductTranslations(results.affectedTranslations);
    const importedTranslationSummary = await importProductTranslations(validProducts);
    res.json({
      success: true,
      message: getMessage(req.lang, 'frontend-import.import_success'),
      format,
      mode,
      results: {
        ...results,
        affectedTranslations: undefined,
        obsoleteImagePublicIds: undefined,
      },

      translationSummary,
      importedTranslationSummary,
      warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
    });
  } catch (error) {

    if (process.env.NODE_ENV === 'development') {
      console.error('[IMPORT_TEXT_ERROR]', error);
      console.error('[IMPORT_TEXT_ERROR_STACK]', error.stack);
    }
    res.status(getImportErrorStatus(error)).json({
      success: false,
      code: error.code || 'IMPORT_FAILED',
      params: error.params,
      message: getImportErrorMessage(req.lang, error.code, error.params),
    });
  }
});

/**
 * Insert mode: Chỉ thêm mới (skip nếu trùng)
 * FIX #4: Use bulkWrite instead of loop for better performance
 */
async function handleInsertMode(products) {
  // First, find all existing products to skip
  const existingProducts = await Product.find(
    {
      isDeleted: false,
      $or: products.map(getProductLookupFilter),
    },
    { name: 1, brand: 1, sku: 1 }
  );

  const existingKeys = new Set(existingProducts.flatMap((product) => [
    product.sku ? `sku:${product.sku}` : null,
    `name:${product.name}|${product.brand}`,
  ].filter(Boolean)));
  // Separate products into insert and skip
  const toInsert = [];
  const skipped = [];

  products.forEach(product => {
    const key = product.sku ? `sku:${product.sku}` : `name:${product.name}|${product.brand}`;
    const exists = existingKeys.has(key);
    if (exists) {
      skipped.push({ name: product.name, brand: product.brand, reasonCode: 'IMPORT_PRODUCT_EXISTS' });
    } else {
      toInsert.push(withoutImportProductId(product));
    }
  });

  // Bulk insert
  let insertedCount = 0;
  if (toInsert.length > 0) {
    const result = await Product.insertMany(toInsert, { ordered: false });
    insertedCount = result.length;
  }

  return {
    inserted: insertedCount,
    updated: 0,
    skipped: skipped.length,
    skipped,
    affectedTranslations: [],
    obsoleteImagePublicIds: [],
  };
}

/**
 * Update mode: Chỉ cập nhật cũ (lỗi nếu không tìm)
 * OPTIMIZATION: Bulk fetch existing products with $in instead of looping findOne
 * FIX #2: Enrich category trước khi update
 */
async function handleUpdateMode(productsWithEnrichedIds) {
  const updated = [];
  const notFound = [];
  const filters = productsWithEnrichedIds.map(getProductLookupFilter);
  const existingProducts = await Product.find({ $or: filters, isDeleted: false }).lean();
  const existingById = new Map(existingProducts.map((product) => [product._id.toString(), product]));
  const existingBySku = new Map(existingProducts.filter(product => product.sku).map((product) => [product.sku, product]));
  const existingByNameAndBrand = new Map(existingProducts.map((product) => [`${product.name}|${product.brand}`, product]));

  const bulkOps = [];
  const affectedTranslations = [];
  const obsoleteImagePublicIds = [];

  for (const product of productsWithEnrichedIds) {
    const existing = findExistingProduct(existingById, existingBySku, existingByNameAndBrand, product);
    if (!existing) {
      notFound.push({ name: product.name, brand: product.brand });
      continue;
    }

    const changedFields = getChangedTranslatableFields(existing, product);
    obsoleteImagePublicIds.push(
      ...getProductImagePublicIds(existing).filter(publicId => !getProductImagePublicIds(product).includes(publicId))
    );
    const updateDoc = withoutImportProductId(product);
    delete updateDoc.user;
    bulkOps.push({
      updateOne: {
        filter: { _id: existing._id, isDeleted: false },
        update: { $set: updateDoc },
      },
    });
    updated.push(existing._id);
    if (changedFields.length > 0) {
      affectedTranslations.push({ productId: existing._id, fields: changedFields });
    }
  }

  if (notFound.length > 0) {
    throw createImportError('IMPORT_PRODUCTS_NOT_FOUND', { count: notFound.length });
  }

  if (bulkOps.length > 0) {
    await Product.bulkWrite(bulkOps);
  }

  return {
    inserted: 0,
    updated: updated.length,
    skipped: 0,
    notFound,
    affectedTranslations,
    obsoleteImagePublicIds,
  };
}

/**
 * Upsert mode: Thêm mới hoặc cập nhật
 * FIX #4: Use bulkWrite for atomic operation and better performance
 * Single DB operation instead of N queries
 */
async function handleUpsertMode(products, preserveExistingStock = false) {
  const filters = products.map(getProductLookupFilter);
  const existingProducts = await Product.find({ $or: filters, isDeleted: false }).lean();
  const existingById = new Map(existingProducts.map((product) => [product._id.toString(), product]));
  const existingBySku = new Map(existingProducts.filter(product => product.sku).map((product) => [product.sku, product]));
  const existingByNameAndBrand = new Map(existingProducts.map((product) => [`${product.name}|${product.brand}`, product]));

  const affectedTranslations = [];
  const obsoleteImagePublicIds = [];
  const bulkOps = products.map((product) => {
    const existing = findExistingProduct(existingById, existingBySku, existingByNameAndBrand, product);
    if (existing) {
      obsoleteImagePublicIds.push(
        ...getProductImagePublicIds(existing).filter(publicId => !getProductImagePublicIds(product).includes(publicId))
      );
      const changedFields = getChangedTranslatableFields(existing, product);
      if (changedFields.length > 0) {
        affectedTranslations.push({ productId: existing._id, fields: changedFields });
      }
    }

    return {
      updateOne: {
        filter: existing
          ? { _id: existing._id, isDeleted: false }
          : getProductLookupFilter(product),
        update: { $set: buildUpsertProductUpdate(product, preserveExistingStock && Boolean(existing)) },
        upsert: true,
      },
    };
  });

  try {
    const result = await Product.bulkWrite(bulkOps);
    return {
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
      unchanged: result.matchedCount - result.modifiedCount,
      skipped: 0,
      affectedTranslations,
      obsoleteImagePublicIds,
    };
  } catch (error) {
    if (error.code === 11000) {
      console.error('Duplicate key error during upsert:', error.message);
      const importError = new Error('IMPORT_DUPLICATE_KEY');
      importError.code = 'IMPORT_DUPLICATE_KEY';
      throw importError;
    }
    throw error;
  }
}

/**
 * Get import template cho format
 * @route GET /api/admin/products/import-template?format=json|csv
 * @access Private/Admin
 */
const getImportTemplate = asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;

  if (!adapterManager.supports(format)) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_FORMAT_UNSUPPORTED',
      message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format }),
      supportedFormats: adapterManager.getSupportedFormats(),
    });
  }

  const template = adapterManager.getTemplate(format);

  if (format.toLowerCase() === 'csv') {
    // Return CSV as plain text
    res.setHeader('Content-Type', 'text/csv');
    res.send(template);
  } else {
    // Return JSON template
    res.json({
      success: true,
      format,
      template: JSON.parse(template || '{}'),
    });
  }
});

/**
 * Get list supported formats
 * @route GET /api/admin/products/import-formats
 * @access Private/Admin
 */
const getImportFormats = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    supportedFormats: adapterManager.getSupportedFormats(),
    adapters: adapterManager.listAdapters(),
  });
});

/**
 * Get import guide
 * @route GET /api/admin/products/import-guide
 * @access Private/Admin
 */
const getImportGuide = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    code: 'IMPORT_GUIDE',
    supportedFormats: adapterManager.getSupportedFormats(),
    adapters: adapterManager.listAdapters(),
    guide: {
      title: getMessage(req.lang, 'admin-controllers-messages.import_guide_title'),
      step1: getMessage(req.lang, 'admin-controllers-messages.import_guide_step1'),
      step2: getMessage(req.lang, 'admin-controllers-messages.import_guide_step2'),
      step3: getMessage(req.lang, 'admin-controllers-messages.import_guide_step3'),
      step4: getMessage(req.lang, 'admin-controllers-messages.import_guide_step4'),
      step5: getMessage(req.lang, 'admin-controllers-messages.import_guide_step5'),
    },
    requiredFields: ['name', 'brand', 'price', 'baseCurrencyCode', 'category'],
    optionalFields: [
      'productId', 'sku', 'sourceProductId', 'sourceUrl', 'originalPrice', 'image', 'imagePublicId', 'imagePublicIds', 'images', 'countInStock', 'specs',
      'rating', 'numReviews', 'featured', 'deal',
    ],
    fieldDetails: {
      productId: {
        format: 'MongoDB ObjectId from a product export',
        requiredFor: ['update'],
        note: 'Required for update mode. Keep this value when updating exported products so their existing translations can be refreshed correctly.',
      },
      specs: {
        format: 'JSON | In CSV use: specs_fieldName (e.g., specs_weight, specs_connection)',
        example: '{"weight": "54g", "connection": "Wireless"}',
      },
      deal: {
        format: 'JSON object in JSON | Separate columns in CSV (deal_discount, deal_endTime)',
        csvFormat: 'Use deal_discount and deal_endTime columns',
        exampleJson: '{"discount": 15, "endTime": "2026-12-31"}',
        exampleCsv: 'deal_discount=15, deal_endTime="2026-12-31"',
        note: 'discount: 0-100 (%), endTime must be a valid date',
      },
      images: {
        format: 'Array in JSON | Pipe-separated string in CSV',
        example: 'In CSV: "https://url1.jpg|https://url2.jpg"',
      },
    },
  });
});

/**
 * Export products từ database sang JSON/CSV
 * @route GET /api/admin/products/export
 * @access Private/Admin
 * @query { format: 'json|csv', category?: string, brand?: string, limit?: number }
 *
 * Examples:
 * 1. Export all products as JSON: GET /api/admin/products/export?format=json
 * 2. Export CSV by category: GET /api/admin/products/export?format=csv&category=Keyboard
 * 3. Export limited products: GET /api/admin/products/export?format=json&limit=100
 */
const createExportError = (statusCode, code, details = {}) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.errorCode = code;
  error.details = details;
  return error;
};

const sendExportError = (req, res, error) => {
  if (req.aborted || res.destroyed) return;
  if (res.headersSent) {
    if (!res.writableEnded) res.destroy(error);
    return;
  }

  const isTimeout = /timed out|timeout/i.test(error.message || '');
  const statusCode = error.statusCode || (isTimeout ? 503 : 500);
  const code = error.errorCode || (isTimeout ? 'EXPORT_SERVICE_UNAVAILABLE' : 'EXPORT_FAILED');
  const message = getMessage(req.lang, isTimeout ? 'common.error_server_desc' : 'errors.generic_error');

  res.status(statusCode).json({
    success: false,
    code,
    message,
    error: message,
    details: error.details || { reason: error.message || error.name },
    timestamp: new Date().toISOString(),
  });
};

const getRequestedExportLocales = async (requestedLocales) => {
  const configuredLocales = getConfiguredExportLocales().filter(isSupportedLanguage);
  const requested = requestedLocales === undefined
    ? []
    : requestedLocales.split(',').map(normalizeExportLocale);

  if (requested.some(locale => !locale)) {
    throw createExportError(400, 'EXPORT_LOCALES_INVALID', { locales: requestedLocales });
  }

  const unsupportedLocales = requested.filter(locale => !isSupportedLanguage(locale));
  if (unsupportedLocales.length > 0) {
    throw createExportError(400, 'EXPORT_LOCALES_UNSUPPORTED', { locales: unsupportedLocales });
  }

  let activeLocales = [];
  try {
    activeLocales = (await withExportTimeout(
      LanguageService.getActiveLanguageCodes({ maxTimeMS: EXPORT_QUERY_TIMEOUT_MS }),
      'active_languages',
    ))
      .map(normalizeExportLocale)
      .filter(isSupportedLanguage);
  } catch (error) {
    console.error('[EXPORT_LANGUAGE_LOOKUP_ERROR]', { message: error.message });
  }

  let defaultLocale = getDefaultLanguage().code;
  try {
    const databaseDefaultLanguage = await withExportTimeout(
      Language.findOne({ isSystemDefault: true }, { code: 1 })
        .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
        .lean(),
      'default_language',
    );
    const databaseDefaultLocale = normalizeExportLocale(databaseDefaultLanguage?.code);
    if (databaseDefaultLocale && isSupportedLanguage(databaseDefaultLocale)) {
      defaultLocale = databaseDefaultLocale;
    }
  } catch (error) {
    console.error('[EXPORT_DEFAULT_LANGUAGE_LOOKUP_ERROR]', { message: error.message });
  }

  const locales = uniqueValues(
    requested.length
      ? requested
      : [
        ...(configuredLocales.length ? configuredLocales : activeLocales),
        defaultLocale,
      ],
  ).filter(isSupportedLanguage);

  if (locales.length > MAX_EXPORT_LOCALES) {
    throw createExportError(400, 'EXPORT_LOCALES_TOO_MANY', {
      maxLocales: MAX_EXPORT_LOCALES,
      locales,
    });
  }

  return { locales, defaultLocale };
};

const getPayloadBatches = payload => payload.products
  ? (async function* () { yield payload.products; }())
  : payload.productBatches
    ? payload.productBatches()
    : (async function* () { yield []; }());

const EXPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EXPORT_IMAGE_DOWNLOAD_CONCURRENCY = 4;
const EXPORT_IMAGE_FETCH_ATTEMPTS = 3;
const EXPORT_IMAGE_RETRY_BASE_DELAY_MS = 1000;
const EXPORT_IMAGE_RETRY_MAX_DELAY_MS = 8000;
const EXPORT_IMAGE_RETRY_JITTER_RATIO = 0.25;
const EXPORT_DEBUG_IMAGES = process.env.EXPORT_DEBUG_IMAGES === 'true';
const EXPORT_IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

const createExportImageStats = () => ({
  productsWithImages: 0,
  imageReferences: 0,
  referencesWithUrl: 0,
  referencesWithoutUrl: 0,
  referencesWithAssetPath: 0,
  referencesWithoutAssetPath: 0,
  uniqueUrlsAttempted: 0,
  uniqueUrlsSucceeded: 0,
  uniqueUrlsSkipped: 0,
  downloadedBytes: 0,
  skippedByCode: {},
  skippedSamples: [],
  missingAssetSamples: [],
});

const getImageDebugContext = (product, image, imageIndex) => {
  let parsedUrl = null;
  try {
    parsedUrl = image?.url ? new URL(image.url) : null;
  } catch {
    parsedUrl = null;
  }

  return {
    productId: product.productId || null,
    position: image?.position ?? imageIndex,
    type: image?.type || null,
    host: parsedUrl?.hostname || null,
    path: parsedUrl?.pathname || null,
  };
};

const recordImageSkip = (stats, error, context) => {
  if (!stats) return;
  const code = error.errorCode || error.code || 'failed';
  stats.uniqueUrlsSkipped += 1;
  stats.skippedByCode[code] = (stats.skippedByCode[code] || 0) + 1;
  if (stats.skippedSamples.length < 20) {
    stats.skippedSamples.push({
      ...context,
      code,
      reason: error.details?.reason || error.message,
    });
  }
};

const hasValidImageSignature = (buffer, contentType) => {
  if (contentType === 'image/jpeg') {
    return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (contentType === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/gif') {
    return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  }
  if (contentType === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType === 'image/avif') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      && ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii'));
  }
  if (contentType === 'image/svg+xml') {
    const text = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
    return text.includes('<svg') || (text.startsWith('<?xml') && text.includes('<svg'));
  }
  return false;
};

const waitForExportImageRetry = (delayMs, requestSignal) => new Promise((resolve, reject) => {
  if (requestSignal?.aborted) {
    reject(new Error('Export image download aborted'));
    return;
  }

  let timer;
  const onAbort = () => {
    clearTimeout(timer);
    requestSignal?.removeEventListener('abort', onAbort);
    reject(new Error('Export image download aborted'));
  };
  timer = setTimeout(() => {
    requestSignal?.removeEventListener('abort', onAbort);
    resolve();
  }, delayMs);
  requestSignal?.addEventListener('abort', onAbort, { once: true });
});

const getExportImageRetryDelay = attempt => {
  const exponentialDelay = Math.min(
    EXPORT_IMAGE_RETRY_MAX_DELAY_MS,
    EXPORT_IMAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
  );
  const jitter = Math.floor(exponentialDelay * EXPORT_IMAGE_RETRY_JITTER_RATIO * Math.random());
  return exponentialDelay + jitter;
};

const isRetryableExportImageStatus = status => (
  [408, 425, 429].includes(status) || status >= 500
);

const downloadExportImage = async (sourceUrl, requestSignal) => {
  const startedAt = Date.now();
  let parsedUrl;
  let responseStatus = null;
  let responseContentType = null;
  let totalBytes = 0;
  let outcome = 'failed';

  try {
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw createExportError(502, 'EXPORT_IMAGE_URL_INVALID', { url: sourceUrl });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw createExportError(502, 'EXPORT_IMAGE_URL_INVALID', { url: sourceUrl });
    }

    const debugContext = {
      host: parsedUrl.hostname,
      path: parsedUrl.pathname,
    };
    if (EXPORT_DEBUG_IMAGES) {
      console.info('[EXPORT_IMAGE_DOWNLOAD_START]', debugContext);
    }

    let response;
    let lastFetchError = null;
    for (let attempt = 1; attempt <= EXPORT_IMAGE_FETCH_ATTEMPTS; attempt += 1) {
      try {
        response = await fetch(parsedUrl, {
          headers: {
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'User-Agent': 'LaptopStoreExport/1.0',
          },
          signal: requestSignal
            ? AbortSignal.any([requestSignal, AbortSignal.timeout(30000)])
            : AbortSignal.timeout(30000),
          redirect: 'follow',
        });
        responseStatus = response.status;
        if (response.ok || !isRetryableExportImageStatus(response.status) || attempt === EXPORT_IMAGE_FETCH_ATTEMPTS) {
          break;
        }
        if (response.body) await response.body.cancel().catch(() => {});
        await waitForExportImageRetry(getExportImageRetryDelay(attempt), requestSignal);
      } catch (error) {
        lastFetchError = error;
        if (requestSignal?.aborted || attempt === EXPORT_IMAGE_FETCH_ATTEMPTS) {
          throw createExportError(502, 'EXPORT_IMAGE_DOWNLOAD_FAILED', {
            url: sourceUrl,
            reason: error.message,
            attempts: attempt,
          });
        }
        await waitForExportImageRetry(getExportImageRetryDelay(attempt), requestSignal);
      }
    }

    if (!response && lastFetchError) {
      throw createExportError(502, 'EXPORT_IMAGE_DOWNLOAD_FAILED', {
        url: sourceUrl,
        reason: lastFetchError.message,
        attempts: EXPORT_IMAGE_FETCH_ATTEMPTS,
      });
    }

    if (!response.ok) {
      throw createExportError(502, 'EXPORT_IMAGE_DOWNLOAD_FAILED', {
        url: sourceUrl,
        status: response.status,
      });
    }

    const contentType = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    responseContentType = contentType;
    const extension = EXPORT_IMAGE_EXTENSIONS[contentType];
    if (!extension) {
      throw createExportError(502, 'EXPORT_IMAGE_TYPE_UNSUPPORTED', {
        url: sourceUrl,
        contentType,
      });
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > EXPORT_IMAGE_MAX_BYTES) {
      throw createExportError(502, 'EXPORT_IMAGE_TOO_LARGE', {
        url: sourceUrl,
        maxBytes: EXPORT_IMAGE_MAX_BYTES,
      });
    }

    if (!response.body) {
      throw createExportError(502, 'EXPORT_IMAGE_DOWNLOAD_FAILED', {
        url: sourceUrl,
        reason: 'empty_response_body',
      });
    }

    const reader = response.body.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > EXPORT_IMAGE_MAX_BYTES) {
          await reader.cancel();
          throw createExportError(502, 'EXPORT_IMAGE_TOO_LARGE', {
            url: sourceUrl,
            maxBytes: EXPORT_IMAGE_MAX_BYTES,
          });
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error.errorCode) throw error;
      throw createExportError(502, 'EXPORT_IMAGE_DOWNLOAD_FAILED', {
        url: sourceUrl,
        reason: error.message,
      });
    }

    if (totalBytes === 0) {
      throw createExportError(502, 'EXPORT_IMAGE_EMPTY', {
        url: sourceUrl,
      });
    }

    const buffer = Buffer.concat(chunks, totalBytes);
    if (!hasValidImageSignature(buffer, contentType)) {
      throw createExportError(502, 'EXPORT_IMAGE_CONTENT_INVALID', {
        url: sourceUrl,
        contentType,
        bytes: totalBytes,
      });
    }

    outcome = 'success';
    return {
      buffer,
      extension,
      contentType,
    };
  } catch (error) {
    outcome = error.errorCode || error.code || 'failed';
    throw error;
  } finally {
    if (EXPORT_DEBUG_IMAGES) {
      console.info('[EXPORT_IMAGE_DOWNLOAD_END]', {
        host: parsedUrl?.hostname || null,
        path: parsedUrl?.pathname || null,
        status: responseStatus,
        contentType: responseContentType,
        bytes: totalBytes,
        outcome,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }
};

const prepareExportBatchForArchive = async (
  archive,
  batch,
  assetsByUrl,
  requestSignal,
  exportImageStats,
) => {
  const preparedImagesByProduct = batch.map(product => (
    Array.isArray(product.images) ? [...product.images] : []
  ));
  const imageTasks = [];

  batch.forEach((product, productIndex) => {
    const images = Array.isArray(product.images) ? product.images : [];
    if (images.length > 0 && exportImageStats) exportImageStats.productsWithImages += 1;
    images.forEach((image, imageIndex) => {
      if (exportImageStats) {
        exportImageStats.imageReferences += 1;
        if (image?.url) exportImageStats.referencesWithUrl += 1;
        else exportImageStats.referencesWithoutUrl += 1;
      }

      if (image?.url) {
        imageTasks.push({ product, productIndex, image, imageIndex });
      }
    });
  });

  let nextTaskIndex = 0;
  const processImageTasks = async () => {
    while (nextTaskIndex < imageTasks.length) {
      const task = imageTasks[nextTaskIndex];
      nextTaskIndex += 1;
      const { product, productIndex, image, imageIndex } = task;

      let assetPromise = assetsByUrl.get(image.url);
      if (!assetPromise) {
        if (exportImageStats) exportImageStats.uniqueUrlsAttempted += 1;
        const debugContext = getImageDebugContext(product, image, imageIndex);
        assetPromise = downloadExportImage(image.url, requestSignal)
          .then(({ buffer, extension }) => {
            const assetPath = `assets/images/${product.productId}-${image.position}.${extension}`;
            archive.append(buffer, { name: assetPath });
            if (exportImageStats) {
              exportImageStats.uniqueUrlsSucceeded += 1;
              exportImageStats.downloadedBytes += buffer.length;
            }
            return assetPath;
          })
          .catch((error) => {
            if (requestSignal?.aborted) throw error;
            recordImageSkip(exportImageStats, error, debugContext);
            console.warn('[EXPORT_IMAGE_ASSET_SKIPPED]', {
              ...debugContext,
              code: error.errorCode,
              message: error.message,
              reason: error.details?.reason,
            });
            return null;
          });
        assetsByUrl.set(image.url, assetPromise);
      }

      const assetPath = await assetPromise;
      preparedImagesByProduct[productIndex][imageIndex] = assetPath
        ? { ...image, assetPath }
        : image;
    }
  };

  const workerCount = Math.min(
    EXPORT_IMAGE_DOWNLOAD_CONCURRENCY,
    imageTasks.length,
  );
  await Promise.all(
    Array.from({ length: workerCount }, processImageTasks),
  );

  return batch.map((product, productIndex) => {
    const preparedImages = preparedImagesByProduct[productIndex];
    const imageAssetPaths = uniqueValues(preparedImages.map(image => image?.assetPath));

    if (exportImageStats) {
      exportImageStats.referencesWithAssetPath += preparedImages.filter(image => image?.assetPath).length;
      exportImageStats.referencesWithoutAssetPath += preparedImages.filter(image => (
        image?.url && !image?.assetPath
      )).length;
      preparedImages
        .filter(image => image?.url && !image?.assetPath)
        .slice(0, Math.max(0, 20 - exportImageStats.missingAssetSamples.length))
        .forEach(image => {
          exportImageStats.missingAssetSamples.push(getImageDebugContext(product, image));
        });
    }

    return {
      ...product,
      images: preparedImages,
      ...(imageAssetPaths.length ? { imageAssetPaths } : {}),
    };
  });
};

const getCSVHeadersFromBatches = async payload => {
  const headers = new Set(STANDARD_CSV_HEADERS);
  const specKeys = new Set();
  for await (const batch of getPayloadBatches(payload)) {
    batch.forEach(product => {
      Object.keys(product).forEach(key => {
        if (!STANDARD_CSV_HEADERS.includes(key) && key !== 'deal' && key !== 'specs') headers.add(key);
      });
      if (product.specs && typeof product.specs === 'object') {
        Object.keys(product.specs).forEach(key => specKeys.add(`specs_${key}`));
      }
    });
  }
  return [
    ...STANDARD_CSV_HEADERS,
    ...[...headers].filter(header => !STANDARD_CSV_HEADERS.includes(header)).sort(),
    ...[...specKeys].sort(),
  ];
};

const appendExportContent = async (archive, payload, contentFormat) => {
  const assetsByUrl = new Map();

  if (contentFormat === 'csv') {
    const headers = await getCSVHeadersFromBatches(payload);
    const csvStream = Readable.from((async function* () {
      yield `\uFEFF${headers.join(',')}\n`;
      let firstRow = true;
      for await (const batch of getPayloadBatches(payload)) {
        const preparedBatch = await prepareExportBatchForArchive(
          archive,
          batch,
          assetsByUrl,
          payload.exportAbortSignal,
          payload.exportImageStats,
        );
        const rows = preparedBatch.map(product => convertProductToCSVRow(product, headers));
        if (rows.length) {
          yield `${firstRow ? '' : '\n'}${rows.join('\n')}`;
          firstRow = false;
        }
      }
    }()));
    const streamDone = finished(csvStream, { cleanup: true });
    archive.append(csvStream, { name: 'products.csv' });
    await streamDone;
    return;
  }

  const metadata = { ...payload };
  delete metadata.products;
  delete metadata.productBatches;
  delete metadata.exportAbortSignal;
  delete metadata.exportImageStats;
  const metadataJSON = JSON.stringify(metadata);
  const jsonPrefix = metadataJSON === '{}'
    ? '{"products":['
    : `${metadataJSON.slice(0, -1)},"products":[`;
  const jsonStream = Readable.from((async function* () {
    yield jsonPrefix;
    let firstProduct = true;
    for await (const batch of getPayloadBatches(payload)) {
      const preparedBatch = await prepareExportBatchForArchive(
        archive,
        batch,
        assetsByUrl,
        payload.exportAbortSignal,
        payload.exportImageStats,
      );
      const serializedBatch = preparedBatch.map(product => JSON.stringify(product)).join(',');
      if (serializedBatch) {
        yield `${firstProduct ? '' : ','}${serializedBatch}`;
        firstProduct = false;
      }
    }
    yield ']}';
  }()));
  const streamDone = finished(jsonStream, { cleanup: true });
  archive.append(jsonStream, { name: 'products.json' });
  await streamDone;
};

const writeExportZipFile = async (filePath, payload, contentFormat) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const output = fs.createWriteStream(filePath, { flags: 'wx' });
  const archive = createZipArchive({ zlib: { level: 1 } });
  const streamFinished = finished(output, { cleanup: true });
  const onArchiveError = (error) => {
    if (!output.destroyed) output.destroy(error);
  };
  const onArchiveWarning = (warning) => {
    console.error('[EXPORT_ZIP_WARNING]', { code: warning.code, message: warning.message });
  };
  const onOutputError = (error) => {
    console.error('[EXPORT_ZIP_OUTPUT_ERROR]', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      path: error.path,
      message: error.message,
    });
  };
  archive.once('error', onArchiveError);
  archive.on('warning', onArchiveWarning);
  output.once('error', onOutputError);

  try {
    archive.pipe(output);
    await appendExportContent(archive, payload, contentFormat);
    console.info('[EXPORT_IMAGE_SUMMARY]', payload.exportImageStats);
    await archive.finalize();
    await streamFinished;
  } catch (error) {
    if (typeof archive.abort === 'function') archive.abort();
    if (!output.destroyed) output.destroy(error);
    await streamFinished.catch(() => {});
    await fs.promises.unlink(filePath).catch(() => {});
    throw error;
  } finally {
    archive.off('error', onArchiveError);
    archive.off('warning', onArchiveWarning);
    output.off('error', onOutputError);
  }
};

const streamExportZip = async (req, res, payload, contentFormat) => {
  if (req.aborted || res.destroyed) {
    throw createExportError(499, 'EXPORT_CANCELLED');
  }

  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'online-store-export-http-'),
  );
  const filePath = path.join(temporaryDirectory, 'products-export.zip');

  try {
    await writeExportZipFile(filePath, payload, contentFormat);
    if (req.aborted || res.destroyed) {
      throw createExportError(499, 'EXPORT_CANCELLED');
    }

    const { size } = await fs.promises.stat(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', size);
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.zip"`);
    res.setHeader('X-Export-Content-Format', contentFormat);
    res.setHeader('X-Matched-Total', payload.matchedTotal);
    res.setHeader('X-Exported-Total', payload.exportedTotal);
    res.setHeader('X-Has-More', String(payload.hasMore));

    await new Promise((resolve, reject) => {
      res.download(filePath, `products-export-${Date.now()}.zip`, error => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
};

const assertExportRequestActive = req => {
  if (req.aborted || req.destroyed) {
    throw createExportError(499, 'EXPORT_CANCELLED');
  }
};

const assertExportJobActive = async req => {
  assertExportRequestActive(req);
  if (typeof req.isExportCancellationRequested === 'function'
    && await req.isExportCancellationRequested()) {
    throw createExportError(499, 'EXPORT_CANCELLED');
  }
};

const createExportContext = async (req, { category, brand, parsedLimit, requestedLocales, contentFormat }) => {
  await assertExportJobActive(req);
  const filter = await resolveProductExportFilter(category, brand);
  if (!filter) {
    throw createExportError(404, 'EXPORT_CATEGORY_NOT_FOUND', { category });
  }

  const { matchedTotal, hasMore, exportFilter } = await createExportProductBatchStream(filter, parsedLimit);
  await assertExportJobActive(req);
  const { locales, defaultLocale } = await getRequestedExportLocales(requestedLocales);
  await assertExportJobActive(req);
  const fallbacks = getExportFallbacks();
  const exportAbortController = new AbortController();
  const abortExport = () => exportAbortController.abort();
  if (typeof req.once === 'function') req.once('aborted', abortExport);

  const productBatches = async function* () {
    let lastId = null;
    let remaining = parsedLimit;
    try {
      while (remaining > 0) {
        await assertExportJobActive(req);
        const batchLimit = Math.min(EXPORT_BATCH_SIZE, remaining);
        const batch = await getExportProductBatch(exportFilter, batchLimit, lastId);
        if (!batch.length) break;

        lastId = batch[batch.length - 1]._id;
        remaining -= batch.length;
        const productsWithTranslations = await getProductTranslationsForExport(
          batch,
          locales,
          fallbacks,
          defaultLocale,
        );
        await assertExportJobActive(req);
        yield productsWithTranslations.map(({ product: currentProduct, translations }) => (
          serializeProductForExport(currentProduct, translations)
        ));
      }
    } finally {
      if (typeof req.off === 'function') req.off('aborted', abortExport);
    }
  };

  return {
    success: true,
    exportedAt: new Date().toISOString(),
    totalProducts: Math.min(matchedTotal, parsedLimit),
    matchedTotal,
    exportedTotal: Math.min(matchedTotal, parsedLimit),
    hasMore,
    format: 'zip',
    contentFormat,
    locales,
    filters: { category: category || null, brand: brand || null },
    exportAbortSignal: exportAbortController.signal,
    exportImageStats: createExportImageStats(),
    productBatches,
  };
};

const createExportPayload = async (req, request) => {
  const context = await createExportContext(req, request);
  const products = [];
  for await (const batch of context.productBatches()) products.push(...batch);
  const { productBatches, ...payload } = context;
  return { ...payload, products };
};

const createStreamingExportPayload = createExportContext;

const parseExportRequest = (req) => {
  const {
    category,
    brand,
    format = 'zip',
    limit = '10000',
    locales: requestedLocales,
    lang: legacyLocale,
    async: asyncMode,
  } = req.query;
  const locales = requestedLocales ?? legacyLocale;
  if ([category, brand, format, limit, requestedLocales, legacyLocale, asyncMode]
    .some(value => value !== undefined && typeof value !== 'string')) {
    throw createExportError(400, 'EXPORT_QUERY_INVALID', { fields: ['category', 'brand', 'format', 'limit', 'locales', 'async'] });
  }
  if (asyncMode !== undefined && !['true', 'false'].includes(asyncMode)) {
    throw createExportError(400, 'EXPORT_ASYNC_INVALID', { async: asyncMode });
  }

  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) {
    throw createExportError(400, 'EXPORT_LIMIT_INVALID', { limit });
  }

  const normalizedFormat = format.toLowerCase();
  if (!['zip', 'json', 'csv'].includes(normalizedFormat)) {
    throw createExportError(400, 'EXPORT_FORMAT_UNSUPPORTED', {
      requestedFormat: format,
      supportedFormats: ['zip', 'json', 'csv'],
    });
  }

  return {
    category,
    brand,
    parsedLimit,
    requestedLocales: locales,
    async: asyncMode === 'true',
    contentFormat: normalizedFormat === 'csv' ? 'csv' : 'json',
  };
};

const exportProducts = asyncHandler(async (req, res) => {
  try {
    const request = parseExportRequest(req);
    if (request.async) {
      const { enqueueExportJob } = require('../services/exportJobService');
      const job = await enqueueExportJob({ request, userId: req.user?._id });
      res.status(202).json({ success: true, ...job });
      return;
    }
    const payload = await createStreamingExportPayload(req, request);
    await streamExportZip(req, res, payload, request.contentFormat);
  } catch (error) {
    const clientDisconnected = req.aborted
      || res.destroyed
      || ['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE'].includes(error.code);
    console[clientDisconnected ? 'warn' : 'error']('[EXPORT_PRODUCTS_ERROR]', {
      code: error.errorCode || error.code,
      message: error.message,
    });
    if (!clientDisconnected) sendExportError(req, res, error);
  }
});

/**
 * Convert products array to CSV format
 * Handles nested objects and special characters
 */
const STANDARD_CSV_HEADERS = [
  'productId', 'sku', 'name', 'brand', 'sourceProductId', 'sourceUrl', 'price', 'baseCurrencyCode', 'originalPrice',
  'categoryId', 'category', 'description', 'image', 'imagePublicId', 'imagePublicIds', 'images',
  'countInStock', 'rating', 'numReviews', 'featured', 'deal_discount', 'deal_endTime', 'imageAssetPaths',
];

const getExportCSVHeaders = products => {
  const dynamicHeaders = [...new Set(products.flatMap(product => Object.keys(product)))]
    .filter(header => !STANDARD_CSV_HEADERS.includes(header) && header !== 'deal' && header !== 'specs')
    .sort();
  const specKeys = [...new Set(products.flatMap(product => (
    product.specs && typeof product.specs === 'object' ? Object.keys(product.specs) : []
  )))].sort().map(key => `specs_${key}`);
  return [...STANDARD_CSV_HEADERS, ...dynamicHeaders, ...specKeys];
};

const serializeCSVValue = value => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(item => serializeCSVValue(item)).join('|');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeCSV = value => {
  const stringValue = serializeCSVValue(value);
  return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
};

const convertProductToCSVRow = (product, headers) => headers.map(header => {
  if (header === 'deal_discount') return escapeCSV(product.deal?.discount);
  if (header === 'deal_endTime') return escapeCSV(product.deal?.endTime);
  if (header === 'images') return escapeCSV((product.images || []).map(image => image?.url || image));
  if (header === 'imageAssetPaths') return escapeCSV((product.imageAssetPaths || []).join('|'));
  if (header.startsWith('specs_')) return escapeCSV(product.specs?.[header.slice('specs_'.length)]);
  return escapeCSV(product[header]);
}).join(',');

function convertProductsToCSV(products) {
  const headers = getExportCSVHeaders(products);
  return [headers.join(','), ...products.map(product => convertProductToCSVRow(product, headers))].join('\n');
}

/**
 * Export products as an importable ZIP bundle.
 * @route GET /api/admin/products/export-bundle
 * @access Private/Admin
 */
const exportProductsWithTranslations = asyncHandler(async (req, res) => {
  try {
    const request = parseExportRequest(req);
    if (request.async) {
      const { enqueueExportJob } = require('../services/exportJobService');
      const job = await enqueueExportJob({ request, userId: req.user?._id });
      res.status(202).json({ success: true, ...job });
      return;
    }
    const payload = await createStreamingExportPayload(req, request);
    await streamExportZip(req, res, payload, request.contentFormat);
  } catch (error) {
    const clientDisconnected = req.aborted
      || res.destroyed
      || ['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE'].includes(error.code);
    console[clientDisconnected ? 'warn' : 'error']('[EXPORT_PRODUCTS_BUNDLE_ERROR]', {
      code: error.errorCode || error.code,
      message: error.message,
    });
    if (!clientDisconnected) sendExportError(req, res, error);
  }
});

/**
 * Get export statistics (count by category, brand, etc.)
 * @route GET /api/admin/products/export-stats
 * @access Private/Admin
 */
const getExportStats = asyncHandler(async (req, res) => {
  try {
    const defaultLang = getDefaultLanguage().code;
    const requestedLang = req.lang || defaultLang;
    const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
    const [totalProducts, categoryCounts, activeCategories, brandCounts] = await Promise.all([
      withExportTimeout(
        Product.countDocuments({ isDeleted: false }).maxTimeMS(EXPORT_QUERY_TIMEOUT_MS),
      ),
      withExportTimeout(
        Product.aggregate([
          { $match: { isDeleted: false, category: { $ne: null } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ]).option({ maxTimeMS: EXPORT_QUERY_TIMEOUT_MS }),
      ),
      withExportTimeout(
        Category.find({ isDeleted: false })
          .select('_id name')
          .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
          .lean(),
      ),
      withExportTimeout(
        Product.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: '$brand', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]).option({ maxTimeMS: EXPORT_QUERY_TIMEOUT_MS }),
      ),
    ]);

    const categoryCountById = new Map(
      categoryCounts
        .filter(category => category._id)
        .map(category => [category._id.toString(), category.count]),
    );
    const categoriesWithCounts = activeCategories
      .map(category => ({
        categoryId: category._id,
        categoryName: category.name,
        count: categoryCountById.get(category._id.toString()) ?? 0,
      }))
      .filter(category => category.count > 0)
      .sort((a, b) => b.count - a.count);

    const categoryIds = categoriesWithCounts.map(category => category.categoryId.toString());
    let translationMap = new Map();
    try {
      if (!CategoryCatalogTranslationCache) {
        throw new Error('CategoryCatalogTranslationCache is unavailable');
      }
      const translations = categoryIds.length === 0
        ? []
        : await withExportTimeout(
          CategoryCatalogTranslationCache.find({
            entityId: { $in: categoryIds },
            targetLang: lang,
            status: 'success',
          })
            .select('entityId name')
            .maxTimeMS(EXPORT_QUERY_TIMEOUT_MS)
            .lean(),
        );
      translationMap = new Map(
        translations.map(translation => [translation.entityId.toString(), translation.name]),
      );
    } catch (error) {
      console.error('[EXPORT_STATS_TRANSLATION_ERROR]', error);
    }
    const processedCategories = categoriesWithCounts.map(category => ({
      categoryId: category.categoryId.toString(),
      category: translationMap.get(category.categoryId.toString()) || category.categoryName,
      count: category.count,
    }));

    res.json({
      success: true,
      totalProducts,
      categories: processedCategories,
      brands: brandCounts.map(b => ({ brand: b._id, count: b.count })),
    });
  } catch (error) {
    console.error('[EXPORT_STATS_ERROR]', error);
    res.status(500).json({
      success: false,
      code: 'EXPORT_STATS_FAILED',
      message: getMessage(req.lang, 'errors.generic_error'),
    });
  }
});

module.exports = {
  buildUpsertProductUpdate,
  getTranslationWithFallback,
  serializeProductForExport,
  convertProductsToCSV,
  importProducts,
  importProductsFromFile,
  getImportTemplate,
  getImportGuide,
  getImportFormats,
  exportProducts,
  exportProductsWithTranslations,
  getExportStats,
  createExportPayload,
  createStreamingExportPayload,
  writeExportZipFile,
  createExportContext,
  getExportProductBatchFilter,
};
