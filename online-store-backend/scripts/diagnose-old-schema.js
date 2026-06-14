/**
 * Diagnose old schema to understand data distribution
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../src/models/LiveTranslationCache');

async function diagnose() {
  try {
    console.log('🔍 Analyzing old schema...\n');
    await mongoose.connect(process.env.MONGO_URI);

    // Get entity type distribution
    const distribution = await LiveTranslationCache.aggregate([
      { $group: { _id: '$entityType', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('📊 Entity Type Distribution:');
    distribution.forEach(d => {
      console.log(`  ${d._id}: ${d.count} documents`);
    });

    // Check status distribution
    const statusDist = await LiveTranslationCache.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('\n📊 Status Distribution:');
    statusDist.forEach(d => {
      console.log(`  ${d._id}: ${d.count} documents`);
    });

    // Find non-product entity types
    const nonProduct = await LiveTranslationCache.find({
      entityType: { $nin: ['product_name', 'product_description', 'product_brand', 'product_spec', 'product_feature', 'product_category_name'] }
    }).select({ entityType: 1 }).distinct('entityType');

    console.log('\n📊 Non-product entity types found:');
    console.log(nonProduct);

    await mongoose.disconnect();
  } catch (e) {
    console.error('Error:', e.message);
  }
}

diagnose();
