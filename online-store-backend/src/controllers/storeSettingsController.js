const asyncHandler = require('express-async-handler');
const StoreSettings = require('../models/StoreSettings');
const StoreSettingsAudit = require('../models/StoreSettingsAudit');
const { uploadAsset } = require('../services/r2AssetService');

const DEFAULT_SETTINGS = {
  branding: {
    storeName: '',
    supportEmail: '',
    logoUrl: '',
    darkLogoUrl: '',
    faviconUrl: '',
  },
  maintenance: {
    enabled: false,
    message: '',
    scheduledStart: null,
    scheduledEnd: null,
  },
  version: 1,
  updatedAt: null,
  updatedBy: null,
};

const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

const ensureSettings = async () => {
  try {
    return await StoreSettings.findOneAndUpdate(
      { key: 'storefront' },
      { $setOnInsert: { key: 'storefront' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return StoreSettings.findOne({ key: 'storefront' }).lean();
  }
};

const getSettings = async () => {
  const settings = await StoreSettings.findOne({ key: 'storefront' }).lean();
  return settings || DEFAULT_SETTINGS;
};

const validateUrl = (value, field) => {
  if (typeof value !== 'string' || value.length > 2048) throw new Error(`INVALID_${field.toUpperCase()}`);
  if (!value) return;
  if (value.startsWith('/') && !value.startsWith('//')) return;
  try {
    if (new URL(value).protocol === 'https:') return;
  } catch {}
  throw new Error(`INVALID_${field.toUpperCase()}`);
};

const validateBody = (body) => {
  const allowedSections = ['branding', 'maintenance'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !allowedSections.includes(key))) {
    throw new Error('INVALID_SETTINGS_FIELDS');
  }

  const updates = {};
  const changedFields = [];
  const brandingFields = ['storeName', 'supportEmail', 'logoUrl', 'darkLogoUrl', 'faviconUrl'];
  const maintenanceFields = ['enabled', 'message', 'scheduledStart', 'scheduledEnd'];

  for (const section of allowedSections) {
    if (body[section] === undefined) continue;
    const value = body[section];
    const fields = section === 'branding' ? brandingFields : maintenanceFields;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((field) => !fields.includes(field))) {
      throw new Error('INVALID_SETTINGS_FIELDS');
    }
    for (const [field, fieldValue] of Object.entries(value)) {
      const path = `${section}.${field}`;
      if (section === 'branding') {
        if (typeof fieldValue !== 'string') throw new Error(`INVALID_${field.toUpperCase()}`);
        if (field === 'supportEmail' && fieldValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue)) {
          throw new Error('INVALID_SUPPORT_EMAIL');
        }
        if (['logoUrl', 'darkLogoUrl', 'faviconUrl'].includes(field)) validateUrl(fieldValue, field);
        if (field === 'storeName' && fieldValue.length > 120) throw new Error('INVALID_STORE_NAME');
        updates[path] = fieldValue.trim();
      } else if (field === 'enabled') {
        if (typeof fieldValue !== 'boolean') throw new Error('INVALID_MAINTENANCE_ENABLED');
        updates[path] = fieldValue;
      } else if (field === 'message') {
        if (typeof fieldValue !== 'string' || fieldValue.length > 1000) throw new Error('INVALID_MAINTENANCE_MESSAGE');
        updates[path] = fieldValue.trim();
      } else {
        if (fieldValue === null || fieldValue === '') {
          updates[path] = null;
        } else {
          const date = new Date(fieldValue);
          if (!Number.isFinite(date.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
          updates[path] = date;
        }
      }
      changedFields.push(path);
    }
  }

  const start = updates['maintenance.scheduledStart'];
  const end = updates['maintenance.scheduledEnd'];
  if (start instanceof Date && end instanceof Date && start >= end) {
    throw new Error('INVALID_MAINTENANCE_SCHEDULE');
  }

  return { updates, changedFields };
};

exports.getPublicSettings = asyncHandler(async (_req, res) => {
  noStore(res);
  const settings = await getSettings();
  res.json({
    branding: settings.branding || DEFAULT_SETTINGS.branding,
    maintenance: settings.maintenance || DEFAULT_SETTINGS.maintenance,
  });
});

exports.getAdminSettings = asyncHandler(async (_req, res) => {
  noStore(res);
  res.json({ success: true, data: await getSettings() });
});

exports.updateAdminSettings = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = validateBody(req.body);
  } catch (error) {
    return res.status(400).json({ success: false, code: error.message });
  }
  if (!parsed.changedFields.length) {
    return res.status(400).json({ success: false, code: 'SETTINGS_UPDATE_EMPTY' });
  }

  await ensureSettings();
  const current = await getSettings();
  const effectiveStart = Object.hasOwn(parsed.updates, 'maintenance.scheduledStart')
    ? parsed.updates['maintenance.scheduledStart']
    : current.maintenance?.scheduledStart || null;
  const effectiveEnd = Object.hasOwn(parsed.updates, 'maintenance.scheduledEnd')
    ? parsed.updates['maintenance.scheduledEnd']
    : current.maintenance?.scheduledEnd || null;
  if (effectiveStart && effectiveEnd && new Date(effectiveStart) >= new Date(effectiveEnd)) {
    return res.status(400).json({ success: false, code: 'INVALID_MAINTENANCE_SCHEDULE' });
  }

  const settings = await StoreSettings.findOneAndUpdate(
    { key: 'storefront', version: current.version },
    {
      $set: { ...parsed.updates, updatedBy: req.user._id },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true },
  );

  if (!settings) {
    return res.status(409).json({ success: false, code: 'SETTINGS_VERSION_CONFLICT' });
  }

  await StoreSettingsAudit.create({
    action: 'update',
    changedFields: parsed.changedFields,
    version: settings.version,
    userId: req.user._id,
    userName: req.user.name || req.user.username || req.user.email,
  });

  noStore(res);
  res.json({ success: true, data: settings });
});

