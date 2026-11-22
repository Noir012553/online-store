const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderConfiguration = require('../models/ProviderConfiguration');
const ProviderConfigurationAudit = require('../models/ProviderConfigurationAudit');
const ProviderRuntimeAudit = require('../models/ProviderRuntimeAudit');
const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const { encryptSecret, decryptSecret, loadVnpayRuntimeConfig } = require('../services/vnpayRuntimeConfigService');
const { loadCloudflareAiRuntimeConfiguration } = require('../services/cloudflareAiRuntimeConfigService');
const { getProviderRuntimeValues, setProviderRuntimeValues } = require('../services/providerRuntimeConfigCache');
const cloudflareAiService = require('../services/cloudflareAiService');
const paymentService = require('../services/paymentService');
const { resetR2Clients } = require('../services/r2AssetService');
const PaymentMethod = require('../models/PaymentMethod');
const ShippingProvider = require('../models/ShippingProvider');
const User = require('../models/User');

const PROVIDER_SCHEMAS = {
  paypal: [
    { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', type: 'text', required: true, helpText: 'Trong PayPal Developer Dashboard, mở app sandbox và sao chép Client ID.' },
    { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret', type: 'secret', required: true, helpText: 'Lấy cùng app sandbox với Client ID; không dùng credential Live.' },
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
  cloudflare_tunnel: [
    { key: 'CLOUDFLARE_TUNNEL_ID', label: 'Tunnel ID', type: 'text', required: true },
    { key: 'CLOUDFLARE_TUNNEL_TOKEN', label: 'Tunnel token', type: 'secret', required: true },
    { key: 'CLOUDFLARE_TUNNEL_HOSTNAME', label: 'Hostname', type: 'text', required: true },
  ],
};

const RUNTIME_SCHEMAS = {
  smtp: [
    { key: 'EMAIL_SERVICE', label: 'Email service', type: 'select', options: ['smtp'], defaultValue: 'smtp' },
    { key: 'EMAIL_HOST', label: 'SMTP host', type: 'text', defaultValue: 'smtp.gmail.com' },
    { key: 'EMAIL_PORT', label: 'SMTP port', type: 'text', defaultValue: '587' },
    { key: 'EMAIL_SECURE', label: 'SMTP secure', type: 'boolean', defaultValue: 'false' },
    { key: 'EMAIL_USER', label: 'SMTP username', type: 'text' },
    { key: 'EMAIL_PASSWORD', label: 'SMTP password', type: 'secret' },
    { key: 'EMAIL_FROM', label: 'From address', type: 'text', fallbackKey: 'EMAIL_USER' },
  ],
  sendgrid: [
    { key: 'EMAIL_SERVICE', label: 'Email service', type: 'select', options: ['sendgrid'], defaultValue: 'sendgrid' },
    { key: 'SENDGRID_API_KEY', label: 'SendGrid API key', type: 'secret' },
    { key: 'EMAIL_FROM', label: 'Verified sender', type: 'text' },
  ],
  cod: [
    { key: 'COD_CHECKOUT_ENABLED', label: 'COD checkout enabled', type: 'boolean' },
  ],
  vnpay: [
    { key: 'VNPAY_TMN_CODE', label: 'Mã terminal / merchant', type: 'text' },
    { key: 'VNPAY_HASH_SECRET', label: 'Hash Secret', type: 'secret' },
    { key: 'VNPAY_ENDPOINT', label: 'Payment endpoint', type: 'url', defaultValue: 'https://sandbox.vnpayment.vn/paygate' },
    { key: 'VNPAY_RETURN_URL', label: 'Return URL', type: 'url' },
    { key: 'VNPAY_CALLBACK_URL', label: 'Callback / IPN URL', type: 'url' },
  ],
  ghn: [
    { key: 'GHN_API_TOKEN', label: 'GHN API token', type: 'secret', envKey: 'GHN_API_TOKEN', databaseField: 'apiKey' },
    { key: 'GHN_SHOP_ID', label: 'GHN shop ID', type: 'text', envKey: 'GHN_SHOP_ID', databaseField: 'token' },
    { key: 'GHN_API_URL', label: 'GHN API URL', type: 'url', databaseField: 'apiUrl', defaultValue: 'https://dev-online-gateway.ghn.vn/shiip/public-api' },
    { key: 'GHN_WAREHOUSE_DISTRICT_ID', label: 'Warehouse district ID', type: 'text' },
    { key: 'GHN_WAREHOUSE_WARD_CODE', label: 'Warehouse ward code', type: 'text' },
  ],
  paypal: null,
  momo: null,
  vercel: null,
  render: null,
  cloudflare_tunnel: null,
};

const RUNTIME_PROVIDER_CODES = ['smtp', 'sendgrid', 'cod', 'vnpay', 'paypal', 'momo', 'vercel', 'render', 'ghn', 'cloudflare_tunnel', 'cloudflare_r2', 'cloudflare_ai'];
const EDITABLE_RUNTIME_PROVIDERS = ['smtp', 'sendgrid', 'cod', 'ghn', 'cloudflare_r2'];
const getRuntimeStorageCode = (providerCode) => providerCode === 'smtp' || providerCode === 'sendgrid' ? 'email' : providerCode;

const getRuntimeSchema = (providerCode, configuredKeys = []) => {
  if (providerCode === 'cloudflare_r2') {
    const policies = [
      { key: 'R2_UPLOAD_ENABLED', label: 'Uploads enabled', type: 'boolean' },
      { key: 'R2_MAX_UPLOAD_COUNT', label: 'Daily upload limit', type: 'text' },
      { key: 'R2_MAX_UPLOAD_BYTES', label: 'Daily upload byte limit', type: 'text' },
      { key: 'R2_MAX_IMAGE_BYTES', label: 'Image size limit', type: 'text' },
      { key: 'R2_MAX_VIDEO_BYTES', label: 'Video size limit', type: 'text' },
      { key: 'R2_MAX_RETRIES', label: 'Retry limit', type: 'text', defaultValue: '2' },
    ];
    const configuredAccountIndexes = configuredKeys.map((key) => key.match(/^R2_ACCOUNT_ID(?:_(\d+))?$/)?.[1] || (key === 'R2_ACCOUNT_ID' ? '1' : null)).filter(Boolean).map(Number);
    const highestConfiguredAccount = Math.max(0, ...configuredAccountIndexes);
    const maxAccountIndex = Math.min(9, highestConfiguredAccount + 1 || 1);
    const accounts = Array.from({ length: maxAccountIndex }, (_, index) => {
      const suffix = index === 0 ? '' : `_${index + 1}`;
      const fields = [
        { key: `R2_ACCOUNT_ID${suffix}`, label: `Account ID ${index + 1}`, type: 'text' },
        { key: `R2_ACCESS_KEY_ID${suffix}`, label: `Access key ${index + 1}`, type: 'secret' },
        { key: `R2_SECRET_ACCESS_KEY${suffix}`, label: `Secret key ${index + 1}`, type: 'secret' },
        { key: `R2_BUCKET_NAME${suffix}`, label: `Bucket ${index + 1}`, type: 'text' },
        { key: `R2_PUBLIC_BASE_URL${suffix}`, label: `Public URL ${index + 1}`, type: 'url' },
      ];
      return index + 1 === maxAccountIndex || fields.some((field) => process.env[field.key] || configuredKeys.includes(field.key)) ? fields : [];
    }).flat();
    return [...policies, ...accounts];
  }
  if (providerCode === 'cloudflare_ai') {
    const policies = [
      { key: 'CLOUDFLARE_AI_ENABLED', label: 'Cloudflare AI enabled', type: 'text' },
      { key: 'CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', label: 'Daily request limit', type: 'text' },
      { key: 'CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', label: 'Daily input character limit', type: 'text' },
      { key: 'CLOUDFLARE_MAX_REQUESTS_PER_SEC', label: 'Requests per second limit', type: 'text' },
      { key: 'CLOUDFLARE_MAX_PARALLEL_REQUESTS', label: 'Parallel request limit', type: 'text' },
      { key: 'CLOUDFLARE_AI_INPUT_CHUNK_SIZE', label: 'Input chunk size', type: 'text' },
    ];
    const accounts = Array.from({ length: 13 }, (_, index) => {
      const suffix = `_${index + 1}`;
      const fields = [
        { key: `CLOUDFLARE_ACCOUNT_ID${suffix}`, label: `Account ID ${index + 1}`, type: 'text' },
        { key: `CLOUDFLARE_API_TOKEN${suffix}`, label: `API token ${index + 1}`, type: 'secret' },
        { key: `CLOUDFLARE_AI_MODEL${suffix}`, label: `AI model ${index + 1}`, type: 'text' },
      ];
      return fields.some((field) => process.env[field.key] || configuredKeys.includes(field.key)) ? fields : [];
    }).flat();
    return [...policies, ...accounts];
  }
  return RUNTIME_SCHEMAS[providerCode];
};

const PROVIDER_SETUP_GUIDES = {
  paypal: { label: 'PayPal REST Authentication & Sandbox', url: 'https://developer.paypal.com/api/rest/authentication/', note: 'Tạo app trong Sandbox và dùng cặp Client ID/Secret của app đó. Webhook ID lấy từ webhook sandbox đã đăng ký.' },
  momo: { label: 'MoMo Sandbox Test Instructions', url: 'https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/', note: 'Hướng dẫn test sandbox MoMo. Link Payment API Init cũ hiện trả 403; liên hệ hỗ trợ doanh nghiệp MoMo để được cấp credential thử nghiệm nếu tài khoản chưa có.' },
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

const getRuntimeProviderData = async (providerCode) => {
  const cloudflareRuntime = providerCode === 'cloudflare_ai' ? await loadCloudflareAiRuntimeConfiguration() : null;
  const storedRuntimeValues = getProviderRuntimeValues(providerCode);
  const runtimeStorageCode = getRuntimeStorageCode(providerCode);
  const runtimeConfiguration = ['vnpay', 'cloudflare_ai'].includes(providerCode)
    ? null
    : await ProviderRuntimeConfiguration.findOne({ providerCode: runtimeStorageCode }).lean();
  const schema = getRuntimeSchema(providerCode, [...Object.keys(storedRuntimeValues), ...(cloudflareRuntime?.databaseKeys || [])]);
  let shippingProvider;
  let paymentMethod;
  const vnpayRuntime = providerCode === 'vnpay' ? await loadVnpayRuntimeConfig() : null;
  if (providerCode === 'ghn') {
    shippingProvider = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false }).select('+apiKey +token').lean();
  }
  if (providerCode === 'cod' || providerCode === 'vnpay') {
    paymentMethod = await PaymentMethod.findOne({ code: providerCode, isDeleted: false }).lean();
  }

  const fields = (schema || []).map((field) => {
    if (providerCode === 'cod') {
      return { key: field.key, label: field.label, type: field.type, configured: Boolean(paymentMethod), value: String(Boolean(paymentMethod?.isEnabled)), source: 'database' };
    }
    const runtimeValue = vnpayRuntime?.values[field.key];
    if (runtimeValue) {
      return {
        key: field.key,
        label: field.label,
        type: field.type,
        configured: Boolean(runtimeValue.value),
        value: field.type === 'secret' ? null : String(runtimeValue.value),
        source: runtimeValue.source,
      };
    }
    const envKey = field.envKey || field.key;
    const hasCloudflareOverride = cloudflareRuntime && Object.hasOwn(cloudflareRuntime.values, field.key);
    const hasRuntimeOverride = Object.hasOwn(storedRuntimeValues, field.key);
    let rawValue = hasRuntimeOverride
      ? String(storedRuntimeValues[field.key])
      : hasCloudflareOverride ? String(cloudflareRuntime.values[field.key]) : process.env[envKey];
    let source = hasRuntimeOverride || hasCloudflareOverride ? 'database' : rawValue ? 'environment' : 'unset';
    if (!rawValue && field.fallbackKey && process.env[field.fallbackKey]) {
      rawValue = process.env[field.fallbackKey];
      source = 'environment';
    }
    if (!rawValue && field.databaseField && shippingProvider?.[field.databaseField]) {
      rawValue = shippingProvider[field.databaseField];
      source = 'database';
    }
    const value = rawValue || field.defaultValue || '';
    return {
      key: field.key,
      label: field.label,
      type: field.type,
      configured: Boolean(value),
      value: field.type === 'secret' ? null : String(value),
      source: rawValue ? source : field.defaultValue ? 'runtime-default' : 'unset',
    };
  });

  if (shippingProvider) fields.push({ key: 'GHN_PROVIDER_ACTIVE', label: 'GHN provider active', type: 'text', configured: true, value: String(shippingProvider.isActive), source: 'database' });
  if (providerCode === 'vnpay') fields.push({ key: 'VNPAY_CHECKOUT_ENABLED', label: 'Checkout enabled', type: 'text', configured: true, value: String(vnpayRuntime.checkoutEnabled), source: 'database' });
  else if (paymentMethod && providerCode !== 'cod') fields.push({ key: `${providerCode.toUpperCase()}_CHECKOUT_ENABLED`, label: 'Checkout enabled', type: 'text', configured: true, value: String(paymentMethod.isEnabled), source: 'database' });

  const managed = schema !== null;
  const configuredKeys = new Set(fields.filter((field) => field.configured).map((field) => field.key));
  const requiredKeys = {
    smtp: ['EMAIL_USER', 'EMAIL_PASSWORD'],
    sendgrid: ['SENDGRID_API_KEY', 'EMAIL_FROM'],
    vnpay: ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_RETURN_URL'],
    ghn: ['GHN_API_TOKEN', 'GHN_SHOP_ID'],
  }[providerCode];
  let ready = Boolean(paymentMethod);
  if (providerCode === 'sendgrid') {
    ready = (storedRuntimeValues.EMAIL_SERVICE || process.env.EMAIL_SERVICE) === 'sendgrid'
      && ['SENDGRID_API_KEY', 'EMAIL_FROM'].every((key) => configuredKeys.has(key));
  } else if (providerCode === 'smtp') {
    ready = (storedRuntimeValues.EMAIL_SERVICE || process.env.EMAIL_SERVICE) !== 'sendgrid'
      && ['EMAIL_USER', 'EMAIL_PASSWORD'].every((key) => configuredKeys.has(key));
  } else if (providerCode === 'cloudflare_r2') {
    ready = Array.from({ length: 9 }, (_, index) => {
      const suffix = index === 0 ? '' : `_${index + 1}`;
      return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].every((key) => configuredKeys.has(`${key}${suffix}`));
    }).some(Boolean);
  } else if (providerCode === 'cloudflare_ai') {
    ready = Array.from({ length: 13 }, (_, index) => {
      const suffix = `_${index + 1}`;
      return configuredKeys.has(`CLOUDFLARE_ACCOUNT_ID${suffix}`) && configuredKeys.has(`CLOUDFLARE_API_TOKEN${suffix}`);
    }).some(Boolean);
  } else if (requiredKeys) {
    ready = requiredKeys.every((key) => configuredKeys.has(key));
  } else if (providerCode === 'ghn') {
    ready = Boolean(shippingProvider);
  }
  const hasRuntimeData = Boolean(paymentMethod || shippingProvider || fields.some((field) => field.configured));
  const status = !managed ? 'not-managed' : ready ? 'configured' : hasRuntimeData ? 'incomplete' : 'not-configured';
  return {
    providerCode,
    managed,
    status,
    fields,
    ...(vnpayRuntime ? { configurationVersion: vnpayRuntime.version, storeAvailable: vnpayRuntime.storeAvailable } : {}),
    ...(cloudflareRuntime ? { configurationVersion: cloudflareRuntime.version, storeAvailable: cloudflareRuntime.storeAvailable } : {}),
    ...(!vnpayRuntime && !cloudflareRuntime && schema?.length ? {
      configurationVersion: runtimeConfiguration?.version || 0,
      storeAvailable: providerCode === 'cod' || /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || ''),
    } : {}),
  };
};

