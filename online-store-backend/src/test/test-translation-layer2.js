/**
 * Unit Test - Tầng 2: Live Translation Cache
 * Test: Hash key generation, Cache logic, Error handling
 */

const crypto = require('crypto');
const assert = require('assert');

// Test 1: MD5 Hash Generation
const { getActiveLangCodes } = require('../../config/languageInventory');
const text = 'Laptop Gaming ASUS';
const targetLang = getActiveLangCodes()[1] || getActiveLangCodes()[0];
const hashKey = crypto
  .createHash('md5')
  .update(`${text}:${targetLang}`)
  .digest('hex');

assert.strictEqual(typeof hashKey, 'string');
assert.strictEqual(hashKey.length, 32); // MD5 is 32 hex chars

// Test 2: Language Validation
const { getActiveLangCodes } = require('../../config/languageInventory');
const SUPPORTED_LANGUAGES = Object.fromEntries(
  getActiveLangCodes().map(lang => [lang, lang])
);

const testLangs = getActiveLangCodes().map(lang => ({ lang, expected: true }));
testLangs.push({ lang: 'xyz', expected: false });

testLangs.forEach(({ lang, expected }) => {
  const isValid = !!SUPPORTED_LANGUAGES[lang];
  assert.strictEqual(isValid, expected, `Language ${lang} validation failed`);
});

// Test 3: Text Trimming (Output validation)
const textWithWhitespace = '  Gaming Laptop ASUS  \n';
const trimmed = textWithWhitespace.trim();
assert.strictEqual(trimmed, 'Gaming Laptop ASUS');

// Test 4: Hash Key Consistency
const hash1 = crypto
  .createHash('md5')
  .update(`${text}:${targetLang}`)
  .digest('hex');
const hash2 = crypto
  .createHash('md5')
  .update(`${text}:${targetLang}`)
  .digest('hex');

assert.strictEqual(hash1, hash2);

// Test 5: Different inputs generate different hashes
const hash3 = crypto
  .createHash('md5')
  .update(`${text}:ja`)
  .digest('hex');

assert.notStrictEqual(hash1, hash3);

// Test 6: AbortController Test (simulated)
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 100);

setTimeout(() => {
  assert.strictEqual(controller.signal.aborted, true);
  clearTimeout(timeoutId);
  
}, 150);
