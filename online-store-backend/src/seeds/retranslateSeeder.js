const TranslationQualityLog = require('../models/TranslationQualityLog');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const productCatalogRetranslationService = require('../services/productCatalogRetranslationService');
const libretranslateProductService = require('../services/libretranslateProductService');
const translationValidator = require('../utils/translationValidator');
const translationReporter = require('../utils/translationReporter');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const translationValidationConfig = require('../config/translationValidation');

const TRANSLATION_PROVIDERS = LiveTranslationCache.schema.path('provider').enumValues;
const TRANSLATION_STATUSES = [
  ...LiveTranslationCache.schema.path('status').enumValues,
  'fallback_libretranslate',
];
const FAILED_TRANSLATION_STATUSES = LiveTranslationCache.schema.path('status').enumValues
  .filter(status => status.startsWith('failed_') || status.endsWith('_retry'));
const CATALOG_RETRYABLE_STATUSES = ProductCatalogTranslationCache.schema.path('status').enumValues
  .filter(status => status.startsWith('failed_') || status.endsWith('_retry'));
const LIVE_RETRANSLATE_QUALITY_STATUSES = LiveTranslationCache.schema.path('qualityStatus').enumValues
  .filter(status => /retranslat|reject/i.test(status));
const CATALOG_RETRANSLATE_QUALITY_STATUSES = ProductCatalogTranslationCache.schema.path('qualityStatus').enumValues
  .filter(status => /retranslat|reject/i.test(status));
const isCloudflareQuotaError = (error) => {
  if (error?.cloudflareRateLimited) return true;
  const status = error?.response?.status ?? error?.statusCode;
  if (status === 420 || status === 429) return true;
  const providerErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
    : [];
  const providerMessages = [
    error?.message,
    error?.response?.data?.message,
    ...providerErrors.map(({ message }) => message),
  ].filter(Boolean).join(' ');
  return /CLOUDFLARE_AI_(?:REQUEST|INPUT)_BUDGET_EXCEEDED|CLOUDFLARE_AI_BUDGET_NOT_CONFIGURED|rate[\s-]?limit|quota|too many requests/i.test(providerMessages);
};

const PRODUCT_ENTITY_TYPES = new Set([
  'product_name',
  'product_description',
  'product_spec',
  'product_technical_description',
  'product_description_image_alt',
  'product_promotion',
]);

class RetranslateSeeder {
  constructor() {
    this.stats = {
      totalToRetranslate: 0,
      fixedCount: 0,
      stillBrokenCount: 0,
      errorCount: 0,
      quotaExceededCount: 0,
      remainingCount: 0,
      breakdown: {},
      stillBroken: [],
    };
  }

  async retranslate(options = {}) {
    const {
      filter = {},
      lang = null,
      entityType = null,
      limit = 0,
      dryRun = false,
      validate = true,
      verbose = true,
      actor = 'system',
    } = options;

    this.stats = {
      totalToRetranslate: 0,
      fixedCount: 0,
      stillBrokenCount: 0,
      errorCount: 0,
      quotaExceededCount: 0,
      remainingCount: 0,
      breakdown: {},
      stillBroken: [],
    };

    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error('Retranslate limit must be a non-negative integer; 0 means all matching records');
    }

    const {
      provider: ignoredProvider,
      status: ignoredStatus,
      qualityStatus: ignoredQualityStatus,
      $or: ignoredConditions,
      entityType: filterEntityType,
      ...safeFilter
    } = filter;
    const requestedEntityType = entityType || filterEntityType;
    if (requestedEntityType && !PRODUCT_ENTITY_TYPES.has(requestedEntityType)) {
      throw new Error(`Unsupported product entity type: ${requestedEntityType}`);
    }

