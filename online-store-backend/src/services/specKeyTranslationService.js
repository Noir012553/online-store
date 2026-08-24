const mongoose = require('mongoose');
const SpecKeyTranslationCache = require('../models/SpecKeyTranslationCache');
const cloudflareAiService = require('./cloudflareAiService');
const { getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
const { normalizeSpecFieldName, sanitizeUnknownSpecKey } = require('../utils/specNormalizer');
const specKeyTranslations = require('../data/specKeyTranslations.json');

const memoryCache = new Map();
const pendingTranslations = new Map();
const attemptedTranslations = new Map();
const RETRY_WINDOW_MS = 60 * 60 * 1000;
const MAX_LABEL_LENGTH = 80;

const getCacheKey = (canonicalKey, targetLang) => `${canonicalKey}:${targetLang}`;

const humanizeSpecKey = (canonicalKey) => String(canonicalKey || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, (character) => character.toUpperCase());

const getCanonicalSpecKey = (rawKey) => {
  const key = String(rawKey || '').trim();
  if (!key) return '';

  const normalizedKey = normalizeSpecFieldName(key);
  if (normalizedKey) return normalizedKey;

  return sanitizeUnknownSpecKey(key);
};

const getStaticLabel = (canonicalKey, targetLang) => {
  const labels = specKeyTranslations[canonicalKey];
  if (!labels) return humanizeSpecKey(canonicalKey);
  return labels[targetLang] || labels.vi || labels.en || humanizeSpecKey(canonicalKey);
};

const isValidTranslatedLabel = (label) => (
  typeof label === 'string'
  && label.trim().length > 0
  && label.trim().length <= MAX_LABEL_LENGTH
  && !/[<>]/.test(label)
);

const warmDynamicTranslation = (canonicalKey, targetLang, fallbackLabel) => {
  const defaultLang = getDefaultLanguage().code;
  if (
    !canonicalKey
    || targetLang === defaultLang
    || !isSupportedLanguage(targetLang)
    || process.env.ENABLE_DYNAMIC_SPEC_KEY_TRANSLATION === 'false'
  ) {
    return;
  }

  const cacheKey = getCacheKey(canonicalKey, targetLang);
  const lastAttempt = attemptedTranslations.get(cacheKey) || 0;
  if (pendingTranslations.has(cacheKey) || Date.now() - lastAttempt < RETRY_WINDOW_MS) return;

  attemptedTranslations.set(cacheKey, Date.now());
  const sourceLabel = getStaticLabel(canonicalKey, defaultLang) || canonicalKey;
  const promise = cloudflareAiService
    .translate(sourceLabel, defaultLang, targetLang)
    .then(async (translatedLabel) => {
      if (!isValidTranslatedLabel(translatedLabel)) return;

      const label = translatedLabel.trim();
      memoryCache.set(cacheKey, label);
      await SpecKeyTranslationCache.findOneAndUpdate(
        { canonicalKey, targetLang },
        {
          canonicalKey,
          targetLang,
          normalizedKey: canonicalKey,
          translatedLabel: label,
          status: 'success',
          qualityStatus: 'approved',
          source: 'dynamic',
          provider: 'cloudflare',
          lastTranslatedAt: new Date(),
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).lean();
    })
    .catch(() => fallbackLabel)
    .finally(() => {
      pendingTranslations.delete(cacheKey);
    });

  pendingTranslations.set(cacheKey, promise);
};

const getSpecKeyLabels = async (specs, targetLang) => {
  const entries = specs instanceof Map
    ? [...specs.entries()]
    : specs && typeof specs === 'object'
      ? Object.entries(specs)
      : [];
  const canonicalKeys = [...new Set(entries.map(([key]) => getCanonicalSpecKey(key)).filter(Boolean))];

  if (canonicalKeys.length === 0) return {};

  const defaultLang = getDefaultLanguage().code;
  if (targetLang === defaultLang || mongoose.connection.readyState !== 1) {
    return Object.fromEntries(canonicalKeys.map((canonicalKey) => {
      const cacheKey = getCacheKey(canonicalKey, targetLang);
      return [canonicalKey, memoryCache.get(cacheKey) || getStaticLabel(canonicalKey, targetLang)];
    }));
  }

  let cachedRows = [];
  try {
    cachedRows = await SpecKeyTranslationCache.find({
      canonicalKey: { $in: canonicalKeys },
      targetLang,
      status: 'success',
    }).lean();
  } catch (error) {
    console.error('[SpecKeyTranslationService] Cache read failed:', error.message);
  }
  const databaseCache = new Map(cachedRows.map((row) => [row.canonicalKey, row.translatedLabel]));
  const labels = {};

  canonicalKeys.forEach((canonicalKey) => {
    const cacheKey = getCacheKey(canonicalKey, targetLang);
    const fallbackLabel = getStaticLabel(canonicalKey, targetLang);
    const label = memoryCache.get(cacheKey) || databaseCache.get(canonicalKey) || fallbackLabel;
    labels[canonicalKey] = label;
    if (!databaseCache.has(canonicalKey) && !memoryCache.has(cacheKey)) {
      warmDynamicTranslation(canonicalKey, targetLang, fallbackLabel);
    }
  });

  return labels;
};

module.exports = {
  getCanonicalSpecKey,
  getSpecKeyLabels,
  humanizeSpecKey,
};
