/**
 * Script kiểm tra trạng thái đồng bộ dịch cho products và categories
 * Cấu trúc report:
 * 1. Số lượng products/categories trong DB
 * 2. Số lượng translations trong cache (per language)
 * 3. Translation coverage % (bao nhiêu % được dịch)
 * 4. Error status distribution
 * 5. Top 5 errors nếu có
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const Product = require('../models/Product');
const Category = require('../models/Category');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const LANGUAGES = getActiveLangCodes();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-store', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} MongoDB connection failed:`, error.message);
    process.exit(1);
  }
};

const checkProducts = async () => {
  console.log(CLI_SYMBOLS.divider.repeat(55));
  console.log(`${CLI_SYMBOLS.package} PRODUCTS TRANSLATION STATUS`);
  console.log(`${CLI_SYMBOLS.divider.repeat(55)}\n`);

  const totalProducts = await Product.countDocuments({ isDeleted: false });
  console.log(`${CLI_SYMBOLS.chart} Total products in DB: ${totalProducts}`);

  const stats = {
    byLanguage: {},
    totalCached: 0,
    errorsByStatus: {},
  };

  // Check each language
  for (const lang of LANGUAGES) {
    const cached = await ProductCatalogTranslationCache.countDocuments({
      targetLang: lang,
    });

    const byStatus = await ProductCatalogTranslationCache.aggregate([
      { $match: { targetLang: lang } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    stats.byLanguage[lang] = {
      cached,
      coverage: totalProducts > 0 ? ((cached / totalProducts) * 100).toFixed(1) : 0,
      byStatus: Object.fromEntries(byStatus.map(s => [s._id, s.count])),
    };
    stats.totalCached += cached;
  }

  // Get error details
  const errors = await ProductCatalogTranslationCache.find(
    { status: { $ne: 'success' } },
    { entityId: 1, targetLang: 1, status: 1, lastErrorMessage: 1 }
  )
    .limit(5)
    .lean();

  // Display results
  console.log(`\n${CLI_SYMBOLS.chartUp} Coverage per language:`);
  LANGUAGES.forEach(lang => {
    const stat = stats.byLanguage[lang];
    const coverage = stat.coverage;
    const bar =
      CLI_SYMBOLS.progressComplete.repeat(Math.floor(coverage / 5)) + CLI_SYMBOLS.progressRemaining.repeat(20 - Math.floor(coverage / 5));
    console.log(`  ${lang.toUpperCase().padEnd(3)} [${bar}] ${coverage}% (${stat.cached}/${totalProducts})`);
  });

  console.log(`\n${CLI_SYMBOLS.list} Status breakdown per language:`);
  LANGUAGES.forEach(lang => {
    const stat = stats.byLanguage[lang];
    console.log(`  ${lang.toUpperCase()}:`);
    Object.entries(stat.byStatus).forEach(([status, count]) => {
      const icon =
        status === 'success' ? CLI_SYMBOLS.success : status === 'pending_retry' ? CLI_SYMBOLS.wait : CLI_SYMBOLS.error;
      console.log(`    ${icon} ${status}: ${count}`);
    });
  });

  if (errors.length > 0) {
    console.log(`\n${CLI_SYMBOLS.warning} Top errors:`);
    errors.forEach(err => {
      console.log(`  ${CLI_SYMBOLS.bullet} [${err.targetLang.toUpperCase()}] ${err.status}`);
      if (err.lastErrorMessage) {
        console.log(`    ${err.lastErrorMessage.substring(0, 80)}...`);
      }
    });
  }

  console.log(
    `\n${CLI_SYMBOLS.chart} Total cached: ${stats.totalCached}/${totalProducts * LANGUAGES.length} (${totalProducts > 0 ? ((stats.totalCached / (totalProducts * LANGUAGES.length)) * 100).toFixed(1) : 0}%)\n`
  );
};

const checkCategories = async () => {
  console.log(CLI_SYMBOLS.divider.repeat(55));
  console.log(`${CLI_SYMBOLS.tag}  CATEGORIES TRANSLATION STATUS`);
  console.log(`${CLI_SYMBOLS.divider.repeat(55)}\n`);

  const totalCategories = await Category.countDocuments({ isDeleted: false });
  console.log(`${CLI_SYMBOLS.chart} Total categories in DB: ${totalCategories}`);

  const stats = {
    byLanguage: {},
    totalCached: 0,
    errorsByStatus: {},
  };

  // Check each language
  for (const lang of LANGUAGES) {
    const cached = await CategoryCatalogTranslationCache.countDocuments({
      targetLang: lang,
    });

    const byStatus = await CategoryCatalogTranslationCache.aggregate([
      { $match: { targetLang: lang } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    stats.byLanguage[lang] = {
      cached,
      coverage: totalCategories > 0 ? ((cached / totalCategories) * 100).toFixed(1) : 0,
      byStatus: Object.fromEntries(byStatus.map(s => [s._id, s.count])),
    };
    stats.totalCached += cached;
  }

  // Get error details
  const errors = await CategoryCatalogTranslationCache.find(
    { status: { $ne: 'success' } },
    { entityId: 1, targetLang: 1, status: 1, lastErrorMessage: 1 }
  )
    .limit(5)
    .lean();

  // Display results
  console.log(`\n${CLI_SYMBOLS.chartUp} Coverage per language:`);
  LANGUAGES.forEach(lang => {
    const stat = stats.byLanguage[lang];
    const coverage = stat.coverage;
    const bar =
      CLI_SYMBOLS.progressComplete.repeat(Math.floor(coverage / 5)) + CLI_SYMBOLS.progressRemaining.repeat(20 - Math.floor(coverage / 5));
    console.log(`  ${lang.toUpperCase().padEnd(3)} [${bar}] ${coverage}% (${stat.cached}/${totalCategories})`);
  });

  console.log(`\n${CLI_SYMBOLS.list} Status breakdown per language:`);
  LANGUAGES.forEach(lang => {
    const stat = stats.byLanguage[lang];
    console.log(`  ${lang.toUpperCase()}:`);
    Object.entries(stat.byStatus).forEach(([status, count]) => {
      const icon =
        status === 'success' ? CLI_SYMBOLS.success : status === 'pending_retry' ? CLI_SYMBOLS.wait : CLI_SYMBOLS.error;
      console.log(`    ${icon} ${status}: ${count}`);
    });
  });

  if (errors.length > 0) {
    console.log(`\n${CLI_SYMBOLS.warning} Top errors:`);
    errors.forEach(err => {
      console.log(`  ${CLI_SYMBOLS.bullet} [${err.targetLang.toUpperCase()}] ${err.status}`);
      if (err.lastErrorMessage) {
        console.log(`    ${err.lastErrorMessage.substring(0, 80)}...`);
      }
    });
  }

  console.log(
    `\n${CLI_SYMBOLS.chart} Total cached: ${stats.totalCached}/${totalCategories * LANGUAGES.length} (${totalCategories > 0 ? ((stats.totalCached / (totalCategories * LANGUAGES.length)) * 100).toFixed(1) : 0}%)\n`
  );
};

const main = async () => {
  await connectDB();

  try {
    await checkProducts();
    await checkCategories();

    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log(`${CLI_SYMBOLS.success} Status check complete!`);
    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log('\nNext: Run "npm run seed" to generate/translate data\n');
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

main();
