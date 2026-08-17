/**
 * Test script to verify on-the-fly translation logic
 */
const mongoose = require('mongoose');
require('dotenv').config();

const translationController = require('../controllers/translationController');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const Product = require('../models/Product');
const { getActiveLangCodes } = require('../config/languageInventory');

async function testTranslationAPI() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/laptop-store-dev');

    // Get a product ID
    const product = await Product.findOne().lean();
    if (!product) {
      process.exit(1);
    }

    const testLang = getActiveLangCodes()[1] || getActiveLangCodes()[0];

    // Clear cache for this product to test on-the-fly translation
    const deleted = await LiveTranslationCache.deleteMany({
      entityId: product._id.toString(),
      targetLang: testLang,
    });

    // Create mock request/response objects
    const mockReq = {
      params: { id: product._id.toString() },
      query: { lang: testLang },
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

    // Call the handler
    try {
      await translationController.getProductTranslations(mockReq, mockRes);

      // Check if cache was saved
      const cachedCount = await LiveTranslationCache.countDocuments({
        entityId: product._id.toString(),
        targetLang: testLang,
      });

      if (cachedCount > 0) {
        const sample = await LiveTranslationCache.findOne({
          entityId: product._id.toString(),
          targetLang: testLang,
        }).lean();
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TranslationAPITest] Error checking cache:', err);
      }
    }
  } catch (error) {
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run test
testTranslationAPI();
