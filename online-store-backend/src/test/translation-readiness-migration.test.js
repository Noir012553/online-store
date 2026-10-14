const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  validateMigrationOptions,
  validateTargetDatabase,
  runTranslationReadinessMigration,
} = require('../utils/translationReadinessMigration');

describe('translation readiness migration', () => {
  const createCollection = (conflicts = {}) => ({
    countDocuments: async (query) => {
      if (query.$expr?.$ne?.[0] === '$storefrontReady') return conflicts.readiness || 0;
      if (query.$expr?.$ne?.[0] === '$storefrontReadinessCheckedAt') return conflicts.timestamps || 0;
      return 0;
    },
    updateMany: async () => ({ acknowledged: true }),
  });

  it('keeps dry-run read-only', async () => {
    let writes = 0;
    const collection = createCollection();
    collection.updateMany = async () => { writes += 1; };

    const report = await runTranslationReadinessMigration(collection, 'dry-run');

    assert.equal(writes, 0);
    assert.equal(report.applied, false);
    assert.equal(report.mode, 'dry-run');
  });

  it('applies only missing fields with idempotent existence filters', async () => {
    const updates = [];
    const collection = createCollection();
    collection.updateMany = async (filter, update) => updates.push({ filter, update });

    const report = await runTranslationReadinessMigration(collection, 'apply');

    assert.equal(report.applied, true);
    assert.equal(updates.length, 4);
    assert.deepEqual(updates[0].filter, {
      $or: [{ isPublished: { $exists: false } }, { isPublished: null }],
    });
    assert.deepEqual(updates[1].filter.$or, [
      { translationReady: { $exists: false } },
      { translationReady: null },
    ]);
    assert.deepEqual(updates[2].filter.$or, [
      { translationReady: { $exists: false } },
      { translationReady: null },
    ]);
    assert.deepEqual(updates[3].filter.$or, [
      { translationReadinessCheckedAt: { $exists: false } },
      { translationReadinessCheckedAt: null },
    ]);
    assert.ok(updates.every(({ update }) => !update.$unset));
  });

  it('preserves legacy fields on rollback', async () => {
    let writes = 0;
    const collection = createCollection();
    collection.updateMany = async () => { writes += 1; };

    const report = await runTranslationReadinessMigration(collection, 'rollback');

    assert.equal(writes, 0);
    assert.equal(report.applied, false);
    assert.equal(report.mode, 'rollback');
  });

  it('stops before writes when existing readiness values conflict', async () => {
    let writes = 0;
    const collection = createCollection({ readiness: 1 });
    collection.updateMany = async () => { writes += 1; };

    await assert.rejects(
      runTranslationReadinessMigration(collection, 'apply'),
      /conflicting readiness values/,
    );
    assert.equal(writes, 0);
  });

  it('requires explicit confirmation, a verified backup, and the database name for apply', () => {
    assert.throws(() => validateMigrationOptions({ mode: 'apply' }), /--confirm=TRANSLATION_READINESS/);
    assert.throws(() => validateMigrationOptions({
      mode: 'apply',
      confirmation: 'TRANSLATION_READINESS',
      backupFile: path.join(os.tmpdir(), 'missing-readiness-backup.archive'),
      backupVerified: true,
      databaseName: 'test-db',
    }), /Backup file does not exist/);
    assert.throws(() => validateMigrationOptions({
      mode: 'apply',
      confirmation: 'TRANSLATION_READINESS',
      backupFile: __filename,
      backupVerified: true,
    }), /--database-name/);
  });

  it('rejects missing, empty, and non-file backups', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-migration-'));
    const emptyBackup = path.join(directory, 'empty.archive');
    fs.writeFileSync(emptyBackup, '');

    try {
      assert.throws(() => validateMigrationOptions({
        mode: 'apply',
        confirmation: 'TRANSLATION_READINESS',
        backupFile: emptyBackup,
        backupVerified: true,
        databaseName: 'test-db',
      }), /non-empty regular file/);
      assert.throws(() => validateMigrationOptions({
        mode: 'apply',
        confirmation: 'TRANSLATION_READINESS',
        backupFile: directory,
        backupVerified: true,
        databaseName: 'test-db',
      }), /non-empty regular file/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires the connected database to match the confirmed target', () => {
    assert.throws(() => validateTargetDatabase('production', 'development', 'apply'), /does not match/);
    assert.doesNotThrow(() => validateTargetDatabase('development', 'development', 'apply'));
  });
});
