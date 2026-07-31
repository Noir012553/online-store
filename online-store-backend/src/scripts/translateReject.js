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

    // Get translation ID
    const translationId = args[0];
    if (!translationId) {
      console.log(`${CLI_SYMBOLS.error} Usage: npm run translate:reject <translationId> [--reason="..."] [--note="..."]`);
      process.exit(1);
    }

    // Find translation
    const translation = await LiveTranslationCache.findById(translationId);
    if (!translation) {
      console.log(`${CLI_SYMBOLS.error} Translation not found`);
      process.exit(1);
    }

    // Parse reason and note
    const reasonArg = args.find(arg => arg.startsWith('--reason='));
    const noteArg = args.find(arg => arg.startsWith('--note='));
    const reason = reasonArg ? reasonArg.split('=')[1].replace(/^"|"$/g, '') : 'manual_rejection';
    const note = noteArg ? noteArg.split('=')[1].replace(/^"|"$/g, '') : '';

    // Get admin name from env or use default
    const adminName = process.env.ADMIN_NAME || 'admin_system';

    // Update translation
    translation.qualityStatus = 'rejected';
    translation.reviewedBy = adminName;
    translation.reviewedAt = new Date();
    translation.reviewNotes = note || reason;
    await translation.save();

    // Create audit log
    await TranslationQualityLog.create({
      translationId: translation._id,
      action: 'rejected',
      actor: adminName,
      reason,
      metadata: {
        note,
        qualityScore: translation.qualityScore,
      },
    });

    // Print result
    console.log(`\n${CLI_SYMBOLS.error} Translation Rejected`);
    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log(`ID:          ${translation._id}`);
    console.log(`Original:    "${translation.originalText}"`);
    console.log(`Translated:  "${translation.translatedText}"`);
    console.log(`Status:      ${translation.qualityStatus} ${CLI_SYMBOLS.error}`);
    console.log(`Quality:     ${translation.qualityScore}/100`);
    console.log(`Reason:      ${reason}`);
    console.log(`Reviewed By: ${adminName}`);
    const defaultLang = getDefaultLanguage().code;
    const dateFormatter = new Intl.DateTimeFormat(`${defaultLang}-${defaultLang.toUpperCase()}`, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    console.log(`Reviewed At: ${dateFormatter.format(new Date())}`);
    if (note) console.log(`Note:        ${note}`);
    console.log(`\n${CLI_SYMBOLS.idea} Next: npm run retranslate to fix this translation\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Rejection failed:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
