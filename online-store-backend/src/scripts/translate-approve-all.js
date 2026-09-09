require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const args = process.argv.slice(2);

async function main() {
  try {
    // Connect to MongoDB
    console.log(`${CLI_SYMBOLS.connection} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);

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
      console.log(`${CLI_SYMBOLS.success} Nothing to approve\n`);
      process.exit(0);
    }

    // Confirm
    if (!args.includes('--force')) {
      console.log(`${CLI_SYMBOLS.warning} Use --force to confirm bulk approval`);
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
    console.log(`\n${CLI_SYMBOLS.success} Bulk Approval Completed`);
    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log(`Approved:       ${result.modifiedCount} translations`);
    console.log(`Status changed: pending ${CLI_SYMBOLS.arrowRight} approved`);
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
    console.error(`\n${CLI_SYMBOLS.error} Bulk approval failed:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
