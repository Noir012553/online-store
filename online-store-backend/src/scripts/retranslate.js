require('dotenv').config();
const mongoose = require('mongoose');
const retranslateSeeder = require('../seeds/retranslateSeeder');
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
      filter: {},
      lang: null,
      limit: 100,
      dryRun: args.includes('--dry-run'),
      validate: !args.includes('--no-validate'),
      verbose: true,
    };

    // Parse filter
    const filterArg = args.find(arg => arg.startsWith('--filter='));
    if (filterArg) {
      const filterValue = filterArg.split('=')[1];
      options.filter.validationErrors = filterValue;
    }

    // Parse language
    const langArg = args.find(arg => arg.startsWith('--lang='));
    if (langArg) {
      options.lang = langArg.split('=')[1];
    }

    // Parse limit
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    if (limitArg) {
      options.limit = parseInt(limitArg.split('=')[1]);
    }

    // Run retranslation
    const result = await retranslateSeeder.retranslate(options);

    if (result.success) {
      console.log(`\n${CLI_SYMBOLS.success} Retranslation completed successfully!`);
      process.exit(0);
    } else if (result.dryRun) {
      console.log(`\n${CLI_SYMBOLS.list} Dry-run completed. Use without --dry-run to actually retranslate.`);
      process.exit(0);
    } else {
      console.log(`\n${CLI_SYMBOLS.warning} Retranslation completed with some issues.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Retranslation failed:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();
