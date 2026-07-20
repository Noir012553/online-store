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

// Test registry: định nghĩa tất cả test suites
const TEST_SUITES = {
  // LAYER 1: i18n Tests
  i18n: {
    name: 'i18n & Language Sync Tests',
    category: 'LAYER 1',
    importance: 'CRITICAL',
    tags: ['i18n', 'languages'],
    files: [
      'test-language-sync-flow.js',
      'test-languages-flow.js',
      'test-translation-api.js',
    ],
  },

  // LAYER 2: Core Entity Tests
  products: {
    name: 'Products API & Seeding Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['products', 'entities'],
    files: [
      'test-translation-e2e.js',
      'test-phase4-e2e.js',
    ],
  },

  orders: {
    name: 'Orders & Payment Flow Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['orders', 'payments'],
    files: [
      'test-vnpay-quick.js',
      'test-vnpay-signature-fix.js',
    ],
  },

  vnpay: {
    name: 'VNPay Payment Gateway Tests',
    category: 'LAYER 2',
    importance: 'MEDIUM',
    tags: ['payments', 'vnpay'],
    files: [
      'test-vnpay-quick.js',
      'test-vnpay-signature-fix.js',
    ],
  },

  backend: {
    name: 'Backend Endpoints & Phase Tests',
    category: 'LAYER 2',
    importance: 'HIGH',
    tags: ['backend', 'endpoints'],
    files: [
      'test-backend-endpoints-phase3.js',
      'test-phase4-e2e-simplified.js',
    ],
  },

  rollback: {
    name: 'Database Rollback & Recovery Tests',
    category: 'MAINTENANCE',
    importance: 'MEDIUM',
    tags: ['db', 'recovery'],
    files: [
      'test-rollback-procedures.js',
      'test-shadow-writes.js',
    ],
  },

  'shadow-writes': {
    name: 'Shadow Write Tests',
    category: 'MAINTENANCE',
    importance: 'MEDIUM',
    tags: ['db', 'shadow-writes'],
    files: [
      'test-shadow-writes.js',
    ],
  },

  simple: {
    name: 'Basic Sanity Tests',
    category: 'QUICK',
    importance: 'LOW',
    tags: ['basic'],
    files: [
      'test-simple.js',
    ],
  },
};

/**
 * List all available test suites
 */
function listSuites() {
  console.log('\n📋 Available Test Suites:\n');

  const categories = [...new Set(Object.values(TEST_SUITES).map(s => s.category))];

  categories.forEach(category => {
    console.log(`\n${category}:`);
    Object.entries(TEST_SUITES)
      .filter(([_, s]) => s.category === category)
      .forEach(([key, suite]) => {
        const tag = suite.importance === 'CRITICAL' ? '🔴' : suite.importance === 'HIGH' ? '🟠' : suite.importance === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`  ${tag} ${key.padEnd(15)} - ${suite.name}`);
        console.log(`      Files: ${suite.files.join(', ')}`);
      });
  });

  console.log('\n💡 Examples:');
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
      console.warn(`⚠️ Unknown test suite: ${name}`);
      return;
    }

    TEST_SUITES[name].files.forEach(file => {
      const fullPath = path.resolve(testDir, file);
      if (fs.existsSync(fullPath)) {
        files.push(fullPath);
      } else {
        console.warn(`⚠️ Test file not found: ${fullPath}`);
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
};
