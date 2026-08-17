const TranslationQualityLog = require('../models/TranslationQualityLog');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const translationValidator = require('../utils/translationValidator');
const translationReporter = require('../utils/translationReporter');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

class RetranslateSeeder {
  constructor() {
    this.stats = {
      totalToRetranslate: 0,
      fixedCount: 0,
      stillBrokenCount: 0,
      breakdown: {},
      stillBroken: [],
    };
  }

  async retranslate(options = {}) {
    const {
      filter = {},
      lang = null,
      entityType = null,
      limit = 100,
      dryRun = false,
      validate = true,
      verbose = true,
      actor = 'system',
    } = options;

    this.stats = {
      totalToRetranslate: 0,
      fixedCount: 0,
      stillBrokenCount: 0,
      breakdown: {},
      stillBroken: [],
    };

    const query = {
      ...filter,
      qualityStatus: 'needs_retranslate',
    };

    if (entityType) {
      query.entityType = entityType;
    }

    if (lang) {
      query.targetLang = lang;
    }

    // Get translations needing retranslation
    const toRetranslate = await LiveTranslationCache.find(query)
      .limit(limit)
      .lean();

    this.stats.totalToRetranslate = toRetranslate.length;

    if (verbose) {
      console.log(`\n${CLI_SYMBOLS.progress} RETRANSLATION PROCESS`);
      console.log(CLI_SYMBOLS.divider.repeat(55));
      console.log(`\n${CLI_SYMBOLS.search} Found ${toRetranslate.length} translations to retranslate`);
    }

    const results = [];
    for (let i = 0; i < toRetranslate.length; i++) {
      const translation = toRetranslate[i];

      if (verbose) {
        const progress = Math.round((i / toRetranslate.length) * 100);
        process.stdout.write(`\r${CLI_SYMBOLS.books} Processing: [${progress}%] ${i + 1}/${toRetranslate.length}`);
      }

      try {
        if (dryRun) {
          // Dry run: don't actually translate
          results.push({
            status: 'dry-run',
            originalId: translation._id,
            originalText: translation.originalText,
          });
          continue;
        }

        // Translate again
        const defaultLang = getDefaultLanguage().code;
        const newTranslation = await cloudflareAiService.translate(
          translation.originalText,
          defaultLang,
          translation.targetLang
        );

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
        const newQualityScore = validationResult?.qualityScore || null;
        const newValidationErrors = validationResult?.validationErrors || [];

        // Create new version
        const newVersion = {
          hashKey: `${translation.hashKey}:v${(translation.version || 1) + 1}`,
          originalText: translation.originalText,
          targetLang: translation.targetLang,
          translatedText: newTranslation,
          entityId: translation.entityId,
          entityType: translation.entityType,
          specKey: translation.specKey,
          version: (translation.version || 1) + 1,
          previousVersion: translation._id,
          retranslateReason: translation.validationErrors?.[0] || 'manual_retranslate',
          qualityStatus: newQualityStatus,
          qualityScore: newQualityScore,
          validationErrors: newValidationErrors,
          createdAt: new Date(),
        };

        // Save new version
        const savedNewVersion = await LiveTranslationCache.create(newVersion);

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
            version: newVersion.version,
            qualityScore: newQualityScore,
            validationErrors: newValidationErrors,
            previousVersionId: translation._id,
            oldQualityScore: translation.qualityScore,
            oldValidationErrors: translation.validationErrors,
          },
        });

        // Create log for OLD version (status changed to retranslated)
        await TranslationQualityLog.create({
          translationId: translation._id,
          action: 'retranslated',
          oldValue: translation.translatedText,
          newValue: newTranslation,
          actor,
          reason: `old_version_marked_as_retranslated`,
          metadata: {
            oldVersion: translation.version,
            newVersionId: savedNewVersion._id,
            oldQualityScore: translation.qualityScore,
            oldValidationErrors: translation.validationErrors,
          },
        });

        // Update stats
        const wasFixed = translation.validationErrors?.length > 0 && newValidationErrors.length === 0;
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
        results.push({
          status: 'error',
          originalId: translation._id,
          error: error.message,
        });
      }
    }

    if (verbose) {
      console.log('\n');
      translationReporter.printRetranslateReport({
        input: { totalToRetranslate: this.stats.totalToRetranslate },
        results: {
          fixedSuccessfully: this.stats.fixedCount,
          stillHasIssues: this.stats.stillBrokenCount,
        },
        detailedBreakdown: this.stats.breakdown,
        stillNeedsAttention: this.stats.stillBroken,
      });
    }

    // Save report
    if (!dryRun) {
      const report = translationReporter.generateRetranslateReport(
        { totalToRetranslate: this.stats.totalToRetranslate, filters: filter },
        this.stats
      );
      translationReporter.saveReport(report);
    }

    return {
      success: !dryRun,
      dryRun,
      stats: this.stats,
      results,
    };
  }
}

module.exports = new RetranslateSeeder();
