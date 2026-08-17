/**
 * Setup Production Indexes for i18n System
 * 
 * Tạo các indexes theo blueprint:
 * 1. languages: index trên code
 * 2. statictranslations: compound index code + namespace, index isDeleted
 * 3. livetranslationcaches: hashKey (unique), entityId + targetLang + entityType, TTL
 * 
 * Chạy: node scripts/setup-production-indexes.js
 */

const mongoose = require('mongoose');
const Language = require('../src/models/Language');
const StaticTranslation = require('../src/models/StaticTranslation');
const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

async function setupIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);

    // ========== PHASE 1: Languages Collection ==========
    console.log(`${CLI_SYMBOLS.location} Setting up indexes for "languages" collection...`);
    
    await Language.collection.createIndex(
      { code: 1 },
      { unique: true, name: 'idx_code_unique' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Index on code (unique)`);

    await Language.collection.createIndex(
      { isReady: 1 },
      { name: 'idx_isReady' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Index on isReady (for monitoring setup progress)`);

    // ========== PHASE 2: StaticTranslation Collection ==========
    console.log(`\n${CLI_SYMBOLS.location} Setting up indexes for "statictranslations" collection...`);
    
    // Compound index: code + namespace (CRITICAL for frontend)
    await StaticTranslation.collection.createIndex(
      { code: 1, namespace: 1 },
      { unique: true, name: 'idx_code_namespace_unique' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Compound index on code + namespace (unique, CRITICAL)`);

    await StaticTranslation.collection.createIndex(
      { isDeleted: 1 },
      { name: 'idx_isDeleted' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Index on isDeleted (for soft delete queries)`);

    await StaticTranslation.collection.createIndex(
      { code: 1, isDeleted: 1 },
      { name: 'idx_code_isDeleted' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Compound index on code + isDeleted (for language operations)`);

    // ========== PHASE 3: LiveTranslationCache Collection ==========
    console.log(`\n${CLI_SYMBOLS.location} Setting up indexes for "livetranslationcaches" collection...`);
    
    // Unique hashKey for deduplication
    await LiveTranslationCache.collection.createIndex(
      { hashKey: 1 },
      { unique: true, name: 'idx_hashKey_unique' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Index on hashKey (unique, for deduplication)`);

    // Composite index for product translation lookups
    await LiveTranslationCache.collection.createIndex(
      { entityId: 1, targetLang: 1, entityType: 1 },
      { name: 'idx_entity_lookup' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Compound index on entityId + targetLang + entityType (for product translations)`);

    // TTL index for automatic cleanup (30 days = 2592000 seconds)
    await LiveTranslationCache.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 2592000, name: 'idx_ttl_createdAt' }
    );
    console.log(`   ${CLI_SYMBOLS.check} TTL index on createdAt (auto-delete after 30 days)`);

    // Additional index for language lookups
    await LiveTranslationCache.collection.createIndex(
      { targetLang: 1 },
      { name: 'idx_targetLang' }
    );
    console.log(`   ${CLI_SYMBOLS.check} Index on targetLang (for language cache operations)`);

    console.log(`\n${CLI_SYMBOLS.sparkles} All production indexes created successfully!\n`);

    // ========== Verify Indexes ==========
    console.log(`${CLI_SYMBOLS.list} Verifying created indexes...\n`);

    const langIndexes = await Language.collection.getIndexes();
    console.log('Languages indexes:', Object.keys(langIndexes));

    const staticIndexes = await StaticTranslation.collection.getIndexes();
    console.log('StaticTranslation indexes:', Object.keys(staticIndexes));

    const liveIndexes = await LiveTranslationCache.collection.getIndexes();
    console.log('LiveTranslationCache indexes:', Object.keys(liveIndexes));

    console.log(`\n${CLI_SYMBOLS.celebration} Setup complete!`);
    process.exit(0);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error setting up indexes:`, error.message);
    process.exit(1);
  }
}

setupIndexes();
