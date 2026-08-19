#!/usr/bin/env node

/**
 * Script kiểm tra luồng thêm ngôn ngữ mới và dịch tự động
 * Sử dụng: node test-languages-flow.js
 */

require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Language = require('../models/Language');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const Product = require('../models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-store';
const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

async function testLanguagesFlow() {
  try {
    await mongoose.connect(MONGO_URI);

    // 1. Check existing languages
    const existingLanguages = await Language.find();

    // 2. Check system default language
    const defaultLang = await Language.findOne({ isSystemDefault: true });
    assert.equal(defaultLang?.code, getDefaultLanguage().code);

    // 3. Check available products
    const totalProducts = await Product.countDocuments({ isDeleted: false });
    assert.ok(totalProducts > 0, 'No active products are available');

    // 4. Check translation cache
    const cacheStats = await LiveTranslationCache.aggregate([
      {
        $group: {
          _id: '$targetLang',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // 5. Validate SUPPORTED_LANGUAGES in controller
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    } else {
    }

    // 6. Test supported languages list
    const activeLangs = getActiveLangCodes();
    const existingLanguageCodes = new Set(existingLanguages.map(({ code }) => code));
    const missingLanguages = activeLangs.filter((code) => !existingLanguageCodes.has(code));
    assert.deepEqual(missingLanguages, [], `Missing active languages: ${missingLanguages.join(', ')}`);

    const unsupportedCacheLanguages = cacheStats
      .map(({ _id: code }) => code)
      .filter((code) => !activeLangs.includes(code));
    assert.deepEqual(
      unsupportedCacheLanguages,
      [],
      `Translation cache contains unsupported languages: ${unsupportedCacheLanguages.join(', ')}`
    );


  } catch (error) {
    console.error(`[LanguageFlowTest] ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testLanguagesFlow();
