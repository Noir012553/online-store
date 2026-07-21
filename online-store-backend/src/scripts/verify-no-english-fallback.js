#!/usr/bin/env node

/**
 * Verify that no JSON files in PT, FR, DE, IT, ES, NL, SV contain only English values
 * This script checks for "ruột value giả" (fake English-only content)
 */

const fs = require('fs');
const path = require('path');
const { getDefaultLanguage, getActiveLangCodes } = require('../src/config/languageInventory');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

const defaultLang = getDefaultLanguage().code;
const allLangs = getActiveLangCodes();
const languages = allLangs.filter(l => l !== defaultLang);
const localesDir = path.join(__dirname, '../locales');
const englishLang = allLangs.includes('en') ? 'en' : allLangs[0]; // Use first active language if EN not available

let totalFiles = 0;
let filesChecked = 0;
let filesWithIssues = 0;
const issueDetails = [];

// Get all namespace files from default language directory
const defaultDir = path.join(localesDir, defaultLang);
const namespaces = fs.readdirSync(defaultDir)
  .filter(file => file.endsWith('.json'))
  .map(file => file.replace('.json', ''));

console.log(`\n${CLI_SYMBOLS.search} Verifying ${languages.length} languages against ${namespaces.length} namespace files...`);
console.log(`${CLI_SYMBOLS.openFolder} Scanning: ${languages.join(', ')}\n`);

languages.forEach(lang => {
  const langDir = path.join(localesDir, lang);
  
  namespaces.forEach(namespace => {
    totalFiles++;
    const filePath = path.join(langDir, `${namespace}.json`);
    
    if (!fs.existsSync(filePath)) {
      issueDetails.push(`${CLI_SYMBOLS.error} MISSING: ${lang}/${namespace}.json`);
      filesWithIssues++;
      return;
    }
    
    filesChecked++;
    
    try {
      const langContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const enContent = JSON.parse(fs.readFileSync(
        path.join(localesDir, englishLang, `${namespace}.json`),
        'utf-8'
      ));
      
      // Check if all values are identical to English (which would indicate fake translation)
      let identicalKeyCount = 0;
      let totalKeyCount = Object.keys(langContent).length;
      
      Object.keys(langContent).forEach(key => {
        if (langContent[key] === enContent[key]) {
          identicalKeyCount++;
        }
      });
      
      // If more than 80% of keys are identical to English, flag it
      const identicalRatio = identicalKeyCount / totalKeyCount;
      if (identicalRatio > 0.8) {
        issueDetails.push(
          `${CLI_SYMBOLS.warning}  SUSPICIOUS: ${lang}/${namespace}.json - ${identicalKeyCount}/${totalKeyCount} keys (${(identicalRatio * 100).toFixed(1)}%) identical to English`
        );
        filesWithIssues++;
      }
      
    } catch (error) {
      issueDetails.push(`${CLI_SYMBOLS.error} ERROR: ${lang}/${namespace}.json - ${error.message}`);
      filesWithIssues++;
    }
  });
});

console.log(`\n${CLI_SYMBOLS.chart} VERIFICATION RESULTS`);
console.log(CLI_SYMBOLS.heavyDivider.repeat(31));
console.log(`Total Files Scanned: ${filesChecked}/${totalFiles}`);
console.log(`Files with Issues: ${filesWithIssues}`);
console.log(`Success Rate: ${((filesChecked - filesWithIssues) / filesChecked * 100).toFixed(1)}%`);

if (issueDetails.length > 0) {
  console.log(`\n${CLI_SYMBOLS.alert} ISSUES FOUND:`);
  console.log(CLI_SYMBOLS.heavyDivider.repeat(31));
  issueDetails.forEach(detail => console.log(detail));
  console.log(`\n${CLI_SYMBOLS.error} VERIFICATION FAILED - Found ${filesWithIssues} file(s) with issues`);
  process.exit(1);
} else {
  console.log(`\n${CLI_SYMBOLS.success} VERIFICATION PASSED - All files have proper translations!`);
  console.log(`${CLI_SYMBOLS.sparkles} No "ruột value giả" (fake English-only content) detected`);
  process.exit(0);
}
