/**
 * Currency & Exchange Rate Seeder
 * Khởi tạo dữ liệu mệnh giá (VND, USD, EUR, SEK) và tỷ giá quy đổi
 */

const Currency = require('../models/Currency');
const ExchangeRate = require('../models/ExchangeRate');

/**
 * Seed dữ liệu mệnh giá và tỷ giá
 */
const seedCurrency = async () => {
  // 1. Tạo 4 mệnh giá (VND, USD, EUR, SEK)
  const currencies = [
    {
      code: 'VND',
      name: 'Vietnamese Dong',
      symbol: '₫',
      position: 'after',
      decimalPlaces: 0,
      isActive: true,
      isDefault: true,
      description: 'Currency unit of Vietnam',
    },
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      position: 'before',
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
      description: 'Currency unit of United States',
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      position: 'after',
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
      description: 'Currency unit of European Union',
    },
    {
      code: 'SEK',
      name: 'Swedish Krona',
      symbol: 'kr',
      position: 'after',
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
      description: 'Currency unit of Sweden',
    },
  ];

  await Currency.bulkWrite(
    currencies.map(({ code, ...currency }) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, ...currency } },
        upsert: true,
      },
    }))
  );

  // 2. Tạo tỷ giá quy đổi chiều (VND-USD-EUR-SEK)
  const exchangeRates = [
    {
      fromCode: 'VND',
      toCode: 'USD',
      rate: 0.000041,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'USD',
      toCode: 'VND',
      rate: 24390,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'USD',
      toCode: 'EUR',
      rate: 0.92,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'EUR',
      toCode: 'USD',
      rate: 1.0870,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'VND',
      toCode: 'EUR',
      rate: 0.00003772,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'EUR',
      toCode: 'VND',
      rate: 26521.74,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'EUR',
      toCode: 'SEK',
      rate: 10.85,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
    {
      fromCode: 'SEK',
      toCode: 'EUR',
      rate: 0.0922,
      source: 'manual',
      isActive: true,
      rateUpdatedAt: new Date('2024-01-15'),
    },
  ];

  await ExchangeRate.bulkWrite(
    exchangeRates.map(({ fromCode, toCode, isActive, ...rate }) => ({
      updateOne: {
        filter: { fromCode, toCode },
        update: {
          $set: { isActive: true },
          $setOnInsert: { fromCode, toCode, ...rate },
        },
        upsert: true,
      },
    }))
  );

  return {
    currencies: await Currency.find({ code: { $in: currencies.map((currency) => currency.code) } }),
    exchangeRates: await ExchangeRate.find({
      $or: exchangeRates.map(({ fromCode, toCode }) => ({ fromCode, toCode })),
    }),
  };
};

module.exports = seedCurrency;
