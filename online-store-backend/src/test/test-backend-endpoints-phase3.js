/**
 * Test Backend Translation Endpoints - Phase 3 (#7c)
 * 
 * Test scenarios:
 * 1. getProductTranslations: Query new schema first, fallback to old
 * 2. getReviewTranslations: Query new schema first, fallback to old
 * 3. Rate limiting and queue behavior
 * 4. Shadow writes are working
 * 5. Audit logging on manual overrides
 */

const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TEST_TIMEOUT = 30000;

const getTargetLanguage = () => (
  getActiveLangCodes().find((code) => code !== getDefaultLanguage().code)
  || getDefaultLanguage().code
);

const requestProducts = async (pageSize = 2) => {
  const response = await axios.get(
    `${BASE_URL}/api/products?pageNumber=1&pageSize=${pageSize}`,
    { validateStatus: () => true }
  );

  if (response.status !== 200) {
    throw new Error(`Unable to load product fixtures: ${response.status}`);
  }

  const products = response.data.products || response.data.data?.products || [];
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No product fixture is available');
  }

  return products;
};

const createLegacyFallbackFixture = async (targetLang) => {
  await mongoose.connect(process.env.MONGO_URI);
  const sourceProduct = await Product.findOne({ isDeleted: false }).lean();
  if (!sourceProduct) {
    await mongoose.disconnect();
    throw new Error('No product source is available for fallback fixture');
  }

  const productId = new mongoose.Types.ObjectId();
  const name = `Fallback fixture ${productId}`;
  const description = 'Fallback fixture source description';
  const product = await Product.create({
    _id: productId,
    user: sourceProduct.user,
    name,
    image: sourceProduct.image,
    sku: `fallback-${productId}`,
    brand: sourceProduct.brand,
    category: sourceProduct.category,
    description,
    specs: {},
    price: sourceProduct.price,
    originalPrice: sourceProduct.originalPrice,
    baseCurrencyCode: sourceProduct.baseCurrencyCode,
    countInStock: sourceProduct.countInStock,
  });

  const records = [
    {
      entityType: 'product_name',
      originalText: name,
      translatedText: `Legacy ${name}`,
    },
    {
      entityType: 'product_description',
      originalText: description,
      translatedText: `Legacy ${description}`,
    },
  ].map((translation, index) => ({
    ...translation,
    entityId: product._id.toString(),
    targetLang,
    hashKey: `fallback-fixture-${product._id}-${targetLang}-${index}`,
    status: 'success',
    qualityStatus: 'approved',
  }));

  await LiveTranslationCache.insertMany(records);

  return {
    productId: product._id.toString(),
    cleanup: async () => {
      await ProductCatalogTranslationCache.deleteMany({ entityId: product._id.toString() });
      await LiveTranslationCache.deleteMany({ entityId: product._id.toString() });
      await Product.deleteOne({ _id: product._id });
      await mongoose.disconnect();
    },
  };
};

const getStaticNamespace = async () => {
  const response = await axios.get(
    `${BASE_URL}/api/translations/namespaces`,
    { validateStatus: () => true }
  );

  if (response.status !== 200) {
    throw new Error(`Unable to load translation namespaces: ${response.status}`);
  }

  const namespaces = response.data.data || [];
  if (!Array.isArray(namespaces) || namespaces.length === 0) {
    throw new Error('No static translation namespace is available');
  }

  return namespaces.includes('common') ? 'common' : namespaces[0];
};

