const asyncHandler = require('express-async-handler');
const { Banner, BANNER_SLOTS, SUPPORTED_LANGUAGES } = require('../models/Banner');
const { BannerTranslation } = require('../models/BannerTranslation');
const { broadcastBannerCreated, broadcastBannerUpdated, broadcastBannerDeleted, broadcastBannerRestored } = require('../socket/socketHandler');
const { uploadToCloudinary, deleteFromCloudinary, isCloudinaryUrl, extractPublicIdFromUrl } = require('../services/cloudinaryService');
const { overlayTranslationBatch, overlayTranslation } = require('../services/translationHelper');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, isSupportedLanguage, getActiveLangCodes } = require('../config/languageInventory');
const cloudflareAiService = require('../services/cloudflareAiService');

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

// Get language from request with dynamic default (not hardcoded 'vi')
const getBannerLanguage = (req) => {
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  return isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
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

const saveBannerTranslations = async (bannerId, multiLangData) => {
  const translations = {
    title: multiLangData.title || {},
    subtitle: multiLangData.subtitle || {},
    description: multiLangData.description || {},
    ctaText: multiLangData.ctaText || {},
  };

  for (const lang of SUPPORTED_LANGUAGES) {
    const hasContent = Object.values(translations).some(field => field[lang]?.trim());
    if (!hasContent) continue;

    const existingTranslation = await BannerTranslation.findOne({ bannerId, language: lang });

    if (existingTranslation) {
      existingTranslation.title = translations.title[lang] || '';
      existingTranslation.subtitle = translations.subtitle[lang] || '';
      existingTranslation.description = translations.description[lang] || '';
      existingTranslation.ctaText = translations.ctaText[lang] || '';
      await existingTranslation.save();
    } else {
      const newTranslation = new BannerTranslation({
        bannerId,
        language: lang,
        title: translations.title[lang] || '',
        subtitle: translations.subtitle[lang] || '',
        description: translations.description[lang] || '',
        ctaText: translations.ctaText[lang] || '',
      });
      await newTranslation.save();
    }
  }
};

const getBanners = asyncHandler(async (req, res) => {
  const { getDefaultLanguage } = require('../config/languageInventory');
  const lang = (req.query.lang || getDefaultLanguage().code).toLowerCase();
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

  // Rule #2 (Dynamic Data): Overlay banner content translations based on lang parameter
  // Frontend MUST pass ?lang=en/vi and add locale to dependency array for re-fetching
  const translatedBanners = await overlayTranslationBatch(banners, 'banner', lang);

  res.json({ banners: translatedBanners, page, pages: Math.ceil(count / pageSize), total: count });
});

const getBannerById = asyncHandler(async (req, res) => {
  const { getDefaultLanguage } = require('../config/languageInventory');
  const lang = (req.query.lang || getDefaultLanguage().code).toLowerCase();
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  const translatedBanner = await overlayTranslation(banner, 'banner', lang);
  res.json(translatedBanner);
});

const getDeletedBanners = asyncHandler(async (req, res) => {
  const { getDefaultLanguage } = require('../config/languageInventory');
  const lang = (req.query.lang || getDefaultLanguage().code).toLowerCase();
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

  // Overlay translations based on lang parameter
  const translatedBanners = await overlayTranslationBatch(banners, 'banner', lang);

  res.json({ banners: translatedBanners, page, pages: Math.ceil(count / pageSize), total: count });
});

const parseMultiLanguageField = (field) => {
  const defaultLang = getDefaultLanguage().code.toUpperCase();
  const langCodes = SUPPORTED_LANGUAGES.map(l => l.toUpperCase());

  const defaultField = {};
  langCodes.forEach(code => {
    defaultField[code] = '';
  });

  if (!field) return defaultField;

  if (typeof field === 'string') {
    return { ...defaultField, [defaultLang]: String(field).trim() };
  }

  if (typeof field === 'object') {
    const result = {};
    langCodes.forEach(code => {
      const lowerCode = code.toLowerCase();
      result[code] = String(field[lowerCode] || field[code] || '').trim();
    });
    return result;
  }

  return defaultField;
};

const autoTranslateMissingLanguages = async (bannerId, bannerData) => {
  const supportedLanguages = SUPPORTED_LANGUAGES;
  const existingTranslations = await BannerTranslation.find({ bannerId }).lean();
  const existingLangs = new Set(existingTranslations.map(t => t.language.toUpperCase()));
  const langsToTranslate = supportedLanguages.filter(lang => !existingLangs.has(lang));

  if (langsToTranslate.length === 0) return;

  // Determine source language: use first available language from bannerData
  let sourceLang = null;
  let sourceTexts = {};

  for (const lang of SUPPORTED_LANGUAGES) {
    if (bannerData.title && bannerData.title[lang]) {
      sourceLang = lang;
      sourceTexts = {
        title: bannerData.title[lang],
        subtitle: bannerData.subtitle?.[lang] || '',
        description: bannerData.description?.[lang] || '',
        ctaText: bannerData.ctaText?.[lang] || '',
      };
      break;
    }
  }

  if (!sourceLang || !sourceTexts.title) return;

  for (const targetLang of langsToTranslate) {
    try {
      const translation = {};

      if (sourceTexts.title) {
        translation.title = await cloudflareAiService.translate(sourceTexts.title, sourceLang.toLowerCase(), targetLang.toLowerCase());
      }

      if (sourceTexts.subtitle) {
        translation.subtitle = await cloudflareAiService.translate(sourceTexts.subtitle, sourceLang.toLowerCase(), targetLang.toLowerCase());
      }

      if (sourceTexts.description) {
        translation.description = await cloudflareAiService.translate(sourceTexts.description, sourceLang.toLowerCase(), targetLang.toLowerCase());
      }

      if (sourceTexts.ctaText) {
        translation.ctaText = await cloudflareAiService.translate(sourceTexts.ctaText, sourceLang.toLowerCase(), targetLang.toLowerCase());
      }

      await BannerTranslation.create({
        bannerId,
        language: targetLang,
        title: translation.title || '',
        subtitle: translation.subtitle || '',
        description: translation.description || '',
        ctaText: translation.ctaText || '',
      });
    } catch (error) {
      console.error(`Failed to auto-translate banner ${bannerId} from ${sourceLang} to ${targetLang}:`, error.message);
    }
  }
};

const createBanner = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
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

  // Support both string (legacy) and { vi, en } format (Rule #2: Dynamic Data with locale)
  const nextTitle = parseMultiLanguageField(title);
  const nextSubtitle = parseMultiLanguageField(subtitle);
  const nextDescription = parseMultiLanguageField(description);
  const nextCtaText = parseMultiLanguageField(ctaText);
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
    throw new Error(getMessage(lang, 'admin-controllers-messages.missing_invalid_slot'));
  }

  // Validate required fields based on slot type (check VI version)
  const isHeroSlot = nextSlot === 'homepage_hero';
  if (isHeroSlot) {
    if (!nextTitle.VI || !nextSubtitle.VI || !nextDescription.VI || !nextCtaText.VI || !nextTargetUrl) {
      res.status(400);
      throw new Error(getMessage(lang, 'admin-controllers-messages.hero_banner_requires_fields'));
    }
  }

  if (!req.file) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_image_required'));
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.start_date_before_end_date'));
  }

  const imageData = await uploadBannerImage(req.file);

  const banner = new Banner({
    title: nextTitle,
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

  await saveBannerTranslations(createdBanner._id, {
    title: nextTitle,
    subtitle: nextSubtitle,
    description: nextDescription,
    ctaText: nextCtaText,
  });

  const io = req.app.get('io');
  broadcastBannerCreated(io, createdBanner);

  // Auto-translate missing languages in background (non-blocking)
  setImmediate(() => {
    autoTranslateMissingLanguages(createdBanner._id, {
      title: nextTitle,
      subtitle: nextSubtitle,
      description: nextDescription,
      ctaText: nextCtaText,
    }).catch(error => {
      console.error(`Background auto-translation failed for banner ${createdBanner._id}:`, error);
    });
  });

  res.status(201).json(createdBanner);
});

