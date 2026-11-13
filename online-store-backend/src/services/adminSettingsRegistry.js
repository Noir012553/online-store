const runtimeSettingRegistry = {
  EMAIL_SERVICE: { secret: false },
  EMAIL_HOST: { secret: false },
  EMAIL_PORT: { secret: false },
  EMAIL_SECURE: { secret: false },
  EMAIL_USER: { secret: false },
  EMAIL_FROM: { secret: false },
  EMAIL_PASSWORD: { secret: true },
  SENDGRID_API_KEY: { secret: true },
  VNPAY_ENDPOINT: { secret: false },
  VNPAY_TMN_CODE: { secret: false },
  VNPAY_RETURN_URL: { secret: false },
  VNPAY_CALLBACK_URL: { secret: false },
  VNPAY_HASH_SECRET: { secret: true },
  R2_UPLOAD_ENABLED: { secret: false },
  R2_MAX_UPLOAD_COUNT: { secret: false },
  R2_MAX_UPLOAD_BYTES: { secret: false },
  R2_MAX_RETRIES: { secret: false },
  R2_MAX_IMAGE_BYTES: { secret: false },
  R2_MAX_VIDEO_BYTES: { secret: false },
  CLOUDFLARE_AI_ENABLED: { secret: false },
  CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: { secret: false },
  CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: { secret: false },
  CLOUDFLARE_AI_MAX_TOKENS: { secret: false },
  CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS: { secret: false },
  CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS: { secret: false },
  CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS: { secret: false },
  CLOUDFLARE_MAX_PARALLEL_PER_KEY: { secret: false },
  CLOUDFLARE_MAX_REQUESTS_PER_SEC: { secret: false },
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: { secret: false },
  R2_ACCOUNT_ROLE: { secret: false },
  R2_ACCOUNT_ROLE_GENERAL: { secret: false },
  R2_ACCOUNT_ROLE_PRODUCT: { secret: false },
  R2_ACCOUNT_ROLE_MAIN: { secret: false },
  R2_ACCOUNT_ROLE_GALLERY: { secret: false },
  R2_ACCOUNT_ROLE_DESCRIPTION: { secret: false },
  R2_ACCOUNT_ROLE_BANNER: { secret: false },
  R2_ACCOUNT_ROLE_BRAND: { secret: false },
  R2_ACCOUNT_ROLE_ABOUT_REVIEWER: { secret: false },
  R2_ACCOUNT_ROLE_ABOUT_LOADING: { secret: false },
  R2_ACCOUNT_ROLE_ABOUT_TEAM: { secret: false },
  R2_ACCOUNT_ROLE_ABOUT_HERO: { secret: false },
};

for (let index = 1; index <= 9; index += 1) {
  const suffix = index === 1 ? '' : `_${index}`;
  runtimeSettingRegistry[`R2_ACCOUNT_ID${suffix}`] = { secret: false };
  runtimeSettingRegistry[`R2_ACCESS_KEY_ID${suffix}`] = { secret: true };
  runtimeSettingRegistry[`R2_SECRET_ACCESS_KEY${suffix}`] = { secret: true };
  runtimeSettingRegistry[`R2_BUCKET_NAME${suffix}`] = { secret: false };
  runtimeSettingRegistry[`R2_PUBLIC_BASE_URL${suffix}`] = { secret: false };
}

for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_AI_MODEL']) {
  runtimeSettingRegistry[key] = { secret: key === 'CLOUDFLARE_API_TOKEN' };
}

for (let index = 1; index <= 13; index += 1) {
  runtimeSettingRegistry[`CLOUDFLARE_ACCOUNT_ID_${index}`] = { secret: false };
  runtimeSettingRegistry[`CLOUDFLARE_API_TOKEN_${index}`] = { secret: true };
  runtimeSettingRegistry[`CLOUDFLARE_AI_MODEL_${index}`] = { secret: false };
}

Object.freeze(runtimeSettingRegistry);

const getRuntimeSettings = (environment = process.env) => Object.entries(runtimeSettingRegistry)
  .filter(([key]) => Object.hasOwn(environment, key))
  .map(([key, definition]) => definition.secret
    ? { key, secret: true, configured: Boolean(environment[key]?.trim()) }
    : { key, secret: false, value: environment[key] })
  .sort((left, right) => left.key.localeCompare(right.key));

module.exports = { getRuntimeSettings, runtimeSettingRegistry };
