const fs = require('fs');
const path = require('path');

const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const LANGUAGES = getActiveLangCodes();
const defaultLang = getDefaultLanguage().code;

// Read all files from DEFAULT language directory to get the complete list
const defaultDir = path.join(LOCALES_DIR, defaultLang);
const defaultFiles = fs.readdirSync(defaultDir).filter(f => f.endsWith('.json'));

console.log(`\n📊 TRANSLATION STATUS ANALYSIS\n`);
console.log(`Total Files to Analyze: ${defaultFiles.length}`);
console.log(`Reference Language: ${defaultLang}`);
console.log(`Languages: ${LANGUAGES.join(', ')}\n`);

const results = {};
const fileStats = [];

// Analyze each file
defaultFiles.forEach((filename) => {
  const defaultPath = path.join(LOCALES_DIR, defaultLang, filename);
  const defaultContent = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  const defaultKeys = Object.keys(defaultContent);
  const defaultKeyCount = defaultKeys.length;

  const fileResult = {
    file: filename,
    [`${defaultLang}_keys`]: defaultKeyCount,
    languages: {}
  };

  // Check each language
  LANGUAGES.forEach((lang) => {
    const langPath = path.join(LOCALES_DIR, lang, filename);

    if (!fs.existsSync(langPath)) {
      fileResult.languages[lang] = { exists: false, keys: 0, percentage: 0 };
      return;
    }

    const langContent = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    const langKeys = Object.keys(langContent);
    const langKeyCount = langKeys.length;
    const percentage = langKeyCount > 0 ? ((langKeyCount / defaultKeyCount) * 100).toFixed(1) : 0;

    // Count how many keys have localized values vs default language values
    let localizedCount = 0;
    let defaultValueCount = 0;

    if (lang !== defaultLang) {
      langKeys.forEach(key => {
        const langValue = langContent[key];
        const defaultValue = defaultContent[key] || '';

        // Simple heuristic: if values are identical, likely not translated
        if (langValue === defaultValue) {
          defaultValueCount++;
        } else {
          localizedCount++;
        }
      });
    }

    fileResult.languages[lang] = {
      exists: true,
      keys: langKeyCount,
      percentage: percentage,
      localized: localizedCount,
      default_fallback: defaultValueCount
    };
  });

  fileStats.push(fileResult);
});

// Categorize files
const fullyTranslated = [];
const partiallyTranslated = [];
const notStarted = [];

fileStats.forEach((stat) => {
  const nonBaseLanguages = LANGUAGES.filter(l => l !== defaultLang);

  // Check if all non-base languages are >90% complete
  const allTranslated = nonBaseLanguages.every(lang => {
    const langStat = stat.languages[lang];
    if (!langStat.exists) return false;
    return langStat.percentage >= 90;
  });

  // Check if any non-base language has 0 localized keys
  const noneTranslated = nonBaseLanguages.every(lang => {
    const langStat = stat.languages[lang];
    if (!langStat.exists) return true;
    return langStat.default_fallback === langStat.keys;
  });

  if (allTranslated) {
    fullyTranslated.push(stat);
  } else if (noneTranslated) {
    notStarted.push(stat);
  } else {
    partiallyTranslated.push(stat);
  }
});

// Print results
console.log(`\n✅ FULLY TRANSLATED (${fullyTranslated.length}/${defaultFiles.length} files)\n`);
fullyTranslated.forEach((stat) => {
  const keyCount = stat[`${defaultLang}_keys`];
  console.log(`  ✓ ${stat.file} (${keyCount} keys)`);
});

console.log(`\n🔄 PARTIALLY TRANSLATED (${partiallyTranslated.length}/${defaultFiles.length} files)\n`);
partiallyTranslated.slice(0, 10).forEach((stat) => {
  const keyCount = stat[`${defaultLang}_keys`];
  const ptStat = stat.languages['pt'];
  console.log(`  ◐ ${stat.file} (${keyCount} keys) - PT: ${ptStat.localized}/${ptStat.keys} localized`);
});
if (partiallyTranslated.length > 10) {
  console.log(`  ... and ${partiallyTranslated.length - 10} more`);
}

console.log(`\n❌ NOT STARTED (${notStarted.length}/${defaultFiles.length} files)\n`);
notStarted.forEach((stat) => {
  const keyCount = stat[`${defaultLang}_keys`];
  console.log(`  ✗ ${stat.file} (${keyCount} keys)`);
});

// Summary statistics
console.log(`\n📈 SUMMARY\n`);
console.log(`Total Translation Progress: ${fullyTranslated.length + partiallyTranslated.length}/${defaultFiles.length} files (${((fullyTranslated.length + partiallyTranslated.length) / defaultFiles.length * 100).toFixed(1)}%)`);
console.log(`Fully Translated: ${fullyTranslated.length}/${defaultFiles.length} (${(fullyTranslated.length / defaultFiles.length * 100).toFixed(1)}%)`);
console.log(`Partially Translated: ${partiallyTranslated.length}/${defaultFiles.length} (${(partiallyTranslated.length / defaultFiles.length * 100).toFixed(1)}%)`);
console.log(`Not Started: ${notStarted.length}/${defaultFiles.length} (${(notStarted.length / defaultFiles.length * 100).toFixed(1)}%)`);

// Export detailed results for reference
const exportData = {
  summary: {
    fully_translated: fullyTranslated.length,
    partially_translated: partiallyTranslated.length,
    not_started: notStarted.length,
    total_files: defaultFiles.length
  },
  fully_translated: fullyTranslated.map(s => s.file),
  partially_translated: partiallyTranslated.map(s => ({ file: s.file, keys: s[`${defaultLang}_keys`] })),
  not_started: notStarted.map(s => ({ file: s.file, keys: s[`${defaultLang}_keys`] }))
};

fs.writeFileSync(path.join(__dirname, '../i18n/translation-analysis.json'), JSON.stringify(exportData, null, 2));
console.log(`\n✓ Detailed analysis saved to src/i18n/translation-analysis.json`);
