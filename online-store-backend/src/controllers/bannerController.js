const asyncHandler = require('express-async-handler');
const { Banner, BANNER_SLOTS, BANNER_SLOT_LABELS } = require('../models/Banner');
const { broadcastBannerCreated, broadcastBannerUpdated, broadcastBannerDeleted, broadcastBannerRestored } = require('../socket/socketHandler');
const { uploadToCloudinary, deleteFromCloudinary, isCloudinaryUrl, extractPublicIdFromUrl } = require('../services/cloudinaryService');

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const parseNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const normalizeSlot = (value) => String(value || '').trim();

const getBannerImageCleanupId = (banner) => {
  if (!banner) return null;
  if (banner.imagePublicId) return banner.imagePublicId;
  if (banner.image && isCloudinaryUrl(banner.image)) {
    return extractPublicIdFromUrl(banner.image);
  }
  return null;
};

const uploadBannerImage = async (file) => {
  const cloudinaryResult = await uploadToCloudinary(file.buffer, 'banners');
  return {
    image: cloudinaryResult.url,
    imagePublicId: cloudinaryResult.publicId,
  };
};

const getBanners = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 10, 100);
  const page = Number(req.query.pageNumber) || 1;
  const slot = normalizeSlot(req.query.slot);
  const activeOnly = req.query.activeOnly !== 'false';

  const query = { isDeleted: false };
  if (slot && BANNER_SLOTS.includes(slot)) {
    query.slot = slot;
  }

  if (activeOnly) {
    const now = new Date();
    query.isActive = true;
    query.startDate = { $lte: now };
    query.endDate = { $gte: now };
  }

  const count = await Banner.countDocuments(query);
  const banners = await Banner.find(query)
    .sort({ sortOrder: 1, updatedAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ banners, page, pages: Math.ceil(count / pageSize), total: count });
});

const getBannerById = asyncHandler(async (req, res) => {
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  res.json(banner);
});

const getDeletedBanners = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 10, 100);
  const page = Number(req.query.pageNumber) || 1;
  const slot = normalizeSlot(req.query.slot);

  const query = { isDeleted: true };
  if (slot && BANNER_SLOTS.includes(slot)) {
    query.slot = slot;
  }

  const count = await Banner.countDocuments(query);
  const banners = await Banner.find(query)
    .sort({ updatedAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ banners, page, pages: Math.ceil(count / pageSize), total: count });
});

const createBanner = asyncHandler(async (req, res) => {
  const {
    title,
    subtitle,
    description,
    ctaText,
    targetUrl,
    slot,
    sortOrder,
    isActive,
    openInNewTab,
    startDate,
    endDate,
  } = req.body;

  const nextTitle = String(title || '').trim();
  const nextSubtitle = String(subtitle || '').trim();
  const nextDescription = String(description || '').trim();
  const nextCtaText = String(ctaText || '').trim();
  const nextTargetUrl = String(targetUrl || '').trim();
  const nextSlot = normalizeSlot(slot);
  const nextSortOrder = parseNumber(sortOrder, 0);
  const nextIsActive = parseBoolean(isActive, true);
  const nextOpenInNewTab = parseBoolean(openInNewTab, false);
  const nextStartDate = parseDate(startDate, new Date());
  const nextEndDate = parseDate(endDate, (() => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear;
  })());

  // Validate slot
  if (!nextSlot || !BANNER_SLOTS.includes(nextSlot)) {
    res.status(400);
    throw new Error('Missing or invalid slot');
  }

  // Validate required fields based on slot type
  // Only hero banners require title and full text content
  const isHeroSlot = nextSlot === 'homepage_hero';
  if (isHeroSlot) {
    if (!nextTitle || !nextSubtitle || !nextDescription || !nextCtaText || !nextTargetUrl) {
      res.status(400);
      throw new Error('Hero banner requires: title, subtitle, description, ctaText, and targetUrl');
    }
  }

  // For non-hero banners, title is optional (carousel mode)
  // But ensure we use empty string instead of empty/null values
  const finalTitle = nextTitle || '';

  if (!req.file) {
    res.status(400);
    throw new Error('Banner image is required');
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error('Start date must be before end date');
  }

  const imageData = await uploadBannerImage(req.file);

  const banner = new Banner({
    title: finalTitle,
    subtitle: nextSubtitle,
    description: nextDescription,
    ctaText: nextCtaText,
    targetUrl: nextTargetUrl,
    image: imageData.image,
    imagePublicId: imageData.imagePublicId,
    slot: nextSlot,
    sortOrder: nextSortOrder,
    isActive: nextIsActive,
    openInNewTab: nextOpenInNewTab,
    startDate: nextStartDate,
    endDate: nextEndDate,
  });

  const createdBanner = await banner.save();
  const io = req.app.get('io');
  broadcastBannerCreated(io, createdBanner);
  res.status(201).json(createdBanner);
});

