#!/usr/bin/env node

/**
 * Script kiểm tra luồng thêm ngôn ngữ mới và dịch tự động
 * Sử dụng: node test-languages-flow.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Language = require('../models/Language');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const Product = require('../models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-store';
const { getActiveLangCodes } = require('../config/languageInventory');

async function testLanguagesFlow() {
  try {
    await mongoose.connect(MONGO_URI);

    // 1. Check existing languages
    const existingLanguages = await Language.find();

    // 2. Check system default language
    const defaultLang = await Language.findOne({ isSystemDefault: true });

    // 3. Check available products
    const totalProducts = await Product.countDocuments({});
    const sampleProduct = await Product.findOne().lean();

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
    activeLangs.forEach((code) => {
      const isAdded = existingLanguages.some(l => l.code === code);
      const status = isAdded ? '✅ Added' : '❌ Not added';
    });


  } catch (error) {
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testLanguagesFlow();
