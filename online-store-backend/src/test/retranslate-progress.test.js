const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  clearCheckpoint,
  getWorkKey,
  hasCompleted,
  markCompleted,
  openCheckpoint,
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

test('completed live translation versions share one checkpoint key', () => {
  const first = getWorkKey({ retranslateSource: 'live', hashKey: 'hash:v2', _id: 'first' });
  const second = getWorkKey({ retranslateSource: 'live', hashKey: 'hash:v2:v3', _id: 'second' });

  assert.equal(first, 'live:hash');
  assert.equal(second, first);
});

test('checkpoint resumes completed catalog records after process restart', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    const key = getWorkKey({ retranslateSource: 'catalog', targetLang: 'en', entityId: 'product-1' });
    markCompleted(checkpoint, [key]);

    const resumed = openCheckpoint(options, directory);
    assert.equal(hasCompleted(resumed, key), true);
    assert.equal(hasCompleted(resumed, 'catalog:en:product-2'), false);
  });
});

test('checkpoint ignores a partial final record and can be reset explicitly', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, ['live:first']);
    fs.appendFileSync(checkpoint.filePath, '{partial');

    const resumed = openCheckpoint(options, directory);
    assert.equal(hasCompleted(resumed, 'live:first'), true);
    assert.equal(hasCompleted(resumed, 'live:second'), false);
    clearCheckpoint(resumed);
    assert.equal(fs.existsSync(resumed.filePath), false);
  });
});

test('checkpoint signatures change when translation options change', async () => {
  await withTempDirectory(directory => {
    const checkpoint = openCheckpoint(options, directory);
    markCompleted(checkpoint, ['live:first']);
    const changedOptions = openCheckpoint({ ...options, lang: 'vi' }, directory);

    assert.equal(hasCompleted(changedOptions, 'live:first'), false);
  });
});
