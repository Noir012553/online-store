const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sinon = require('sinon');
const { RetranslationProgress, RetranslationRunLock } = require('../models/RetranslationProgress');
const {
  acquireDatabaseLock,
  acquireProgressLock,
  clearCheckpoint,
  clearFixedCheckpointEntries,
  clearProductFieldCheckpoint,
  clearUnfixedCheckpointEntries,
  getCompletedResult,
  getProductFieldWorkKey,
  getWorkKey,
  hasCompleted,
  markCompleted,
  openCheckpoint,
  openProductCheckpoint,
  hydrateCheckpoint,
  removeCheckpoint,
} = require('../utils/retranslateProgress');

const options = { filter: {}, lang: null, entityType: null, limit: 0 };

const withTempDirectory = async callback => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-progress-'));
  try {
    await callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

test('live translation versions share a checkpoint only while source text is unchanged', () => {
  const first = getWorkKey({ retranslateSource: 'live', hashKey: 'hash:v2', _id: 'first', originalText: 'source' });
  const second = getWorkKey({ retranslateSource: 'live', hashKey: 'hash:v2:v3', _id: 'second', originalText: 'source' });
  const changedSource = getWorkKey({ retranslateSource: 'live', hashKey: 'hash:v2:v3', _id: 'third', originalText: 'updated source' });

  assert.equal(first, second);
  assert.notEqual(second, changedSource);
});

test('checkpoint replay uses the latest update for each key', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, 'live:first', { fixed: true, validationErrors: [] });
    markCompleted(checkpoint, 'live:first', { fixed: false, validationErrors: ['quality_low'] }, true);

    const resumed = openCheckpoint(options, directory);
    assert.equal(getCompletedResult(resumed, 'live:first').fixed, false);
    assert.deepEqual(getCompletedResult(resumed, 'live:first').validationErrors, ['quality_low']);
  });
});

test('checkpoint resumes completed catalog records after process restart', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    const key = getWorkKey({ retranslateSource: 'catalog', targetLang: 'en', entityId: 'product-1', sourceHash: 'source-v1' });
    markCompleted(checkpoint, key, { fixed: true });

    const resumed = openCheckpoint(options, directory);
    assert.equal(hasCompleted(resumed, key), true);
    assert.equal(getCompletedResult(resumed, key).fixed, true);
    assert.equal(hasCompleted(resumed, 'catalog:en:product-2:source-v1'), false);
    assert.notEqual(key, getWorkKey({ retranslateSource: 'catalog', targetLang: 'en', entityId: 'product-1', sourceHash: 'source-v2' }));
  });
});

test('product field checkpoints preserve translated payloads across process restarts', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    const key = getProductFieldWorkKey({
      productId: 'product-1',
      targetLang: 'en',
      field: ['specs', 'RAM'],
      source: '16GB',
    });
    markCompleted(checkpoint, key, {
      payload: { value: '16 GB', validation: { qualityStatus: 'approved' }, providersUsed: ['cloudflare'] },
    });

    const resumed = openCheckpoint(options, directory);
    assert.deepEqual(getCompletedResult(resumed, key).payload, {
      value: '16 GB',
      validation: { qualityStatus: 'approved' },
      providersUsed: ['cloudflare'],
    });
  });
});

