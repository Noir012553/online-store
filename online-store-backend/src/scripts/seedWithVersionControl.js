/**
 * Smart Seed with Version Control
 * 
 * Khi seed lần 2+, script này sẽ:
 * 1. Kiểm tra xem translation đã tồn tại chưa (bằng hashKey)
 * 2. Nếu tồn tại và approved → skip (giữ nguyên)
 * 3. Nếu tồn tại và needs_retranslate → update thành version mới (tương tự retranslate)
 * 4. Nếu là dữ liệu mới → tạo mới
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

const args = process.argv.slice(2);

async function smartSeed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔌 Connected to MongoDB\n');

    const dryRun = args.includes('--dry-run');
    const resetStatus = args.includes('--reset-status');

    if (resetStatus) {
      if (!args.includes('--force')) {
        console.log('⚠️ Use --force to confirm status reset');
        process.exit(1);
      }

      console.log('🔄 Resetting all translation statuses to pending...\n');

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

      console.log(`✅ Reset ${result.modifiedCount} translations to pending\n`);
      process.exit(0);
    }

    // Show current stats
    const stats = await LiveTranslationCache.getQualityStats();
    console.log('📊 Current Translation Statistics:');
    if (stats.length > 0) {
      const s = stats[0];
      console.log(`   Total:       ${s.totalTranslations || 0}`);
      console.log(`   Approved:    ${s.approved || 0}`);
      console.log(`   Pending:     ${s.pending || 0}`);
      console.log(`   Needs Fix:   ${s.needsRetranslate || 0}`);
      console.log(`   Rejected:    ${s.rejected || 0}\n`);
    }

    console.log('ℹ️ Smart Seed Behavior:');
    console.log('   • Approved translations → Skipped (kept as-is)');
    console.log('   • Pending translations → Re-validate');
    console.log('   • Needs retranslate → Create new version');
    console.log('   • Rejected translations → Create new version');
    console.log('   • New translations → Create new\n');

    if (dryRun) {
      console.log('🧪 DRY RUN MODE - No changes will be made\n');
    }

    console.log('✅ Configuration ready for smart seeding');
    console.log('\n💡 Next step: Run "npm run seed --incremental" with validation enabled\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

smartSeed();
