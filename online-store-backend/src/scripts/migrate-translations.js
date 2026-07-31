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
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const MONGO_URI = process.env.MONGO_URI;
const BATCH_SIZE = 100;

const buildProductTranslationSnapshot = (translation) => ({
  name: translation.name || null,
  description: translation.description || null,
  brand: translation.brand || null,
  specs: Object.fromEntries(Object.entries(translation.specs || {}).sort(([left], [right]) => left.localeCompare(right))),
  features: translation.features || [],
});

const getSnapshotFieldCounts = (snapshot) => ({
  text: ['name', 'description', 'brand'].filter((field) => snapshot[field]).length,
  specs: Object.keys(snapshot.specs).length,
  features: snapshot.features.length,
});

const getSnapshotHash = (snapshot) => crypto
  .createHash('sha256')
  .update(JSON.stringify(snapshot))
  .digest('hex');

// Load specKeyTranslations
let specKeyTranslations = {};
const specKeyPath = path.join(__dirname, '../data/specKeyTranslations.json');
if (fs.existsSync(specKeyPath)) {
  specKeyTranslations = JSON.parse(fs.readFileSync(specKeyPath, 'utf-8'));
}

class MigrationService {
  constructor() {
    this.stats = {
      totalProcessed: 0,
      productMigrated: 0,
      productSkipped: 0,
      userContentMigrated: 0,
      userContentSkipped: 0,
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
    console.log(`\n${CLI_SYMBOLS.package} Migrating Product Translations...`);

    try {
      const entries = await this.getProductTranslationEntries();
      console.log(`  Grouped into ${entries.length} products`);

      let batchCount = 0;

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
        const inserted = result.upsertedCount || 0;
        this.stats.productMigrated += inserted;
        this.stats.productSkipped += batch.length - inserted;

        console.log(`  ${CLI_SYMBOLS.success} Batch ${batchCount}: ${inserted} products inserted, ${batch.length - inserted} existing preserved`);
      }

      console.log(`  ${CLI_SYMBOLS.success} Total products migrated: ${this.stats.productMigrated}`);
      return entries;
    } catch (error) {
      console.error(`  ${CLI_SYMBOLS.error} Error migrating products:`, error.message);
      this.stats.errors++;
      throw error;
    }
  }

  async getProductTranslationEntries() {
    const allDocs = await LiveTranslationCache.find({
      entityType: { $in: ['product_name', 'product_description', 'product_brand', 'product_spec', 'product_feature'] },
    }).lean();
    console.log(`  Found ${allDocs.length} product translation records`);

    const grouped = {};
    for (const doc of allDocs) {
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
          retryCount: doc.retryCount,
          lastErrorMessage: doc.lastErrorMessage,
          lastRetryAt: doc.lastRetryAt,
        };
      }

