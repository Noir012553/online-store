/**
 * Test Language Synchronization Flow
 * 
 * This script tests the complete backend-driven language sync implementation:
 * 1. Creates a new language via API
 * 2. Verifies static translations were cloned
 * 3. Verifies product translations were created
 * 4. Tests all translation endpoints
 * 
 * Usage: node test-language-sync-flow.js [LANGUAGE_CODE]
 * Example: node test-language-sync-flow.js fr
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
const TEST_LANG = process.argv[2] || 'fr'; // Default to French if not specified
const TIMEOUT = 60000; // 60 seconds for background job

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  test: (msg) => console.log(`\n${colors.blue}═══ ${msg} ═══${colors.reset}`),
};

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
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
    log.test(`Testing Language Synchronization for: ${TEST_LANG.toUpperCase()}`);

    // Test 1: Check if language already exists
    log.test('TEST 1: Check Existing Languages');
    let res = await makeRequest('GET', '/api/languages');
    if (res.status !== 200) {
      log.error(`Failed to fetch languages: ${res.status}`);
      return;
    }
    const existingLangs = res.data.data || [];
    const existingLang = existingLangs.find(l => l.code === TEST_LANG);
    if (existingLang) {
      log.warn(`Language ${TEST_LANG} already exists`);
      return;
    }
    log.success(`Language ${TEST_LANG} does not exist yet`);

    // Test 2: Create new language
    log.test('TEST 2: Create New Language');
    res = await makeRequest('POST', '/api/languages', {
      code: TEST_LANG,
      name: `Test Language ${TEST_LANG.toUpperCase()}`,
    });

    if (res.status !== 201) {
      log.error(`Failed to create language: ${res.status}`);
      log.error(JSON.stringify(res.data, null, 2));
      return;
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
    res = await makeRequest('GET', '/api/languages/supported');
    if (res.status === 200) {
      const langs = res.data.data || [];
      const found = langs.find(l => l.code === TEST_LANG);
      if (found) {
        log.success(`${TEST_LANG} is in supported languages`);
        log.info(`Name: ${found.name}`);
      } else {
        log.error(`${TEST_LANG} not found in supported languages`);
      }
    }

    // Test 5: Get static translations for new language
    log.test('TEST 5: Get Static Translations');
    res = await makeRequest('GET', `/api/translations?lang=${TEST_LANG}&ns=common`);
    if (res.status === 200) {
      log.success(`Static translations found for ${TEST_LANG}`);
      const transCount = Object.keys(res.data.data?.translations || {}).length;
      log.info(`Translation keys: ${transCount}`);
    } else if (res.status === 404) {
      log.error(`Static translations not found (404). Background job may not have completed.`);
    } else {
      log.error(`Failed to fetch translations: ${res.status}`);
    }

    // Test 6: Get cache statistics
    log.test('TEST 6: Check Translation Cache Stats');
    res = await makeRequest('GET', '/api/translations/cache/stats');
    if (res.status === 200) {
      const stats = res.data.data || {};
      log.success(`Cache stats retrieved`);
      log.info(`Total cached translations: ${stats.totalCachedTranslations}`);
      const byLang = stats.byLanguage || [];
      const newLangStat = byLang.find(s => s._id === TEST_LANG);
      if (newLangStat) {
        log.success(`${TEST_LANG}: ${newLangStat.count} translations cached`);
      } else {
        log.warn(`${TEST_LANG} not yet in cache (background job may still be running)`);
      }
      log.info(`All languages: ${JSON.stringify(byLang)}`);
    }

    // Test 7: Get a product and its translations
    log.test('TEST 7: Get Product Translations');
    let productId = null;
    
    // First, get a product
    res = await makeRequest('GET', '/api/products?limit=1');
    if (res.status === 200 && res.data.data && res.data.data.length > 0) {
      productId = res.data.data[0]._id;
      log.success(`Found product: ${productId}`);

      // Get translations for this product
      res = await makeRequest('GET', `/api/products/${productId}/translations?lang=${TEST_LANG}`);
      if (res.status === 200) {
        log.success(`Product translations retrieved`);
        const transData = res.data.data || {};
        log.info(`Translations: ${JSON.stringify(transData, null, 2)}`);
      } else if (res.status === 400) {
        log.warn(`Language not yet activated (400). This is expected if background job is still running.`);
      } else {
        log.error(`Failed to get product translations: ${res.status}`);
      }
    }

    // Test 8: Check language in active languages list
    log.test('TEST 8: Verify Language Activation');
    res = await makeRequest('GET', '/api/languages');
    if (res.status === 200) {
      const activeLang = res.data.data?.find(l => l.code === TEST_LANG);
      if (activeLang) {
        log.success(`Language ${TEST_LANG} is active in system`);
        log.info(`Active: ${activeLang.isActive}`);
      } else {
        log.error(`Language ${TEST_LANG} not found in active languages`);
      }
    }

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
  }
}

testLanguageSync();
