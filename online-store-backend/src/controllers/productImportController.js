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
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Language = require('../models/Language');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const ImportAdapterManager = require('../utils/importAdapters/ImportAdapterManager');
const { validateCategoryName, sanitizeCategoryName } = require('../utils/productImportValidator');
const { normalizeSpecs } = require('../utils/specNormalizer');
const { registerUnknownSpecKeys } = require('../services/specKeyTranslationService');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { enqueueCloudinaryCleanup } = require('../services/cloudinaryCleanupOutbox');

const buildCategoryNameQuery = (name) => {
  if (!name || typeof name !== 'string') return null;
  return { name: name.trim() };
};

const resolveProductExportFilter = async (category, brand) => {
  const filter = { isDeleted: false };

  if (category && category !== 'all') {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = new mongoose.Types.ObjectId(category);
    } else {
      const categoryQuery = buildCategoryNameQuery(category);
      const categoryDoc = categoryQuery
        ? await Category.findOne({ ...categoryQuery, isDeleted: false }).select('_id').lean()
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

const getExportProducts = async (filter, limit) => {
  const activeCategoryIds = await Category.find({ isDeleted: false }).distinct('_id');
  const exportFilter = {
    ...filter,
    category: { $in: filter.category ? [filter.category] : activeCategoryIds },
  };
  const [matchedTotal, products] = await Promise.all([
    Product.countDocuments(exportFilter),
    Product.find(exportFilter)
      .select('-__v')
      .populate({ path: 'category', select: 'name', match: { isDeleted: false } })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean(),
  ]);
  const hasMore = products.length > limit;

  return {
    matchedTotal,
    hasMore,
    products: hasMore ? products.slice(0, limit) : products,
  };
};

const getProductTranslationsForExport = async (products) => {
  const productIds = products.map(product => product._id.toString());
  const [defaultLanguage, translationDocuments] = await Promise.all([
    Language.findOne({ isSystemDefault: true }, { code: 1 }).lean(),
    ProductCatalogTranslationCache.find({ entityId: { $in: productIds } }).lean(),
  ]);
  const translationsByProduct = new Map();

  translationDocuments.forEach((translation) => {
    if (!translation.targetLang) return;
    const productTranslations = translationsByProduct.get(translation.entityId) || new Map();
    productTranslations.set(translation.targetLang, translation);
    translationsByProduct.set(translation.entityId, productTranslations);
  });

  return products.map((product) => {
    const translations = {};
    if (defaultLanguage?.code) {
      translations[defaultLanguage.code] = {
        name: product.name,
        description: product.description,
        brand: product.brand,
        specs: product.specs || {},
      };
    }

    const productTranslations = translationsByProduct.get(product._id.toString()) || new Map();
    productTranslations.forEach((translation, language) => {
      if (language === defaultLanguage?.code) return;
      translations[language] = {
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
      };
    });

    return { product, translations };
  });
};

const serializeProductForExport = (product, translations = {}) => {
  const { _id, category, ...productData } = product;
  const imageUrls = [
    productData.image,
    ...(Array.isArray(productData.images) ? productData.images : []),
  ].filter(Boolean);
  const imagePublicIds = [
    productData.imagePublicId,
    ...(Array.isArray(productData.imagePublicIds) ? productData.imagePublicIds : []),
  ].filter(Boolean);

  return {
    ...productData,
    productId: _id.toString(),
    categoryId: category?._id?.toString(),
    category: category?.name,
    images: [...new Set(imageUrls)],
    imagePublicIds: [...new Set(imagePublicIds)],
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
const exportProducts = asyncHandler(async (req, res) => {
  const { format: requestedFormat = 'json', category, brand, limit = '10000' } = req.query;
  if ([requestedFormat, category, brand, limit].some((value) => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({
      success: false,
      code: 'EXPORT_QUERY_INVALID',
      message: getMessage(req.lang, 'errors.generic_error'),
    });
  }

  const format = requestedFormat.toLowerCase();
  const parsedLimit = Number(limit);

  if (!['json', 'csv'].includes(format)) {
    return res.status(400).json({
      success: false,
      code: 'EXPORT_FORMAT_UNSUPPORTED',
      message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format: requestedFormat }),
      supportedFormats: ['json', 'csv'],
    });
  }

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) {
    return res.status(400).json({
      success: false,
      code: 'EXPORT_LIMIT_INVALID',
      message: getMessage(req.lang, 'errors.generic_error'),
    });
  }

  try {
    const filter = await resolveProductExportFilter(category, brand);
    if (!filter) {
      return res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        totalProducts: 0,
        format,
        filters: { category, brand },
        products: [],
        warningCode: 'EXPORT_CATEGORY_NOT_FOUND',
      });
    }

    const {
      matchedTotal,
      hasMore,
      products: exportedProducts,
    } = await getExportProducts(filter, parsedLimit);

    const productsWithTranslations = await getProductTranslationsForExport(
      exportedProducts.filter(product => product.category)
    );
    const transformedProducts = productsWithTranslations.map(({ product, translations }) => (
      serializeProductForExport(product, translations)
    ));

    if (format.toLowerCase() === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.json"`);
      res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        totalProducts: transformedProducts.length,
        matchedTotal,
        exportedTotal: transformedProducts.length,
        hasMore,
        format: 'json',
        filters: { category, brand },
        products: transformedProducts,
      });
    } else if (format.toLowerCase() === 'csv') {
      // Convert to CSV
      const csv = convertProductsToCSV(transformedProducts);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.csv"`);
      res.setHeader('X-Matched-Total', matchedTotal);
      res.setHeader('X-Exported-Total', transformedProducts.length);
      res.setHeader('X-Has-More', String(hasMore));
      res.send('\uFEFF' + csv); // UTF-8 BOM for proper Vietnamese character encoding
    }
  } catch (error) {
    console.error('[EXPORT_PRODUCTS_ERROR]', error);
    res.status(500).json({
      success: false,
      code: 'EXPORT_FAILED',
      message: getMessage(req.lang, 'errors.generic_error'),
    });
  }
});

