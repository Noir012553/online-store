const fs = require('fs');
const path = require('path');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const config = require('../config/translationValidation');
const { CLI_SYMBOLS } = require('./cliSymbols');

class TranslationReporter {
  constructor() {
    this.reportDir = config.REPORT_DIR;
    this.ensureReportDir();
  }

  ensureReportDir() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async generateSeedReport(results) {
    const stats = await LiveTranslationCache.getQualityStats();
    const errorStats = await LiveTranslationCache.getValidationErrorStats();

    const report = {
      timestamp: new Date().toISOString(),
      type: 'seed',
      statistics: {
        totalTranslations: stats[0]?.totalTranslations || 0,
        approved: stats[0]?.approved || 0,
        pending: stats[0]?.pending || 0,
        needsRetranslate: stats[0]?.needsRetranslate || 0,
        rejected: stats[0]?.rejected || 0,
        avgQualityScore: Math.round(stats[0]?.avgQualityScore || 0),
      },
      issuesBreakdown: {},
      recommendations: [],
    };

    // Build issues breakdown
    errorStats.forEach(stat => {
      report.issuesBreakdown[stat._id] = {
        count: stat.count,
        percentage: ((stat.count / report.statistics.totalTranslations) * 100).toFixed(2) + '%',
      };
    });

    // Generate recommendations
    if (report.statistics.needsRetranslate > 0) {
      report.recommendations.push(`Fix ${report.statistics.needsRetranslate} translations needing retranslation`);
      report.recommendations.push('Run: npm run retranslate');
    }

    return report;
  }

  async generateRetranslateReport(beforeStats, afterStats) {
    const report = {
      timestamp: new Date().toISOString(),
      type: 'retranslate',
      input: {
        totalToRetranslate: beforeStats.totalToRetranslate,
        filters: beforeStats.filters || {},
      },
      results: {
        fixedSuccessfully: afterStats.fixedCount || 0,
        stillHasIssues: afterStats.stillBrokenCount || 0,
      },
      detailedBreakdown: afterStats.breakdown || {},
      stillNeedsAttention: [],
    };

    if (afterStats.stillBroken && afterStats.stillBroken.length > 0) {
      report.stillNeedsAttention = afterStats.stillBroken.map(item => ({
        original: item.originalText,
        current: item.translatedText,
        issues: item.validationErrors,
        suggestion: `Try retranslating again or manually approve: npm run translate:approve ${item._id}`,
      }));
    }

    return report;
  }

  async generateDetailedReport(filter = {}, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const query = filter;
    const total = await LiveTranslationCache.countDocuments(query);
    const translations = await LiveTranslationCache.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const report = {
      timestamp: new Date().toISOString(),
      type: 'detailed',
      filter,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
      translations: translations.map(t => ({
        id: t._id,
        original: t.originalText,
        translated: t.translatedText,
        language: t.targetLang,
        entityType: t.entityType,
        qualityScore: t.qualityScore,
        qualityStatus: t.qualityStatus,
        validationErrors: t.validationErrors,
        version: t.version,
        createdAt: t.createdAt,
        reviewedAt: t.reviewedAt,
      })),
    };

    return report;
  }

