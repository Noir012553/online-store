require('dotenv').config();
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const retranslateSeeder = require('../seeds/retranslateSeeder');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);

const parseLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--limit must be a non-negative integer; 0 means all matching records');
  }
  return parsed;
};

async function main() {
  const shutdownAfter = args.includes('--shutdown');
  let exitCode = 1;
  let shouldShutdown = false;

  try {
    if (shutdownAfter && process.platform !== 'win32') {
      throw new Error('--shutdown is only supported on Windows');
    }

    // Parse options
    const options = {
      filter: {},
      lang: null,
      limit: 0,
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
      options.limit = parseLimit(limitArg.split('=').slice(1).join('='));
    }

    // Connect to MongoDB
    console.log(`${CLI_SYMBOLS.connection} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected to MongoDB\n`);

    // Run retranslation
    const result = await retranslateSeeder.retranslate(options);

    if (result.success) {
      console.log(`\n${CLI_SYMBOLS.success} Retranslation completed successfully!`);
      exitCode = 0;
      shouldShutdown = shutdownAfter;
    } else if (result.dryRun) {
      console.log(`\n${CLI_SYMBOLS.list} Dry-run completed. Use without --dry-run to actually retranslate.`);
      exitCode = 0;
    } else {
      if (result.stats.quotaExceededCount > 0) {
        console.error(
          `${CLI_SYMBOLS.error} Translation providers unavailable (Cloudflare rate limit/quota and no usable failover). ${result.stats.remainingCount} translation(s) remain for the next run.`,
        );
      }
      console.log(`\n${CLI_SYMBOLS.warning} Retranslation completed with some issues.`);
      exitCode = 1;
    }
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Retranslation failed:`, error.message);
    exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }

  if (shouldShutdown) {
    try {
      await execFileAsync('shutdown.exe', ['/s', '/t', '60']);
      console.log('Windows shutdown scheduled in 60 seconds. Cancel with: shutdown /a');
    } catch (error) {
      console.error('Could not schedule Windows shutdown:', error.message);
      exitCode = 1;
    }
  }

  process.exitCode = exitCode;
}

main();
