const assert = require('node:assert/strict');
const test = require('node:test');
const { getMillisecondsUntilNextUtcMidnight } = require('../utils/utcSchedule');

test('starts immediately at 00:00 UTC', () => {
  assert.equal(getMillisecondsUntilNextUtcMidnight(new Date('2026-09-26T00:00:00.000Z')), 0);
});

test('waits for the next 00:00 UTC from later in the day', () => {
  assert.equal(getMillisecondsUntilNextUtcMidnight(new Date('2026-09-26T15:30:00.000Z')), 8.5 * 60 * 60 * 1000);
});

test('waits only for the remaining milliseconds just before midnight', () => {
  assert.equal(getMillisecondsUntilNextUtcMidnight(new Date('2026-09-26T23:59:59.500Z')), 500);
});