exports.uploadBrandAsset = asyncHandler(async (req, res) => {
  const fieldMap = { logo: 'logoUrl', darkLogo: 'darkLogoUrl', favicon: 'faviconUrl' };
  const settingField = fieldMap[req.body.field];
  if (!settingField || !req.file) {
    return res.status(400).json({ success: false, code: 'INVALID_BRANDING_ASSET' });
  }

  await ensureSettings();
  const asset = await uploadAsset(req.file.buffer, {
    role: 'brand',
    stableKey: `${req.user._id}:storefront:${req.body.field}:${req.file.originalname}`,
    sourceName: req.file.originalname,
    mimeType: req.file.mimetype,
    storagePrefix: `incoming/brands/${req.user._id}`,
  });
  const settings = await StoreSettings.findOneAndUpdate(
    { key: 'storefront' },
    {
      $set: { [`branding.${settingField}`]: asset.publicUrl, updatedBy: req.user._id },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true },
  );
  await StoreSettingsAudit.create({
    action: 'logo_upload',
    changedFields: [`branding.${settingField}`],
    version: settings.version,
    userId: req.user._id,
    userName: req.user.name || req.user.username || req.user.email,
  });
  noStore(res);
  res.status(201).json({ success: true, data: settings });
});

exports.resetAdminSettings = asyncHandler(async (req, res) => {
  await ensureSettings();
  const settings = await StoreSettings.findOneAndUpdate(
    { key: 'storefront' },
    {
      $set: {
        'branding.storeName': '',
        'branding.supportEmail': '',
        'branding.logoUrl': '',
        'branding.darkLogoUrl': '',
        'branding.faviconUrl': '',
        'maintenance.enabled': false,
        'maintenance.message': '',
        'maintenance.scheduledStart': null,
        'maintenance.scheduledEnd': null,
        updatedBy: req.user._id,
      },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true },
  );
  await StoreSettingsAudit.create({
    action: 'reset',
    changedFields: ['branding', 'maintenance'],
    version: settings.version,
    userId: req.user._id,
    userName: req.user.name || req.user.username || req.user.email,
  });
  noStore(res);
  res.json({ success: true, data: settings });
});

exports.getAuditLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return res.status(400).json({ success: false, code: 'INVALID_PAGINATION' });
  }
  const [items, total] = await Promise.all([
    StoreSettingsAudit.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('action changedFields version userId userName createdAt')
      .lean(),
    StoreSettingsAudit.countDocuments(),
  ]);
  noStore(res);
  res.json({ success: true, data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});
