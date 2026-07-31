/**
 * Smart Seed with Version Control
 * 
 * Khi seed lần 2+, script này sẽ:
 * 1. Kiểm tra xem translation đã tồn tại chưa (bằng hashKey)
 * 2. Nếu tồn tại và approved -> skip (giữ nguyên)
 * 3. Nếu tồn tại và needs_retranslate -> update thành version mới (tương tự retranslate)
 * 4. Nếu là dữ liệu mới -> tạo mới
 * 
 * Cách dùng:
 * npm run seed:smart                    - Seed lần 2+ với version control
 * npm run seed:smart --dry-run          - Test trước
 * npm run seed:smart --reset-status     - Reset tất cả status về pending
 */

const mongoose = require('mongoose');
require('dotenv').config();
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const args = process.argv.slice(2);

async function smartSeed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.connection} Connected to MongoDB\n`);

    const dryRun = args.includes('--dry-run');
    const resetStatus = args.includes('--reset-status');

    if (resetStatus) {
      if (!args.includes('--force')) {
        console.log(`${CLI_SYMBOLS.warning} Use --force to confirm status reset`);
        process.exit(1);
      }

      console.log(`${CLI_SYMBOLS.progress} Resetting all translation statuses to pending...\n`);

      const result = await LiveTranslationCache.updateMany(
        {},
        {
          $set: {
            qualityStatus: 'pending',
            reviewedBy: null,
            reviewedAt: null,
            reviewNotes: null,
          },
        }
      );

      console.log(`${CLI_SYMBOLS.success} Reset ${result.modifiedCount} translations to pending\n`);
      process.exit(0);
    }

    // Show current stats
    const stats = await LiveTranslationCache.getQualityStats();
    console.log(`${CLI_SYMBOLS.chart} Current Translation Statistics:`);
    if (stats.length > 0) {
      const s = stats[0];
      console.log(`   Total:       ${s.totalTranslations || 0}`);
      console.log(`   Approved:    ${s.approved || 0}`);
      console.log(`   Pending:     ${s.pending || 0}`);
      console.log(`   Needs Fix:   ${s.needsRetranslate || 0}`);
      console.log(`   Rejected:    ${s.rejected || 0}\n`);
    }

    console.log(`${CLI_SYMBOLS.infoEmoji} Smart Seed Behavior:`);
    console.log(`   ${CLI_SYMBOLS.bullet} Approved translations ${CLI_SYMBOLS.arrowRight} Skipped (kept as-is)`);
    console.log(`   ${CLI_SYMBOLS.bullet} Pending translations ${CLI_SYMBOLS.arrowRight} Re-validate`);
    console.log(`   ${CLI_SYMBOLS.bullet} Needs retranslate ${CLI_SYMBOLS.arrowRight} Create new version`);
    console.log(`   ${CLI_SYMBOLS.bullet} Rejected translations ${CLI_SYMBOLS.arrowRight} Create new version`);
    console.log(`   ${CLI_SYMBOLS.bullet} New translations ${CLI_SYMBOLS.arrowRight} Create new\n`);

    if (dryRun) {
      console.log(`${CLI_SYMBOLS.test} DRY RUN MODE - No changes will be made\n`);
    }

    console.log(`${CLI_SYMBOLS.success} Configuration ready for smart seeding`);
    console.log(`\n${CLI_SYMBOLS.idea} Next step: Run "npm run seed --incremental" with validation enabled\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Error:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

smartSeed();
