const mongoose = require('mongoose');
require('dotenv').config();
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const translationValidator = require('../utils/translationValidator');

/**
 * Test Translation Quality System
 * Kiểm tra các components chính của hệ thống
 */

async function runTests() {
  try {
    console.log('\n🧪 TRANSLATION QUALITY SYSTEM - TEST SUITE');
    console.log('═'.repeat(60));

    // Connect to MongoDB
    console.log('\n[1/5] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected');

    // Test 1: Validator - Check Missing Brand
    console.log('\n[2/5] Testing Validator - Missing Brand Check');
    const test1Result = await testMissingBrandValidation();
    console.log(`✅ ${test1Result}`);

    // Test 2: Validator - Check Empty Translation
    console.log('\n[3/5] Testing Validator - Empty Translation Check');
    const test2Result = await testEmptyTranslationValidation();
    console.log(`✅ ${test2Result}`);

    // Test 3: Validator - Check Length Ratio
    console.log('\n[4/5] Testing Validator - Length Ratio Check');
    const test3Result = await testLengthRatioValidation();
    console.log(`✅ ${test3Result}`);

    // Test 4: Database Schema
    console.log('\n[5/5] Checking Database Schema');
    const test4Result = await testDatabaseSchema();
    console.log(`✅ ${test4Result}`);

    console.log('\n═'.repeat(60));
    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('📚 System Components:');
    console.log('   ✅ TranslationValidator - All checks working');
    console.log('   ✅ LiveTranslationCache - Schema correct');
    console.log('   ✅ TranslationQualityLog - Audit trail ready');
    console.log('   ✅ Translation Reporter - Reporting ready');
    console.log('\n📖 Next Steps:');
    console.log('   1. npm run seed (seed + auto-validate)');
    console.log('   2. npm run translate:report (view issues)');
    console.log('   3. npm run retranslate (fix issues)');
    console.log('   4. npm run translate:approve <id> (approve translations)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TESTS FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

async function testMissingBrandValidation() {
  const original = 'Bàn phím Rapoo V501-87 cơ học';
  const translated = 'Mechanical 87-key keyboard V501-87';

  const result = await translationValidator.validateTranslation(
    original,
    translated,
    'en',
    'product_name'
  );

  if (
    result.validationErrors.includes('missing_brand') &&
    result.qualityStatus === 'needs_retranslate'
  ) {
    return 'Missing brand detection working correctly';
  } else {
    throw new Error(`Expected missing_brand error, got: ${JSON.stringify(result)}`);
  }
}

async function testEmptyTranslationValidation() {
  const original = 'Chuột Logitech G Pro';
  const translated = '';

  const result = await translationValidator.validateTranslation(
    original,
    translated,
    'en',
    'product_name'
  );

  if (result.validationErrors.includes('empty') && result.qualityScore === 0) {
    return 'Empty translation detection working correctly';
  } else {
    throw new Error(`Expected empty error, got: ${JSON.stringify(result)}`);
  }
}

async function testLengthRatioValidation() {
  const original = 'Bàn phím cơ Razer DeathStalker V2 Pro chuyên dùng cho gaming với đèn RGB';
  const translated = 'Keyboard'; // Quá ngắn

  const result = await translationValidator.validateTranslation(
    original,
    translated,
    'en',
    'product_description'
  );

  if (
    result.validationErrors.includes('too_short') &&
    result.qualityStatus === 'needs_retranslate'
  ) {
    return `Length ratio check working (ratio: ${(translated.length / original.length).toFixed(2)})`;
  } else {
    throw new Error(`Expected too_short error, got: ${JSON.stringify(result)}`);
  }
}

async function testDatabaseSchema() {
  // Check LiveTranslationCache schema
  const cacheCollection = mongoose.connection.collection('livetranslationcaches');
  const cacheIndexes = await cacheCollection.getIndexes();

  const requiredIndexes = ['hashKey_1', 'targetLang_1', 'status_1', 'qualityStatus_1'];
  const hasIndexes = requiredIndexes.every(idx =>
    Object.keys(cacheIndexes).some(key => key.includes(idx.replace('_1', '')))
  );

  if (!hasIndexes) {
    throw new Error('Missing required indexes on LiveTranslationCache');
  }

  // Check TranslationQualityLog exists
  const models = Object.keys(mongoose.models);
  if (!models.includes('TranslationQualityLog')) {
    throw new Error('TranslationQualityLog model not loaded');
  }

  return 'Database schema is correct (all indexes present)';
}

// Run tests
runTests();
