const distributedLockService = require('../services/distributedLockService');

const getTranslationLockTtlSeconds = () => {
  const configured = Number(process.env.PRODUCT_TRANSLATION_LOCK_TTL_SECONDS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const productConcurrency = Number(process.env.PRODUCT_TRANSLATION_CONCURRENCY || 1);
  const languageConcurrency = Number(process.env.PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY || 1);
  return Math.max(120, (productConcurrency * 60) + (languageConcurrency * 45));
};

const acquireProductTranslationLock = async (productId, targetLang) => {
  await distributedLockService.initialize();
  const key = `translate:${productId}:${targetLang}`;
  const ttlSeconds = getTranslationLockTtlSeconds();
  const lockId = await distributedLockService.acquireLock(key, ttlSeconds);
  if (!lockId) {
    throw Object.assign(new Error('Product translation is already running'), {
      code: 'PRODUCT_TRANSLATION_LOCKED',
    });
  }

  const renewalTimer = setInterval(() => {
    distributedLockService.extendLock(key, lockId, ttlSeconds).catch(() => {});
  }, Math.max(1000, Math.floor(ttlSeconds * 1000 / 3)));
  renewalTimer.unref?.();

  return async () => {
    clearInterval(renewalTimer);
    await distributedLockService.releaseLock(key, lockId);
  };
};

module.exports = { acquireProductTranslationLock, getTranslationLockTtlSeconds };
