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
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

async function main() {
  try {
    console.log(`${CLI_SYMBOLS.globe} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);

    console.log(`${CLI_SYMBOLS.chart} Checking LiveTranslationCache...`);
    const liveRecordCount = await LiveTranslationCache.countDocuments();
    console.log(`  Found ${liveRecordCount} records in LiveTranslationCache`);

    if (liveRecordCount === 0) {
      console.log(`${CLI_SYMBOLS.warning}  No translations found in LiveTranslationCache`);
      console.log(`  ${CLI_SYMBOLS.arrowRight} You may need to run: npm run seed -- --modules=products`);
      process.exit(1);
    }

    console.log(`\n${CLI_SYMBOLS.cleanup}  Clearing old ProductCatalogTranslationCache...`);
    const deletedCount = await ProductCatalogTranslationCache.deleteMany({});
    console.log(`  Deleted ${deletedCount.deletedCount} old cache entries`);

    console.log(`\n${CLI_SYMBOLS.wait} Running specTranslationSeeder to aggregate translations...`);
    const result = await specTranslationSeeder();
    
    console.log(`\n${CLI_SYMBOLS.success} Translation Aggregation Complete:`);
    console.log(`  - Aggregated: ${result.aggregated}`);
    console.log(`  - Skipped: ${result.skipped}`);
    console.log(`  - Failed: ${result.failed}`);
    console.log(`  - Total: ${result.total}`);

    console.log(`\n${CLI_SYMBOLS.chart} Verifying ProductCatalogTranslationCache...`);
    const cacheRecordCount = await ProductCatalogTranslationCache.countDocuments();
    console.log(`  Now has ${cacheRecordCount} cache entries`);

    if (cacheRecordCount > 0) {
      console.log(`  ${CLI_SYMBOLS.success} Products should now display in other languages`);
    } else {
      console.log(`  ${CLI_SYMBOLS.warning}  Still empty - check LiveTranslationCache for data`);
    }

    process.exit(0);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
    process.exit(1);
  }
}

main();
