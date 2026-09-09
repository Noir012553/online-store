require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
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
      console.log(`${CLI_SYMBOLS.error} Usage: npm run translate:history <translationId>`);
      process.exit(1);
    }

    // Get current version
    const currentTranslation = await LiveTranslationCache.findById(translationId).lean();
    if (!currentTranslation) {
      console.log(`${CLI_SYMBOLS.error} Translation not found`);
      process.exit(1);
    }

    // Get all versions (current + previous)
    const versions = [];
    let currentId = translationId;
    let depth = 0;
    const maxDepth = 20; // Prevent infinite loops

    while (currentId && depth < maxDepth) {
      const version = await LiveTranslationCache.findById(currentId).lean();
      if (!version) break;

      versions.push(version);
      currentId = version.previousVersion;
      depth++;
    }

    // Get all logs for this translation chain
    const translationIds = versions.map(v => v._id);
    const logs = await TranslationQualityLog.find({
      translationId: { $in: translationIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Print version history
    console.log(`\n${CLI_SYMBOLS.history} Translation Version History`);
    console.log(CLI_SYMBOLS.divider.repeat(70));
    console.log(`Original Text: "${currentTranslation.originalText}"`);
    console.log(`Language:      ${currentTranslation.targetLang}`);
    console.log(`Entity Type:   ${currentTranslation.entityType || 'generic'}`);
    console.log(`Total Versions: ${versions.length}\n`);

    versions.forEach((v, idx) => {
      const versionNumber = versions.length - idx;
      const isCurrent = idx === 0;
      const marker = isCurrent ? CLI_SYMBOLS.location : CLI_SYMBOLS.pin;

      console.log(`${marker} VERSION ${versionNumber}${isCurrent ? ' (CURRENT)' : ''}`);
      console.log(`${CLI_SYMBOLS.branch} ID:          ${v._id}`);
      console.log(`${CLI_SYMBOLS.branch} Text:        "${v.translatedText}"`);
      console.log(`${CLI_SYMBOLS.branch} Status:      ${v.qualityStatus}`);
      console.log(`${CLI_SYMBOLS.branch} Score:       ${v.qualityScore || 'N/A'}/100`);
      console.log(`${CLI_SYMBOLS.branch} Errors:      ${v.validationErrors?.length > 0 ? v.validationErrors.join(', ') : 'None'}`);
      console.log(`${CLI_SYMBOLS.branch} Version:     ${v.version}`);
      console.log(`${CLI_SYMBOLS.branch} Created:     ${new Date(v.createdAt).toLocaleString()}`);

      if (v.reviewedAt) {
        console.log(`${CLI_SYMBOLS.branch} Reviewed:    ${new Date(v.reviewedAt).toLocaleString()} by ${v.reviewedBy}`);
      }

      if (v.retranslateReason) {
        console.log(`${CLI_SYMBOLS.branch} Reason:      ${v.retranslateReason}`);
      }

      if (v.reviewNotes) {
        console.log(`${CLI_SYMBOLS.lastBranch} Notes:       ${v.reviewNotes}`);
      } else {
        console.log(`${CLI_SYMBOLS.lastBranch} Notes:       -`);
      }

      if (idx < versions.length - 1) {
        console.log(`   ${CLI_SYMBOLS.arrowDown}\n`);
      } else {
        console.log('');
      }
    });

    // Print action logs
    if (logs.length > 0) {
      console.log(`\n${CLI_SYMBOLS.list} Action Logs`);
      console.log(CLI_SYMBOLS.divider.repeat(70));

      logs.forEach((log, idx) => {
        console.log(`${idx + 1}. [${log.action.toUpperCase()}]`);
        console.log(`   Time:   ${new Date(log.createdAt).toLocaleString()}`);
        console.log(`   Actor:  ${log.actor}`);
        console.log(`   Reason: ${log.reason}`);

        if (log.oldValue !== null && log.oldValue !== log.newValue) {
          console.log(`   Old:    "${log.oldValue}"`);
          console.log(`   New:    "${log.newValue}"`);
        }

        if (log.metadata && Object.keys(log.metadata).length > 0) {
          console.log(`   Meta:   ${JSON.stringify(log.metadata)}`);
        }

        if (idx < logs.length - 1) {
          console.log('');
        }
      });
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} History retrieval failed:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
