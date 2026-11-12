const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const { getR2StorageStatus, getR2UploadPolicy, getR2Accounts } = require('../services/r2AssetService');
const cloudflareAiService = require('../services/cloudflareAiService');

const router = express.Router();

const environment = process.env;
const hasValue = key => Boolean(environment[key]?.trim());
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
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '';
  }
};

router.get('/status', protect, superAdmin, asyncHandler(async (_req, res) => {
  const emailService = environment.EMAIL_SERVICE === 'sendgrid' ? 'sendgrid' : 'smtp';
  const email = {
    service: emailService,
    host: emailService === 'sendgrid' ? 'smtp.sendgrid.net' : environment.EMAIL_HOST || 'smtp.gmail.com',
    port: parseNumber(environment.EMAIL_PORT, 587),
    secure: environment.EMAIL_SECURE === 'true',
    account: environment.EMAIL_USER || '',
    from: environment.EMAIL_FROM || environment.EMAIL_USER || '',
    replyTo: environment.EMAIL_REPLY_TO || '',
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

  let r2;
  let r2Accounts;
  let uploadPolicy;
  let r2ConfigurationValid = true;
  try {
    r2 = getR2StorageStatus();
    r2Accounts = getR2Accounts().map(account => ({
      id: account.id,
      accountId: account.accountId,
      bucket: account.bucket,
      publicBaseUrl: safePublicUrl(account.publicBaseUrl),
    }));
    uploadPolicy = getR2UploadPolicy();
  } catch {
    r2ConfigurationValid = false;
    r2 = { configured: false, uploadEnabled: false, uploadBudgetConfigured: false, accounts: [] };
    r2Accounts = [];
    uploadPolicy = { maxAssets: 0, maxBytes: 0, maxRetries: 0 };
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
        configured: r2.configured,
        credentialsConfigured: r2ConfigurationValid && r2.configured,
        configurationValid: r2ConfigurationValid,
        uploadEnabled: r2.uploadEnabled,
        uploadBudgetConfigured: r2.uploadBudgetConfigured,
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