exports.getRuntimeProviders = asyncHandler(async (_req, res) => {
  const providers = await Promise.all(RUNTIME_PROVIDER_CODES.map(getRuntimeProviderData));
  noStore(res);
  res.json({ success: true, data: providers });
});

exports.getRuntimeProvider = asyncHandler(async (req, res) => {
  const { providerCode } = req.params;
  if (!RUNTIME_PROVIDER_CODES.includes(providerCode)) return res.status(404).json({ success: false, code: 'PROVIDER_RUNTIME_UNSUPPORTED' });
  noStore(res);
  res.json({ success: true, data: await getRuntimeProviderData(providerCode) });
});

exports.revealRuntimeSecret = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body.password !== 'string' || Object.keys(req.body).some((key) => key !== 'password')) {
    return res.status(400).json({ success: false, code: 'REAUTHENTICATION_REQUIRED' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }

  const { providerCode, key } = req.params;
  if (!RUNTIME_PROVIDER_CODES.includes(providerCode)) return res.status(404).json({ success: false, code: 'PROVIDER_RUNTIME_UNSUPPORTED' });
  const field = (getRuntimeSchema(providerCode) || []).find((item) => item.key === key && item.type === 'secret');
  if (!field) return res.status(404).json({ success: false, code: 'PROVIDER_SECRET_NOT_FOUND' });

  const vnpayRuntime = providerCode === 'vnpay' ? await loadVnpayRuntimeConfig() : null;
  let value = vnpayRuntime?.values[key]?.value || getProviderRuntimeValue(getRuntimeStorageCode(providerCode), key) || process.env[field.envKey || field.key] || '';
  if (!value && field.fallbackKey) value = process.env[field.fallbackKey] || '';
  if (!value && field.databaseField && providerCode === 'ghn') {
    const provider = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false }).select(`+${field.databaseField}`).lean();
    value = provider?.[field.databaseField] || '';
  }
  if (!value) return res.status(404).json({ success: false, code: 'PROVIDER_SECRET_NOT_CONFIGURED' });

  await ProviderRuntimeAudit.create({
    providerCode,
    action: 'reveal',
    changedFields: [key],
    userId: req.user._id,
    userName: userName(req.user),
  });
  noStore(res);
  res.json({ success: true, data: { key, value } });
});

