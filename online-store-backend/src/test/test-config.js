require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TEST_ROOT = __dirname;
const projectRoot = path.resolve(TEST_ROOT, '../..');
const configuredTimeout = Number(process.env.TEST_TIMEOUT_MS);
const INTEGRATION_TEST_FILES = new Set([
  'app-readiness.test.js',
  'backend-endpoints.test.js',
  'brands.test.js',
  'db-brands.test.js',
  'db-state.test.js',
  'export-production.test.js',
  'import-export.test.js',
  'language-setup-blueprint.test.js',
  'language-sync-flow.test.js',
  'language-sync.test.js',
  'languages-flow.test.js',
  'products.test.js',
  'rollback-procedures.test.js',
  'shadow-writes.test.js',
  'simple.test.js',
  'translation-api.test.js',
  'translation-e2e.test.js',
  'translation-integration.test.js',
  'translation-migration-smoke.test.js',
  'vnpay-quick.test.js',
  'with-order.test.js',
]);
const PRODUCTION_TEST_FILES = new Set([
  'export-production.test.js',
]);

const testConfig = Object.freeze({
  projectRoot,
  frontendRoot: process.env.TEST_FRONTEND_ROOT || path.resolve(projectRoot, '../online-store-frontend'),
  testRoot: TEST_ROOT,
  environment: process.env.NODE_ENV || 'test',
  mongoUri: process.env.TEST_MONGO_URI || process.env.MONGO_URI || '',
  baseUrl: process.env.TEST_BASE_URL || process.env.BASE_URL || process.env.BACKEND_URL || process.env.EXPORT_BACKEND_BASE_URL || 'http://localhost:5000',
  apiBaseUrl: process.env.TEST_API_BASE_URL || process.env.API_BASE_URL || process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5000',
  adminEmail: process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || process.env.EXPORT_TEST_EMAIL || '',
  adminPassword: process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || process.env.EXPORT_TEST_PASSWORD || '',
  adminToken: process.env.TEST_ADMIN_TOKEN || process.env.ADMIN_TOKEN || process.env.ACCESS_TOKEN || '',
  accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  refreshSecret: process.env.JWT_REFRESH_SECRET || '',
  languageCode: process.env.TEST_LANGUAGE_CODE || 'fr',
  timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 30_000,
  backgroundTimeoutMs: Number(process.env.TEST_BACKGROUND_TIMEOUT_MS) || 60_000,
});

function resolveTestFile(fileName) {
  return path.resolve(TEST_ROOT, fileName);
}

function discoverTestFiles(
  directory = TEST_ROOT,
  includeIntegration = process.env.RUN_INTEGRATION_TESTS !== 'false',
  includeProduction = process.env.RUN_PRODUCTION_TESTS === 'true',
) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverTestFiles(entryPath, includeIntegration, includeProduction);
      }
      if (!entry.name.endsWith('.test.js')) return [];
      if (!includeProduction && PRODUCTION_TEST_FILES.has(entry.name)) return [];
      if (!includeIntegration && INTEGRATION_TEST_FILES.has(entry.name)) return [];
      return [entryPath];
    })
    .sort();
}

function getRunnerForFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return /\b(?:describe|it|before|after|beforeEach|afterEach)\s*\(/.test(source)
    ? 'mocha'
    : 'node';
}

module.exports = {
  ...testConfig,
  discoverTestFiles,
  getRunnerForFile,
  resolveTestFile,
};
