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
const BATCH_SIZE = 200;
const VALIDATION_CONCURRENCY = 5;
const MAX_PREVIEW_LIMIT = 1000;

const parseOptions = (args) => {
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const all = args.includes('--all');
  const apply = args.includes('--apply');
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 100;
  if (all && limitArg) throw new Error('--all cannot be combined with --limit');
  if (!all && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (!apply && all) throw new Error('Use --apply with --all to process the entire backlog');
  if (!apply && limit > MAX_PREVIEW_LIMIT) {
    throw new Error(`Preview is limited to ${MAX_PREVIEW_LIMIT} records per run`);
  }
  return { all, apply, limit };
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

const summarizeCountMap = counts => [...counts]
  .map(([group, count]) => ({ group, count }))
  .sort((a, b) => a.group.localeCompare(b.group));

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  const { all, apply, limit } = parseOptions(process.argv.slice(2));
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const baseQuery = {
      validationErrors: SOURCE_CHANGED,
      entityType: { $in: PRODUCT_ENTITY_TYPES },
      status: 'success',
      provider: 'cloudflare',
    };
    const counts = new Map();
    let candidatesRead = 0;
    let validatedAndApproved = 0;
    let eligibleWrites = 0;
    let lastId = null;
    let batchNumber = 0;

    while (all || candidatesRead < limit) {
      const batchLimit = all ? BATCH_SIZE : Math.min(BATCH_SIZE, limit - candidatesRead);
      const batchQuery = lastId ? { ...baseQuery, _id: { $gt: lastId } } : baseQuery;
      const candidates = await LiveTranslationCache.find(batchQuery)
        .select('_id entityId targetLang entityType specKey fieldKey originalText translatedText provider status')
        .sort({ _id: 1 })
        .limit(batchLimit)
        .lean();
      if (candidates.length === 0) break;

      lastId = candidates[candidates.length - 1]._id;
      candidatesRead += candidates.length;
      batchNumber += 1;
      const productIds = [...new Set(candidates.map(({ entityId }) => entityId).filter(Boolean))];
      const products = await Product.find({ _id: { $in: productIds }, isDeleted: false })
        .select('name description brand specs technicalDescription descriptionImages promotions')
        .lean();
      const productsById = new Map(products.map(product => [String(product._id), product]));
      const approvedByLocale = new Map();
      const updates = [];
      const auditLogs = [];
      const batchCounts = new Map();
      let nextCandidateIndex = 0;
      const validateNext = async () => {
        while (true) {
          const index = nextCandidateIndex++;
          if (index >= candidates.length) return;
          const translation = candidates[index];
          const product = productsById.get(String(translation.entityId));
          const currentSource = product ? getCurrentSourceText(translation, product) : undefined;
          let outcome = !product ? 'product_missing' : 'source_differs';

          if (typeof currentSource === 'string'
            && currentSource.trim()
            && currentSource === translation.originalText) {
            const validation = await translationValidator.validateTranslation(
              currentSource,
              String(translation.translatedText ?? ''),
              translation.targetLang,
              translation.entityType,
            );
            outcome = validation.qualityStatus === 'approved' ? 'source_match_approved' : 'source_match_needs_review';
            if (validation.qualityStatus === 'approved') {
              validatedAndApproved += 1;
              const ids = approvedByLocale.get(translation.targetLang) || new Set();
              ids.add(String(translation.entityId));
              approvedByLocale.set(translation.targetLang, ids);
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
          const group = `${translation.targetLang || 'unknown'}:${translation.entityType}:${outcome}`;
          addCount(counts, group);
          addCount(batchCounts, group);
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(VALIDATION_CONCURRENCY, candidates.length) },
        validateNext,
      ));

      if (apply && updates.length > 0) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const writeResult = await LiveTranslationCache.bulkWrite(updates, { ordered: false, session });
            if (writeResult.matchedCount !== updates.length) {
              throw new Error('Some translations changed during validation; this batch was rolled back');
            }
            await TranslationQualityLog.insertMany(auditLogs, { ordered: false, session });
          });
        } finally {
          await session.endSession();
        }
        eligibleWrites += updates.length;
        for (const [targetLang, ids] of approvedByLocale) {
          await ProductTranslationSeederService._syncProductCatalogTranslations(targetLang, [...ids]);
        }
      }

      console.log(JSON.stringify({
        batch: batchNumber,
        candidatesRead,
        validatedAndApproved,
        eligibleWrites,
        batchResults: summarizeCountMap(batchCounts),
      }));
      if (!all && candidatesRead >= limit) break;
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'preview',
      readOnly: !apply,
      processedAll: all,
      candidateLimit: all ? 'all' : limit,
      candidatesRead,
      validatedAndApproved,
      eligibleWrites,
      countByLocaleTypeAndResult: summarizeCountMap(counts),
      cloudflareCalls: 0,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Source revalidation failed: ${error.message}`);
  process.exitCode = 1;
});
