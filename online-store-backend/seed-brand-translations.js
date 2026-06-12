require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const seedBrandTranslations = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const StaticTranslation = require('./src/models/StaticTranslation');

    console.log('\n📝 SEEDING BRAND TRANSLATIONS...\n');

    // Load translations from JSON files
    const viProductsPath = path.join(__dirname, 'src/locales/vi/products.json');
    const enProductsPath = path.join(__dirname, 'src/locales/en/products.json');

    const viProducts = JSON.parse(fs.readFileSync(viProductsPath, 'utf-8'));
    const enProducts = JSON.parse(fs.readFileSync(enProductsPath, 'utf-8'));

    // Filter only brand_unknown translation
    const viBrandKeys = Object.keys(viProducts).filter(key => key === 'brand_unknown');
    const enBrandKeys = Object.keys(enProducts).filter(key => key === 'brand_unknown');

    console.log(`✅ Found brand_unknown translation in both languages`);

    // Build translations object
    const viTranslations = {};
    const enTranslations = {};

    viBrandKeys.forEach(key => {
      viTranslations[key] = viProducts[key];
    });

    enBrandKeys.forEach(key => {
      enTranslations[key] = enProducts[key];
    });

    // Upsert for products namespace
    const viExisting = await StaticTranslation.findOne({ code: 'vi', namespace: 'products' });
    if (viExisting) {
      viExisting.translations = { ...viExisting.translations, ...viTranslations };
      await viExisting.save();
      console.log(`✅ Updated Vietnamese translations`);
    } else {
      await StaticTranslation.create({
        code: 'vi',
        namespace: 'products',
        translations: viTranslations
      });
      console.log(`✅ Created Vietnamese translations`);
    }

    const enExisting = await StaticTranslation.findOne({ code: 'en', namespace: 'products' });
    if (enExisting) {
      enExisting.translations = { ...enExisting.translations, ...enTranslations };
      await enExisting.save();
      console.log(`✅ Updated English translations`);
    } else {
      await StaticTranslation.create({
        code: 'en',
        namespace: 'products',
        translations: enTranslations
      });
      console.log(`✅ Created English translations`);
    }

    const upsertedVi = viBrandKeys.length;
    const upsertedEn = enBrandKeys.length;

    console.log(`\n✨ SEEDING COMPLETE:`);
    console.log(`  • Vietnamese translations upserted: ${upsertedVi}`);
    console.log(`  • English translations upserted: ${upsertedEn}`);
    console.log(`  • Total: ${upsertedVi + upsertedEn}\n`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

seedBrandTranslations();
