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
const Language = require('../models/Language');
const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');

async function setupIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // ========== PHASE 1: Languages Collection ==========
    console.log('📍 Setting up indexes for "languages" collection...');
    
    await Language.collection.createIndex(
      { code: 1 },
      { unique: true, name: 'idx_code_unique' }
    );
    console.log('   ✓ Index on code (unique)');

    await Language.collection.createIndex(
      { isReady: 1 },
      { name: 'idx_isReady' }
    );
    console.log('   ✓ Index on isReady (for monitoring setup progress)');

    // ========== PHASE 2: StaticTranslation Collection ==========
    console.log('\n📍 Setting up indexes for "statictranslations" collection...');
    
    // Compound index: code + namespace (CRITICAL for frontend)
    await StaticTranslation.collection.createIndex(
      { code: 1, namespace: 1 },
      { unique: true, name: 'idx_code_namespace_unique' }
    );
    console.log('   ✓ Compound index on code + namespace (unique, CRITICAL)');

    await StaticTranslation.collection.createIndex(
      { isDeleted: 1 },
      { name: 'idx_isDeleted' }
    );
    console.log('   ✓ Index on isDeleted (for soft delete queries)');

    await StaticTranslation.collection.createIndex(
      { code: 1, isDeleted: 1 },
      { name: 'idx_code_isDeleted' }
    );
    console.log('   ✓ Compound index on code + isDeleted (for language operations)');

    // ========== PHASE 3: LiveTranslationCache Collection ==========
    console.log('\n📍 Setting up indexes for "livetranslationcaches" collection...');
    
    // Unique hashKey for deduplication
    await LiveTranslationCache.collection.createIndex(
      { hashKey: 1 },
      { unique: true, name: 'idx_hashKey_unique' }
    );
    console.log('   ✓ Index on hashKey (unique, for deduplication)');

    // Composite index for product translation lookups
    await LiveTranslationCache.collection.createIndex(
      { entityId: 1, targetLang: 1, entityType: 1 },
      { name: 'idx_entity_lookup' }
    );
    console.log('   ✓ Compound index on entityId + targetLang + entityType (for product translations)');

    // TTL index for automatic cleanup (30 days = 2592000 seconds)
    await LiveTranslationCache.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 2592000, name: 'idx_ttl_createdAt' }
    );
    console.log('   ✓ TTL index on createdAt (auto-delete after 30 days)');

    // Additional index for language lookups
    await LiveTranslationCache.collection.createIndex(
      { targetLang: 1 },
      { name: 'idx_targetLang' }
    );
    console.log('   ✓ Index on targetLang (for language cache operations)');

    console.log('\n✨ All production indexes created successfully!\n');

    // ========== Verify Indexes ==========
    console.log('📋 Verifying created indexes...\n');

    const langIndexes = await Language.collection.getIndexes();
    console.log('Languages indexes:', Object.keys(langIndexes));

    const staticIndexes = await StaticTranslation.collection.getIndexes();
    console.log('StaticTranslation indexes:', Object.keys(staticIndexes));

    const liveIndexes = await LiveTranslationCache.collection.getIndexes();
    console.log('LiveTranslationCache indexes:', Object.keys(liveIndexes));

    console.log('\n🎉 Setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up indexes:', error.message);
    process.exit(1);
  }
}

setupIndexes();
