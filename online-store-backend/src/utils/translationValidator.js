const config = require('../config/translationValidation');
const LiveTranslationCache = require('../models/LiveTranslationCache');

class TranslationValidator {
  checkEmpty(translated) {
    if (!config.ENABLE_EMPTY_CHECK) return null;
    if (!translated || translated.trim() === '') {
      return { error: 'empty' };
    }
    return null;
  }

  checkMissingBrand(original, translated) {
    if (!config.ENABLE_BRAND_CHECK) return null;
    for (const brand of config.PRESERVED_BRANDS) {
      if (original.includes(brand) && !translated.includes(brand)) {
        return { error: 'missing_brand', brand };
      }
    }
    return null;
  }

  checkLength(original, translated) {
    if (!config.ENABLE_LENGTH_CHECK) return null;
    const ratio = translated.length / original.length;

    if (ratio < config.MIN_LENGTH_RATIO) {
      return { error: 'too_short', ratio: ratio.toFixed(2) };
    }
    if (ratio > config.MAX_LENGTH_RATIO) {
      return { error: 'too_long', ratio: ratio.toFixed(2) };
    }
    return null;
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
    const codes = {
      vietnamese: 'vi', vie: 'vi',
      english: 'en', eng: 'en',
      portuguese: 'pt', por: 'pt',
      french: 'fr', fra: 'fr', fre: 'fr',
      german: 'de', deu: 'de', ger: 'de',
      italian: 'it', ita: 'it',
      spanish: 'es', spa: 'es',
      dutch: 'nl', nld: 'nl', dut: 'nl',
      swedish: 'sv', swe: 'sv',
    };
    const normalized = String(language || '').trim().toLowerCase();
    return codes[normalized] || normalized.split(/[-_]/)[0];
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
