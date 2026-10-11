const path = require('node:path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { SUPPORTED_LANGUAGES } = require('../config/languageInventory');
const { retranslateProduct } = require('../services/productCatalogRetranslationService');
const { getStorefrontVisibleProductIds } = require('../services/translationHelper');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const { containsNoInputTranslationResponse } = require('../utils/translationResponseGuard');
const {
  acquireDatabaseLock,
  acquireProgressLock,
  getDatabaseScope,
  getRetranslationLockKey,
  hydrateCheckpoint,
  openProductCheckpoint,
} = require('../utils/retranslateProgress');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run');
const limitArgument = args.find(argument => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.slice('--limit='.length)) : 0;
const requiredLanguages = SUPPORTED_LANGUAGES.map(({ code }) => code).filter(code => code !== 'vi');
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const getSpecEntries = specs => specs && typeof specs === 'object' ? Object.entries(specs) : [];

const isTranslationReady = (product, translation, sourceHash) => {
  if (!translation
    || translation.status !== 'success'
    || translation.qualityStatus !== 'approved'
    || translation.sourceHash !== sourceHash
    || (translation.validationErrors || []).length > 0
    || containsNoInputTranslationResponse(translation)
    || !hasText(translation.name)
    || !hasText(translation.brand)) {
    return false;
  }
  if (hasText(product.description) && !hasText(translation.description)) return false;

  const translatedSpecKeys = new Set(getSpecEntries(translation.specs)
    .filter(([, value]) => hasText(value))
    .map(([key]) => getCanonicalSpecKey(key))
    .filter(Boolean));
  return getSpecEntries(product.specs)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key]) => getCanonicalSpecKey(key))
    .filter(Boolean)
    .every(key => translatedSpecKeys.has(key));
};

const getBlockingReasons = (product, translation, sourceHash) => {
  const reasons = [];
  if (!translation) return ['missing_translation'];
  if (translation.status !== 'success') reasons.push('status_not_success');
  if (translation.qualityStatus !== 'approved') reasons.push('quality_not_approved');
  if (translation.sourceHash !== sourceHash) reasons.push('stale_source_hash');
  if ((translation.validationErrors || []).length > 0) reasons.push(...translation.validationErrors);
  if (containsNoInputTranslationResponse(translation)) reasons.push('invalid_translation_response');
  if (!hasText(translation.name) || !hasText(translation.brand)) reasons.push('missing_required_translation_fields');
  if (hasText(product.description) && !hasText(translation.description)) reasons.push('missing_description');

  const translatedSpecKeys = new Set(getSpecEntries(translation.specs)
    .filter(([, value]) => hasText(value))
    .map(([key]) => getCanonicalSpecKey(key))
    .filter(Boolean));
  const missingSpecKeys = getSpecEntries(product.specs)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key]) => getCanonicalSpecKey(key))
    .filter(key => key && !translatedSpecKeys.has(key));
  if (missingSpecKeys.length > 0) reasons.push(`missing_specs:${missingSpecKeys.join(',')}`);
  return [...new Set(reasons)];
};

const isQuotaError = error => {
  const status = error?.response?.status ?? error?.statusCode;
  const providerErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
    : [];
  const message = [error?.message, error?.response?.data?.message, ...providerErrors.map(entry => entry?.message)]
    .filter(Boolean)
    .join(' ');
  return status === 420 || status === 429 || /quota|rate[\s-]?limit|too many requests|CLOUDFLARE_AI_(?:REQUEST|INPUT)_BUDGET_EXCEEDED/i.test(message);
};

const parseOptions = () => {
  if (apply && dryRun) throw new Error('Use either --apply or --dry-run, not both');
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
  return { apply, limit };
};

