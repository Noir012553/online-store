const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderConfiguration = require('../models/ProviderConfiguration');
const ProviderConfigurationAudit = require('../models/ProviderConfigurationAudit');
const User = require('../models/User');

const PROVIDER_SCHEMAS = {
  paypal: [
    { key: 'PAYPAL_CLIENT_ID', label: 'Client ID Sandbox', type: 'text', required: true, helpText: 'Trong PayPal Developer Dashboard, mở app sandbox và sao chép Client ID.' },
    { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret Sandbox', type: 'secret', required: true, helpText: 'Lấy cùng app sandbox với Client ID; không dùng credential Live.' },
    { key: 'PAYPAL_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api-m.sandbox.paypal.com'], defaultValue: 'https://api-m.sandbox.paypal.com', helpText: 'Endpoint sandbox cố định; không chuyển sang Live.' },
    { key: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID Sandbox', type: 'text', helpText: 'Webhook ID của webhook sandbox đã tạo cho URL callback bên dưới; chỉ cần khi adapter xác minh webhook.' },
    { key: 'PAYPAL_RETURN_URL', label: 'Return URL', type: 'url', required: true, helpText: 'HTTPS URL của storefront nhận khách quay lại sau thanh toán; phải thuộc môi trường staging.' },
    { key: 'PAYPAL_CANCEL_URL', label: 'Cancel URL', type: 'url', required: true, helpText: 'HTTPS URL staging mà khách được chuyển về khi hủy thanh toán.' },
    { key: 'PAYPAL_WEBHOOK_URL', label: 'Webhook URL', type: 'url', helpText: 'HTTPS endpoint backend staging nhận sự kiện PayPal; endpoint phải xử lý và xác minh webhook.' },
  ],
  momo: [
    { key: 'MOMO_PARTNER_CODE', label: 'Partner Code Sandbox', type: 'text', required: true, helpText: 'Lấy trong bộ thông tin tích hợp thử nghiệm được MoMo cấp.' },
    { key: 'MOMO_ACCESS_KEY', label: 'Access Key Sandbox', type: 'secret', required: true, helpText: 'Credential sandbox đi kèm Partner Code; không dùng key production.' },
    { key: 'MOMO_SECRET_KEY', label: 'Secret Key Sandbox', type: 'secret', required: true, helpText: 'Dùng để ký/xác minh request sandbox; không dùng key production.' },
    { key: 'MOMO_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://test-payment.momo.vn'], defaultValue: 'https://test-payment.momo.vn', helpText: 'Host sandbox cố định theo hướng dẫn tích hợp MoMo.' },
    { key: 'MOMO_PARTNER_NAME', label: 'Partner name', type: 'text', helpText: 'Tên đối tác nếu bộ API/merchant sandbox của bạn yêu cầu.' },
    { key: 'MOMO_STORE_ID', label: 'Store ID', type: 'text', helpText: 'Mã cửa hàng nếu bộ API/merchant sandbox của bạn yêu cầu.' },
    { key: 'MOMO_REDIRECT_URL', label: 'Redirect URL', type: 'url', required: true, helpText: 'HTTPS URL staging để MoMo chuyển khách quay lại; không dùng redirect làm căn cứ duy nhất cập nhật đơn.' },
    { key: 'MOMO_IPN_URL', label: 'IPN URL', type: 'url', required: true, helpText: 'HTTPS endpoint backend staging nhận IPN; backend phải xác minh chữ ký trước khi cập nhật đơn.' },
  ],
  sendgrid: [
    { key: 'EMAIL_HOST', label: 'SMTP host', type: 'select', required: true, options: ['smtp.sendgrid.net'], defaultValue: 'smtp.sendgrid.net' },
    { key: 'EMAIL_PORT', label: 'SMTP port', type: 'select', required: true, options: ['587', '465'], defaultValue: '587' },
    { key: 'EMAIL_USER', label: 'SMTP username (giá trị cố định)', type: 'select', required: true, options: ['apikey'], defaultValue: 'apikey' },
    { key: 'SENDGRID_API_KEY', label: 'API key (dùng làm SMTP password)', type: 'secret', required: true },
    { key: 'EMAIL_FROM', label: 'Địa chỉ gửi đã xác minh', type: 'text', required: true },
  ],
  vercel: [
    { key: 'VERCEL_ACCESS_TOKEN', label: 'Access Token', type: 'secret', required: true, helpText: 'Tạo token trong Vercel Account Settings → Tokens; giới hạn quyền vào project staging cần thiết.' },
    { key: 'VERCEL_TEAM_ID', label: 'Team ID', type: 'text', helpText: 'Chỉ nhập khi project thuộc team; lấy ID team từ dashboard/API. Để trống với personal account.' },
    { key: 'VERCEL_PROJECT_ID', label: 'Project ID staging', type: 'text', required: true, helpText: 'Lấy trong Project Settings → General của project staging, không dùng tên project.' },
    { key: 'VERCEL_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api.vercel.com'], defaultValue: 'https://api.vercel.com' },
    { key: 'VERCEL_DEPLOY_ENVIRONMENT', label: 'Môi trường deploy', type: 'select', required: true, options: ['preview'], defaultValue: 'preview', helpText: 'Chỉ cho phép Preview; không dùng Production trong cấu hình này.' },
    { key: 'VERCEL_STAGING_BRANCH', label: 'Branch staging', type: 'text', required: true, helpText: 'Tên branch Git đã liên kết với project và dùng cho Preview deployment.' },
    { key: 'VERCEL_STAGING_DOMAIN', label: 'Domain staging', type: 'url', helpText: 'URL HTTPS tùy chọn trỏ tới Preview/branch staging; không bắt buộc để tạo Preview deployment.' },
  ],
  render: [
    { key: 'RENDER_API_KEY', label: 'API key', type: 'secret', required: true, helpText: 'Tạo tại Account Settings → API Keys và chỉ cấp quyền cần thiết cho workspace/service staging.' },
    { key: 'RENDER_OWNER_ID', label: 'Workspace owner ID', type: 'text', helpText: 'ID workspace/owner, có thể xem từ thông tin service/API. Không phải tên workspace.' },
    { key: 'RENDER_SERVICE_ID', label: 'Service ID staging', type: 'text', required: true, helpText: 'ID của service staging; có thể lấy từ URL Dashboard hoặc kết quả API của service.' },
    { key: 'RENDER_API_BASE_URL', label: 'API base URL', type: 'select', required: true, options: ['https://api.render.com/v1'], defaultValue: 'https://api.render.com/v1' },
    { key: 'RENDER_STAGING_BRANCH', label: 'Branch staging', type: 'text', required: true, helpText: 'Branch đã cấu hình trong phần Build & Deploy của service Render staging.' },
    { key: 'RENDER_STAGING_URL', label: 'URL staging', type: 'url', helpText: 'URL HTTPS của service staging; Free web services có thể ngủ sau thời gian không hoạt động.' },
  ],
};

