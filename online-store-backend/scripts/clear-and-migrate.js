/**
 * Re-run the translation migration without overwriting existing cache entries
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

async function clearAndMigrate() {
  try {
    console.log(`${CLI_SYMBOLS.wrench} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${CLI_SYMBOLS.success} Connected\n`);

    console.log(`${CLI_SYMBOLS.wait} Running an idempotent migration; existing cache entries will be preserved...\n`);

    const migration = require('./migrate-translations');
    const service = new migration();
    await service.run();

  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error:`, error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

clearAndMigrate();
