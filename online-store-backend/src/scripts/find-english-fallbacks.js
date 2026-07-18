#!/usr/bin/env node

/**
 * This script identifies which translation files still contain English text
 * instead of proper native translations. Used to track translation progress.
 */

const fs = require('fs');
const path = require('path');
const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);
const LANGUAGES = getActiveLangCodes().filter(l => l !== defaultLang);

function getDefaultLangValues(filename) {
  const filePath = path.join(DEFAULT_DIR, filename);
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return content;
  } catch {
    return null;
  }
}

function getLangValues(lang, filename) {
  const filePath = path.join(LOCALES_DIR, lang, filename);
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return content;
  } catch {
    return null;
  }
}

function compareTranslations(defaultValues, langValues, lang, filename) {
  const fallbackKeys = [];

  for (const key in defaultValues) {
    const defaultValue = defaultValues[key];
    const langValue = langValues?.[key];

    // Check if the language value is identical to default language (indicating no translation)
    if (langValue === defaultValue) {
      fallbackKeys.push(key);
    }
  }

  return fallbackKeys;
}

function main() {
  console.log('\n🔍 TRANSLATION FALLBACK ANALYSIS\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const defaultFiles = fs.readdirSync(DEFAULT_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  let totalFallbackFiles = 0;
  let totalFallbackKeys = 0;
  const langStats = {};

  LANGUAGES.forEach(lang => {
    langStats[lang] = { files: 0, keys: 0 };
  });

  const results = [];

  for (const file of defaultFiles) {
    const defaultValues = getDefaultLangValues(file);
    if (!defaultValues) continue;
    
    let fileHasFallbacks = false;
    
    for (const lang of LANGUAGES) {
      const langValues = getLangValues(lang, file);
      if (!langValues) continue;
      
      const fallbackKeys = compareTranslations(defaultValues, langValues, lang, file);
      
      if (fallbackKeys.length > 0) {
        if (!fileHasFallbacks) {
          results.push({ file, fallbacks: {} });
          fileHasFallbacks = true;
          totalFallbackFiles++;
        }
        
        results[results.length - 1].fallbacks[lang] = fallbackKeys;
        langStats[lang].files++;
        langStats[lang].keys += fallbackKeys.length;
        totalFallbackKeys += fallbackKeys.length;
      }
    }
  }
  
  // Print results
  if (results.length === 0) {
    console.log('✅ EXCELLENT! All translations are complete!');
    console.log('   No English fallbacks detected.\n');
  } else {
    console.log(`⚠️  FOUND ${results.length} FILES WITH ENGLISH FALLBACKS\n`);
    
    for (const result of results) {
      console.log(`📄 ${result.file}`);
      for (const [lang, keys] of Object.entries(result.fallbacks)) {
        console.log(`   ${lang.toUpperCase()}: ${keys.length} keys still in English`);
        if (keys.length <= 5) {
          console.log(`        Keys: ${keys.join(', ')}`);
        } else {
          console.log(`        Keys: ${keys.slice(0, 5).join(', ')}... (+${keys.length - 5} more)`);
        }
      }
      console.log();
    }
  }
  
  // Summary by language
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY BY LANGUAGE\n');
  
  for (const lang of LANGUAGES) {
    const { files, keys } = langStats[lang];
    const percent = ((60 - files) / 60 * 100).toFixed(1);
    const status = files === 0 ? '✅ COMPLETE' : `🔄 ${files} files remaining`;
    console.log(`${lang.toUpperCase()}: ${60 - files}/60 files translated (${percent}%) ${status}`);
    if (keys > 0) {
      console.log(`        → ${keys} keys still using English\n`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📈 OVERALL STATISTICS\n');
  console.log(`Files with fallbacks:    ${totalFallbackFiles}/60 (${(totalFallbackFiles/60*100).toFixed(1)}%)`);
  console.log(`Keys with fallbacks:     ${totalFallbackKeys} out of ~5,500+ total`);
  console.log(`Completion rate:         ${(((5500 - totalFallbackKeys) / 5500) * 100).toFixed(1)}%\n`);
  
  if (results.length === 0) {
    console.log('🎉 ALL TRANSLATIONS COMPLETE! Ready for production.\n');
    process.exit(0);
  } else {
    console.log(`⏳ ${totalFallbackFiles} files still need translation\n`);
    process.exit(1);
  }
}

main();
