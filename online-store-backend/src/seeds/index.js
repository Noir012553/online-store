/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');

/**
 * ==================== SEEDS - Database Initialization ====================
 *
 * Script để khởi tạo database với dữ liệu test/demo
 * ⚡ LAYER 1 (i18n) được ưu tiên chạy trước tất cả entities khác
 *
 * Cách dùng:
 * npm run seed                                    - Full seed (vi → en)
 * npm run seed -- --dry-run                      - Test mode (skip AI, use mock data)
 * npm run seed -- --incremental                  - Only translate missing items
 * npm run seed -- --products-only                - Reseed only products
 * npm run seed -- --i18n-only                    - Seed ONLY i18n (Layer 1: languages + translations)
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
 *   4. Suppliers (5 nhà cung cấp)
 *   5. Products (20 sản phẩm)
 *   6. Customers (30 khách hàng)
 *   7. Reviews (8 đánh giá)
 *   8. Orders (600 đơn hàng)
 *   9. Coupons (4 mã giảm giá)
 *   10. Features Translations
 */

// ==================== Import Seeders ====================

const seedUsers = require('./userSeeder');
const seedCategories = require('./categorySeeder');
const seedSuppliers = require('./supplierSeeder');
const seedProducts = require('./productSeeder');
const seedOutOfStockProducts = require('./outOfStockSeeder');
const seedCustomers = require('./customerSeeder');
const seedLocations = require('./locationSeeder');
const seedAddresses = require('./addressSeeder');
const seedReviews = require('./reviewSeeder');
const seedOrdersEnhanced = require('./orderSeederEnhanced');
const seedCoupons = require('./couponSeeder');
const seedShippingProviders = require('./shippingProviderSeeder');
const seedHomepageHeroBanners = require('./bannerSeeder');
const seedTranslations = require('./translationSeeder');
const seedLanguages = require('./languageSeeder');
const seedFeaturesTranslations = require('./featuresTranslationSeeder');

// ==================== Main Seed Function ====================

/**
 * Parse CLI arguments
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    incremental: args.includes('--incremental'),
    productsOnly: args.includes('--products-only'),
    i18nOnly: args.includes('--i18n-only'),
  };
}

/**
 * Main seed orchestrator
 * Thực thi seeding tuần tự theo thứ tự dependencies
 */
