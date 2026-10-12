const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { SUPPORTED_LANGUAGES, getDefaultLanguage } = require('../config/languageInventory');
const translationValidator = require('../utils/translationValidator');
const { retranslateProduct } = require('../services/productCatalogRetranslationService');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const {
  acquireDatabaseLock,
  acquireProgressLock,
  getDatabaseScope,
  getRetranslationLockKey,
  getProductFieldWorkKey,
  hydrateCheckpoint,
  openCheckpoint,
} = require('../utils/retranslateProgress');
const { RetranslationProgress } = require('../models/RetranslationProgress');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const productId = args.find(argument => argument.startsWith('--product-id='))
  ?.slice('--product-id='.length).toLowerCase();
const targetLang = args.find(argument => argument.startsWith('--lang='))
  ?.slice('--lang='.length).toLowerCase();
const approved = validation => (
  validation?.qualityStatus === 'approved'
  && (validation.validationErrors || []).length === 0
);
const fieldEntityType = rootField => ({
  name: 'product_name',
  description: 'product_description',
  technicalDescription: 'product_technical_description',
  specs: 'product_spec',
  descriptionImages: 'product_description_image_alt',
  promotions: 'product_promotion',
})[rootField];
const excerpt = value => {
  const text = String(value || '');
  return text.length <= 500 ? text : `${text.slice(0, 250)} ... ${text.slice(-250)}`;
};

const validateOptions = () => {
  if (!productId || !/^[a-f\d]{24}$/.test(productId)) {
    throw new Error('Pass a valid --product-id=<24-character-id>');
  }
  if (!SUPPORTED_LANGUAGES.some(({ code }) => code === targetLang)
    || targetLang === getDefaultLanguage().code) {
    throw new Error('Pass a supported target language with --lang=<code>');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
};

const buildFields = (product, catalog, checkpointRecords = new Map()) => {
  const sourceHashMatches = catalog?.sourceHash === getProductTranslationSourceHash(product);
  const manualFields = new Set(catalog?.manualFields || []);
  const fields = [];
  const add = (label, rootField, field, source, currentValue) => {
    if (manualFields.has(rootField) || typeof source !== 'string' || !source.trim()) return;
    const key = getProductFieldWorkKey({ productId, targetLang, field, source });
    fields.push({
      label,
      rootField,
      source,
      currentValue: sourceHashMatches ? currentValue : null,
      checkpoint: checkpointRecords.get(key) || null,
    });
  };

  add('name', 'name', 'name', product.name, catalog?.name);
  add('description', 'description', 'description', product.description, catalog?.description);
  add('technicalDescription', 'technicalDescription', 'technicalDescription', product.technicalDescription, catalog?.technicalDescription);
  for (const [key, value] of Object.entries(product.specs || {})) {
    add(`specs.${key}`, 'specs', ['specs', key], String(value ?? ''), catalog?.specs?.[key]);
  }
  for (const [index, image] of (product.descriptionImages || []).entries()) {
    add(`descriptionImages.${index}.alt`, 'descriptionImages', ['descriptionImages', index, 'alt'], image?.alt, catalog?.descriptionImages?.[index]?.alt);
  }
  for (const [index, promotion] of (product.promotions || []).entries()) {
    for (const field of ['title', 'giftProductName', 'scope', 'discountText']) {
      add(`promotions.${index}.${field}`, 'promotions', ['promotions', index, field], promotion?.[field], catalog?.promotions?.[index]?.[field]);
    }
  }

  return fields;
};

const getCheckpointRecords = async () => {
  const prefix = `product-field:${targetLang}:${productId}:`;
  const records = await RetranslationProgress.find({
    key: { $regex: `^${prefix}` },
    deleted: { $ne: true },
  }).select('key fixed validationErrors payload updatedAt').sort({ updatedAt: -1 }).lean();
  const latest = new Map();
  for (const record of records) {
    if (!latest.has(record.key)) latest.set(record.key, record);
  }
  return latest;
};

const inspectFields = async fields => {
  const results = [];
  for (const field of fields) {
    let candidate = field.currentValue;
    let validation = null;
    if (typeof candidate === 'string' && candidate.trim()) {
      validation = await translationValidator.validateTranslation(
        field.source,
        candidate,
        targetLang,
        fieldEntityType(field.rootField),
      );
      if (approved(validation)) {
        results.push({ field: field.label, status: 'approved', errors: [] });
        continue;
      }
    }

    const checkpointCandidate = field.checkpoint?.payload?.value;
    if (typeof checkpointCandidate === 'string' && checkpointCandidate.trim()) {
      candidate = checkpointCandidate;
      validation = await translationValidator.validateTranslation(
        field.source,
        candidate,
        targetLang,
        fieldEntityType(field.rootField),
      );
      if (approved(validation)) {
        results.push({ field: field.label, status: 'approved', errors: [] });
        continue;
      }
    }

    results.push({
      field: field.label,
      status: 'needs_retry',
      errors: validation?.validationErrors || field.checkpoint?.validationErrors || ['missing_candidate'],
      technicalTokenCheck: candidate
        ? translationValidator.checkTechnicalTokens(field.source, candidate)
        : null,
      candidate: candidate ? excerpt(candidate) : null,
    });
  }
  return results;
};

const run = async () => {
  validateOptions();
  let releaseProgressLock;
  let databaseLock;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const scope = getDatabaseScope(process.env.MONGO_URI);
    let checkpoint = null;
    if (apply) {
      releaseProgressLock = acquireProgressLock();
      databaseLock = await acquireDatabaseLock(getRetranslationLockKey(scope));
      checkpoint = openCheckpoint({
        filter: { entityId: productId },
        lang: targetLang,
        limit: 0,
        dryRun: false,
        validate: true,
        checkpointScope: scope,
      });
      await hydrateCheckpoint(checkpoint);
    }

    const [product, catalog] = await Promise.all([
      Product.findById(productId).select('name description specs technicalDescription descriptionImages promotions').lean(),
      ProductCatalogTranslationCache.findOne({ entityId: productId, targetLang }).lean(),
    ]);
    if (!product) throw new Error(`Product not found: ${productId}`);
    const checkpointRecords = apply ? checkpoint.completed : await getCheckpointRecords();

    const inspect = async () => {
      const fields = buildFields(product, catalog, checkpointRecords);
      const results = await inspectFields(fields);
      const needsRetry = results.filter(result => result.status === 'needs_retry');
      console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        productId,
        targetLang,
        approvedFields: results.length - needsRetry.length,
        fieldsNeedingRetry: needsRetry,
      }, null, 2));
      return needsRetry;
    };

    const needsRetry = await inspect();
    if (!apply || needsRetry.length === 0) return;

    const concurrency = Number(process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY || 1);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('PRODUCT_RETRANSLATION_FIELD_CONCURRENCY must be a positive integer');
    }

    const result = await retranslateProduct(productId, targetLang, {
      checkpoint,
      parallelProducts: concurrency,
      retryMixedLanguage: true,
    });
    await databaseLock.renew();
    const remainingFields = await inspect();
    console.log(JSON.stringify({
      mode: 'apply-complete',
      committed: result.committed,
      remainingFieldCount: remainingFields.length,
      remainingFields: remainingFields.map(({ field, errors }) => ({ field, errors })),
    }, null, 2));
    if (!result.committed) process.exitCode = 1;
  } finally {
    await databaseLock?.release();
    await mongoose.disconnect().catch(() => {});
    releaseProgressLock?.();
  }
};

run().catch(error => {
  console.error(`Product field retranslation failed: ${error.message}`);
  process.exitCode = 1;
});
