/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const seedLogger = require('../utils/seedLogger');
const translationReporter = require('../utils/translationReporter');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { connectMongo } = require('../config/mongoConnection');

/**
 * ==================== SEEDS - Database Initialization ====================
 *
 * Script để khởi tạo database với dữ liệu test/demo
 * ⚡ LAYER 1 (i18n) được ưu tiên chạy trước tất cả entities khác
 *
 * Cách dùng:
 * npm run seed                                  - Seed dữ liệu nền trước khi import Product
 * npm run seed -- --dry-run                     - Test mode (skip AI, use mock data)
 * npm run seed -- --incremental                 - Only translate missing items
 * npm run seed:post-products                    - Seed dữ liệu phụ thuộc sau khi import Product
 * npm run seed -- --i18n-only                   - Seed ONLY i18n (Layer 1: languages + translations)
 *
 * Environment Variables:
 * DRY_RUN=true                 - Test without AI calls
 * INCREMENTAL_SEED=true        - Skip already-translated items
 *
 * Thứ tự seeding (LAYER 1 i18n luôn ưu tiên đầu tiên):
 * LAYER 1 (i18n - ⚡ ưu tiên cao nhất)
 *   0. Languages (vi as default, en as secondary)
 *   1. Static Translations (Load từ JSON files)
 *
 * LAYER 2 (Core entities - chỉ chạy nếu không --i18n-only)
 *   2. Users (admin, user1, user2)
 *   3. Categories (6 danh mục)
 *   5. Customers (30 khách hàng)
 *
 * Sau khi admin import Product, chạy seed:post-products để tạo reviews, orders, coupons và spec translations.
 */

// ==================== Import Registry & Utilities ====================

const { SEED_MODULES, SEED_PHASES, resolveModules, listModules } = require('./seedRegistry');
const CategoryFactory = require('../factories/categoryFactory');

// ==================== Main Seed Function ====================

/**
 * Parse CLI arguments
 */
function parseCliArgs() {
  const args = process.argv.slice(2);

  // Extract --modules=foo,bar or --only-module=foo
  let modules = null;
  let onlyModule = null;
  let phase = null;

  args.forEach(arg => {
    if (arg.startsWith('--modules=')) {
      modules = arg.replace('--modules=', '').split(',').map(m => m.trim());
    }
    if (arg.startsWith('--only-module=')) {
      onlyModule = arg.replace('--only-module=', '').trim();
    }
    if (arg.startsWith('--phase=')) {
      phase = arg.replace('--phase=', '').trim();
    }
  });

  return {
    dryRun: args.includes('--dry-run'),
    incremental: args.includes('--incremental'),
    i18nOnly: args.includes('--i18n-only'),
    all: args.includes('--all'),
    list: args.includes('--list'),
    modules,
    onlyModule,
    phase,
  };
}

/**
 * Main seed orchestrator
 * Thực thi seeding tuần tự theo thứ tự dependencies
 */
