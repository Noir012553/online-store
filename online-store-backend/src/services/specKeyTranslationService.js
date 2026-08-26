const SpecKeyRegistry = require('../models/SpecKeyRegistry');
const SpecKeyTranslationCache = require('../models/SpecKeyTranslationCache');

const cloudflareAiService = require('./cloudflareAiService');
const { getActiveLangCodes, getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
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
    || process.env.ENABLE_DYNAMIC_SPEC_KEY_TRANSLATION !== 'true'
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

const getSpecEntries = (specs) => {
  if (Array.isArray(specs)) {
    return specs.flatMap((item) => getSpecEntries(item?.specs || item));
  }
  if (specs instanceof Map) return [...specs.entries()];
  if (specs && typeof specs === 'object') return Object.entries(specs);
  return [];
};

const registerUnknownSpecKeys = async (specs) => {
  const unknownEntries = new Map();
  getSpecEntries(specs).forEach(([rawKey]) => {
    const sourceKey = String(rawKey || '').trim().slice(0, MAX_LABEL_LENGTH);
    const canonicalKey = getCanonicalSpecKey(sourceKey);
    if (!sourceKey || !canonicalKey || specKeyTranslations[canonicalKey]) return;

    const sourceKeys = unknownEntries.get(canonicalKey) || new Set();
    sourceKeys.add(sourceKey);
    unknownEntries.set(canonicalKey, sourceKeys);
  });

  if (unknownEntries.size === 0 || SpecKeyRegistry.db.readyState !== 1) return [];

  const now = new Date();
  const registeredKeys = [...unknownEntries.keys()];
  try {
    await Promise.all(registeredKeys.map(async (canonicalKey) => {
      await SpecKeyRegistry.updateOne(
        { canonicalKey },
        {
          $set: { lastSeenAt: now },
          $setOnInsert: {
            canonicalKey,
            status: 'pending',
            firstSeenAt: now,
          },
          $addToSet: { sourceKeys: { $each: [...unknownEntries.get(canonicalKey)] } },
        },
        { upsert: true }
      );

      const fallbackLabel = humanizeSpecKey(canonicalKey);
      getActiveLangCodes()
        .filter((targetLang) => targetLang !== getDefaultLanguage().code)
        .forEach((targetLang) => warmDynamicTranslation(canonicalKey, targetLang, fallbackLabel));
    }));
  } catch (error) {
    console.error('[SpecKeyTranslationService] Registry write failed:', error.message);
    return [];
  }

  return registeredKeys;
};

const waitForPendingTranslations = async () => {
  while (pendingTranslations.size > 0) {
    await Promise.allSettled([...pendingTranslations.values()]);
  }
};

const getSpecKeyLabels = async (specs, targetLang) => {
  const entries = getSpecEntries(specs);
  const canonicalKeys = [...new Set(entries.map(([key]) => getCanonicalSpecKey(key)).filter(Boolean))];

  if (canonicalKeys.length === 0) return {};

  const defaultLang = getDefaultLanguage().code;
  if (targetLang === defaultLang || SpecKeyTranslationCache.db.readyState !== 1) {
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
      qualityStatus: 'approved',
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
  registerUnknownSpecKeys,
  waitForPendingTranslations,
};
