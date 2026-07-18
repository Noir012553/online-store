require('dotenv').config();
const mongoose = require('mongoose');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('📊 Checking translation names...\n');
  
  const shorts = await ProductCatalogTranslationCache.find({ name: { $lt: 'AAA' } }).limit(20).lean();
  console.log(`Found ${shorts.length} records with names < 'AAA':`);
  shorts.forEach(s => {
    console.log(`  [${s.targetLang}] ${s.entityId.substring(0, 8)}... = "${s.name}"`);
  });
  
  const allCount = await ProductCatalogTranslationCache.countDocuments();
  console.log(`\nTotal records: ${allCount}`);
  
  const sample = await ProductCatalogTranslationCache.findOne({ name: { $exists: true } }).lean();
  console.log('\nSample record:');
  console.log(JSON.stringify(sample, null, 2));
  
  await mongoose.disconnect();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
