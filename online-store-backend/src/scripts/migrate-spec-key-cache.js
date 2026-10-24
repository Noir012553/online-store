require('dotenv').config();

const fs = require('fs');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const specKeyTranslations = require('../data/specKeyTranslations.json');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');
const { connectMongo } = require('../config/mongoConnection');

const apply = process.argv.includes('--apply');
const backupArg = process.argv.find((arg) => arg.startsWith('--backup-file='));
const backupFile = backupArg ? backupArg.slice('--backup-file='.length) : '';

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

const normalizeSpecObject = (specs) => {
  const source = specs instanceof Map ? Object.fromEntries(specs) : specs || {};
  const normalized = {};
  const sourceKeysByCanonical = new Map();
  const collisions = [];

  Object.entries(source).forEach(([rawKey, value]) => {
    const canonicalKey = canonicalizeKey(rawKey);
    if (!canonicalKey) {
      collisions.push({ canonicalKey: null, rawKeys: [rawKey], reason: 'invalid_key' });
      return;
    }

    const previousRawKeys = sourceKeysByCanonical.get(canonicalKey) || [];
    if (previousRawKeys.length > 0) {
      collisions.push({ canonicalKey, rawKeys: [...previousRawKeys, rawKey], reason: 'canonical_collision' });
    }
    sourceKeysByCanonical.set(canonicalKey, [...previousRawKeys, rawKey]);
    normalized[canonicalKey] = value;
  });

  return { normalized, collisions, changed: JSON.stringify(source) !== JSON.stringify(normalized) };
};

const makeOperation = (document, specs) => ({
  updateOne: {
    filter: { _id: document._id },
    update: { $set: { specs } },
  },
});

async function main() {
  if (apply && (!backupFile || !fs.existsSync(backupFile))) {
    throw new Error('Apply requires an existing --backup-file=... created before migration');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  await connectMongo();

  try {
    const [products, productCaches] = await Promise.all([
      Product.find({ isDeleted: false }).select('_id specs').lean(),
      ProductCatalogTranslationCache.find({}).select('_id entityId targetLang specs').lean(),
    ]);
    const productOperations = [];
    const cacheOperations = [];
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      products: { scanned: products.length, changed: 0, collisions: [] },
      productCatalogTranslationCaches: { scanned: productCaches.length, changed: 0, collisions: [] },
    };

    products.forEach((document) => {
      const result = normalizeSpecObject(document.specs);
      if (result.collisions.length > 0) {
        report.products.collisions.push({ documentId: String(document._id), collisions: result.collisions });
        return;
      }
      if (!result.changed) return;
      report.products.changed += 1;
      productOperations.push(makeOperation(document, result.normalized));
    });

    productCaches.forEach((document) => {
      const result = normalizeSpecObject(document.specs);
      if (result.collisions.length > 0) {
        report.productCatalogTranslationCaches.collisions.push({
          documentId: String(document._id),
          entityId: document.entityId,
          targetLang: document.targetLang,
          collisions: result.collisions,
        });
        return;
      }
      if (!result.changed) return;
      report.productCatalogTranslationCaches.changed += 1;
      cacheOperations.push(makeOperation(document, result.normalized));
    });

    const operations = productOperations.length + cacheOperations.length;
    if (apply) {
      if (productOperations.length > 0) await Product.bulkWrite(productOperations, { ordered: false });
      if (cacheOperations.length > 0) await ProductCatalogTranslationCache.bulkWrite(cacheOperations, { ordered: false });
    }

    console.log(JSON.stringify({ ...report, operations, applied: apply ? operations : 0 }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`[migrate-spec-key-cache] ${error.message}`);
  process.exitCode = 1;
});
