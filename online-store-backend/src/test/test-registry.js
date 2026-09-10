/**
 * Test Registry - Unified test runner for all test suites
 * 
 * Cách dùng:
 * npm run test                               # Run all tests
 * npm run test -- --list                     # List all test suites
 * npm run test -- --suite=i18n               # Run only i18n tests
 * npm run test -- --suites=i18n,products     # Run i18n + products tests
 * npm run test -- --skip=slow                # Skip slow tests
 */

const path = require('path');
const fs = require('fs');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { discoverTestFiles } = require('./test-config');

// Test registry: định nghĩa tất cả test suites
const TEST_SUITES = {
  all: {
    name: 'All dynamically discovered test modules',
    category: 'DYNAMIC',
    importance: 'CRITICAL',
    tags: ['all'],
    dynamic: true,
  },

  // LAYER 1: i18n Tests
  i18n: {
    name: 'i18n & Language Sync Tests',
    category: 'LAYER 1',
    importance: 'CRITICAL',
    tags: ['i18n', 'languages'],
    files: [
      'languages-flow.test.js',
      'translation-api.test.js',
      'translation-product-cache.test.js',
      'spec-key-translation-cache.test.js',
    ],
  },

  // LAYER 2: Core Entity Tests
  currency: {
    name: 'Currency Formatting Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['currency', 'formatting'],
    files: [
      'currency-formatter.test.js',
    ],
  },

  products: {
    name: 'Products API, Import & Seeding Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['products', 'entities', 'sources'],
    files: [
      'translation-migration-smoke.test.js',
      'import-file-validator.test.js',
      'export-job-service.test.js',
      'translation-helper.test.js',
      'products.test.js',
    ],
  },

  orders: {
    name: 'Orders & Payment Flow Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['orders', 'payments'],
    files: [
      'with-order.test.js',
      'vnpay-quick.test.js',
      'vnpay-signature-fix.test.js',
    ],
  },

  vnpay: {
    name: 'VNPay Payment Gateway Tests',
    category: 'LAYER 2',
    importance: 'MEDIUM',
    tags: ['payments', 'vnpay'],
    files: [
      'vnpay-quick.test.js',
      'vnpay-signature-fix.test.js',
    ],
  },

  backend: {
    name: 'Backend Endpoints & Phase Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['backend', 'endpoints'],
    files: [
      'backend-endpoints.test.js',
      'translation-migration-smoke.test.js',
      'app-readiness.test.js',
    ],
  },

  'import-export': {
    name: 'Import & Export Integration Flow',
    category: 'INTEGRATION',
    importance: 'HIGH',
    tags: ['import', 'export', 'integration'],
    files: [
      'import-export.test.js',
    ],
  },

  rollback: {
    name: 'Database Rollback & Recovery Tests',
    category: 'MAINTENANCE',
    importance: 'MEDIUM',
    tags: ['db', 'recovery'],
    files: [
      'rollback-procedures.test.js',
      'shadow-writes.test.js',
    ],
  },

  'shadow-writes': {
    name: 'Shadow Write Tests',
    category: 'MAINTENANCE',
    importance: 'MEDIUM',
    tags: ['db', 'shadow-writes'],
    files: [
      'shadow-writes.test.js',
    ],
  },

  simple: {
    name: 'Basic Sanity Tests',
    category: 'QUICK',
    importance: 'LOW',
    tags: ['basic'],
    files: [
      'simple.test.js',
      'ghn-service.test.js',
    ],
  },
};

/**
 * List all available test suites
 */
function getSuiteFiles(suiteName) {
  const suite = TEST_SUITES[suiteName];
  if (!suite) {
    return [];
  }

  if (suite.dynamic) {
    return discoverTestFiles().map(filePath => path.relative(__dirname, filePath));
  }

  return suite.files;
}

function listSuites() {
  console.log(`\n${CLI_SYMBOLS.list} Available Test Suites:\n`);

  const categories = [...new Set(Object.values(TEST_SUITES).map(s => s.category))];

  categories.forEach(category => {
    console.log(`\n${category}:`);
    Object.entries(TEST_SUITES)
      .filter(([_, s]) => s.category === category)
      .forEach(([key, suite]) => {
        const tag = suite.importance === 'CRITICAL' ? CLI_SYMBOLS.importanceCritical : suite.importance === 'HIGH' ? CLI_SYMBOLS.importanceHigh : suite.importance === 'MEDIUM' ? CLI_SYMBOLS.importanceMedium : CLI_SYMBOLS.importanceLow;
        console.log(`  ${tag} ${key.padEnd(15)} - ${suite.name}`);
        console.log(`      Files: ${getSuiteFiles(key).join(', ')}`);
      });
  });

  console.log(`\n${CLI_SYMBOLS.idea} Examples:`);
  console.log('  npm run test -- --suite=i18n');
  console.log('  npm run test -- --suites=i18n,products');
  console.log('  npm run test -- --skip=slow');
  console.log('  npm run test -- --tags=payments');
  console.log();
}

/**
 * Resolve test files from suite names
 * @param {string[]} suiteNames
 * @returns {string[]} - paths to test files
 */
function resolveTestFiles(suiteNames) {
  const files = [];
  const testDir = path.join(__dirname);

  suiteNames.forEach(name => {
    if (!TEST_SUITES[name]) {
      console.warn(`${CLI_SYMBOLS.warning} Unknown test suite: ${name}`);
      return;
    }

    getSuiteFiles(name).forEach(file => {
      const fullPath = path.resolve(testDir, file);
      if (fs.existsSync(fullPath)) {
        files.push(fullPath);
      } else {
        console.warn(`${CLI_SYMBOLS.warning} Test file not found: ${fullPath}`);
      }
    });
  });

  return [...new Set(files)]; // Remove duplicates
}

/**
 * Filter suites by tags
 * @param {string[]} tags
 * @returns {string[]} - matching suite names
 */
function filterByTags(tags) {
  const matches = [];
  
  Object.entries(TEST_SUITES).forEach(([name, suite]) => {
    if (tags.some(tag => suite.tags.includes(tag))) {
      matches.push(name);
    }
  });

  return matches;
}

module.exports = {
  TEST_SUITES,
  listSuites,
  resolveTestFiles,
  filterByTags,
  getSuiteFiles,
};
