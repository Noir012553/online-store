const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const { SUPPORTED_LANGUAGES } = require('../config/languageInventory');
const { analyzeTranslationReadiness } = require('../utils/storefrontReadinessReport');

const parseArgs = (args) => {
  const limitArgument = args.find((argument) => argument.startsWith('--limit='));
  const limit = limitArgument ? Number(limitArgument.slice('--limit='.length)) : 50;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  return { json: args.includes('--json'), limit };
};

const formatStatus = (value) => value || '(missing)';

const saveReport = (report) => {
  const reportDirectory = path.resolve(__dirname, '../../reports/translation-readiness');
  const generatedAt = new Date();
  const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDirectory, `translation-readiness-${timestamp}.json`);
  const reportData = { generatedAt: generatedAt.toISOString(), ...report };

  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(reportData, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { reportData, reportPath: path.relative(process.cwd(), reportPath) };
};

const printHumanReport = (report, limit) => {
  console.log('Translation readiness report (read-only)');
  console.log(`Active products: ${report.productCount}`);
  console.log(`Translation ready by current rules: ${report.translationReadyCount}`);
  console.log(`Translation not ready: ${report.translationNotReadyCount}`);
  console.log(`Stored translation-ready flag: ${report.storedTranslationReadyCount}; unchecked: ${report.translationUncheckedCount}; mismatches: ${report.translationReadinessMismatchCount}`);
  console.log(`Required translated locales: ${report.requiredLanguages.join(', ')}`);
  console.log('Translation records by locale / status / quality:');
  report.translationCounts.forEach((count) => {
    console.log(`  ${count.targetLang} | ${formatStatus(count.status)} | ${formatStatus(count.qualityStatus)}: ${count.records} records, ${count.uniqueProducts} products`);
  });
  console.log('Blocking reasons (slot counts, except source fields):');
  const reasons = Object.entries(report.reasonCounts).sort(([a], [b]) => a.localeCompare(b));
  if (reasons.length === 0) console.log('  none');
  reasons.forEach(([reason, count]) => console.log(`  ${reason}: ${count}`));

  console.log('Validation errors by locale:');
  if (report.validationErrorCounts.length === 0) console.log('  none');
  report.validationErrorCounts.forEach(({ targetLang, error, records, uniqueProducts }) => {
    console.log(`  ${targetLang} | ${error}: ${records} records, ${uniqueProducts} products`);
  });

  console.log('Optional field warnings (non-blocking):');
  const optionalWarnings = Object.entries(report.optionalWarningCounts || {}).sort(([a], [b]) => a.localeCompare(b));
  if (optionalWarnings.length === 0) console.log('  none');
  optionalWarnings.forEach(([warning, count]) => console.log(`  ${warning}: ${count}`));

  const productsWithWarnings = report.products.filter((product) => product.locales.some(
    ({ optionalFieldWarnings }) => optionalFieldWarnings?.length > 0,
  ));
  console.log(`Optional warning details (IDs only, ${Math.min(limit, productsWithWarnings.length)} of ${productsWithWarnings.length}):`);
  productsWithWarnings.slice(0, limit).forEach((product) => {
    const warnings = product.locales
      .filter(({ optionalFieldWarnings }) => optionalFieldWarnings?.length > 0)
      .flatMap(({ targetLang, optionalFieldWarnings }) => optionalFieldWarnings.map((warning) => (
        `${targetLang}:${warning.fieldKey}:${(warning.validationErrors || []).join('+')}`
      )))
      .join('; ');
    console.log(`  ${product.productId} | ${warnings}`);
  });

  const blockedProducts = report.products.filter((product) => !product.translationReady);
  console.log(`Product details (IDs only, ${Math.min(limit, blockedProducts.length)} of ${blockedProducts.length}):`);
  blockedProducts.slice(0, limit).forEach((product) => {
    const sourceReasons = product.missingSourceFields.length > 0
      ? `source_missing=${product.missingSourceFields.join(',')}`
      : '';
    const localeReasons = product.locales
      .map(({ targetLang, reasons }) => `${targetLang}:${reasons.join('+')}`)
      .join('; ');
    console.log(`  ${product.productId} | ${[sourceReasons, localeReasons].filter(Boolean).join(' | ')}`);
  });
};

const run = async () => {
  const { json, limit } = parseArgs(process.argv.slice(2));
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const products = await Product.find({ isDeleted: false })
    .select('_id name brand description specs technicalDescription descriptionImages promotions translationReady translationReadinessCheckedAt')
    .lean();
  const productIds = products.map((product) => String(product._id));
  const requiredLanguages = SUPPORTED_LANGUAGES
    .map(({ code }) => code)
    .filter((code) => code !== 'vi');
  const translations = productIds.length === 0
    ? []
    : await ProductCatalogTranslationCache.find({
      entityId: { $in: productIds },
      targetLang: { $in: requiredLanguages },
    })
      .select('entityId targetLang status qualityStatus validationErrors optionalFieldWarnings sourceHash name brand description specs')
      .lean();
  const report = analyzeTranslationReadiness(products, translations, requiredLanguages);
  const savedReport = saveReport(report);

  if (json) {
    console.error(`Report saved: ${savedReport.reportPath}`);
    console.log(JSON.stringify(savedReport.reportData, null, 2));
  } else {
    printHumanReport(report, limit);
    console.log(`Report file: ${savedReport.reportPath}`);
  }
};

run()
  .catch((error) => {
    console.error(`Translation-readiness report failed (${error?.name || 'Error'}); database details are hidden.`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  });
