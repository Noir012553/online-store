const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sinon = require('sinon');
const { RetranslationRunLock } = require('../models/RetranslationProgress');
const {
  acquireDatabaseLock,
  acquireProgressLock,
  clearCheckpoint,
  getCompletedResult,
  getWorkKey,
  hasCompleted,
  markCompleted,
  openCheckpoint,
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

test('checkpoint signatures change when translation options or database scope changes', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, 'live:first', { validationErrors: ['quality_low'] });
    const changedOptions = openCheckpoint({ ...options, lang: 'vi' }, directory);
    const changedDatabase = openCheckpoint({ ...options, checkpointScope: 'other-database' }, directory);
    const changedLimit = openCheckpoint({ ...options, limit: 500 }, directory);

    assert.equal(hasCompleted(changedOptions, 'live:first'), false);
    assert.equal(hasCompleted(changedDatabase, 'live:first'), false);
    assert.equal(hasCompleted(changedLimit, 'live:first'), false);
  });
});