test('checkpoint hydrate restores durable field payloads from MongoDB', async () => {
  const key = 'product-field:en:product-1:source-v1:field-hash';
  let checkpoint;
  const find = sinon.stub(RetranslationProgress, 'find').returns({
    lean: async () => [{ signature: checkpoint.signature, key, fixed: true, validationErrors: [], payload: { value: 'Resume me' } }],
  });
  checkpoint = openCheckpoint(options, fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-hydrate-')));

  try {
    await hydrateCheckpoint(checkpoint);
    assert.equal(checkpoint.durableCompletedCount, 1);
    assert.equal(getCompletedResult(checkpoint, key).payload.value, 'Resume me');
  } finally {
    fs.rmSync(path.dirname(checkpoint.filePath), { recursive: true, force: true });
    find.restore();
  }
});

test('durable tombstones suppress stale local entries during recovery', async () => {
  await withTempDirectory(async directory => {
    const checkpoint = openCheckpoint(options, directory);
    const key = 'catalog:en:product-1:source-v1';
    markCompleted(checkpoint, key, { fixed: false });
    const find = sinon.stub(RetranslationProgress, 'find').returns({
      lean: async () => [{ signature: checkpoint.signature, key, fixed: false, deleted: true }],
    });

    try {
      await hydrateCheckpoint(checkpoint);
      assert.equal(checkpoint.completed.size, 0);
      assert.equal(fs.readFileSync(checkpoint.filePath, 'utf8').trim().split(/\r?\n/).length, 1);
    } finally {
      find.restore();
    }
  });
});

test('checkpoint signatures are shared across language filters', async () => {
  await withTempDirectory(directory => {
    const allLanguages = openCheckpoint({ ...options, checkpointScope: 'shared-database' }, directory);
    const oneLanguage = openCheckpoint({ ...options, lang: 'en', checkpointScope: 'shared-database' }, directory);
    assert.equal(allLanguages.signature, oneLanguage.signature);
  });
});

test('legacy local checkpoint files are imported before they are removed', async () => {
  await withTempDirectory(async directory => {
    const initial = openCheckpoint(options, directory);
    const legacySignature = initial.legacySignatures[0];
    const legacyPath = path.join(directory, `${legacySignature}.jsonl`);
    const key = 'catalog:vi:product-1:source-v1';
    fs.writeFileSync(legacyPath, `${JSON.stringify({
      type: 'retranslate-checkpoint',
      version: 2,
      signature: legacySignature,
    })}\n${JSON.stringify({ key, fixed: true, validationErrors: [] })}\n`);
    const checkpoint = openCheckpoint(options, directory);
    const bulkWrite = sinon.stub(RetranslationProgress, 'bulkWrite').resolves({});
    const find = sinon.stub(RetranslationProgress, 'find').returns({ lean: async () => [] });

    try {
      await hydrateCheckpoint(checkpoint);
      assert.equal(hasCompleted(checkpoint, key), true);
      assert.equal(bulkWrite.firstCall.args[0][0].updateOne.filter.signature, checkpoint.signature);
      assert.equal(fs.existsSync(legacyPath), false);
    } finally {
      bulkWrite.restore();
      find.restore();
    }
  });
});

test('checkpoint hydration migrates records from the former language-specific signature', async () => {
  const key = 'catalog:en:product-1:source-v1';
  const bulkWrite = sinon.stub(RetranslationProgress, 'bulkWrite').resolves({});
  const deleteMany = sinon.stub(RetranslationProgress, 'deleteMany').resolves({ deletedCount: 1 });
  let checkpoint;
  const find = sinon.stub(RetranslationProgress, 'find').callsFake(() => ({
    lean: async () => [{
      signature: checkpoint.legacySignatures[0],
      key,
      fixed: false,
      validationErrors: ['quality_low'],
    }],
  }));
  checkpoint = openCheckpoint({ ...options, lang: 'en' }, fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-legacy-')));

  try {
    await hydrateCheckpoint(checkpoint);
    assert.equal(hasCompleted(checkpoint, key), true);
    assert.equal(bulkWrite.firstCall.args[0][0].updateOne.filter.signature, checkpoint.signature);
    assert.deepEqual(deleteMany.firstCall.args[0], { signature: { $in: checkpoint.legacySignatures } });
  } finally {
    fs.rmSync(path.dirname(checkpoint.filePath), { recursive: true, force: true });
    bulkWrite.restore();
    deleteMany.restore();
    find.restore();
  }
});

test('successful batch cleanup only clears completed candidates from that run', async () => {
  await withTempDirectory(async directory => {
    const checkpoint = openCheckpoint(options, directory);
    const enKey = 'catalog:en:product-1:source-v1';
    const frKey = 'catalog:fr:product-1:source-v1';
    markCompleted(checkpoint, enKey, { fixed: true });
    markCompleted(checkpoint, frKey, { fixed: true });
    const bulkWrite = sinon.stub(RetranslationProgress, 'bulkWrite').resolves({});

    try {
      await clearFixedCheckpointEntries(checkpoint, [enKey]);
      assert.equal(hasCompleted(checkpoint, enKey), false);
      assert.equal(hasCompleted(checkpoint, frKey), true);
    } finally {
      bulkWrite.restore();
    }
  });
});

test('retrying unresolved work clears its product field payloads but preserves fixed work', async () => {
  await withTempDirectory(async directory => {
    const checkpoint = openCheckpoint(options, directory);
    const unresolvedKey = 'catalog:en:product-1:source-v1';
    const fieldKey = getProductFieldWorkKey({
      productId: 'product-1',
      targetLang: 'en',
      field: 'name',
      source: 'Source name',
    });
    markCompleted(checkpoint, unresolvedKey, { fixed: false, validationErrors: ['quality_low'] });
    markCompleted(checkpoint, fieldKey, { payload: { value: 'Old result' } });
    markCompleted(checkpoint, 'catalog:fr:product-2:source-v1', { fixed: false });
    markCompleted(checkpoint, 'catalog:de:product-3:source-v1', { fixed: true });
    const bulkWrite = sinon.stub(RetranslationProgress, 'bulkWrite').resolves({});

    try {
      assert.equal(await clearUnfixedCheckpointEntries(checkpoint, { lang: 'en' }), 1);
      assert.equal(hasCompleted(checkpoint, unresolvedKey), false);
      assert.equal(hasCompleted(checkpoint, fieldKey), false);
      assert.equal(hasCompleted(checkpoint, 'catalog:fr:product-2:source-v1'), true);
      assert.equal(hasCompleted(checkpoint, 'catalog:de:product-3:source-v1'), true);
      assert.equal(bulkWrite.calledOnce, true);
      assert.deepEqual(bulkWrite.firstCall.args[0].map(({ updateOne }) => updateOne), [
        { filter: { signature: checkpoint.signature, key: fieldKey }, update: { $set: { deleted: true, payload: null } }, upsert: true },
        { filter: { signature: checkpoint.signature, key: unresolvedKey }, update: { $set: { deleted: true, payload: null } }, upsert: true },
      ]);
    } finally {
      bulkWrite.restore();
    }
  });
});

test('checkpoint ignores a partial final record and can be reset explicitly', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, 'live:first', { validationErrors: ['quality_low'] });
    fs.appendFileSync(checkpoint.filePath, '{partial');

    const resumed = openCheckpoint(options, directory);
    assert.equal(hasCompleted(resumed, 'live:first'), true);
    assert.equal(hasCompleted(resumed, 'live:second'), false);
    assert.deepEqual(getCompletedResult(resumed, 'live:first').validationErrors, ['quality_low']);
    assert.equal(getCompletedResult(resumed, 'live:first').fixed, false);
    markCompleted(resumed, 'live:second');
    assert.equal(hasCompleted(openCheckpoint(options, directory), 'live:second'), true);
    clearCheckpoint(resumed);
    assert.equal(fs.existsSync(resumed.filePath), false);
  });
});

