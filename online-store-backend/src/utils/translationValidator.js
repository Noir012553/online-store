const config = require('../config/translationValidation');
const LiveTranslationCache = require('../models/LiveTranslationCache');

const PRODUCT_ENTITY_TYPES = new Set([
  'product_name',
  'product_description',
  'product_spec',
  'product_brand',
  'product_technical_description',
  'product_description_image_alt',
  'product_promotion',
]);
const VIETNAMESE_DIACRITICS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;

// Single Vietnamese syllables that are also valid words in target languages
// (French/Portuguese articles, prepositions, pronouns...) must be excluded
// from the single-word leak pass. E.g. "là" is the Vietnamese verb "to be"
// but "là"/"la" is also the French feminine article / Portuguese pronoun.
// The bigram pass below still catches real leaks containing these words
// when they appear inside a longer Vietnamese phrase (>= 6 chars).
const SOURCE_LEAK_SINGLE_WORD_ALLOWLIST = new Set([
  'la', // Vietnamese "là" vs French article "la" / Portuguese pronoun
]);
const TECHNICAL_TOKEN_PATTERN = /(?<![\p{L}\d])(?:[A-Za-z]{2,}-\d+[A-Za-z\d-]*|[A-Z]{2,}\s+\d{3,}[A-Za-z\d-]*|[A-Z]{2,}\s+\d+(?:[.,]\d+)?-[A-Za-z0-9-]+|\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])|[A-Za-z]+\d+[A-Za-z\d-]*|\d+(?!(?:st|nd|rd|th)(?![\p{L}\d]))[A-Za-z][A-Za-z\d-]*)(?![\p{L}\d])/gu;
const MARKUP_TOKEN_PATTERN = /(?:<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\))/g;
const TRANSLATION_COMMENTARY_PATTERN = /\b(?:nothing to translate\b|the translation of\b[\s\S]{0,100}\bis not provided\b)/i;
const removeVietnameseDiacritics = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd');

const getWords = (value) => value
  .toLocaleLowerCase('vi')
  .split(/[^\p{L}]+/u)
  .filter(Boolean);

const getTechnicalTokens = (value) => String(value || '').match(TECHNICAL_TOKEN_PATTERN) || [];
const normalizeTechnicalToken = token => token
  .toLocaleLowerCase()
  .replace(/\s+/g, '')
  .replace(/,/g, '.');
const TECHNICAL_UNIT_PATTERN = /\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])(?!\p{L})/giu;
const TECHNICAL_UNIT_SUFFIX_PATTERN = /\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])(?!\p{L})$/iu;
const TECHNICAL_KEYWORD_PATTERN = /(?<!\p{L})(?:SSD|NVMe|HDD|SATA|PCIe|IPS|OLED|FHD|QHD|UHD|DDR[345]?)(?!\p{L})/giu;
const getCountMap = (values, normalizeToken = normalizeTechnicalToken) => values.reduce((counts, value) => {
  const token = normalizeToken(value);
  counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}, new Map());
