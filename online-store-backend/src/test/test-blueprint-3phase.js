/**
 * Test Script: 3-Phase Language Setup Blueprint
 * 
 * Kiểm tra xem cơ chế 3-Phase (Clone UI → Dịch Products → Finalize) hoạt động đúng
 * 
 * Chạy: npm run seed && node test-blueprint-3phase.js
 */

const axios = require('axios');
const mongoose = require('mongoose');

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-token'; // Set in .env

const Language = require('../models/Language');
const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

async function test(description, fn) {
  try {
    console.log(`\n${CLI_SYMBOLS.edit} Test: ${description}`);
    await fn();
    console.log(`${CLI_SYMBOLS.success} PASS: ${description}`);
    return true;
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} FAIL: ${description}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);

    const testLanguageCode = 'ja'; // Test with Japanese
    let testPassed = 0;
    let testFailed = 0;

    console.log(CLI_SYMBOLS.divider.repeat(59));
    console.log(`${CLI_SYMBOLS.rocket} 3-PHASE LANGUAGE SETUP BLUEPRINT TEST`);
    console.log(`${CLI_SYMBOLS.divider.repeat(59)}\n`);

    // ========== PHASE 0: Setup Validation ==========
    console.log(`${CLI_SYMBOLS.location} PHASE 0: Pre-setup Validation\n`);

    if (await test('Check if test language already exists', async () => {
      const existing = await Language.findOne({ code: testLanguageCode });
      if (existing) {
        console.log(`   Removing existing language ${testLanguageCode}...`);
        await Language.deleteOne({ code: testLanguageCode });
        await StaticTranslation.deleteMany({ code: testLanguageCode });
        await LiveTranslationCache.deleteMany({ targetLang: testLanguageCode });
      }
    })) testPassed++;
    else testFailed++;

    // ========== PHASE 1: Trigger Setup ==========
    console.log(`\n${CLI_SYMBOLS.location} PHASE 1: Trigger 3-Phase Setup via API\n`);

    let setupResponseTime = 0;

    if (await test('POST /api/languages with 3-phase setup', async () => {
      const startTime = Date.now();
      const response = await axios.post(
        `${API_BASE}/api/languages`,
        {
          code: testLanguageCode,
          name: 'Tiếng Nhật',
        },
        {
          headers: {
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      setupResponseTime = Date.now() - startTime;

      if (!response.data.success) {
        throw new Error(`Response not successful: ${response.data.message}`);
      }

      if (!response.data.data) {
        throw new Error('No data returned');
      }

      console.log(`   Response time: ${setupResponseTime}ms (target: < 100ms)`);
      if (setupResponseTime > 100) {
        console.warn(`   ${CLI_SYMBOLS.warning}  Warning: Response time exceeds 100ms target`);
      }

      if (response.data.data.isReady !== false) {
        throw new Error('Language should start with isReady=false');
      }

      if (!response.data.data.setupStartedAt) {
        throw new Error('setupStartedAt should be set');
      }
    })) testPassed++;
    else testFailed++;

    // ========== PHASE 2: Monitor Setup Progress ==========
    console.log(`\n${CLI_SYMBOLS.location} PHASE 2: Monitor Setup Progress (10 second samples)\n`);

    const maxWaitTime = 180000; // 3 minutes max
    const startSetupTime = Date.now();
    let isSetupComplete = false;
    let statusCheckCount = 0;

    while (!isSetupComplete && Date.now() - startSetupTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s between checks
      statusCheckCount++;

      const response = await axios.get(
        `${API_BASE}/api/languages/${testLanguageCode}/setup-status`,
        {
          headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        }
      );

      if (response.data.success) {
        const { isReady, status, setupDurationSeconds } = response.data.data;

        console.log(`   [Check ${statusCheckCount}] Status: ${status}, isReady: ${isReady}`);

        if (isReady) {
          console.log(`   ${CLI_SYMBOLS.check} Setup completed in ${setupDurationSeconds} seconds`);
          isSetupComplete = true;
        }
      }
    }

    if (await test('Verify setup completed (isReady=true)', async () => {
      const language = await Language.findOne({ code: testLanguageCode });
      if (!language) {
        throw new Error('Language not found');
      }
      if (!language.isReady) {
        throw new Error(`Language setup not complete. isReady=${language.isReady}`);
      }
      if (!language.setupCompletedAt) {
        throw new Error('setupCompletedAt not set');
      }

      const duration = (language.setupCompletedAt - language.setupStartedAt) / 1000;
      console.log(`   Setup duration: ${duration} seconds`);
    })) testPassed++;
    else testFailed++;

    // ========== PHASE 3: Verify Data ==========
    console.log(`\n${CLI_SYMBOLS.location} PHASE 3: Verify Setup Data\n`);

    let uiTranslationCount = 0;
    if (await test('Verify StaticTranslation records created', async () => {
      uiTranslationCount = await StaticTranslation.countDocuments({
        code: testLanguageCode,
        isDeleted: false,
      });

      console.log(`   Found ${uiTranslationCount} StaticTranslation namespaces`);

      if (uiTranslationCount === 0) {
        throw new Error('No StaticTranslation records found');
      }

      // Check at least one namespace has translations
      const sampleRecord = await StaticTranslation.findOne({
        code: testLanguageCode,
        isDeleted: false,
      });

      if (!sampleRecord) {
        throw new Error('Cannot find sample StaticTranslation record');
      }

      const translationCount = Object.keys(sampleRecord.translations || {}).length;
      console.log(`   Sample namespace '${sampleRecord.namespace}' has ${translationCount} keys`);

      if (translationCount === 0) {
        throw new Error('Sample namespace has no translations');
      }
    })) testPassed++;
    else testFailed++;

    let productTranslationCount = 0;
    if (await test('Verify LiveTranslationCache records created', async () => {
      productTranslationCount = await LiveTranslationCache.countDocuments({
        targetLang: testLanguageCode,
      });

      console.log(`   Found ${productTranslationCount} LiveTranslationCache records`);

      if (productTranslationCount === 0) {
        console.warn(`   ${CLI_SYMBOLS.warning}  Warning: No product translations found (products may be empty)`);
      } else {
        // Check cache entries
        const byType = await LiveTranslationCache.aggregate([
          { $match: { targetLang: testLanguageCode } },
          { $group: { _id: '$entityType', count: { $sum: 1 } } },
        ]);

        console.log(`   Translation breakdown:`);
        for (const item of byType) {
          console.log(`     ${CLI_SYMBOLS.bullet} ${item._id}: ${item.count}`);
        }
      }
    })) testPassed++;
    else testFailed++;

    if (await test('Verify TTL index on LiveTranslationCache', async () => {
      const indexes = await LiveTranslationCache.collection.getIndexes();
      const ttlIndex = Object.values(indexes).find(idx => idx.expireAfterSeconds);

      if (!ttlIndex) {
        throw new Error('TTL index not found');
      }

      console.log(`   TTL expires after ${ttlIndex.expireAfterSeconds} seconds (${ttlIndex.expireAfterSeconds / 86400} days)`);

      if (ttlIndex.expireAfterSeconds !== 2592000) {
        throw new Error(`Expected 30 days (2592000s), got ${ttlIndex.expireAfterSeconds}s`);
      }
    })) testPassed++;
    else testFailed++;

    // ========== PHASE 4: API Verification ==========
    console.log(`\n${CLI_SYMBOLS.location} PHASE 4: API Verification\n`);

    if (await test('GET /api/languages returns setup data', async () => {
      const response = await axios.get(
        `${API_BASE}/api/languages`,
        {
          headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        }
      );

      if (!response.data.success) {
        throw new Error('API response not successful');
      }

      const testLang = response.data.data.find(l => l.code === testLanguageCode);
      if (!testLang) {
        throw new Error(`Language ${testLanguageCode} not found in API response`);
      }

      console.log(`   Language found: ${testLang.name}, isReady: ${testLang.isReady}`);

      if (!testLang.isReady) {
        throw new Error('Language should be ready');
      }
    })) testPassed++;
    else testFailed++;

    // ========== Summary ==========
    console.log(`\n${CLI_SYMBOLS.divider.repeat(59)}`);
    console.log(`${CLI_SYMBOLS.chart} TEST SUMMARY`);
    console.log(`${CLI_SYMBOLS.divider.repeat(59)}\n`);

    console.log(`${CLI_SYMBOLS.success} Passed: ${testPassed}`);
    console.log(`${CLI_SYMBOLS.error} Failed: ${testFailed}`);
    console.log(`\nUI Translations: ${uiTranslationCount} namespaces`);
    console.log(`Product Translations: ${productTranslationCount} cache entries`);
    console.log(`API Response Time: ${setupResponseTime}ms\n`);

    if (testFailed === 0) {
      console.log(`${CLI_SYMBOLS.celebration} ALL TESTS PASSED! Blueprint is working correctly.\n`);
    } else {
      console.log(`${CLI_SYMBOLS.warning}  SOME TESTS FAILED. Check the logs above.\n`);
    }

    process.exit(testFailed === 0 ? 0 : 1);
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Fatal error:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
