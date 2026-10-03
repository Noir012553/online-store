const TranslationQualityLog = require('../models/TranslationQualityLog');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const Product = require('../models/Product');
const cloudflareAiService = require('../services/cloudflareAiService');
const productCatalogRetranslationService = require('../services/productCatalogRetranslationService');
const productTranslationService = require('../services/productTranslationService');
const translationValidator = require('../utils/translationValidator');
const translationReporter = require('../utils/translationReporter');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const productTranslationLock = require('../utils/productTranslationLock');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const {
  PRODUCT_ENTITY_TYPES: PRODUCT_ENTITY_TYPE_LIST,
  buildCatalogProductRetranslationQuery,
  buildLiveProductRetranslationQuery,
} = require('../utils/productRetranslationSelector');
const {
  clearFixedCheckpointEntries,
  clearProductFieldCheckpoint,
  getCompletedResult,
  hasCompleted,
  getWorkKey,
  markCompletedDurably,
} = require('../utils/retranslateProgress');

const PRODUCT_ENTITY_TYPES = new Set(PRODUCT_ENTITY_TYPE_LIST);
const isCloudflareQuotaError = (error) => {
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

class RetranslateSeeder {
  constructor() {
    this.stats = {
      totalToRetranslate: 0,
      matchedCount: 0,
      scheduledCount: 0,
      startedCount: 0,
      completedCount: 0,
      notStartedCount: 0,
      resumedCount: 0,
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
      concurrency = 1,
      checkpoint = null,
      renewDatabaseLock = null,
    } = options;

    this.stats = {
      totalToRetranslate: 0,
      matchedCount: 0,
      scheduledCount: 0,
      startedCount: 0,
      completedCount: 0,
      notStartedCount: 0,
      resumedCount: 0,
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
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Retranslate concurrency must be a positive integer');
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

    const query = buildLiveProductRetranslationQuery({
      ...safeFilter,
      entityType: requestedEntityType || { $in: [...PRODUCT_ENTITY_TYPES] },
      ...(lang ? { targetLang: lang } : {}),
    });
    const catalogQuery = buildCatalogProductRetranslationQuery({
      ...safeFilter,
      ...(lang ? { targetLang: lang } : {}),
    });

    let liveQuery = LiveTranslationCache.find(
      query,
      '_id hashKey originalText translatedText sourceLang targetLang entityId entityType specKey fieldKey version provider qualityScore validationErrors createdAt',
    ).sort({ createdAt: 1, _id: 1 });
    let catalogQueryBuilder = ProductCatalogTranslationCache.find(
      catalogQuery,
      '_id entityId targetLang sourceHash name validationErrors status qualityStatus createdAt',
    ).sort({ createdAt: 1, _id: 1 });
    const [liveTranslations, catalogTranslations] = await Promise.all([
      liveQuery.lean(),
      requestedEntityType ? [] : catalogQueryBuilder.lean(),
    ]);
    const candidates = [
      ...catalogTranslations.map(translation => ({ ...translation, retranslateSource: 'catalog' })),
      ...liveTranslations.map(translation => ({ ...translation, retranslateSource: 'live' })),
    ].sort((left, right) => (
      new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
      || String(left._id).localeCompare(String(right._id))
    ));
    const productCandidates = new Map();
    const toRetranslate = [];
    candidates.forEach((translation) => {
      const isProductTranslation = !requestedEntityType
        && translation.entityId
        && (translation.retranslateSource === 'catalog' || PRODUCT_ENTITY_TYPES.has(translation.entityType));
      if (!isProductTranslation) {
        toRetranslate.push(translation);
        return;
      }
      const key = JSON.stringify([translation.targetLang, String(translation.entityId)]);
      const group = productCandidates.get(key) || [];
      group.push(translation);
      productCandidates.set(key, group);
    });

    if (productCandidates.size > 0) {
      const productIds = [...new Set([...productCandidates.values()].flatMap(group => group.map(({ entityId }) => String(entityId))))];
      const products = dryRun
        ? []
        : await Product.find({ _id: { $in: productIds } })
          .select('name description brand specs technicalDescription descriptionImages promotions')
          .lean();
      const productsById = new Map(products.map(product => [String(product._id), product]));

      for (const group of productCandidates.values()) {
        const first = group[0];
        const catalog = group.find(({ retranslateSource }) => retranslateSource === 'catalog');
        const product = productsById.get(String(first.entityId));
        toRetranslate.push({
          ...first,
          entityId: String(first.entityId),
          sourceHash: product
            ? getProductTranslationSourceHash(product)
            : catalog?.sourceHash || first.sourceHash,
          retranslateSource: 'catalog',
        });
      }
    }

    toRetranslate.sort((left, right) => (
      new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
      || String(left._id).localeCompare(String(right._id))
    ));
    const resumedResults = checkpoint
      ? toRetranslate
        .map(translation => ({ translation, result: getCompletedResult(checkpoint, getWorkKey(translation)) }))
        .filter(({ result }) => result)
      : [];
    const resumedFixedCount = resumedResults.filter(({ result }) => result.fixed).length;
    const resumedNeedsAttention = resumedResults.filter(({ result }) => !result.fixed);
    this.stats.fixedCount = resumedFixedCount;
    this.stats.stillBrokenCount = resumedNeedsAttention.length;
    this.stats.stillBroken = resumedNeedsAttention.slice(0, 5).map(({ translation, result }) => ({
      _id: translation._id,
      originalText: String(translation.originalText || translation.name || '').slice(0, 240),
      translatedText: String(translation.translatedText || translation.name || '').slice(0, 240),
      validationErrors: result.validationErrors,
    }));
    const resumedCount = resumedResults.length;
    const pendingToRetranslate = toRetranslate.filter(
      translation => !hasCompleted(checkpoint, getWorkKey(translation)),
    );
    const limitedToRetranslate = limit > 0
      ? pendingToRetranslate.slice(0, limit)
      : pendingToRetranslate;

    this.stats.totalToRetranslate = limitedToRetranslate.length;
    this.stats.matchedCount = toRetranslate.length;
    this.stats.scheduledCount = limitedToRetranslate.length;
    this.stats.resumedCount = resumedCount;

    if (verbose) {
      console.log(`\n${CLI_SYMBOLS.progress} RETRANSLATION PROCESS`);
      console.log(CLI_SYMBOLS.divider.repeat(55));
      console.log(`\n${CLI_SYMBOLS.search} Matched ${toRetranslate.length} product translation jobs`);
      console.log(`   Completed checkpoint: ${resumedCount}; remaining this run: ${limitedToRetranslate.length}`);
      console.log(`   Source records: product catalog ${catalogTranslations.length}; field cache ${liveTranslations.length}`);
      console.log(`   Batch concurrency: ${concurrency}`);
    }

    const results = [];
    const groupsByProduct = new Map();
    limitedToRetranslate.forEach((translation) => {
      const groupKey = translation.entityId
        ? JSON.stringify([translation.targetLang, String(translation.entityId)])
        : `record:${translation._id}`;
      const group = groupsByProduct.get(groupKey) || [];
      group.push(translation);
      groupsByProduct.set(groupKey, group);
    });
    const workGroups = [...groupsByProduct.values()];
    let nextGroupIndex = 0;
    let stopScheduling = false;
    let completedCount = 0;
    const processNextGroup = async () => {
      while (!stopScheduling) {
        const groupIndex = nextGroupIndex++;
        if (groupIndex >= workGroups.length) return;

        for (const translation of workGroups[groupIndex]) {
          if (stopScheduling) return;

          let releaseProductLock;
          try {
            if (dryRun) {
              results.push({
                status: 'dry-run',
                originalId: translation._id,
              });
              continue;
            }

            this.stats.startedCount++;
            if (translation.retranslateSource === 'catalog') {
              const outcome = await productCatalogRetranslationService.retranslateProduct(
                translation.entityId,
                translation.targetLang,
                { checkpoint, parallelProducts: concurrency },
              );
              const updatedTranslation = outcome.translation || outcome.candidate;
              const validationErrors = outcome.candidate?.validationErrors
                || updatedTranslation?.validationErrors
                || [];
              const wasFixed = outcome.committed
                && updatedTranslation?.qualityStatus === 'approved'
                && validationErrors.length === 0;
              if (wasFixed) {
                this.stats.fixedCount++;
              } else {
                this.stats.stillBrokenCount++;
                if (this.stats.stillBroken.length < 5) {
                  this.stats.stillBroken.push({
                    _id: updatedTranslation._id,
                    originalText: String(translation.name || '').slice(0, 240),
                    translatedText: String(updatedTranslation.name || '').slice(0, 240),
                    validationErrors,
                  });
                }
              }
              validationErrors.forEach(error => {
                if (!this.stats.breakdown[error]) {
                  this.stats.breakdown[error] = { count: 0, fixed: 0, broken: 0 };
                }
                this.stats.breakdown[error].count++;
                if (wasFixed) this.stats.breakdown[error].fixed++;
                else this.stats.breakdown[error].broken++;
              });
              results.push({
                status: outcome.committed ? 'success' : 'needs-review',
                originalId: translation._id,
                newId: outcome.translation?._id || null,
                wasFixed,
                validationErrors,
              });
              const updatedSourceHash = outcome.candidate?.sourceHash
                || outcome.translation?.sourceHash
                || translation.sourceHash;
              await markCompletedDurably(checkpoint, getWorkKey({
                ...translation,
                sourceHash: updatedSourceHash,
              }), {
                fixed: wasFixed,
                validationErrors,
              });
              if (wasFixed) {
                await clearProductFieldCheckpoint(
                  checkpoint,
                  String(translation.entityId),
                  translation.targetLang,
                );
              }
              await renewDatabaseLock?.();
              this.stats.completedCount++;
              continue;
            }

            if (PRODUCT_ENTITY_TYPES.has(translation.entityType) && translation.entityId) {
              releaseProductLock = await productTranslationLock.acquireProductTranslationLock(
                translation.entityId,
                translation.targetLang,
              );
            }

            const defaultLang = getDefaultLanguage().code;
            const sourceLang = translation.sourceLang || defaultLang;
            const translationResult = PRODUCT_ENTITY_TYPES.has(translation.entityType)
              ? await productTranslationService.translateWithCloudflare(
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
              status: 'success',
              provider: 'cloudflare',
              retryCount: 0,
              version: (translation.version || 1) + 1,
              previousVersion: translation._id,
              failoverReason: null,
              providerSource: 'primary',
              metadata: {},
              qualityStatus: newQualityStatus,
              qualityScore: newQualityScore,
              validationErrors: newValidationErrors,
              createdAt: new Date(),
            };

            const savedNewVersion = await LiveTranslationCache.findOneAndUpdate(
              { hashKey: newVersion.hashKey },
              { $setOnInsert: newVersion },
              { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
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
            const wasFixed = newQualityStatus === 'approved' && newValidationErrors.length === 0;
            if (wasFixed) {
              this.stats.fixedCount++;
            } else if (newValidationErrors.length > 0) {
              this.stats.stillBrokenCount++;
              if (this.stats.stillBroken.length < 5) {
                this.stats.stillBroken.push({
                  _id: savedNewVersion._id,
                  originalText: String(translation.originalText || '').slice(0, 240),
                  translatedText: String(newTranslation || '').slice(0, 240),
                  validationErrors: newValidationErrors,
                });
              }
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
              wasFixed,
              validationErrors: newValidationErrors,
            });
            await markCompletedDurably(checkpoint, getWorkKey(translation), {
              fixed: wasFixed,
              validationErrors: newValidationErrors,
            });
            await renewDatabaseLock?.();
            this.stats.completedCount++;
          } catch (error) {
            const recordLabel = String(translation.name || translation.originalText || translation._id)
              .replace(/\s+/g, ' ')
              .slice(0, 120);
            console.error(`\n${CLI_SYMBOLS.error} Retranslation failed for "${recordLabel}": ${error.message}`);
            this.stats.errorCount++;
            const quotaExhausted = isCloudflareQuotaError(error);
            const runLockLost = error.code === 'RETRANSLATE_LOCKED';
            if (quotaExhausted) {
              this.stats.quotaExceededCount++;
              console.error(`${CLI_SYMBOLS.error} Cloudflare AI quota is exhausted; stopping retranslation.`);
            }
            if (runLockLost) stopScheduling = true;
            results.push({
              status: 'error',
              originalId: translation._id,
              error: error.message,
            });
            if (quotaExhausted || runLockLost) {
              stopScheduling = true;
              break;
            }
          } finally {
            await releaseProductLock?.();
            completedCount++;
            if (verbose) {
              const progress = Math.round((completedCount / limitedToRetranslate.length) * 100);
              process.stdout.write(`\r${CLI_SYMBOLS.books} Processing: [${progress}%] ${completedCount}/${limitedToRetranslate.length}`);
            }
          }
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, workGroups.length) }, () => processNextGroup()),
    );
    const allCandidatesCompleted = checkpoint && toRetranslate.every(
      translation => hasCompleted(checkpoint, getWorkKey(translation)),
    );
    if (
      checkpoint
      && !dryRun
      && limit === 0
      && this.stats.errorCount === 0
      && !stopScheduling
      && allCandidatesCompleted
    ) {
      await clearFixedCheckpointEntries(checkpoint, toRetranslate.map(getWorkKey));
    }

    this.stats.notStartedCount = Math.max(0, this.stats.scheduledCount - this.stats.startedCount);
    const fixedThisRun = this.stats.fixedCount - resumedFixedCount;
    this.stats.remainingCount = Math.max(0, pendingToRetranslate.length - fixedThisRun)
      + resumedNeedsAttention.length;

    if (verbose) {
      console.log('\n');
      translationReporter.printRetranslateReport({
        input: {
          totalToRetranslate: this.stats.matchedCount,
          scheduledCount: this.stats.scheduledCount,
          startedCount: this.stats.startedCount,
          completedCount: this.stats.completedCount,
          notStartedCount: this.stats.notStartedCount,
          resumedCount: this.stats.resumedCount,
        },
        results: {
          fixedSuccessfully: this.stats.fixedCount,
          stillHasIssues: this.stats.stillBrokenCount,
          errors: this.stats.errorCount,
          remaining: this.stats.remainingCount,
        },
        detailedBreakdown: this.stats.breakdown,
        stillNeedsAttention: this.stats.stillBroken.map(item => ({
          original: item.originalText,
          current: item.translatedText,
          issues: item.validationErrors,
        })),
      });
    }

    // Save report
    if (!dryRun) {
      const report = await translationReporter.generateRetranslateReport(
        {
          totalToRetranslate: this.stats.matchedCount,
          scheduledCount: this.stats.scheduledCount,
          startedCount: this.stats.startedCount,
          completedCount: this.stats.completedCount,
          notStartedCount: this.stats.notStartedCount,
          resumedCount: this.stats.resumedCount,
          filters: { ...filter, lang, entityType, limit },
        },
        this.stats
      );
      translationReporter.saveReport(report);
    }

    return {
      success: !dryRun
        && this.stats.errorCount === 0
        && this.stats.stillBrokenCount === 0
        && this.stats.remainingCount === 0,
      dryRun,
      stats: this.stats,
      results,
    };
  }
}

module.exports = new RetranslateSeeder();
