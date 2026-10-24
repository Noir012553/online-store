/**
 * Test script to verify on-the-fly translation logic
 */
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const translationController = require('../controllers/translationController');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const Product = require('../models/Product');
const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

async function testTranslationAPI() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/laptop-store-dev');

    const sourceLang = getDefaultLanguage().code;
    const testLang = getActiveLangCodes().find((code) => code !== sourceLang);
    assert.ok(testLang, 'No target language is configured');

    const cachedTranslation = await ProductCatalogTranslationCache.findOne({
      targetLang: testLang,
      status: 'success',
      qualityStatus: 'approved',
    }).lean();
    assert.ok(cachedTranslation, `No approved product translation exists for ${testLang}`);

    const product = await Product.findById(cachedTranslation.entityId).lean();
    assert.ok(product, 'Translation cache points to a missing product');

    // Create mock request/response objects
    const mockReq = {
      params: { id: product._id.toString() },
      query: { lang: testLang },
      lang: testLang,
    };

    const mockRes = {
      _headers: {},
      _json: null,
      _statusCode: 200,

      set: function(key, value) {
        this._headers[key] = value;
        return this;
      },

      status: function(code) {
        this._statusCode = code;
        return this;
      },

      json: function(data) {
        this._json = data;
        return this;
      },
    };

    await translationController.getProductTranslations(mockReq, mockRes);

    assert.equal(mockRes._statusCode, 200);
    assert.equal(mockRes._json?.success, true);
    assert.equal(mockRes._json?.data?.name, cachedTranslation.name);
  } catch (error) {
    console.error(`[TranslationAPITest] ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run test
testTranslationAPI();
