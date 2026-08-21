const assert = require('assert');
const { formatCurrency, formatExchangeRate } = require('../utils/currencyFormatter');
const { broadcastPaymentSuccess } = require('../socket/socketHandler');
const languageMiddleware = require('../middleware/languageMiddleware');
const {
  formatAmountFields,
  formatPaymentFields,
  formatOrderFields,
  toCheckoutSummary,
  formatCouponFields,
} = require('../utils/currencyResponseFormatter');

describe('currencyFormatter', () => {
  it('preserves supported regional locales while keeping the language code for translations', () => {
    const request = {
      query: { lang: 'fr-CA' },
      body: {},
      headers: {},
    };

    languageMiddleware(request, {}, () => {});

    assert.strictEqual(request.lang, 'fr');
    assert.strictEqual(request.locale, 'fr-CA');
  });

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
      orderItems: [{ price: 12.5, originalPrice: 15, discountPercentage: 17, qty: 2 }],
    }, new Map([['VND', vnd], ['USD', usd]]), 'en');

    assert.strictEqual(order.appliedCoupon.discountValue, 10);
    assert.strictEqual(order.appliedCoupon.formattedDiscountValue, '$10.00');
    assert.strictEqual(order.appliedCoupon.formattedBaseDiscountAmount, '250,000 ₫');
    assert.strictEqual(order.exchangeRates[0].rate, 0.000041);
    assert.strictEqual(order.exchangeRates[0].formattedRate, '0.000041');
    assert.strictEqual(order.orderItems[0].lineTotal, 25);
    assert.strictEqual(order.orderItems[0].formattedOriginalPrice, '$15.00');
    assert.strictEqual(order.orderItems[0].discountPercentage, 17);
    assert.strictEqual(order.orderItems[0].formattedLineTotal, '$25.00');
  });

  it('returns only display contract fields for checkout summary', () => {
    const summary = toCheckoutSummary({
      currencyCode: 'USD',
      itemsPrice: 100,
      formattedItemsPrice: '$100.00',
      discount: 10,
      formattedDiscount: '$10.00',
      taxPrice: 0,
      formattedTaxPrice: '$0.00',
      shippingFee: 5,
      formattedShippingFee: '$5.00',
      totalPrice: 95,
      formattedTotalPrice: '$95.00',
      baseTotalPrice: 2375000,
      exchangeRates: [{ rate: 0.00004 }],
      appliedCoupon: { code: 'SAVE10' },
      orderItems: [{ product: 'product-1', formattedPrice: '$100.00', formattedLineTotal: '$100.00' }],
    });

    assert.deepStrictEqual(summary, {
      currencyCode: 'USD',
      itemsPrice: 100,
      formattedItemsPrice: '$100.00',
      discount: 10,
      formattedDiscount: '$10.00',
      taxPrice: 0,
      formattedTaxPrice: '$0.00',
      shippingFee: 5,
      formattedShippingFee: '$5.00',
      totalPrice: 95,
      formattedTotalPrice: '$95.00',
      appliedCoupon: { code: 'SAVE10' },
      orderItems: [{ product: 'product-1', formattedPrice: '$100.00', formattedLineTotal: '$100.00' }],
    });
  });

  it('formats prices for products nested in coupons', () => {
    const vnd = { code: 'VND', symbol: '₫', position: 'after', decimalPlaces: 0 };
    const coupon = formatCouponFields({
      currencyCode: 'VND',
      minOrderAmount: 1000000,
      applicableProducts: [{ name: 'Laptop', price: 1250000, baseCurrencyCode: 'VND' }],
    }, new Map([['VND', vnd]]), 'vi');

    assert.strictEqual(coupon.minOrderAmount, 1000000);
    assert.strictEqual(coupon.formattedMinOrderAmount, '1.000.000 ₫');
    assert.strictEqual(coupon.applicableProducts[0].price, 1250000);
    assert.strictEqual(coupon.applicableProducts[0].formattedPrice, '1.250.000 ₫');
  });

  it('broadcasts payment-success once to each audience as a refetch-only event with an ISO timestamp', () => {
    const events = [];
    const io = {
      to: () => ({ emit: (event, payload) => events.push({ audience: 'admin', event, payload }) }),
      except: () => ({ emit: (event, payload) => events.push({ audience: 'customer', event, payload }) }),
    };

    broadcastPaymentSuccess(io, {
      orderId: 'order-123',
      isPaid: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    assert.strictEqual(events.length, 2);
    assert.deepStrictEqual(events.map(({ audience }) => audience).sort(), ['admin', 'customer']);
    events.forEach(({ event, payload }) => {
      assert.strictEqual(event, 'payment-success');
      assert.deepStrictEqual(payload.data, {
        orderId: 'order-123',
        isPaid: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