/**
 * Convert products array to CSV format
 * Handles nested objects and special characters
 */
function convertProductsToCSV(products) {
  const standardHeaders = [
    'productId', 'sku', 'name', 'brand', 'sourceProductId', 'sourceUrl', 'price', 'baseCurrencyCode', 'originalPrice',
    'categoryId', 'category', 'description', 'image', 'imagePublicId', 'imagePublicIds', 'images',
    'countInStock', 'rating', 'numReviews', 'featured', 'deal_discount', 'deal_endTime',
  ];
  const dynamicHeaders = [...new Set(products.flatMap(product => Object.keys(product)))]
    .filter(header => !standardHeaders.includes(header) && header !== 'deal' && header !== 'specs')
    .sort();
  const specKeys = [...new Set(products.flatMap(product => (
    product.specs && typeof product.specs === 'object' ? Object.keys(product.specs) : []
  )))].sort().map(key => `specs_${key}`);
  const allHeaders = [...standardHeaders, ...dynamicHeaders, ...specKeys];

  const serializeCSVValue = (value) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(item => serializeCSVValue(item)).join('|');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const escapeCSV = (value) => {
    const stringValue = serializeCSVValue(value);
    return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  };

  const rows = [allHeaders.join(',')];
  products.forEach(product => {
    rows.push(allHeaders.map(header => {
      if (header === 'deal_discount') return escapeCSV(product.deal?.discount);
      if (header === 'deal_endTime') return escapeCSV(product.deal?.endTime);
      if (header.startsWith('specs_')) return escapeCSV(product.specs?.[header.slice('specs_'.length)]);
      return escapeCSV(product[header]);
    }).join(','));
  });

  return rows.join('\n');
}

/**
 * Export products as an importable ZIP bundle.
 * @route GET /api/admin/products/export-bundle
 * @access Private/Admin
 */
const exportProductsWithTranslations = asyncHandler(async (req, res, next) => {
  const { category, brand, limit = 10000 } = req.query;
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) {
    return res.status(400).json({
      success: false,
      code: 'EXPORT_LIMIT_INVALID',
      message: getMessage(req.lang, 'errors.generic_error'),
    });
  }

  try {
    const filter = await resolveProductExportFilter(category, brand);
    if (!filter) {
      return res.status(404).json({
        success: false,
        code: 'EXPORT_CATEGORY_NOT_FOUND',
        message: getMessage(req.lang, 'admin-controllers-messages.product_category_not_found'),
      });
    }

    const {
      matchedTotal,
      hasMore,
      products: productsToExport,
    } = await getExportProducts(filter, parsedLimit);
    const productsWithTranslations = await getProductTranslationsForExport(
      productsToExport.filter(product => product.category)
    );
    const exportedProducts = productsWithTranslations.map(({ product, translations }) => (
      serializeProductForExport(product, translations)
    ));
    const exportedAt = new Date().toISOString();
    const productsPayload = {
      success: true,
      exportedAt,
      totalProducts: exportedProducts.length,
      matchedTotal,
      exportedTotal: exportedProducts.length,
      hasMore,
      format: 'json',
      filters: { category: category || null, brand: brand || null },
      products: exportedProducts,
    };
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.zip"`);
    const { ZipArchive } = await import('archiver');
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.on('error', error => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    archive.pipe(res);
    archive.append(JSON.stringify(productsPayload), { name: 'products.json' });
    await archive.finalize();
  } catch (error) {
    console.error('[EXPORT_PRODUCTS_BUNDLE_ERROR]', error);
    if (res.headersSent) return res.destroy(error);
    return next(error);
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
      Product.countDocuments({ isDeleted: false }),
      Product.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Category.find({ isDeleted: false }).select('_id name').lean(),
      Product.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
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
      .sort((a, b) => b.count - a.count);

    // Apply category translations (Rule #2: Dynamic Database Translations)
    let processedCategories = categoriesWithCounts;
    if (lang !== defaultLang) {
      const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
      const categoryIds = categoriesWithCounts.map(c => c.categoryId.toString());
      const translations = await CategoryCatalogTranslationCache.find({
        entityId: { $in: categoryIds },
        targetLang: lang,
        status: 'success',
      }).lean();

      const translationMap = {};
      translations.forEach(t => {
        translationMap[t.entityId.toString()] = t;
      });

      processedCategories = categoriesWithCounts.map(cat => {
        const categoryId = cat.categoryId.toString();
        const categoryTranslation = translationMap[categoryId];

        // Return translated name OR fallback to Vietnamese name
        const displayName = categoryTranslation?.name || cat.categoryName;

        return {
          categoryId,
          category: displayName,
          count: cat.count,
        };
      });
    } else {
      processedCategories = categoriesWithCounts.map(cat => ({
        categoryId: cat.categoryId.toString(),
        category: cat.categoryName,
        count: cat.count,
      }));
    }

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
};
