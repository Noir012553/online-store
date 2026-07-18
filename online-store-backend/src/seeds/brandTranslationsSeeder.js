require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { getActiveLangCodes } = require('./src/config/languageInventory');

const seedBrandTranslations = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const StaticTranslation = require('./src/models/StaticTranslation');

    console.log('\n📝 SEEDING BRAND TRANSLATIONS...\n');

    // All supported languages from config
    const languages = getActiveLangCodes();
    let totalUpserted = 0;

    for (const lang of languages) {
      const productsPath = path.join(__dirname, `src/locales/${lang}/products.json`);

      if (!fs.existsSync(productsPath)) {
        console.warn(`⚠️  File not found: ${productsPath}`);
        continue;
      }

      const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

      // Filter only brand_unknown translation
      const brandKeys = Object.keys(products).filter(key => key === 'brand_unknown');

      if (brandKeys.length === 0) {
        console.warn(`⚠️  No brand_unknown found in ${lang}`);
        continue;
      }

      // Build translations object
      const translations = {};
      brandKeys.forEach(key => {
        translations[key] = products[key];
      });

      // Upsert for products namespace
      const existing = await StaticTranslation.findOne({ code: lang, namespace: 'products' });
      if (existing) {
        existing.translations = { ...existing.translations, ...translations };
        await existing.save();
        console.log(`✅ Updated ${lang.toUpperCase()} translations`);
      } else {
        await StaticTranslation.create({
          code: lang,
          namespace: 'products',
          translations
        });
        console.log(`✅ Created ${lang.toUpperCase()} translations`);
      }

      totalUpserted += brandKeys.length;
    }

    console.log(`\n✨ SEEDING COMPLETE:`);
    console.log(`  • Total translations upserted: ${totalUpserted}`);
    console.log(`  • Languages processed: ${languages.length}\n`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

seedBrandTranslations();
