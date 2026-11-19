const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderCatalogAudit = require('../models/ProviderCatalogAudit');

const PROVIDERS = {
  smtp: { category: 'email', name: 'SMTP', adapter: 'available', note: 'Backend có luồng gửi SMTP; hồ sơ này không thay đổi cấu hình SMTP runtime.' },
  sendgrid: { category: 'email', name: 'SendGrid', adapter: 'not-verified', note: 'Chưa xác minh adapter gửi độc lập; chưa thể kích hoạt từ catalog.' },
  cod: { category: 'payment', name: 'Thanh toán khi nhận hàng (COD)', adapter: 'payment-method', note: 'Phương thức thanh toán hiện có; catalog không bật/tắt checkout.' },
  vnpay: { category: 'payment', name: 'VNPay', adapter: 'available', note: 'Adapter sandbox/runtime hiện có; catalog không cấu hình credentials hoặc endpoint.' },
  paypal: { category: 'payment', name: 'PayPal', adapter: 'not-implemented', note: 'Chưa có adapter thanh toán và xác minh webhook.' },
  momo: { category: 'payment', name: 'MoMo', adapter: 'not-implemented', note: 'Chưa có adapter thanh toán và xác minh callback/IPN.' },
  vercel: { category: 'deploy', name: 'Vercel', adapter: 'not-implemented', note: 'Chưa có adapter deploy; cấu hình được lưu riêng và không tự triển khai.' },
  render: { category: 'deploy', name: 'Render', adapter: 'not-implemented', note: 'Chưa có adapter deploy; cấu hình được lưu riêng và không tự triển khai.' },
  ghn: { category: 'shipping', name: 'GHN', adapter: 'available', note: 'Adapter vận chuyển hiện có; catalog không thay đổi credentials vận hành.' },
  cloudflare_tunnel: { category: 'deploy', name: 'Cloudflare Tunnel', adapter: 'launcher-only', note: 'Chỉ có launcher; chưa có adapter deploy/quản lý tuyến từ Settings.' },
  cloudflare_r2: { category: 'storage', name: 'Cloudflare R2', adapter: 'available', note: 'Tích hợp asset storage hiện có; catalog không thay đổi bucket hoặc credentials.' },
  cloudflare_ai: { category: 'ai', name: 'Cloudflare AI', adapter: 'available', note: 'Tích hợp AI hiện có; catalog không thay đổi account/token/model runtime.' },
};

const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
const supportedProviders = () => Object.entries(PROVIDERS).map(([code, provider]) => ({ code, ...provider }));
const decorate = (entry) => ({
  ...entry,
  capability: PROVIDERS[entry.providerCode]?.adapter || 'not-implemented',
  capabilityNote: PROVIDERS[entry.providerCode]?.note || 'Chưa có adapter được xác nhận.',
});
const userName = (user) => user.name || user.username || user.email || '';

const parsePagination = (query) => {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { page, pageSize };
};

const parsePayload = (body, creating) => {
  const allowed = creating
    ? ['category', 'providerCode', 'name', 'description', 'notes']
    : ['name', 'description', 'notes'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((field) => !allowed.includes(field))) {
    return { error: 'INVALID_PROVIDER_FIELDS' };
  }
  if (creating && (typeof body.providerCode !== 'string' || !PROVIDERS[body.providerCode])) {
    return { error: 'UNSUPPORTED_PROVIDER' };
  }
  if (creating && body.category !== PROVIDERS[body.providerCode].category) {
    return { error: 'PROVIDER_CATEGORY_MISMATCH' };
  }
  if (creating && (typeof body.name !== 'string' || body.name.trim().length < 2)) {
    return { error: 'INVALID_PROVIDER_NAME' };
  }
  const data = {};
  const changedFields = [];
  for (const field of ['name', 'description', 'notes']) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    const maxLength = field === 'name' ? 100 : field === 'description' ? 500 : 1000;
    if (typeof value !== 'string' || value.length > maxLength || (field === 'name' && value.trim().length < 2)) {
      return { error: `INVALID_PROVIDER_${field.toUpperCase()}` };
    }
    if (field !== 'name' && /\b(api[\s_-]*key|access[\s_-]*key|secret|token|password|credential|authorization|bearer)\b/i.test(value)) {
      return { error: 'PROVIDER_CREDENTIALS_NOT_ALLOWED' };
    }
    data[field] = value.trim();
    changedFields.push(field);
  }
  if (creating) {
    data.category = body.category;
    data.providerCode = body.providerCode;
    changedFields.unshift('category', 'providerCode');
  } else if (!changedFields.length) {
    return { error: 'PROVIDER_UPDATE_EMPTY' };
  }
  return { data, changedFields };
};

