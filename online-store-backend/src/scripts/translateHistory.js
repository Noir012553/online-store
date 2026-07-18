const mongoose = require('mongoose');
require('dotenv').config();
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');

const args = process.argv.slice(2);

async function main() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get translation ID
    const translationId = args[0];
    if (!translationId) {
      console.log('❌ Usage: npm run translate:history <translationId>');
      process.exit(1);
    }

    // Get current version
    const currentTranslation = await LiveTranslationCache.findById(translationId).lean();
    if (!currentTranslation) {
      console.log('❌ Translation not found');
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
    console.log('\n📜 Translation Version History');
    console.log('═'.repeat(70));
    console.log(`Original Text: "${currentTranslation.originalText}"`);
    console.log(`Language:      ${currentTranslation.targetLang}`);
    console.log(`Entity Type:   ${currentTranslation.entityType || 'generic'}`);
    console.log(`Total Versions: ${versions.length}\n`);

    versions.forEach((v, idx) => {
      const versionNumber = versions.length - idx;
      const isCurrent = idx === 0;
      const marker = isCurrent ? '📍' : '📌';

      console.log(`${marker} VERSION ${versionNumber}${isCurrent ? ' (CURRENT)' : ''}`);
      console.log(`├─ ID:          ${v._id}`);
      console.log(`├─ Text:        "${v.translatedText}"`);
      console.log(`├─ Status:      ${v.qualityStatus}`);
      console.log(`├─ Score:       ${v.qualityScore || 'N/A'}/100`);
      console.log(`├─ Errors:      ${v.validationErrors?.length > 0 ? v.validationErrors.join(', ') : 'None'}`);
      console.log(`├─ Version:     ${v.version}`);
      console.log(`├─ Created:     ${new Date(v.createdAt).toLocaleString()}`);

      if (v.reviewedAt) {
        console.log(`├─ Reviewed:    ${new Date(v.reviewedAt).toLocaleString()} by ${v.reviewedBy}`);
      }

      if (v.retranslateReason) {
        console.log(`├─ Reason:      ${v.retranslateReason}`);
      }

      if (v.reviewNotes) {
        console.log(`└─ Notes:       ${v.reviewNotes}`);
      } else {
        console.log(`└─ Notes:       -`);
      }

      if (idx < versions.length - 1) {
        console.log(`   ↓\n`);
      } else {
        console.log('');
      }
    });

    // Print action logs
    if (logs.length > 0) {
      console.log('\n📋 Action Logs');
      console.log('═'.repeat(70));

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
    console.error('\n❌ History retrieval failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
