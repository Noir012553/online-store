const Order = require('../models/Order');
const ExchangeRate = require('../models/ExchangeRate');
const Currency = require('../models/Currency');

const getActiveExchangeRates = async () => ExchangeRate.find(
  { isActive: true },
  { fromCode: 1, toCode: 1, rate: 1, _id: 0 }
).lean();

const getReportingCurrency = async (requestedCurrencyCode) => {
  if (requestedCurrencyCode !== undefined && (typeof requestedCurrencyCode !== 'string' || !/^[A-Za-z]{3}$/.test(requestedCurrencyCode))) {
    const error = new Error('Unsupported reporting currency');
    error.statusCode = 400;
    throw error;
  }

  const currencyProjection = { code: 1, _id: 0 };
  let currency;

  if (requestedCurrencyCode === undefined) {
    currency = await Currency.findOne(
      { isActive: true, isDefault: true },
      currencyProjection
    ).lean();

    if (!currency) {
      currency = await Currency.findOne(
        { isActive: true },
        currencyProjection
      ).sort({ code: 1 }).lean();
    }
  } else {
    currency = await Currency.findOne(
      { isActive: true, code: requestedCurrencyCode.toUpperCase() },
      currencyProjection
    ).lean();
  }

  if (!currency) {
    const error = new Error(
      requestedCurrencyCode === undefined
        ? 'No active reporting currency is configured'
        : 'Unsupported reporting currency'
    );
    error.statusCode = requestedCurrencyCode === undefined ? 503 : 400;
    throw error;
  }

  return currency.code;
};

const convertOrderAmount = (amount, fromCode, toCode, historicalRates = [], activeRates = []) => {
  const sourceCode = fromCode.toUpperCase();
  const targetCode = toCode.toUpperCase();
  if (sourceCode === targetCode) return amount;

  const findRate = (rates) => {
    const getPairRate = (from, to) => {
      const directRate = rates.find(
        (rate) => rate.fromCode === from && rate.toCode === to
      );
      if (Number.isFinite(directRate?.rate) && directRate.rate > 0) return directRate.rate;

      const reverseRate = rates.find(
        (rate) => rate.fromCode === to && rate.toCode === from
      );
      if (Number.isFinite(reverseRate?.rate) && reverseRate.rate > 0) {
        return 1 / reverseRate.rate;
      }

      return null;
    };

    const directRate = getPairRate(sourceCode, targetCode);
    if (directRate !== null) return directRate;

    const currencyCodes = new Set(
      rates.flatMap((rate) => [rate.fromCode, rate.toCode])
    );

    for (const intermediateCode of currencyCodes) {
      if (intermediateCode === sourceCode || intermediateCode === targetCode) continue;

      const sourceRate = getPairRate(sourceCode, intermediateCode);
      const targetRate = getPairRate(intermediateCode, targetCode);
      if (sourceRate !== null && targetRate !== null) {
        return sourceRate * targetRate;
      }
    }

    return null;
  };

  const rate = findRate(historicalRates) ?? findRate(activeRates);
  if (rate !== null) return amount * rate;

  throw new Error(`No exchange rate found between ${sourceCode} and ${targetCode}`);
};

const sumOrdersInCurrency = async (match, currencyCode) => {
  const [orders, activeRates] = await Promise.all([
    Order.find(match, { totalPrice: 1, currencyCode: 1, exchangeRates: 1 }).lean(),
    getActiveExchangeRates(),
  ]);

  return orders.reduce(
    (total, order) => total + convertOrderAmount(order.totalPrice, order.currencyCode, currencyCode, order.exchangeRates, activeRates),
    0
  );
};

module.exports = {
  convertOrderAmount,
  getActiveExchangeRates,
  getReportingCurrency,
  sumOrdersInCurrency,
};
