/**
 * Spec Translation Seeder
 * Gom dữ liệu spec translations từ LiveTranslationCache
 * sang ProductCatalogTranslationCache (aggregated format)
 *
 * Thực thi AFTER products được translated bởi translationSeederHelper
 * (Nó lưu tạm thời trong LiveTranslationCache)
 *
 * Mục đích:
 * - Aggregate tất cả spec values + keys (dịch) thành 1 doc per product+lang
 * - Chuyển từ format: { entityId, entityType: 'product_spec', specKey, translatedText }
 *         sang: { entityId, specs: { "Color": "Gray", "RAM": "16GB" } }
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const Product = require('../models/Product');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

// Load specKeyTranslations
let specKeyTranslations = {};
const specKeyPath = path.join(__dirname, '../data/specKeyTranslations.json');
if (fs.existsSync(specKeyPath)) {
  specKeyTranslations = JSON.parse(fs.readFileSync(specKeyPath, 'utf-8'));
}

const BATCH_SIZE = 100;
const SUPPORTED_LANGUAGES = getActiveLangCodes();

/**
 * Aggregate product specs từ multiple LiveTranslationCache rows
 * thành 1 ProductCatalogTranslationCache document
 */
async function seedSpecTranslations() {
  console.time(`${CLI_SYMBOLS.duration} seedSpecTranslations - Total Time`);

  try {
    console.log(`${CLI_SYMBOLS.seed} Starting spec translation aggregation...\n`);

    // Step 1: Get all product_spec + product_feature records from LiveTranslationCache
    console.log(`${CLI_SYMBOLS.books} Step 1: Querying LiveTranslationCache for product translations...`);

    const allRecords = await LiveTranslationCache.find({
      entityType: { $in: ['product_spec', 'product_feature', 'product_name', 'product_description', 'product_brand'] }
    }).lean();

    console.log(`  Found ${allRecords.length} translation records\n`);

    if (allRecords.length === 0) {
      console.log(`${CLI_SYMBOLS.skip}  No translations found in LiveTranslationCache`);
      console.timeEnd(`${CLI_SYMBOLS.duration} seedSpecTranslations - Total Time`);
      return { aggregated: 0, skipped: 0, failed: 0, total: 0 };
    }

    // Step 2: Group by entityId + targetLang
    console.log(`${CLI_SYMBOLS.package} Step 2: Grouping records by entityId + targetLang...`);

    const grouped = {};
    for (const doc of allRecords) {
      const key = `${doc.entityId}:${doc.targetLang}`;
      if (!grouped[key]) {
        grouped[key] = {
          entityId: doc.entityId,
          targetLang: doc.targetLang,
          specs: {},
          features: [],
          name: null,
          description: null,
          brand: null,
          status: 'success',
          retryCount: 0,
          lastErrorMessage: null,
          lastRetryAt: null,
        };
      }

      const group = grouped[key];

      // Map entity type to field
      if (doc.entityType === 'product_name') {
        group.name = doc.translatedText;
      } else if (doc.entityType === 'product_description') {
        group.description = doc.translatedText;
      } else if (doc.entityType === 'product_brand') {
        group.brand = doc.translatedText;
      } else if (doc.entityType === 'product_spec' && doc.specKey) {
        // Lookup translated key from specKeyTranslations
        const translatedKey = specKeyTranslations[doc.specKey]?.[doc.targetLang] || doc.specKey;
        group.specs[translatedKey] = doc.translatedText;
      } else if (doc.entityType === 'product_feature') {
        group.features.push(doc.translatedText);
      }
    }

    const groupedCount = Object.keys(grouped).length;
    console.log(`  Grouped into ${groupedCount} product-language combinations\n`);

    // Step 3: Batch insert into ProductCatalogTranslationCache
    console.log(`${CLI_SYMBOLS.save} Step 3: Writing to ProductCatalogTranslationCache (batch mode)...`);
    console.time(`  ${CLI_SYMBOLS.duration} Batch insertion`);

    let batchCount = 0;
    let aggregatedCount = 0;
    const entries = Object.values(grouped);

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const operations = batch.map(entry => ({
        updateOne: {
          filter: { entityId: entry.entityId, targetLang: entry.targetLang },
          update: { $set: entry },
          upsert: true,
        }
      }));

      try {
        const result = await ProductCatalogTranslationCache.bulkWrite(operations);
        batchCount++;
        aggregatedCount += result.upsertedCount + result.modifiedCount;

        console.log(`  ${CLI_SYMBOLS.success} Batch ${batchCount}: ${batch.length} documents written`);
      } catch (error) {
        console.error(`  ${CLI_SYMBOLS.error} Batch ${batchCount} failed: ${error.message}`);
        throw error;
      }
    }

    console.timeEnd(`  ${CLI_SYMBOLS.duration} Batch insertion`);

    // Step 5: Verify aggregation
    console.log(`\n${CLI_SYMBOLS.success} Step 5: Verification...`);

    const verifyByLang = {};
    const verifyWithCategoryName = {};
    for (const lang of SUPPORTED_LANGUAGES) {
      const count = await ProductCatalogTranslationCache.countDocuments({
        targetLang: lang,
        status: 'success'
      });
      verifyByLang[lang] = count;
    }

    console.log('  Total records per language:');
    SUPPORTED_LANGUAGES.forEach(lang => {
      const total = verifyByLang[lang];
      console.log(`    ${lang.padEnd(4)} ${CLI_SYMBOLS.arrowRight} ${total} products`);
    });

    // Sample verification: pick 1 random product and display
    const sampleProduct = await ProductCatalogTranslationCache.findOne({
      status: 'success'
    }).lean();

    if (sampleProduct) {
      console.log(`\n${CLI_SYMBOLS.list} Sample Product (English):`);
      console.log(`  ID: ${sampleProduct.entityId}`);
      console.log(`  Name: ${sampleProduct.name}`);
      console.log(`  Specs: ${JSON.stringify(sampleProduct.specs)}`);
      if (sampleProduct.features.length > 0) {
        console.log(`  Features: [${sampleProduct.features.slice(0, 2).join(', ')}...]`);
      }
    }

    console.log(`\n${CLI_SYMBOLS.success} Seeding completed successfully!\n`);
    console.timeEnd(`${CLI_SYMBOLS.duration} seedSpecTranslations - Total Time`);

    return {
      aggregated: aggregatedCount,
      total: entries.length,
      byLanguage: verifyByLang,
    };
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Fatal Error:`, error.message);
    console.timeEnd(`${CLI_SYMBOLS.duration} seedSpecTranslations - Total Time`);
    throw error;
  }
}

module.exports = seedSpecTranslations;
