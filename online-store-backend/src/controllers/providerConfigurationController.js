const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderConfiguration = require('../models/ProviderConfiguration');
const ProviderConfigurationAudit = require('../models/ProviderConfigurationAudit');
const User = require('../models/User');

const PROVIDER_SCHEMAS = {
  paypal: [
    { key: 'PAYPAL_CLIENT_ID', label: 'Client ID Sandbox', type: 'text', required: true },
    { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret Sandbox', type: 'secret', required: true },
    { key: 'PAYPAL_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api-m.sandbox.paypal.com'], defaultValue: 'https://api-m.sandbox.paypal.com' },
    { key: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID Sandbox', type: 'text' },
    { key: 'PAYPAL_RETURN_URL', label: 'Return URL', type: 'url', required: true },
    { key: 'PAYPAL_CANCEL_URL', label: 'Cancel URL', type: 'url', required: true },
    { key: 'PAYPAL_WEBHOOK_URL', label: 'Webhook URL', type: 'url' },
  ],
  momo: [
    { key: 'MOMO_PARTNER_CODE', label: 'Partner Code Sandbox', type: 'text', required: true },
    { key: 'MOMO_ACCESS_KEY', label: 'Access Key Sandbox', type: 'secret', required: true },
    { key: 'MOMO_SECRET_KEY', label: 'Secret Key Sandbox', type: 'secret', required: true },
    { key: 'MOMO_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://test-payment.momo.vn'], defaultValue: 'https://test-payment.momo.vn' },
    { key: 'MOMO_PARTNER_NAME', label: 'Partner name', type: 'text' },
    { key: 'MOMO_STORE_ID', label: 'Store ID', type: 'text' },
    { key: 'MOMO_REDIRECT_URL', label: 'Redirect URL', type: 'url', required: true },
    { key: 'MOMO_IPN_URL', label: 'IPN URL', type: 'url', required: true },
  ],
  sendgrid: [
    { key: 'EMAIL_HOST', label: 'SMTP host', type: 'select', required: true, options: ['smtp.sendgrid.net'], defaultValue: 'smtp.sendgrid.net' },
    { key: 'EMAIL_PORT', label: 'SMTP port', type: 'select', required: true, options: ['587', '465'], defaultValue: '587' },
    { key: 'EMAIL_USER', label: 'SMTP username (giá trị cố định)', type: 'select', required: true, options: ['apikey'], defaultValue: 'apikey' },
    { key: 'SENDGRID_API_KEY', label: 'API key (dùng làm SMTP password)', type: 'secret', required: true },
    { key: 'EMAIL_FROM', label: 'Địa chỉ gửi đã xác minh', type: 'text', required: true },
  ],
  vercel: [
    { key: 'VERCEL_ACCESS_TOKEN', label: 'Access Token', type: 'secret', required: true },
    { key: 'VERCEL_TEAM_ID', label: 'Team ID', type: 'text' },
    { key: 'VERCEL_PROJECT_ID', label: 'Project ID staging', type: 'text', required: true },
    { key: 'VERCEL_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api.vercel.com'], defaultValue: 'https://api.vercel.com' },
    { key: 'VERCEL_DEPLOY_ENVIRONMENT', label: 'Môi trường deploy', type: 'select', required: true, options: ['preview'], defaultValue: 'preview' },
    { key: 'VERCEL_STAGING_BRANCH', label: 'Branch staging', type: 'text', required: true },
    { key: 'VERCEL_STAGING_DOMAIN', label: 'Domain staging', type: 'url' },
  ],
  render: [
    { key: 'RENDER_API_KEY', label: 'API key', type: 'secret', required: true },
    { key: 'RENDER_OWNER_ID', label: 'Workspace owner ID', type: 'text', required: true },
    { key: 'RENDER_SERVICE_ID', label: 'Service ID staging', type: 'text', required: true },
    { key: 'RENDER_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api.render.com/v1'], defaultValue: 'https://api.render.com/v1' },
    { key: 'RENDER_STAGING_BRANCH', label: 'Branch staging', type: 'text', required: true },
    { key: 'RENDER_STAGING_URL', label: 'URL staging', type: 'url' },
  ],
};

const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
const userName = (user) => user.name || user.username || user.email || '';

const encryptionKey = () => {
  const value = process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('PROVIDER_CONFIG_STORE_UNAVAILABLE');
  return Buffer.from(value, 'hex');
};

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
};

const decrypt = (value) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

const isValidFieldValue = (field, value) => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (!value && field.required && field.type !== 'secret') return false;
  if (!value) return true;
  if (field.type === 'url') {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }
  if (field.type === 'select') return field.options.includes(value);
  return true;
};

const getProvider = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return ProviderCatalogEntry.findOne({ _id: id, isDeleted: false }).lean();
};

