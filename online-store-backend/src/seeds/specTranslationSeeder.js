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
const { SUPPORTED_LANGUAGES, getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');

// Load specKeyTranslations
let specKeyTranslations = {};
const specKeyPath = path.join(__dirname, '../data/specKeyTranslations.json');
if (fs.existsSync(specKeyPath)) {
  specKeyTranslations = JSON.parse(fs.readFileSync(specKeyPath, 'utf-8'));
}

const BATCH_SIZE = 100;
const SOURCE_LANG_CODE = getDefaultLanguage().code;
const TRANSLATED_LANG_CODES = SUPPORTED_LANGUAGES
  .map(({ code }) => code)
  .filter((code) => code !== SOURCE_LANG_CODE);

/**
 * Aggregate product specs từ multiple LiveTranslationCache rows
 * thành 1 ProductCatalogTranslationCache document
 */
async function seedSpecTranslations(repairAttempt = 0) {
  const timerLabel = `${CLI_SYMBOLS.duration} seedSpecTranslations - Total Time${repairAttempt ? ` (repair ${repairAttempt})` : ''}`;
  const batchTimerLabel = `  ${CLI_SYMBOLS.duration} Batch insertion${repairAttempt ? ` (repair ${repairAttempt})` : ''}`;
  console.time(timerLabel);

  try {
    console.log(`${CLI_SYMBOLS.seed} Starting spec translation aggregation...\n`);

    // Step 1: Load the complete product and language matrix.
    console.log(`${CLI_SYMBOLS.books} Step 1: Querying products and approved translations...`);

    const [products, allRecords] = await Promise.all([
      Product.find({ isDeleted: false }).select('_id name description brand specs').lean(),
      LiveTranslationCache.find({
        entityType: { $in: ['product_spec', 'product_name', 'product_description'] },
        status: 'success',
        qualityStatus: 'approved',
        targetLang: { $in: TRANSLATED_LANG_CODES },
      }).lean(),
    ]);

    console.log(`  Found ${products.length} products and ${allRecords.length} approved translation records\n`);

    if (products.length === 0) {
      console.log(`${CLI_SYMBOLS.skip}  No products found`);
      console.timeEnd(timerLabel);
      return { aggregated: 0, skipped: 0, failed: 0, total: 0, complete: true };
    }

    // Step 2: Group approved records by entityId + targetLang.
    console.log(`${CLI_SYMBOLS.package} Step 2: Grouping records by the full product-language matrix...`);

    const grouped = new Map();
    for (const product of products) {
      for (const targetLang of TRANSLATED_LANG_CODES) {
        grouped.set(`${product._id}:${targetLang}`, {
          entityId: product._id.toString(),
          targetLang,
          specs: {},
          name: null,
          description: null,
          brand: product.brand || null,
          status: 'success',
          qualityStatus: 'pending',
          qualityScore: 0,
          validationErrors: ['missing_translation_records'],
          retryCount: 0,
          lastErrorMessage: null,
          lastRetryAt: null,
        });
      }
    }

    for (const doc of allRecords) {
      const group = grouped.get(`${doc.entityId}:${doc.targetLang}`);
      if (!group) continue;

      if (doc.entityType === 'product_name') {
        group.name = doc.translatedText;
      } else if (doc.entityType === 'product_description') {
        group.description = doc.translatedText;
      } else if (doc.entityType === 'product_spec' && doc.specKey) {
        const canonicalKey = getCanonicalSpecKey(doc.specKey);
        if (canonicalKey) group.specs[canonicalKey] = doc.translatedText;
      }
    }

    const translatedByText = new Map(
      allRecords.map(record => [`${record.originalText}:${record.targetLang}`, record.translatedText])
    );

    for (const product of products) {
      for (const targetLang of TRANSLATED_LANG_CODES) {
        const group = grouped.get(`${product._id}:${targetLang}`);
        if (!group) continue;

        group.name ||= translatedByText.get(`${product.name}:${targetLang}`) || null;
        group.description ||= translatedByText.get(`${product.description}:${targetLang}`) || null;

        for (const [specKey, value] of Object.entries(product.specs || {})) {
          if (typeof value !== 'string' || !value.trim()) continue;
          const translatedValue = translatedByText.get(`${value}:${targetLang}`);
          if (translatedValue) {
            const canonicalKey = getCanonicalSpecKey(specKey);
            if (canonicalKey) group.specs[canonicalKey] = translatedValue;
          }
        }
      }
    }

    const groupedCount = grouped.size;
    console.log(`  Prepared ${groupedCount} product-language combinations\n`);

    // Step 3: Upsert every product-language combination and validate completeness.
    console.log(`${CLI_SYMBOLS.save} Step 3: Backfilling ProductCatalogTranslationCache (batch mode)...`);
    console.time(batchTimerLabel);

    let batchCount = 0;
    let aggregatedCount = 0;
    const entries = [...grouped.values()];
    const sourceProductById = new Map(products.map((product) => [product._id.toString(), product]));

    entries.forEach((entry) => {
      const sourceProduct = sourceProductById.get(entry.entityId);
      const sourceSpecKeys = Object.keys(sourceProduct?.specs || {}).filter((key) => {
        const value = sourceProduct.specs[key];
        return typeof value === 'string' && value.trim();
      });
      const translatedSpecKeys = new Set(Object.entries(entry.specs)
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .map(([key]) => getCanonicalSpecKey(key)));
      const missingSpec = sourceSpecKeys.some((key) => (
        !translatedSpecKeys.has(getCanonicalSpecKey(key))
      ));
      const validationErrors = [];
      const hasSourceDescription = typeof sourceProduct?.description === 'string'
        && sourceProduct.description.trim();

      entry.brand = sourceProduct?.brand || null;
      if (!String(entry.name || '').trim()) validationErrors.push('missing_name');
      if (hasSourceDescription && !String(entry.description || '').trim()) {
        validationErrors.push('missing_description');
      }
      if (missingSpec) validationErrors.push('incomplete_specs');

      entry.validationErrors = validationErrors;
      entry.qualityStatus = validationErrors.length > 0 ? 'pending' : 'approved';
      entry.qualityScore = validationErrors.length > 0 ? 0 : 100;
    });

    const incompleteEntries = entries.filter((entry) => entry.qualityStatus !== 'approved');
    if (incompleteEntries.length > 0 && repairAttempt === 0) {
      console.log(`  ${CLI_SYMBOLS.progress} Retrying ${incompleteEntries.length} incomplete product-language translation(s)...`);
      for (const entry of incompleteEntries) {
        const sourceProduct = sourceProductById.get(entry.entityId);
        if (sourceProduct) {
          await ProductTranslationSeederService._translateProduct(
            sourceProduct,
            entry.targetLang,
            SOURCE_LANG_CODE,
            0
          );
        }
      }
      return seedSpecTranslations(1);
    }

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const operations = batch.map(entry => ({
        updateOne: {
          filter: { entityId: entry.entityId, targetLang: entry.targetLang },
          update: entry.qualityStatus === 'approved'
            ? { $set: entry }
            : { $setOnInsert: entry },
          upsert: true,
        }
      }));

      try {
        const result = await ProductCatalogTranslationCache.bulkWrite(operations);
        batchCount++;
        aggregatedCount += result.upsertedCount || 0;

        console.log(`  ${CLI_SYMBOLS.success} Batch ${batchCount}: ${result.upsertedCount || 0} inserted, ${(result.matchedCount || 0) + (result.modifiedCount || 0)} existing preserved`);
      } catch (error) {
        console.error(`  ${CLI_SYMBOLS.error} Batch ${batchCount} failed: ${error.message}`);
        throw error;
      }
    }

    console.timeEnd(batchTimerLabel);

    // Step 5: Verify aggregation
    console.log(`\n${CLI_SYMBOLS.success} Step 5: Verification...`);

    const productIds = products.map((product) => product._id.toString());
    const verifyByLang = {};
    for (const lang of TRANSLATED_LANG_CODES) {
      const count = await ProductCatalogTranslationCache.countDocuments({
        entityId: { $in: productIds },
        targetLang: lang,
        status: 'success',
        qualityStatus: 'approved',
      });
      verifyByLang[lang] = count;
    }

    console.log('  Approved product records per language:');
    TRANSLATED_LANG_CODES.forEach(lang => {
      const total = verifyByLang[lang];
      console.log(`    ${lang.padEnd(4)} ${CLI_SYMBOLS.arrowRight} ${total}/${products.length}`);
    });

    if (incompleteEntries.length > 0 || TRANSLATED_LANG_CODES.some((lang) => verifyByLang[lang] !== products.length)) {
      const error = `Product translation catalog incomplete: ${incompleteEntries.length}/${entries.length} product-language records need attention`;
      console.error(`  ${CLI_SYMBOLS.error} ${error}`);
      console.error(`  ${CLI_SYMBOLS.warning} Seed không được coi là thành công khi thiếu bản dịch hoặc validation chưa đạt.`);
      throw new Error(error);
    }

    // Sample verification: pick 1 random product and display
    const sampleProduct = await ProductCatalogTranslationCache.findOne({
      status: 'success',
      qualityStatus: 'approved'
    }).lean();

    if (sampleProduct) {
      console.log(`\n${CLI_SYMBOLS.list} Sample Product (English):`);
      console.log(`  ID: ${sampleProduct.entityId}`);
      console.log(`  Name: ${sampleProduct.name}`);
      console.log(`  Specs: ${JSON.stringify(sampleProduct.specs)}`);
    }

    console.log(`\n${CLI_SYMBOLS.success} Seeding completed successfully!\n`);
    console.timeEnd(timerLabel);

    return {
      aggregated: aggregatedCount,
      skipped: entries.length - aggregatedCount,
      total: entries.length,
      byLanguage: verifyByLang,
    };
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Fatal Error:`, error.message);
    console.timeEnd(timerLabel);
    throw error;
  }
}

module.exports = seedSpecTranslations;
