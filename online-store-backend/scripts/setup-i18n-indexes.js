#!/usr/bin/env node

/**
 * Setup MongoDB Indexes for i18n Production Deployment
 * 
 * Run: npm run setup-i18n-indexes
 * 
 * Tạo tất cả indexes cần thiết cho chiến lược 3-Phase Timeline
 * theo bản thiết kế Production Blueprint
 */

const mongoose = require('mongoose');
const StaticTranslation = require('../src/models/StaticTranslation');
const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const Language = require('../src/models/Language');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-store';

async function setupIndexes() {
  try {
    console.log(`\n${CLI_SYMBOLS.location} Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB`);

    // ============ StaticTranslation Indexes ============
    console.log(`\n${CLI_SYMBOLS.location} Setting up StaticTranslation indexes...`);
    
    // 1. Compound unique index: (code, namespace)
    // Purpose: Ensure one document per language+namespace
    // Benefit: O(log n) lookup for Frontend queries
    await StaticTranslation.collection.createIndex(
      { code: 1, namespace: 1 },
      { unique: true, name: 'unique_code_namespace' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: unique_code_namespace (code, namespace)`);

    // 2. Index for soft-delete filter
    await StaticTranslation.collection.createIndex(
      { isDeleted: 1 },
      { name: 'index_isDeleted' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: index_isDeleted (isDeleted)`);

    // 3. Index for quick language lookup
    await StaticTranslation.collection.createIndex(
      { code: 1 },
      { name: 'index_code' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: index_code (code)`);

    // ============ LiveTranslationCache Indexes ============
    console.log(`\n${CLI_SYMBOLS.location} Setting up LiveTranslationCache indexes...`);

    // 1. Unique hashKey index
    // Purpose: Cache key for deduplication
    await LiveTranslationCache.collection.createIndex(
      { hashKey: 1 },
      { unique: true, name: 'unique_hashKey' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: unique_hashKey (hashKey)`);

    // 2. Compound index: (entityId, targetLang, entityType)
    // Purpose: Find all translations of a product in a language
    // Benefit: Admin Dashboard queries, product translation lookup
    await LiveTranslationCache.collection.createIndex(
      { entityId: 1, targetLang: 1, entityType: 1 },
      { name: 'index_entity_lang_type' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: index_entity_lang_type (entityId, targetLang, entityType)`);

    // 3. Compound index: (status, targetLang)
    // Purpose: Filter failed translations for Admin Dashboard
    // Benefit: "Show me all failed translations for Portuguese"
    await LiveTranslationCache.collection.createIndex(
      { status: 1, targetLang: 1 },
      { name: 'index_status_lang' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: index_status_lang (status, targetLang)`);

    // 4. TTL Index for auto-cleanup
    // Purpose: Automatically delete old cache entries after 30 days
    // Note: TTL indexes run every 60 seconds, not immediately
    const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds
    await LiveTranslationCache.collection.createIndex(
      { createdAt: 1 },
      { 
        expireAfterSeconds: TTL_SECONDS,
        name: 'ttl_createdAt_30days'
      }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: ttl_createdAt_30days (createdAt) - auto-delete after ${TTL_SECONDS}s`);

    // ============ Language Indexes ============
    console.log(`\n${CLI_SYMBOLS.location} Setting up Language indexes...`);

    // 1. Unique code index
    await Language.collection.createIndex(
      { code: 1 },
      { unique: true, name: 'unique_code' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: unique_code (code)`);

    // 2. Index for isReady checks
    // Purpose: Find languages that are ready to use
    // Benefit: Frontend check if language setup is complete
    await Language.collection.createIndex(
      { isReady: 1 },
      { name: 'index_isReady' }
    );
    console.log(`  ${CLI_SYMBOLS.check} Index: index_isReady (isReady)`);

    // ============ Summary ============
    console.log(`\n${CLI_SYMBOLS.success} All indexes created successfully!\n`);
    console.log(`${CLI_SYMBOLS.chart} Index Summary:`);
    console.log('  StaticTranslation:       3 indexes');
    console.log('  LiveTranslationCache:    4 indexes (including TTL)');
    console.log('  Language:                2 indexes');
    console.log('  ─────────────────────────────────');
    console.log('  Total:                   9 indexes\n');

    console.log(`${CLI_SYMBOLS.progress} Production i18n setup is ready!`);
    console.log(`${CLI_SYMBOLS.idea} Next steps:`);
    console.log('   1. Verify indexes: db.collection.getIndexes()');
    console.log('   2. Create a language: POST /api/languages');
    console.log('   3. Monitor progress: GET /api/languages/:code/setup-status');
    console.log('   4. Check Admin Dashboard: /admin/languagesConfig\n');

    process.exit(0);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Error setting up indexes:`);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// ============ Verify Indexes ============

async function verifyIndexes() {
  try {
    console.log(`\n${CLI_SYMBOLS.list} Verifying existing indexes...\n`);

    const staticTranslationIndexes = await StaticTranslation.collection.getIndexes();
    console.log('StaticTranslation indexes:');
    for (const [name, spec] of Object.entries(staticTranslationIndexes)) {
      console.log(`  - ${name}:`, spec.key);
    }

    const liveTranslationIndexes = await LiveTranslationCache.collection.getIndexes();
    console.log('\nLiveTranslationCache indexes:');
    for (const [name, spec] of Object.entries(liveTranslationIndexes)) {
      console.log(`  - ${name}:`, spec.key);
      if (spec.expireAfterSeconds) {
        console.log(`    (TTL: ${spec.expireAfterSeconds}s)`);
      }
    }

    const languageIndexes = await Language.collection.getIndexes();
    console.log('\nLanguage indexes:');
    for (const [name, spec] of Object.entries(languageIndexes)) {
      console.log(`  - ${name}:`, spec.key);
    }
  } catch (error) {
    console.error('Error verifying indexes:', error.message);
  }
}

// Run setup
if (require.main === module) {
  setupIndexes().then(() => verifyIndexes());
}

module.exports = { setupIndexes };
