const translationSeederConfig = {
  MAX_RETRIES: Number(process.env.TRANSLATION_MAX_RETRIES || 2),
  RETRY_DELAY: Number(process.env.TRANSLATION_RETRY_DELAY_MS || 1000),
  TIMEOUT_MS: Number(process.env.TRANSLATION_TIMEOUT_MS || 30000),
  DRY_RUN: process.env.DRY_RUN === 'true',
  INCREMENTAL: process.env.INCREMENTAL_SEED === 'true',
};

module.exports = translationSeederConfig;
