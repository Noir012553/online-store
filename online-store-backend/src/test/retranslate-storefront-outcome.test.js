const assert = require('node:assert/strict');
const test = require('node:test');
const { getStorefrontRetranslationOutcome } = require('../utils/retranslateStorefrontOutcome');

const completeState = {
  remainingJobs: 0,
  sourceBlockedProducts: 0,
  failedJobCount: 0,
  needsReviewCount: 0,
  stoppedForQuota: false,
};

test('marks a clean empty backlog complete', () => {
  assert.deepEqual(getStorefrontRetranslationOutcome(completeState), {
    complete: true,
    mode: 'apply-complete',
    stopReason: null,
    exitCode: 0,
  });
});

test('preserves the rate-limit exit code and reason when work remains', () => {
  assert.deepEqual(getStorefrontRetranslationOutcome({
    ...completeState,
    remainingJobs: 3634,
    failedJobCount: 1,
    stoppedForQuota: true,
  }), {
    complete: false,
    mode: 'apply-incomplete',
    stopReason: 'rate_limited',
    exitCode: 2,
  });
});

test('reports ordinary job failures as incomplete', () => {
  assert.equal(getStorefrontRetranslationOutcome({
    ...completeState,
    failedJobCount: 1,
  }).stopReason, 'job_failed');
});

test('prioritizes blocked sources and review results over remaining work', () => {
  assert.equal(getStorefrontRetranslationOutcome({
    ...completeState,
    remainingJobs: 1,
    sourceBlockedProducts: 1,
  }).stopReason, 'source_blocked');
  assert.equal(getStorefrontRetranslationOutcome({
    ...completeState,
    remainingJobs: 1,
    needsReviewCount: 1,
  }).stopReason, 'needs_review');
});

test('reports unprocessed backlog separately', () => {
  assert.equal(getStorefrontRetranslationOutcome({
    ...completeState,
    remainingJobs: 1,
  }).stopReason, 'backlog_remaining');
});