const updateBanner = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  // Support both string (legacy) and { vi, en } format (Rule #2: Dynamic Data with locale)
  const nextTitle = req.body.title !== undefined ? parseMultiLanguageField(req.body.title) : banner.title;
  const nextSubtitle = req.body.subtitle !== undefined ? parseMultiLanguageField(req.body.subtitle) : banner.subtitle;
  const nextDescription = req.body.description !== undefined ? parseMultiLanguageField(req.body.description) : banner.description;
  const nextCtaText = req.body.ctaText !== undefined ? parseMultiLanguageField(req.body.ctaText) : banner.ctaText;
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
    throw new Error(getMessage(lang, 'admin-controllers-messages.missing_invalid_slot'));
  }

  // Validate required fields based on slot type - check all required languages
  const isHeroSlot = nextSlot === 'homepage_hero';
  if (isHeroSlot) {
    const { getActiveLangCodes } = require('../config/languageInventory');
    const requiredLangs = getActiveLangCodes();

    for (const langCode of requiredLangs) {
      const titleKey = `title${langCode.toUpperCase()}`;
      const subtitleKey = `subtitle${langCode.toUpperCase()}`;
      const descriptionKey = `description${langCode.toUpperCase()}`;
      const ctaTextKey = `ctaText${langCode.toUpperCase()}`;

      if (!nextTitle[titleKey] || !nextSubtitle[subtitleKey] || !nextDescription[descriptionKey] || !nextCtaText[ctaTextKey]) {
        res.status(400);
        throw new Error(getMessage(lang, 'admin-controllers-messages.hero_banner_requires_fields') + ` (${langCode})`);
      }
    }

    if (!nextTargetUrl) {
      res.status(400);
      throw new Error(getMessage(lang, 'admin-controllers-messages.hero_banner_requires_fields'));
    }
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.start_date_before_end_date'));
  }

  banner.title = nextTitle;
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

  await saveBannerTranslations(updatedBanner._id, {
    title: nextTitle,
    subtitle: nextSubtitle,
    description: nextDescription,
    ctaText: nextCtaText,
  });

  const io = req.app.get('io');
  broadcastBannerUpdated(io, updatedBanner);

  // Auto-translate missing languages in background (non-blocking)
  setImmediate(() => {
    autoTranslateMissingLanguages(updatedBanner._id, {
      title: nextTitle,
      subtitle: nextSubtitle,
      description: nextDescription,
      ctaText: nextCtaText,
    }).catch(error => {
      console.error(`Background auto-translation failed for banner ${updatedBanner._id}:`, error);
    });
  });

  res.json(updatedBanner);
});