test('reset removes corrupted checkpoints before opening them', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, 'live:first');
    fs.writeFileSync(checkpoint.filePath, 'corrupted');

    removeCheckpoint(options, directory);
    assert.doesNotThrow(() => openCheckpoint(options, directory));
  });
});

test('completed product field checkpoints are removed after their product finishes', async () => {
  await withTempDirectory(async directory => {
    const checkpoint = openCheckpoint(options, directory);
    const productKey = getProductFieldWorkKey({
      productId: 'product-1',
      targetLang: 'en',
      field: ['name'],
      source: 'Laptop source',
    });
    markCompleted(checkpoint, productKey, { payload: { value: 'Laptop' } });
    markCompleted(checkpoint, 'live:other', { fixed: true });
    const bulkWrite = sinon.stub(RetranslationProgress, 'bulkWrite').resolves({});

    try {
      await clearProductFieldCheckpoint(checkpoint, 'product-1', 'en');
      assert.equal(hasCompleted(checkpoint, productKey), false);
      assert.equal(hasCompleted(checkpoint, 'live:other'), true);
      assert.deepEqual(bulkWrite.firstCall.args[0][0].updateOne, {
        filter: { signature: checkpoint.signature, key: productKey },
        update: { $set: { deleted: true, payload: null } },
        upsert: true,
      });
    } finally {
      bulkWrite.restore();
    }
  });
});

test('database retranslation locks renew their lease until released', async () => {
  const findOneAndUpdate = sinon.stub(RetranslationRunLock, 'findOneAndUpdate').callsFake((filter, update) => ({
    lean: async () => ({ owner: update.$set.owner }),
  }));
  const deleteOne = sinon.stub(RetranslationRunLock, 'deleteOne').resolves({ deletedCount: 1 });
  const lock = await acquireDatabaseLock('test-retranslate-lock', 30);
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(findOneAndUpdate.callCount > 1);
  } finally {
    await lock.release();
    findOneAndUpdate.restore();
    deleteOne.restore();
  }
});

test('progress lock prevents concurrent translation processes', async () => {
  await withTempDirectory(directory => {
    const release = acquireProgressLock(directory);
    assert.throws(() => acquireProgressLock(directory), /already running/);
    release();
    const releaseAgain = acquireProgressLock(directory);
    releaseAgain();
  });
});

test('admin and CLI product jobs use the same checkpoint signature', async () => {
  await withTempDirectory(directory => {
    const cliCheckpoint = openCheckpoint({
      filter: {},
      lang: null,
      entityType: null,
      limit: 0,
      dryRun: false,
      validate: true,
      libreTranslateOnly: false,
      checkpointScope: 'shared-database',
    }, directory);
    const adminCheckpoint = openProductCheckpoint('shared-database', directory);

    assert.equal(adminCheckpoint.signature, cliCheckpoint.signature);
  });
});

test('checkpoint signatures change when translation options or database scope changes', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, 'live:first', { validationErrors: ['quality_low'] });
    const changedOptions = openCheckpoint({ ...options, lang: 'vi' }, directory);
    const changedDatabase = openCheckpoint({ ...options, checkpointScope: 'other-database' }, directory);
    const changedLimit = openCheckpoint({ ...options, limit: 500 }, directory);

    assert.equal(hasCompleted(changedOptions, 'live:first'), true);
    assert.equal(hasCompleted(changedDatabase, 'live:first'), false);
    assert.equal(hasCompleted(changedLimit, 'live:first'), true);
  });
});
