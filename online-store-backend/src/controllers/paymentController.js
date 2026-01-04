/**
 * Controller for payment methods
 * Provides payment options with provider information and logos
 * Only real integrations are returned
 */
const asyncHandler = require('express-async-handler');

/**
 * Get all payment methods
 * @route GET /api/payment-methods
 * @access Public
 * @returns Array of payment methods with logos and descriptions
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
  // Return only real integrated payment methods
  const paymentMethods = [
    {
      id: 'cod',
      name: 'Thanh toán khi nhận hàng',
      description: 'COD - Thanh toán tại nhà',
      shortName: 'COD',
      provider: 'Direct Payment',
      icon: '💵',
      badge: 'Phổ biến',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Bạn sẽ thanh toán cho người giao hàng khi nhận sản phẩm'
    },
    {
      id: 'vnpay',
      name: 'Thanh toán qua VNPay',
      description: 'Thanh toán trực tuyến',
      shortName: 'VNPay',
      provider: 'VNPay',
      icon: '🏦',
      badge: 'An toàn',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Thanh toán an toàn qua cổng VNPay'
    }
  ];

  res.json(paymentMethods);
});

/**
 * Get payment method by ID
 * @route GET /api/payment-methods/:id
 * @access Public
 */
const getPaymentMethodById = asyncHandler(async (req, res) => {
  const paymentMethods = [
    {
      id: 'cod',
      name: 'Thanh toán khi nhận hàng',
      description: 'COD - Thanh toán tại nhà',
      shortName: 'COD',
      provider: 'Direct Payment',
      icon: '💵',
      badge: 'Phổ biến',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Bạn sẽ thanh toán cho người giao hàng khi nhận sản phẩm'
    },
    {
      id: 'vnpay',
      name: 'Thanh toán qua VNPay',
      description: 'Thanh toán trực tuyến',
      shortName: 'VNPay',
      provider: 'VNPay',
      icon: '🏦',
      badge: 'An toàn',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Thanh toán an toàn qua cổng VNPay'
    }
  ];

  const method = paymentMethods.find(m => m.id === req.params.id);

  if (!method) {
    res.status(404);
    throw new Error('Payment method not found');
  }

  res.json(method);
});

module.exports = {
  getPaymentMethods,
  getPaymentMethodById
};
