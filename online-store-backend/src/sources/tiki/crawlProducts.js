require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const { connectMongo } = require('../../config/mongoConnection');
const Category = require('../../models/Category');
const Supplier = require('../../models/Supplier');
const { transformTikiProducts, normalizeLookup } = require('./productTransformer');
const importConfig = require('./importConfig');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../../data');
const DEFAULT_MIN_PER_CATEGORY = 50;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_PAGE_SIZE = 40;
const DEFAULT_DELAY_MS = 250;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const TIKI_API_TOKEN = process.env.TIKI_API_TOKEN || '';
const TIKI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  Referer: 'https://tiki.vn/',
  Origin: 'https://tiki.vn',
  ...(TIKI_API_TOKEN ? { 'tiki-api': TIKI_API_TOKEN } : {}),
};
const TIKI_PRODUCTS_ENDPOINT = process.env.TIKI_PRODUCTS_ENDPOINT
  || (TIKI_API_TOKEN ? 'https://api.tiki.vn/integration/v2/products' : 'https://tiki.vn/api/v2/products');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const getPositiveInteger = (value, name, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!value) return fallback;
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const getName = value => String(
  typeof value === 'string'
    ? value
    : value?.name || value?.store_name || value?.seller_name || '',
).trim();

const getProductId = item => String(item?.id || '').trim();

const getProductItems = payload => {
  const candidates = [
    payload?.data,
    payload?.data?.data,
    payload?.data?.products,
    payload?.data?.items,
    payload?.products,
    payload?.items,
  ];
  const products = candidates.find(Array.isArray);
  if (products) return products;

  const mappedProducts = candidates
    .filter(candidate => candidate && typeof candidate === 'object')
    .flatMap(candidate => Object.values(candidate))
    .filter(candidate => candidate && typeof candidate === 'object' && (candidate.id || candidate.name));
  if (mappedProducts.length > 0) return mappedProducts;

  const error = new Error('TIKI_PRODUCTS_RESPONSE_SHAPE_INVALID');
  error.code = 'TIKI_PRODUCTS_RESPONSE_SHAPE_INVALID';
  throw error;
};

const getProductDetail = async (productId, maxRetries, delayMilliseconds, requestTimeout) => {
  const detailEndpoint = `${TIKI_PRODUCTS_ENDPOINT.replace(/\/$/, '')}/${encodeURIComponent(productId)}`;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const { data } = await axios.get(detailEndpoint, {
        headers: TIKI_HEADERS,
        timeout: requestTimeout,
      });
      return data?.data || data;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(delayMilliseconds * attempt);
    }
  }
  return null;
};

const getErrorDetails = error => ({
  code: error.code || error.message,
  status: error.response?.status || null,
  contentType: error.response?.headers?.['content-type'] || null,
});

const getListingErrorReason = error => ({
  reason: error.code === 'TIKI_PRODUCTS_RESPONSE_SHAPE_INVALID'
    ? 'CRAWL_LISTING_RESPONSE_INVALID'
    : 'CRAWL_LISTING_REQUEST_FAILED',
  details: getErrorDetails(error),
});

const getProductPage = async (searchTerm, page, pageSize, maxRetries, delayMilliseconds, requestTimeout) => {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const { data } = await axios.get(TIKI_PRODUCTS_ENDPOINT, {
        headers: TIKI_HEADERS,
        params: { limit: pageSize, q: searchTerm, page },
        timeout: requestTimeout,
      });
      return getProductItems(data);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(delayMilliseconds * (2 ** (attempt - 1)));
    }
  }
  return [];
};

const mergeProductData = (summary, detail) => ({
  ...summary,
  ...Object.fromEntries(Object.entries(detail || {}).filter(([, value]) => (
    value !== undefined && value !== null && value !== ''
  ))),
});

const getSearchTerms = category => [...new Set([
  ...(Array.isArray(category.sourceNames) ? category.sourceNames : []),
  category.name,
].map(getName).filter(Boolean))];

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
};

