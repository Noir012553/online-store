const defaultConfig = require('./importConfig');
const { sanitizeDescriptionText } = require('../../utils/plainTextSanitizer');

const normalizeLookup = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

const getFirstValue = (...values) => values.find((value) => (
  value !== undefined && value !== null && String(value).trim() !== ''
));

const getName = (value) => {
  if (typeof value === 'string') return value.trim();
  return String(value?.name || value?.store_name || value?.seller_name || '').trim();
};

const getCategoryNames = (item) => [...new Set([
  ...asArray(item.categories).map(getName),
  ...asArray(item.breadcrumbs).map(getName),
  getName(item.crawlCategory),
].filter(Boolean))];

const getSupplierName = (item, variant) => getFirstValue(
  getName(item.crawlSupplier),
  getName(variant?.current_seller),
  getName(variant?.seller),
  getName(item.current_seller),
  getName(item.seller),
  getName(item.seller_name)
) || '';

const getBrandName = (item, variant) => getFirstValue(
  getName(variant?.brand),
  getName(item.brand)
) || '';

const getOptions = (variant) => {
  if (!variant) return [];

  const namedOptions = Object.entries(variant)
    .filter(([key, value]) => /^option\d+_name$/i.test(key) && String(value).trim())
    .map(([key, value]) => {
      const index = key.match(/\d+/)[0];
      const optionValue = variant[`option${index}`];
      return optionValue ? `${String(value).trim()}: ${String(optionValue).trim()}` : '';
    })
    .filter(Boolean);

  if (namedOptions.length > 0) return namedOptions;

  return ['option1', 'option2', 'option3']
    .map((key) => variant[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map((value) => String(value).trim());
};

const getProductName = (item, variant) => {
  const name = String(getFirstValue(variant?.name, item.name) || '').trim();
  const options = getOptions(variant);
  return options.length > 0 ? `${name} - ${options.join(' - ')}` : name;
};

const getSourceId = (item, variant) => getFirstValue(
  variant?.id,
  variant?.current_seller?.product_id,
  item.current_seller?.product_id,
  item.id
);

const getSourceParentId = (item) => getFirstValue(item.master_id, item.id);

const getSku = (item, variant, sourceId) => String(getFirstValue(
  variant?.sku,
  variant?.current_seller?.sku,
  item.current_seller?.sku,
  item.sku,
  `TIKI-SYNTHETIC-${sourceId}`
));

const getPrice = (item, variant) => Number(getFirstValue(
  variant?.price,
  item.price,
  item.current_seller?.price
));

const getOriginalPrice = (item, variant, price) => Number(getFirstValue(
  variant?.original_price,
  item.original_price,
  item.list_price,
  price
));

const getDescription = (item, variant) => String(getFirstValue(
  variant?.description,
  item.description,
  variant?.short_description,
  item.short_description,
  item.name
) || '').trim();

const getImageUrlValue = (image) => (
  typeof image === 'string'
    ? image
    : image?.base_url || image?.large_url || image?.medium_url || image?.small_url || image?.thumbnail_url
);

const getImageCandidates = (item, variant) => [
  variant?.thumbnail_url,
  ...asArray(variant?.images).map(getImageUrlValue),
  item.thumbnail_url,
  ...asArray(item.images).map(getImageUrlValue),
].filter((value) => value !== undefined && value !== null && String(value).trim());

const isHttpsUrl = (value) => {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch {
    return false;
  }
};

const getImages = (item, variant) => [...new Set(
  getImageCandidates(item, variant)
    .map((value) => String(value).trim())
    .filter(isHttpsUrl)
)];

const getStock = (item, variant, config) => {
  const stockItem = variant?.stock_item || item.stock_item;
  const quantity = stockItem?.qty;
  if (quantity !== undefined && quantity !== null && Number.isFinite(Number(quantity)) && Number(quantity) >= 0) {
    return {
      countInStock: Number(quantity),
      stockSource: 'tiki_reported',
      isSimulated: false,
    };
  }

  const status = String(variant?.inventory_status || item.inventory_status || '').toLowerCase();
  if (status === 'out_of_stock') {
    return { countInStock: 0, stockSource: 'tiki_status', isSimulated: false };
  }
  if (status === 'available' && config.stockPolicy.mode === 'staging') {
    return {
      countInStock: config.stockPolicy.simulatedStockQty,
      stockSource: 'simulated',
      isSimulated: true,
    };
  }

  return null;
};

const getSpecs = (item, variant) => {
  const groups = asArray(getFirstValue(variant?.specifications, item.specifications));
  const specs = {};
  groups.forEach((group) => {
    asArray(group?.attributes).forEach((attribute) => {
      const key = String(attribute?.code || attribute?.name || '').trim();
      const value = String(attribute?.value || '').trim();
      if (key && value) specs[key] = value;
    });
  });
  return specs;
};

const resolveCategory = (rawCategories, categories) => {
  const sourceNames = asArray(rawCategories).filter(Boolean);
  if (sourceNames.length === 0) return { error: 'MISSING_CATEGORY' };

  const category = asArray(categories).find((candidate) => {
    if (candidate.isDeleted === true) return false;
    const names = [candidate.name || candidate, ...asArray(candidate.sourceNames)];
    return names.some(name => sourceNames.some(sourceName => (
      normalizeLookup(name) === normalizeLookup(sourceName)
    )));
  });
  return category
    ? { value: category.name || category }
    : { error: 'CATEGORY_NOT_FOUND' };
};

const resolveSupplier = (rawSupplier, suppliers) => {
  const supplier = asArray(suppliers).find((candidate) => {
    if (candidate.isDeleted === true) return false;
    return [candidate.name || candidate, ...asArray(candidate.sourceNames)]
      .some(name => normalizeLookup(name) === normalizeLookup(rawSupplier));
  });
  return supplier
    ? { value: supplier.name || supplier }
    : { error: 'SUPPLIER_NOT_FOUND' };
};

const sanitizeDescription = description => sanitizeDescriptionText(description);

const createReason = (code, field, value) => ({
  code,
  field,
  value,
  message: code,
});

const createRejectedRecord = (item, sourceParentId, reasons, variant, includeRaw) => {
  const rawId = variant?.id || item.id || item.master_id || null;
  const result = {
    rawId,
    source: 'TIKI',
    sourceParentId: sourceParentId ? String(sourceParentId) : null,
    variantId: variant?.id ? String(variant.id) : null,
    reasons,
  };
  if (includeRaw) result.raw = item;
  return result;
};

const flattenItems = (items) => items.flatMap((item) => {
  if (item?.type === 'configurable' && Array.isArray(item.configurable_products) && item.configurable_products.length > 0) {
    return item.configurable_products.map((variant) => ({ item, variant }));
  }
  return [{ item, variant: null }];
});

function transformTikiProducts(items, options = {}) {
  const config = {
    ...defaultConfig,
    ...options.config,
    stockPolicy: { ...defaultConfig.stockPolicy, ...options.config?.stockPolicy },
    descriptionPolicy: { ...defaultConfig.descriptionPolicy, ...options.config?.descriptionPolicy },
    validation: { ...defaultConfig.validation, ...options.config?.validation },
  };
  const input = Array.isArray(items) ? items : items?.products;
  if (!Array.isArray(input)) throw new Error('TIKI_INPUT_MUST_BE_ARRAY');

  const categories = options.categories || [];
  const suppliers = options.suppliers || [];
  const ready = [];
  const rejected = [];
  const seenSourceIds = new Set();
  const report = {
    source: config.source,
    raw_item_count: input.length,
    flattened_record_count: 0,
    qualified_count: 0,
    rejected_count: 0,
    variant_count: 0,
    simulated_stock_count: 0,
    reported_stock_count: 0,
    out_of_stock_count: 0,
    unknown_stock_count: 0,
    synthetic_sku_count: 0,
    inherited_description_count: 0,
    inherited_image_count: 0,
    rejection_breakdown: {},
  };

  flattenItems(input).forEach(({ item, variant }) => {
    report.flattened_record_count += 1;
    if (variant) report.variant_count += 1;
    const sourceId = getSourceId(item, variant);
    const sourceParentId = getSourceParentId(item);
    const reasons = [];
    const name = getProductName(item, variant);
    const brand = getBrandName(item, variant);
    const categoryNames = getCategoryNames(item);
    const supplierName = getSupplierName(item, variant);
    const price = getPrice(item, variant);
    const originalPrice = getOriginalPrice(item, variant, price);
    const images = getImages(item, variant);
    const description = getDescription(item, variant);
    const stock = getStock(item, variant, config);
    const sku = getSku(item, variant, sourceId);

    if (!name) reasons.push(createReason('MISSING_NAME', 'name', name));
    if (!brand) reasons.push(createReason('MISSING_BRAND', 'brand', brand));
    if (!Number.isFinite(price) || price <= 0) reasons.push(createReason('INVALID_PRICE', 'price', price));
    if (!Number.isFinite(originalPrice) || originalPrice <= 0 || originalPrice < price) {
      if (config.validation.strictOriginalPrice) {
        reasons.push(createReason('INVALID_ORIGINAL_PRICE', 'originalPrice', originalPrice));
      }
    }
    if (!sourceId || !String(sourceId).trim()) {
      reasons.push(createReason('MISSING_SOURCE_ID', 'sourceId', sourceId));
    }
    if (sourceId && seenSourceIds.has(String(sourceId))) {
      reasons.push(createReason('DUPLICATE_SOURCE_ID', 'sourceId', String(sourceId)));
    }
    if (sourceId) seenSourceIds.add(String(sourceId));
    if (!images[0]) reasons.push(createReason('INVALID_IMAGE_URL', 'image', getImageCandidates(item, variant)[0]));
    if (stock === null) {
      report.unknown_stock_count += 1;
      reasons.push(createReason('INVALID_STOCK', 'inventory_status', item.inventory_status));
    }

    const category = resolveCategory(categoryNames, categories);
    if (category.error) reasons.push(createReason(category.error, 'category', categoryNames.join(' | ')));
    const supplier = resolveSupplier(supplierName, suppliers);
    if (supplier.error) reasons.push(createReason(supplier.error, 'supplier', supplierName));

    if (reasons.length > 0) {
      reasons.forEach((reason) => {
        report.rejection_breakdown[reason.code] = (report.rejection_breakdown[reason.code] || 0) + 1;
      });
      rejected.push(createRejectedRecord(item, sourceParentId, reasons, variant, options.includeRaw === true));
      return;
    }

    const inheritedDescription = !variant?.description && !item.description;
    const inheritedImage = Boolean(variant && !variant.thumbnail_url && !variant.images?.length);
    if (inheritedDescription) report.inherited_description_count += 1;
    if (inheritedImage) report.inherited_image_count += 1;
    if (stock.isSimulated) report.simulated_stock_count += 1;
    else if (stock.stockSource === 'tiki_reported') report.reported_stock_count += 1;
    else if (stock.stockSource === 'tiki_status') report.out_of_stock_count += 1;
    if (sku.startsWith('TIKI-SYNTHETIC-')) report.synthetic_sku_count += 1;

    ready.push({
      source: config.source,
      sourceId: String(sourceId),
      sourceParentId: sourceParentId ? String(sourceParentId) : null,
      sku,
      name,
      brand,
      price,
      originalPrice,
      baseCurrencyCode: config.currency,
      category: category.value,
      supplier: supplier.value,
      countInStock: stock.countInStock,
      image: images[0],
      images,
      description: sanitizeDescription(description),
      rating: Math.max(0, Math.min(5, Number(item.rating_average) || 0)),
      numReviews: Math.max(0, Math.floor(Number(item.review_count) || 0)),
      specs: getSpecs(item, variant),
      stockSource: stock.stockSource,
      isSimulatedStock: stock.isSimulated,
    });
  });

  report.qualified_count = ready.length;
  report.rejected_count = rejected.length;
  return { ready, rejected, report };
}

function preflightTikiImport({
  categories = [],
  suppliers = [],
  sourceSupplierNames = [],
  currency = { code: defaultConfig.currency, isActive: true },
  adminUserId,
  sourceIdentityIndexReady = false,
} = {}) {
  const errors = [];
  const categoryNames = new Set(asArray(categories).filter(item => item.isDeleted !== true).map(item => normalizeLookup(item.name || item)));
  const supplierNames = new Set(asArray(suppliers)
    .filter(item => item.isDeleted !== true)
    .flatMap(item => [item.name || item, ...asArray(item.sourceNames)])
    .map(normalizeLookup));
  const expectedSupplierNames = [...new Set(sourceSupplierNames.map(normalizeLookup).filter(Boolean))];
  expectedSupplierNames.forEach((name) => {
    if (!supplierNames.has(name)) errors.push({ code: 'SUPPLIER_NOT_FOUND', value: name });
  });
  if (!currency || currency.code !== defaultConfig.currency || currency.isActive !== true) {
    errors.push({ code: 'CURRENCY_NOT_READY', value: defaultConfig.currency });
  }
  if (!adminUserId) errors.push({ code: 'ADMIN_NOT_READY' });
  if (!sourceIdentityIndexReady) errors.push({ code: 'SOURCE_IDENTITY_INDEX_NOT_READY' });

  return {
    success: errors.length === 0,
    errors,
    categoriesChecked: categoryNames.size,
    suppliersChecked: expectedSupplierNames.length,
    currency: currency?.code || defaultConfig.currency,
    sourceIdentityIndexReady,
  };
}

module.exports = {
  transformTikiProducts,
  preflightTikiImport,
  normalizeLookup,
  sanitizeDescription,
};
