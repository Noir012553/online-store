const fs = require('fs');
const path = require('path');

const TEST_ROOT = __dirname;
const projectRoot = path.resolve(TEST_ROOT, '../..');
const configuredTimeout = Number(process.env.TEST_TIMEOUT_MS);
const INTEGRATION_TEST_FILES = new Set([
  'export-production.test.js',
  'import-export.test.js',
  'language-setup-blueprint.test.js',
  'language-sync.test.js',
  'rollback-procedures.test.js',
  'translation-e2e.test.js',
  'translation-integration.test.js',
  'backend-endpoints.test.js',
  'with-order.test.js',
]);

const testConfig = Object.freeze({
  projectRoot,
  frontendRoot: process.env.TEST_FRONTEND_ROOT || path.resolve(projectRoot, '../online-store-frontend'),
  testRoot: TEST_ROOT,
  environment: process.env.NODE_ENV || 'test',
  mongoUri: process.env.TEST_MONGO_URI || process.env.MONGO_URI || '',
  baseUrl: process.env.TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:5000',
  apiBaseUrl: process.env.TEST_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:5000',
  languageCode: process.env.TEST_LANGUAGE_CODE || 'fr',
  timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 30_000,
  backgroundTimeoutMs: Number(process.env.TEST_BACKGROUND_TIMEOUT_MS) || 60_000,
});

function resolveTestFile(fileName) {
  return path.resolve(TEST_ROOT, fileName);
}

function discoverTestFiles(directory = TEST_ROOT, includeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverTestFiles(entryPath, includeIntegration);
      }
      if (!entry.name.endsWith('.test.js')) return [];
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
