const Currency = require('../models/Currency');
const { formatCurrency } = require('./currencyFormatter');

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

const formatOrders = async (orders, lang) => {
  const currencies = await getCurrencyMetadata(orders.flatMap((order) => [order.currencyCode, order.baseCurrencyCode]));

  return orders.map((order) => {
    const data = order.toObject ? order.toObject() : order;
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

    return {
      ...formattedBaseOrder,
      orderItems: (data.orderItems || []).map((item) => formatAmountFields(item.toObject ? item.toObject() : item, currencies.get(data.currencyCode), lang, [
        ['price', 'formattedPrice'],
      ])),
    };
  });
};

const formatCoupons = async (coupons, lang) => {
  const currencies = await getCurrencyMetadata(coupons.map((coupon) => coupon.currencyCode));

  return coupons.map((coupon) => {
    const data = coupon.toObject ? coupon.toObject() : coupon;
    const fields = [['minOrderAmount', 'formattedMinOrderAmount']];
    if (data.discountType === 'fixed') fields.push(['discountValue', 'formattedDiscountValue']);
    return formatAmountFields(data, currencies.get(data.currencyCode), lang, fields);
  });
};

module.exports = {
  getCurrencyMetadata,
  formatAmountFields,
  formatProducts,
  formatOrders,
  formatCoupons,
};
