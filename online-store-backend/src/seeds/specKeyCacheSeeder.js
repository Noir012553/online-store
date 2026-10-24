const SpecKeyTranslationCache = require('../models/SpecKeyTranslationCache');
const specKeyTranslations = require('../data/specKeyTranslations.json');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const { getCanonicalSpecKey } = require('../services/specKeyTranslationService');

const getStaticSeedEntries = () => {
  const entriesByKey = new Map();

  Object.entries(specKeyTranslations).forEach(([rawKey, labels]) => {
    const canonicalKey = getCanonicalSpecKey(rawKey);
    if (!canonicalKey || !labels || typeof labels !== 'object') return;

    getActiveLangCodes().forEach((targetLang) => {
      const translatedLabel = labels[targetLang] || labels.vi || labels.en || canonicalKey;
      if (typeof translatedLabel !== 'string' || !translatedLabel.trim()) return;

      entriesByKey.set(`${canonicalKey}:${targetLang}`, {
        canonicalKey,
        normalizedKey: canonicalKey,
        targetLang,
        translatedLabel: translatedLabel.trim(),
        status: 'success',
        qualityStatus: 'approved',
        source: 'static',
        provider: 'static',
        lastTranslatedAt: new Date(),
      });
    });
  });

  return [...entriesByKey.values()];
};

const seedSpecKeyTranslationCache = async () => {
  const entries = getStaticSeedEntries();
  let inserted = 0;

  for (const entry of entries) {
    const result = await SpecKeyTranslationCache.updateOne(
      { canonicalKey: entry.canonicalKey, targetLang: entry.targetLang },
      { $setOnInsert: entry },
      { upsert: true }
    );
    inserted += result.upsertedCount || 0;
  }

  console.log(`${CLI_SYMBOLS.success} Spec key label cache: ${inserted} inserted, ${entries.length - inserted} existing preserved`);
  return { total: entries.length, inserted };
};

seedSpecKeyTranslationCache.getStaticSeedEntries = getStaticSeedEntries;

module.exports = seedSpecKeyTranslationCache;
