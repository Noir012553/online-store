#!/usr/bin/env node

/**
 * Force Regenerate Product Translations
 * 
 * Khi backend không hiển thị sản phẩm cho ngôn ngữ khác ngoài Tiếng Việt,
 * script này sẽ:
 * 1. Kiểm tra LiveTranslationCache (bộ dịch chứa raw translations)
 * 2. Gộp từ LiveTranslationCache → ProductCatalogTranslationCache
 * 3. Đảm bảo specTranslationSeeder chạy để aggregat
 * 
 * Cách dùng:
 * node scripts/force-regenerate-translations.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');

const specTranslationSeeder = require('../src/seeds/specTranslationSeeder');

async function main() {
  try {
    console.log('🌐 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('📊 Checking LiveTranslationCache...');
    const liveRecordCount = await LiveTranslationCache.countDocuments();
    console.log(`  Found ${liveRecordCount} records in LiveTranslationCache`);

    if (liveRecordCount === 0) {
      console.log('⚠️  No translations found in LiveTranslationCache');
      console.log('  → You may need to run: npm run seed -- --modules=products');
      process.exit(1);
    }

    console.log('\n🗑️  Clearing old ProductCatalogTranslationCache...');
    const deletedCount = await ProductCatalogTranslationCache.deleteMany({});
    console.log(`  Deleted ${deletedCount.deletedCount} old cache entries`);

    console.log('\n⏳ Running specTranslationSeeder to aggregate translations...');
    const result = await specTranslationSeeder();
    
    console.log(`\n✅ Translation Aggregation Complete:`);
    console.log(`  - Aggregated: ${result.aggregated}`);
    console.log(`  - Skipped: ${result.skipped}`);
    console.log(`  - Failed: ${result.failed}`);
    console.log(`  - Total: ${result.total}`);

    console.log('\n📊 Verifying ProductCatalogTranslationCache...');
    const cacheRecordCount = await ProductCatalogTranslationCache.countDocuments();
    console.log(`  Now has ${cacheRecordCount} cache entries`);

    if (cacheRecordCount > 0) {
      console.log('  ✅ Products should now display in other languages');
    } else {
      console.log('  ⚠️  Still empty - check LiveTranslationCache for data');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
