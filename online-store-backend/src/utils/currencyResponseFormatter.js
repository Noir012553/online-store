const Currency = require('../models/Currency');
const { formatCurrency, formatExchangeRate } = require('./currencyFormatter');
const { convertOrderAmount, getActiveExchangeRates } = require('./orderRevenue');

const getCurrencyMetadata = async (codes) => {
  const uniqueCodes = [...new Set(codes.filter(Boolean).map((code) => code.toUpperCase()))];
  const currencies = await Currency.find(
    { code: { $in: uniqueCodes } },
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
    const formattedProduct = formatAmountFields(data, currencies.get(data.baseCurrencyCode), lang, [
      ['price', 'formattedPrice'],
      ...(Number.isFinite(data.originalPrice) && data.originalPrice > data.price
        ? [['originalPrice', 'formattedOriginalPrice']]
        : []),
    ]);
    const discountPercentage = Number.isFinite(data.originalPrice) && data.originalPrice > data.price
      ? Math.round(((data.originalPrice - data.price) / data.originalPrice) * 100)
      : 0;

    return { ...formattedProduct, discountPercentage };
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
    orderItems: (data.orderItems || []).map((item) => {
      const orderItem = item.toObject ? item.toObject() : item;
      const lineTotal = orderItem.price * orderItem.qty;

      return formatAmountFields(
        Number.isFinite(lineTotal) ? { ...orderItem, lineTotal } : orderItem,
        currencies.get(data.currencyCode),
        lang,
        [
          ['price', 'formattedPrice'],
          ...(Number.isFinite(orderItem.originalPrice) && orderItem.originalPrice > orderItem.price
            ? [['originalPrice', 'formattedOriginalPrice']]
            : []),
          ['lineTotal', 'formattedLineTotal'],
        ]
      );
    }),
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

const toCheckoutSummary = (order) => ({
  currencyCode: order.currencyCode,
  itemsPrice: order.itemsPrice,
  formattedItemsPrice: order.formattedItemsPrice,
  discount: order.discount,
  formattedDiscount: order.formattedDiscount,
  taxPrice: order.taxPrice,
  formattedTaxPrice: order.formattedTaxPrice,
  shippingFee: order.shippingFee,
  formattedShippingFee: order.formattedShippingFee,
  totalPrice: order.totalPrice,
  formattedTotalPrice: order.formattedTotalPrice,
  ...(order.appliedCoupon && { appliedCoupon: order.appliedCoupon }),
  orderItems: order.orderItems,
});

const formatCheckoutSummary = async (summary, lang) => {
  const [formattedSummary] = await formatOrders([summary], lang);
  return toCheckoutSummary(formattedSummary);
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

const formatReportingOrders = async (orders, reportingCurrency, lang) => {
  const [formattedOrders, currencies, activeRates] = await Promise.all([
    formatOrders(orders, lang),
    getCurrencyMetadata([reportingCurrency]),
    getActiveExchangeRates(),
  ]);
  const currency = currencies.get(reportingCurrency);

  return formattedOrders.map((order) => {
    const convertAmount = (amount) => convertOrderAmount(
      amount,
      order.currencyCode,
      reportingCurrency,
      order.exchangeRates,
      activeRates
    );
    const displayOrder = formatAmountFields(
      {
        ...order,
        currencyCode: reportingCurrency,
        itemsPrice: convertAmount(order.itemsPrice),
        discount: convertAmount(order.discount),
        taxPrice: convertAmount(order.taxPrice),
        shippingFee: convertAmount(order.shippingFee),
        totalPrice: convertAmount(order.totalPrice),
        orderItems: order.orderItems.map((item) => {
          const price = convertAmount(item.price);
          const lineTotal = convertAmount(item.lineTotal);
          const originalPrice = Number.isFinite(item.originalPrice) && item.originalPrice > item.price
            ? convertAmount(item.originalPrice)
            : undefined;

          return formatAmountFields(
            { ...item, price, lineTotal, ...(originalPrice !== undefined && { originalPrice }) },
            currency,
            lang,
            [
              ['price', 'formattedPrice'],
              ...(originalPrice !== undefined ? [['originalPrice', 'formattedOriginalPrice']] : []),
              ['lineTotal', 'formattedLineTotal'],
            ]
          );
        }),
      },
      currency,
      lang,
      [
        ['itemsPrice', 'formattedItemsPrice'],
        ['discount', 'formattedDiscount'],
        ['taxPrice', 'formattedTaxPrice'],
        ['shippingFee', 'formattedShippingFee'],
        ['totalPrice', 'formattedTotalPrice'],
      ]
    );

    return { ...displayOrder, displayCurrencyCode: reportingCurrency };
  });
};

const formatCoupons = async (coupons, lang) => {
  const currencies = await getCurrencyMetadata(coupons.flatMap((coupon) => [
    coupon.currencyCode,
    ...(coupon.applicableProducts || []).map((product) => product.baseCurrencyCode),
  ]));

  return coupons.map((coupon) => formatCouponFields(coupon.toObject ? coupon.toObject() : coupon, currencies, lang));
};

const formatReportingCoupons = async (coupons, reportingCurrency, lang) => {
  if (!reportingCurrency) {
    return (await formatCoupons(coupons, lang)).map((coupon) => ({
      ...coupon,
      formattedDiscountLabel: coupon.discountType === 'percentage'
        ? `${coupon.discountValue}%`
        : coupon.formattedDiscountValue,
    }));
  }

  const [currencies, activeRates] = await Promise.all([
    getCurrencyMetadata([reportingCurrency]),
    getActiveExchangeRates(),
  ]);
  const currency = currencies.get(reportingCurrency);

  return coupons.map((coupon) => {
    const data = coupon.toObject ? coupon.toObject() : coupon;
    const displayMinOrderAmount = convertOrderAmount(
      data.minOrderAmount,
      data.currencyCode,
      reportingCurrency,
      data.exchangeRates,
      activeRates
    );
    const formattedCoupon = formatAmountFields(
      { ...data, displayMinOrderAmount },
      currency,
      lang,
      [['displayMinOrderAmount', 'formattedMinOrderAmount']]
    );

    if (data.discountType === 'percentage') {
      return {
        ...formattedCoupon,
        formattedDiscountLabel: `${data.discountValue}%`,
      };
    }

    const displayDiscountValue = convertOrderAmount(
      data.discountValue,
      data.currencyCode,
      reportingCurrency,
      data.exchangeRates,
      activeRates
    );
    const formattedDiscount = formatAmountFields(
      { ...formattedCoupon, displayDiscountValue },
      currency,
      lang,
      [['displayDiscountValue', 'formattedDiscountValue']]
    );

    return {
      ...formattedDiscount,
      formattedDiscountLabel: formattedDiscount.formattedDiscountValue,
    };
  });
};

module.exports = {
  getCurrencyMetadata,
  formatAmountFields,
  formatPaymentFields,
  formatPayments,
  formatProducts,
  formatOrderFields,
  formatOrders,
  toCheckoutSummary,
  formatCheckoutSummary,
  formatReportingOrders,
  formatCouponFields,
  formatCoupons,
  formatReportingCoupons,
};
