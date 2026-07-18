#!/usr/bin/env node

/**
 * Verify that no JSON files in PT, FR, DE, IT, ES, NL, SV contain only English values
 * This script checks for "ruột value giả" (fake English-only content)
 */

const fs = require('fs');
const path = require('path');
const { getDefaultLanguage, getActiveLangCodes } = require('../src/config/languageInventory');

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

console.log(`\n🔍 Verifying ${languages.length} languages against ${namespaces.length} namespace files...`);
console.log(`📂 Scanning: ${languages.join(', ')}\n`);

languages.forEach(lang => {
  const langDir = path.join(localesDir, lang);
  
  namespaces.forEach(namespace => {
    totalFiles++;
    const filePath = path.join(langDir, `${namespace}.json`);
    
    if (!fs.existsSync(filePath)) {
      issueDetails.push(`❌ MISSING: ${lang}/${namespace}.json`);
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
          `⚠️  SUSPICIOUS: ${lang}/${namespace}.json - ${identicalKeyCount}/${totalKeyCount} keys (${(identicalRatio * 100).toFixed(1)}%) identical to English`
        );
        filesWithIssues++;
      }
      
    } catch (error) {
      issueDetails.push(`❌ ERROR: ${lang}/${namespace}.json - ${error.message}`);
      filesWithIssues++;
    }
  });
});

console.log(`\n📊 VERIFICATION RESULTS`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Total Files Scanned: ${filesChecked}/${totalFiles}`);
console.log(`Files with Issues: ${filesWithIssues}`);
console.log(`Success Rate: ${((filesChecked - filesWithIssues) / filesChecked * 100).toFixed(1)}%`);

if (issueDetails.length > 0) {
  console.log(`\n🚨 ISSUES FOUND:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  issueDetails.forEach(detail => console.log(detail));
  console.log(`\n❌ VERIFICATION FAILED - Found ${filesWithIssues} file(s) with issues`);
  process.exit(1);
} else {
  console.log(`\n✅ VERIFICATION PASSED - All files have proper translations!`);
  console.log(`✨ No "ruột value giả" (fake English-only content) detected`);
  process.exit(0);
}
