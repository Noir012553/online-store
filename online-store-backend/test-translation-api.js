/**
 * Test script to verify on-the-fly translation logic
 */
const mongoose = require('mongoose');
require('dotenv').config();

const translationController = require('./src/controllers/translationController');
const LiveTranslationCache = require('./src/models/LiveTranslationCache');
const Product = require('./src/models/Product');

async function testTranslationAPI() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laptop-store-dev');

    // Get a product ID
    const product = await Product.findOne().lean();
    if (!product) {
      process.exit(1);
    }

    // Clear cache for this product to test on-the-fly translation
    const deleted = await LiveTranslationCache.deleteMany({
      entityId: product._id.toString(),
      targetLang: 'en',
    });

    // Create mock request/response objects
    const mockReq = {
      params: { id: product._id.toString() },
      query: { lang: 'en' },
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
        targetLang: 'en',
      });

      if (cachedCount > 0) {
        const sample = await LiveTranslationCache.findOne({
          entityId: product._id.toString(),
          targetLang: 'en',
        }).lean();
      }
    } catch (err) {
    }
  } catch (error) {
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run test
testTranslationAPI();