const seed = async () => {
  try {
    const cliArgs = parseCliArgs();

    // ==================== Validate Modes ====================

    if (cliArgs.dryRun) {
      console.log('🧪 DRY RUN MODE: Using mock data, skipping AI translations\n');
      process.env.DRY_RUN = 'true';
    }

    if (cliArgs.incremental) {
      console.log('🔄 INCREMENTAL MODE: Only translating missing items\n');
      process.env.INCREMENTAL_SEED = 'true';
    }

    if (cliArgs.productsOnly) {
      console.log('🛍️ PRODUCTS ONLY: Reseeding products and translations only\n');
    }

    if (cliArgs.i18nOnly) {
      console.log('🌐 i18n ONLY (LAYER 1): Seeding only i18n (languages + translations)\n');
    }

    // ==================== Database Connection ====================

    /**
     * Kết nối MongoDB
     * Sử dụng MONGO_URI từ .env file
     */
    await mongoose.connect(process.env.MONGO_URI);

    // ==================== Start Seeding ====================

    /**
     * Clear old translation cache before seeding fresh data
     * Tầng 2 (Dynamic Translation): Xóa sạch dữ liệu cache cũ
     * Khi chạy seed mới, toàn bộ dữ liệu sẽ được dịch lại từ đầu
     */
    try {
      const deletedCount = await LiveTranslationCache.deleteMany({});
      console.log(`🧹 ✅ Cleared ${deletedCount.deletedCount} old translation cache entries`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to clear cache: ${cacheError.message}`);
    }

    // ==================== LAYER 1: i18n (Languages + Translations) ====================
    // ⚡ ưu tiên cao nhất - LUÔN chạy trước tất cả entities khác
    console.log('\n🌐 ========== LAYER 1: i18n (Languages + Static Translations) ==========\n');

    /**
     * LAYER 1.0: Seed System Languages (independent entity)
     * Tạo: Vietnamese (default), English (secondary)
     * Xóa: Tất cả ngôn ngữ khác (ja, zh, ko, fr, de, es, th)
     */
    try {
      const languages = await seedLanguages();
      console.log(`🌍 ✅ System languages initialized`);
    } catch (languageError) {
      console.error(`❌ Language seeding failed: ${languageError.message}`);
      throw languageError;
    }

    /**
     * LAYER 1.1: Seed Static Translations (independent entity)
     * Tạo: Load translations từ JSON files (vi, en) vào DB
     * Namespaces: common, admin, checkout, products
     * Phải chạy trước để frontend có thể fetch i18n data
     */
    try {
      const translationResults = await seedTranslations();
      if (translationResults.length > 0) {
        console.log(`📚 ✅ Successfully seeded static translations`);
      }
    } catch (translationError) {
      console.warn(`⚠️ Translation seeding failed: ${translationError.message}`);
    }

    console.log('\n✅ LAYER 1 (i18n) COMPLETED - All i18n data is ready!\n');

    // ==================== Early Exit if --i18n-only ====================
    if (cliArgs.i18nOnly) {
      console.log('🎉 i18n-only mode: Skipping LAYER 2 (core entities)');
      console.log('\n✅ i18n seeding completed successfully!\n');
      process.exit(0);
    }

    // ==================== LAYER 2: Core Entities (Users, Products, Orders, etc.) ====================
    console.log('🏢 ========== LAYER 2: Core Entities (Users, Products, Orders, etc.) ==========\n');

    /**
     * 2. Seed Users (base entity)
     * Tạo: 1 admin (admin@laptop.com / admin123) + 1 regular user (anyemail@email.com / 123456)
     */
    const users = await seedUsers();

    /**
     * 3. Seed Categories & Suppliers (independent entities)
     * Tạo: 6 danh mục sản phẩm
     * Tạo: 5 nhà cung cấp
     */
    const categories = await seedCategories();
    const suppliers = await seedSuppliers();

    /**
     * 4. Seed Products (depends on users, categories, suppliers)
     * Tạo: 20 sản phẩm laptop
     * Liên kết: admin user (users[0]) -> tác giả sản phẩm
     * Liên kết: categories, suppliers -> product relationships
     */
    let products = [];
    if (cliArgs.productsOnly) {
      // PRODUCTS ONLY MODE: Use existing users/categories/suppliers
      try {
        const User = require('../models/User');
        const Category = require('../models/Category');
        const Supplier = require('../models/Supplier');
        const existingUsers = await User.find().limit(1).lean();
        const existingCategories = await Category.find().lean();
        const existingSuppilers = await Supplier.find().lean();

        if (!existingUsers.length || !existingCategories.length || !existingSuppilers.length) {
          throw new Error('Products-only mode requires existing users, categories, and suppliers');
        }

        products = await seedProducts(
          existingUsers[0]._id,
          existingCategories.map(c => c._id),
          existingSuppilers.map(s => s._id)
        );
        console.log(`🛍️ ✅ Products reseeded: ${products.length} products`);
      } catch (error) {
        console.error(`❌ Products-only mode failed: ${error.message}`);
        throw error;
      }
    } else {
      products = await seedProducts(
        users[0]._id,
        categories.map(c => c._id),
        suppliers.map(s => s._id)
      );
    }

    // Skip additional seeding in products-only mode
    if (!cliArgs.productsOnly) {
      /**
       * 4.5. Seed Homepage Hero Banners
       * Đảm bảo carousel banner đầu trang luôn có dữ liệu quản lý được trong admin
       */
      try {
        const homepageHeroBanners = await seedHomepageHeroBanners();
        if (homepageHeroBanners.length > 0) {
          console.log(`🖼️ ✅ Successfully seeded ${homepageHeroBanners.length} homepage hero banners`);
        } else {
          console.log(`🖼️ ℹ️ Homepage hero banners already exist or skipped`);
        }
      } catch (bannerError) {
        console.error(`🖼️ ❌ Banner seeding failed: ${bannerError.message}`);
        throw bannerError;
      }

      /**
       * 5. Seed Customers (independent entity) - MUST BE BEFORE ORDERS & ADDRESSES
       * Tạo: 30 khách hàng
       * Đặc biệt: Có thể upsert by phone number từ checkout
       */
      const customers = await seedCustomers();

      /**
       * 5.2. Seed Shipping Providers (MUST RUN BEFORE LOCATIONS)
       */
      try {
        const providers = await seedShippingProviders();
        if (providers.length > 0) {
          console.log(`✅ Shipping providers configured successfully`);
        }
      } catch (providerError) {
        console.warn(`⚠️ Shipping providers seeding failed: ${providerError.message}`);
        throw new Error('Shipping providers must be configured before locations');
      }

      /**
       * 5.25. Seed Locations (independent entity)
       */
      try {
        const locationResult = await seedLocations();
        console.log(`📍 ✅ Successfully synced location data from GHN API`);
      } catch (locationError) {
        console.error(`❌ Location seeding failed: ${locationError.message}`);
        throw new Error('Locations must be seeded before addresses');
      }

      /**
       * 5.5. Seed Addresses (depends on customers + locations)
       */
      const addresses = await seedAddresses();

      /**
       * 6. Seed Reviews (depends on products, users)
       */
      try {
        const reviews = await seedReviews(products, users);
        console.log(`⭐ ✅ Successfully seeded ${reviews.length} reviews`);
      } catch (reviewError) {
        console.warn(`⚠️ Reviews seeding failed: ${reviewError.message}`);
      }

      /**
       * 7. Seed Orders (depends on products, customers)
       */
      const orders = await seedOrdersEnhanced(products, users, customers);

      /**
       * 8. Seed Coupons (depends on products, categories)
       */
      try {
        const coupons = await seedCoupons(products, categories);
        console.log(`🎟️ ✅ Successfully seeded ${coupons.length} coupons`);
      } catch (couponError) {
        console.warn(`⚠️ Coupons seeding failed: ${couponError.message}`);
      }

      /**
       * 9. Seed Features Translations (depends on products)
       * Tự động dịch features từ Vietnamese sang English bằng Gemini API
       */
      try {
        const featuresResult = await seedFeaturesTranslations();
        console.log(`🌐 ✅ Features translations seeded`);
      } catch (featuresError) {
        console.warn(`⚠️ Features translations seeding failed: ${featuresError.message}`);
      }
    }


    // ==================== Seeding Summary ====================

    console.log('\n✅ All seeding completed successfully!\n');

    /**
     * Exit process khi hoàn thành
     */
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed with error:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

// ==================== Execute ====================

/**
 * Chạy seed function
 * Được gọi khi chạy: npm run seed
 */
seed();
