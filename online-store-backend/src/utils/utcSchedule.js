const getMillisecondsUntilNextUtcMidnight = (now = new Date()) => {
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedSinceMidnight = now.getTime() - midnightUtc;
  return elapsedSinceMidnight === 0 ? 0 : (24 * 60 * 60 * 1000) - elapsedSinceMidnight;
};

module.exports = { getMillisecondsUntilNextUtcMidnight };
