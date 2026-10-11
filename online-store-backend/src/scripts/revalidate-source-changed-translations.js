require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const Product = require('../models/Product');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const translationValidator = require('../utils/translationValidator');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const { normalizeSpecFieldName, sanitizeUnknownSpecKey } = require('../utils/specNormalizer');

const SOURCE_CHANGED = 'source_content_changed';
const PRODUCT_ENTITY_TYPES = [
  'product_name',
  'product_description',
  'product_spec',
  'product_brand',
  'product_technical_description',
  'product_description_image_alt',
  'product_promotion',
];
const MAX_APPLY_LIMIT = 200;
const MAX_PREVIEW_LIMIT = 1000;

const parseOptions = (args) => {
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 100;
  const apply = args.includes('--apply');
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  if (apply && limit > MAX_APPLY_LIMIT) {
    throw new Error(`--apply is limited to ${MAX_APPLY_LIMIT} records per run`);
  }
  if (!apply && limit > MAX_PREVIEW_LIMIT) {
    throw new Error(`Preview is limited to ${MAX_PREVIEW_LIMIT} records per run`);
  }
  return { apply, limit };
};

const canonicalSpecKey = key => normalizeSpecFieldName(String(key || '')) || sanitizeUnknownSpecKey(String(key || ''));

const getCurrentSourceText = (translation, product) => {
  switch (translation.entityType) {
    case 'product_name': return product.name;
    case 'product_description': return product.description;
    case 'product_brand': return product.brand;
    case 'product_technical_description': return product.technicalDescription;
    case 'product_spec': {
      const wantedKey = canonicalSpecKey(translation.specKey);
      const entry = Object.entries(product.specs || {}).find(([key, value]) => (
        canonicalSpecKey(key) === wantedKey && value === translation.originalText
      ));
      return entry?.[1];
    }
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
  const { apply, limit } = parseOptions(process.argv.slice(2));
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const candidates = await LiveTranslationCache.find({
      validationErrors: SOURCE_CHANGED,
      entityType: { $in: PRODUCT_ENTITY_TYPES },
      status: 'success',
      provider: 'cloudflare',
    })
      .select('_id entityId targetLang entityType specKey fieldKey originalText translatedText provider status')
      .sort({ _id: 1 })
      .limit(limit)
      .lean();
    const productIds = [...new Set(candidates.map(({ entityId }) => entityId).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds }, isDeleted: false })
      .select('name description brand specs technicalDescription descriptionImages promotions')
      .lean();
    const productsById = new Map(products.map(product => [String(product._id), product]));
    const counts = new Map();
    const approvedByLocale = new Map();
    const updates = [];
    const auditLogs = [];

    for (const translation of candidates) {
      const product = productsById.get(String(translation.entityId));
      const currentSource = product ? getCurrentSourceText(translation, product) : undefined;
      let outcome = !product ? 'product_missing' : 'source_differs';
      let validation = null;

      if (typeof currentSource === 'string'
        && currentSource.trim()
        && currentSource === translation.originalText) {
        validation = await translationValidator.validateTranslation(
          String(currentSource ?? ''),
          String(translation.translatedText ?? ''),
          translation.targetLang,
          translation.entityType,
        );
        outcome = validation.qualityStatus === 'approved' ? 'source_match_approved' : 'source_match_needs_review';
        if (validation.qualityStatus === 'approved') {
          const productIdsForLocale = approvedByLocale.get(translation.targetLang) || new Set();
          productIdsForLocale.add(String(translation.entityId));
          approvedByLocale.set(translation.targetLang, productIdsForLocale);
          updates.push({
            updateOne: {
              filter: {
                _id: translation._id,
                validationErrors: SOURCE_CHANGED,
                originalText: translation.originalText,
                translatedText: translation.translatedText,
              },
              update: {
                $set: {
                  qualityStatus: validation.qualityStatus,
                  qualityScore: validation.qualityScore,
                  validationErrors: validation.validationErrors,
                },
              },
            },
          });
          auditLogs.push({
            translationId: translation._id,
            action: 'validated',
            actor: 'source-revalidation',
            reason: 'source_content_unchanged_and_validator_approved',
            metadata: {
              targetLang: translation.targetLang,
              entityType: translation.entityType,
              qualityScore: validation.qualityScore,
            },
          });
        }
      }
      addCount(counts, `${translation.targetLang || 'unknown'}:${translation.entityType}:${outcome}`);
    }

    if (apply && updates.length > 0) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await LiveTranslationCache.bulkWrite(updates, { ordered: false, session });
          await TranslationQualityLog.insertMany(auditLogs, { ordered: false, session });
        });
      } finally {
        await session.endSession();
      }
      for (const [targetLang, ids] of approvedByLocale) {
        await ProductTranslationSeederService._syncProductCatalogTranslations(targetLang, [...ids]);
      }
    }

    const summary = {
      mode: apply ? 'apply' : 'preview',
      readOnly: !apply,
      candidateLimit: limit,
      candidatesRead: candidates.length,
      validatedAndApproved: [...counts].filter(([key]) => key.endsWith(':source_match_approved'))
        .reduce((sum, [, count]) => sum + count, 0),
      eligibleWrites: updates.length,
      countByLocaleTypeAndResult: [...counts]
        .map(([group, count]) => ({ group, count }))
        .sort((a, b) => a.group.localeCompare(b.group)),
      cloudflareCalls: 0,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Source revalidation failed: ${error.message}`);
  process.exitCode = 1;
});
