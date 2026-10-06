require('dotenv').config();

const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const SpecKeyTranslationCache = require('../models/SpecKeyTranslationCache');
const specKeyTranslations = require('../data/specKeyTranslations.json');
const { getActiveLangCodes } = require('../config/languageInventory');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');
const { connectMongo } = require('../config/mongoConnection');

const reverseStaticLabels = new Map();
Object.entries(specKeyTranslations).forEach(([canonicalKey, labels]) => {
  Object.values(labels || {}).forEach((label) => {
    if (typeof label === 'string' && label.trim()) {
      reverseStaticLabels.set(label.trim().toLowerCase(), canonicalKey);
    }
  });
});

const canonicalizeKey = (rawKey) => {
  const key = String(rawKey || '').trim();
  return reverseStaticLabels.get(key.toLowerCase()) || getCanonicalSpecKey(key);
};

const inspectSpecs = (documents, source) => {
  const keyCounts = new Map();
  const collisions = [];

  documents.forEach((document) => {
    const specs = document.specs instanceof Map
      ? Object.fromEntries(document.specs)
      : document.specs || {};
    const canonicalKeysByRaw = new Map();

    Object.keys(specs).forEach((rawKey) => {
      const canonicalKey = canonicalizeKey(rawKey);
      const record = keyCounts.get(canonicalKey || `invalid:${rawKey}`) || {
        canonicalKey: canonicalKey || null,
        count: 0,
        rawKeys: new Set(),
      };
      record.count += 1;
      record.rawKeys.add(rawKey);
      keyCounts.set(canonicalKey || `invalid:${rawKey}`, record);
      if (canonicalKey) canonicalKeysByRaw.set(rawKey, canonicalKey);
    });

    const canonicalToRaw = new Map();
    canonicalKeysByRaw.forEach((canonicalKey, rawKey) => {
      const rawKeys = canonicalToRaw.get(canonicalKey) || [];
      rawKeys.push(rawKey);
      canonicalToRaw.set(canonicalKey, rawKeys);
    });
    canonicalToRaw.forEach((rawKeys, canonicalKey) => {
      if (rawKeys.length > 1) collisions.push({ source, documentId: String(document._id || document.entityId), canonicalKey, rawKeys });
    });
  });

  return {
    documents: documents.length,
    keys: [...keyCounts.values()]
      .map(({ rawKeys, ...entry }) => ({ ...entry, rawKeys: [...rawKeys].sort() }))
      .sort((left, right) => String(left.canonicalKey).localeCompare(String(right.canonicalKey))),
    collisions,
  };
};

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  await connectMongo();

  try {
    const [products, productCaches, labelCaches] = await Promise.all([
      Product.find({ isDeleted: false }).select('_id specs').lean(),
      ProductCatalogTranslationCache.find({}).select('entityId targetLang specs').lean(),
      SpecKeyTranslationCache.find({}).select('canonicalKey normalizedKey targetLang translatedLabel status source provider').lean(),
    ]);

    const staticKeys = Object.keys(specKeyTranslations).map(canonicalizeKey).filter(Boolean);
    const cachedStaticKeys = new Set(
      labelCaches
        .filter((row) => row.source === 'static' && row.status === 'success')
        .map((row) => `${row.canonicalKey}:${row.targetLang}`)
    );
    const missingStaticCache = [];
    Object.entries(specKeyTranslations).forEach(([rawKey, labels]) => {
      const canonicalKey = canonicalizeKey(rawKey);
      getActiveLangCodes().forEach((targetLang) => {
        if (!cachedStaticKeys.has(`${canonicalKey}:${targetLang}`)) {
          missingStaticCache.push({ canonicalKey, targetLang, expectedLabel: labels?.[targetLang] || labels?.vi || labels?.en || canonicalKey });
        }
      });
    });

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      staticKeyCount: new Set(staticKeys).size,
      products: inspectSpecs(products, 'Product.specs'),
      productTranslationCaches: inspectSpecs(productCaches, 'ProductCatalogTranslationCache.specs'),
      specKeyTranslationCache: {
        documents: labelCaches.length,
        bySource: labelCaches.reduce((result, row) => {
          result[row.source || 'unknown'] = (result[row.source || 'unknown'] || 0) + 1;
          return result;
        }, {}),
        missingStaticCache,
      },
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`[audit-spec-key-cache] ${error.message}`);
  process.exitCode = 1;
});
