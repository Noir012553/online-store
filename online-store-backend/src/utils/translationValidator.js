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
const TECHNICAL_TOKEN_PATTERN = /(?<![\p{L}\d])(?:\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|mm|cm|Hz|W|V|%|inch|in)|[A-Za-z]+\d+[A-Za-z\d-]*|\d+[A-Za-z][A-Za-z\d-]*)(?![\p{L}\d])/gu;
const MARKUP_TOKEN_PATTERN = /(?:<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\))/g;
const removeVietnameseDiacritics = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd');

const getWords = (value) => value
  .toLocaleLowerCase('vi')
  .split(/[^\p{L}]+/u)
  .filter(Boolean);

const getTechnicalTokens = (value) => String(value || '').match(TECHNICAL_TOKEN_PATTERN) || [];
const getMarkupTokens = (value) => String(value || '').match(MARKUP_TOKEN_PATTERN) || [];

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
    const sourceTokens = getTechnicalTokens(original);
    const translatedText = translated.toLocaleLowerCase();
    const missingToken = sourceTokens.find((token) => !translatedText.includes(token.toLocaleLowerCase()));
    return missingToken ? { error: 'missing_technical_token', token: missingToken } : null;
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

  checkSourceLanguageLeak(original, translated, targetLang, entityType) {
    if (targetLang === 'vi' || !PRODUCT_ENTITY_TYPES.has(entityType)) return null;
    if (typeof original !== 'string' || typeof translated !== 'string') return null;

    const sourceWords = getWords(original);
    const translatedText = translated.toLocaleLowerCase('vi');
    const normalizedTranslatedText = removeVietnameseDiacritics(translatedText);

    for (let index = 0; index < sourceWords.length - 1; index += 1) {
      for (let length = Math.min(4, sourceWords.length - index); length >= 2; length -= 1) {
        const phrase = sourceWords.slice(index, index + length).join(' ');
        const normalizedPhrase = removeVietnameseDiacritics(phrase);
        const hasDiacritics = sourceWords.slice(index, index + length).some((word) => VIETNAMESE_DIACRITICS.test(word));
        const isKnownPhrase = config.VIETNAMESE_DOMAIN_PHRASES.includes(normalizedPhrase);
        if (phrase.length >= 6 && (hasDiacritics || isKnownPhrase)
          && (translatedText.includes(phrase) || normalizedTranslatedText.includes(normalizedPhrase))) {
          return { error: 'mixed_language', phrase };
        }
      }
    }

    return null;
  }

  hasSourceLanguageLeak(original, translated, targetLang, entityType) {
    return Boolean(this.checkSourceLanguageLeak(original, translated, targetLang, entityType));
  }

  async checkWrongLanguage(translated, expectedLang) {
    if (!config.ENABLE_LANGUAGE_CHECK) return null;
    try {
      const detected = await this.detectLanguage(translated);
      const detectedCode = this.normalizeLanguageCode(detected);
      const expectedCode = this.normalizeLanguageCode(expectedLang);
      if (!detectedCode || detectedCode === 'unknown' || detectedCode === expectedCode) return null;
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

    const technicalTokenCheck = this.checkTechnicalTokens(original, translated);
    if (technicalTokenCheck) errors.push(technicalTokenCheck.error);

    const markupCheck = this.checkMarkup(original, translated);
    if (markupCheck) errors.push(markupCheck.error);

    const truncatedCheck = this.checkTruncated(original, translated);
    if (truncatedCheck) errors.push(truncatedCheck.error);

    const sourceLanguageLeakCheck = this.checkSourceLanguageLeak(
      original,
      translated,
      targetLang,
      entityType,
    );
    if (sourceLanguageLeakCheck) errors.push(sourceLanguageLeakCheck.error);

    const langCheck = await this.checkWrongLanguage(translated, targetLang);
    if (langCheck) errors.push(langCheck.error);

    const inconsistencyCheck = await this.checkInconsistency(original, targetLang, translated, entityType);
    if (inconsistencyCheck) errors.push(inconsistencyCheck.error);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(errors);

    // Determine status
    let qualityStatus = 'approved';
    if (qualityScore < config.QUALITY_THRESHOLD_FOR_RETRANSLATE) {
      qualityStatus = 'needs_retranslate';
    } else if (qualityScore < config.QUALITY_THRESHOLD_FOR_APPROVAL) {
      qualityStatus = 'pending';
    }

    // Auto-approve if no errors
    if (config.AUTO_APPROVE_IF_NO_ERRORS && errors.length === 0) {
      qualityStatus = 'approved';
    }

    return {
      validationErrors: errors,
      qualityScore,
      qualityStatus,
      hasCriticalErrors: errors.some(e => config.CRITICAL_ERRORS.includes(e)),
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
