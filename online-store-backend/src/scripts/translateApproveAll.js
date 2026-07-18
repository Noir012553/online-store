const mongoose = require('mongoose');
require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const { getDefaultLanguage } = require('../config/languageInventory');

const args = process.argv.slice(2);

async function main() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Build filter
    const filter = {};

    // Parse filter
    const filterArg = args.find(arg => arg.startsWith('--filter='));
    if (filterArg) {
      const filterValue = filterArg.split('=')[1];
      filter.validationErrors = filterValue;
    }

    // Parse language
    const langArg = args.find(arg => arg.startsWith('--lang='));
    if (langArg) {
      filter.targetLang = langArg.split('=')[1];
    }

    // Parse status
    const statusArg = args.find(arg => arg.startsWith('--status='));
    if (statusArg) {
      filter.qualityStatus = statusArg.split('=')[1];
    } else {
      filter.qualityStatus = 'pending'; // Default
    }

    // Get count
    const count = await LiveTranslationCache.countDocuments(filter);
    console.log(`Found ${count} translations to approve\n`);

    if (count === 0) {
      console.log('✅ Nothing to approve\n');
      process.exit(0);
    }

    // Confirm
    if (!args.includes('--force')) {
      console.log('⚠️ Use --force to confirm bulk approval');
      process.exit(1);
    }

    // Get admin name
    const adminName = process.env.ADMIN_NAME || 'admin_system';

    // Perform bulk update
    const result = await LiveTranslationCache.updateMany(
      filter,
      {
        $set: {
          qualityStatus: 'approved',
          reviewedBy: adminName,
          reviewedAt: new Date(),
        },
      }
    );

    // Create logs
    const translations = await LiveTranslationCache.find(filter).lean();
    const logs = translations.map(t => ({
      translationId: t._id,
      action: 'approved',
      actor: adminName,
      reason: 'bulk_approval',
      metadata: { qualityScore: t.qualityScore },
    }));

    if (logs.length > 0) {
      await TranslationQualityLog.insertMany(logs);
    }

    // Print result
    console.log('\n✅ Bulk Approval Completed');
    console.log('═'.repeat(55));
    console.log(`Approved:       ${result.modifiedCount} translations`);
    console.log(`Status changed: pending → approved`);
    console.log(`Reviewed By:    ${adminName}`);
    const defaultLang = getDefaultLanguage().code;
    const dateFormatter = new Intl.DateTimeFormat(`${defaultLang}-${defaultLang.toUpperCase()}`, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    console.log(`Time:           ${dateFormatter.format(new Date())}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Bulk approval failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