  async getTranslationHistory(translationId) {
    const history = await TranslationQualityLog.getHistory(translationId);
    const translation = await LiveTranslationCache.findById(translationId).lean();

    return {
      translation: {
        id: translation._id,
        originalText: translation.originalText,
        targetLang: translation.targetLang,
        currentTranslation: translation.translatedText,
        currentStatus: translation.qualityStatus,
        currentVersion: translation.version,
      },
      history: history.map(log => ({
        action: log.action,
        actor: log.actor,
        reason: log.reason,
        oldValue: log.oldValue,
        newValue: log.newValue,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    };
  }

  async getQualityStatsByLanguage(startDate = null, endDate = null) {
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const stats = await LiveTranslationCache.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$targetLang',
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'approved'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'pending'] }, 1, 0] } },
          needsRetranslate: { $sum: { $cond: [{ $eq: ['$qualityStatus', 'needs_retranslate'] }, 1, 0] } },
          avgScore: { $avg: '$qualityScore' },
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return stats.map(stat => ({
      language: stat._id,
      totalTranslations: stat.total,
      approved: stat.approved,
      approvalRate: ((stat.approved / stat.total) * 100).toFixed(2) + '%',
      pending: stat.pending,
      needsRetranslate: stat.needsRetranslate,
      avgQualityScore: Math.round(stat.avgScore),
    }));
  }

  saveReport(report, filename = null) {
    if (!config.SAVE_REPORTS) return null;

    const timestamp = new Date().toISOString().slice(0, 10);
    const reportType = report.type || 'report';
    const name = filename || `${timestamp}-${reportType}.json`;
    const filePath = path.join(this.reportDir, name);

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    return filePath;
  }

  printSeedReport(report) {
    console.log(`\n${CLI_SYMBOLS.success} SEED TRANSLATION REPORT`);
    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log(`\n${CLI_SYMBOLS.chart} OVERALL STATISTICS:`);
    console.log(`   Total translations: ${report.statistics.totalTranslations}`);
    console.log(`   ${CLI_SYMBOLS.success} Approved: ${report.statistics.approved} (${((report.statistics.approved / report.statistics.totalTranslations) * 100).toFixed(0)}%)`);
    console.log(`   ${CLI_SYMBOLS.warning} Pending: ${report.statistics.pending} (${((report.statistics.pending / report.statistics.totalTranslations) * 100).toFixed(0)}%)`);
    console.log(`   ${CLI_SYMBOLS.error} Needs retranslate: ${report.statistics.needsRetranslate} (${((report.statistics.needsRetranslate / report.statistics.totalTranslations) * 100).toFixed(0)}%)`);
    console.log(`   Rejected: ${report.statistics.rejected}`);

    if (Object.keys(report.issuesBreakdown).length > 0) {
      console.log(`\n${CLI_SYMBOLS.error} ISSUES BREAKDOWN:`);
      Object.entries(report.issuesBreakdown).forEach(([error, stat]) => {
        console.log(`   ${CLI_SYMBOLS.bullet} ${error}: ${stat.count} (${stat.percentage})`);
      });
    }

    console.log(`\n${CLI_SYMBOLS.list} NEXT STEPS:`);
    report.recommendations.forEach(rec => console.log(`   ${CLI_SYMBOLS.bullet} ${rec}`));

    if (config.SAVE_REPORTS) {
      console.log(`\n${CLI_SYMBOLS.report} Full report saved to: ./translation-reports`);
    }
    console.log('\n');
  }

  printRetranslateReport(report) {
    console.log(`\n${CLI_SYMBOLS.progress} RETRANSLATION REPORT`);
    console.log(CLI_SYMBOLS.divider.repeat(55));
    console.log(`\n${CLI_SYMBOLS.list} INPUT:`);
    console.log(`   Total to retranslate: ${report.input.totalToRetranslate}`);
    console.log(`\n${CLI_SYMBOLS.chart} RESULTS:`);
    console.log(`   ${CLI_SYMBOLS.success} Fixed successfully: ${report.results.fixedSuccessfully}`);
    console.log(`   ${CLI_SYMBOLS.error} Still has issues: ${report.results.stillHasIssues}`);

    if (report.stillNeedsAttention.length > 0) {
      console.log(`\n${CLI_SYMBOLS.warning} STILL NEEDS ATTENTION:`);
      report.stillNeedsAttention.slice(0, 5).forEach((item, idx) => {
        console.log(`   [${idx + 1}] "${item.original}"`);
        console.log(`       Current: "${item.current}"`);
        console.log(`       Issues: ${item.issues.join(', ')}`);
      });
      if (report.stillNeedsAttention.length > 5) {
        console.log(`   ... and ${report.stillNeedsAttention.length - 5} more`);
      }
    }

    console.log('\n');
  }
}

module.exports = new TranslationReporter();
