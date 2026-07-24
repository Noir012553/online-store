const Currency = require('../models/Currency');
const { formatCurrency, formatExchangeRate } = require('./currencyFormatter');

const getCurrencyMetadata = async (codes) => {
  const uniqueCodes = [...new Set(codes.filter(Boolean).map((code) => code.toUpperCase()))];
  const currencies = await Currency.find(
    { code: { $in: uniqueCodes }, isActive: true },
    { code: 1, symbol: 1, position: 1, decimalPlaces: 1, _id: 0 }
  ).lean();

  return new Map(currencies.map((currency) => [currency.code, currency]));
};

const formatAmountFields = (data, currency, lang, fields) => {
  if (!currency) return data;

  return fields.reduce((formattedData, [field, formattedField]) => {
    if (!Number.isFinite(formattedData[field])) return formattedData;

    return {
      ...formattedData,
      [formattedField]: formatCurrency(formattedData[field], currency, lang),
    };
  }, data);
};

const formatPaymentFields = (data, currencies, lang) => {
  const formattedPayment = formatAmountFields(data, currencies.get(data.currency), lang, [
    ['amount', 'formattedAmount'],
    ['paidAmount', 'formattedPaidAmount'],
    ['totalPrice', 'formattedTotalPrice'],
  ]);

  return formatAmountFields(formattedPayment, currencies.get(data.providerCurrency), lang, [
    ['providerAmount', 'formattedProviderAmount'],
  ]);
};

const formatPayments = async (payments, lang) => {
  const currencies = await getCurrencyMetadata(payments.flatMap((payment) => [payment.currency, payment.providerCurrency]));

  return payments.map((payment) => {
    const data = payment.toObject ? payment.toObject() : payment;
    return formatPaymentFields(data, currencies, lang);
  });
};

const formatProducts = async (products, lang) => {
  const currencies = await getCurrencyMetadata(products.map((product) => product.baseCurrencyCode));

  return products.map((product) => {
    const data = product.toObject ? product.toObject() : product;
    return formatAmountFields(data, currencies.get(data.baseCurrencyCode), lang, [
      ['price', 'formattedPrice'],
      ['originalPrice', 'formattedOriginalPrice'],
    ]);
  });
};

const formatOrderFields = (data, currencies, lang) => {
  const formattedOrder = formatAmountFields(data, currencies.get(data.currencyCode), lang, [
    ['itemsPrice', 'formattedItemsPrice'],
    ['discount', 'formattedDiscount'],
    ['taxPrice', 'formattedTaxPrice'],
    ['shippingFee', 'formattedShippingFee'],
    ['totalPrice', 'formattedTotalPrice'],
  ]);
  const formattedBaseOrder = formatAmountFields(formattedOrder, currencies.get(data.baseCurrencyCode), lang, [
    ['baseItemsPrice', 'formattedBaseItemsPrice'],
    ['baseDiscount', 'formattedBaseDiscount'],
    ['baseShippingFee', 'formattedBaseShippingFee'],
    ['baseTotalPrice', 'formattedBaseTotalPrice'],
  ]);
  const appliedCoupon = data.appliedCoupon && formatAmountFields(
    data.appliedCoupon,
    currencies.get(data.appliedCoupon.couponCurrencyCode),
    lang,
    [
      ['couponMinOrderAmount', 'formattedCouponMinOrderAmount'],
      ...(data.appliedCoupon.discountType === 'fixed' ? [['discountValue', 'formattedDiscountValue']] : []),
    ]
  );
  const formattedCoupon = appliedCoupon && formatAmountFields(appliedCoupon, currencies.get(data.baseCurrencyCode), lang, [
    ['baseMinOrderAmount', 'formattedBaseMinOrderAmount'],
    ['baseDiscountAmount', 'formattedBaseDiscountAmount'],
    ['discountAmount', 'formattedDiscountAmount'],
  ]);

  return {
    ...formattedBaseOrder,
    ...(formattedCoupon && { appliedCoupon: formattedCoupon }),
    exchangeRates: (data.exchangeRates || []).map((exchangeRate) => ({
      ...(exchangeRate.toObject ? exchangeRate.toObject() : exchangeRate),
      ...(Number.isFinite(exchangeRate.rate) && { formattedRate: formatExchangeRate(exchangeRate.rate, lang) }),
    })),
    orderItems: (data.orderItems || []).map((item) => formatAmountFields(item.toObject ? item.toObject() : item, currencies.get(data.currencyCode), lang, [
      ['price', 'formattedPrice'],
    ])),
  };
};

const formatOrders = async (orders, lang) => {
  const currencies = await getCurrencyMetadata(orders.flatMap((order) => [
    order.currencyCode,
    order.baseCurrencyCode,
    order.appliedCoupon?.couponCurrencyCode,
  ]));

  return orders.map((order) => formatOrderFields(order.toObject ? order.toObject() : order, currencies, lang));
};

const formatCouponFields = (data, currencies, lang) => {
  const fields = [['minOrderAmount', 'formattedMinOrderAmount']];
  if (data.discountType === 'fixed') fields.push(['discountValue', 'formattedDiscountValue']);
  const formattedCoupon = formatAmountFields(data, currencies.get(data.currencyCode), lang, fields);

  return {
    ...formattedCoupon,
    applicableProducts: (data.applicableProducts || []).map((product) => formatAmountFields(
      product.toObject ? product.toObject() : product,
      currencies.get(product.baseCurrencyCode),
      lang,
      [['price', 'formattedPrice']]
    )),
  };
};

const formatCoupons = async (coupons, lang) => {
  const currencies = await getCurrencyMetadata(coupons.flatMap((coupon) => [
    coupon.currencyCode,
    ...(coupon.applicableProducts || []).map((product) => product.baseCurrencyCode),
  ]));

  return coupons.map((coupon) => formatCouponFields(coupon.toObject ? coupon.toObject() : coupon, currencies, lang));
};

module.exports = {
  getCurrencyMetadata,
  formatAmountFields,
  formatPaymentFields,
  formatPayments,
  formatProducts,
  formatOrderFields,
  formatOrders,
  formatCouponFields,
  formatCoupons,
};