    const query = {
      ...safeFilter,
      provider: { $in: TRANSLATION_PROVIDERS },
      status: { $in: TRANSLATION_STATUSES },
      qualityStatus: { $ne: 'retranslated' },
      entityType: requestedEntityType || { $in: [...PRODUCT_ENTITY_TYPES] },
      $or: [
        { status: { $in: FAILED_TRANSLATION_STATUSES } },
        { qualityStatus: { $in: LIVE_RETRANSLATE_QUALITY_STATUSES } },
        { qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL } },
        { validationErrors: { $exists: true, $ne: [] } },
      ],
    };

    if (lang) {
      query.targetLang = lang;
    }

    const catalogQuery = {
      ...safeFilter,
      ...(lang ? { targetLang: lang } : {}),
      $or: [
        { status: { $in: CATALOG_RETRYABLE_STATUSES } },
        { qualityStatus: { $in: CATALOG_RETRANSLATE_QUALITY_STATUSES } },
        { qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL } },
        { validationErrors: { $exists: true, $ne: [] } },
      ],
    };

    let translationsQuery = LiveTranslationCache.find(query)
      .sort({ createdAt: 1, _id: 1 });
    let catalogTranslationsQuery = ProductCatalogTranslationCache.find(catalogQuery)
      .sort({ createdAt: 1, _id: 1 });
    if (limit > 0) {
      translationsQuery = translationsQuery.limit(limit);
      catalogTranslationsQuery = catalogTranslationsQuery.limit(limit);
    }
    const [liveTranslations, catalogTranslations] = await Promise.all([
      translationsQuery.lean(),
      requestedEntityType ? [] : catalogTranslationsQuery.lean(),
    ]);
    const toRetranslate = [
      ...catalogTranslations.map(translation => ({ ...translation, retranslateSource: 'catalog' })),
      ...liveTranslations.map(translation => ({ ...translation, retranslateSource: 'live' })),
    ].sort((left, right) => (
      new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
      || String(left._id).localeCompare(String(right._id))
    ));
    const limitedToRetranslate = limit > 0 ? toRetranslate.slice(0, limit) : toRetranslate;

    this.stats.totalToRetranslate = limitedToRetranslate.length;

    if (verbose) {
      console.log(`\n${CLI_SYMBOLS.progress} RETRANSLATION PROCESS`);
      console.log(CLI_SYMBOLS.divider.repeat(55));
      console.log(`\n${CLI_SYMBOLS.search} Found ${limitedToRetranslate.length} translations to retranslate`);
      console.log(`   Product catalog: ${catalogTranslations.length}; field cache: ${liveTranslations.length}`);
    }

    const results = [];
    for (let i = 0; i < limitedToRetranslate.length; i++) {
      const translation = limitedToRetranslate[i];

      if (verbose) {
        const progress = Math.round((i / limitedToRetranslate.length) * 100);
        process.stdout.write(`\r${CLI_SYMBOLS.books} Processing: [${progress}%] ${i + 1}/${limitedToRetranslate.length}`);
      }

      try {
        if (dryRun) {
          results.push({
            status: 'dry-run',
            originalId: translation._id,
            originalText: translation.originalText || translation.name,
          });
          continue;
        }

        if (translation.retranslateSource === 'catalog') {
          const { translation: updatedTranslation } = await productCatalogRetranslationService.retranslateProduct(
            translation.entityId,
            translation.targetLang,
          );
          const validationErrors = updatedTranslation.validationErrors || [];
          const wasFixed = updatedTranslation.qualityStatus === 'approved' && validationErrors.length === 0;
          if (wasFixed) {
            this.stats.fixedCount++;
          } else {
            this.stats.stillBrokenCount++;
            this.stats.stillBroken.push({
              _id: updatedTranslation._id,
              originalText: translation.name,
              translatedText: updatedTranslation.name,
              validationErrors,
            });
          }
          translation.validationErrors?.forEach(error => {
            if (!this.stats.breakdown[error]) {
              this.stats.breakdown[error] = { count: 0, fixed: 0, broken: 0 };
            }
            this.stats.breakdown[error].count++;
            if (wasFixed) this.stats.breakdown[error].fixed++;
            else this.stats.breakdown[error].broken++;
          });
          results.push({
            status: 'success',
            originalId: translation._id,
            newId: updatedTranslation._id,
            originalText: translation.name,
            oldTranslation: translation.name,
            newTranslation: updatedTranslation.name,
            wasFixed,
            validationErrors,
          });
          continue;
        }

        const defaultLang = getDefaultLanguage().code;
        const sourceLang = translation.sourceLang || defaultLang;
        const translationResult = PRODUCT_ENTITY_TYPES.has(translation.entityType)
          ? await libretranslateProductService.translateWithFailover(
            translation.originalText,
            sourceLang,
            translation.targetLang,
          )
          : {
            translatedText: await cloudflareAiService.translate(
              translation.originalText,
              sourceLang,
              translation.targetLang,
            ),
            provider: 'cloudflare',
          };
        const newTranslation = translationResult.translatedText;
        const translationProvider = translationResult.provider || 'cloudflare';
        const isLibreTranslateFailover = translationProvider === 'libretranslate';

        // Validate new translation
        let validationResult = null;
        if (validate) {
          validationResult = await translationValidator.validateTranslation(
            translation.originalText,
            newTranslation,
            translation.targetLang,
            translation.entityType || 'generic'
          );
        }

        const newQualityStatus = validationResult?.qualityStatus || 'pending';
        const newQualityScore = validationResult?.qualityScore ?? null;
        const newValidationErrors = validationResult?.validationErrors || [];

        // Create new version
        const newVersion = {
          hashKey: `${translation.hashKey}:v${(translation.version || 1) + 1}`,
          originalText: translation.originalText,
          sourceLang: translation.sourceLang || defaultLang,
          targetLang: translation.targetLang,
          translatedText: newTranslation,
          entityId: translation.entityId,
          entityType: translation.entityType,
          specKey: translation.specKey || null,
          fieldKey: translation.fieldKey || null,
          status: isLibreTranslateFailover ? 'translated_via_libre' : 'success',
          provider: translationProvider,
          retryCount: 0,
          version: (translation.version || 1) + 1,
          previousVersion: translation._id,
          failoverReason: translationResult.failoverReason
            || translation.retranslateReason
            || translation.validationErrors?.[0]
            || 'manual_retranslate',
          providerSource: isLibreTranslateFailover ? 'secondary_failover' : 'primary',
          metadata: isLibreTranslateFailover ? { secondary_provider: true } : {},
          qualityStatus: newQualityStatus,
          qualityScore: newQualityScore,
          validationErrors: newValidationErrors,
          createdAt: new Date(),
        };

        const savedNewVersion = await LiveTranslationCache.findOneAndUpdate(
          { hashKey: newVersion.hashKey },
          { $setOnInsert: newVersion },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // Update old version status → "retranslated"
        await LiveTranslationCache.updateOne(
          { _id: translation._id },
          {
            $set: {
              qualityStatus: 'retranslated',
              reviewNotes: `Auto-retranslated. New version: ${savedNewVersion._id}`,
            },
          }
        );

        // Create log for NEW version
        await TranslationQualityLog.create({
          translationId: savedNewVersion._id,
          action: 'retranslated',
          oldValue: translation.translatedText,
          newValue: newTranslation,
          actor,
          reason: `auto_retranslation: ${translation.validationErrors?.[0] || 'needs_retranslate'}`,
          metadata: {
            provider: newVersion.provider,
            providerSource: newVersion.providerSource,
            secondary_provider: isLibreTranslateFailover,
            version: newVersion.version,
            qualityScore: newQualityScore,
            validationErrors: newValidationErrors,
            previousVersionId: translation._id,
            oldQualityScore: translation.qualityScore,
            oldValidationErrors: translation.validationErrors,
          },
        });

        if (PRODUCT_ENTITY_TYPES.has(translation.entityType) && newQualityStatus === 'approved') {
          await ProductTranslationSeederService._syncProductCatalogTranslations(
            translation.targetLang,
            [translation.entityId],
          );
        }

        // Create log for OLD version (status changed to retranslated)
        await TranslationQualityLog.create({
          translationId: translation._id,
          action: 'retranslated',
          oldValue: translation.translatedText,
          newValue: newTranslation,
          actor,
          reason: `old_version_marked_as_retranslated`,
          metadata: {
            provider: translation.provider,
            providerSource: translation.providerSource,
            oldVersion: translation.version,
            newVersionId: savedNewVersion._id,
            oldQualityScore: translation.qualityScore,
            oldValidationErrors: translation.validationErrors,
          },
        });

        // Update stats
        const wasFixed = (
          translation.qualityScore < translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL
          || translation.validationErrors?.length > 0
        ) && newValidationErrors.length === 0;
        if (wasFixed) {
          this.stats.fixedCount++;
        } else if (newValidationErrors.length > 0) {
          this.stats.stillBrokenCount++;
          this.stats.stillBroken.push({
            _id: savedNewVersion._id,
            originalText: translation.originalText,
            translatedText: newTranslation,
            validationErrors: newValidationErrors,
          });
        }

        // Track breakdown by error type
        translation.validationErrors?.forEach(error => {
          if (!this.stats.breakdown[error]) {
            this.stats.breakdown[error] = { count: 0, fixed: 0, broken: 0 };
          }
          this.stats.breakdown[error].count++;
          if (wasFixed) {
            this.stats.breakdown[error].fixed++;
          } else if (newValidationErrors.length > 0) {
            this.stats.breakdown[error].broken++;
          }
        });

        results.push({
          status: 'success',
          originalId: translation._id,
          newId: savedNewVersion._id,
          originalText: translation.originalText,
          oldTranslation: translation.translatedText,
          newTranslation,
          wasFixed,
          validationErrors: newValidationErrors,
        });
      } catch (error) {
        console.error(`\n${CLI_SYMBOLS.error} Retranslation failed for "${translation.originalText}": ${error.message}`);
        this.stats.errorCount++;
        const quotaExhausted = isCloudflareQuotaError(error);
        if (quotaExhausted) {
          this.stats.quotaExceededCount++;
          console.error(`${CLI_SYMBOLS.error} All translation providers are unavailable; stopping retranslation.`);
        }
        results.push({
          status: 'error',
          originalId: translation._id,
          error: error.message,
        });
        if (quotaExhausted) break;
      }
    }
    this.stats.remainingCount = Math.max(0, limitedToRetranslate.length - results.length);

    if (verbose) {
      console.log('\n');
      translationReporter.printRetranslateReport({
        input: { totalToRetranslate: this.stats.totalToRetranslate },
        results: {
          fixedSuccessfully: this.stats.fixedCount,
          stillHasIssues: this.stats.stillBrokenCount,
          errors: this.stats.errorCount,
        },
        detailedBreakdown: this.stats.breakdown,
        stillNeedsAttention: this.stats.stillBroken,
      });
    }

    // Save report
    if (!dryRun) {
      const report = await translationReporter.generateRetranslateReport(
        { totalToRetranslate: this.stats.totalToRetranslate, filters: { ...filter, lang, entityType, limit } },
        this.stats
      );
      translationReporter.saveReport(report);
    }

    return {
      success: !dryRun && this.stats.errorCount === 0,
      dryRun,
      stats: this.stats,
      results,
    };
  }
}

module.exports = new RetranslateSeeder();
