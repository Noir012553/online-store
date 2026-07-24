const { getDefaultLanguage, getIntlLocale } = require('../config/languageInventory');

const getLocale = (lang) => getIntlLocale((lang || getDefaultLanguage().code).toLowerCase());

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
