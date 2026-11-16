const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ProviderDirectoryEntry = require('../models/ProviderDirectoryEntry');

const categories = new Set(['email', 'payment', 'shipping', 'deployment', 'storage']);

const serialize = entry => ({
  id: entry._id.toString(),
  category: entry.category,
  code: entry.code,
  name: entry.name,
  description: entry.description,
  managementUrl: entry.managementUrl,
  isDeleted: entry.isDeleted,
  isConnected: false,
  isOperational: false,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const normalizeProvider = body => {
  const provider = {};
  if (typeof body.category === 'string') provider.category = body.category.trim();
  if (typeof body.code === 'string') provider.code = body.code.trim().toLowerCase();
  if (typeof body.name === 'string') provider.name = body.name.trim();
  if (typeof body.description === 'string') provider.description = body.description.trim();
  if (typeof body.managementUrl === 'string') provider.managementUrl = body.managementUrl.trim();
  return provider;
};

const isValidManagementUrl = value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.hostname.includes('.')
      && !url.hostname.endsWith('.');
  } catch {
    return false;
  }
};

const validateProvider = provider => {
  if (provider.category !== undefined && !categories.has(provider.category)) return false;
  if (provider.code !== undefined && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider.code)) return false;
  if (provider.name !== undefined && (provider.name.length < 2 || provider.name.length > 80)) return false;
  if (provider.description !== undefined && provider.description.length > 500) return false;
  if (provider.managementUrl !== undefined && (provider.managementUrl.length > 500 || !isValidManagementUrl(provider.managementUrl))) return false;
  return true;
};

const listProviders = asyncHandler(async (_req, res) => {
  const entries = await ProviderDirectoryEntry.find().sort({ category: 1, name: 1 }).lean();
  res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache' });
  res.status(200).json({ success: true, data: { providers: entries.map(serialize) } });
});

const createProvider = asyncHandler(async (req, res) => {
  const provider = normalizeProvider(req.body);
  if (!categories.has(provider.category) || !provider.code || !provider.name || !validateProvider(provider)) {
    return res.status(400).json({ success: false, code: 'PROVIDER_ENTRY_INVALID', message: 'Provider entry is invalid.' });
  }

  try {
    const entry = await ProviderDirectoryEntry.create(provider);
    return res.status(201).json({ success: true, data: { provider: serialize(entry) } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, code: 'PROVIDER_ENTRY_EXISTS', message: 'Provider entry already exists.' });
    }
    throw error;
  }
});

const updateProvider = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, code: 'PROVIDER_ENTRY_INVALID', message: 'Provider entry is invalid.' });
  }
  const updates = normalizeProvider(req.body);
  delete updates.category;
  delete updates.code;
  if (!Object.keys(updates).length || !validateProvider(updates)) {
    return res.status(400).json({ success: false, code: 'PROVIDER_ENTRY_INVALID', message: 'Provider entry is invalid.' });
  }

  const entry = await ProviderDirectoryEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_ENTRY_NOT_FOUND', message: 'Provider entry not found.' });
  return res.status(200).json({ success: true, data: { provider: serialize(entry) } });
});

const deleteProvider = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, code: 'PROVIDER_ENTRY_INVALID', message: 'Provider entry is invalid.' });
  }
  const entry = await ProviderDirectoryEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_ENTRY_NOT_FOUND', message: 'Provider entry not found.' });
  return res.status(200).json({ success: true, data: { provider: serialize(entry) } });
});

const restoreProvider = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, code: 'PROVIDER_ENTRY_INVALID', message: 'Provider entry is invalid.' });
  }
  const entry = await ProviderDirectoryEntry.findOneAndUpdate(
    { _id: req.params.id, isDeleted: true },
    { $set: { isDeleted: false } },
    { new: true },
  );
  if (!entry) return res.status(404).json({ success: false, code: 'PROVIDER_ENTRY_NOT_FOUND', message: 'Provider entry not found.' });
  return res.status(200).json({ success: true, data: { provider: serialize(entry) } });
});

module.exports = { listProviders, createProvider, updateProvider, deleteProvider, restoreProvider };