const audit = async (provider, req, action, changedFields, version) => ProviderConfigurationAudit.create({
  providerId: provider._id,
  providerCode: provider.providerCode,
  action,
  changedFields,
  version,
  userId: req.user._id,
  userName: userName(req.user),
});

exports.getSchema = asyncHandler(async (req, res) => {
  const fields = PROVIDER_SCHEMAS[req.params.providerCode];
  if (!fields) return res.status(404).json({ success: false, code: 'PROVIDER_CONFIG_UNSUPPORTED' });
  const storeAvailable = /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '');
  noStore(res);
  res.json({ success: true, data: { fields, storeAvailable } });
});

exports.get = asyncHandler(async (req, res) => {
  const provider = await getProvider(req.params.id);
  if (!provider) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  const fields = PROVIDER_SCHEMAS[provider.providerCode];
  if (!fields) return res.status(404).json({ success: false, code: 'PROVIDER_CONFIG_UNSUPPORTED' });
  const configuration = await ProviderConfiguration.findOne({ providerId: provider._id }).lean();
  const values = { ...(configuration?.values || {}) };
  for (const field of fields) {
    if (!field.secret && values[field.key] === undefined && field.defaultValue !== undefined) values[field.key] = field.defaultValue;
  }
  const configuredSecrets = Object.keys(configuration?.encryptedSecrets || {});
  noStore(res);
  const storeAvailable = /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '');
  res.json({ success: true, data: { providerCode: provider.providerCode, fields, values, configuredSecrets, version: configuration?.version || 0, storeAvailable } });
});

exports.save = asyncHandler(async (req, res) => {
  const provider = await getProvider(req.params.id);
  if (!provider) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  const fields = PROVIDER_SCHEMAS[provider.providerCode];
  if (!fields) return res.status(404).json({ success: false, code: 'PROVIDER_CONFIG_UNSUPPORTED' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some((key) => !fields.some((field) => field.key === key))) {
    return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_CONFIG_FIELDS' });
  }

  const current = await ProviderConfiguration.findOne({ providerId: provider._id });
  const values = { ...(current?.values || {}) };
  const encryptedSecrets = { ...(current?.encryptedSecrets || {}) };
  const changedFields = [];
  for (const field of fields) {
    if (!Object.hasOwn(req.body, field.key)) continue;
    const value = req.body[field.key];
    if (!isValidFieldValue(field, value)) return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
    if (!value) continue;
    if (field.type === 'secret') encryptedSecrets[field.key] = encrypt(value);
    else values[field.key] = value;
    changedFields.push(field.key);
  }

  for (const field of fields) {
    if (!field.required) continue;
    const configured = field.type === 'secret' ? encryptedSecrets[field.key] : values[field.key] || field.defaultValue;
    if (!configured) return res.status(400).json({ success: false, code: `REQUIRED_${field.key}` });
  }
  if (!changedFields.length && current) return res.status(400).json({ success: false, code: 'PROVIDER_CONFIG_UPDATE_EMPTY' });

  const version = (current?.version || 0) + 1;
  const configuration = await ProviderConfiguration.findOneAndUpdate(
    { providerId: provider._id },
    { $set: { providerCode: provider.providerCode, values, encryptedSecrets, version, updatedBy: req.user._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await audit(provider, req, current ? 'update' : 'create', changedFields, version);
  noStore(res);
  res.json({ success: true, data: { providerCode: provider.providerCode, values, configuredSecrets: Object.keys(encryptedSecrets), version: configuration.version } });
});

exports.reveal = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body.password !== 'string' || Object.keys(req.body).some((key) => key !== 'password')) {
    return res.status(400).json({ success: false, code: 'REAUTHENTICATION_REQUIRED' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }
  const provider = await getProvider(req.params.id);
  if (!provider) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  const field = PROVIDER_SCHEMAS[provider.providerCode]?.find((item) => item.key === req.params.field && item.type === 'secret');
  if (!field) return res.status(404).json({ success: false, code: 'PROVIDER_SECRET_NOT_FOUND' });
  const configuration = await ProviderConfiguration.findOne({ providerId: provider._id }).lean();
  const encrypted = configuration?.encryptedSecrets?.[field.key];
  if (!encrypted) return res.status(404).json({ success: false, code: 'PROVIDER_SECRET_NOT_CONFIGURED' });
  let value;
  try {
    value = decrypt(encrypted);
  } catch {
    return res.status(503).json({ success: false, code: 'PROVIDER_CONFIG_STORE_UNAVAILABLE' });
  }
  await audit(provider, req, 'reveal', [field.key], configuration.version);
  noStore(res);
  res.json({ success: true, data: { key: field.key, value } });
});
