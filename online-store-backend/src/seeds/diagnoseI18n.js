/**
 * Diagnostic Script - Kiểm tra trạng thái hệ thống i18n
 * Chạy: node src/seeds/diagnoseI18n.js
 * 
 * Kiểm tra:
 * 1. Database connections & query StaticTranslation collection
 * 2. API endpoint response
 * 3. Frontend fetch cache status
 */

require('dotenv').config();
const mongoose = require('mongoose');
const StaticTranslation = require('../models/StaticTranslation');
const { getActiveLangCodes } = require('../config/languageInventory');

const diagnose = async () => {
  try {

    // ============ STEP 1: Database Connection & Data Check ============

    if (!process.env.MONGO_URI) {
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    // Count collections
    const allTranslations = await StaticTranslation.find({});

    if (allTranslations.length === 0) {
    } else {
      // Show breakdown by language & namespace
      const breakdown = {};
      allTranslations.forEach(doc => {
        const key = `${doc.code}/${doc.namespace}`;
        breakdown[key] = Object.keys(doc.translations || {}).length;
      });

      Object.entries(breakdown).forEach(([key, count]) => {
      });

      // Sample a key
      const sample = allTranslations[0];
      const sampleKey = Object.keys(sample.translations || {})[0];
    }

    // ============ STEP 2: Check specific locales needed by Frontend ============

    const activeLangs = getActiveLangCodes();
    const requiredLocales = activeLangs.flatMap(lang => [
      { code: lang, namespace: 'common' },
      { code: lang, namespace: 'products' },
    ]);

    let allFound = true;
    for (const req of requiredLocales) {
      const doc = await StaticTranslation.findOne({
        code: req.code,
        namespace: req.namespace,
      });

      if (doc) {
        const keyCount = Object.keys(doc.translations || {}).length;
      } else {
        allFound = false;
      }
    }

    // ============ STEP 3: Check if footer keys exist in default language/common ============

    const defaultLang = getDefaultLanguage().code;
    const defaultLangCommon = await StaticTranslation.findOne({
      code: defaultLang,
      namespace: 'common',
    });

    if (defaultLangCommon) {
      const footerKeys = [
        'footer.description',
        'footer.newsletter.emailLabel',
        'footer.newsletter.phoneLabel',
        'footer.newsletter.subscribe',
        'footer.aboutUs',
        'footer.contactUs',
        'footer.shippingPartners',
        'footer.paymentMethods',
        'footer.downloadApp',
      ];

      let foundCount = 0;
      let missingKeys = [];

      footerKeys.forEach(key => {
        if (viCommon.translations?.[key]) {
          foundCount++;
        } else {
          missingKeys.push(key);
        }
      });


      if (missingKeys.length > 0) {
      }
    } else {
    }

    // ============ STEP 4: Recommendations ============

    if (allTranslations.length === 0) {
    } else if (!allFound) {
    } else {
    }




    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

diagnose();
