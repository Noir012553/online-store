/**
 * Test Language Synchronization Flow
 * 
 * This script tests the complete backend-driven language sync implementation:
 * 1. Creates a new language via API
 * 2. Verifies static translations were cloned
 * 3. Verifies product translations were created
 * 4. Tests all translation endpoints
 * 
 * Usage: node language-sync-flow.test.js [LANGUAGE_CODE]
 * Example: node language-sync-flow.test.js fr
 */

const http = require('http');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { baseUrl, languageCode, backgroundTimeoutMs, timeoutMs } = require('./test-config');
const { getAdminToken } = require('./adminAuth');

const BASE_URL = baseUrl;
const TEST_LANG = process.argv[2] || languageCode;
const TIMEOUT = backgroundTimeoutMs;

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}${CLI_SYMBOLS.info}${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}${CLI_SYMBOLS.check}${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}${CLI_SYMBOLS.cross}${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}${CLI_SYMBOLS.warning}${colors.reset} ${msg}`),
  test: (msg) => console.log(`\n${colors.blue}═══ ${msg} ═══${colors.reset}`),
};

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: parsed,
            headers: res.headers,
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLanguageSync() {
  try {
    const adminToken = await getAdminToken(BASE_URL, timeoutMs);
    log.test(`Testing Language Synchronization for: ${TEST_LANG.toUpperCase()}`);

    // Test 1: Check if language already exists
    log.test('TEST 1: Check Existing Languages');
    let res = await makeRequest('GET', '/api/languages', null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch languages: ${res.status}`);
    }
    const existingLangs = res.data.data || [];
    const existingLang = existingLangs.find(l => l.code === TEST_LANG);
    if (existingLang) {
      throw new Error(`Language ${TEST_LANG} already exists; use a fresh TEST_LANGUAGE_CODE`);
    }
    log.success(`Language ${TEST_LANG} does not exist yet`);

    // Test 2: Create new language
    log.test('TEST 2: Create New Language');
    res = await makeRequest('POST', '/api/languages', {
      code: TEST_LANG,
      name: `Test Language ${TEST_LANG.toUpperCase()}`,
    }, adminToken);

    if (res.status !== 201) {
      throw new Error(`Failed to create language: ${res.status} ${JSON.stringify(res.data)}`);
    }
    log.success(`Language created: ${TEST_LANG}`);
    log.info(`Response: ${JSON.stringify(res.data.data, null, 2)}`);

    // Test 3: Wait for background job to complete
    log.test('TEST 3: Wait for Background Job to Complete');
    log.warn(`Waiting ${TIMEOUT / 1000} seconds for background job...`);
    for (let i = 0; i < 10; i++) {
      await sleep(TIMEOUT / 10);
      log.info(`Progress: ${(i + 1) * 10}%`);
    }

    // Test 4: Get supported languages (should include new language now)
    log.test('TEST 4: Check Supported Languages');
    res = await makeRequest('GET', '/api/languages/supported', null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch supported languages: ${res.status}`);
    }
    const langs = res.data.data || [];
    const found = langs.find(l => l.code === TEST_LANG);
    if (!found) {
      throw new Error(`${TEST_LANG} not found in supported languages`);
    }
    log.success(`${TEST_LANG} is in supported languages`);
    log.info(`Name: ${found.name}`);

    // Test 5: Get static translations for new language
    log.test('TEST 5: Get Static Translations');
    res = await makeRequest('GET', `/api/translations?lang=${TEST_LANG}&ns=common`, null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch translations: ${res.status}`);
    }
    const transCount = Object.keys(res.data.data?.translations || {}).length;
    if (transCount === 0) {
      throw new Error(`No static translations found for ${TEST_LANG}`);
    }
    log.success(`Static translations found for ${TEST_LANG}`);
    log.info(`Translation keys: ${transCount}`);

    // Test 6: Get cache statistics
    log.test('TEST 6: Check Translation Cache Stats');
    res = await makeRequest('GET', '/api/translations/cache/stats', null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch translation cache stats: ${res.status}`);
    }
    const stats = res.data.data || {};
    log.success(`Cache stats retrieved`);
    log.info(`Total cached translations: ${stats.totalCachedTranslations}`);
    const byLang = stats.byLanguage || [];
    const newLangStat = byLang.find(s => s._id === TEST_LANG);
    if (!newLangStat || newLangStat.count < 1) {
      throw new Error(`${TEST_LANG} has no cached translations`);
    }
    log.success(`${TEST_LANG}: ${newLangStat.count} translations cached`);
    log.info(`All languages: ${JSON.stringify(byLang)}`);

    // Test 7: Get a product and its translations
    log.test('TEST 7: Get Product Translations');
    let productId = null;
    
    // First, get a product
    res = await makeRequest('GET', '/api/products?limit=1', null, adminToken);
    if (res.status !== 200 || !res.data.data || res.data.data.length === 0) {
      throw new Error(`Failed to load a product fixture: ${res.status}`);
    }
    productId = res.data.data[0]._id;
    log.success(`Found product: ${productId}`);

    // Get translations for this product
    res = await makeRequest('GET', `/api/products/${productId}/translations?lang=${TEST_LANG}`, null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to get product translations: ${res.status}`);
    }
    const transData = res.data.data || {};
    if (!transData.name) {
      throw new Error(`Product translation for ${TEST_LANG} is missing a name`);
    }
    log.success(`Product translations retrieved`);
    log.info(`Translations: ${JSON.stringify(transData, null, 2)}`);

    // Test 8: Check language in active languages list
    log.test('TEST 8: Verify Language Activation');
    res = await makeRequest('GET', '/api/languages', null, adminToken);
    if (res.status !== 200) {
      throw new Error(`Failed to fetch active languages: ${res.status}`);
    }
    const activeLang = res.data.data?.find(l => l.code === TEST_LANG);
    if (!activeLang || activeLang.isActive !== true) {
      throw new Error(`Language ${TEST_LANG} is not active`);
    }
    log.success(`Language ${TEST_LANG} is active in system`);
    log.info(`Active: ${activeLang.isActive}`);

    log.test('ALL TESTS COMPLETED');
    log.success(`Language synchronization test for ${TEST_LANG} finished`);
    log.info(`\nSummary:`);
    log.info(`- Language created: ${TEST_LANG}`);
    log.info(`- Background job should have:`);
    log.info(`  1. Cloned static translations from 'en'`);
    log.info(`  2. Translated all products`);
    log.info(`  3. Populated LiveTranslationCache with entityId, entityType`);
    log.info(`\nTo verify data in MongoDB:`);
    log.info(`  - db.languages.findOne({code: '${TEST_LANG}'})`);
    log.info(`  - db.statictranslations.find({code: '${TEST_LANG}'})`);
    log.info(`  - db.livetranslationcaches.find({targetLang: '${TEST_LANG}'})`);

  } catch (error) {
    log.error(`Test failed with error: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
  }
}

testLanguageSync();