      const group = grouped[key];
      if (doc.entityType === 'product_name') group.name = doc.translatedText;
      else if (doc.entityType === 'product_description') group.description = doc.translatedText;
      else if (doc.entityType === 'product_brand') group.brand = doc.translatedText;
      else if (doc.entityType === 'product_spec' && doc.specKey) {
        const translatedKey = specKeyTranslations[doc.specKey]?.[doc.targetLang] || doc.specKey;
        group.specs[translatedKey] = doc.translatedText;
      } else if (doc.entityType === 'product_feature') {
        group.features.push(doc.translatedText);
      }
    }

    return Object.values(grouped);
  }

  /**
   * Migrate user content (reviews, comments)
   */
  async migrateUserContentTranslations() {
    console.log(`\n${CLI_SYMBOLS.speech} Migrating User Content Translations...`);

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

        const result = await UserContentTranslationCache.bulkWrite(operations);
        batchCount++;
        const inserted = result.upsertedCount || 0;
        this.stats.userContentMigrated += inserted;
        this.stats.userContentSkipped += batch.length - inserted;

        console.log(`  ${CLI_SYMBOLS.success} Batch ${batchCount}: ${inserted} user-content inserted, ${batch.length - inserted} existing preserved`);
      }

      console.log(`  ${CLI_SYMBOLS.success} Total user content migrated: ${this.stats.userContentMigrated}`);
    } catch (error) {
      console.error(`  ${CLI_SYMBOLS.error} Error migrating user content:`, error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration(productEntries) {
    console.log(`\n${CLI_SYMBOLS.search} Verifying Migration...`);

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
        const featuresCount = (sampleProduct.features || []).length;
        console.log(`  ${CLI_SYMBOLS.success} Sample product aggregation: specs=${specsCount}, features=${featuresCount}`);
      }

      // Check for any failed records
      const failedRecords = await ProductCatalogTranslationCache.countDocuments({
        status: { $ne: 'success' }
      });
      if (failedRecords > 0) {
        console.log(`  ${CLI_SYMBOLS.warning}  Failed records in new schema: ${failedRecords}`);
      }

      const audit = {
        compared: 0,
        missing: 0,
        matching: 0,
        manualOverrides: 0,
        contentMismatches: 0,
        fieldCountMismatches: 0,
      };

      for (let i = 0; i < productEntries.length; i += BATCH_SIZE) {
        const batch = productEntries.slice(i, i + BATCH_SIZE);
        const caches = await ProductCatalogTranslationCache.find({
          $or: batch.map(({ entityId, targetLang }) => ({ entityId, targetLang })),
        }).lean();
        const cacheByKey = new Map(caches.map((cache) => [`${cache.entityId}:${cache.targetLang}`, cache]));

        for (const entry of batch) {
          audit.compared++;
          const cache = cacheByKey.get(`${entry.entityId}:${entry.targetLang}`);
          if (!cache) {
            audit.missing++;
            continue;
          }

          const sourceSnapshot = buildProductTranslationSnapshot(entry);
          const cacheSnapshot = buildProductTranslationSnapshot(cache);
          const fieldCountsMatch = JSON.stringify(getSnapshotFieldCounts(sourceSnapshot))
            === JSON.stringify(getSnapshotFieldCounts(cacheSnapshot));
          const contentMatches = getSnapshotHash(sourceSnapshot) === getSnapshotHash(cacheSnapshot);

          if (contentMatches) {
            audit.matching++;
          } else if ((cache.manualFields || []).length > 0) {
            audit.manualOverrides++;
          } else {
            audit.contentMismatches++;
          }
          if (!fieldCountsMatch) audit.fieldCountMismatches++;
        }
      }

      console.log(`  Product cache audit: compared=${audit.compared}, matching=${audit.matching}, missing=${audit.missing}, manual overrides=${audit.manualOverrides}, content mismatches=${audit.contentMismatches}, field-count mismatches=${audit.fieldCountMismatches}`);
      if (audit.missing || audit.contentMismatches || audit.fieldCountMismatches) {
        console.log(`  ${CLI_SYMBOLS.warning} Keep legacy fallback enabled until the product cache audit is resolved.`);
      }
      console.log(`  ${CLI_SYMBOLS.success} Verification complete`);
      return {
        oldSchemaCount: oldCount,
        newSchemaCount: productCount + userContentCount,
        productCount,
        userContentCount,
        failedRecords,
        audit,
      };
    } catch (error) {
      console.error(`  ${CLI_SYMBOLS.error} Verification failed:`, error.message);
      throw error;
    }
  }

  /**
   * Run full migration
   */
  async run({ verifyOnly = false } = {}) {
    this.stats.startTime = new Date();

    try {
      console.log(`${CLI_SYMBOLS.rocket} Starting Data Migration (Phase 2)...`);
      console.log(`   Database: ${MONGO_URI.substring(0, 50)}...`);
      console.log(`   Batch size: ${BATCH_SIZE}`);

      const productEntries = verifyOnly
        ? await this.getProductTranslationEntries()
        : await this.migrateProductTranslations();

      if (!verifyOnly) {
        await this.migrateUserContentTranslations();
      }

      const verificationResults = await this.verifyMigration(productEntries);

      this.stats.endTime = new Date();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000;

      console.log(`\n${CLI_SYMBOLS.success} ${verifyOnly ? 'Cache verification complete' : 'Migration Complete!'} `);
      console.log(`${CLI_SYMBOLS.chart} Summary:`);
      console.log(`   - Products inserted: ${this.stats.productMigrated}`);
      console.log(`   - Products preserved: ${this.stats.productSkipped}`);
      console.log(`   - User content inserted: ${this.stats.userContentMigrated}`);
      console.log(`   - User content preserved: ${this.stats.userContentSkipped}`);
      console.log(`   - Errors: ${this.stats.errors}`);
      console.log(`   - Duration: ${duration.toFixed(2)}s`);
      console.log(`   - Old schema total: ${verificationResults.oldSchemaCount}`);
      console.log(`   - New schema total: ${verificationResults.newSchemaCount}`);
      console.log(`   - Product audit mismatches: ${verificationResults.audit.missing + verificationResults.audit.contentMismatches + verificationResults.audit.fieldCountMismatches}`);

      return {
        success: true,
        stats: this.stats,
        verification: verificationResults,
      };
    } catch (error) {
      console.error(`\n${CLI_SYMBOLS.error} Migration failed:`, error);
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
    console.log(`${CLI_SYMBOLS.antenna} Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected`);

    const service = new MigrationService();
    const result = await service.run({ verifyOnly: process.argv.includes('--verify-only') });

    if (!result.success) {
      process.exit(1);
    }

    const { audit } = result.verification;
    if (audit.missing || audit.contentMismatches || audit.fieldCountMismatches) {
      console.log(`\n${CLI_SYMBOLS.warning} Migration completed, but legacy fallback must remain enabled until the audit is resolved.`);
      return;
    }

    console.log(`\n${CLI_SYMBOLS.success} Product cache audit passed; the legacy fallback can be reviewed for retirement.`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log(`\n${CLI_SYMBOLS.connection} Disconnected`);
  }
}

main();
