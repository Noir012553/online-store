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
  if (!['cod', 'vnpay'].includes(code)) return false;
  const method = await getPaymentMethod(code);
  return Boolean(method
    && method.isEnabled
    && !method.isDeleted
    && (code !== 'vnpay' || paymentService.isGatewaySupported('vnpay')));
};

const listAvailablePaymentMethods = async () => {
  const methods = await PaymentMethod.find({ isEnabled: true, isDeleted: false }).sort({ code: 1 }).lean();
  return methods.filter(method => ['cod', 'vnpay'].includes(method.code)
    && (method.code !== 'vnpay' || paymentService.isGatewaySupported('vnpay')));
};

module.exports = {
  ensurePaymentMethods,
  listAvailablePaymentMethods,
  isPaymentMethodAvailable,
  getPaymentMethod,
};
