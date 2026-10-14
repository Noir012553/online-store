const fs = require('fs');
const path = require('path');

const validateMigrationOptions = ({ mode, confirmation, backupFile, backupVerified, databaseName }) => {
  if (!['dry-run', 'apply', 'rollback'].includes(mode)) {
    throw new Error('Migration mode must be dry-run, apply, or rollback');
  }
  if (mode === 'dry-run') return;

  const expectedConfirmation = mode === 'rollback'
    ? 'TRANSLATION_READINESS_ROLLBACK'
    : 'TRANSLATION_READINESS';
  if (confirmation !== expectedConfirmation) {
    throw new Error(`Operation requires --confirm=${expectedConfirmation}`);
  }
  if (!databaseName) {
    throw new Error('Apply and rollback require --database-name=<expected database>');
  }
  if (!backupFile || !backupVerified) {
    throw new Error('Apply and rollback require a verified backup file');
  }

  let backupStats;
  try {
    backupStats = fs.statSync(backupFile);
  } catch {
    throw new Error('Backup file does not exist or cannot be read');
  }
  if (!backupStats.isFile() || backupStats.size === 0) {
    throw new Error('Backup file must be a non-empty regular file');
  }
};

const validateTargetDatabase = (expectedDatabaseName, actualDatabaseName, mode) => {
  if (mode !== 'dry-run' && expectedDatabaseName !== actualDatabaseName) {
    throw new Error(`Connected database '${actualDatabaseName}' does not match --database-name '${expectedDatabaseName}'`);
  }
  if (mode === 'dry-run' && expectedDatabaseName && expectedDatabaseName !== actualDatabaseName) {
    throw new Error(`Connected database '${actualDatabaseName}' does not match --database-name '${expectedDatabaseName}'`);
  }
};

const resolveLatestDatabaseBackup = (backupDirectory, databaseName) => {
  if (!databaseName) throw new Error('Database name is required to select a backup');

  let entries;
  try {
    entries = fs.readdirSync(backupDirectory, { withFileTypes: true });
  } catch {
    throw new Error(`No backup directory found for database '${databaseName}'`);
  }

  const prefix = `${databaseName}-full-backup-`;
  const candidates = entries
    .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.archive.gz'))
    .map(({ name }) => {
      const fullPath = path.join(backupDirectory, name);
      const stats = fs.statSync(fullPath);
      return { fullPath, modifiedAt: stats.mtimeMs, size: stats.size };
    })
    .filter(({ size }) => size > 0)
    .sort((left, right) => right.modifiedAt - left.modifiedAt || right.fullPath.localeCompare(left.fullPath));

  if (candidates.length === 0) {
    throw new Error(`No non-empty full backup found for database '${databaseName}'`);
  }
  return candidates[0].fullPath;
};

const getSnapshot = async (collection) => {
  const [products, missingPublication, missingTranslationReadiness, legacyReadiness, published, translationReady] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ $or: [{ isPublished: { $exists: false } }, { isPublished: null }] }),
    collection.countDocuments({
      $or: [{ translationReady: { $exists: false } }, { translationReady: null }],
    }),
    collection.countDocuments({
      $or: [
        { storefrontReady: { $exists: true } },
        { storefrontReadinessCheckedAt: { $exists: true } },
      ],
    }),
    collection.countDocuments({ isPublished: true }),
    collection.countDocuments({ translationReady: true }),
  ]);

  return { products, missingPublication, missingTranslationReadiness, legacyReadiness, published, translationReady };
};

const runTranslationReadinessMigration = async (collection, mode = 'dry-run') => {
  if (!['dry-run', 'apply', 'rollback'].includes(mode)) {
    throw new Error('Migration mode must be dry-run, apply, or rollback');
  }

  const [conflictingReadiness, conflictingReadinessTimestamps] = await Promise.all([
    collection.countDocuments({
      storefrontReady: { $exists: true, $ne: null },
      translationReady: { $exists: true, $ne: null },
      $expr: { $ne: ['$storefrontReady', '$translationReady'] },
    }),
    collection.countDocuments({
      storefrontReadinessCheckedAt: { $exists: true, $ne: null },
      translationReadinessCheckedAt: { $exists: true, $ne: null },
      $expr: { $ne: ['$storefrontReadinessCheckedAt', '$translationReadinessCheckedAt'] },
    }),
  ]);
  if (conflictingReadiness > 0) {
    throw new Error(`${conflictingReadiness} products have conflicting readiness values`);
  }
  if (conflictingReadinessTimestamps > 0) {
    throw new Error(`${conflictingReadinessTimestamps} products have conflicting readiness timestamps`);
  }

  const before = await getSnapshot(collection);

  if (mode === 'apply') {
    await collection.updateMany(
      { $or: [{ isPublished: { $exists: false } }, { isPublished: null }] },
      { $set: { isPublished: true } },
    );
    await collection.updateMany(
      {
        storefrontReady: { $exists: true, $ne: null },
        $or: [{ translationReady: { $exists: false } }, { translationReady: null }],
      },
      [{ $set: { translationReady: '$storefrontReady' } }],
    );
    await collection.updateMany(
      { $or: [{ translationReady: { $exists: false } }, { translationReady: null }] },
      { $set: { translationReady: false } },
    );
    await collection.updateMany(
      {
        storefrontReadinessCheckedAt: { $exists: true, $ne: null },
        $or: [{ translationReadinessCheckedAt: { $exists: false } }, { translationReadinessCheckedAt: null }],
      },
      [{ $set: { translationReadinessCheckedAt: '$storefrontReadinessCheckedAt' } }],
    );
  }

  const after = await getSnapshot(collection);
  if (mode === 'apply' && (after.missingPublication > 0 || after.missingTranslationReadiness > 0)) {
    throw new Error('Migration post-check failed: some products are missing publication or translation readiness state');
  }
  return { mode, before, after, applied: mode === 'apply' };
};

module.exports = {
  validateMigrationOptions,
  validateTargetDatabase,
  resolveLatestDatabaseBackup,
  runTranslationReadinessMigration,
};