const PROVIDER_SETUP_GUIDES = {
  paypal: { label: 'PayPal REST Authentication & Sandbox', url: 'https://developer.paypal.com/api/rest/authentication/', note: 'Tạo app trong Sandbox và dùng cặp Client ID/Secret của app đó. Webhook ID lấy từ webhook sandbox đã đăng ký.' },
  momo: { label: 'MoMo Payment API Init', url: 'https://developers.momo.vn/v3/docs/payment/api/payment-api/init/', note: 'Dùng bộ credential thử nghiệm được cấp cho merchant; partnerName/Store ID phụ thuộc API và tài khoản.' },
  sendgrid: { label: 'SendGrid SMTP', url: 'https://docs.sendgrid.com/for-developers/sending-email/getting-started-smtp', note: 'Chỉ dùng API key và sender đã xác minh cho môi trường staging.' },
  vercel: { label: 'Vercel REST API', url: 'https://vercel.com/docs/rest-api#creating-an-access-token', note: 'Preview branch có thể dùng cho staging; không mặc định dùng Vercel Hobby cho cửa hàng thương mại, hãy xác minh điều khoản hiện hành. Cấu hình tại đây chưa tự deploy.' },
  render: { label: 'Render API', url: 'https://render.com/docs/api', note: 'Render Free có thể spin down sau 15 phút không có traffic và filesystem không bền vững; Preview Environments đa dịch vụ không có trên Free. Cấu hình tại đây chưa tự deploy.' },
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
  res.json({ success: true, data: { fields, setupGuide: PROVIDER_SETUP_GUIDES[req.params.providerCode] || null, storeAvailable } });
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
  res.json({ success: true, data: { providerCode: provider.providerCode, fields, setupGuide: PROVIDER_SETUP_GUIDES[provider.providerCode] || null, values, configuredSecrets, version: configuration?.version || 0, storeAvailable } });
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
