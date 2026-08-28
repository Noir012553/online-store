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

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const Language = require('../models/Language');
const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const Product = require('../models/Product');
const { refreshStorefrontReadiness } = require('../services/translationHelper');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const backfillStorefrontReadiness = async () => {
  let lastId = null;
  let processed = 0;
  let ready = 0;

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const products = await Product.find(query)
      .select('_id')
      .sort({ _id: 1 })
      .limit(100)
      .lean();

    if (products.length === 0) break;

    const result = await refreshStorefrontReadiness(products.map(({ _id }) => _id));
    processed += products.length;
    ready += result.modifiedCount;
    lastId = products[products.length - 1]._id;
    console.log(`   ${CLI_SYMBOLS.progress} Readiness batch: ${processed} products processed`);
  }

  console.log(`   ${CLI_SYMBOLS.check} Storefront readiness backfill completed: ${processed} products processed, ${ready} changed`);
};

async function setupIndexes() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI chưa được cấu hình trong .env hoặc biến môi trường');
    }

    await mongoose.connect(mongoUri);
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

    await Product.createIndexes();
    console.log(`   ${CLI_SYMBOLS.check} Product indexes synchronized`);

    if (process.argv.includes('--backfill-storefront')) {
      console.log(`\n${CLI_SYMBOLS.location} Backfilling storefront readiness...`);
      await backfillStorefrontReadiness();
    }

    console.log(`\n${CLI_SYMBOLS.sparkles} All production indexes created successfully!\n`);

    // ========== Verify Indexes ==========
    console.log(`${CLI_SYMBOLS.list} Verifying created indexes...\n`);

    const langIndexes = await Language.collection.getIndexes();
    console.log('Languages indexes:', Object.keys(langIndexes));

    const staticIndexes = await StaticTranslation.collection.getIndexes();
    console.log('StaticTranslation indexes:', Object.keys(staticIndexes));

    const liveIndexes = await LiveTranslationCache.collection.getIndexes();
    console.log('LiveTranslationCache indexes:', Object.keys(liveIndexes));

    const productIndexes = await Product.collection.getIndexes();
    console.log('Product indexes:', Object.keys(productIndexes));

    console.log(`\n${CLI_SYMBOLS.celebration} Setup complete!`);
    process.exit(0);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error setting up indexes:`, error.message);
    process.exit(1);
  }
}

setupIndexes();
