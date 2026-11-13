'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const { getR2UploadPolicy, getR2Accounts } = require('../services/r2AssetService');
const cloudflareAiService = require('../services/cloudflareAiService');
const { getRuntimeSettings } = require('../services/adminSettingsRegistry');
const settingsDraftStore = require('../services/adminSettingsDraftStore');

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
    return url.origin;
  } catch {
    return '';
  }
};
const noStore = res => res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache' });

router.get('/values', protect, superAdmin, asyncHandler(async (_req, res) => {
  const settings = getRuntimeSettings(environment);
  noStore(res);
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
  const storage = settingsDraftStore.getAvailability();
  const worker = settingsDraftStore.getWorkerStatus();
  noStore(res);
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
        secretsWriteOnly: true,
        encryptedSecretStoreAvailable: storage.available,
        managedDraftAvailable: storage.available,
        applyWorkerAvailable: worker.available,
        applyWorkerUnavailableReason: worker.available ? null : worker.reason,
        managedOverridesAvailable: storage.available,
        restartRequiredGroups: ['VNPay', 'Email', 'R2', 'Cloudflare AI'],
      },
    },
  });
}));

// API contract: GET /draft reads only the current version and non-secret settings;
// secrets are returned as configured flags. PUT /draft requires { expectedVersion,
// settings }, rejects every key outside the editable allowlist, treats blank
// secret values as "retain existing", and treats null as removal of a managed override.
// POST /apply-jobs requires { expectedVersion }.
// Apply jobs are durable and accepted only while the fixed worker's signed heartbeat is fresh.
router.get('/draft', protect, superAdmin, asyncHandler(async (_req, res) => {
  noStore(res);
  const draft = await settingsDraftStore.getDraft();
  res.status(200).json({ success: true, data: { draft } });
}));

router.put('/draft', protect, superAdmin, asyncHandler(async (req, res) => {
  noStore(res);
  const { expectedVersion, settings } = req.body || {};
  const draft = await settingsDraftStore.saveDraft({ expectedVersion, settings, userId: req.user._id });
  res.status(200).json({ success: true, data: { draft } });
}));

router.post('/apply-jobs', protect, superAdmin, asyncHandler(async (req, res) => {
  noStore(res);
  const { expectedVersion } = req.body || {};
  const worker = settingsDraftStore.getWorkerStatus();
  if (!worker.available) {
    res.status(503).json({ success: false, code: 'SETTINGS_APPLY_WORKER_UNAVAILABLE', message: 'Settings apply worker is unavailable or its authenticated heartbeat is stale.' });
    return;
  }
  const job = await settingsDraftStore.createApplyJob({ expectedVersion, userId: req.user._id });
  res.status(202).json({ success: true, data: { job } });
}));

router.get('/apply-jobs/:id', protect, superAdmin, asyncHandler(async (req, res) => {
  noStore(res);
  const job = await settingsDraftStore.getApplyJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, code: 'SETTINGS_APPLY_JOB_NOT_FOUND', message: 'Apply job not found.' });
    return;
  }
  res.status(200).json({ success: true, data: { job } });
}));

module.exports = router;