const getRawToken = (value, normalizedToken, normalizeToken = normalizeTechnicalToken) => (
  (String(value || '').match(TECHNICAL_TOKEN_PATTERN) || [])
    .find(token => normalizeToken(token) === normalizedToken)
  || normalizedToken
);
const normalizeTechnicalUnit = token => normalizeTechnicalToken(token).replace(/(?:["″]|inch(?:es)?|in)$/, 'inch');
const getTechnicalUnitCounts = value => getCountMap(
  String(value || '').match(TECHNICAL_UNIT_PATTERN) || [],
  normalizeTechnicalUnit,
);
const getTechnicalKeywordCounts = value => getCountMap(String(value || '').match(TECHNICAL_KEYWORD_PATTERN) || []);
const getPlainTechnicalTokenCounts = value => getCountMap(
  getTechnicalTokens(value).filter(token => !TECHNICAL_UNIT_SUFFIX_PATTERN.test(token)),
);
const isTechnicalUnitPrefix = token => (
  token === token.toUpperCase() || (token.match(/[A-Z]/g) || []).length >= 2
);
const getEmbeddedUnitPrefixCounts = value => getCountMap(
  getTechnicalTokens(value)
    .map(token => token.match(/^([A-Za-z]+)\s*\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])$/iu)?.[1])
    .filter(token => token && isTechnicalUnitPrefix(token)),
);
const countWholePhrase = (value, phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...String(value || '').matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'))].length;
};
const getMarkupTokens = (value) => String(value || '').match(MARKUP_TOKEN_PATTERN) || [];
const containsWholePhrase = (value, phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(value);
};

// Vocabulary fallback scoring for the unknown-detection case: picks the
// locale whose hint stems match the most words. Returns 'uncertain' when no
// locale scores >= 2 matches or the top two tie, so ambiguous strings are
// not flagged (false negatives are preferred over false positives here).
const detectedLanguageOf = (words, expectedLang) => {
  const scores = Object.entries(config.TARGET_LANGUAGE_HINTS)
    .map(([lang, hints]) => [lang, words.filter(
      (word) => hints.some((hint) => word.startsWith(hint)),
    ).length])
    .filter(([, score]) => score >= 2)
    .sort((left, right) => right[1] - left[1]);
  if (scores.length === 0) return 'uncertain';
  if (scores.length > 1 && scores[0][1] === scores[1][1]) return 'uncertain';
  return scores[0][0] === expectedLang ? expectedLang : scores[0][0];
};

class TranslationValidator {
  checkEmpty(translated) {
    if (!config.ENABLE_EMPTY_CHECK) return null;
    if (!translated || translated.trim() === '') {
      return { error: 'empty' };
    }
    return null;
  }

  checkMissingBrand(original, translated) {
    if (!config.ENABLE_BRAND_CHECK || typeof original !== 'string' || typeof translated !== 'string') return null;
    for (const brand of config.PRESERVED_BRANDS) {
      if (original.includes(brand) && !translated.includes(brand)) {
        return { error: 'missing_brand', brand };
      }
    }
    return null;
  }

  checkLength(original, translated) {
    if (!config.ENABLE_LENGTH_CHECK || !original.length) return null;
    const ratio = translated.length / original.length;

    if (ratio < config.MIN_LENGTH_RATIO) {
      return { error: 'too_short', ratio: ratio.toFixed(2) };
    }
    if (ratio > config.MAX_LENGTH_RATIO) {
      return { error: 'too_long', ratio: ratio.toFixed(2) };
    }
    return null;
  }

  checkTechnicalTokens(original, translated) {
    if (typeof original !== 'string' || typeof translated !== 'string') return null;
    const sourceCounts = getPlainTechnicalTokenCounts(original);
    const translatedCounts = getPlainTechnicalTokenCounts(translated);
    const sourceUnitCounts = getTechnicalUnitCounts(original);
    const translatedUnitCounts = getTechnicalUnitCounts(translated);
    const sourceKeywordCounts = getTechnicalKeywordCounts(original);
    const translatedKeywordCounts = getTechnicalKeywordCounts(translated);
    const sourcePrefixCounts = getEmbeddedUnitPrefixCounts(original);

    for (const [token, count] of sourceCounts) {
      if ((translatedCounts.get(token) || 0) < count) {
        return { error: 'missing_technical_token', token: getRawToken(original, token) };
      }
    }
    for (const token of translatedCounts.keys()) {
      if (!sourceCounts.has(token)) {
        return { error: 'unexpected_technical_token', token: getRawToken(translated, token) };
      }
    }
    for (const [token, count] of sourceUnitCounts) {
      if ((translatedUnitCounts.get(token) || 0) < count) {
        return { error: 'missing_technical_token', token: getRawToken(original, token, normalizeTechnicalUnit) };
      }
    }
    for (const token of translatedUnitCounts.keys()) {
      if (!sourceUnitCounts.has(token)) {
        return { error: 'unexpected_technical_token', token: getRawToken(translated, token, normalizeTechnicalUnit) };
      }
    }
    for (const [token, count] of sourceKeywordCounts) {
      if ((translatedKeywordCounts.get(token) || 0) < count) {
        return { error: 'missing_technical_token', token: getRawToken(original, token) };
      }
    }
    for (const token of translatedKeywordCounts.keys()) {
      if (!sourceKeywordCounts.has(token)) {
        return { error: 'unexpected_technical_token', token: getRawToken(translated, token) };
      }
    }
    for (const [token, count] of sourcePrefixCounts) {
      if (countWholePhrase(translated, token) < count) {
        return { error: 'missing_technical_token', token };
      }
    }
    return null;
  }

  checkMarkup(original, translated) {
    if (typeof original !== 'string' || typeof translated !== 'string') return null;
    const sourceTokens = getMarkupTokens(original);
    if (sourceTokens.length === 0) return null;
    const translatedTokens = getMarkupTokens(translated);
    return sourceTokens.length !== translatedTokens.length
      || sourceTokens.some((token, index) => token !== translatedTokens[index])
      ? { error: 'markup_mismatch' }
      : null;
  }

  checkTruncated(original, translated) {
    if (typeof original !== 'string' || typeof translated !== 'string') return null;
    const source = original.trim();
    const result = translated.trim();
    if (source.length < 40 || !/[.!?:]$/.test(source) || /[.!?:]$/.test(result)) return null;
    return { error: 'truncated' };
  }

  checkExtraCommentary(translated) {
    if (typeof translated !== 'string') return null;
    return TRANSLATION_COMMENTARY_PATTERN.test(translated)
      ? { error: 'extra_commentary' }
      : null;
  }

  checkSourceLanguageLeak(original, translated, targetLang, entityType) {
    if (targetLang === 'vi' || !PRODUCT_ENTITY_TYPES.has(entityType)) return null;
    if (typeof original !== 'string' || typeof translated !== 'string') return null;

    const sourceWords = getWords(original);
    const translatedText = translated.toLocaleLowerCase('vi');
    const normalizedTranslatedText = removeVietnameseDiacritics(translatedText);

    // Single-word pass: catch short Vietnamese words (Bàn, Đen, Chuột, đậm...)
    // that the bigram-only pass below misses. Minimum length is 3: 2-letter
    // syllables (là, dữ...) normalize to French articles/prepositions (la, du)
    // and would false-positive on every French sentence — the bigram pass
    // below still catches them when inside a longer Vietnamese phrase (>= 6 chars).
    for (const sourceWord of sourceWords) {
      const normalizedWord = removeVietnameseDiacritics(sourceWord);
      const hasDiacritics = VIETNAMESE_DIACRITICS.test(sourceWord);
      const isKnownWord = config.VIETNAMESE_DOMAIN_PHRASES.includes(normalizedWord);
      if (SOURCE_LEAK_SINGLE_WORD_ALLOWLIST.has(normalizedWord)) continue;
      if (sourceWord.length >= 3 && (hasDiacritics || isKnownWord)
        && (containsWholePhrase(translatedText, sourceWord)
          || containsWholePhrase(normalizedTranslatedText, normalizedWord))) {
        return { error: 'mixed_language', phrase: sourceWord };
      }
    }

    for (let index = 0; index < sourceWords.length - 1; index += 1) {
      for (let length = Math.min(4, sourceWords.length - index); length >= 2; length -= 1) {
        const phrase = sourceWords.slice(index, index + length).join(' ');
        const normalizedPhrase = removeVietnameseDiacritics(phrase);
        const hasDiacritics = sourceWords.slice(index, index + length).some((word) => VIETNAMESE_DIACRITICS.test(word));
        const isKnownPhrase = config.VIETNAMESE_DOMAIN_PHRASES.includes(normalizedPhrase);
        if (phrase.length >= 6 && (hasDiacritics || isKnownPhrase)
          && (containsWholePhrase(translatedText, phrase)
            || containsWholePhrase(normalizedTranslatedText, normalizedPhrase))) {
          return { error: 'mixed_language', phrase };
        }
      }
    }

    return null;
  }

  hasSourceLanguageLeak(original, translated, targetLang, entityType) {
    return Boolean(this.checkSourceLanguageLeak(original, translated, targetLang, entityType));
  }

  // Fallback language check for short/token-heavy strings where language-detect
  // returns 'unknown': flags the translation as wrong_language when it contains
  // no words of the target language vocabulary at all (only tokens/brands).
  // Controlled by TARGET_LANGUAGE_HINTS (per-locale word lists) in
  // config/translationValidation; locales without hints stay skipped.
  checkTargetLanguageVocabulary(translated, expectedLang) {
    const hints = config.TARGET_LANGUAGE_HINTS[expectedLang];
    if (!hints || hints.length === 0) return null;
    if (typeof translated !== 'string') return null;
    const words = getWords(translated);
    if (words.length === 0) return null;
    // Require at least 2 alphabetic words so pure model names / spec values
    // ("RTX 5070", "8000Hz") are not flagged.
    const alphabeticWords = words.filter((word) => /^\p{L}{2,}$/u.test(word));
    if (alphabeticWords.length < 2) return null;
    const detected = detectedLanguageOf(alphabeticWords, expectedLang);
    if (detected === expectedLang) return null;
    return {
      error: 'wrong_language',
      expected: expectedLang,
      detected,
    };
  }

  // Technical descriptions are JSON-inline strings
  // ("Specifications: {...}" / "Spécifications: {...}") where keys and values
  // are largely English technical tokens. Language detection on the whole
  // string misfires (detects 'en'), so for tech-desc we detect only the
  // prose OUTSIDE the JSON payload. If no prose remains, skip wrong_language
  // (token checks already guard the JSON part). Same rationale as the
  // technical-token exemption for product_description since 2026-10-28.
  stripTechnicalDescriptionJson(translated) {
    if (typeof translated !== 'string') return '';
    const braceIndex = translated.indexOf('{');
    if (braceIndex === -1) return translated;
    return translated.slice(0, braceIndex).trim();
  }

  async checkWrongLanguage(translated, expectedLang, entityType = null) {
    if (!config.ENABLE_LANGUAGE_CHECK) return null;
    let textForDetection = translated;
    if (entityType === 'product_technical_description' && typeof translated === 'string') {
      textForDetection = this.stripTechnicalDescriptionJson(translated);
      if (!textForDetection || textForDetection.length < 10) return null;
    }
    try {
      const detected = await this.detectLanguage(textForDetection);
      const detectedCode = this.normalizeLanguageCode(detected);
      const expectedCode = this.normalizeLanguageCode(expectedLang);
      if (detectedCode === expectedCode) return null;
      if (!detectedCode || detectedCode === 'unknown') {
        // language-detect often returns 'unknown' for short/token-heavy
        // product strings; fall back to a target-vocabulary ratio check so
        // untranslated strings cannot slip through silently.
        return this.checkTargetLanguageVocabulary(textForDetection, expectedCode);
      }
      return {
        error: 'wrong_language',
        expected: expectedLang,
        detected,
      };
    } catch (err) {
      // Silent fail, skip language check if detection fails
      console.warn('Language detection failed:', err.message);
    }
    return null;
  }

  async checkInconsistency(originalText, targetLang, translatedText, entityType) {
    if (!config.ENABLE_INCONSISTENCY_CHECK) return null;

    try {
      const existingApproved = await LiveTranslationCache.findOne({
        originalText,
        targetLang,
        entityType,
        qualityStatus: 'approved',
        version: 1,
      });

      if (existingApproved && existingApproved.translatedText !== translatedText) {
        return {
          error: 'inconsistent',
          inconsistentWith: existingApproved.translatedText,
        };
      }
    } catch (err) {
      console.warn('Inconsistency check failed:', err.message);
    }
    return null;
  }

  calculateQualityScore(errors) {
    let score = 100;
    for (const error of errors) {
      const penalty = config.QUALITY_SCORE_FORMULA[error] || 0;
      score += penalty;
    }
    return Math.max(0, Math.min(100, score));
  }

  async validateTranslation(original, translated, targetLang, entityType) {
    const errors = [];

    // Run all checks
    const emptyCheck = this.checkEmpty(translated);
    if (emptyCheck) errors.push(emptyCheck.error);

    const brandCheck = this.checkMissingBrand(original, translated);
    if (brandCheck) errors.push(brandCheck.error);

    const lengthCheck = this.checkLength(original, translated);
    if (lengthCheck) errors.push(lengthCheck.error);

    // Marketing prose may reorder or reference specs freely: skip technical-token
    // checks for product_description (tokens only need to appear, order/count free).
    const technicalTokenCheck = entityType === 'product_description'
      ? null
      : this.checkTechnicalTokens(original, translated);
    if (technicalTokenCheck) errors.push(technicalTokenCheck.error);

    const markupCheck = this.checkMarkup(original, translated);
    if (markupCheck) errors.push(markupCheck.error);

    const truncatedCheck = this.checkTruncated(original, translated);
    if (truncatedCheck) errors.push(truncatedCheck.error);

    const extraCommentaryCheck = this.checkExtraCommentary(translated);
    if (extraCommentaryCheck) errors.push(extraCommentaryCheck.error);

    const sourceLanguageLeakCheck = this.checkSourceLanguageLeak(
      original,
      translated,
      targetLang,
      entityType,
    );
    if (sourceLanguageLeakCheck) errors.push(sourceLanguageLeakCheck.error);

    const langCheck = await this.checkWrongLanguage(translated, targetLang, entityType);
    if (langCheck) errors.push(langCheck.error);

    const inconsistencyCheck = await this.checkInconsistency(original, targetLang, translated, entityType);
    if (inconsistencyCheck) errors.push(inconsistencyCheck.error);

    const qualityScore = this.calculateQualityScore(errors);
    const validationErrors = errors.filter((error) => !config.NON_BLOCKING_ERRORS.includes(error));

    let qualityStatus = 'approved';
    if (qualityScore < config.QUALITY_THRESHOLD_FOR_RETRANSLATE) {
      qualityStatus = 'needs_retranslate';
    } else if (
      qualityScore < config.QUALITY_THRESHOLD_FOR_APPROVAL
      || validationErrors.length > 0
    ) {
      qualityStatus = 'pending';
    }

    if (config.AUTO_APPROVE_IF_NO_ERRORS && validationErrors.length === 0) {
      qualityStatus = 'approved';
    }

    return {
      validationErrors,
      qualityScore,
      qualityStatus,
      hasCriticalErrors: validationErrors.some((error) => config.CRITICAL_ERRORS.includes(error)),
    };
  }

  normalizeLanguageCode(language) {
    const normalized = String(language || '').trim().toLowerCase();
    return config.LANGUAGE_ALIASES[normalized] || normalized.split(/[-_]/)[0];
  }

  async detectLanguage(text) {
    try {
      const languageDetect = require('language-detect');
      const result = languageDetect(text);
      if (result && result.length > 0) {
        return result[0][0];
      }
    } catch (err) {
      // Fallback: simple detection based on characters
      if (/[\u0400-\u04FF]/.test(text)) return 'ru';
      if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
      if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
      if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
      if (/[\u0600-\u06FF]/.test(text)) return 'ar';
      return 'unknown';
    }
  }
}

module.exports = new TranslationValidator();
