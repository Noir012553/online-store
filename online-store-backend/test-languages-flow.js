#!/usr/bin/env node

/**
 * Script kiểm tra luồng thêm ngôn ngữ mới và dịch tự động
 * Sử dụng: node test-languages-flow.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Language = require('./src/models/Language');
const LiveTranslationCache = require('./src/models/LiveTranslationCache');
const Product = require('./src/models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-store';

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
      id: sampleProduct?._id,
      name: sampleProduct?.name?.substring(0, 50),
      hasDescription: !!sampleProduct?.description,
    });

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
    const SUPPORTED_LANGUAGES = {
      en: 'English',
      ja: 'Japanese',
      zh: 'Chinese',
      ko: 'Korean',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      th: 'Thai',
    };
    Object.entries(SUPPORTED_LANGUAGES).forEach(([code, name]) => {
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
