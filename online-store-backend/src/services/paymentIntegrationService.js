/**
 * Payment Integration Service (Deprecated - use PaymentService and ShippingService instead)
 * Kept for backward compatibility
 */

const PaymentService = require('./PaymentService');
const ShippingService = require('./ShippingService');
const vnpayService = require('./vnpayService');

/**
 * Get shipping options with real GHN fees
 * Delegates to ShippingService
 */
const getShippingOptionsWithFee = async (toDistrictId, toWardCode, weight = 1000) => {
  return ShippingService.getShippingOptionsWithFee(toDistrictId, toWardCode, weight);
};

/**
 * Create payment link for VNPay
 * Delegates to PaymentService
 */
const createPaymentLink = async (params) => {
  return PaymentService.processPayment({
    orderId: params.orderId,
    amount: params.amount,
    paymentMethod: 'vnpay',
    returnUrl: params.returnUrl,
    customerInfo: {
      name: params.customerName,
      email: params.customerEmail,
      phone: params.customerPhone,
      address: params.address,
      city: params.city,
      ward: params.ward
    },
    clientIp: params.clientIp
  });
};

/**
 * Create shipping order after payment success
 * Delegates to ShippingService
 */
const createShippingOrder = async (orderData, paymentMethod = 'cod') => {
  return ShippingService.createShippingOrder(orderData);
};

/**
 * Verify payment response from VNPay IPN/Return URL
 */
const verifyPaymentResponse = (queryData) => {
  const result = vnpayService.verifyResponse(queryData);
  return result;
};


module.exports = {
  getShippingOptionsWithFee,
  createPaymentLink,
  createShippingOrder,
  verifyPaymentResponse
};
