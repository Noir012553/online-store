const fs = require('fs');
const fs = require('fs');
const path = require('path');

const TEST_ROOT = __dirname;
const projectRoot = path.resolve(TEST_ROOT, '../..');
const configuredTimeout = Number(process.env.TEST_TIMEOUT_MS);

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

function discoverTestFiles(directory = TEST_ROOT) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverTestFiles(entryPath);
      }
      return entry.name.endsWith('.test.js') ? [entryPath] : [];
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