async function crawlProducts(options = {}) {
  const minPerCategory = options.minPerCategory || DEFAULT_MIN_PER_CATEGORY;
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const delayMilliseconds = options.delayMilliseconds ?? DEFAULT_DELAY_MS;
  const maxRetries = options.maxRetries || 3;
  const requestTimeout = options.requestTimeout || DEFAULT_REQUEST_TIMEOUT_MS;
  const skipDetails = options.skipDetails === true;
  const categories = options.categories || await Category.find({ isDeleted: false })
    .select('name key sourceNames')
    .sort({ key: 1 })
    .lean();
  const defaultSupplier = options.defaultSupplier || await Supplier.findOne({
    isDeleted: false,
    isDefaultImportSupplier: true,
  }).select('name').lean();

  if (categories.length === 0) throw new Error('CRAWL_CATEGORIES_NOT_FOUND');
  if (!defaultSupplier?.name) throw new Error('CRAWL_DEFAULT_IMPORT_SUPPLIER_NOT_FOUND');

  const allProducts = [];
  const processedIds = new Set();
  const categoryReports = [];

  for (const category of categories) {
    const searchTerms = getSearchTerms(category);
    const categoryReport = {
      category: category.name,
      categoryKey: category.key || null,
      searchTerms,
      targetCount: minPerCategory,
      crawledCount: 0,
      pagesFetched: 0,
      duplicateCount: 0,
      detailErrorCount: 0,
      listingErrorCount: 0,
      emptyPageCount: 0,
      listingErrors: [],
      invalidCount: 0,
      mismatchedCategoryCount: 0,
      rejectionBreakdown: {},
      minimumMet: false,
    };

    if (searchTerms.length === 0) {
      categoryReport.error = 'CRAWL_CATEGORY_SEARCH_TERMS_MISSING';
      categoryReports.push(categoryReport);
      continue;
    }

    for (const searchTerm of searchTerms) {
      if (categoryReport.crawledCount >= minPerCategory) break;

      for (let page = 1; page <= maxPages && categoryReport.crawledCount < minPerCategory; page += 1) {
        let items;
        try {
          items = await getProductPage(
            searchTerm,
            page,
            pageSize,
            maxRetries,
            delayMilliseconds,
            requestTimeout,
          );
        } catch (error) {
          categoryReport.pagesFetched += 1;
          categoryReport.listingErrorCount += 1;
          categoryReport.listingErrors.push({
            searchTerm,
            page,
            ...getListingErrorReason(error),
          });
          break;
        }
        categoryReport.pagesFetched += 1;
        if (items.length === 0) {
          categoryReport.emptyPageCount += 1;
          break;
        }

        for (const item of items) {
          if (categoryReport.crawledCount >= minPerCategory) break;
          const productId = getProductId(item);
          if (!productId || processedIds.has(productId)) {
            categoryReport.duplicateCount += 1;
            continue;
          }
          let product = item;
          if (!skipDetails) {
            try {
              const detail = await getProductDetail(productId, maxRetries, delayMilliseconds, requestTimeout);
              product = mergeProductData(item, detail);
            } catch {
              categoryReport.detailErrorCount += 1;
            }
          }

          const crawledProduct = {
            ...product,
            crawlCategory: {
              name: category.name,
              key: category.key || null,
              searchTerm,
            },
            crawlSupplier: { name: defaultSupplier.name },
          };
          const transformed = transformTikiProducts([crawledProduct], {
            categories,
            suppliers: [defaultSupplier],
            config: importConfig,
          });
          const isCategoryMatch = transformed.ready.some(candidate => (
            normalizeLookup(candidate.category) === normalizeLookup(category.name)
          ));
          if (!isCategoryMatch) {
            categoryReport.invalidCount += 1;
            if (transformed.ready.length > 0) categoryReport.mismatchedCategoryCount += 1;
            transformed.rejected.forEach(rejected => {
              rejected.reasons.forEach(reason => {
                categoryReport.rejectionBreakdown[reason.code] = (
                  categoryReport.rejectionBreakdown[reason.code] || 0
                ) + 1;
              });
            });
            continue;
          }

          allProducts.push(crawledProduct);
          processedIds.add(productId);
          categoryReport.crawledCount += 1;
        }

        await sleep(delayMilliseconds);
      }
    }

    categoryReport.minimumMet = categoryReport.crawledCount >= minPerCategory;
    categoryReports.push(categoryReport);
    console.log(JSON.stringify(categoryReport));
  }

  return {
    products: allProducts,
    report: {
      success: categoryReports.every(category => category.minimumMet),
      status: categoryReports.every(category => category.minimumMet)
        ? 'completed'
        : 'completed_with_shortfalls',
      startedAt: options.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      defaultSupplier: defaultSupplier.name,
      categoryCount: categories.length,
      targetPerCategory: minPerCategory,
      totalCrawledCount: allProducts.length,
      categorySummary: categoryReports,
      shortfalls: categoryReports
        .filter(category => !category.minimumMet)
        .map(category => ({
          category: category.category,
          crawledCount: category.crawledCount,
          targetCount: category.targetCount,
          reason: category.error
            || (category.listingErrorCount > 0
              ? category.listingErrors[0].reason
              : category.emptyPageCount > 0 ? 'CRAWL_LISTING_EMPTY' : 'CRAWL_TARGET_NOT_REACHED'),
        })),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = path.resolve(parseArg(args, 'data-dir', DEFAULT_DATA_DIR));
  const outputPath = path.resolve(parseArg(args, 'output', path.join(dataDir, 'products-crawl.json')));
  const minPerCategory = getPositiveInteger(parseArg(args, 'min-per-category'), 'min-per-category', DEFAULT_MIN_PER_CATEGORY);
  const maxPages = getPositiveInteger(parseArg(args, 'max-pages'), 'max-pages', DEFAULT_MAX_PAGES);
  const pageSize = getPositiveInteger(parseArg(args, 'page-size'), 'page-size', DEFAULT_PAGE_SIZE);
  const delayMilliseconds = Number.parseInt(parseArg(args, 'delay-ms', String(DEFAULT_DELAY_MS)), 10);
  const requestTimeout = getPositiveInteger(parseArg(args, 'request-timeout-ms'), 'request-timeout-ms', DEFAULT_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(delayMilliseconds) || delayMilliseconds < 0) throw new Error('delay-ms must be a non-negative integer');

  try {
    await connectMongo();
    const result = await crawlProducts({
      minPerCategory,
      maxPages,
      pageSize,
      delayMilliseconds,
      maxRetries: getPositiveInteger(parseArg(args, 'max-retries'), 'max-retries', 3),
      requestTimeout,
      skipDetails: args.includes('--skip-details'),
    });
    const reportPath = path.join(dataDir, '.crawl-reports', `products-crawl-${Date.now()}.json`);
    await writeJson(outputPath, result.products);
    await writeJson(reportPath, result.report);
    console.log(JSON.stringify({
      ...result.report,
      outputPath,
      reportPath,
    }, null, 2));
    if (!result.report.success) process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(async error => {
    console.error(error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = {
  crawlProducts,
  getSearchTerms,
};
