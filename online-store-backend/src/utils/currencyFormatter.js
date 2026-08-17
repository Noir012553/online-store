const { getDefaultLanguage, getIntlLocale } = require('../config/languageInventory');

const getLocale = (locale) => {
  const requestedLocale = locale || getDefaultLanguage().code;

  try {
    const canonicalLocale = Intl.getCanonicalLocales(requestedLocale)[0];
    return canonicalLocale.includes('-') ? canonicalLocale : getIntlLocale(canonicalLocale);
  } catch {
    return getIntlLocale(requestedLocale.toLowerCase());
  }
};

const formatCurrency = (amount, currency, lang) => {
  const formattedAmount = new Intl.NumberFormat(getLocale(lang), {
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  }).format(amount);

  return currency.position === 'before'
    ? `${currency.symbol}${formattedAmount}`
    : `${formattedAmount} ${currency.symbol}`;
};

const formatExchangeRate = (rate, lang) => new Intl.NumberFormat(getLocale(lang), {
  maximumFractionDigits: 8,
}).format(rate);

module.exports = {
  formatCurrency,
  formatExchangeRate,
};
