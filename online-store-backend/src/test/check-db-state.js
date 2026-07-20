/**
 * Debug Script: Check Database State
 * Verify:
 * 1. Languages in DB
 * 2. StaticTranslation records
 * 3. LiveTranslationCache records
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Language = require('../models/Language');
const StaticTranslation = require('../models/StaticTranslation');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { getActiveLangCodes } = require('../config/languageInventory');

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check Languages
    console.log('📍 Languages in DB:');
    const languages = await Language.find().lean();
    if (languages.length === 0) {
      console.log('   ❌ No languages found!');
    } else {
      languages.forEach(lang => {
        console.log(`   ${lang.code}: ${lang.name} (active: ${lang.isActive})`);
      });
    }

    // Check StaticTranslation by language
    console.log('\n📚 StaticTranslation records:');
    const langCodes = getActiveLangCodes();
    for (const code of langCodes) {
      const count = await StaticTranslation.countDocuments({ code, isDeleted: false });
      console.log(`   ${code}: ${count} namespaces`);
      
      if (count > 0) {
        const namespaces = await StaticTranslation.find({ code, isDeleted: false }).select('namespace').lean();
        console.log(`       Namespaces: ${namespaces.map(n => n.namespace).join(', ')}`);
      }
    }

    // Check LiveTranslationCache by language
    console.log('\n🔄 LiveTranslationCache records:');
    for (const code of langCodes) {
      const count = await LiveTranslationCache.countDocuments({ targetLang: code });
      console.log(`   ${code}: ${count} cached translations`);
      
      if (count > 0 && count <= 10) {
        const samples = await LiveTranslationCache.find({ targetLang: code }).limit(3).lean();
        samples.forEach(s => {
          console.log(`       - ${s.entityType || 'generic'}: ${s.originalText?.substring(0, 30)}...`);
        });
      }
    }

    console.log('\n✅ Database check completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
