/**
 * Features Translation Seeder
 * Thêm English translations cho features của tất cả products
 * Sử dụng Cloudflare AI Model để tự động translate từ Vietnamese sang English
 */

const Product = require('../models/Product');
const cloudflareAiService = require('../services/cloudflareAiService');

// Direct API call - NO internal batching to preserve alignment
async function translateFeaturesDirectly(features, fromLang = 'vi', toLang = 'en') {
  cloudflareAiService.validate();

  if (features.length === 0) return [];

  const separator = '\n[SEP]\n';
  const batchText = features.join(separator);

  try {
    const translatedBatch = await cloudflareAiService.translate(batchText, fromLang, toLang);
    const translations = translatedBatch.split(separator).map(t => t.trim());

    // Validate count matches
    if (translations.length !== features.length) {
      console.warn(`    ⚠️ Mismatch: Expected ${features.length} translations, got ${translations.length}`);
      // Return only what we got (partial results)
      return translations;
    }

    return translations;
  } catch (error) {
    const isDnsError = error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo');
    const isNetworkError = error.code === 'ENETUNREACH' || error.message?.includes('ENETUNREACH');

    if (isDnsError || isNetworkError) {
      console.error(`\n❌ FATAL: Cloudflare API không accessible - ${error.message}`);
      console.error('💡 Kiểm tra: Network connection, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN\n');
      throw new Error(`API unavailable: ${error.message}`);
    }

    throw error;
  }
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

    // 🚀 OPTIMIZATION (Hybrid Batch Strategy):
    // BEFORE: 120 products × 1 API call each = 120 API calls (61s)
    // AFTER: Batch ~100 features per API call = 4-5 API calls (6-7s)
    console.log('🔄 [Step 1/2] Hybrid batch translation (100 features/batch)...');
    console.time('  ⏱️ Batch translation');

    const maxFeaturesPerBatch = 100;
    const maxCharsPerBatch = 2400; // Reserve 100 chars for separators
    const separator = '\n[SEP]\n';
    const delayBetweenBatches = 1500;
    let currentBatch = [];
    let pendingProducts = [];
    let currentBatchChars = 0;
    let totalTranslated = 0;
    let failed = 0;
    const bulkOps = [];

    for (let i = 0; i < productsToTranslate.length; i++) {
      const product = productsToTranslate[i];

      // Store product metadata + feature count for later result mapping
      pendingProducts.push({
        product: product,
        featureCount: product.features.length,
      });

      // Accumulate all features into current batch
      for (const feature of product.features) {
        currentBatch.push(feature);
        currentBatchChars += feature.length + separator.length;
      }

      // Trigger API call when batch size or char limit reached OR last product
      const isLastProduct = i === productsToTranslate.length - 1;
      const batchFull = currentBatch.length >= maxFeaturesPerBatch || currentBatchChars >= maxCharsPerBatch;

      if (batchFull || isLastProduct) {
        const batchLabel = `[Batch ${Math.floor(totalTranslated / maxFeaturesPerBatch) + 1}]`;
        console.log(`📦 ${batchLabel} Sending ${currentBatch.length} features (${currentBatchChars} chars) for ${pendingProducts.length} products...`);

        try {
          // 1️⃣ Call API to translate entire batch (direct, no internal re-batching)
          const translatedBatch = await translateFeaturesDirectly(currentBatch);

          // 2️⃣ Map results back to each product using pointer
          let pointer = 0;
          for (const item of pendingProducts) {
            const count = item.featureCount;
            const productId = item.product._id;
            const viFeatures = item.product.features;

            // Slice translated results for THIS product
            const productTranslations = translatedBatch.slice(pointer, pointer + count);

            // Verify result count matches
            if (productTranslations.length === count) {
              // Build translations map: Vietnamese feature → { en: English translation }
              const translations = {};
              viFeatures.forEach((viFeature, index) => {
                translations[viFeature] = {
                  en: productTranslations[index],
                };
              });

              // Queue for bulk update
              bulkOps.push({
                updateOne: {
                  filter: { _id: productId },
                  update: { $set: { featuresTranslations: translations } },
                },
              });

              totalTranslated += count;
              console.log(`    ✅ ${item.product.name} (${count} features)`);
            } else {
              failed++;
              console.warn(`    ⚠️ Translation mismatch for ${item.product.name}: expected ${count}, got ${productTranslations.length}`);
            }

            // Move pointer to next product's slice
            pointer += count;
          }

          console.log(`  ✅ ${batchLabel} Completed: ${totalTranslated}/${productsToTranslate.reduce((sum, p) => sum + p.features.length, 0)} features translated`);

        } catch (error) {
          failed += pendingProducts.length;
          console.error(`  ❌ ${batchLabel} Failed: ${error.message}`);
          throw error;
        }

        // Reset for next batch
        currentBatch = [];
        pendingProducts = [];
        currentBatchChars = 0;

        // Delay between batches (skip delay after last batch)
        if (!isLastProduct) {
          process.stdout.write(`  ⏳ Waiting ${delayBetweenBatches}ms before next batch...\r`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
    }

    console.timeEnd('  ⏱️ Batch translation');

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

    console.log(`\n📈 FEATURES TRANSLATION COMPLETE:`);
    console.log(`   ✅ Successfully updated: ${bulkUpdateCount}`);
    console.log(`   ⏭️  Already translated: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📝 Total products: ${products.length}`);
    console.log(`   🚀 Optimization: Hybrid batch strategy reduced API calls by ~96% (120 → 4-5 calls)`);

    return { updated: bulkUpdateCount, skipped, failed, total: products.length };
  } catch (error) {
    console.error('❌ Seeder error:', error);
    throw error;
  }
}

module.exports = seedFeaturesTranslations;
