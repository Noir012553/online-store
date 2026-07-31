require('dotenv').config();
const mongoose = require('mongoose');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const translationReporter = require('../utils/translationReporter');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const args = process.argv.slice(2);

async function main() {
  try {
    // Connect to MongoDB
    console.log(`${CLI_SYMBOLS.connection} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);

    // Parse options
    const options = {
      status: 'needs_retranslate',
      lang: null,
      limit: 100,
      offset: 0,
      export: null,
    };

    const filter = {};

    // Parse status
    const statusArg = args.find(arg => arg.startsWith('--status='));
    if (statusArg) {
      options.status = statusArg.split('=')[1];
      filter.qualityStatus = options.status;
    } else {
      filter.qualityStatus = options.status;
    }

    // Parse filter
    const filterArg = args.find(arg => arg.startsWith('--filter='));
    if (filterArg) {
      const filterValue = filterArg.split('=')[1];
      filter.validationErrors = filterValue;
    }

    // Parse language
    const langArg = args.find(arg => arg.startsWith('--lang='));
    if (langArg) {
      options.lang = langArg.split('=')[1];
      filter.targetLang = options.lang;
    }

    // Parse limit
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    if (limitArg) {
      options.limit = parseInt(limitArg.split('=')[1]);
    }

    // Parse offset
    const offsetArg = args.find(arg => arg.startsWith('--offset='));
    if (offsetArg) {
      options.offset = parseInt(offsetArg.split('=')[1]);
    }

    // Check for translation ID (view single translation)
    const idArg = args.find(arg => arg.startsWith('--id='));
    if (idArg) {
      const translationId = idArg.split('=')[1];
      const translation = await LiveTranslationCache.findById(translationId).lean();

      if (!translation) {
        console.log(`${CLI_SYMBOLS.error} Translation not found`);
        process.exit(1);
      }

      console.log(`\n${CLI_SYMBOLS.list} Translation Detail`);
      console.log(CLI_SYMBOLS.divider.repeat(55));
      console.log(`ID:           ${translation._id}`);
      console.log(`Original:     "${translation.originalText}"`);
      console.log(`Translated:   "${translation.translatedText}"`);
      console.log(`Language:     ${translation.targetLang}`);
      console.log(`Entity Type:  ${translation.entityType}`);
      console.log(`Status:       ${translation.qualityStatus}`);
      console.log(`Quality:      ${translation.qualityScore}/100`);
      console.log(`Errors:       ${translation.validationErrors?.join(', ') || 'None'}`);
      console.log(`Version:      ${translation.version}`);
      console.log(`Created:      ${translation.createdAt}`);
      console.log(`Reviewed:     ${translation.reviewedAt || 'Not yet'}`);
      console.log('\n');
      process.exit(0);
    }

    // Parse export format
    const exportArg = args.find(arg => arg.startsWith('--export='));
    if (exportArg) {
      options.export = exportArg.split('=')[1];
    }

    // Generate report
    const report = await translationReporter.generateDetailedReport(filter, options);

    if (options.export === 'json') {
      const filename = `${Date.now()}-translations.json`;
      translationReporter.saveReport(report, filename);
      console.log(`${CLI_SYMBOLS.success} Report exported to: ./translation-reports/${filename}\n`);
    } else if (options.export === 'csv') {
      const csv = convertToCSV(report.translations);
      console.log(csv);
    } else {
      // Default: print table
      printReport(report);
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Report generation failed:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

function printReport(report) {
  console.log(`\n${CLI_SYMBOLS.list} Translation Report`);
  console.log(CLI_SYMBOLS.divider.repeat(55));
  console.log(`Status:  ${report.filter.qualityStatus || 'all'}`);
  console.log(`Limit:   ${report.pagination.limit} results`);
  console.log(`Total:   ${report.pagination.total} | Page: ${report.pagination.offset / report.pagination.limit + 1}/${report.pagination.pages}\n`);

  if (report.translations.length === 0) {
    console.log(`${CLI_SYMBOLS.success} No translations found matching criteria.\n`);
    return;
  }

  report.translations.forEach((t, idx) => {
    console.log(`${CLI_SYMBOLS.firstBranch} #${idx + 1}. ${t.original.substring(0, 40)}${t.original.length > 40 ? '...' : ''}`);
    console.log(`${CLI_SYMBOLS.branch} Original:  "${t.original}"`);
    console.log(`${CLI_SYMBOLS.branch} Translated: "${t.translated}"`);
    console.log(`${CLI_SYMBOLS.branch} Language:   ${t.language}`);
    console.log(`${CLI_SYMBOLS.branch} Status:     ${t.qualityStatus}`);
    console.log(`${CLI_SYMBOLS.branch} Score:      ${t.qualityScore}/100`);
    console.log(`${CLI_SYMBOLS.branch} Errors:     ${t.validationErrors?.length > 0 ? t.validationErrors.join(', ') : 'None'}`);
    console.log(`${CLI_SYMBOLS.lastBranch} Created:    ${new Date(t.createdAt).toLocaleDateString()}\n`);
  });

  console.log('');
}

function convertToCSV(translations) {
  const headers = ['ID', 'Original', 'Translated', 'Language', 'Status', 'Score', 'Errors', 'Created'];
  const rows = translations.map(t => [
    t.id,
    `"${t.original.replace(/"/g, '""')}"`,
    `"${t.translated.replace(/"/g, '""')}"`,
    t.language,
    t.qualityStatus,
    t.qualityScore,
    t.validationErrors?.join(';') || '',
    new Date(t.createdAt).toISOString(),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

main();
