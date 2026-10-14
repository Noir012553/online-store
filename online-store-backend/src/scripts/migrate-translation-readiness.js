const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const { connectMongo } = require('../config/mongoConnection');
const {
  validateMigrationOptions,
  validateTargetDatabase,
  runTranslationReadinessMigration,
} = require('../utils/translationReadinessMigration');

const hasArgument = (name) => process.argv.includes(`--${name}`);
const getArgument = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');
  const apply = hasArgument('apply');
  const rollback = hasArgument('rollback');
  if (apply && rollback) throw new Error('Use either --apply or --rollback, not both');

  const mode = rollback ? 'rollback' : apply ? 'apply' : 'dry-run';
  const databaseName = getArgument('database-name');
  validateMigrationOptions({
    mode,
    confirmation: getArgument('confirm'),
    backupFile: getArgument('backup-file'),
    backupVerified: hasArgument('backup-verified=true'),
    databaseName,
  });

  await connectMongo();
  try {
    validateTargetDatabase(databaseName, mongoose.connection.name, mode);
    const report = await runTranslationReadinessMigration(Product.collection, mode);
    console.log(JSON.stringify({ ...report, databaseName: mongoose.connection.name }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`[migrate-translation-readiness] ${error.message}`);
  process.exitCode = 1;
});