const deleteBanner = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: false });

  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'seeder-messages.banner_not_found'));
  }

  banner.isDeleted = true;
  await banner.save();

  const io = req.app.get('io');
  broadcastBannerDeleted(io, banner._id.toString());
  res.json({ success: true, message: getMessage(lang, 'admin-controllers-messages.banner_removed') });
});

const restoreBanner = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const banner = await Banner.findOne({ _id: req.params.id, isDeleted: true });

  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'seeder-messages.banner_not_found'));
  }

  banner.isDeleted = false;
  await banner.save();

  const io = req.app.get('io');
  broadcastBannerRestored(io, banner);
  res.json(banner);
});

const hardDeleteBanner = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const banner = await Banner.findById(req.params.id);

  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'seeder-messages.banner_not_found'));
  }

  const cleanupId = getBannerImageCleanupId(banner);
  if (cleanupId) {
    await deleteFromCloudinary(cleanupId);
  }

  await Banner.findByIdAndDelete(req.params.id);
  await BannerTranslation.deleteMany({ bannerId: req.params.id });
  res.json({ message: 'Banner permanently deleted' });
});

const getBannerSlots = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const StaticTranslation = require('../models/StaticTranslation');

  // Rule #1 i18n: Load slot labels từ StaticTranslation cache
  let translations = {};
  let fallbackTranslations = {};
  try {
    // Load target language translations (use lowercase to match seeded data)
    const staticTrans = await StaticTranslation.findOne({
      code: lang,
      namespace: 'banner',
      isDeleted: false,
    }).lean();

    if (staticTrans?.translations) {
      translations = staticTrans.translations;
    }

    // Load fallback (DEFAULT_LANGUAGE) translations if target language is missing or incomplete
    const defaultLang = getDefaultLanguage().code;
    if (lang !== defaultLang) {
      const fallbackTrans = await StaticTranslation.findOne({
        code: defaultLang,
        namespace: 'banner',
        isDeleted: false,
      }).lean();

      if (fallbackTrans?.translations) {
        fallbackTranslations = fallbackTrans.translations;
      }
    }
  } catch (error) {
    console.warn('Failed to load banner slot labels from StaticTranslation:', error.message);
  }

  res.json({
    slots: BANNER_SLOTS.map((slot) => {
      // Try: StaticTranslation (target lang) → StaticTranslation (VI fallback) → snake_case to spaces
      const label = translations[`slot_${slot}`] || fallbackTranslations[`slot_${slot}`] || slot.replace(/_/g, ' ');
      return { value: slot, label };
    }),
  });
});

const getBannerTranslations = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const { id } = req.params;

  const banner = await Banner.findById(id);
  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  const translations = await BannerTranslation.find({ bannerId: id }).lean();
  res.json({
    success: true,
    data: translations,
  });
});

const createBannerTranslation = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const { id } = req.params;
  const { language, title, subtitle, description, ctaText } = req.body;

  if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.invalid_language'));
  }

  // Only title is required; others are optional
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.title_required') || 'Title is required');
  }

  const banner = await Banner.findById(id);
  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  const existing = await BannerTranslation.findOne({ bannerId: id, language });
  if (existing) {
    res.status(409);
    throw new Error('Translation already exists for this language');
  }

  const translation = new BannerTranslation({
    bannerId: id,
    language,
    title,
    subtitle,
    description,
    ctaText,
  });

  await translation.save();
  res.status(201).json({
    success: true,
    data: translation,
  });
});