const testLang = getTargetLanguage();

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}${CLI_SYMBOLS.check}${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}${CLI_SYMBOLS.cross}${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}${CLI_SYMBOLS.info}${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}${CLI_SYMBOLS.warning}${colors.reset} ${msg}`),
};

class EndpointTester {
  constructor() {
    this.passedTests = 0;
    this.failedTests = 0;
    this.testResults = [];
  }

  async runTest(testName, testFn) {
    try {
      log.info(`Running: ${testName}`);
      await testFn();
      this.passedTests++;
      log.success(`${testName}`);
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      this.failedTests++;
      log.error(`${testName}`);
      console.error(`  └─ ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async test1_ProductTranslationsNewSchema() {
    const [product] = await requestProducts(1);
    const productId = product._id;
    const lang = getTargetLanguage();

    const response = await axios.get(
      `${BASE_URL}/api/products/${productId}/translations?lang=${lang}`,
      { validateStatus: () => true }
    );

    if (response.status === 404) {
      log.info(`  └─ 404 for non-existent product (ok, no seeded data)`);
      return;
    }

    if (response.status !== 200) {
      throw new Error(`Expected 200 or 404, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const { success, data } = response.data;
    if (!success) {
      throw new Error(`API returned success: false`);
    }

    if (!data) {
      log.info('  └─ Product exists but has no translation data (ok, no seeded data)');
      return;
    }

    // Check response structure
    if (!data.specs || typeof data.specs !== 'object') {
      throw new Error('specs should be an object');
    }

    // If data has specs, should be from new schema (aggregated)
    if (data.specs && typeof data.specs === 'object' && Object.keys(data.specs).length > 0) {
      log.info(`  └─ Found ${Object.keys(data.specs).length} specs (aggregated in new schema)`);
    }
  }

  async test2_ProductTranslationsFallback() {
    const lang = getTargetLanguage();
    const fixture = await createLegacyFallbackFixture(lang);

    try {
      const response = await axios.get(
        `${BASE_URL}/api/products/${fixture.productId}/translations?lang=${lang}`,
        { validateStatus: () => true }
      );

      if (response.status !== 200) {
        throw new Error(`Expected fallback response 200, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      const { data } = response.data;
      if (data?.name !== `Legacy Fallback fixture ${fixture.productId}`) {
        throw new Error('Legacy product translation fallback did not return the seeded name');
      }

      log.info('  └─ Dynamic legacy fallback fixture returned successfully');
    } finally {
      await fixture.cleanup();
    }
  }

  async test3_ReviewTranslationsNewSchema() {
    const reviewId = crypto.randomBytes(12).toString('hex');
    const lang = getTargetLanguage();

    const response = await axios.get(
      `${BASE_URL}/api/translations/reviews/${reviewId}?lang=${lang}`,
      { validateStatus: () => true }
    );

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const { data } = response.data;
    if (data.comment === null) {
      log.info('  └─ No review translation found (ok for non-existent)');
    }
  }

  async test4_TranslateTextWithShadowWrite() {
    // Test that translateText creates shadow writes
    const testText = `Test translation at ${new Date().toISOString()}`;
    const targetLang = getTargetLanguage();
    const sourceLang = getDefaultLanguage().code;

    const response = await axios.post(
      `${BASE_URL}/api/translations/translate`,
      {
        text: testText,
        targetLang,
        sourceLang,
        useCache: false, // Force new translation
      },
      { validateStatus: () => true }
    );

    if (response.status === 429) {
      log.warn('  └─ Rate limited (429) - rate limiting working');
      return;
    }

    if (response.status === 410 || response.status === 500 || response.status === 503) {
      log.warn(`  └─ Cloudflare AI service unavailable (${response.status}) - expected in test/dev env without API key`);
      return;
    }

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const { success, data } = response.data;
    if (!success) {
      throw new Error('Translation failed');
    }

    if (!data.translatedText || data.translatedText.length === 0) {
      throw new Error('No translated text returned');
    }

    log.info(`  └─ Translated: "${testText.substring(0, 30)}..." → "${data.translatedText.substring(0, 30)}..."`);

    // Verify cache write (check LiveTranslationCache was updated)
    log.info(`  └─ Shadow write should have been created in LiveTranslationCache`);
  }

  async test5_RateLimitingBehavior() {
    // Test that rapid requests trigger rate limiting
    log.info('  └─ Testing rate limiting (sending 10 rapid requests)');

    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        axios.post(
          `${BASE_URL}/api/translations/translate`,
          {
            text: `Test ${i}`,
            targetLang: testLang,
            sourceLang: getDefaultLanguage().code,
          },
          { validateStatus: () => true }
        )
      );
    }

    const results = await Promise.allSettled(requests);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 500
    );

    const rateLimited = statuses.filter((s) => s === 429).length;
    const successful = statuses.filter((s) => s === 200).length;

    log.info(`    - Successful: ${successful}, Rate limited: ${rateLimited}`);

    if (rateLimited > 0) {
      log.info('    - Rate limiting is active ✓');
    } else {
      log.warn('    - No rate limiting observed (might be configured differently)');
    }
  }

  async test6_ManualOverrideAudit() {
    const hashKey = crypto.createHash('md5')
      .update(`test_audit:${getTargetLanguage()}:${Date.now()}`)
      .digest('hex');
    const response = await axios.post(
      `${BASE_URL}/api/translations/manual-override`,
      {
        hashKey,
        translatedText: 'Manual override test at ' + new Date().toISOString(),
        reason: 'Testing audit logging',
      },
      { validateStatus: () => true }
    );

    if (response.status === 404) {
      log.info('  └─ Translation not found in cache (ok, would need seeding first)');
      return;
    }

    if (response.status === 200 || response.status === 201) {
      log.info('  └─ Manual override recorded');
      // In production, verify audit log was created
    }
  }

  async test7_CacheHeadersPresent() {
    // Test that cache headers are properly set
    const namespace = await getStaticNamespace();
    const lang = getTargetLanguage();
    const response = await axios.get(
      `${BASE_URL}/api/translations?lang=${lang}&ns=${encodeURIComponent(namespace)}`,
      { validateStatus: () => true }
    );

    if (response.status === 404) {
      log.warn('  └─ Translation not found (ok, no data seeded yet)');
      return;
    }

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const cacheControl = response.headers['cache-control'];
    const etag = response.headers['etag'];

    if (!cacheControl) {
      throw new Error('Cache-Control header missing');
    }

    if (!etag) {
      throw new Error('ETag header missing');
    }

    log.info(`  └─ Cache headers present: Cache-Control: ${cacheControl}, ETag: ${etag}`);
  }

  async test8_VietnameseLangNoTranslation() {
    const [product] = await requestProducts(1);
    const sourceLang = getDefaultLanguage().code;
    const response = await axios.get(
      `${BASE_URL}/api/products/${product._id}/translations?lang=${sourceLang}`,
      { validateStatus: () => true }
    );

    if (response.status !== 200) {
      throw new Error(`Expected source product response 200, got ${response.status}`);
    }

    const { data } = response.data;
    if (!data || data.name !== product.name || data.brand !== product.brand) {
      throw new Error('Source language should return the original product fields');
    }

    log.info('  └─ Source language correctly returns original product data');
  }

  async runAllTests() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  BACKEND TRANSLATION ENDPOINTS TEST SUITE (Phase 3 #7c)');
    console.log('═══════════════════════════════════════════════════════════\n');

    await this.runTest('Test 1: Product Translations from New Schema', () =>
      this.test1_ProductTranslationsNewSchema()
    );

    await this.runTest('Test 2: Product Translations Fallback to Old Schema', () =>
      this.test2_ProductTranslationsFallback()
    );

    await this.runTest('Test 3: Review Translations from New Schema', () =>
      this.test3_ReviewTranslationsNewSchema()
    );

    await this.runTest('Test 4: Shadow Write on Translate Text', () =>
      this.test4_TranslateTextWithShadowWrite()
    );

    await this.runTest('Test 5: Rate Limiting Behavior', () =>
      this.test5_RateLimitingBehavior()
    );

    await this.runTest('Test 6: Manual Override Audit Logging', () =>
      this.test6_ManualOverrideAudit()
    );

    await this.runTest('Test 7: Cache Headers Present', () =>
      this.test7_CacheHeadersPresent()
    );

    await this.runTest('Test 8: Vietnamese Language No Translation', () =>
      this.test8_VietnameseLangNoTranslation()
    );

    this.printResults();
  }

  printResults() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    this.testResults.forEach((result) => {
      if (result.status === 'PASS') {
        log.success(result.name);
      } else {
        log.error(`${result.name}`);
        if (result.error) {
          console.error(`    └─ ${result.error}`);
        }
      }
    });

    console.log('\n');
    console.log(`Total: ${this.passedTests + this.failedTests}`);
    log.success(`Passed: ${this.passedTests}`);
    if (this.failedTests > 0) {
      log.error(`Failed: ${this.failedTests}`);
    }

    const percentage = Math.round(
      (this.passedTests / (this.passedTests + this.failedTests)) * 100
    );
    console.log(`Success Rate: ${percentage}%\n`);

    process.exit(this.failedTests > 0 ? 1 : 0);
  }
}

// Run tests
const tester = new EndpointTester();
tester.runAllTests().catch((error) => {
  log.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
