const fs = require('fs');
const path = require('path');

const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const LANGUAGES = getActiveLangCodes();
const defaultLang = getDefaultLanguage().code;

// Read all files from DEFAULT language directory
const defaultDir = path.join(LOCALES_DIR, defaultLang);
const defaultFiles = fs.readdirSync(defaultDir).filter(f => f.endsWith('.json'));

console.log(`\n🔍 KEY STRUCTURE CONSISTENCY VERIFICATION\n`);
console.log(`Files to Check: ${defaultFiles.length}`);
console.log(`Reference Language: ${defaultLang}`);
console.log(`Languages: ${LANGUAGES.join(', ')}\n`);

let totalIssues = 0;
const issuesByFile = {};

// Check each file for consistency
defaultFiles.forEach((filename) => {
  const fileIssues = [];

  // Get DEFAULT language keys as reference
  const defaultPath = path.join(LOCALES_DIR, defaultLang, filename);
  const defaultContent = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  const defaultKeys = Object.keys(defaultContent).sort();

  // Check all other languages
  LANGUAGES.forEach((lang) => {
    if (lang === defaultLang) return;

    const langPath = path.join(LOCALES_DIR, lang, filename);
    
    if (!fs.existsSync(langPath)) {
      fileIssues.push({
        language: lang,
        issue: 'FILE_MISSING',
        details: `File does not exist: ${lang}/${filename}`
      });
      return;
    }

    const langContent = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    const langKeys = Object.keys(langContent).sort();

    // Compare key lists
    const missingKeys = defaultKeys.filter(key => !langKeys.includes(key));
    const extraKeys = langKeys.filter(key => !defaultKeys.includes(key));

    if (missingKeys.length > 0) {
      fileIssues.push({
        language: lang,
        issue: 'MISSING_KEYS',
        details: `Missing ${missingKeys.length} key(s): ${missingKeys.slice(0, 3).join(', ')}${missingKeys.length > 3 ? '...' : ''}`
      });
    }

    if (extraKeys.length > 0) {
      fileIssues.push({
        language: lang,
        issue: 'EXTRA_KEYS',
        details: `Has ${extraKeys.length} extra key(s) not in ${defaultLang}: ${extraKeys.slice(0, 3).join(', ')}${extraKeys.length > 3 ? '...' : ''}`
      });
    }

    // Check for nested structures (should be flat only)
    langKeys.forEach(key => {
      const value = langContent[key];
      
      if (typeof value === 'object' && value !== null) {
        fileIssues.push({
          language: lang,
          issue: 'NESTED_STRUCTURE',
          details: `Key "${key}" has nested object value instead of string`
        });
      }
    });
  });

  if (fileIssues.length > 0) {
    issuesByFile[filename] = fileIssues;
    totalIssues += fileIssues.length;
  }
});

// Report results
if (totalIssues === 0) {
  console.log(`✅ PERFECT! All ${defaultFiles.length} files have consistent key structure across all ${LANGUAGES.length} languages\n`);
  console.log(`Verification Results:`);
  console.log(`  - Total files checked: ${defaultFiles.length}`);
  console.log(`  - Total language checks: ${defaultFiles.length * (LANGUAGES.length - 1)} (${defaultFiles.length} files * ${LANGUAGES.length - 1} languages)`);
  console.log(`  - Consistency issues found: 0`);
  console.log(`  - Flat key structure: ✓ Confirmed`);
  console.log(`  - Key synchronization: ✓ Perfect`);
} else {
  console.log(`⚠️ ISSUES FOUND: ${totalIssues} consistency problems\n`);
  
  Object.entries(issuesByFile).forEach(([filename, issues]) => {
    console.log(`\n📄 ${filename}`);
    issues.forEach((issue) => {
      console.log(`  [${issue.issue}] ${issue.language}: ${issue.details}`);
    });
  });
}

// Summary statistics
console.log(`\n📊 SUMMARY STATISTICS\n`);
console.log(`Files with consistency issues: ${Object.keys(issuesByFile).length}/${defaultFiles.length}`);
console.log(`Files with perfect consistency: ${defaultFiles.length - Object.keys(issuesByFile).length}/${defaultFiles.length}`);
console.log(`Total issues identified: ${totalIssues}`);

// Sample verification
console.log(`\n🔬 SAMPLE VERIFICATION (First 3 Files)\n`);
defaultFiles.slice(0, 3).forEach((filename) => {
  const defaultPath = path.join(LOCALES_DIR, defaultLang, filename);
  const defaultContent = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  const keyCount = Object.keys(defaultContent).length;

  let allMatch = true;
  LANGUAGES.forEach((lang) => {
    if (lang === defaultLang) return;
    const langPath = path.join(LOCALES_DIR, lang, filename);
    const langContent = JSON.parse(fs.readFileSync(langPath, 'utf8'));
    if (Object.keys(langContent).length !== keyCount) {
      allMatch = false;
    }
  });

  const status = allMatch ? '✓' : '✗';
  console.log(`${status} ${filename}: ${keyCount} keys in all ${LANGUAGES.length} languages`);
});

console.log(`\n✓ Consistency verification complete!`);

// Export results
const results = {
  timestamp: new Date().toISOString(),
  total_files: defaultFiles.length,
  languages_checked: LANGUAGES.length,
  consistency_issues: totalIssues,
  files_with_issues: Object.keys(issuesByFile),
  all_consistent: totalIssues === 0,
  issues_by_file: issuesByFile
};

fs.writeFileSync(
  path.join(__dirname, '../i18n/key-consistency-report.json'),
  JSON.stringify(results, null, 2)
);

process.exit(totalIssues > 0 ? 1 : 0);
