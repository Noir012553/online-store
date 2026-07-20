require('dotenv').config();
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { getActiveLangCodes } = require('../config/languageInventory');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const LANGS = getActiveLangCodes();
    
    const counts = await ProductCatalogTranslationCache.aggregate([
      { $match: { targetLang: { $in: LANGS } } },
      { $group: { _id: '$targetLang', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const map = Object.fromEntries(LANGS.map(l => [l, 0]));
    counts.forEach(x => { map[x._id] = x.count; });
    
    console.log('\n📊 ProductCatalogTranslationCache - Document count by language:');
    Object.entries(map).forEach(([lang, count]) => {
      console.log(`  ${lang}: ${count}`);
    });
    
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    console.log(`\n  📈 TỔNG: ${total}`);
    
    // Check if there's any data for non-default languages
    const { getDefaultLanguage } = require('../config/languageInventory');
    const defaultLang = getDefaultLanguage().code;
    const nonDefaultLangs = LANGS.filter(l => l !== defaultLang);
    let anyData = false;
    for (const lang of nonDefaultLangs) {
      const count = map[lang];
      if (count > 0) {
        anyData = true;
        break;
      }
    }

    if (!anyData) {
      console.log(`\n❌ Chỉ có dữ liệu cho ${defaultLang.toUpperCase()}, ngôn ngữ khác KHÔNG có dữ liệu!`);
    } else {
      console.log('\n✅ Có dữ liệu cho các ngôn ngữ khác ngoài Tiếng Việt');
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
