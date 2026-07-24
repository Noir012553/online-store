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
const Supplier = require('../models/Supplier');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const ImportAdapterManager = require('../utils/importAdapters/ImportAdapterManager');
const { validateCategorySupplierName, sanitizeCategorySupplierName } = require('../utils/productImportValidator');
const { normalizeSpecs } = require('../utils/specNormalizer');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const buildCategoryNameQuery = (name) => {
  if (!name || typeof name !== 'string') return null;
  return { name: name.trim() };
};

// Initialize adapter manager
const adapterManager = new ImportAdapterManager();

// Config: Max new categories/suppliers per import (to prevent abuse)
const MAX_NEW_CATEGORIES_PER_IMPORT = 10;
const MAX_NEW_SUPPLIERS_PER_IMPORT = 10;
const TRANSLATABLE_PRODUCT_FIELDS = ['name', 'description', 'brand', 'features', 'specs'];

const isDryRun = (value) => value === true || value === 'true';

const toImportIssues = (issues, code) => issues.map((_, index) => ({
  code,
  index: index + 1,
}));

const importErrorMessageKeys = {
  IMPORT_DUPLICATE_KEY: 'admin-controllers-messages.duplicate_key_error',
  IMPORT_CATEGORY_LIMIT_EXCEEDED: 'admin-controllers-messages.too_many_new_categories',
  IMPORT_SUPPLIER_LIMIT_EXCEEDED: 'admin-controllers-messages.too_many_new_suppliers',
  IMPORT_CATEGORY_UNRESOLVED: 'admin-controllers-messages.product_category_not_resolve',
  IMPORT_SUPPLIER_UNRESOLVED: 'admin-controllers-messages.product_supplier_not_resolve',
  IMPORT_CATEGORY_NOT_FOUND: 'admin-controllers-messages.product_category_not_found',
  IMPORT_SUPPLIER_NOT_FOUND: 'admin-controllers-messages.product_supplier_not_found',
  IMPORT_PRODUCTS_NOT_FOUND: 'admin-controllers-messages.products_not_found_count',
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

const getFeatureLabel = (feature, lang) => {
  if (typeof feature !== 'string') return feature;
  const translated = getMessage(lang, `products.${feature}`);
  return translated === `products.${feature}` ? feature : translated;
};

const getImportProductId = (product) => (
  mongoose.Types.ObjectId.isValid(product.productId) ? product.productId.toString() : null
);

const getProductLookupFilter = (product) => {
  const productId = getImportProductId(product);
  return productId
    ? { _id: productId, isDeleted: false }
    : { name: product.name, brand: product.brand, isDeleted: false };
};

const getChangedTranslatableFields = (existing, product) => (
  TRANSLATABLE_PRODUCT_FIELDS.filter((field) => (
    JSON.stringify(existing[field] ?? null) !== JSON.stringify(product[field] ?? null)
  ))
);

const withoutImportProductId = (product) => {
  const { productId, ...productData } = product;
  return productData;
};

const findExistingProduct = (byId, byNameAndBrand, product) => {
  const productId = getImportProductId(product);
  return productId
    ? byId.get(productId)
    : byNameAndBrand.get(`${product.name}|${product.brand}`);
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

    // Detect format from filename
    let format = 'json';
    if (file.originalname.endsWith('.csv')) {
      format = 'csv';
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

    const validProducts = validation.validProducts;

    if (isDryRun(dryRun)) {
      return res.json({
        success: true,
        message: getMessage(req.lang, 'admin-controllers-messages.dry_run_preview_import'),
        dryRun: true,
        format,
        mode,
        totalProducts: validProducts.length,
        createdCategories: [],
        createdSuppliers: [],
        warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
        preview: validProducts.slice(0, 3),
      });
    }

    // Map category names → IDs (Filter isDeleted = false)
    const categoryMap = {};
    const categories = await Category.find({ isDeleted: false });
    categories.forEach(cat => {
      categoryMap[cat.name] = cat._id;
      categoryMap[cat.name.toLowerCase()] = cat._id;
    });

    // Map supplier names → IDs (Filter isDeleted = false)
    const supplierMap = {};
    const suppliers = await Supplier.find({ isDeleted: false });
    suppliers.forEach(sup => {
      supplierMap[sup.name] = sup._id;
      supplierMap[sup.name.toLowerCase()] = sup._id;
    });

    // Pre-identify all missing categories/suppliers and create them in bulk.
    // BEFORE: Loop N products × (check + create category + check + create supplier) = N*4 operations
    // AFTER: Pre-collect → Bulk create categories → Bulk create suppliers = 2 operations
    if (process.env.NODE_ENV === 'development') {
      console.time(`${CLI_SYMBOLS.duration} Bulk category/supplier creation`);
    }

    const createdCategories = [];
    const createdSuppliers = [];

    // Step 1: Identify missing categories
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.search} [Step 1/4] Scanning for missing categories...`);
    }
    const categoriesToCreate = [];
    const categoryLookup = new Map();

    for (const product of validProducts) {
      let categoryId = categoryMap[product.category] || categoryMap[String(product.category).toLowerCase()];
      if (!categoryId && mongoose.Types.ObjectId.isValid(product.category)) {
        categoryId = product.category;
      }

      if (!categoryId) {
        const sanitizedName = sanitizeCategorySupplierName(product.category);
        if (!categoryLookup.has(sanitizedName)) {
          const validation = validateCategorySupplierName(product.category);
          if (!validation.isValid) {
            throw createImportError('IMPORT_CATEGORY_NAME_INVALID', { name: product.category });
          }

          categoryLookup.set(sanitizedName, null); // Mark for creation
          categoriesToCreate.push({ name: sanitizedName, isDeleted: false });
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

    // Step 2: Bulk create missing categories
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.save} [Step 2/4] Bulk creating categories...`);
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

    // Step 3: Identify missing suppliers
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.search} [Step 3/4] Scanning for missing suppliers...`);
    }
    const suppliersToCreate = [];
    const supplierLookup = new Map();

    for (const product of validProducts) {
      let supplierId = supplierMap[product.supplier] || supplierMap[String(product.supplier).toLowerCase()];
      if (!supplierId && mongoose.Types.ObjectId.isValid(product.supplier)) {
        supplierId = product.supplier;
      }

      if (!supplierId) {
        const sanitizedName = sanitizeCategorySupplierName(product.supplier);
        if (!supplierLookup.has(sanitizedName)) {
          const validation = validateCategorySupplierName(product.supplier);
          if (!validation.isValid) {
            throw createImportError('IMPORT_SUPPLIER_NAME_INVALID', { name: product.supplier });
          }

          supplierLookup.set(sanitizedName, null); // Mark for creation
          suppliersToCreate.push({ name: sanitizedName, isDeleted: false });
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.chart} Found ${suppliersToCreate.length} suppliers to create`);
    }

    if (suppliersToCreate.length > MAX_NEW_SUPPLIERS_PER_IMPORT) {
      throw createImportError('IMPORT_SUPPLIER_LIMIT_EXCEEDED', {
        count: suppliersToCreate.length,
        max: MAX_NEW_SUPPLIERS_PER_IMPORT,
      });
    }

    // Step 4: Bulk create missing suppliers
    if (process.env.NODE_ENV === 'development') {
      console.log(`${CLI_SYMBOLS.save} [Step 4/4] Bulk creating suppliers...`);
    }
    if (suppliersToCreate.length > 0) {
      try {
        const newSuppliers = await Supplier.insertMany(suppliersToCreate, { ordered: false });
        newSuppliers.forEach(sup => {
          supplierLookup.set(sup.name, sup._id);
          supplierMap[sup.name] = sup._id;
          supplierMap[sup.name.toLowerCase()] = sup._id;
          createdSuppliers.push(sup.name);
        });
        if (process.env.NODE_ENV === 'development') {
          console.log(`${CLI_SYMBOLS.success} Created ${newSuppliers.length} suppliers`);
        }
      } catch (err) {
        if (err.code === 11000) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`${CLI_SYMBOLS.warning} Some suppliers already exist, fetching them...`);
          }
          for (const { name } of suppliersToCreate) {
            const existing = await Supplier.findOne({ name, isDeleted: false });
            if (existing) {
              supplierLookup.set(name, existing._id);
              supplierMap[name] = existing._id;
              supplierMap[name.toLowerCase()] = existing._id;
            }
          }
        } else {
          throw err;
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`${CLI_SYMBOLS.duration} Bulk category/supplier creation`);
    }

    // Now enrich all products in a single pass (category/supplier already resolved)
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
        const sanitizedName = sanitizeCategorySupplierName(product.category);
        categoryId = categoryLookup.get(sanitizedName);
      }
      if (!categoryId) {
        throw createImportError('IMPORT_CATEGORY_UNRESOLVED', { idx: idx + 1 });
      }
      enriched.category = categoryId;

      // Resolve supplier
      let supplierId = supplierMap[product.supplier] || supplierMap[String(product.supplier).toLowerCase()];
      if (!supplierId && mongoose.Types.ObjectId.isValid(product.supplier)) {
        supplierId = product.supplier;
      }
      if (!supplierId) {
        const sanitizedName = sanitizeCategorySupplierName(product.supplier);
        supplierId = supplierLookup.get(sanitizedName);
      }
      if (!supplierId) {
        throw createImportError('IMPORT_SUPPLIER_UNRESOLVED', { idx: idx + 1 });
      }
      enriched.supplier = supplierId;

      return enriched;
    });

    console.log(`[FILE_UPLOAD] ${CLI_SYMBOLS.success} Successfully enriched ${enrichedProducts.length} products (created ${createdCategories.length} categories, ${createdSuppliers.length} suppliers)`);

    // Xử lý theo mode
    let results;
    switch (mode.toLowerCase()) {
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

    const translationSummary = await invalidateChangedProductTranslations(results.affectedTranslations);
    res.json({
      success: true,
      code: 'IMPORT_COMPLETED',
      message: getMessage(req.lang, 'frontend-import.import_success'),
      format,
      mode,
      results: {
        ...results,
        affectedTranslations: undefined,
      },
      translationSummary,
      createdCategories,
      createdSuppliers,
      warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
    });
  } catch (error) {
    console.error('[IMPORT_FILE_ERROR]', error);
    res.status(500).json({
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
  if (data && !adapterManager.supports(format)) {
    return res.status(400).json({
      success: false,
      code: 'IMPORT_FORMAT_UNSUPPORTED',
      message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format }),
      supportedFormats: adapterManager.getSupportedFormats(),
    });
  }

  try {
    // Parse data sử dụng adapter
    let parsedProducts = products;
    
    if (data) {
      const adapter = adapterManager.getAdapter(format);
      parsedProducts = await adapter.parse(data);
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

    const validProducts = validation.validProducts;

    // Map category names → IDs (FIX #1: Filter isDeleted = false)
    const categoryMap = {};
    const categories = await Category.find({ isDeleted: false });
    categories.forEach(cat => {
      categoryMap[cat.name] = cat._id;
      categoryMap[cat.name.toLowerCase()] = cat._id;
    });

    // Map supplier names → IDs (FIX #1: Filter isDeleted = false)
    const supplierMap = {};
    const suppliers = await Supplier.find({ isDeleted: false });
    suppliers.forEach(sup => {
      supplierMap[sup.name] = sup._id;
      supplierMap[sup.name.toLowerCase()] = sup._id;
    });

    // Enrich products với category/supplier IDs
    const enrichedProducts = validProducts.map(product => {
      const enriched = { ...product, user: adminUserId };

      // Resolve category
      let categoryId = categoryMap[product.category];
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

      // Resolve supplier
      let supplierId = supplierMap[product.supplier];
      if (!supplierId && mongoose.Types.ObjectId.isValid(product.supplier)) {
        supplierId = product.supplier;
      }
      if (!supplierId) {
        throw createImportError('IMPORT_SUPPLIER_NOT_FOUND', {
          name: product.name,
          supplier: product.supplier,
        });
      }
      enriched.supplier = supplierId;

      return enriched;
    });

    // DRY RUN: Return preview mà không save
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

    // Xử lý theo mode
    let results;
    switch (mode.toLowerCase()) {
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

    const translationSummary = await invalidateChangedProductTranslations(results.affectedTranslations);
    res.json({
      success: true,
      message: getMessage(req.lang, 'frontend-import.import_success'),
      format,
      mode,
      results: {
        ...results,
        affectedTranslations: undefined,
      },
      translationSummary,
      warnings: toImportIssues(validation.warnings, 'IMPORT_PRODUCT_WARNING'),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[IMPORT_TEXT_ERROR]', error);
      console.error('[IMPORT_TEXT_ERROR_STACK]', error.stack);
    }
    res.status(500).json({
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
  const existingNames = await Product.find(
    {
      isDeleted: false,
      $or: products.map(p => ({ name: p.name, brand: p.brand }))
    },
    { name: 1, brand: 1 }
  );

  const existingSet = new Set(
    existingNames.map(p => `${p.name}|${p.brand}`)
  );

  // Separate products into insert and skip
  const toInsert = [];
  const skipped = [];

  products.forEach(product => {
    const key = `${product.name}|${product.brand}`;
    if (existingSet.has(key)) {
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

  return { inserted: insertedCount, updated: 0, skipped: skipped.length, skipped, affectedTranslations: [] };
}

/**
 * Update mode: Chỉ cập nhật cũ (lỗi nếu không tìm)
 * OPTIMIZATION: Bulk fetch existing products with $in instead of looping findOne
 * FIX #2: Enrich category/supplier trước khi update
 */
async function handleUpdateMode(productsWithEnrichedIds) {
  const updated = [];
  const notFound = [];
  const filters = productsWithEnrichedIds.map(getProductLookupFilter);
  const existingProducts = await Product.find({ $or: filters, isDeleted: false }).lean();
  const existingById = new Map(existingProducts.map((product) => [product._id.toString(), product]));
  const existingByNameAndBrand = new Map(existingProducts.map((product) => [`${product.name}|${product.brand}`, product]));
  const bulkOps = [];
  const affectedTranslations = [];

  for (const product of productsWithEnrichedIds) {
    const existing = findExistingProduct(existingById, existingByNameAndBrand, product);
    if (!existing) {
      notFound.push({ name: product.name, brand: product.brand });
      continue;
    }

    const changedFields = getChangedTranslatableFields(existing, product);
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

  return { inserted: 0, updated: updated.length, skipped: 0, notFound, affectedTranslations };
}

/**
 * Upsert mode: Thêm mới hoặc cập nhật
 * FIX #4: Use bulkWrite for atomic operation and better performance
 * Single DB operation instead of N queries
 */
async function handleUpsertMode(products) {
  const filters = products.map(getProductLookupFilter);
  const existingProducts = await Product.find({ $or: filters, isDeleted: false }).lean();
  const existingById = new Map(existingProducts.map((product) => [product._id.toString(), product]));
  const existingByNameAndBrand = new Map(existingProducts.map((product) => [`${product.name}|${product.brand}`, product]));
  const affectedTranslations = [];
  const bulkOps = products.map((product) => {
    const existing = findExistingProduct(existingById, existingByNameAndBrand, product);
    if (existing) {
      const changedFields = getChangedTranslatableFields(existing, product);
      if (changedFields.length > 0) {
        affectedTranslations.push({ productId: existing._id, fields: changedFields });
      }
    }

    return {
      updateOne: {
        filter: existing
          ? { _id: existing._id, isDeleted: false }
          : { name: product.name, brand: product.brand, isDeleted: false },
        update: { $set: withoutImportProductId(product) },
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
    requiredFields: ['name', 'brand', 'price', 'baseCurrencyCode', 'category', 'supplier'],
    optionalFields: [
      'productId', 'originalPrice', 'image', 'images', 'countInStock', 'specs',
      'features', 'rating', 'numReviews', 'featured', 'deal',
    ],
    fieldDetails: {
      productId: {
        format: 'MongoDB ObjectId from a product export',
        note: 'Keep this value when updating exported products so their existing translations can be refreshed correctly.',
      },
      specs: {
        format: 'JSON | In CSV use: specs_fieldName (e.g., specs_weight, specs_connection)',
        example: '{"weight": "54g", "connection": "Wireless"}',
      },
      features: {
        format: 'Array in JSON | Pipe-separated string in CSV',
        example: 'In CSV: "Feature1|Feature2|Feature3"',
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
  const { format = 'json', category, brand, limit = 10000, lang } = req.query;
  const parsedLimit = Number(limit);
  const exportLanguage = isSupportedLanguage(lang) ? lang : (req.lang || getDefaultLanguage().code);

  // Validate format
  if (!['json', 'csv'].includes(format.toLowerCase())) {
    return res.status(400).json({
      success: false,
      code: 'EXPORT_FORMAT_UNSUPPORTED',
      message: getMessage(req.lang, 'admin-controllers-messages.format_not_supported', { format }),
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
    // Build filter
    const filter = { isDeleted: false };

    // Resolve category name → ID
    if (category && category !== 'all') {
      // Try to use category as-is first (it might be an ObjectId)
      if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        // If not ObjectId, search by category name
        const categoryDoc = await Category.findOne({
          isDeleted: false,
          name: category,
        });
        if (categoryDoc) {
          filter.category = categoryDoc._id;
        } else {
          // Category not found, return empty result
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
      }
    }

    if (brand && brand !== 'all') {
      filter.brand = brand;
    }

    const matchedTotal = await Product.countDocuments(filter);

    // Fetch one extra record to determine whether the export was truncated.
    const products = await Product.find(filter)
      .select('-reviews -createdAt -updatedAt -__v')
      .populate({
        path: 'category',
        select: 'name',
        match: { isDeleted: false }  // FIX #3: Filter deleted categories
      })
      .populate({
        path: 'supplier',
        select: 'name',
        match: { isDeleted: false }  // FIX #3: Filter deleted suppliers
      })
      .limit(parsedLimit + 1)
      .lean();
    const hasMore = products.length > parsedLimit;
    const exportedProducts = hasMore ? products.slice(0, parsedLimit) : products;

    // Transform products
    // FIX #3: Skip products with null category/supplier (they reference deleted documents)
    const transformedProducts = exportedProducts
      .filter(product => product.category && product.supplier)  // FIX #3: Filter out products with null refs
      .map(product => ({
        productId: product._id.toString(),
        name: product.name,
        brand: product.brand,
        price: product.price,
        baseCurrencyCode: product.baseCurrencyCode,
        originalPrice: product.originalPrice,
        category: product.category?.name || 'Unknown',  // Fallback to avoid null
        supplier: product.supplier?.name || 'Unknown',  // Fallback to avoid null
        description: product.description,
        image: product.image || '',
        countInStock: product.countInStock || 0,
        specs: product.specs || {},
        features: Array.isArray(product.features) ? product.features : [],
        featureLabels: Array.isArray(product.features)
          ? product.features.map((feature) => getFeatureLabel(feature, exportLanguage))
          : [],
        rating: product.rating || 0,
        numReviews: product.numReviews || 0,
        featured: product.featured || false,
        deal: product.deal || false,
      }));

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
 * Handles nested objects (specs, features) and special characters
 */
function convertProductsToCSV(products) {
  if (!products || products.length === 0) {
    return 'productId,name,brand,price,baseCurrencyCode,originalPrice,category,supplier,description,image,countInStock,features,featureLabels,rating,numReviews,featured,deal_discount,deal_endTime';
  }

  // Headers (removed 'deal', will use deal_discount and deal_endTime instead)
  const headers = [
    'productId', 'name', 'brand', 'price', 'baseCurrencyCode', 'originalPrice', 'category', 'supplier',
    'description', 'image', 'countInStock', 'features', 'featureLabels', 'rating', 'numReviews',
    'featured', 'deal_discount', 'deal_endTime'
  ];

  // Add dynamic spec headers
  const specKeys = new Set();
  products.forEach(product => {
    if (product.specs && typeof product.specs === 'object') {
      Object.keys(product.specs).forEach(key => specKeys.add(key));
    }
  });

  const dynamicSpecHeaders = Array.from(specKeys).sort().map((key) => `specs_${key}`);
  const allHeaders = [...headers, ...dynamicSpecHeaders];

  // Escape CSV values
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Build CSV rows
  const rows = [allHeaders.join(',')]; // Header row

  products.forEach(product => {
    const row = allHeaders.map(header => {
      // Handle standard fields
      if (headers.includes(header)) {
        let value;

        // Special handling for deal fields
        if (header === 'deal_discount' && product.deal) {
          value = product.deal.discount || '';
        } else if (header === 'deal_endTime' && product.deal) {
          value = product.deal.endTime || '';
        } else {
          value = product[header];

          // Special handling for arrays
          if (['features', 'featureLabels'].includes(header) && Array.isArray(value)) {
            value = value.join('|');
          }
        }

        return escapeCSV(value);
      }

      // Handle dynamic spec fields (specs_*)
      const specKey = header.slice('specs_'.length);
      if (product.specs && product.specs[specKey] !== undefined) {
        return escapeCSV(product.specs[specKey]);
      }

      return '';
    });

    rows.push(row.join(','));
  });

  return rows.join('\n');
}

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
    const totalProducts = await Product.countDocuments({ isDeleted: false });

    // FIX #5: Add filters for deleted categories/suppliers and add $limit
    const categoryCounts = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      // FIX #5: Only lookup non-deleted categories
      { $lookup: {
        from: 'categories',
        let: { categoryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$categoryId'] },
              isDeleted: false,
            },
          },
        ],
        as: 'categoryInfo'
      }},
      // FIX #5: Use $unwind with preserveNullAndEmptyArrays to handle deleted categories
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: false } },
      { $project: {
        categoryId: '$_id',
        categoryName: '$categoryInfo.name',
        count: 1,
        _id: 0
      } },
      { $sort: { count: -1 } },
      { $limit: 50 }  // FIX #5: Add limit to prevent timeout
    ]);

    const brandCounts = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // FIX #5: Only lookup non-deleted suppliers
    const supplierCounts = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$supplier', count: { $sum: 1 } } },
      { $lookup: {
        from: 'suppliers',
        let: { supplierId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$supplierId'] },
              isDeleted: false,
            },
          },
        ],
        as: 'supplierInfo'
      }},
      // FIX #5: Drop documents with no matching supplier (deleted supplier)
      { $unwind: { path: '$supplierInfo', preserveNullAndEmptyArrays: false } },
      { $project: {
        supplier: '$supplierInfo.name',
        count: 1,
        _id: 0
      } },
      { $sort: { count: -1 } },
      { $limit: 50 }  // FIX #5: Add limit
    ]);

    // Apply category translations (Rule #2: Dynamic Database Translations)
    let processedCategories = categoryCounts;
    if (lang !== defaultLang) {
      const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
      const categoryIds = categoryCounts.map(c => c.categoryId.toString());
      const translations = await CategoryCatalogTranslationCache.find({
        entityId: { $in: categoryIds },
        targetLang: lang,
        status: 'success',
      }).lean();

      const translationMap = {};
      translations.forEach(t => {
        translationMap[t.entityId.toString()] = t;
      });

      processedCategories = categoryCounts.map(cat => {
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
      processedCategories = categoryCounts.map(cat => ({
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
      suppliers: supplierCounts,
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
  importProducts,
  importProductsFromFile,
  getImportTemplate,
  getImportGuide,
  getImportFormats,
  exportProducts,
  getExportStats,
};
