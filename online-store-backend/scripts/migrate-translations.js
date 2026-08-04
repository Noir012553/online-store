/**
 * Phase 2: Data Migration Script
 * 
 * Mục đích: Gom dữ liệu từ bảng cũ (LiveTranslationCache - 1 dòng/spec)
 *          sang bảng mới (ProductCatalogTranslationCache - gom tất cả specs thành 1 dòng)
 * 
 * Logic:
 * 1. Tìm tất cả entries từ LiveTranslationCache
 * 2. Group by entityId + targetLang + entityType
 * 3. Aggregate specs & features
 * 4. Ghi vào ProductCatalogTranslationCache & UserContentTranslationCache
 * 
 * Safety:
 * - Không xóa dữ liệu cũ (Phase 4 mới xóa)
 * - Upsert (không overwrite nếu đã có)
 * - Log từng batch để track progress
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const LiveTranslationCache = require('../src/models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const UserContentTranslationCache = require('../src/models/UserContentTranslationCache');

const MONGO_URI = process.env.MONGO_URI;
const BATCH_SIZE = 100;
const VERIFY_ONLY = process.argv.includes('--verify-only');

const getContentHash = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const getProductTranslationFields = (translation) => ({
  name: translation.name || null,
  description: translation.description || null,
  brand: translation.brand || null,
  specs: Object.fromEntries(Object.entries(translation.specs || {}).sort(([left], [right]) => left.localeCompare(right))),
  features: translation.features || [],
});

class MigrationService {
  constructor() {
    this.stats = {
      totalProcessed: 0,
      productMigrated: 0,
      userContentMigrated: 0,
      errors: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Aggregate product specs từ multiple rows thành 1 document
   * OLD: [
   *   { entityId: "prod_123", entityType: "product_spec", specKey: "RAM", translatedText: "16GB" },
   *   { entityId: "prod_123", entityType: "product_spec", specKey: "Storage", translatedText: "512GB" }
   * ]
   * NEW: {
   *   entityId: "prod_123",
   *   specs: { "RAM": "16GB", "Storage": "512GB" }
   * }
   */
  async migrateProductTranslations() {
    console.log('\n📦 Migrating Product Translations...');

    try {
      // Get all product-related translations (including product_category_name from migration)
      const productDocs = await LiveTranslationCache.find({
        entityType: { $in: ['product_name', 'product_description', 'product_brand', 'product_spec'] }
      }).lean();

      // Also get category translations that belong to products
      const categoryDocs = await LiveTranslationCache.find({
        entityType: { $in: ['category_name', 'category_description'] }
      }).lean();

      const allDocs = [...productDocs, ...categoryDocs];

      console.log(`  Found ${allDocs.length} product + category translation records`);

      // Group by entityId + targetLang
      const grouped = {};
      for (const doc of allDocs) {
        const key = `${doc.entityId}:${doc.targetLang}`;
        if (!grouped[key]) {
          grouped[key] = {
            entityId: doc.entityId,
            targetLang: doc.targetLang,
            specs: {},
            name: null,
            description: null,
            brand: null,
            categoryName: null,
            status: doc.status,
            retryCount: doc.retryCount,
            lastErrorMessage: doc.lastErrorMessage,
            lastRetryAt: doc.lastRetryAt,
          };
        }

        // Aggregate by entity type
        const group = grouped[key];
        if (doc.entityType === 'product_name') {
          group.name = doc.translatedText;
        } else if (doc.entityType === 'product_description') {
          group.description = doc.translatedText;
        } else if (doc.entityType === 'product_brand') {
          group.brand = doc.translatedText;
        } else if (doc.entityType === 'product_category_name') {
          group.categoryName = doc.translatedText;
        } else if (doc.entityType === 'product_spec' && doc.specKey) {
          group.specs[doc.specKey] = doc.translatedText;
        } else if (doc.entityType === 'category_name') {
          group.categoryName = doc.translatedText;
        } else if (doc.entityType === 'category_description') {
          // category description could be used for extended product description
          if (!group.description) {
            group.description = doc.translatedText;
          }
        }

        // Always set status to success in new schema
        group.status = 'success';
      }

      console.log(`  Grouped into ${Object.keys(grouped).length} products`);

      // Batch insert into new schema
      let batchCount = 0;
      const entries = Object.values(grouped);

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const operations = batch.map(entry => ({
          updateOne: {
            filter: { entityId: entry.entityId, targetLang: entry.targetLang },
            update: { $setOnInsert: entry },
            upsert: true,
          }
        }));

        const result = await ProductCatalogTranslationCache.bulkWrite(operations);
        batchCount++;
        this.stats.productMigrated += result.upsertedCount;

        console.log(`  ✅ Batch ${batchCount}: ${result.upsertedCount} products created, ${batch.length - result.upsertedCount} already existed`);
      }

      console.log(`  ✅ Total products migrated: ${this.stats.productMigrated}`);
    } catch (error) {
      console.error('  ❌ Error migrating products:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Migrate user content (reviews, comments)
   */
  async migrateUserContentTranslations() {
    console.log('\n💬 Migrating User Content Translations...');

    try {
      const userContentDocs = await LiveTranslationCache.find({
        entityType: { $in: ['review', 'review_name', 'review_comment', 'comment', 'generic'] }
      }).lean();

      console.log(`  Found ${userContentDocs.length} user content records`);

      let batchCount = 0;

      for (let i = 0; i < userContentDocs.length; i += BATCH_SIZE) {
        const batch = userContentDocs.slice(i, i + BATCH_SIZE);
        
        const operations = batch.map(doc => {
          // Map old entityType to new schema
          let newEntityType = doc.entityType;
          if (doc.entityType === 'review_name' || doc.entityType === 'review_comment') {
            newEntityType = 'review';
          } else if (doc.entityType === 'comment') {
            newEntityType = 'comment';
          } else if (doc.entityType === 'generic') {
            newEntityType = 'generic';  // Keep as-is
          }

          return {
            updateOne: {
              filter: {
                entityId: doc.entityId || 'generic_' + doc.hashKey,  // Use hashKey as fallback for generic
                entityType: newEntityType,
                targetLang: doc.targetLang,
              },
              update: {
                $setOnInsert: {
                  entityId: doc.entityId || 'generic_' + doc.hashKey,
                  entityType: newEntityType,
                  targetLang: doc.targetLang,
                  originalText: doc.originalText,
                  translatedText: doc.translatedText,
                  status: 'success',
                  retryCount: 0,
                  lastErrorMessage: null,
                  lastRetryAt: null,
                }
              },
              upsert: true,
            }
          };
        });

        await UserContentTranslationCache.bulkWrite(operations);
        batchCount++;
        this.stats.userContentMigrated += batch.length;

        console.log(`  ✅ Batch ${batchCount}: ${batch.length} user content migrated`);
      }

      console.log(`  ✅ Total user content migrated: ${this.stats.userContentMigrated}`);
    } catch (error) {
      console.error('  ❌ Error migrating user content:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration() {
    console.log('\n🔍 Verifying Migration...');

    try {
      // Count old schema
      const oldCount = await LiveTranslationCache.countDocuments();
      console.log(`  OLD schema count: ${oldCount}`);

      // Count new schema
      const productCount = await ProductCatalogTranslationCache.countDocuments();
      const userContentCount = await UserContentTranslationCache.countDocuments();
      console.log(`  NEW schema count: ${productCount + userContentCount} (products: ${productCount}, user-content: ${userContentCount})`);

      // Sample verification: check if aggregation worked
      const sampleProduct = await ProductCatalogTranslationCache.findOne().lean();
      if (sampleProduct) {
        const specsCount = Object.keys(sampleProduct.specs || {}).length;
        console.log(`  ✅ Sample product aggregation: specs=${specsCount}`);
      }

      const legacyProductDocs = await LiveTranslationCache.find({
        entityType: { $in: ['product_name', 'product_description', 'product_brand', 'product_spec', 'category_name', 'category_description'] }
      }).lean();
      const expectedByKey = new Map();
      for (const legacy of legacyProductDocs) {
        const key = `${legacy.entityId}:${legacy.targetLang}`;
        const expected = expectedByKey.get(key) || {
          entityId: legacy.entityId,
          targetLang: legacy.targetLang,
          specs: {},
          name: null,
          description: null,
          brand: null,
        };
        if (legacy.entityType === 'product_name') expected.name = legacy.translatedText;
        else if (legacy.entityType === 'product_description') expected.description = legacy.translatedText;
        else if (legacy.entityType === 'product_brand') expected.brand = legacy.translatedText;
        else if (legacy.entityType === 'product_spec' && legacy.specKey) expected.specs[legacy.specKey] = legacy.translatedText;
        else if (legacy.entityType === 'category_description' && !expected.description) expected.description = legacy.translatedText;
        expectedByKey.set(key, expected);
      }
      const catalogTranslations = await ProductCatalogTranslationCache.find({}).lean();
      const catalogByKey = new Map(catalogTranslations.map((translation) => [
        `${translation.entityId}:${translation.targetLang}`,
        translation,
      ]));
      const missingProductTranslations = [];
      const mismatchedProductTranslations = [];
      for (const [key, expected] of expectedByKey) {
        const actual = catalogByKey.get(key);
        if (!actual) {
          missingProductTranslations.push(key);
          continue;
        }
        const expectedFields = getProductTranslationFields(expected);
        const actualFields = getProductTranslationFields(actual);
        const mismatchedFields = Object.keys(expectedFields).filter((field) =>
          getContentHash(expectedFields[field]) !== getContentHash(actualFields[field])
        );
        if (mismatchedFields.length > 0) {
          mismatchedProductTranslations.push({ key, fields: mismatchedFields });
        }
      }

      // Check for any failed records
      const failedRecords = await ProductCatalogTranslationCache.countDocuments({
        status: { $ne: 'success' }
      });
      if (failedRecords > 0) {
        console.log(`  ⚠️  Failed records in new schema: ${failedRecords}`);
      }

      const reconciliation = {
        expectedProductTranslations: expectedByKey.size,
        catalogProductTranslations: catalogTranslations.length,
        missingProductTranslations,
        mismatchedProductTranslations,
      };
      console.log(`  Product cache reconciliation: ${reconciliation.expectedProductTranslations - missingProductTranslations.length - mismatchedProductTranslations.length}/${reconciliation.expectedProductTranslations} matched`);
      if (missingProductTranslations.length > 0 || mismatchedProductTranslations.length > 0) {
        console.log(`  ⚠️  Missing product cache records: ${missingProductTranslations.length}; content mismatches: ${mismatchedProductTranslations.length}`);
      }
      console.log('  ✅ Verification complete');
      return {
        oldSchemaCount: oldCount,
        newSchemaCount: productCount + userContentCount,
        productCount,
        userContentCount,
        failedRecords,
        reconciliation,
      };
    } catch (error) {
      console.error('  ❌ Verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Run full migration
   */
  async run() {
    this.stats.startTime = new Date();

    try {
      console.log('🚀 Starting Data Migration (Phase 2)...');
      console.log(`   Database: ${MONGO_URI.substring(0, 50)}...`);
      console.log(`   Batch size: ${BATCH_SIZE}`);

      if (!VERIFY_ONLY) {
        await this.migrateProductTranslations();
        await this.migrateUserContentTranslations();
      }

      const verificationResults = await this.verifyMigration();
      const { missingProductTranslations, mismatchedProductTranslations } = verificationResults.reconciliation;
      if (missingProductTranslations.length > 0 || mismatchedProductTranslations.length > 0) {
        throw new Error('Product translation cache reconciliation did not pass');
      }

      this.stats.endTime = new Date();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000;

      console.log('\n✅ Migration Complete!');
      console.log('📊 Summary:');
      console.log(`   - Products migrated: ${this.stats.productMigrated}`);
      console.log(`   - User content migrated: ${this.stats.userContentMigrated}`);
      console.log(`   - Errors: ${this.stats.errors}`);
      console.log(`   - Duration: ${duration.toFixed(2)}s`);
      console.log(`   - Old schema total: ${verificationResults.oldSchemaCount}`);
      console.log(`   - New schema total: ${verificationResults.newSchemaCount}`);

      return {
        success: true,
        stats: this.stats,
        verification: verificationResults,
      };
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      this.stats.endTime = new Date();
      return {
        success: false,
        stats: this.stats,
        error: error.message,
      };
    }
  }
}

// Main
async function main() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected');

    const service = new MigrationService();
    const result = await service.run();

    if (!result.success) {
      process.exit(1);
    }

    console.log('\n✅ Ready for Phase 3 (Switch Reading)');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

main();
