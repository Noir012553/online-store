/**
 * Dịch offline (không gọi provider) và ghi thành draft cho product catalog translation.
 *
 * Chế độ:
 *  --export : ghi file batch JSON từ nguồn MongoDB (read-only).
 *  --import : validate bằng validator của project, snapshot record cũ, ghi draft
 *             provider=assistant, providerSource=assistant_batch, qualityStatus=pending.
 *
 * Không in MONGO_URI/credential, không gọi Cloudflare.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const Product = require('../src/models/Product');
const ProductCatalogTranslationCache = require('../src/models/ProductCatalogTranslationCache');
const { SUPPORTED_LANGUAGES, getActiveLangCodes, getDefaultLanguage } = require('../src/config/languageInventory');
const { getProductTranslationSourceHash } = require('../src/utils/productTranslationFingerprint');
const { normalizeSpecs } = require('../src/utils/specNormalizer');
const { getCanonicalSpecKey } = require('../src/services/specKeyTranslationService');
const translationValidator = require('../src/utils/translationValidator');
const translationValidationConfig = require('../src/config/translationValidation');
const { refreshTranslationReadiness } = require('../src/services/translationHelper');

const isCompleteTranslation = (product, translation) => (
  Boolean(translation)
  && typeof translation.name === 'string' && translation.name.trim()
  && (typeof product.brand !== 'string' || !product.brand.trim() || (typeof translation.brand === 'string' && translation.brand.trim()))
  && (typeof product.description !== 'string' || !product.description.trim() || (typeof translation.description === 'string' && translation.description.trim()))
  && Object.keys(product.specs || {}).every(key => (
    typeof translation.specs?.[key] === 'string' && translation.specs[key].trim()
  ))
);

const PROMOTION_TEXT_FIELDS = ['title', 'giftProductName', 'scope', 'discountText'];
const SOURCE_SELECT = 'name description brand specs technicalDescription descriptionImages promotions isDeleted isPublished';
const REPORT_DIR = path.resolve(__dirname, '../reports/manual-translation');
const BACKUP_DIR = path.resolve(__dirname, '../backups/product-snapshots');
const MAX_RECORDS = 50;
const APPLY_CONFIRMATION = 'MANUAL_TRANSLATION';

const args = process.argv.slice(2);
const hasFlag = flag => args.includes(flag);
const getArg = name => {
  const prefix = `--${name}=`;
  return args.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
};

const mode = hasFlag('--export') ? 'export' : hasFlag('--import') ? 'import' : null;
const dryRun = !hasFlag('--apply');
const productIdArgument = (getArg('product-id') || '').toLowerCase();
const languagesArgument = getArg('languages') || getArg('lang');
const limit = Number(getArg('limit') || 5);
const batchPathArgument = getArg('batch');
const confirmation = getArg('confirm');

const targetLanguageCodes = getActiveLangCodes().filter(code => code !== getDefaultLanguage().code);
const supportedLanguageCodes = SUPPORTED_LANGUAGES.map(({ code }) => code);
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

class UserError extends Error {}

const fail = message => {
  throw new UserError(message);
};

const parseLanguages = () => {
  const requested = languagesArgument
    ? languagesArgument.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    : targetLanguageCodes;
  for (const code of requested) {
    if (!supportedLanguageCodes.includes(code)) fail(`Unsupported language: ${code}`);
    if (code === getDefaultLanguage().code) fail(`Source language cannot be a target: ${code}`);
  }
  return [...new Set(requested)];
};

const sourceSnapshot = product => ({
  name: product.name || '',
  description: product.description || '',
  brand: product.brand || '',
  specs: product.specs || {},
  technicalDescription: product.technicalDescription || '',
  descriptionImages: (product.descriptionImages || []).map(({ url, alt }) => ({ url, alt: alt || '' })),
  promotions: (product.promotions || []).map(promotion => ({
    type: promotion.type,
    title: promotion.title || '',
    giftQuantity: promotion.giftQuantity,
    giftProductName: promotion.giftProductName || '',
    giftProductUrl: promotion.giftProductUrl,
    giftValueVND: promotion.giftValueVND,
    scope: promotion.scope || '',
    discountText: promotion.discountText || '',
  })),
});

const basePromotionTranslation = promotion => ({
  type: promotion.type,
  giftQuantity: promotion.giftQuantity,
  giftProductUrl: promotion.giftProductUrl,
  giftValueVND: promotion.giftValueVND,
  title: '',
  giftProductName: '',
  scope: '',
  discountText: '',
});

const buildRecord = (product, targetLang, existing) => {
  const source = sourceSnapshot(product);
  const sourceHash = getProductTranslationSourceHash(product);
  const cacheMatchesSource = existing?.sourceHash === sourceHash;
  const current = cacheMatchesSource ? existing : null;
  const alreadyApproved = Boolean(current)
    && current.status === 'success'
    && current.qualityStatus === 'approved'
    && (current.validationErrors || []).length === 0
    && isCompleteTranslation(product, current);

  return {
    productId: String(product._id),
    productName: product.name || '',
    targetLang,
    sourceHash,
    needsTranslation: !alreadyApproved,
    currentStatus: existing
      ? {
        hashCurrent: cacheMatchesSource,
        status: existing.status,
        qualityStatus: existing.qualityStatus,
        validationErrors: existing.validationErrors || [],
        provider: existing.provider,
        providerSource: existing.providerSource,
      }
      : null,
    source,
    translations: current
      ? {
        name: current.name || '',
        description: current.description || '',
        brand: current.brand || '',
        specs: current.specs || {},
        technicalDescription: current.technicalDescription || '',
        descriptionImages: source.descriptionImages.map((image, index) => ({
          url: image.url,
          alt: current.descriptionImages?.[index]?.alt || '',
        })),
        promotions: source.promotions.map((promotion, index) => ({
          ...basePromotionTranslation(promotion),
          title: current.promotions?.[index]?.title || '',
          giftProductName: current.promotions?.[index]?.giftProductName || '',
          scope: current.promotions?.[index]?.scope || '',
          discountText: current.promotions?.[index]?.discountText || '',
        })),
      }
      : {
        name: '',
        description: '',
        brand: '',
        specs: Object.fromEntries(Object.keys(source.specs || {}).map(key => [key, ''])),
        technicalDescription: '',
        descriptionImages: source.descriptionImages.map(image => ({ url: image.url, alt: '' })),
        promotions: source.promotions.map(basePromotionTranslation),
      },
    manualFields: existing?.manualFields || [],
  };
};

const connect = async () => {
  if (!process.env.MONGO_URI) fail('MONGO_URI is not configured in online-store-backend/.env');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  return mongoose.connection.db.databaseName;
};

const runExport = async () => {
  const languages = parseLanguages();
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) fail(`--limit must be 1..${MAX_RECORDS}`);

  const productIds = productIdArgument
    ? [...new Set(productIdArgument.split(',').map(value => value.trim().toLowerCase()).filter(Boolean))]
    : [];
  if (productIds.some(id => !/^[a-f\d]{24}$/.test(id))) fail('--product-id must be a comma separated list of 24-character ids');

  const databaseName = await connect();
  try {
    const filter = { isDeleted: { $ne: true } };
    if (productIds.length > 0) filter._id = { $in: productIds };
    const products = await Product.find(filter)
      .sort({ updatedAt: -1 })
      .limit(productIds.length > 0 ? productIds.length : limit)
      .select(SOURCE_SELECT)
      .lean();
    if (products.length === 0) fail('No matching active products found');

    const existing = await ProductCatalogTranslationCache.find({
      entityId: { $in: products.map(product => String(product._id)) },
      targetLang: { $in: languages },
    }).lean();
    const existingByKey = new Map(existing.map(translation => [
      `${translation.entityId}:${translation.targetLang}`,
      translation,
    ]));

    const records = products.flatMap(product => languages.map(targetLang => buildRecord(
      product,
      targetLang,
      existingByKey.get(`${String(product._id)}:${targetLang}`),
    )));
    const pendingRecords = records.filter(record => record.needsTranslation);

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const batchFile = path.join(REPORT_DIR, `manual-batch-${timestamp()}.json`);
    const payload = {
      workflow: 'manual_translation',
      generatedAt: new Date().toISOString(),
      databaseName,
      sourceLang: getDefaultLanguage().code,
      targetLangs: languages,
      validatorApprovalThreshold: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL,
      instructions: [
        'Fill the translations object of every record; keep productId, targetLang, sourceHash and source unchanged.',
        'Keep brand, model, SKU, numbers, units and technical tokens exactly as in source; do not invent specs.',
        'Do not change array/object shape, image URLs or numeric promotion values.',
        'Leave a field empty when the source value is empty.',
        'Validator quirk: the inconsistency check requires translation to match the approved LiveTranslationCache record for the same source text, otherwise it returns "inconsistent". To avoid false positives, copy the existing Cloudflare translation verbatim for the fields listed as approved/consistent; only write genuinely new text where no approved translation exists.',
      ],
      records: pendingRecords,
    };
    fs.writeFileSync(batchFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(JSON.stringify({
      mode: 'export',
      databaseName,
      targetLangs: languages,
      productCount: products.length,
      recordCount: records.length,
      pendingRecords: pendingRecords.length,
      alreadyApprovedSkipped: records.length - pendingRecords.length,
      batchFile,
    }, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

const validateRecord = async (product, record) => {
  const targetLang = record.targetLang;
  const translations = record.translations || {};
  const fieldResults = [];
  const optionalFieldWarnings = [];

  const validateField = async (label, source, translated, entityType) => {
    if (typeof source !== 'string' || !source.trim()) return;
    if (typeof translated !== 'string' || !translated.trim()) {
      fieldResults.push({ field: label, status: 'missing', errors: ['missing_translation'], score: 0 });
      return;
    }
    const validation = await translationValidator.validateTranslation(source, translated, targetLang, entityType);
    fieldResults.push({
      field: label,
      status: validation.qualityStatus,
      errors: validation.validationErrors,
      score: validation.qualityScore,
    });
  };

  await validateField('name', product.name, translations.name, 'product_name');
  await validateField('brand', product.brand, translations.brand, 'product_brand');
  await validateField('description', product.description, translations.description, 'product_description');
  await validateField('technicalDescription', product.technicalDescription, translations.technicalDescription, 'product_technical_description');

  const translatedSpecs = normalizeSpecs(translations.specs || {});
  for (const [key, value] of Object.entries(product.specs || {})) {
    const translatedKey = Object.keys(translatedSpecs)
      .find(candidate => getCanonicalSpecKey(candidate) === getCanonicalSpecKey(key));
    await validateField(
      `specs.${key}`,
      String(value ?? ''),
      translatedKey ? String(translatedSpecs[translatedKey] ?? '') : '',
      'product_spec',
    );
  }

  for (const [index, image] of (product.descriptionImages || []).entries()) {
    if (typeof image?.alt !== 'string' || !image.alt.trim()) continue;
    const validation = await translationValidator.validateTranslation(
      image.alt,
      translations.descriptionImages?.[index]?.alt || '',
      targetLang,
      'product_description_image_alt',
    );
    if (validation.validationErrors.length > 0) {
      optionalFieldWarnings.push({ fieldKey: `descriptionImages.${index}.alt`, validationErrors: validation.validationErrors });
    }
  }

  for (const [index, promotion] of (product.promotions || []).entries()) {
    for (const field of PROMOTION_TEXT_FIELDS) {
      await validateField(
        `promotions.${index}.${field}`,
        promotion?.[field],
        translations.promotions?.[index]?.[field],
        'product_promotion',
      );
    }
  }

  const blocking = fieldResults.filter(result => result.status !== 'approved');
  const scores = fieldResults.map(result => result.score).filter(score => Number.isFinite(score));
  const qualityScore = scores.length ? Math.min(...scores) : null;
  const validationErrors = [...new Set(fieldResults.flatMap(result => result.errors))];
  return {
    qualityScore,
    validationErrors,
    optionalFieldWarnings,
    blocking,
    approvable: blocking.length === 0
      && validationErrors.length === 0
      && (qualityScore ?? 0) >= translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL,
  };
};

const writeSnapshot = (databaseName, productId, entries) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `manual-translation-${productId}-${timestamp()}.json`);
  const content = JSON.stringify({
    createdAt: new Date().toISOString(),
    databaseName,
    productId,
    cacheEntries: entries,
  }, null, 2);
  fs.writeFileSync(file, content, 'utf8');
  return {
    file,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: Buffer.byteLength(content),
  };
};

const buildCacheUpdate = (product, record, validation) => {
  const source = sourceSnapshot(product);
  const translations = record.translations || {};
  return {
    entityId: record.productId,
    targetLang: record.targetLang,
    name: translations.name,
    description: translations.description || '',
    brand: translations.brand || product.brand || '',
    specs: normalizeSpecs(translations.specs || {}),
    technicalDescription: translations.technicalDescription || '',
    descriptionImages: source.descriptionImages.map((image, index) => ({
      ...image,
      alt: translations.descriptionImages?.[index]?.alt || '',
    })),
    promotions: source.promotions.map((promotion, index) => {
      const translated = translations.promotions?.[index] || {};
      const next = { ...promotion };
      for (const field of PROMOTION_TEXT_FIELDS) {
        if (promotion[field] !== undefined) next[field] = translated[field] ?? promotion[field];
      }
      return next;
    }),
    sourceHash: getProductTranslationSourceHash(product),
    status: 'success',
    provider: 'assistant',
    providersUsed: ['assistant'],
    providerSource: 'assistant_batch',
    qualityStatus: 'pending',
    qualityScore: validation.qualityScore,
    validationErrors: validation.validationErrors,
    optionalFieldWarnings: validation.optionalFieldWarnings,
    approvedBy: null,
    approvedAt: null,
    approvalReview: null,
    manualFields: [],
    lastTranslatedAt: new Date(),
  };
};

const runImport = async () => {
  if (!batchPathArgument) fail('Pass --batch=<path to exported json>');
  const batchPath = path.resolve(process.cwd(), batchPathArgument);
  if (!fs.existsSync(batchPath)) fail(`Batch file not found: ${batchPath}`);
  if (!dryRun && confirmation !== APPLY_CONFIRMATION) fail(`Apply requires --confirm=${APPLY_CONFIRMATION}`);

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  } catch (error) {
    fail(`Batch file is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(batch?.records) || batch.records.length === 0) fail('Batch has no records');
  if (batch.records.length > MAX_RECORDS) fail(`Batch exceeds ${MAX_RECORDS} records`);

  const recordKeys = new Set();
  for (const record of batch.records) {
    if (!/^[a-f\d]{24}$/.test(record?.productId || '')) fail(`Invalid productId in record: ${record?.productId}`);
    if (!supportedLanguageCodes.includes(record?.targetLang) || record.targetLang === getDefaultLanguage().code) {
      fail(`Invalid targetLang in record: ${record?.targetLang}`);
    }
    const key = `${record.productId}:${record.targetLang}`;
    if (recordKeys.has(key)) fail(`Duplicate record ${key}`);
    recordKeys.add(key);
  }

  const databaseName = await connect();
  try {
    const plans = [];
    for (const record of batch.records) {
      const product = await Product.findById(record.productId).select(SOURCE_SELECT).lean();
      if (!product || product.isDeleted === true) {
        plans.push({ record, action: 'skip', reason: 'product_not_found_or_deleted' });
        continue;
      }
      if (record.sourceHash !== getProductTranslationSourceHash(product)) {
        plans.push({ record, action: 'skip', reason: 'source_changed' });
        continue;
      }
      const existing = await ProductCatalogTranslationCache.findOne({
        entityId: record.productId,
        targetLang: record.targetLang,
      }).lean();
      const alreadyApproved = existing
        && existing.sourceHash === record.sourceHash
        && existing.status === 'success'
        && existing.qualityStatus === 'approved'
        && (existing.validationErrors || []).length === 0
        && isCompleteTranslation(product, existing);
      if (alreadyApproved) {
        plans.push({ record, action: 'skip', reason: 'already_approved' });
        continue;
      }
      const manualFields = existing?.manualFields || [];
      if (manualFields.length > 0) {
        plans.push({ record, action: 'skip', reason: 'manual_fields_present', manualFields });
        continue;
      }
      const validation = await validateRecord(product, record);
      plans.push({
        record,
        product,
        existing,
        validation,
        action: validation.approvable ? 'draft' : 'rejected',
      });
    }

    const summarize = plan => ({
      productId: plan.record.productId,
      targetLang: plan.record.targetLang,
      action: plan.action,
      reason: plan.reason,
      qualityScore: plan.validation?.qualityScore,
      validationErrors: plan.validation?.validationErrors,
      optionalFieldWarnings: plan.validation?.optionalFieldWarnings,
      blockingFields: plan.validation?.blocking,
    });
    const report = plans.map(summarize);

    if (dryRun) {
      console.log(JSON.stringify({
        mode: 'import-dry-run',
        databaseName,
        batchFile: batchPath,
        totalRecords: plans.length,
        wouldWriteDrafts: plans.filter(plan => plan.action === 'draft').length,
        skipped: plans.filter(plan => plan.action === 'skip').length,
        rejected: plans.filter(plan => plan.action === 'rejected').length,
        results: report,
      }, null, 2));
      return;
    }

    const writable = plans.filter(plan => plan.action === 'draft');
    const snapshots = writable.map(plan => writeSnapshot(
      databaseName,
      plan.record.productId,
      plan.existing ? [plan.existing] : [],
    ));
    const written = [];
    for (const plan of writable) {
      await ProductCatalogTranslationCache.updateOne(
        { entityId: plan.record.productId, targetLang: plan.record.targetLang },
        { $set: buildCacheUpdate(plan.product, plan.record, plan.validation) },
        { upsert: true },
      );
      written.push({
        productId: plan.record.productId,
        targetLang: plan.record.targetLang,
        qualityScore: plan.validation.qualityScore,
      });
    }

    const productIds = [...new Set(written.map(entry => entry.productId))];
    if (productIds.length > 0) await refreshTranslationReadiness(productIds);

    console.log(JSON.stringify({
      mode: 'import-apply',
      databaseName,
      batchFile: batchPath,
      writtenCount: written.length,
      written,
      skipped: report.filter(row => row.action === 'skip'),
      rejected: report.filter(row => row.action === 'rejected'),
      snapshots,
      note: 'Draft saved with qualityStatus=pending (provider=assistant). Approve in admin translationsDynamic.',
    }, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

const run = async () => {
  if (!mode) fail('Use --export or --import (with --batch=<file>)');
  if (mode === 'export') await runExport();
  else await runImport();
};

run().catch((error) => {
  console.error(`[manual-product-translation] ${error instanceof UserError ? error.message : `${error.name}: ${error.message}`}`);
  process.exitCode = 1;
});
