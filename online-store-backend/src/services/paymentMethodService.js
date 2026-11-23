const PaymentMethod = require('../models/PaymentMethod');
const paymentService = require('./paymentService');

const defaults = [
  {
    code: 'cod',
    name: 'Thanh toán khi nhận hàng (COD)',
    description: 'Khách thanh toán khi nhận đơn hàng.',
    isEnabled: true,
    isDeleted: false,
  },
  {
    code: 'vnpay',
    name: 'VNPay',
    description: 'Thanh toán trực tuyến qua cổng VNPay.',
    isEnabled: true,
    isDeleted: false,
  },
  {
    code: 'paypal',
    name: 'PayPal',
    description: 'Sandbox checkout with PayPal.',
    isEnabled: false,
    isDeleted: false,
  },
];

const ensurePaymentMethods = async () => {
  await PaymentMethod.bulkWrite(defaults.map(method => ({
    updateOne: {
      filter: { code: method.code },
      update: { $setOnInsert: method },
      upsert: true,
    },
  })));
};

const getPaymentMethod = code => PaymentMethod.findOne({ code }).lean();

const isPaymentMethodAvailable = async code => {
  if (!['cod', 'vnpay', 'paypal'].includes(code)) return false;
  if (code === 'vnpay') await paymentService.refreshVnpayAdapter();
  if (code === 'paypal') await paymentService.refreshPayPalAdapter();
  const method = await getPaymentMethod(code);
  const enabled = code === 'vnpay' ? paymentService.vnpayCheckoutEnabled
    : code === 'paypal' ? paymentService.paypalCheckoutEnabled : method?.isEnabled;
  return Boolean(method
    && enabled
    && !method.isDeleted
    && (code !== 'vnpay' || paymentService.isGatewaySupported('vnpay'))
    && (code !== 'paypal' || (method.isEnabled && paymentService.isGatewaySupported('paypal'))));
};

const listAvailablePaymentMethods = async () => {
  await Promise.all([paymentService.refreshVnpayAdapter(), paymentService.refreshPayPalAdapter()]);
  const methods = await PaymentMethod.find({ isDeleted: false }).sort({ code: 1 }).lean();
  return methods.filter(method => ['cod', 'vnpay', 'paypal'].includes(method.code)
    && (method.code === 'vnpay'
      ? paymentService.vnpayCheckoutEnabled && paymentService.isGatewaySupported('vnpay')
      : method.code === 'paypal'
        ? method.isEnabled && paymentService.paypalCheckoutEnabled && paymentService.isGatewaySupported('paypal')
        : method.isEnabled));
};

module.exports = {
  ensurePaymentMethods,
  listAvailablePaymentMethods,
  isPaymentMethodAvailable,
  getPaymentMethod,
};
