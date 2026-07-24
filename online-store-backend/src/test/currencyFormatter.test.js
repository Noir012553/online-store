const assert = require('assert');
const { formatCurrency, formatExchangeRate } = require('../utils/currencyFormatter');
const {
  formatAmountFields,
  formatPaymentFields,
  formatOrderFields,
  formatCouponFields,
} = require('../utils/currencyResponseFormatter');

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

  it('adds formatted response fields while preserving raw amounts', () => {
    const vnd = { code: 'VND', symbol: '₫', position: 'after', decimalPlaces: 0 };
    const usd = { code: 'USD', symbol: '$', position: 'before', decimalPlaces: 2 };
    const currencies = new Map([['VND', vnd], ['USD', usd]]);
    const payment = formatPaymentFields({
      amount: 125000,
      currency: 'VND',
      providerAmount: 5.25,
      providerCurrency: 'USD',
    }, currencies, 'en');
    const shipping = formatAmountFields({ fee: 35000 }, vnd, 'vi', [['fee', 'formattedFee']]);

    assert.strictEqual(payment.amount, 125000);
    assert.strictEqual(payment.providerAmount, 5.25);
    assert.strictEqual(payment.formattedAmount, '125,000 ₫');
    assert.strictEqual(payment.formattedProviderAmount, '$5.25');
    assert.strictEqual(shipping.fee, 35000);
    assert.strictEqual(shipping.formattedFee, '35.000 ₫');
  });

  it('formats nested order coupon amounts and exchange rates', () => {
    const vnd = { code: 'VND', symbol: '₫', position: 'after', decimalPlaces: 0 };
    const usd = { code: 'USD', symbol: '$', position: 'before', decimalPlaces: 2 };
    const order = formatOrderFields({
      currencyCode: 'USD',
      baseCurrencyCode: 'VND',
      appliedCoupon: {
        couponCurrencyCode: 'USD',
        discountType: 'fixed',
        discountValue: 10,
        couponMinOrderAmount: 50,
        baseMinOrderAmount: 1250000,
        baseDiscountAmount: 250000,
        discountAmount: 250000,
      },
      exchangeRates: [{ rate: 0.000041 }],
    }, new Map([['VND', vnd], ['USD', usd]]), 'en');

    assert.strictEqual(order.appliedCoupon.discountValue, 10);
    assert.strictEqual(order.appliedCoupon.formattedDiscountValue, '$10.00');
    assert.strictEqual(order.appliedCoupon.formattedBaseDiscountAmount, '250,000 ₫');
    assert.strictEqual(order.exchangeRates[0].rate, 0.000041);
    assert.strictEqual(order.exchangeRates[0].formattedRate, '0.000041');
  });

  it('formats prices for products nested in coupons', () => {
    const vnd = { code: 'VND', symbol: '₫', position: 'after', decimalPlaces: 0 };
    const coupon = formatCouponFields({
      currencyCode: 'VND',
      applicableProducts: [{ name: 'Laptop', price: 1250000, baseCurrencyCode: 'VND' }],
    }, new Map([['VND', vnd]]), 'vi');

    assert.strictEqual(coupon.applicableProducts[0].price, 1250000);
    assert.strictEqual(coupon.applicableProducts[0].formattedPrice, '1.250.000 ₫');
  });
});