const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  const nextTitle = req.body.title !== undefined ? String(req.body.title || '').trim() : banner.title;
  const nextSubtitle = req.body.subtitle !== undefined ? String(req.body.subtitle || '').trim() : banner.subtitle;
  const nextDescription = req.body.description !== undefined ? String(req.body.description || '').trim() : banner.description;
  const nextCtaText = req.body.ctaText !== undefined ? String(req.body.ctaText || '').trim() : banner.ctaText;
  const nextTargetUrl = req.body.targetUrl !== undefined ? String(req.body.targetUrl || '').trim() : banner.targetUrl;
  const nextSlot = req.body.slot !== undefined ? normalizeSlot(req.body.slot) : banner.slot;
  const nextSortOrder = req.body.sortOrder !== undefined ? parseNumber(req.body.sortOrder, banner.sortOrder) : banner.sortOrder;
  const nextIsActive = req.body.isActive !== undefined ? parseBoolean(req.body.isActive, banner.isActive) : banner.isActive;
  const nextOpenInNewTab = req.body.openInNewTab !== undefined ? parseBoolean(req.body.openInNewTab, banner.openInNewTab) : banner.openInNewTab;
  const nextStartDate = req.body.startDate !== undefined ? parseDate(req.body.startDate, banner.startDate) : banner.startDate;
  const nextEndDate = req.body.endDate !== undefined ? parseDate(req.body.endDate, banner.endDate) : banner.endDate;

  // Validate slot
  if (!nextSlot || !BANNER_SLOTS.includes(nextSlot)) {
    res.status(400);
    throw new Error('Missing or invalid slot');
  }

  // Validate required fields based on slot type
  // Only hero banners require title and full text content
  const isHeroSlot = nextSlot === 'homepage_hero';
  if (isHeroSlot) {
    if (!nextTitle || !nextSubtitle || !nextDescription || !nextCtaText || !nextTargetUrl) {
      res.status(400);
      throw new Error('Hero banner requires: title, subtitle, description, ctaText, and targetUrl');
    }
  }

  // For non-hero banners, title is optional (carousel mode)
  // But ensure we use empty string instead of empty/null values
  const finalTitle = nextTitle || '';

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error('Start date must be before end date');
  }

  banner.title = finalTitle;
  banner.subtitle = nextSubtitle;
  banner.description = nextDescription;
  banner.ctaText = nextCtaText;
  banner.targetUrl = nextTargetUrl;
  banner.slot = nextSlot;
  banner.sortOrder = nextSortOrder;
  banner.isActive = nextIsActive;
  banner.openInNewTab = nextOpenInNewTab;
  banner.startDate = nextStartDate;
  banner.endDate = nextEndDate;

  if (req.file) {
    const imageData = await uploadBannerImage(req.file);

    const cleanupId = getBannerImageCleanupId(banner);
    if (cleanupId) {
      await deleteFromCloudinary(cleanupId);
    }

    banner.image = imageData.image;
    banner.imagePublicId = imageData.imagePublicId;
  }

  const updatedBanner = await banner.save();
  const io = req.app.get('io');
  broadcastBannerUpdated(io, updatedBanner);
  res.json(updatedBanner);
});

const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  banner.isDeleted = true;
  await banner.save();

  const io = req.app.get('io');
  broadcastBannerDeleted(io, banner._id.toString());
  res.json({ message: 'Banner removed' });
});

const restoreBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: true });

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  banner.isDeleted = false;
  await banner.save();

  const io = req.app.get('io');
  broadcastBannerRestored(io, banner);
  res.json(banner);
});

const hardDeleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  const cleanupId = getBannerImageCleanupId(banner);
  if (cleanupId) {
    await deleteFromCloudinary(cleanupId);
  }

  await Banner.findByIdAndDelete(req.params.id);
  res.json({ message: 'Banner permanently deleted' });
});

const getBannerSlots = asyncHandler(async (req, res) => {
  res.json({
    slots: BANNER_SLOTS.map((slot) => ({
      value: slot,
      label: BANNER_SLOT_LABELS[slot] || slot.replace(/_/g, ' '),
    })),
  });
});

module.exports = {
  getBanners,
  getBannerById,
  getDeletedBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  restoreBanner,
  hardDeleteBanner,
  getBannerSlots,
};
