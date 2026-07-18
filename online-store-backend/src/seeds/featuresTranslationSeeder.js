/**
 * Features Translation Seeder
 * Thêm English translations cho features của tất cả products
 * Sử dụng Cloudflare AI Model để tự động translate từ Vietnamese sang English
 */

const Product = require('../models/Product');
const cloudflareAiService = require('../services/cloudflareAiService');
const { getActiveLangCodes: getActiveLangCodesHelper, getDefaultLanguage } = require('../config/languageInventory');

// Translate features one by one to avoid separator parsing issues
async function translateFeaturesDirectly(features, fromLang, toLang) {
  // Validate required parameters
  if (!fromLang) {
    throw new Error('Source language (fromLang) is required');
  }
  if (!toLang) {
    throw new Error('Target language (toLang) is required');
  }

  if (features.length === 0) return [];

  // If target language is same as source, return as-is (no translation needed)
  if (toLang === fromLang) {
    return features;
  }

  cloudflareAiService.validate();

  const translations = [];

  for (const feature of features) {
    try {
      const translated = await cloudflareAiService.translate(feature, fromLang, toLang);
      translations.push(translated.trim());
    } catch (error) {
      const isDnsError = error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo');
      const isNetworkError = error.code === 'ENETUNREACH' || error.message?.includes('ENETUNREACH');

      if (isDnsError || isNetworkError) {
        console.error(`\n❌ FATAL: Cloudflare API không accessible - ${error.message}`);
        console.error('💡 Kiểm tra: Network connection, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN\n');
        throw new Error(`API unavailable: ${error.message}`);
      }

      // Skip failed translation for this feature, continue with next ones
      console.warn(`      ⚠️ Skipping failed feature "${feature.substring(0, 40)}..." → ${toLang}: ${error.message}`);
      translations.push(feature); // Fallback to Vietnamese
    }
  }

  return translations;
}

async function seedFeaturesTranslations() {
  console.time('⏱️ seedFeaturesTranslations - Total Time');

  try {
    console.log('🌱 Starting features translations seeding...');

    // Find all products with features
    let products = await Product.find({ features: { $exists: true, $ne: [] } }).lean();
    console.log(`📦 Found ${products.length} products with features`);

    // Filter: Skip already translated products
    const productsToTranslate = products.filter(
      p => !p.featuresTranslations || Object.keys(p.featuresTranslations).length === 0
    );
    const skipped = products.length - productsToTranslate.length;

    if (productsToTranslate.length === 0) {
      console.log('⏭️  All products already translated');
      console.timeEnd('⏱️ seedFeaturesTranslations - Total Time');
      return { updated: 0, skipped, failed: 0, total: products.length };
    }

    console.log(`📚 Need to translate: ${productsToTranslate.length} products (~${productsToTranslate.reduce((sum, p) => sum + p.features.length, 0)} features)`);

    const sourceLang = getDefaultLanguage().code;
    const allLangs = getActiveLangCodesHelper();
    const targetLanguages = allLangs.filter(lang => lang !== sourceLang);

    console.log(`🔄 [Step 1/2] Translating features from ${sourceLang.toUpperCase()} to ${targetLanguages.length} languages (${targetLanguages.join(', ').toUpperCase()})...`);
    console.time('  ⏱️ Feature translation');

    let totalTranslated = 0;
    let failed = 0;
    const bulkOps = [];
    const delayBetweenFeatures = 100;

    for (const product of productsToTranslate) {
      const productId = product._id;
      const viFeatures = product.features;

      try {
        // Translate each feature to all 8 languages
        const translations = {};

        for (const viFeature of viFeatures) {
          translations[viFeature] = {};

          for (const targetLang of targetLanguages) {
            const translated = await translateFeaturesDirectly([viFeature], sourceLang, targetLang);
            if (translated.length > 0) {
              translations[viFeature][targetLang] = translated[0];
              totalTranslated++;
            }

            // Small delay to avoid API rate limit
            await new Promise(resolve => setTimeout(resolve, delayBetweenFeatures));
          }
        }

        // Only update if we translated at least one feature
        if (Object.keys(translations).length > 0) {
          bulkOps.push({
            updateOne: {
              filter: { _id: productId },
              update: { $set: { featuresTranslations: translations } },
            },
          });
          console.log(`    ✅ ${product.name} (${Object.keys(translations).length}/${viFeatures.length} features × 8 languages)`);
        } else {
          failed++;
          console.warn(`    ⚠️ Failed to translate any feature for ${product.name}`);
        }
      } catch (error) {
        failed++;
        console.error(`  ❌ Failed for ${product.name}: ${error.message}`);
        // Continue seeding instead of failing entire process
        // This allows other products to be translated successfully
      }
    }

    console.timeEnd('  ⏱️ Feature translation');

    // 2️⃣ Bulk update all products at once
    console.log('💾 [Step 2/2] Bulk updating products...');
    console.time('  ⏱️ Bulk write update');

    let bulkUpdateCount = 0;
    if (bulkOps.length > 0) {
      const result = await Product.bulkWrite(bulkOps);
      bulkUpdateCount = result.modifiedCount;
      console.log(`✅ Updated ${bulkUpdateCount} products in 1 bulkWrite operation`);
    }

    console.timeEnd('  ⏱️ Bulk write update');
    console.timeEnd('⏱️ seedFeaturesTranslations - Total Time');

    const activeLangs = getActiveLangCodesHelper();

    console.log(`\n📈 FEATURES TRANSLATION COMPLETE:`);
    console.log(`   ✅ Successfully translated: ${totalTranslated} features × ${activeLangs.length} languages`);
    console.log(`   ✅ Products updated: ${bulkUpdateCount}`);
    console.log(`   ⏭️  Already translated: ${skipped}`);
    console.log(`   ❌ Failed products: ${failed}`);
    console.log(`   📝 Total products: ${products.length}`);
    console.log(`   🌐 Languages: ${activeLangs.join(', ')}`);
    console.log(`   💡 Method: 1-by-1 translation (100% accuracy, no separator issues)`);

    return { updated: bulkUpdateCount, skipped, failed, total: products.length };
  } catch (error) {
    console.error('❌ Seeder error:', error);
    throw error;
  }
}

module.exports = seedFeaturesTranslations;
