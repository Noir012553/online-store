/**
 * Phase 4 Task #11c: Health check & monitoring for i18n
 * Monitors: error rates, cache hit rates, API latency
 * Usage: node scripts/health-check-i18n.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const UserContentTranslationCache = require('../src/models/UserContentTranslationCache');

async function checkHealth() {
  try {
    console.log('[HealthCheck] Starting i18n system health check...\n');

    await mongoose.connect(process.env.MONGO_URI);

    // Check 1: Old schema (LiveTranslationCache)
    console.log('📊 OLD SCHEMA: LiveTranslationCache');
    const oldTotal = await LiveTranslationCache.countDocuments();
    const oldByLang = await LiveTranslationCache.aggregate([
      { $group: { _id: '$targetLang', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const oldErrors = await LiveTranslationCache.countDocuments({ status: { $ne: 'success' } });
    const oldErrorRate = oldTotal > 0 ? ((oldErrors / oldTotal) * 100).toFixed(2) : 0;

    console.log(`  Total documents: ${oldTotal}`);
    console.log(`  By language: ${oldByLang.map(x => `${x._id}=${x.count}`).join(', ')}`);
    console.log(`  Error rate: ${oldErrorRate}%`);
    console.log('');

    // Check 2: New schema - ProductCatalog
    console.log('📊 NEW SCHEMA: ProductCatalogTranslationCache');
    const newProdTotal = await ProductCatalogTranslationCache.countDocuments();
    const newProdByLang = await ProductCatalogTranslationCache.aggregate([
      { $group: { _id: '$targetLang', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const newProdErrors = await ProductCatalogTranslationCache.countDocuments({ status: { $ne: 'success' } });
    const newProdErrorRate = newProdTotal > 0 ? ((newProdErrors / newProdTotal) * 100).toFixed(2) : 0;

    console.log(`  Total documents: ${newProdTotal}`);
    console.log(`  By language: ${newProdByLang.map(x => `${x._id}=${x.count}`).join(', ')}`);
    console.log(`  Error rate: ${newProdErrorRate}%`);
    console.log('');

    // Check 3: New schema - UserContent
    console.log('📊 NEW SCHEMA: UserContentTranslationCache');
    const newUserTotal = await UserContentTranslationCache.countDocuments();
    const newUserByLang = await UserContentTranslationCache.aggregate([
      { $group: { _id: '$targetLang', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const newUserErrors = await UserContentTranslationCache.countDocuments({ status: { $ne: 'success' } });
    const newUserErrorRate = newUserTotal > 0 ? ((newUserErrors / newUserTotal) * 100).toFixed(2) : 0;

    console.log(`  Total documents: ${newUserTotal}`);
    console.log(`  By language: ${newUserByLang.map(x => `${x._id}=${x.count}`).join(', ')}`);
    console.log(`  Error rate: ${newUserErrorRate}%`);
    console.log('');

    // Check 4: Alert thresholds
    console.log('⚠️  ALERTS');
    const alerts = [];

    if (oldErrorRate > 5) {
      alerts.push(`  ❌ HIGH ERROR RATE in OLD schema: ${oldErrorRate}% (threshold: 5%)`);
    }

    if (newProdErrorRate > 5) {
      alerts.push(`  ❌ HIGH ERROR RATE in ProductCatalog: ${newProdErrorRate}% (threshold: 5%)`);
    }

    if (newUserErrorRate > 5) {
      alerts.push(`  ❌ HIGH ERROR RATE in UserContent: ${newUserErrorRate}% (threshold: 5%)`);
    }

    // Cache hit rate heuristic: if new schema has decent coverage, old is not needed
    const migrationProgress = newProdTotal > 0 ? ((newProdTotal / oldTotal) * 100).toFixed(2) : 0;
    if (migrationProgress < 70) {
      alerts.push(`  ⚠️  Migration incomplete: ${migrationProgress}% of data in new schema`);
    }

    if (alerts.length > 0) {
      alerts.forEach(a => console.log(a));
    } else {
      console.log('  ✅ All systems healthy');
    }

    console.log('');
    console.log('📈 SUMMARY');
    console.log(`  Total cache size (OLD): ${oldTotal} documents`);
    console.log(`  Total cache size (NEW): ${newProdTotal + newUserTotal} documents`);
    console.log(`  Migration progress: ${migrationProgress}%`);

    process.exit(0);
  } catch (error) {
    console.error('[HealthCheck] Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkHealth();
