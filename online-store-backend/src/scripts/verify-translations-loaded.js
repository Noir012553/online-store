#!/usr/bin/env node

/**
 * Translation Verification Script
 * Verify that all 9 languages can load and retrieve messages correctly
 * 
 * Usage: node src/scripts/verify-translations-loaded.js
 */

const { getMessage, getTranslationStatus, SUPPORTED_LANGS } = require('../i18n/messages');

console.log('\n' + '='.repeat(70));
console.log('🌍 TRANSLATION SYSTEM VERIFICATION');
console.log('='.repeat(70) + '\n');

// Test 1: Check loaded status
const status = getTranslationStatus();
console.log('📊 Translation Status:');
console.log(`   Supported Languages: ${status.supportedLanguages.join(', ').toUpperCase()}`);
console.log(`   Loaded Languages: ${status.loadedLanguages.join(', ').toUpperCase()}`);
console.log(`   Namespaces per language: ${status.totalNamespaces}`);
console.log(`   Total JSON files: ${status.loadedLanguages.length} × ${status.totalNamespaces} = ${status.loadedLanguages.length * status.totalNamespaces}`);

// Test 2: Sample messages from each language
console.log('\n' + '-'.repeat(70));
console.log('✅ Testing Sample Messages (5 key messages per language):');
console.log('-'.repeat(70) + '\n');

const testPaths = [
  'auth-messages.not_authorized',
  'admin-orders.orders_error_product_not_found',
  'products.out_of_stock',
  'auth-messages.email_verification_subject',
  'payment-messages.amount_invalid'
];

const results = {
  success: 0,
  failed: 0,
  warnings: 0,
};

SUPPORTED_LANGS.forEach(lang => {
  console.log(`\n🗣️  ${lang.toUpperCase()}:`);
  
  testPaths.forEach(path => {
    const message = getMessage(lang, path);
    
    // Check if message is valid (not just returning the path)
    const isValid = message && message !== path && message.length > 0;
    
    if (isValid) {
      console.log(`   ✅ ${path}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
      results.success++;
    } else {
      console.log(`   ❌ ${path}: MISSING OR INVALID`);
      results.failed++;
    }
  });
});

// Test 3: Fallback verification
console.log('\n' + '-'.repeat(70));
console.log('🔄 Fallback Chain Verification:');
console.log('-'.repeat(70) + '\n');

// Test a message that should be available in all languages
const fallbackTests = [
  { lang: 'de', path: 'auth-messages.not_authorized', expectedLang: 'DE (or EN fallback)' },
  { lang: 'pt', path: 'auth-messages.not_authorized', expectedLang: 'PT (or EN fallback)' },
  { lang: 'fr', path: 'common.add_to_cart', expectedLang: 'FR (or EN fallback)' }
];

fallbackTests.forEach(test => {
  const message = getMessage(test.lang, test.path);
  if (message !== test.path) {
    console.log(`✅ ${test.lang.toUpperCase()} → ${test.path}: Found in ${test.expectedLang}`);
  } else {
    console.log(`⚠️  ${test.lang.toUpperCase()} → ${test.path}: Not found, fallback failed`);
    results.warnings++;
  }
});

// Test 4: Case insensitivity
console.log('\n' + '-'.repeat(70));
console.log('🔤 Case Insensitivity Test:');
console.log('-'.repeat(70) + '\n');

const { getActiveLangCodes } = require('../config/languageInventory');
const activeLangs = getActiveLangCodes();
const caseTests = activeLangs.slice(0, 4).map(lang => ({
  lang: lang.toUpperCase(),
  expected: lang
}));

caseTests.forEach(test => {
  const msg1 = getMessage(test.lang, 'auth-messages.not_authorized');
  const msg2 = getMessage(test.expected, 'auth-messages.not_authorized');
  
  if (msg1 === msg2 && msg1 !== 'auth-messages.not_authorized') {
    console.log(`✅ Case insensitive: getMessage('${test.lang}', ...) = getMessage('${test.expected}', ...)`);
  } else {
    console.log(`❌ Case insensitivity failed for ${test.lang}`);
    results.failed++;
  }
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('📈 VERIFICATION SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Successful: ${results.success}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`⚠️  Warnings: ${results.warnings}`);

if (results.failed === 0) {
  console.log('\n✨ All translation systems are working correctly!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some translations are missing. Check the JSON files.\n');
  process.exit(1);
}
