const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const { getR2UploadPolicy, getR2Accounts } = require('../services/r2AssetService');
const cloudflareAiService = require('../services/cloudflareAiService');

const router = express.Router();

const environment = process.env;
const hasValue = key => Boolean(environment[key]?.trim());
const runtimeSettingKeys = new Set([
  'EMAIL_SERVICE', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_FROM', 'EMAIL_PASSWORD', 'SENDGRID_API_KEY',
  'VNPAY_ENDPOINT', 'VNPAY_TMN_CODE', 'VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL', 'VNPAY_HASH_SECRET',
  'R2_UPLOAD_ENABLED', 'R2_MAX_UPLOAD_COUNT', 'R2_MAX_UPLOAD_BYTES', 'R2_MAX_RETRIES', 'R2_MAX_IMAGE_BYTES', 'R2_MAX_VIDEO_BYTES',
  'CLOUDFLARE_AI_ENABLED', 'CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', 'CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', 'CLOUDFLARE_AI_MAX_TOKENS',
  'CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS', 'CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS', 'CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS',
  'CLOUDFLARE_MAX_PARALLEL_PER_KEY', 'CLOUDFLARE_MAX_REQUESTS_PER_SEC', 'CLOUDFLARE_MAX_PARALLEL_REQUESTS',
]);
const isRuntimeSettingKey = key => runtimeSettingKeys.has(key)
  || /^(?:R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME|PUBLIC_BASE_URL)(?:_\d+)?|R2_ACCOUNT_ROLE(?:_[A-Z0-9_-]+)?|CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|AI_MODEL)(?:_\d+)?)$/.test(key);
const isSecretSettingKey = key => /(?:PASSWORD|SECRET|TOKEN|ACCESS_KEY_ID|API_KEY)/i.test(key);
const parseNumber = (value, fallback) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const safePublicUrl = value => {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
};

router.get('/values', protect, superAdmin, asyncHandler(async (_req, res) => {
  const settings = Object.entries(environment)
    .filter(([key]) => isRuntimeSettingKey(key))
    .map(([key, value]) => {
      const secret = isSecretSettingKey(key);
      return secret
        ? { key, secret: true, configured: Boolean(value?.trim()) }
        : { key, secret: false, value };
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { settings } });
}));

router.get('/status', protect, superAdmin, asyncHandler(async (_req, res) => {
  const emailService = environment.EMAIL_SERVICE === 'sendgrid' ? 'sendgrid' : 'smtp';
  const email = {
    service: emailService,
    host: emailService === 'sendgrid' ? 'smtp.sendgrid.net' : environment.EMAIL_HOST || 'smtp.gmail.com',
    port: parseNumber(environment.EMAIL_PORT, 587),
    secure: environment.EMAIL_SECURE === 'true',
    account: environment.EMAIL_USER || '',
    from: environment.EMAIL_FROM || environment.EMAIL_USER || '',
    userConfigured: hasValue('EMAIL_USER'),
    passwordConfigured: hasValue('EMAIL_PASSWORD'),
    sendgridKeyConfigured: hasValue('SENDGRID_API_KEY'),
  };
  email.configured = email.userConfigured
    && email.passwordConfigured
    && (emailService !== 'sendgrid' || email.sendgridKeyConfigured);

  const rawPaymentEndpoint = environment.VNPAY_ENDPOINT || 'https://sandbox.vnpayment.vn/paygate';
  const payment = {
    merchantCode: environment.VNPAY_TMN_CODE || '',
    endpoint: safePublicUrl(rawPaymentEndpoint),
    returnUrl: safePublicUrl(environment.VNPAY_RETURN_URL),
    callbackUrl: safePublicUrl(environment.VNPAY_CALLBACK_URL),
    merchantConfigured: hasValue('VNPAY_TMN_CODE'),
    secretConfigured: hasValue('VNPAY_HASH_SECRET'),
  };
  payment.mode = rawPaymentEndpoint.includes('sandbox') ? 'sandbox' : 'production';
  payment.configured = payment.merchantConfigured && payment.secretConfigured;

  let r2Accounts = [];
  let r2ConfigurationValid = true;
  try {
    r2Accounts = getR2Accounts().map(account => ({
      id: account.id,
      accountId: account.accountId,
      bucket: account.bucket,
      publicBaseUrl: safePublicUrl(account.publicBaseUrl),
    }));
  } catch {
    r2ConfigurationValid = false;
  }

  let uploadPolicy;
  let uploadPolicyValid = true;
  try {
    uploadPolicy = getR2UploadPolicy();
  } catch {
    uploadPolicyValid = false;
    uploadPolicy = { enabled: false, maxAssets: 0, maxBytes: 0, maxRetries: 0 };
  }

  const aiConfig = cloudflareAiService.getConfigInfo();
  const aiPolicy = cloudflareAiService.getUsagePolicy();

  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      email,
      payment,
      r2: {
        configured: r2ConfigurationValid && r2Accounts.length > 0,
        credentialsConfigured: r2ConfigurationValid && r2Accounts.length > 0,
        configurationValid: r2ConfigurationValid,
        policyValid: uploadPolicyValid,
        uploadEnabled: uploadPolicy.enabled,
        uploadBudgetConfigured: uploadPolicyValid && uploadPolicy.maxAssets > 0 && uploadPolicy.maxBytes > 0,
        policy: {
          maxAssets: uploadPolicy.maxAssets,
          maxBytes: uploadPolicy.maxBytes,
          maxRetries: uploadPolicy.maxRetries,
        },
        accounts: r2Accounts,
      },
      cloudflareAi: {
        enabled: aiPolicy.enabled,
        configuredCount: aiConfig.configCount,
        maxRequestsPerDay: aiPolicy.maxRequestsPerDay,
        maxInputCharsPerDay: aiPolicy.maxInputCharsPerDay,
        models: aiConfig.configs.map(config => config.model),
        accountIds: cloudflareAiService.configs.map(config => config.accountId),
        allCredentialsConfigured: aiConfig.configCount > 0
          && aiConfig.configs.every(config => config.hasAccountId && config.hasToken),
      },
      cloudflareOperations: {
        tunnelManaged: false,
        dnsManaged: false,
      },
      security: {
        secretValuesReturned: false,
        encryptedSecretStoreAvailable: false,
        managedOverridesAvailable: false,
        restartRequiredGroups: ['VNPay', 'Email', 'R2', 'Cloudflare AI'],
      },
    },
  });
}));

module.exports = router;