exports.getRegistry = asyncHandler(async (_req, res) => {
  noStore(res);
  res.json({ success: true, data: supportedProviders() });
});

exports.list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ success: false, code: 'INVALID_PAGINATION' });
  const status = req.query.status || 'active';
  if (!['active', 'deleted', 'all'].includes(status)) return res.status(400).json({ success: false, code: 'INVALID_STATUS_FILTER' });
  const filter = {};
  if (status !== 'all') filter.isDeleted = status === 'deleted';
  if (typeof req.query.category === 'string' && req.query.category) {
    if (!['email', 'payment', 'shipping', 'deploy', 'storage', 'ai'].includes(req.query.category)) {
      return res.status(400).json({ success: false, code: 'INVALID_CATEGORY_FILTER' });
    }
    filter.category = req.query.category;
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const search = req.query.search.trim().slice(0, 100);
    filter.$or = [
      { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { providerCode: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
  }
  const [items, total] = await Promise.all([
    ProviderCatalogEntry.find(filter)
      .sort({ category: 1, updatedAt: -1, _id: -1 })
      .skip((pagination.page - 1) * pagination.pageSize)
      .limit(pagination.pageSize)
      .lean(),
    ProviderCatalogEntry.countDocuments(filter),
  ]);
  noStore(res);
  res.json({ success: true, data: items.map(decorate), pagination: { ...pagination, total, totalPages: Math.ceil(total / pagination.pageSize) } });
});

exports.getById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_ID' });
  const entry = await ProviderCatalogEntry.findById(req.params.id).lean();
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  noStore(res);
  res.json({ success: true, data: decorate(entry), registry: supportedProviders() });
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = parsePayload(req.body, true);
  if (parsed.error) return res.status(400).json({ success: false, code: parsed.error });
  const entry = await ProviderCatalogEntry.create({
    ...parsed.data,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await ProviderCatalogAudit.create({
    providerId: entry._id,
    providerCode: entry.providerCode,
    action: 'create',
    changedFields: parsed.changedFields,
    version: entry.version,
    userId: req.user._id,
    userName: userName(req.user),
  });
  noStore(res);
  res.status(201).json({ success: true, data: decorate(entry.toObject()) });
});

exports.update = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_ID' });
  const parsed = parsePayload(req.body, false);
  if (parsed.error) return res.status(400).json({ success: false, code: parsed.error });
  const entry = await ProviderCatalogEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { ...parsed.data, updatedBy: req.user._id }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  await ProviderCatalogAudit.create({
    providerId: entry._id,
    providerCode: entry.providerCode,
    action: 'update',
    changedFields: parsed.changedFields,
    version: entry.version,
    userId: req.user._id,
    userName: userName(req.user),
  });
  noStore(res);
  res.json({ success: true, data: decorate(entry.toObject()) });
});

exports.softDelete = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_ID' });
  const entry = await ProviderCatalogEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id, updatedBy: req.user._id }, $inc: { version: 1 } },
    { new: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  await ProviderCatalogAudit.create({
    providerId: entry._id,
    providerCode: entry.providerCode,
    action: 'delete',
    changedFields: ['isDeleted'],
    version: entry.version,
    userId: req.user._id,
    userName: userName(req.user),
  });
  noStore(res);
  res.json({ success: true, data: decorate(entry.toObject()) });
});

exports.restore = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_ID' });
  const entry = await ProviderCatalogEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: true },
    { $set: { isDeleted: false, deletedAt: null, deletedBy: null, updatedBy: req.user._id }, $inc: { version: 1 } },
    { new: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_NOT_FOUND' });
  await ProviderCatalogAudit.create({
    providerId: entry._id,
    providerCode: entry.providerCode,
    action: 'restore',
    changedFields: ['isDeleted'],
    version: entry.version,
    userId: req.user._id,
    userName: userName(req.user),
  });
  noStore(res);
  res.json({ success: true, data: decorate(entry.toObject()) });
});

exports.getAudit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, code: 'INVALID_PROVIDER_ID' });
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ success: false, code: 'INVALID_PAGINATION' });
  const filter = { providerId: req.params.id };
  const [items, total] = await Promise.all([
    ProviderCatalogAudit.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((pagination.page - 1) * pagination.pageSize)
      .limit(pagination.pageSize)
      .select('action providerCode changedFields version userId userName createdAt')
      .lean(),
    ProviderCatalogAudit.countDocuments(filter),
  ]);
  noStore(res);
  res.json({ success: true, data: items, pagination: { ...pagination, total, totalPages: Math.ceil(total / pagination.pageSize) } });
});
