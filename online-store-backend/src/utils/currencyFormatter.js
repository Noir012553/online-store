const { getIntlLocale } = require('../config/languageInventory');

const formatExchangeRate = (rate, lang) => new Intl.NumberFormat(getIntlLocale(lang.toLowerCase()), {
  maximumFractionDigits: 8,
}).format(rate);

module.exports = {
  formatExchangeRate,
};
