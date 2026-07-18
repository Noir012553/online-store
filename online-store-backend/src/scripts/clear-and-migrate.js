/**
 * Clear old migration data and re-run migration with fixes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const UserContentTranslationCache = require('../src/models/UserContentTranslationCache');

const MigrationService = require('./migrate-translations');

async function clearAndMigrate() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    console.log('🗑️  Clearing previous migration data...');
    const p = await ProductCatalogTranslationCache.deleteMany({});
    const u = await UserContentTranslationCache.deleteMany({});
    console.log(`  ✅ ProductCatalogTranslationCache: ${p.deletedCount} deleted`);
    console.log(`  ✅ UserContentTranslationCache: ${u.deletedCount} deleted\n`);

    // Now run migration
    const migration = require('./migrate-translations');
    const service = new migration();
    await service.run();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

clearAndMigrate();
