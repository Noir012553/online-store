/**
 * Fix Truncated Translation Data
 * 
 * Issue: ProductCatalogTranslationCache contains truncated product names (e.g., "K" instead of "Kê tay bàn phím...")
 * Root Cause: Previous migration or seeding process stored only first character
 * 
 * Fix Strategy:
 * 1. Find all truncated translations (name length == 1 AND more than 1 product)
 * 2. Delete truncated records
 * 3. Restore from LiveTranslationCache if available
 * 4. Otherwise mark for re-translation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const Product = require('../models/Product');

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  try {
    console.log('🔧 Fixing truncated translation data...\n');
    
    await mongoose.connect(MONGO_URI);
    
    console.log('✅ Connected to MongoDB\n');
    
    // Step 1: Find all truncated translations (name = 1 character AND entityId appears multiple times = batch translation)
    console.log('📊 Step 1: Finding truncated translations...');
    const truncatedRecords = await ProductCatalogTranslationCache.find({
      name: { $regex: '^.{1}$' } // Exactly 1 character
    }).lean();
    
    console.log(`  Found ${truncatedRecords.length} potentially truncated records\n`);
    
    if (truncatedRecords.length === 0) {
      console.log('✅ No truncated records found. Nothing to fix.\n');
      await mongoose.disconnect();
      return;
    }
    
    // Step 2: Group by entityId to identify affected products
    console.log('📊 Step 2: Identifying affected products...');
    const affectedProductIds = [...new Set(truncatedRecords.map(r => r.entityId))];
    console.log(`  Affected products: ${affectedProductIds.length}\n`);
    
    // Step 3: Delete truncated records
    console.log('🗑️  Step 3: Deleting truncated records...');
    const deleteResult = await ProductCatalogTranslationCache.deleteMany({
      _id: { $in: truncatedRecords.map(r => r._id) }
    });
    console.log(`  ✅ Deleted ${deleteResult.deletedCount} truncated records\n`);
    
    // Step 4: Try to restore from LiveTranslationCache
    console.log('🔄 Step 4: Attempting to restore from LiveTranslationCache...');
    let restored = 0;
    let failedRestore = 0;
    
    for (const productId of affectedProductIds) {
      // Get all translations for this product from old table
      const liveTranslations = await LiveTranslationCache.find({
        entityId: productId,
        entityType: 'product_name',
        status: 'success'
      }).lean();
      
      if (liveTranslations.length === 0) {
        failedRestore++;
        continue;
      }
      
      // Group by targetLang to get latest translation
      const translationMap = {};
      liveTranslations.forEach(t => {
        translationMap[t.targetLang] = t.translatedText;
      });
      
      // Re-insert into ProductCatalogTranslationCache
      const operations = Object.entries(translationMap).map(([lang, name]) => ({
        updateOne: {
          filter: { entityId: productId, targetLang: lang },
          update: { $set: { name, status: 'success' } },
          upsert: true,
        }
      }));
      
      if (operations.length > 0) {
        await ProductCatalogTranslationCache.bulkWrite(operations);
        restored += operations.length;
      }
    }
    
    console.log(`  ✅ Restored ${restored} translations from LiveTranslationCache`);
    console.log(`  ⚠️  Failed to restore ${failedRestore} product translations\n`);
    
    // Step 5: Check which products still need translation
    if (failedRestore > 0) {
      console.log('📝 Products that need re-translation:');
      for (const productId of affectedProductIds) {
        const count = await ProductCatalogTranslationCache.countDocuments({ entityId: productId });
        if (count === 0) {
          const product = await Product.findById(productId).select('name').lean();
          console.log(`  - ${productId} (${product?.name || 'Unknown'})`);
        }
      }
      console.log('\n⏭️  Recommendation: Run seeding again for these products\n');
    }
    
    console.log('✅ Truncated translation fix completed!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
