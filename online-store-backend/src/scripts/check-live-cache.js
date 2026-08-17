require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const count = await LiveTranslationCache.countDocuments();
  console.log(`${CLI_SYMBOLS.chart} LiveTranslationCache records:`, count);
  
  const productNameCount = await LiveTranslationCache.countDocuments({ entityType: 'product_name' });
  console.log('   Product names:', productNameCount);
  
  const sample = await LiveTranslationCache.findOne({ entityType: 'product_name' }).lean();
  if (sample) {
    console.log('\nSample product_name record:');
    console.log(JSON.stringify(sample, null, 2).substring(0, 800));
  } else {
    console.log('\nNo product_name records found');
  }
  
  await mongoose.disconnect();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
