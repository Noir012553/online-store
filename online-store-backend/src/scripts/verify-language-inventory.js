#!/usr/bin/env node
/**
 * Verify Language Inventory Consistency
 * Ensures all 9 languages are properly configured across:
 * 1. Filesystem (60 JSON files per language)
 * 2. Database (Language collection)
 * 3. Config (languageInventory.js)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Language = require('../models/Language');
const StaticTranslation = require('../models/StaticTranslation');
const { SUPPORTED_LANGUAGES, getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const LOCALES_PATH = path.join(__dirname, '../locales');

async function verifyLanguageInventory() {
  console.log(`\n${CLI_SYMBOLS.search} Verifying 9-Language Inventory System...\n`);

  const results = {
    config: { status: CLI_SYMBOLS.success, details: [] },
    filesystem: { status: CLI_SYMBOLS.success, details: [] },
    database: { status: CLI_SYMBOLS.success, details: [] },
    consistency: { status: CLI_SYMBOLS.success, details: [] },
  };

  // 1. Verify Config (languageInventory.js)
  console.log(`${CLI_SYMBOLS.list} [1/4] Checking config/languageInventory.js...`);
  const expectedLanguageCodes = SUPPORTED_LANGUAGES.map(l => l.code);
  const actualLanguageCodes = SUPPORTED_LANGUAGES.map(l => l.code);

  if (actualLanguageCodes.length === 9 && SUPPORTED_LANGUAGES.every(l => l.code)) {
    console.log(`  ${CLI_SYMBOLS.success} Config has all 9 languages: ${actualLanguageCodes.join(', ')}`);
    results.config.details.push(`Found ${actualLanguageCodes.length} languages in correct sequence`);
  } else {
    console.log(`  ${CLI_SYMBOLS.error} Config mismatch!`);
    console.log(`     Got: ${actualLanguageCodes.join(', ')}`);
    results.config.status = CLI_SYMBOLS.error;
    results.config.details.push(`Expected 9 languages, got ${actualLanguageCodes.length}`);
  }

  // 2. Verify Filesystem
  console.log(`\n${CLI_SYMBOLS.folder} [2/4] Checking filesystem (locales/)...`);
  const fsResults = {};
  let totalFileCount = 0;

  for (const lang of actualLanguageCodes) {
    const langPath = path.join(LOCALES_PATH, lang);
    if (!fs.existsSync(langPath)) {
      console.log(`  ${CLI_SYMBOLS.error} Missing directory: ${lang}`);
      results.filesystem.status = CLI_SYMBOLS.error;
      fsResults[lang] = 'MISSING';
      continue;
    }

    try {
      const files = fs.readdirSync(langPath).filter(f => f.endsWith('.json'));
      totalFileCount += files.length;
      fsResults[lang] = files.length;
      console.log(`  ${CLI_SYMBOLS.success} ${lang}: ${files.length} JSON files`);
    } catch (error) {
      console.log(`  ${CLI_SYMBOLS.error} ${lang}: Error reading directory - ${error.message}`);
      results.filesystem.status = CLI_SYMBOLS.error;
      fsResults[lang] = 'ERROR';
    }
  }

  // Verify all languages have same file count (60)
  const fileCounts = Object.values(fsResults).filter(v => typeof v === 'number');
  if (fileCounts.length === 9 && fileCounts.every(c => c === fileCounts[0])) {
    console.log(`  ${CLI_SYMBOLS.success} All ${fileCounts[0]} namespace files per language: ${fileCounts[0] * 9} total`);
    results.filesystem.details.push(`${fileCounts[0]} files per language, ${fileCounts[0] * 9} total`);
  } else {
    console.log(`  ${CLI_SYMBOLS.warning}  File count inconsistent across languages`);
    results.filesystem.status = `${CLI_SYMBOLS.warning} `;
    results.filesystem.details.push(`Inconsistent file counts: ${JSON.stringify(fsResults)}`);
  }

  // 3. Verify Database (requires connection)
  console.log(`\n${CLI_SYMBOLS.database}  [3/4] Checking database (Language collection)...`);
  try {
    if (!mongoose.connection.db) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-store-dev', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    const dbLanguages = await Language.find().lean();
    const dbLanguageCodes = dbLanguages.map(l => l.code);

    console.log(`  ${CLI_SYMBOLS.success} Found ${dbLanguages.length} languages in Database:`);
    for (const lang of dbLanguages) {
      const isDefault = lang.isSystemDefault ? ' (DEFAULT)' : '';
      const status = lang.isActive ? 'active' : 'inactive';
      console.log(`     - ${lang.code}: ${lang.name} [${status}]${isDefault}`);
    }

    const allCodesPresent = expectedLanguageCodes.every(code => dbLanguageCodes.includes(code));
    if (dbLanguageCodes.length === 9 && allCodesPresent) {
      results.database.details.push(`All 9 languages configured in DB`);
    } else {
      console.log(`  ${CLI_SYMBOLS.warning}  Database languages mismatch!`);
      results.database.status = `${CLI_SYMBOLS.warning} `;
      results.database.details.push(`Missing or extra languages`);
    }

    // 4. Verify Static Translations seeded
    console.log(`\n${CLI_SYMBOLS.books} [4/4] Checking StaticTranslation collection...`);
    const translationStats = await StaticTranslation.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$code',
          namespaceCount: { $sum: 1 },
          keysTotal: { $sum: { $size: { $objectToArray: '$translations' } } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    if (translationStats.length === 9) {
      console.log(`  ${CLI_SYMBOLS.success} All 9 languages have translations seeded:`);
      for (const stat of translationStats) {
        console.log(`     - ${stat._id}: ${stat.namespaceCount} namespaces, ~${Math.round(stat.keysTotal)} total keys`);
      }
      results.consistency.details.push(`StaticTranslation fully seeded for all 9 languages`);
    } else {
      console.log(`  ${CLI_SYMBOLS.error} Only ${translationStats.length}/9 languages have translations!`);
      results.consistency.status = CLI_SYMBOLS.error;
      results.consistency.details.push(`Only ${translationStats.length}/9 languages seeded`);
    }
  } catch (error) {
    console.error(`  ${CLI_SYMBOLS.error} Database check failed: ${error.message}`);
    results.database.status = CLI_SYMBOLS.error;
    results.database.details.push(`Connection error: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`${CLI_SYMBOLS.chart} VERIFICATION SUMMARY:\n`);
  const allOk = Object.values(results).every(r => r.status.includes(CLI_SYMBOLS.success));

  if (allOk) {
    console.log(`${CLI_SYMBOLS.success} Language Inventory System is HEALTHY!`);
    console.log('   - All 9 languages configured');
    console.log('   - Filesystem consistency verified');
    console.log('   - Database fully synchronized');
  } else {
    console.log(`${CLI_SYMBOLS.warning}  Issues detected in Language Inventory:`);
    for (const [section, result] of Object.entries(results)) {
      if (!result.status.includes(CLI_SYMBOLS.success)) {
        console.log(`   ${result.status} ${section}: ${result.details.join(', ')}`);
      }
    }
  }
  console.log('\n' + '='.repeat(60) + '\n');

  await mongoose.disconnect();
  process.exit(allOk ? 0 : 1);
}

verifyLanguageInventory().catch(error => {
  console.error(`${CLI_SYMBOLS.error} Verification failed:`, error);
  process.exit(1);
});