const seed = async () => {
  try {
    const cliArgs = parseCliArgs();

    // ==================== Handle --list flag ====================
    if (cliArgs.list) {
      listModules();
      process.exit(0);
    }

    // ==================== Validate Modes ====================

    if (cliArgs.dryRun) {
      seedLogger.log(`${CLI_SYMBOLS.test} DRY RUN MODE: Using mock data, skipping AI translations\n`);
      process.env.DRY_RUN = 'true';
    }

    if (cliArgs.incremental) {
      seedLogger.log(`${CLI_SYMBOLS.progress} INCREMENTAL MODE: Only translating missing items\n`);
      process.env.INCREMENTAL_SEED = 'true';
    }

    if (cliArgs.i18nOnly) {
      seedLogger.log(`${CLI_SYMBOLS.globe} i18n ONLY (LAYER 1): Seeding only i18n (languages + translations)\n`);
    }

    // ==================== Resolve modules to run ====================
    let modulesToRun = [];

    if (cliArgs.phase) {
      const phaseModules = {
        'pre-products': SEED_PHASES.preProducts,
        'post-products': SEED_PHASES.postProducts,
      }[cliArgs.phase];
      if (!phaseModules) {
        throw new Error(`Unknown seed phase: ${cliArgs.phase}`);
      }
      modulesToRun = [...phaseModules];
      seedLogger.log(`${CLI_SYMBOLS.target} PHASE mode: Running ${cliArgs.phase} [${modulesToRun.join(', ')}]\n`);
    } else if (cliArgs.onlyModule) {
      // --only-module=foo: Run ONLY foo, skip dependencies
      modulesToRun = [cliArgs.onlyModule];
      seedLogger.log(`${CLI_SYMBOLS.target} ONLY-MODULE mode: Running ${cliArgs.onlyModule} (no dependencies)\n`);
    } else if (cliArgs.modules) {
      // --modules=foo,bar: Run foo and bar WITH dependencies
      modulesToRun = resolveModules(cliArgs.modules);
      seedLogger.log(`${CLI_SYMBOLS.package} MODULES mode: Running [${modulesToRun.join(', ')}]\n`);
    } else if (cliArgs.i18nOnly) {
      modulesToRun = resolveModules(['languages', 'translations']);
    } else {
      modulesToRun = [...SEED_PHASES.preProducts];
      seedLogger.log(`${CLI_SYMBOLS.package} PRE-PRODUCTS MODE: Running baseline modules before product import\n`);
    }

    // ==================== Database Connection ====================

    /**
     * Kết nối MongoDB
     * Sử dụng MONGO_URI từ .env file
     */
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    await connectMongo();

    // ==================== Start Seeding ====================

    // ==================== Modular Seeding ====================
    seedLogger.log(`\n${CLI_SYMBOLS.package} Executing ${modulesToRun.length} modules...\n`);

    // Cache context for passing data between seeders
    const seedContext = {
      users: null,
      categories: null,
      products: null,
      customers: null,
      locations: null,
    };

    for (const moduleName of modulesToRun) {
      const module = SEED_MODULES[moduleName];
      if (!module) {
        seedLogger.warn(`Unknown module: ${moduleName}`);
        continue;
      }

      try {
        seedLogger.log(`${CLI_SYMBOLS.run}  Running: ${module.name}`);

        // Call seeder with context (for accessing previous results)
        const seederFn = module.seeder;
        let result = null;

        if (['specTranslations', 'reviews', 'orders', 'coupons'].includes(moduleName)) {
          if (!seedContext.products) {
            const Product = require('../models/Product');
            seedContext.products = await Product.find({ isDeleted: false }).lean();
          }
          if (seedContext.products.length === 0) {
            throw new Error('Cannot run post-products seed without imported products');
          }
        }

        // Handle seeders that need context/params
        if (moduleName === 'addresses') {
          if (!seedContext.customers) {
            const Customer = require('../models/Customer');
            seedContext.customers = await Customer.find().lean();
          }
          result = await seederFn();
        } else if (moduleName === 'reviews') {
          if (!seedContext.products || !seedContext.users) {
            const Product = require('../models/Product');
            const User = require('../models/User');
            seedContext.products = await Product.find().lean();
            seedContext.users = await User.find().lean();
          }
          result = await seederFn(seedContext.products, seedContext.users);
        } else if (moduleName === 'orders') {
          if (!seedContext.products || !seedContext.users || !seedContext.customers) {
            const Product = require('../models/Product');
            const User = require('../models/User');
            const Customer = require('../models/Customer');
            seedContext.products = await Product.find().lean();
            seedContext.users = await User.find().lean();
            seedContext.customers = await Customer.find().lean();
          }
          result = await seederFn(seedContext.products, seedContext.users, seedContext.customers);
        } else if (moduleName === 'coupons') {
          if (!seedContext.products || !seedContext.categories) {
            const Product = require('../models/Product');
            const Category = require('../models/Category');
            seedContext.products = await Product.find().lean();
            seedContext.categories = await Category.find().lean();
          }
          result = await seederFn(seedContext.products, seedContext.categories);
        } else if (moduleName === 'locations') {
          if (!seedContext.shippingProviders) {
            // locations depends on shippingProviders being configured
            if (!modulesToRun.includes('shippingProviders')) {
              seedLogger.warn(`locations requires shippingProviders to run first`);
              continue;
            }
          }
          result = await seederFn();
        } else {
          // Simple seeders with no parameters
          result = await seederFn();
        }

        // Store in context for next modules
        if (moduleName === 'users' && Array.isArray(result)) seedContext.users = result;
        if (moduleName === 'categories' && Array.isArray(result)) seedContext.categories = result;
        if (moduleName === 'customers' && Array.isArray(result)) seedContext.customers = result;
        if (moduleName === 'locations' && Array.isArray(result)) seedContext.locations = result;

        seedLogger.log(`${CLI_SYMBOLS.success} ${module.name}`);
      } catch (error) {
        if (module.importance === 'CRITICAL') {
          seedLogger.error(`CRITICAL module failed: ${moduleName}`);
          throw error;
        } else {
          seedLogger.warn(`${moduleName} failed (non-critical): ${error.message}`);
        }
      }
    }


    // ==================== Seeding Summary ====================

    // Clear analytics cache after seeding to ensure fresh data
    const { clearCache } = require('../utils/cacheUtils');
    clearCache('dashboardStats');
    clearCache('dashboardData');
    clearCache('topProducts');
    clearCache('revenueTimeline');
    clearCache('orderStatus');
    seedLogger.log(`${CLI_SYMBOLS.cleanup} Cleared analytics cache for fresh data\n`);

    seedLogger.log(`\n${CLI_SYMBOLS.success} Seeding completed successfully!\n`);
    seedLogger.log(`${CLI_SYMBOLS.chart} Modules executed: ${modulesToRun.join(', ')}\n`);

    // Generate translation quality report
    try {
      // Get overall stats (without targetLang filter for aggregated stats)
      const totalStats = await LiveTranslationCache.aggregate([
        {
          $group: {
            _id: null,
            totalTranslations: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'approved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'pending'] }, 1, 0] } },
            needsRetranslate: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'needs_retranslate'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'rejected'] }, 1, 0] } },
            avgQualityScore: { $avg: '$qualityScore' }
          }
        }
      ]);

      // Get error stats
      const errorStats = await LiveTranslationCache.aggregate([
        {
          $match: { validationErrors: { $exists: true, $ne: [] } }
        },
        { $unwind: '$validationErrors' },
        {
          $group: {
            _id: '$validationErrors',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      if (totalStats.length > 0) {
        const report = await translationReporter.generateSeedReport(totalStats);
        report.issuesBreakdown = {};
        errorStats.forEach(stat => {
          report.issuesBreakdown[stat._id] = {
            count: stat.count,
            percentage: totalStats[0].totalTranslations > 0
              ? `${((stat.count / totalStats[0].totalTranslations) * 100).toFixed(2)}%`
              : '0%'
          };
        });
        translationReporter.printSeedReport(report);
        translationReporter.saveReport(report);
        seedLogger.log(`${CLI_SYMBOLS.report} Translation Quality Report saved to ./translation-reports/\n`);
      }
    } catch (reportError) {
      seedLogger.warn(`Failed to generate translation report: ${reportError.message}`);
    }

    // Clear analytics cache after seeding to ensure fresh data
    try {
      const { clearCache } = require('../utils/cacheUtils');
      clearCache('dashboardStats');
      clearCache('revenueTimeline');
      clearCache('orderStatus');
      clearCache('topProducts');
      clearCache('dashboardData');
      seedLogger.log(`${CLI_SYMBOLS.cleanup} ${CLI_SYMBOLS.success} Cleared analytics cache for fresh dashboard data\n`);
    } catch (cacheError) {
      seedLogger.warn(`Failed to clear analytics cache: ${cacheError.message}`);
    }

    // Generate report files
    seedLogger.generateReports();

    /**
     * Exit process khi hoàn thành
     */
    process.exit(0);
  } catch (error) {
    seedLogger.error(`\nSeeding failed with error: ${error.message}`);
    if (error.stack) {
      seedLogger.error(error.stack);
    }
    // Generate report even on error
    seedLogger.generateReports();
    process.exit(1);
  }
};

// ==================== Execute ====================

/**
 * Chạy seed function
 * Được gọi khi chạy: npm run seed
 */
seed();
