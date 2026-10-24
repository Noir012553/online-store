const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const Product = require('../src/models/Product');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const { getActiveLangCodes, getDefaultLanguage } = require('../src/config/languageInventory');
const { getProductTranslationSourceHash } = require('../src/utils/productTranslationFingerprint');

// Read-only audit: never prints MONGO_URI, credentials or document bodies.
const args = process.argv.slice(2);
const productId = args.find(argument => argument.startsWith('--product-id='))
  ?.slice('--product-id='.length).toLowerCase();
const limit = Number(args.find(argument => argument.startsWith('--limit='))?.slice('--limit='.length) || 10);

const summarizeTranslation = (translation, sourceHash) => ({
  hashCurrent: translation.sourceHash === sourceHash,
  status: translation.status,
  qualityStatus: translation.qualityStatus,
  provider: translation.provider,
  providerSource: translation.providerSource,
  score: translation.qualityScore,
  errors: translation.validationErrors || [],
  manualFields: translation.manualFields || [],
  updatedAt: translation.updatedAt,
});

const countStatusRows = async (base) => ProductCatalogTranslationCache.aggregate([
  { $match: base },
  { $group: { _id: { status: '$status', quality: '$qualityStatus' }, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]);

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
  if (productId && !/^[a-f\d]{24}$/.test(productId)) throw new Error('--product-id must be a 24-character id');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const databaseName = mongoose.connection.db.databaseName;
    const langs = getActiveLangCodes().filter(code => code !== getDefaultLanguage().code);
    const activeFilter = { isDeleted: { $ne: true } };
    const productCount = await Product.countDocuments(activeFilter);

    const byLanguage = {};
    for (const lang of langs) {
      const base = { targetLang: lang };
      const total = await ProductCatalogTranslationCache.countDocuments(base);
      const approved = await ProductCatalogTranslationCache.countDocuments({
        ...base,
        status: 'success',
        qualityStatus: 'approved',
        $or: [
          { validationErrors: { $exists: false } },
          { validationErrors: { $size: 0 } },
        ],
      });
      const statusRows = await countStatusRows(base);
      byLanguage[lang] = {
        records: total,
        approved,
        productsWithoutRecord: Math.max(0, productCount - total),
        statuses: Object.fromEntries(statusRows.map(row => [`${row._id.status}/${row._id.quality}`, row.count])),
      };
    }

    const sample = await Product.find(activeFilter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('name brand')
      .lean();

    const sampleProducts = [];
    for (const product of sample) {
      const id = String(product._id);
      const sourceHash = getProductTranslationSourceHash(product);
      const translations = await ProductCatalogTranslationCache.find({ entityId: id })
        .select('targetLang sourceHash status qualityStatus validationErrors provider providerSource manualFields qualityScore updatedAt')
        .lean();
      sampleProducts.push({
        productId: id,
        name: String(product.name || '').slice(0, 100),
        brand: product.brand,
        cacheCount: translations.length,
        cache: Object.fromEntries(translations.map(translation => [
          translation.targetLang,
          summarizeTranslation(translation, sourceHash),
        ])),
      });
    }

    let singleProduct = null;
    if (productId) {
      const product = await Product.findById(productId).lean();
      if (!product) {
        singleProduct = { productId, found: false };
      } else {
        const sourceHash = getProductTranslationSourceHash(product);
        const translations = await ProductCatalogTranslationCache.find({ entityId: productId })
          .select('targetLang sourceHash status qualityStatus validationErrors provider providerSource manualFields qualityScore updatedAt')
          .lean();
        singleProduct = {
          productId,
          found: true,
          isDeleted: product.isDeleted === true,
          isPublished: product.isPublished !== false,
          sourceHash,
          sourceFieldSizes: {
            name: String(product.name || '').length,
            description: String(product.description || '').length,
            technicalDescription: String(product.technicalDescription || '').length,
            specs: Object.keys(product.specs || {}).length,
            descriptionImages: (product.descriptionImages || []).length,
            promotions: (product.promotions || []).length,
          },
          translations: translations
            .sort((a, b) => a.targetLang.localeCompare(b.targetLang))
            .map(translation => ({ targetLang: translation.targetLang, ...summarizeTranslation(translation, sourceHash) })),
        };
      }
    }

    console.log(JSON.stringify({
      mode: 'read-only',
      databaseName,
      productCount,
      languages: langs,
      byLanguage,
      sampleProducts,
      singleProduct,
    }, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

run().catch((error) => {
  console.error(`[inspect-translation-db] ${error.message}`);
  process.exitCode = 1;
});