const loadBacklog = async () => {
  const products = await Product.find({ isDeleted: false })
    .select('_id name brand description specs technicalDescription descriptionImages promotions')
    .sort({ _id: 1 })
    .lean();
  const productIds = products.map(product => String(product._id));
  const translations = productIds.length === 0
    ? []
    : await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      targetLang: { $in: requiredLanguages },
    })
      .select('entityId targetLang sourceHash status qualityStatus validationErrors name brand description specs')
      .lean();
  const translationsByKey = new Map(translations.map(translation => [
    JSON.stringify([String(translation.entityId), translation.targetLang]),
    translation,
  ]));
  const readyIds = await getStorefrontVisibleProductIds(products);
  const jobs = [];
  const blockedSources = [];

  for (const product of products) {
    const productId = String(product._id);
    if (readyIds.has(productId)) continue;
    const sourceHash = getProductTranslationSourceHash(product);
    const invalidLocales = requiredLanguages.flatMap(targetLang => {
      const translation = translationsByKey.get(JSON.stringify([productId, targetLang]));
      return isTranslationReady(product, translation, sourceHash)
        ? []
        : [{
          productId,
          targetLang,
          reasons: getBlockingReasons(product, translation, sourceHash),
        }];
    });

    if (!hasText(product.name) || !hasText(product.brand)) {
      blockedSources.push({
        productId,
        missingFields: ['name', 'brand'].filter(field => !hasText(product[field])),
      });
      continue;
    }
    jobs.push(...invalidLocales);
  }

  return { products, readyIds, jobs, blockedSources };
};

const printSummary = ({ products, readyIds, jobs, blockedSources }, limit) => {
  const selectedJobs = limit > 0 ? jobs.slice(0, limit) : jobs;
  const jobsByLocale = Object.fromEntries(requiredLanguages.map(locale => [
    locale,
    jobs.filter(job => job.targetLang === locale).length,
  ]));
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    checkedProducts: products.length,
    currentlyReady: readyIds.size,
    currentlyNotReady: products.length - readyIds.size,
    affectedProducts: new Set(jobs.map(job => job.productId)).size,
    candidateJobs: jobs.length,
    scheduledJobs: selectedJobs.length,
    jobsByLocale,
    sourceBlockedProducts: blockedSources.length,
    blockedSources,
    sampleJobs: selectedJobs.slice(0, 50),
  }, null, 2));
  return selectedJobs;
};

const run = async () => {
  const options = parseOptions();
  let releaseProgressLock;
  let databaseLock;
  let exitCode = 0;

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    if (!options.apply) {
      const backlog = await loadBacklog();
      printSummary(backlog, options.limit);
      return;
    }

    releaseProgressLock = acquireProgressLock();
    databaseLock = await acquireDatabaseLock(getRetranslationLockKey(getDatabaseScope(process.env.MONGO_URI)));
    const checkpoint = openProductCheckpoint(getDatabaseScope(process.env.MONGO_URI));
    await hydrateCheckpoint(checkpoint);
    const backlog = await loadBacklog();
    const jobs = printSummary(backlog, options.limit);
    const fieldConcurrency = Number(process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY || 1);
    if (!Number.isInteger(fieldConcurrency) || fieldConcurrency < 1) {
      throw new Error('PRODUCT_RETRANSLATION_FIELD_CONCURRENCY must be a positive integer');
    }

    for (const [index, job] of jobs.entries()) {
      console.log(`Processing ${index + 1}/${jobs.length}: ${job.productId} ${job.targetLang}`);
      try {
        const result = await retranslateProduct(job.productId, job.targetLang, {
          checkpoint,
          parallelProducts: fieldConcurrency,
        });
        if (!result.committed) {
          console.log(`Needs review: ${job.productId} ${job.targetLang} (${result.candidate?.validationErrors?.join(', ') || 'quality validation'})`);
          exitCode = 1;
          break;
        }
        await databaseLock.renew();
      } catch (error) {
        console.error(`Stopped at ${job.productId} ${job.targetLang}: ${error.message}`);
        exitCode = isQuotaError(error) ? 2 : 1;
        break;
      }
    }

    const finalBacklog = await loadBacklog();
    console.log(JSON.stringify({
      mode: 'apply-complete',
      readyForStorefront: finalBacklog.readyIds.size,
      notReady: finalBacklog.products.length - finalBacklog.readyIds.size,
      remainingJobs: finalBacklog.jobs.length,
      sourceBlockedProducts: finalBacklog.blockedSources.length,
    }, null, 2));
    if (finalBacklog.jobs.length > 0 || finalBacklog.blockedSources.length > 0) exitCode ||= 1;
  } finally {
    await databaseLock?.release();
    await mongoose.disconnect().catch(() => {});
    releaseProgressLock?.();
  }

  process.exitCode = exitCode;
};

run().catch(error => {
  console.error(`Storefront retranslation failed: ${error.message}`);
  process.exitCode = 1;
});
