/**
 * Seed Registry - Khai báo tất cả seeders theo module
 * Cho phép seed/test từng phần hoặc toàn bộ
 * 
 * Cách dùng:
 * npm run seed -- --list                     # Liệt kê tất cả modules
 * npm run seed -- --modules=languages,users  # Seed languages + users
 * npm run seed                               # Seed dữ liệu nền trước khi import Product
 * npm run seed:post-products                 # Seed dữ liệu phụ thuộc sau khi import Product
 */

const { CLI_SYMBOLS } = require('../utils/cliSymbols');

// Module registry: định nghĩa thứ tự & dependencies
const SEED_MODULES = {
  // LAYER 1: i18n (LUÔN chạy đầu tiên, không có dependencies)
  languages: {
    name: `System Languages (${require('../config/languageInventory').getActiveLangCodes().join(', ')})`,
    layer: 1,
    depends: ['currencies'],
    seeder: require('./languageSeeder'),
    importance: 'CRITICAL', // CRITICAL|HIGH|MEDIUM|LOW
  },
  translations: {
    name: 'Static Translations (JSON -> DB)',
    layer: 1,
    depends: ['languages'],
    seeder: require('./translationSeeder'),
    importance: 'CRITICAL',
  },
  specKeyCache: {
    name: 'Spec Key Label Cache (Static Seed)',
    layer: 1,
    depends: ['languages'],
    seeder: require('./specKeyCacheSeeder'),
    importance: 'HIGH',
  },
  bannerSlotLabels: {
    name: 'Banner Slot Labels i18n (Rule #1: Static UI)',
    layer: 1,
    depends: ['languages'],
    seeder: require('./bannerSlotLabelsSeeder'),
    importance: 'CRITICAL',
  },
  testimonialLabels: {
    name: 'Testimonial Labels i18n (Rule #1: Static UI)',
    layer: 1,
    depends: ['languages'],
    seeder: require('./testimonialLabelsSeeder'),
    importance: 'CRITICAL',
  },

  // LAYER 2: Core Entities
  users: {
    name: 'Users (admin, user1, user2)',
    layer: 2,
    depends: [],
    seeder: require('./userSeeder'),
    importance: 'HIGH',
  },
  categories: {
    name: 'Categories (9 categories)',
    layer: 2,
    depends: [],
    seeder: require('./categorySeeder'),
    importance: 'HIGH',
  },
  banners: {
    name: 'Homepage Banners',
    layer: 2,
    depends: [],
    seeder: require('./bannerSeeder'),
    importance: 'MEDIUM',
  },
  customers: {
    name: 'Customers (50 customers)',
    layer: 2,
    depends: [],
    seeder: require('./customerSeeder'),
    importance: 'HIGH',
  },
  shippingProviders: {
    name: 'Shipping Providers (GHN config)',
    layer: 2,
    depends: [],
    seeder: require('./shippingProviderSeeder'),
    importance: 'HIGH',
  },
  locations: {
    name: 'Locations (GHN sync)',
    layer: 2,
    depends: ['shippingProviders'],
    seeder: require('./locationSeeder'),
    importance: 'HIGH',
  },
  addresses: {
    name: 'Customer Addresses',
    layer: 2,
    depends: ['customers', 'locations'],
    seeder: require('./addressSeeder'),
    importance: 'MEDIUM',
  },
  reviews: {
    name: 'Product Reviews',
    layer: 2,
    depends: ['users'],
    seeder: require('./reviewSeeder'),
    importance: 'MEDIUM',
  },
  orders: {
    name: 'Orders (600 orders)',
    layer: 2,
    depends: ['users', 'customers', 'currencies'],
    seeder: require('./orderSeederEnhanced'),
    importance: 'CRITICAL',
  },
  currencies: {
    name: 'Currencies (VND, USD, EUR, SEK) & Exchange Rates',
    layer: 2,
    depends: [],
    seeder: require('./currencySeeder'),
    importance: 'HIGH',
  },
  coupons: {
    name: 'Coupons (4 coupons)',
    layer: 2,
    depends: ['categories'],
    seeder: require('./couponSeeder'),
    importance: 'MEDIUM',
  },
  categoryTranslations: {
    name: 'Category Translations (i18n Cache)',
    layer: 2,
    depends: ['categories'],
    seeder: require('./categoryTranslationSeeder'),
    importance: 'HIGH',
  },
  specTranslations: {
    name: 'Spec Translations Aggregation (Cache Layer)',
    layer: 2,
    depends: [],
    seeder: require('./specTranslationSeeder'),
    importance: 'CRITICAL',
  },
};

const SEED_PHASES = {
  preProducts: [
    'currencies',
    'languages',
    'translations',
    'specKeyCache',
    'bannerSlotLabels',
    'testimonialLabels',
    'users',
    'categories',
    'customers',
    'shippingProviders',
    'locations',
    'categoryTranslations',
  ],
  postProducts: ['specTranslations', 'reviews', 'orders', 'coupons'],
};

/**
 * Resolve dependencies recursively
 * @param {string} moduleName
 * @param {Set} visited - track cycles
 * @returns {string[]} - sorted list of modules to run
 */
function resolveDependencies(moduleName, visited = new Set()) {
  if (!SEED_MODULES[moduleName]) {
    throw new Error(`Unknown module: ${moduleName}`);
  }

  if (visited.has(moduleName)) {
    return []; // Already processed
  }

  visited.add(moduleName);
  const deps = SEED_MODULES[moduleName].depends || [];
  const resolved = [];

  deps.forEach(dep => {
    resolved.push(...resolveDependencies(dep, visited));
  });

  resolved.push(moduleName);
  return resolved;
}

/**
 * Resolve a list of modules with all dependencies
 * @param {string[]} moduleNames
 * @returns {string[]} - sorted list with all deps
 */
function resolveModules(moduleNames) {
  const visited = new Set();
  const result = [];

  moduleNames.forEach(name => {
    const deps = resolveDependencies(name, visited);
    deps.forEach(dep => {
      if (!result.includes(dep)) {
        result.push(dep);
      }
    });
  });

  return result;
}

/**
 * List all available modules
 */
function listModules() {
  console.log(`\n${CLI_SYMBOLS.list} Available Seed Modules:\n`);
  
  const layer1 = Object.entries(SEED_MODULES).filter(([_, m]) => m.layer === 1);
  const layer2 = Object.entries(SEED_MODULES).filter(([_, m]) => m.layer === 2);

  console.log(`${CLI_SYMBOLS.globe} LAYER 1 (i18n - Always First):`);
  layer1.forEach(([key, mod]) => {
    console.log(`  ${key.padEnd(25)} - ${mod.name} [${mod.importance}]`);
  });

  console.log(`\n${CLI_SYMBOLS.building} LAYER 2 (Core Entities):`);
  layer2.forEach(([key, mod]) => {
    const deps = mod.depends.length > 0 ? ` ${CLI_SYMBOLS.arrowRight} depends: ${mod.depends.join(', ')}` : '';
    console.log(`  ${key.padEnd(25)} - ${mod.name} [${mod.importance}]${deps}`);
  });

  console.log(`\n${CLI_SYMBOLS.idea} Examples:`);
  console.log('  npm run seed -- --modules=languages,translations');
  console.log('  npm run seed');
  console.log('  npm run seed:pre-products');
  console.log('  npm run seed:post-products');
  console.log();
}

module.exports = {
  SEED_MODULES,
  SEED_PHASES,
  resolveDependencies,
  resolveModules,
  listModules,
};