const validateRuntimeValues = (providerCode, values) => {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.length > 2048) return `INVALID_${key}`;
    if (/URL$/.test(key) && value) {
      let parsed;
      try { parsed = new URL(value); } catch { return `INVALID_${key}`; }
      if (parsed.protocol !== 'https:') return `INVALID_${key}`;
    }
  }

  if (providerCode === 'smtp' || providerCode === 'sendgrid') {
    const port = values.EMAIL_PORT;
    if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) return 'INVALID_EMAIL_PORT';
    if (values.EMAIL_SECURE && !['true', 'false'].includes(values.EMAIL_SECURE)) return 'INVALID_EMAIL_SECURE';
  }
  if (providerCode === 'ghn') {
    const shopId = values.GHN_SHOP_ID;
    if (shopId && !/^\d{1,12}$/.test(shopId)) return 'INVALID_GHN_SHOP_ID';
    const districtId = values.GHN_WAREHOUSE_DISTRICT_ID;
    if (districtId && (!/^\d+$/.test(districtId) || Number(districtId) <= 0)) return 'INVALID_GHN_WAREHOUSE_DISTRICT_ID';
    const apiUrl = values.GHN_API_URL;
    if (apiUrl) {
      let parsed;
      try { parsed = new URL(apiUrl); } catch { return 'INVALID_GHN_API_URL'; }
      if (parsed.protocol !== 'https:' || !['dev-online-gateway.ghn.vn', 'online-gateway.ghn.vn'].includes(parsed.hostname)) return 'INVALID_GHN_API_URL';
    }
  }
  if (providerCode === 'cloudflare_r2') {
    const integerFields = ['R2_MAX_UPLOAD_COUNT', 'R2_MAX_UPLOAD_BYTES', 'R2_MAX_IMAGE_BYTES', 'R2_MAX_VIDEO_BYTES', 'R2_MAX_RETRIES'];
    for (const key of integerFields) {
      if (values[key] !== undefined && values[key] !== '' && (!/^\d+$/.test(values[key]) || !Number.isSafeInteger(Number(values[key])))) return `INVALID_${key}`;
    }
    if (values.R2_UPLOAD_ENABLED !== undefined && !['true', 'false'].includes(values.R2_UPLOAD_ENABLED)) return 'INVALID_R2_UPLOAD_ENABLED';
    for (let index = 1; index <= 9; index += 1) {
      const suffix = index === 1 ? '' : `_${index}`;
      const keys = [`R2_ACCOUNT_ID${suffix}`, `R2_ACCESS_KEY_ID${suffix}`, `R2_SECRET_ACCESS_KEY${suffix}`, `R2_BUCKET_NAME${suffix}`, `R2_PUBLIC_BASE_URL${suffix}`];
      const configured = keys.map((key) => values[key] || '');
      if (configured.some(Boolean) && configured.some((value) => !value)) return `INCOMPLETE_R2_ACCOUNT_${index}`;
    }
  }
  if (providerCode === 'cod' && !['true', 'false'].includes(values.COD_CHECKOUT_ENABLED)) return 'INVALID_COD_CHECKOUT_ENABLED';
  return null;
};

