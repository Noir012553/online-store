const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const mongoose = require('mongoose');
const Product = require('../models/Product');
const { connectMongo } = require('../config/mongoConnection');
const {
  validateMigrationOptions,
  validateTargetDatabase,
  resolveLatestDatabaseBackup,
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
  const explicitBackupFile = getArgument('backup-file');
  const useLatestBackup = hasArgument('backup-latest=true');
  if (explicitBackupFile && useLatestBackup) {
    throw new Error('Use either --backup-file or --backup-latest=true, not both');
  }
  const backupFile = useLatestBackup
    ? resolveLatestDatabaseBackup(path.resolve(__dirname, '../../backups'), databaseName)
    : explicitBackupFile;
  validateMigrationOptions({
    mode,
    confirmation: getArgument('confirm'),
    backupFile,
    backupVerified: hasArgument('backup-verified=true'),
    databaseName,
  });

  await connectMongo();
  try {
    validateTargetDatabase(databaseName, mongoose.connection.name, mode);
    const report = await runTranslationReadinessMigration(Product.collection, mode);
    if (backupFile) console.log(`Backup archive: ${backupFile}`);
    console.log(JSON.stringify({ ...report, databaseName: mongoose.connection.name }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`[migrate-translation-readiness] ${error.message}`);
  process.exitCode = 1;
});
