/**
 * Test Script: Language Synchronization
 * 
 * Verify:
 * 1. GET /api/languages/supported → returns list of supported languages
 * 2. POST /api/languages {code: 'pt'} → creates language and clones translations
 * 3. GET /api/translations?lang=pt&ns=common → returns static translations
 * 4. GET /api/products/:id/translations?lang=pt → returns product translations
 * 
 * Thứ tự test:
 * npm run seed                  # Seed initial data
 * node test-language-sync.js   # Run this test
 */

require('dotenv').config();
const axios = require('axios');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';

const tests = {
  passed: 0,
  failed: 0,
  results: [],
};

async function test(name, fn) {
  try {
    console.log(`\n${CLI_SYMBOLS.edit} Test: ${name}`);
    await fn();
    tests.passed++;
    tests.results.push({ name, status: `${CLI_SYMBOLS.success} PASS` });
    console.log(`   ${CLI_SYMBOLS.success} PASS`);
  } catch (error) {
    tests.failed++;
    tests.results.push({ name, status: `${CLI_SYMBOLS.error} FAIL`, error: error.message });
    console.log(`   ${CLI_SYMBOLS.error} FAIL: ${error.message}`);
  }
}

async function main() {
  console.log(`${CLI_SYMBOLS.rocket} Language Synchronization Test Suite\n`);

  // Test 1: Get supported languages
  let supportedLangs = [];
  await test('GET /api/languages/supported', async () => {
    const res = await axios.get(`${API_BASE}/languages/supported`);
    if (!res.data.success || !Array.isArray(res.data.data)) {
      throw new Error('Invalid response format');
    }
    supportedLangs = res.data.data.map(l => l.code);
    console.log(`   Found: ${supportedLangs.join(', ')}`);
    if (!supportedLangs.includes('pt')) {
      throw new Error('PT not in supported languages');
    }
  });

  // Test 2: Get active languages (before adding PT)
  let initialActiveLangs = [];
  await test('GET /api/languages (before adding PT)', async () => {
    const res = await axios.get(`${API_BASE}/languages`);
    if (!res.data.success || !Array.isArray(res.data.data)) {
      throw new Error('Invalid response format');
    }
    initialActiveLangs = res.data.data.map(l => l.code);
    console.log(`   Active: ${initialActiveLangs.join(', ')}`);
    if (initialActiveLangs.includes('pt')) {
      console.log(`   ${CLI_SYMBOLS.warning} PT already active, skipping create test`);
    }
  });

  // Test 3: Create language PT
  let ptLanguageId = null;
  if (!initialActiveLangs.includes('pt')) {
    await test('POST /api/languages {code: "pt"}', async () => {
      const res = await axios.post(`${API_BASE}/languages`, {
        code: 'pt',
        name: 'Português',
      });
      if (!res.data.success || !res.data.data) {
        throw new Error('Failed to create language');
      }
      ptLanguageId = res.data.data._id;
      console.log(`   Language ID: ${ptLanguageId}`);
      console.log(`   Note: Background job started, wait 10s for completion...`);
      // Wait for background job
      await new Promise(r => setTimeout(r, 10000));
    });
  } else {
    console.log(`\n${CLI_SYMBOLS.edit} Test: POST /api/languages {code: "pt"}`);
    console.log(`   ${CLI_SYMBOLS.warning} SKIPPED (PT already exists)`);
  }

  // Test 4: Check static translations for PT (common namespace)
  await test('GET /api/translations?lang=pt&ns=common', async () => {
    const res = await axios.get(`${API_BASE}/translations`, {
      params: { lang: 'pt', ns: 'common' },
    });
    if (!res.data.success) {
      throw new Error(`Expected 200, got error: ${res.data.message}`);
    }
    if (!res.data.data.translations || Object.keys(res.data.data.translations).length === 0) {
      throw new Error('No translations data returned');
    }
    const keyCount = Object.keys(res.data.data.translations).length;
    console.log(`   Found ${keyCount} translation keys`);
  });

  // Test 5: Check static translations for footer
  await test('GET /api/translations?lang=pt&ns=footer', async () => {
    const res = await axios.get(`${API_BASE}/translations`, {
      params: { lang: 'pt', ns: 'footer' },
    });
    if (!res.data.success) {
      throw new Error(`Expected 200, got error: ${res.data.message}`);
    }
    if (!res.data.data.translations || Object.keys(res.data.data.translations).length === 0) {
      throw new Error('No translations data returned');
    }
    const keyCount = Object.keys(res.data.data.translations).length;
    console.log(`   Found ${keyCount} translation keys`);
  });

  // Test 6: Get products and check translations
  let productId = null;
  await test('GET /api/products (to find a product ID)', async () => {
    const res = await axios.get(`${API_BASE}/products?page=1&limit=1`);
    if (!res.data.success || !res.data.data || res.data.data.length === 0) {
      throw new Error('No products found');
    }
    productId = res.data.data[0]._id;
    console.log(`   Found product: ${productId}`);
  });

  // Test 7: Check product translations for PT
  if (productId) {
    await test(`GET /api/products/${productId}/translations?lang=pt`, async () => {
      const res = await axios.get(`${API_BASE}/products/${productId}/translations`, {
        params: { lang: 'pt' },
      });
      if (!res.data.success) {
        throw new Error(`Expected 200, got error: ${res.data.message}`);
      }
      console.log(`   Name: ${res.data.data.name}`);
      console.log(`   Description length: ${res.data.data.description?.length || 0} chars`);
    });
  }

  // Test 8: Verify language cache is working
  await test('Verify LanguageService cache contains all configured languages', async () => {
    const { getActiveLangCodes } = require('../../config/languageInventory');
    const expectedLangs = getActiveLangCodes();

    const res = await axios.get(`${API_BASE}/languages`);
    const activeLangs = res.data.data.map(l => l.code);
    console.log(`   Active languages: ${activeLangs.join(', ')}`);

    for (const lang of expectedLangs) {
      if (!activeLangs.includes(lang)) {
        throw new Error(`Missing language: ${lang}`);
      }
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`${CLI_SYMBOLS.chart} Test Summary`);
  console.log('='.repeat(60));
  tests.results.forEach(r => {
    console.log(`${r.status}: ${r.name}`);
    if (r.error) {
      console.log(`         Error: ${r.error}`);
    }
  });
  console.log(`\n${CLI_SYMBOLS.success} Passed: ${tests.passed}`);
  console.log(`${CLI_SYMBOLS.error} Failed: ${tests.failed}`);
  console.log(`${CLI_SYMBOLS.chartUp} Total: ${tests.passed + tests.failed}\n`);

  process.exit(tests.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
