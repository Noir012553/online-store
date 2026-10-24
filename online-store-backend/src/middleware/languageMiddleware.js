/**
 * Language middleware - extract lang from query, body, or headers
 * Priority: query.lang > body.lang > Accept-Language header > default language from config
 */

const { getActiveLangCodes, getDefaultLanguage } = require('../config/languageInventory');

const languageMiddleware = (req, res, next) => {
  const SUPPORTED_LANGS = getActiveLangCodes();
  const DEFAULT_LANG = getDefaultLanguage().code;
  const requestedLocale = req.query.locale || req.body?.locale || req.query.lang || req.body?.lang || req.headers['accept-language']?.split(',')[0];
  let locale;

  try {
    locale = Intl.getCanonicalLocales(requestedLocale || DEFAULT_LANG)[0];
  } catch {
    locale = DEFAULT_LANG;
  }

  let lang = locale.split('-')[0].toLowerCase();
  if (!SUPPORTED_LANGS.includes(lang)) {
    lang = DEFAULT_LANG;
    locale = DEFAULT_LANG;
  }

  req.lang = lang;
  req.locale = locale;

  next();
};

module.exports = languageMiddleware;