exports.updateRuntimeProvider = asyncHandler(async (req, res) => {
  const { providerCode } = req.params;
  if (!EDITABLE_RUNTIME_PROVIDERS.includes(providerCode)) return res.status(404).json({ success: false, code: 'PROVIDER_RUNTIME_UNSUPPORTED' });
  const runtimeFields = getRuntimeSchema(providerCode, Object.keys(getProviderRuntimeValues(getRuntimeStorageCode(providerCode))));
  const allowedFields = new Set((runtimeFields || []).map((field) => field.key));
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some((key) => key !== 'password' && !allowedFields.has(key))
    || typeof req.body.password !== 'string') {
    return res.status(400).json({ success: false, code: 'INVALID_RUNTIME_PROVIDER_FIELDS' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });

  const submittedValues = Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'password'));
  if (providerCode === 'cod') {
    if (typeof submittedValues.COD_CHECKOUT_ENABLED !== 'boolean') return res.status(400).json({ success: false, code: 'INVALID_COD_CHECKOUT_ENABLED' });
    const method = await PaymentMethod.findOneAndUpdate(
      { code: 'cod', isDeleted: false },
      { $set: { isEnabled: submittedValues.COD_CHECKOUT_ENABLED } },
      { new: true },
    ).lean();
    if (!method) return res.status(404).json({ success: false, code: 'PAYMENT_METHOD_NOT_FOUND' });
    await ProviderRuntimeAudit.create({ providerCode, action: 'update', changedFields: ['COD_CHECKOUT_ENABLED'], userId: req.user._id, userName: userName(req.user) });
    noStore(res);
    return res.json({ success: true, data: { configurationVersion: 0 } });
  }

  if (!/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '')) {
    return res.status(503).json({ success: false, code: 'PROVIDER_CONFIG_STORE_UNAVAILABLE' });
  }
  const storageCode = getRuntimeStorageCode(providerCode);
  const existing = await ProviderRuntimeConfiguration.findOne({ providerCode: storageCode }).lean();
  const values = { ...(existing?.values || {}) };
  const encryptedSecrets = { ...(existing?.encryptedSecrets || {}) };
  const changedFields = [];
  for (const field of runtimeFields || []) {
    if (!Object.hasOwn(submittedValues, field.key)) continue;
    const value = submittedValues[field.key];
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
    } else if (typeof value !== 'string' || value.length > 2048) {
      return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
    }
    const normalized = String(value).trim();
    if (field.type === 'select' && !field.options?.includes(normalized)) return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
    if (field.type === 'secret') {
      if (normalized) {
        encryptedSecrets[field.key] = encryptSecret(normalized);
        changedFields.push(field.key);
      }
      continue;
    }
    if (normalized) values[field.key] = normalized;
    else delete values[field.key];
    changedFields.push(field.key);
  }
  const effectiveValues = {
    ...Object.fromEntries(runtimeFields.map((field) => [field.key, process.env[field.envKey || field.key] || field.defaultValue || ''])),
    ...values,
  };
  for (const [key, encrypted] of Object.entries(encryptedSecrets)) effectiveValues[key] = decryptSecret(encrypted);
  const validationError = validateRuntimeValues(providerCode, effectiveValues);
  if (validationError) return res.status(400).json({ success: false, code: validationError });
  if (!changedFields.length) return res.status(400).json({ success: false, code: 'NO_RUNTIME_CHANGES' });

  const version = (existing?.version || 0) + 1;
  await ProviderRuntimeConfiguration.findOneAndUpdate(
    { providerCode: storageCode },
    { $set: { providerCode: storageCode, values, encryptedSecrets, version, updatedBy: req.user._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  setProviderRuntimeValues(storageCode, values, encryptedSecrets);
  if (providerCode === 'cloudflare_r2') resetR2Clients();
  await ProviderRuntimeAudit.create({ providerCode, action: 'update', changedFields, userId: req.user._id, userName: userName(req.user) });
  noStore(res);
  res.json({ success: true, data: { configurationVersion: version } });
});

exports.updateVnpayRuntime = asyncHandler(async (req, res) => {
  const allowedFields = ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_ENDPOINT', 'VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL', 'VNPAY_CHECKOUT_ENABLED', 'password'];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some((key) => !allowedFields.includes(key))
    || typeof req.body.password !== 'string' || typeof req.body.VNPAY_CHECKOUT_ENABLED !== 'boolean'
    || (Object.hasOwn(req.body, 'VNPAY_HASH_SECRET') && typeof req.body.VNPAY_HASH_SECRET !== 'string')) {
    return res.status(400).json({ success: false, code: 'INVALID_VNPAY_RUNTIME_FIELDS' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '')) {
    return res.status(503).json({ success: false, code: 'PROVIDER_CONFIG_STORE_UNAVAILABLE' });
  }

  const current = await loadVnpayRuntimeConfig();
  const values = {
    VNPAY_TMN_CODE: req.body.VNPAY_TMN_CODE,
    VNPAY_ENDPOINT: req.body.VNPAY_ENDPOINT,
    VNPAY_RETURN_URL: req.body.VNPAY_RETURN_URL,
    VNPAY_CALLBACK_URL: req.body.VNPAY_CALLBACK_URL,
    VNPAY_CHECKOUT_ENABLED: req.body.VNPAY_CHECKOUT_ENABLED,
  };
  for (const key of ['VNPAY_TMN_CODE', 'VNPAY_ENDPOINT', 'VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL']) {
    if (typeof values[key] !== 'string' || values[key].length > 2048) return res.status(400).json({ success: false, code: `INVALID_${key}` });
  }
  if (values.VNPAY_TMN_CODE && !/^[A-Za-z0-9]{1,20}$/.test(values.VNPAY_TMN_CODE)) return res.status(400).json({ success: false, code: 'INVALID_VNPAY_TMN_CODE' });
  if (values.VNPAY_ENDPOINT) {
    let endpoint;
    try { endpoint = new URL(values.VNPAY_ENDPOINT); } catch { return res.status(400).json({ success: false, code: 'INVALID_VNPAY_ENDPOINT' }); }
    if (endpoint.protocol !== 'https:' || !['sandbox.vnpayment.vn', 'pay.vnpay.vn'].includes(endpoint.hostname)) return res.status(400).json({ success: false, code: 'INVALID_VNPAY_ENDPOINT' });
  } else if (values.VNPAY_CHECKOUT_ENABLED) {
    return res.status(400).json({ success: false, code: 'INVALID_VNPAY_ENDPOINT' });
  }
  for (const key of ['VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL']) {
    if (values[key]) {
      let url;
      try { url = new URL(values[key]); } catch { return res.status(400).json({ success: false, code: `INVALID_${key}` }); }
      if (url.protocol !== 'https:') return res.status(400).json({ success: false, code: `INVALID_${key}` });
    }
  }

  const submittedSecret = typeof req.body.VNPAY_HASH_SECRET === 'string' ? req.body.VNPAY_HASH_SECRET.trim() : '';
  if (submittedSecret.length > 2048) return res.status(400).json({ success: false, code: 'INVALID_VNPAY_HASH_SECRET' });
  const encryptedSecrets = current.config.partnerKey
    ? (await ProviderRuntimeConfiguration.findOne({ providerCode: 'vnpay' }).lean())?.encryptedSecrets || {}
    : {};
  if (submittedSecret) {
    encryptedSecrets.VNPAY_HASH_SECRET = encryptSecret(submittedSecret);
  } else if (!current.config.partnerKey && values.VNPAY_CHECKOUT_ENABLED) {
    return res.status(400).json({ success: false, code: 'REQUIRED_VNPAY_HASH_SECRET' });
  }
  const effectiveSecret = submittedSecret || current.config.partnerKey;
  if (values.VNPAY_CHECKOUT_ENABLED && (!values.VNPAY_TMN_CODE || !effectiveSecret || !values.VNPAY_ENDPOINT || !values.VNPAY_RETURN_URL)) {
    return res.status(400).json({ success: false, code: 'VNPAY_RUNTIME_CONFIG_INCOMPLETE' });
  }

  const existing = await ProviderRuntimeConfiguration.findOne({ providerCode: 'vnpay' }).lean();
  const version = (existing?.version || 0) + 1;
  await ProviderRuntimeConfiguration.findOneAndUpdate(
    { providerCode: 'vnpay' },
    { $set: { providerCode: 'vnpay', values, encryptedSecrets, version, updatedBy: req.user._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await ProviderRuntimeAudit.create({
    providerCode: 'vnpay',
    action: 'update',
    changedFields: Object.keys(values).concat(req.body.VNPAY_HASH_SECRET ? ['VNPAY_HASH_SECRET'] : []),
    userId: req.user._id,
    userName: userName(req.user),
  });
  await paymentService.refreshVnpayAdapter();
  noStore(res);
  res.json({ success: true, data: { configurationVersion: version } });
});

exports.updateCloudflareAiRuntime = asyncHandler(async (req, res) => {
  const allAccountKeys = Array.from({ length: 13 }, (_, index) => {
    const suffix = `_${index + 1}`;
    return [`CLOUDFLARE_ACCOUNT_ID${suffix}`, `CLOUDFLARE_API_TOKEN${suffix}`, `CLOUDFLARE_AI_MODEL${suffix}`];
  }).flat();
  const fields = getRuntimeSchema('cloudflare_ai', allAccountKeys);
  const allowedFields = fields.map((field) => field.key);
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some((key) => key !== 'password' && !allowedFields.includes(key))
    || typeof req.body.password !== 'string') {
    return res.status(400).json({ success: false, code: 'INVALID_CLOUDFLARE_RUNTIME_FIELDS' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '')) {
    return res.status(503).json({ success: false, code: 'PROVIDER_CONFIG_STORE_UNAVAILABLE' });
  }

  const existing = await ProviderRuntimeConfiguration.findOne({ providerCode: 'cloudflare_ai' }).lean();
  const values = { ...(existing?.values || {}) };
  const encryptedSecrets = { ...(existing?.encryptedSecrets || {}) };
  const changedFields = [];
  for (const field of fields) {
    if (field.type === 'secret') {
      if (Object.hasOwn(req.body, field.key)) {
        if (typeof req.body[field.key] !== 'string' || req.body[field.key].length > 2048) {
          return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
        }
        const value = req.body[field.key].trim();
        if (value) {
          encryptedSecrets[field.key] = encryptSecret(value);
          changedFields.push(field.key);
        }
      }
      continue;
    }
    if (!Object.hasOwn(req.body, field.key)) continue;
    const value = req.body[field.key];
    if (typeof value !== 'string' || value.length > 2048) return res.status(400).json({ success: false, code: `INVALID_${field.key}` });
    if (value.trim()) values[field.key] = value.trim();
    else delete values[field.key];
    changedFields.push(field.key);
  }

  const effectiveValues = {
    ...Object.fromEntries(fields.map((field) => [field.key, process.env[field.key] || ''])),
    ...values,
  };
  for (const field of fields.filter((item) => item.type === 'secret')) {
    if (encryptedSecrets[field.key]) effectiveValues[field.key] = decryptSecret(encryptedSecrets[field.key]);
  }
  const integerFields = [
    ['CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', 0],
    ['CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', 0],
    ['CLOUDFLARE_MAX_REQUESTS_PER_SEC', 1],
    ['CLOUDFLARE_MAX_PARALLEL_REQUESTS', 1],
    ['CLOUDFLARE_AI_INPUT_CHUNK_SIZE', 1],
  ];
  for (const [key, minimum] of integerFields) {
    const value = effectiveValues[key];
    if (value !== undefined && value !== '' && (!Number.isInteger(Number(value)) || Number(value) < minimum)) {
      return res.status(400).json({ success: false, code: `INVALID_${key}` });
    }
  }
  if (effectiveValues.CLOUDFLARE_AI_ENABLED !== undefined && !['true', 'false', ''].includes(String(effectiveValues.CLOUDFLARE_AI_ENABLED))) {
    return res.status(400).json({ success: false, code: 'INVALID_CLOUDFLARE_AI_ENABLED' });
  }
  for (let index = 1; index <= 13; index += 1) {
    const suffix = `_${index}`;
    const accountId = effectiveValues[`CLOUDFLARE_ACCOUNT_ID${suffix}`] || '';
    const token = effectiveValues[`CLOUDFLARE_API_TOKEN${suffix}`] || '';
    const model = effectiveValues[`CLOUDFLARE_AI_MODEL${suffix}`] || '';
    if (accountId && !/^[a-f0-9]{32}$/i.test(accountId)) return res.status(400).json({ success: false, code: `INVALID_CLOUDFLARE_ACCOUNT_ID${suffix}` });
    if ((accountId || token || model) && (!accountId || !token)) return res.status(400).json({ success: false, code: `INCOMPLETE_CLOUDFLARE_ACCOUNT${suffix}` });
    if (model && !/^@[a-z0-9._/-]+$/i.test(model)) return res.status(400).json({ success: false, code: `INVALID_CLOUDFLARE_AI_MODEL${suffix}` });
  }
  if (!changedFields.length) return res.status(400).json({ success: false, code: 'NO_CLOUDFLARE_RUNTIME_CHANGES' });

  const version = (existing?.version || 0) + 1;
  await ProviderRuntimeConfiguration.findOneAndUpdate(
    { providerCode: 'cloudflare_ai' },
    { $set: { providerCode: 'cloudflare_ai', values, encryptedSecrets, version, updatedBy: req.user._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await ProviderRuntimeAudit.create({
    providerCode: 'cloudflare_ai',
    action: 'update',
    changedFields,
    userId: req.user._id,
    userName: userName(req.user),
  });
  await cloudflareAiService.reloadRuntimeConfiguration(true);
  noStore(res);
  res.json({ success: true, data: { configurationVersion: version } });
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

exports.remove = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body.password !== 'string' || Object.keys(req.body).some((key) => key !== 'password')) {
    return res.status(400).json({ success: false, code: 'REAUTHENTICATION_REQUIRED' });
  }
  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(req.body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }
  const provider = await getProvider(req.params.id);
  if (!provider) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  const configuration = await ProviderConfiguration.findOne({ providerId: provider._id });
  if (!configuration) return res.status(404).json({ success: false, code: 'PROVIDER_CONFIG_NOT_FOUND' });
  const changedFields = [...Object.keys(configuration.values || {}), ...Object.keys(configuration.encryptedSecrets || {})];
  const version = configuration.version + 1;
  await ProviderConfiguration.deleteOne({ _id: configuration._id });
  await audit(provider, req, 'delete', changedFields, version);
  noStore(res);
  res.json({ success: true, data: { providerCode: provider.providerCode, version } });
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
