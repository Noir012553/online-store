const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config();

const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

const backupFile = process.argv[2];
const overwrite = process.argv.includes('--overwrite');

const getBackupDocuments = () => {
  if (!backupFile) {
    throw new Error('Usage: node scripts/restore-livetranslationcache.js <backup-file> [--overwrite]');
  }

  const filepath = path.resolve(process.cwd(), backupFile);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filepath}`);
  }

  const backup = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  if (backup.collectionName !== 'LiveTranslationCache' || !Array.isArray(backup.documents)) {
    throw new Error('Invalid LiveTranslationCache backup file');
  }

  const documents = backup.documents.map(({ _id, ...document }) => document);
  if (documents.some(({ hashKey, originalText, targetLang, translatedText }) => !hashKey || !originalText || !targetLang || !translatedText)) {
    throw new Error('Backup contains an invalid translation document');
  }

  return documents;
};

async function restoreCache() {
  try {
    const documents = getBackupDocuments();
    console.log('[Restore] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    const operations = documents.map((document) => ({
      updateOne: {
        filter: { hashKey: document.hashKey },
        update: overwrite ? { $set: document } : { $setOnInsert: document },
        upsert: true,
      },
    }));
    const result = operations.length
      ? await LiveTranslationCache.bulkWrite(operations, { ordered: false })
      : { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };

    console.log(`[Restore] ${CLI_SYMBOLS.success} Restored ${result.upsertedCount} documents`);
    if (overwrite) {
      console.log(`[Restore] Updated ${result.modifiedCount} existing documents`);
    } else {
      console.log(`[Restore] Skipped ${result.matchedCount} existing documents`);
    }
  } catch (error) {
    console.error('[Restore] Error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

restoreCache();
