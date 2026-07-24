const assert = require('assert');
const { formatCurrency, formatExchangeRate } = require('../utils/currencyFormatter');

describe('currencyFormatter', () => {
  it('formats amounts using currency metadata and the request locale', () => {
    assert.strictEqual(
      formatCurrency(100, { symbol: '€', position: 'after', decimalPlaces: 2 }, 'vi'),
      '100,00 €'
    );
    assert.strictEqual(
      formatCurrency(100, { symbol: '$', position: 'before', decimalPlaces: 2 }, 'en'),
      '$100.00'
    );
  });

  it('respects currencies without decimal places', () => {
    assert.strictEqual(
      formatCurrency(1234.56, { symbol: '₫', position: 'after', decimalPlaces: 0 }, 'vi'),
      '1.235 ₫'
    );
  });

  it('preserves significant exchange-rate decimals without trailing zeroes', () => {
    assert.strictEqual(formatExchangeRate(10.85, 'en'), '10.85');
    assert.strictEqual(formatExchangeRate(0.000041, 'en'), '0.000041');
    assert.strictEqual(formatExchangeRate(0.00003772, 'vi'), '0,00003772');
  });
});