const updateBannerTranslation = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const { id, translationId } = req.params;
  const { language, title, subtitle, description, ctaText } = req.body;

  // Only title is required; others are optional
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.title_required') || 'Title is required');
  }

  const banner = await Banner.findById(id);
  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  const translation = await BannerTranslation.findOne({ _id: translationId, bannerId: id });
  if (!translation) {
    res.status(404);
    throw new Error('Translation not found');
  }

  translation.title = title;
  translation.subtitle = subtitle;
  translation.description = description;
  translation.ctaText = ctaText;

  await translation.save();
  res.json({
    success: true,
    data: translation,
  });
});

const deleteBannerTranslation = asyncHandler(async (req, res) => {
  const lang = getBannerLanguage(req);
  const { id, translationId } = req.params;

  const banner = await Banner.findById(id);
  if (!banner) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.banner_not_found'));
  }

  const translation = await BannerTranslation.findOne({ _id: translationId, bannerId: id });
  if (!translation) {
    res.status(404);
    throw new Error('Translation not found');
  }

  await BannerTranslation.findByIdAndDelete(translationId);
  res.json({
    success: true,
    message: 'Translation deleted',
  });
});

const autoTranslateBanner = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage().code;
  const { id } = req.params;
  const { targetLanguages = [], field = 'all' } = req.body;

  const banner = await Banner.findById(id);
  if (!banner) {
    const requestedLang = req.query.lang || defaultLang;
    const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
    return res.status(404).json({
      success: false,
      message: getMessage(lang, 'common.notFound'),
    });
  }

  const getSourceField = (field) => {
    if (typeof field === 'object' && field !== null) {
      for (const lang of SUPPORTED_LANGUAGES) {
        if (field[lang]?.trim()) return field[lang];
      }
      return '';
    }
    return String(field || '');
  };

  const sourceText = {
    title: getSourceField(banner.title),
    subtitle: getSourceField(banner.subtitle),
    description: getSourceField(banner.description),
    ctaText: getSourceField(banner.ctaText),
  };

  const allActiveLangs = getActiveLangCodes();
  const langsToTranslate = targetLanguages.length > 0
    ? targetLanguages
    : allActiveLangs.filter(l => l !== defaultLang);

  const results = {};
  const errors = [];

  for (const lang of langsToTranslate) {
    if (lang === defaultLang) continue;

    try {
      results[lang] = {};

      if (field === 'all' || field === 'title') {
        if (sourceText.title) {
          results[lang].title = await cloudflareAiService.translate(sourceText.title, defaultLang, lang);
        }
      }

      if (field === 'all' || field === 'subtitle') {
        if (sourceText.subtitle) {
          results[lang].subtitle = await cloudflareAiService.translate(sourceText.subtitle, defaultLang, lang);
        }
      }

      if (field === 'all' || field === 'description') {
        if (sourceText.description) {
          results[lang].description = await cloudflareAiService.translate(sourceText.description, defaultLang, lang);
        }
      }

      if (field === 'all' || field === 'ctaText') {
        if (sourceText.ctaText) {
          results[lang].ctaText = await cloudflareAiService.translate(sourceText.ctaText, defaultLang, lang);
        }
      }

      const existingTranslation = await BannerTranslation.findOne({
        bannerId: id,
        language: lang,
      });

      if (existingTranslation) {
        existingTranslation.title = results[lang].title || existingTranslation.title;
        existingTranslation.subtitle = results[lang].subtitle || existingTranslation.subtitle;
        existingTranslation.description = results[lang].description || existingTranslation.description;
        existingTranslation.ctaText = results[lang].ctaText || existingTranslation.ctaText;
        existingTranslation.updatedAt = new Date();
        await existingTranslation.save();
      } else {
        await BannerTranslation.create({
          bannerId: id,
          language: lang,
          title: results[lang].title || '',
          subtitle: results[lang].subtitle || '',
          description: results[lang].description || '',
          ctaText: results[lang].ctaText || '',
        });
      }
    } catch (error) {
      errors.push({
        language: lang,
        error: error.message,
      });
    }
  }

  res.json({
    success: errors.length === 0,
    message: errors.length === 0 ? 'Auto-translation completed' : 'Auto-translation completed with errors',
    data: {
      translatedLanguages: Object.keys(results).filter(lang => Object.keys(results[lang]).length > 0),
      results,
      errors: errors.length > 0 ? errors : undefined,
    },
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
  getBannerTranslations,
  createBannerTranslation,
  updateBannerTranslation,
  deleteBannerTranslation,
  autoTranslateBanner,
};
