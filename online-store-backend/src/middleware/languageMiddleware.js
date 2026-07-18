/**
 * Language middleware - extract lang from query, body, or headers
 * Priority: query.lang > body.lang > Accept-Language header > default language from config
 */

const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

const languageMiddleware = (req, res, next) => {
  const SUPPORTED_LANGS = getActiveLangCodes();
  const DEFAULT_LANG = getDefaultLanguage().code;

  // Extract from query
  let lang = req.query.lang;

  // Fallback to body
  if (!lang && req.body?.lang) {
    lang = req.body.lang;
  }

  // Fallback to Accept-Language header
  if (!lang) {
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
      const primaryLang = acceptLanguage.split(',')[0].split('-')[0].toLowerCase();
      if (SUPPORTED_LANGS.includes(primaryLang)) {
        lang = primaryLang;
      }
    }
  }

  // Default to configured default language
  lang = lang ? lang.toLowerCase() : DEFAULT_LANG;

  // Validate and normalize
  if (!SUPPORTED_LANGS.includes(lang)) {
    lang = DEFAULT_LANG;
  }

  // Attach to request
  req.lang = lang;
  req.locale = lang;

  next();
};

module.exports = languageMiddleware;
