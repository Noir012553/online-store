const createSetting = (group, type, options = {}) => Object.freeze({
  group,
  type,
  secret: type === 'secret',
  restartRequired: true,
  ...options,
});

const runtimeSettingRegistry = {
  EMAIL_SERVICE: createSetting('email', 'enum', { values: ['smtp', 'sendgrid'] }),
  EMAIL_HOST: createSetting('email', 'string'),
  EMAIL_PORT: createSetting('email', 'integer', { min: 1, max: 65535 }),
  EMAIL_SECURE: createSetting('email', 'boolean'),
  EMAIL_USER: createSetting('email', 'string'),
  EMAIL_FROM: createSetting('email', 'string'),
  EMAIL_PASSWORD: createSetting('email', 'secret'),
  SENDGRID_API_KEY: createSetting('email', 'secret'),
  VNPAY_ENDPOINT: createSetting('vnpay', 'url'),
  VNPAY_TMN_CODE: createSetting('vnpay', 'string'),
  VNPAY_RETURN_URL: createSetting('vnpay', 'url'),
  VNPAY_CALLBACK_URL: createSetting('vnpay', 'url'),
  VNPAY_HASH_SECRET: createSetting('vnpay', 'secret'),
  R2_UPLOAD_ENABLED: createSetting('r2', 'boolean'),
  R2_MAX_UPLOAD_COUNT: createSetting('r2', 'integer', { min: 0 }),
  R2_MAX_UPLOAD_BYTES: createSetting('r2', 'integer', { min: 0 }),
  R2_MAX_RETRIES: createSetting('r2', 'integer', { min: 0 }),
  R2_MAX_IMAGE_BYTES: createSetting('r2', 'integer', { min: 1 }),
  R2_MAX_VIDEO_BYTES: createSetting('r2', 'integer', { min: 1 }),
  CLOUDFLARE_AI_ENABLED: createSetting('cloudflare-ai', 'boolean'),
  CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: createSetting('cloudflare-ai', 'integer', { min: 0 }),
  CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: createSetting('cloudflare-ai', 'integer', { min: 0 }),
  CLOUDFLARE_AI_MAX_TOKENS: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_MAX_PARALLEL_PER_KEY: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_MAX_REQUESTS_PER_SEC: createSetting('cloudflare-ai', 'integer', { min: 1 }),
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: createSetting('cloudflare-ai', 'integer', { min: 1 }),
};

const r2AccountIndexes = Array.from({ length: 9 }, (_, index) => String(index + 1));
const r2AccountIndexOptions = Object.freeze(r2AccountIndexes);

for (const role of [
  'GENERAL', 'PRODUCT', 'MAIN', 'GALLERY', 'DESCRIPTION', 'BANNER', 'BRAND',
  'ABOUT_REVIEWER', 'ABOUT_LOADING', 'ABOUT_TEAM', 'ABOUT_HERO',
]) {
  runtimeSettingRegistry[`R2_ACCOUNT_ROLE_${role}`] = createSetting('r2', 'enum', { values: r2AccountIndexOptions });
}
runtimeSettingRegistry.R2_ACCOUNT_ROLE = createSetting('r2', 'enum', { values: r2AccountIndexOptions });

for (let index = 1; index <= 9; index += 1) {
  const suffix = index === 1 ? '' : `_${index}`;
  runtimeSettingRegistry[`R2_ACCOUNT_ID${suffix}`] = createSetting('r2', 'string');
  runtimeSettingRegistry[`R2_ACCESS_KEY_ID${suffix}`] = createSetting('r2', 'secret');
  runtimeSettingRegistry[`R2_SECRET_ACCESS_KEY${suffix}`] = createSetting('r2', 'secret');
  runtimeSettingRegistry[`R2_BUCKET_NAME${suffix}`] = createSetting('r2', 'string');
  runtimeSettingRegistry[`R2_PUBLIC_BASE_URL${suffix}`] = createSetting('r2', 'url');
}

runtimeSettingRegistry.CLOUDFLARE_ACCOUNT_ID = createSetting('cloudflare-ai', 'string');
runtimeSettingRegistry.CLOUDFLARE_API_TOKEN = createSetting('cloudflare-ai', 'secret');
runtimeSettingRegistry.CLOUDFLARE_AI_MODEL = createSetting('cloudflare-ai', 'string');

for (let index = 1; index <= 13; index += 1) {
  runtimeSettingRegistry[`CLOUDFLARE_ACCOUNT_ID_${index}`] = createSetting('cloudflare-ai', 'string');
  runtimeSettingRegistry[`CLOUDFLARE_API_TOKEN_${index}`] = createSetting('cloudflare-ai', 'secret');
  runtimeSettingRegistry[`CLOUDFLARE_AI_MODEL_${index}`] = createSetting('cloudflare-ai', 'string');
}

Object.freeze(runtimeSettingRegistry);

// Runtime visibility and editability share the same explicit registry; arbitrary
// process environment keys remain outside the managed settings API.
const editableSettingRegistry = Object.freeze({ ...runtimeSettingRegistry });

const isValidEditableSetting = (key, value) => {
  const definition = editableSettingRegistry[key];
  if (!definition || typeof value !== 'string' || value.trim() === '') return false;
  if (definition.secret) return value.length <= 8192;
  if (definition.type === 'url') {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  if (definition.type === 'integer') {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) return false;
    const number = Number(value);
    return Number.isSafeInteger(number)
      && (definition.min === undefined || number >= definition.min)
      && (definition.max === undefined || number <= definition.max);
  }
  if (definition.type === 'boolean' || definition.type === 'enum') return isValidValue(value, definition);
  if (key === 'EMAIL_HOST') return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
  if (key === 'EMAIL_USER' || key === 'EMAIL_FROM') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (key.startsWith('R2_ACCOUNT_ID') || key.startsWith('CLOUDFLARE_ACCOUNT_ID')) return /^[A-Fa-f0-9]{32}$/.test(value);
  if (key.startsWith('R2_BUCKET_NAME')) return /^(?!xn--)(?!.*\.\.)(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value);
  if (key === 'VNPAY_TMN_CODE') return /^[A-Za-z0-9_-]{1,128}$/.test(value);
  if (key.startsWith('CLOUDFLARE_AI_MODEL')) return /^[A-Za-z0-9_./:@-]{1,200}$/.test(value);
  return value.length <= 2048;
};

const isValidValue = (value, definition) => {
  if (definition.type === 'secret' || definition.type === 'string') return true;
  if (definition.type === 'boolean') return value === 'true' || value === 'false';
  if (definition.type === 'enum') return definition.values.includes(value);
  if (definition.type === 'url') {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  const number = Number(value);
  return Number.isInteger(number)
    && (definition.min === undefined || number >= definition.min)
    && (definition.max === undefined || number <= definition.max);
};

const getRuntimeSettings = (environment = process.env) => Object.entries(runtimeSettingRegistry)
  .filter(([key]) => Object.hasOwn(environment, key))
  .map(([key, definition]) => {
    const value = environment[key];
    const configured = Boolean(value?.trim());
    const metadata = {
      key,
      group: definition.group,
      type: definition.type,
      secret: definition.secret,
      configured,
      valid: configured ? isValidValue(value, definition) : null,
      restartRequired: definition.restartRequired,
    };
    return definition.secret ? metadata : { ...metadata, value };
  })
  .sort((left, right) => left.key.localeCompare(right.key));

module.exports = {
  editableSettingRegistry,
  getRuntimeSettings,
  isValidEditableSetting,
  runtimeSettingRegistry,
};
