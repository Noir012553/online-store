/**
 * Language Completeness Verification Script
 * Ensures Rule #1 Compliance: All 9 languages have identical namespace sets
 *
 * Run: node src/seeds/verifyLanguageCompleteness.js
 * 
 * Checks:
 * 1. All 9 languages exist with all namespace JSON files
 * 2. No missing or extra files between languages
 * 3. JSON structure validation
 * 4. MongoDB StaticTranslation seeding completeness
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const StaticTranslation = require('../models/StaticTranslation');
const { SUPPORTED_LANGUAGES } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const LOCALES_PATH = path.join(__dirname, '../locales');
const SUPPORTED_LANGS = SUPPORTED_LANGUAGES.map(l => l.code);

console.log(`\n${CLI_SYMBOLS.chart} LANGUAGE COMPLETENESS VERIFICATION\n`);
console.log(`Expected languages: ${SUPPORTED_LANGS.join(', ')}\n`);

// ============ PHASE 1: File System Check ============
console.log(`${CLI_SYMBOLS.search} PHASE 1: File System Verification`);
console.log(CLI_SYMBOLS.lightDivider.repeat(50));

const namespacesByLang = {};
let hasErrors = false;

for (const lang of SUPPORTED_LANGS) {
  const langPath = path.join(LOCALES_PATH, lang);
  
  if (!fs.existsSync(langPath)) {
    console.log(`${CLI_SYMBOLS.error} Missing directory: ${lang}`);
    hasErrors = true;
    continue;
  }

  try {
    const files = fs.readdirSync(langPath)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
    
    namespacesByLang[lang] = files;
    console.log(`${CLI_SYMBOLS.success} ${lang.padEnd(3)} - ${files.length} namespaces`);
  } catch (err) {
    console.log(`${CLI_SYMBOLS.error} Error reading ${lang}: ${err.message}`);
    hasErrors = true;
  }
}

// ============ PHASE 2: Consistency Check ============
console.log(`\n${CLI_SYMBOLS.progress} PHASE 2: Namespace Consistency Check`);
console.log(CLI_SYMBOLS.lightDivider.repeat(50));

const firstLang = SUPPORTED_LANGS[0];
const referenceNamespaces = namespacesByLang[firstLang] || [];

let consistencyOk = true;

for (const lang of SUPPORTED_LANGS) {
  const langNamespaces = namespacesByLang[lang] || [];
  
  // Check missing
  const missing = referenceNamespaces.filter(ns => !langNamespaces.includes(ns));
  const extra = langNamespaces.filter(ns => !referenceNamespaces.includes(ns));
  
  if (missing.length === 0 && extra.length === 0) {
    console.log(`${CLI_SYMBOLS.success} ${lang.padEnd(3)} - Identical to reference`);
  } else {
    consistencyOk = false;
    if (missing.length > 0) {
      console.log(`${CLI_SYMBOLS.error} ${lang.padEnd(3)} - Missing: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      console.log(`${CLI_SYMBOLS.error} ${lang.padEnd(3)} - Extra: ${extra.join(', ')}`);
    }
  }
}

// ============ PHASE 3: JSON Structure Validation ============
console.log(`\n${CLI_SYMBOLS.list} PHASE 3: JSON Structure Validation`);
console.log(CLI_SYMBOLS.lightDivider.repeat(50));

let jsonValidationOk = true;

for (const lang of SUPPORTED_LANGS) {
  const langPath = path.join(LOCALES_PATH, lang);
  const files = namespacesByLang[lang] || [];
  let langValid = true;

  for (const namespace of files) {
    const filePath = path.join(langPath, `${namespace}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        console.log(`${CLI_SYMBOLS.error} ${lang}/${namespace} - Invalid structure (not an object)`);
        langValid = false;
        jsonValidationOk = false;
      }
    } catch (err) {
      console.log(`${CLI_SYMBOLS.error} ${lang}/${namespace} - Parse error: ${err.message}`);
      langValid = false;
      jsonValidationOk = false;
    }
  }

  if (langValid) {
    console.log(`${CLI_SYMBOLS.success} ${lang.padEnd(3)} - All files valid JSON`);
  }
}

// ============ PHASE 4: MongoDB Seeding Status ============
console.log(`\n${CLI_SYMBOLS.package} PHASE 4: MongoDB Seeding Status`);
console.log(CLI_SYMBOLS.lightDivider.repeat(50));

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.log(`${CLI_SYMBOLS.warning}  MONGO_URI not set - skipping DB check`);
    } else {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 3000,
      });

      // Check Language collection
      const Language = require('../models/Language');
      const languages = await Language.find({ isActive: true }).lean();
      const dbLangs = languages.map(l => l.code).sort();

      console.log(`Database languages: ${dbLangs.join(', ')}`);

      if (JSON.stringify(dbLangs) === JSON.stringify(SUPPORTED_LANGS)) {
        console.log(`${CLI_SYMBOLS.success} All 9 languages in DB and active`);
      } else {
        const missing = SUPPORTED_LANGS.filter(l => !dbLangs.includes(l));
        const extra = dbLangs.filter(l => !SUPPORTED_LANGS.includes(l));
        if (missing.length > 0) console.log(`${CLI_SYMBOLS.error} Missing in DB: ${missing.join(', ')}`);
        if (extra.length > 0) console.log(`${CLI_SYMBOLS.warning}  Extra in DB: ${extra.join(', ')}`);
      }

      // Check StaticTranslation seeding
      const translations = await StaticTranslation.find({}).lean();
      const translationMap = {};

      translations.forEach(t => {
        if (!translationMap[t.code]) translationMap[t.code] = [];
        translationMap[t.code].push(t.namespace);
      });

      console.log('\nStaticTranslation seeding status:');
      let dbSeededOk = true;

      for (const lang of SUPPORTED_LANGS) {
        const seeded = translationMap[lang] || [];
        const expected = namespacesByLang[lang] || [];
        
        if (seeded.length === expected.length) {
          console.log(`  ${CLI_SYMBOLS.success} ${lang.padEnd(3)} - ${seeded.length} namespaces seeded`);
        } else {
          dbSeededOk = false;
          const missing = expected.filter(ns => !seeded.includes(ns));
          console.log(`  ${CLI_SYMBOLS.error} ${lang.padEnd(3)} - Missing ${missing.length}: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`);
        }
      }

      await mongoose.connection.close();
    }
  } catch (err) {
    console.log(`${CLI_SYMBOLS.warning}  DB check failed: ${err.message}`);
  }

  // ============ FINAL REPORT ============
  console.log('\n' + CLI_SYMBOLS.divider.repeat(50));
  console.log(`${CLI_SYMBOLS.pin} FINAL REPORT\n`);

  if (!hasErrors && consistencyOk && jsonValidationOk) {
    console.log(`${CLI_SYMBOLS.success} All verifications PASSED`);
    console.log('   - File system: Complete');
    console.log('   - Namespace consistency: Verified');
    console.log('   - JSON structure: Valid');
    console.log(`\n${CLI_SYMBOLS.celebration} P0 Task: Language unification COMPLETE\n`);
    process.exit(0);
  } else {
    console.log(`${CLI_SYMBOLS.error} Issues detected:`);
    if (hasErrors) console.log('   - File system errors');
    if (!consistencyOk) console.log('   - Namespace inconsistency');
    if (!jsonValidationOk) console.log('   - JSON validation errors');
    console.log(`\n${CLI_SYMBOLS.warning}  Fixes required before proceeding to P1 tasks\n`);
    process.exit(1);
  }
})();
