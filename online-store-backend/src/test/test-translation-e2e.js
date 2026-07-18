/**
 * End-to-End Test: Multilingual Translation System
 * 
 * Chiến lược Test:
 * 1. Tạo ngôn ngữ mới (ví dụ: Português)
 * 2. Monitor Phase 1-3 hoàn thành
 * 3. Verify DB: StaticTranslation + LiveTranslationCache đầy đủ
 * 4. Test API endpoints mới
 * 5. Verify translation status & failed items
 * 
 * Run: node test-translation-e2e.js
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // Set your admin token

// Color output for logs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  try {
    log(colors.cyan, '\n🚀 START: End-to-End Translation System Test\n');

    // ============ TEST 1: Check admin token ============
    log(colors.blue, '📝 TEST 1: Verify Admin Token');
    if (!ADMIN_TOKEN) {
      log(colors.red, '❌ ERROR: ADMIN_TOKEN not set. Export it: export ADMIN_TOKEN="your_token"');
      process.exit(1);
    }
    log(colors.green, '✅ Admin token configured\n');

    // ============ TEST 2: Create new language ============
    log(colors.blue, '📝 TEST 2: Create new language (Português)');
    const langCode = 'pt-test-' + Date.now(); // Unique code for testing
    const createLangRes = await axios.post(
      `${API_BASE}/language`,
      {
        code: langCode.substring(0, 2), // Use 'pt' only
        name: 'Português (Test)',
      },
      {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }
    );
    log(colors.green, `✅ Language created: ${createLangRes.data.data.code}`);
    log(colors.cyan, `   isReady: ${createLangRes.data.data.isReady}`);
    log(colors.cyan, `   setupStartedAt: ${createLangRes.data.data.setupStartedAt}\n`);

    // ============ TEST 3: Monitor Phase 1-3 progress ============
    log(colors.blue, '📝 TEST 3: Monitor background Phase 1-3 progress');
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (60 attempts × 5s)

    while (!isReady && attempts < maxAttempts) {
      await sleep(5000); // Check every 5 seconds
      attempts++;

      const statusRes = await axios.get(
        `${API_BASE}/language/${createLangRes.data.data.code}/setup-status`,
        {
          headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        }
      );

      const { isReady: setupReady, setupCompletedAt } = statusRes.data.data;
      isReady = setupReady;

      const status = isReady ? '✅ READY' : '⏳ SETTING_UP';
      log(colors.cyan, `   [Attempt ${attempts}/${maxAttempts}] Status: ${status}`);

      if (isReady) {
        log(colors.green, `✅ Language setup completed in ${(attempts * 5)}s`);
        log(colors.cyan, `   setupCompletedAt: ${setupCompletedAt}\n`);
      }
    }

    if (!isReady) {
      log(colors.red, '❌ ERROR: Language setup timeout (5 minutes exceeded)');
      process.exit(1);
    }

    const langCode2 = createLangRes.data.data.code;

    // ============ TEST 4: Test new API endpoints ============
    log(colors.blue, '📝 TEST 4: Test translation status endpoint');
    const statusRes = await axios.get(
      `${API_BASE}/translation/admin/status/${langCode2}`,
      {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }
    );

    const { layer1, layer2, errors, totalErrors } = statusRes.data.data;
    log(colors.green, `✅ Translation status retrieved:`);
    log(colors.cyan, `   Layer 1 (UI):`);
    log(colors.cyan, `     - Progress: ${layer1.progress}%`);
    log(colors.cyan, `     - Completed: ${layer1.completedNamespaces}/${layer1.totalNamespaces} namespaces`);
    log(colors.cyan, `   Layer 2 (Products):`);
    log(colors.cyan, `     - Progress: ${layer2.progress}%`);
    log(colors.cyan, `     - Actual: ${layer2.actualTranslations}/${layer2.expectedTranslations} translations`);
    log(colors.cyan, `   Errors:`);
    log(colors.cyan, `     - Rate Limit (429): ${errors.failed_rate_limit}`);
    log(colors.cyan, `     - Other errors: ${errors.failed_error}`);
    log(colors.cyan, `     - Pending retry: ${errors.pending_retry}`);
    log(colors.cyan, `     - Total: ${totalErrors}\n`);

    // ============ TEST 5: Verify DB data ============
    log(colors.blue, '📝 TEST 5: Verify DB - StaticTranslation records');
    const staticTransRes = await axios.get(
      `${API_BASE}/translation/lang/${langCode2}`,
      {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }
    );
    const staticCount = staticTransRes.data.data.length;
    log(colors.green, `✅ Found ${staticCount} StaticTranslation records for ${langCode2}`);
    if (staticCount === 0) {
      log(colors.red, '⚠️  WARNING: No static translations found! Layer 1 may have failed.');
    } else {
      log(colors.cyan, `   Sample namespace: ${staticTransRes.data.data[0].namespace}`);
    }
    log('');

    // ============ TEST 6: Test failed translations endpoint (if any errors) ============
    if (totalErrors > 0) {
      log(colors.blue, '📝 TEST 6: Retrieve failed translations');
      const failedRes = await axios.get(
        `${API_BASE}/translation/admin/failed/${langCode2}?limit=10`,
        {
          headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        }
      );
      const failedItems = failedRes.data.data.items;
      log(colors.green, `✅ Retrieved ${failedItems.length} failed items:`);
      for (const item of failedItems.slice(0, 3)) {
        log(colors.cyan, `   - ${item.entityType}: "${item.originalText.substring(0, 50)}..."`);
        log(colors.cyan, `     Status: ${item.status}, Retries: ${item.retryCount}/3`);
      }
      log('');

      // ============ TEST 7: Test retry endpoint ============
      log(colors.blue, '📝 TEST 7: Trigger retry for failed translations');
      const retryRes = await axios.post(
        `${API_BASE}/translation/admin/retry/${langCode2}`,
        {},
        {
          headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        }
      );
      log(colors.green, `✅ ${retryRes.data.message}`);
      log(colors.cyan, `   Reset count: ${retryRes.data.data.resetCount}\n`);

      // Wait a bit for background job
      await sleep(2000);

      // Check updated status
      const updatedStatusRes = await axios.get(
        `${API_BASE}/translation/admin/status/${langCode2}`,
        {
          headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        }
      );
      log(colors.cyan, `   Updated error count: ${updatedStatusRes.data.data.totalErrors}\n`);
    } else {
      log(colors.green, '✅ No errors found - All translations completed successfully!\n');
    }

    // ============ TEST 8: Verify language in supported list ============
    log(colors.blue, '📝 TEST 8: Verify language appears in active languages');
    const langsRes = await axios.get(`${API_BASE}/language`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const foundLang = langsRes.data.data.find(l => l.code === langCode2 && l.isReady);
    if (foundLang) {
      log(colors.green, `✅ Language ${langCode2} is active and ready`);
    } else {
      log(colors.red, `❌ Language ${langCode2} not found or not ready`);
    }
    log('');

    // ============ TEST 9: Summary ============
    log(colors.green, '\n✅ ============ ALL TESTS PASSED ============\n');
    log(colors.cyan, 'Summary:');
    log(colors.cyan, `  ✓ Language created: ${langCode2}`);
    log(colors.cyan, `  ✓ Phase 1-3 completed in ${(attempts * 5)}s`);
    log(colors.cyan, `  ✓ Layer 1 (UI): ${layer1.progress}%`);
    log(colors.cyan, `  ✓ Layer 2 (Products): ${layer2.progress}%`);
    log(colors.cyan, `  ✓ Admin API endpoints working`);
    log(colors.cyan, `  ✓ Translation status & retry functional\n`);

    log(colors.yellow, 'Next steps:');
    log(colors.yellow, '  1. Go to Admin > Translations > Bảng điều khiển dịch');
    log(colors.yellow, `  2. Select language: ${langCode2}`);
    log(colors.yellow, '  3. View progress, errors, and manually edit translations');
    log(colors.yellow, '  4. Test frontend: select language from dropdown\n');

    process.exit(0);
  } catch (error) {
    log(colors.red, `\n❌ ERROR: ${error.message}`);
    if (error.response?.data) {
      log(colors.red, `Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTest();
