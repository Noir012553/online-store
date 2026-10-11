require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const Product = require('../models/Product');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');

const SOURCE_CHANGED = 'source_content_changed';
const LIVE_PRODUCT_TYPES = [
  'product_name',
  'product_description',
  'product_brand',
  'product_spec',
  'product_technical_description',
  'product_description_image_alt',
  'product_promotion',
];

const getCurrentSourceText = (translation, product) => {
  switch (translation.entityType) {
    case 'product_name': return product.name;
    case 'product_description': return product.description;
    case 'product_brand': return product.brand;
    case 'product_technical_description': return product.technicalDescription;
    case 'product_spec': return product.specs?.[translation.specKey];
    case 'product_description_image_alt': {
      const match = translation.fieldKey?.match(/^descriptionImages\.(\d+)\.alt$/);
      return match ? product.descriptionImages?.[Number(match[1])]?.alt : undefined;
    }
    case 'product_promotion': {
      const match = translation.fieldKey?.match(/^promotions\.(\d+)\.(title|giftProductName|scope|discountText)$/);
      return match ? product.promotions?.[Number(match[1])]?.[match[2]] : undefined;
    }
    default: return undefined;
  }
};

const addCount = (map, key) => map.set(key, (map.get(key) || 0) + 1);

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, {
    readPreference: 'secondaryPreferred',
    serverSelectionTimeoutMS: 10000,
  });

  try {
    const [liveStatus, liveErrors, sourceChangedGroups, catalogStatus, catalogSourceChanged] = await Promise.all([
      LiveTranslationCache.aggregate([
        { $group: { _id: '$qualityStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LiveTranslationCache.aggregate([
        { $unwind: '$validationErrors' },
        { $group: { _id: '$validationErrors', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LiveTranslationCache.aggregate([
        { $match: { validationErrors: SOURCE_CHANGED, entityType: { $in: LIVE_PRODUCT_TYPES } } },
        { $group: { _id: { targetLang: '$targetLang', entityType: '$entityType' }, count: { $sum: 1 } } },
        { $sort: { '_id.targetLang': 1, '_id.entityType': 1 } },
      ]),
      ProductCatalogTranslationCache.aggregate([
        { $group: { _id: '$qualityStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ProductCatalogTranslationCache.find({ validationErrors: SOURCE_CHANGED })
        .select('entityId targetLang sourceHash')
        .lean(),
    ]);

    const productIds = [...new Set(catalogSourceChanged.map(({ entityId }) => entityId).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name description brand specs technicalDescription descriptionImages promotions')
      .lean();
    const productsById = new Map(products.map(product => [String(product._id), product]));
    const catalogHashSummary = new Map();

    catalogSourceChanged.forEach((translation) => {
      const product = productsById.get(String(translation.entityId));
      const outcome = !product
        ? 'product_missing'
        : translation.sourceHash === getProductTranslationSourceHash(product)
          ? 'matches_current_source'
          : 'differs_from_current_source';
      const key = `${translation.targetLang || 'unknown'}:${outcome}`;
      addCount(catalogHashSummary, key);
    });

    const sourceComparisonSummary = new Map();
    const compareLiveBatch = async (translations) => {
      const liveProductIds = [...new Set(translations.map(({ entityId }) => String(entityId)).filter(Boolean))];
      const liveProducts = await Product.find({ _id: { $in: liveProductIds } })
        .select('name description brand specs technicalDescription descriptionImages promotions')
        .lean();
      const liveProductsById = new Map(liveProducts.map(product => [String(product._id), product]));

      translations.forEach((translation) => {
        const product = liveProductsById.get(String(translation.entityId));
        const currentText = product ? getCurrentSourceText(translation, product) : undefined;
        const outcome = currentText === undefined
          ? 'unverifiable'
          : String(currentText ?? '') === String(translation.originalText ?? '')
            ? 'same_as_current_source'
            : 'differs_from_current_source';
        addCount(sourceComparisonSummary, `${translation.targetLang || 'unknown'}:${translation.entityType}:${outcome}`);
      });
    };

    const staleLiveDocs = LiveTranslationCache.find({
      validationErrors: SOURCE_CHANGED,
      entityType: { $in: LIVE_PRODUCT_TYPES },
    }).select('entityId targetLang entityType specKey fieldKey originalText').lean().cursor({ batchSize: 500 });
    let liveDocBuffer = [];
    for await (const translation of staleLiveDocs) {
      liveDocBuffer.push(translation);
      if (liveDocBuffer.length === 500) {
        await compareLiveBatch(liveDocBuffer);
        liveDocBuffer = [];
      }
    }
    if (liveDocBuffer.length > 0) await compareLiveBatch(liveDocBuffer);

    console.log(JSON.stringify({
      readOnly: true,
      liveTranslationTotal: liveStatus.reduce((sum, row) => sum + row.count, 0),
      liveByQualityStatus: liveStatus.map(({ _id, count }) => ({ qualityStatus: _id || 'missing', count })),
      liveValidationErrors: liveErrors.map(({ _id, count }) => ({ error: _id, count })),
      liveSourceChangedByLocaleAndType: sourceChangedGroups.map(({ _id, count }) => ({ ..._id, count })),
      liveSourceComparisonByLocaleType: [...sourceComparisonSummary]
        .map(([key, count]) => ({ group: key, count }))
        .sort((a, b) => a.group.localeCompare(b.group)),
      catalogByQualityStatus: catalogStatus.map(({ _id, count }) => ({ qualityStatus: _id || 'missing', count })),
      catalogSourceHashByLocale: [...catalogHashSummary]
        .map(([key, count]) => ({ group: key, count }))
        .sort((a, b) => a.group.localeCompare(b.group)),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Translation audit failed: ${error.message}`);
  process.exitCode = 1;
});
