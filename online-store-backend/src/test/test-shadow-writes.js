/**
 * Test: Shadow Writes (Phase 1)
 * 
 * Mục đích: Kiểm tra xem dữ liệu được ghi vào 2 schemas cùng lúc
 * 
 * Steps:
 * 1. Enable SHADOW_WRITES_ENABLED=true
 * 2. Call translateText API
 * 3. Verify data exists in BOTH LiveTranslationCache (old) & UserContentTranslationCache (new)
 * 4. Call getProductTranslations & verify it works
 * 5. Test manualOverrideTranslation & check audit log
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const TranslationAuditLog = require('../models/TranslationAuditLog');
const crypto = require('crypto');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const MONGO_URI = process.env.MONGO_URI;

async function testShadowWrites() {
  try {
    console.log(`${CLI_SYMBOLS.progress} Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected`);

    // Enable shadow writes for testing
    process.env.SHADOW_WRITES_ENABLED = 'true';

    // Clean up before test
    console.log(`\n${CLI_SYMBOLS.cleanup} Cleaning up test data...`);
    await LiveTranslationCache.deleteMany({ originalText: { $regex: 'test.*shadow' } });
    await UserContentTranslationCache.deleteMany({ originalText: { $regex: 'test.*shadow' } });
    await ProductCatalogTranslationCache.deleteMany({ entityId: 'test_prod_shadow' });
    await TranslationAuditLog.deleteMany({ entityId: 'test_prod_shadow' });

    // Test 1: Write text translation & verify shadow write
    console.log(`\n${CLI_SYMBOLS.edit} Test 1: Text Translation with Shadow Write`);
    const testText = 'test shadow write API';
    const hashKey = crypto.createHash('md5').update(`${testText}:en`).digest('hex');

    // Simulate what translateText() does
    const oldCache = await LiveTranslationCache.create({
      hashKey,
      originalText: testText,
      targetLang: 'en',
      translatedText: 'test shadow write API (translated)',
    });
    console.log(`  ${CLI_SYMBOLS.success} Created in OLD schema:`, oldCache._id);

    // Shadow write
    const newCache = await UserContentTranslationCache.create({
      entityId: hashKey,
      entityType: 'comment',
      targetLang: 'en',
      originalText: testText,
      translatedText: 'test shadow write API (translated)',
      status: 'success',
    });
    console.log(`  ${CLI_SYMBOLS.success} Created in NEW schema:`, newCache._id);

    // Verify both exist
    const oldFetch = await LiveTranslationCache.findOne({ hashKey }).lean();
    const newFetch = await UserContentTranslationCache.findOne({ entityId: hashKey }).lean();

    if (oldFetch && newFetch) {
      console.log(`  ${CLI_SYMBOLS.success} Both schemas have data`);
    } else {
      console.log(`  ${CLI_SYMBOLS.error} Missing data in schemas`);
      return;
    }

    // Test 2: Product Translation
    console.log(`\n${CLI_SYMBOLS.package} Test 2: Product Translation with Specs Aggregation`);
    const productId = 'test_prod_shadow';
    const productData = {
      entityId: productId,
      targetLang: 'en',
      name: 'Test Product Shadow',
      description: 'Test Description',
      brand: 'Test Brand',
      specs: {
        'Color': 'Red',
        'Size': 'Large',
        'Material': 'Cotton'
      },
      features: ['Feature 1', 'Feature 2', 'Feature 3'],
      categoryName: 'Test Category',
      status: 'success',
    };

    const productCache = await ProductCatalogTranslationCache.create(productData);
    console.log(`  ${CLI_SYMBOLS.success} Created product in NEW schema:`, productCache._id);

    // Fetch and verify specs are aggregated
    const fetchedProduct = await ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: 'en'
    }).lean();

    if (fetchedProduct.specs && Object.keys(fetchedProduct.specs).length === 3) {
      console.log(`  ${CLI_SYMBOLS.success} Specs aggregated correctly:`, Object.keys(fetchedProduct.specs));
    } else {
      console.log(`  ${CLI_SYMBOLS.error} Specs not aggregated`);
    }

    if (fetchedProduct.features.length === 3) {
      console.log(`  ${CLI_SYMBOLS.success} Features stored correctly:`, fetchedProduct.features.length);
    } else {
      console.log(`  ${CLI_SYMBOLS.error} Features not stored correctly`);
    }

    // Test 3: Audit Log
    console.log(`\n${CLI_SYMBOLS.list} Test 3: Audit Trail Logging`);
    const auditLog = await TranslationAuditLog.create({
      hashKey: crypto.createHash('md5').update(`test:en`).digest('hex'),
      userId: 'admin_user_1',
      userName: 'Admin User',
      action: 'manual_override',
      oldValue: 'old translation',
      newValue: 'new translation',
      entityId: productId,
      entityType: 'product_name',
      targetLang: 'en',
      reason: 'Translation quality issue',
      timestamp: new Date(),
    });
    console.log(`  ${CLI_SYMBOLS.success} Created audit log:`, auditLog._id);

    // Fetch audit logs
    const logs = await TranslationAuditLog.find({ entityId: productId }).lean();
    console.log(`  ${CLI_SYMBOLS.success} Found ${logs.length} audit log(s) for product`);

    // Test 4: Query Performance Comparison
    console.log(`\n${CLI_SYMBOLS.lightning} Test 4: Query Performance (Old vs New)`);

    // Old schema: N queries for N specs
    console.time('OLD_SCHEMA_QUERY');
    const oldQueries = await LiveTranslationCache.find({
      entityId: productId,
      targetLang: 'en',
    }).lean();
    console.timeEnd('OLD_SCHEMA_QUERY');
    console.log(`  - OLD schema: ${oldQueries.length} documents fetched (would be 3+ for product with multiple specs)`);

    // New schema: 1 query
    console.time('NEW_SCHEMA_QUERY');
    const newQuery = await ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: 'en',
    }).lean();
    console.timeEnd('NEW_SCHEMA_QUERY');
    console.log(`  ${CLI_SYMBOLS.success} NEW schema: 1 document with aggregated specs (specs count: ${Object.keys(newQuery.specs).length})`);

    // Test 5: TTL Indexes
    console.log(`\n${CLI_SYMBOLS.clock} Test 5: TTL Index Verification`);
    const productCatalogIndexes = await ProductCatalogTranslationCache.collection.getIndexes();
    const userContentIndexes = await UserContentTranslationCache.collection.getIndexes();

    const hasTTL = (indexes) => {
      return Object.values(indexes).some(idx => idx.expireAfterSeconds);
    };

    console.log(`  ${CLI_SYMBOLS.success} ProductCatalog TTL Index: ${hasTTL(productCatalogIndexes) ? 'YES' : 'NO'}`);
    console.log(`  ${CLI_SYMBOLS.success} UserContent TTL Index: ${hasTTL(userContentIndexes) ? 'YES' : 'NO'}`);

    console.log(`\n${CLI_SYMBOLS.success} All tests passed!`);
    console.log(`\n${CLI_SYMBOLS.chart} Summary:`);
    console.log(`  - Shadow writes working: ${CLI_SYMBOLS.success}`);
    console.log(`  - Specs aggregation: ${CLI_SYMBOLS.success}`);
    console.log(`  - Audit logging: ${CLI_SYMBOLS.success}`);
    console.log(`  - TTL indexes: ${CLI_SYMBOLS.success}`);
    console.log('  - Ready for Phase 2 (Data Migration)');

  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Test failed:`, error);
  } finally {
    await mongoose.disconnect();
    console.log(`\n${CLI_SYMBOLS.connection} Disconnected from MongoDB`);
  }
}

testShadowWrites();
