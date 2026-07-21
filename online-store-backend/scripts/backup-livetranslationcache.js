/**
 * Phase 4 Task #11: Backup LiveTranslationCache before dropping
 * Usage: node scripts/backup-livetranslationcache.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config();

const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

async function backupCache() {
  try {
    console.log('[Backup] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('[Backup] Fetching all LiveTranslationCache documents...');
    const documents = await LiveTranslationCache.find().lean();

    console.log(`[Backup] Found ${documents.length} documents`);

    const backupData = {
      timestamp: new Date().toISOString(),
      totalDocuments: documents.length,
      collectionName: 'LiveTranslationCache',
      documents,
    };

    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `livetranslationcache_${Date.now()}.json`;
    const filepath = path.join(backupDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

    console.log(`[Backup] ${CLI_SYMBOLS.success} Backup saved to: ${filepath}`);
    console.log(`[Backup] Size: ${fs.statSync(filepath).size} bytes`);

    // Also save metadata
    const metadataPath = path.join(backupDir, 'backup.manifest.json');
    const manifest = {
      lastBackup: new Date().toISOString(),
      files: fs.readdirSync(backupDir).filter(f => f.endsWith('.json')),
    };

    fs.writeFileSync(metadataPath, JSON.stringify(manifest, null, 2));

    console.log('[Backup] Manifest updated');

    process.exit(0);
  } catch (error) {
    console.error('[Backup] Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

backupCache();
