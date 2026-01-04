/**
 * Payment Integration Controller
 * Xử lý thanh toán cho tất cả payment methods
 */

const asyncHandler = require('express-async-handler');
const PaymentService = require('../services/PaymentService');
const vnpayService = require('../services/vnpayService');
const Order = require('../models/Order');

/**
 * Create VNPay payment link
 * @route POST /api/payment/vnpay/create
 * @access Public
 */
const createVNPayPaymentLink = asyncHandler(async (req, res) => {
  const {
    orderId,
    amount,
    returnUrl,
    customerName,
    customerEmail,
    customerPhone,
    address,
    city,
    ward,
    orderInfo
  } = req.body;

  if (!orderId || !amount) {
    res.status(400);
    throw new Error('Missing required fields: orderId, amount');
  }

  // Get client IP address
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';

  const result = await PaymentService.processPayment({
    orderId,
    amount,
    paymentMethod: 'vnpay',
    returnUrl: returnUrl || 'http://localhost:3000/order-confirmation',
    customerInfo: {
      name: customerName || 'Customer',
      email: customerEmail || '',
      phone: customerPhone || '',
      address: address || '',
      city: city || '',
      ward: ward || ''
    },
    clientIp
  });

  if (result.success) {
    res.json({
      success: true,
      paymentUrl: result.paymentUrl,
      redirectUrl: result.paymentUrl
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error
    });
  }
});

/**
 * VNPay IPN endpoint
 * Nhận callback từ VNPay khi giao dịch hoàn tất
 * @route POST /api/payment/vnpay/ipn
 * @access Public
 */
const handleVNPayIPN = asyncHandler(async (req, res) => {
  const vnpayResponse = req.query || req.body;

  // Verify payment response
  const verifyResult = vnpayService.verifyResponse(vnpayResponse);

  if (!verifyResult.valid) {
    return res.status(400).json({
      code: 97,
      message: 'Invalid signature'
    });
  }

  // Process successful payment
  if (verifyResult.success && verifyResult.orderId) {
    try {
      const result = await PaymentService.verifyAndCompletePayment(verifyResult, verifyResult.orderId);

      if (result.success) {
        return res.json({
          code: 0,
          message: 'Success'
        });
      } else {
        return res.json({
          code: 99,
          message: result.error || 'Error processing payment'
        });
      }
    } catch (error) {
      console.error('Error processing VNPay IPN:', error);
      return res.json({
        code: 99,
        message: 'Error processing payment'
      });
    }
  }

  // Payment failed
  return res.json({
    code: 1,
    message: 'Payment failed'
  });
});

/**
 * VNPay return URL endpoint
 * Redirect từ VNPay sau khi thanh toán (user-facing)
 * @route GET /api/payment/vnpay/return
 * @access Public
 */
const handleVNPayReturn = asyncHandler(async (req, res) => {
  const vnpayResponse = req.query;

  // Verify payment response
  const verifyResult = vnpayService.verifyResponse(vnpayResponse);

  if (verifyResult.valid && verifyResult.success) {
    // Payment successful - redirect to confirmation page
    res.redirect(`/order-confirmation?orderId=${verifyResult.orderId}&status=success`);
  } else {
    // Payment failed or invalid
    res.redirect(`/order-confirmation?orderId=${verifyResult.orderId || 'unknown'}&status=failed`);
  }
});

/**
 * Get payment methods
 * @route GET /api/payment/methods
 * @access Public
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
  const paymentMethods = [
    {
      id: 'cod',
      name: 'Thanh toán khi nhận hàng',
      description: 'COD - Thanh toán tại nhà',
      shortName: 'COD',
      provider: 'Direct Payment',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/eBay_logo.svg/1200px-eBay_logo.svg.png',
      icon: '💵',
      badge: 'Phổ biến',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Bạn sẽ thanh toán cho người giao hàng khi nhận sản phẩm'
    },
    {
      id: 'vnpay',
      name: 'Thanh toán VNPay',
      description: 'VNPay - Thanh toán trực tuyến',
      shortName: 'VNPay',
      provider: 'VNPay',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Vnpay_logo.png/1200px-Vnpay_logo.png',
      icon: '💳',
      badge: 'An toàn',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Thanh toán qua ngân hàng, thẻ tín dụng hoặc ví điện tử'
    },
    {
      id: 'bank',
      name: 'Chuyển khoản ngân hàng',
      description: 'Chuyển khoản qua ngân hàng Việt Nam',
      shortName: 'Chuyển khoản',
      provider: 'Bank Transfer',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Agribank_logo.svg/1200px-Agribank_logo.svg.png',
      icon: '🏦',
      badge: 'An toàn',
      fee: 0,
      processingTime: '1-2 ngày',
      supported: false,
      details: 'Chuyển khoản đến tài khoản ngân hàng được cung cấp sau khi đặt hàng'
    },
    {
      id: 'card',
      name: 'Thanh toán bằng thẻ',
      description: 'Thẻ tín dụng / Thẻ ghi nợ',
      shortName: 'Thẻ',
      provider: 'Visa/Mastercard',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/1200px-Visa_Inc._logo.svg.png',
      icon: '💳',
      badge: 'Nhanh',
      fee: 0,
      processingTime: 'Tức thì',
      supported: true,
      details: 'Thanh toán an toàn bằng thẻ tín dụng hoặc thẻ ghi nợ'
    }
  ];

  res.json(paymentMethods);
});

/**
 * Create card payment
 * @route POST /api/payment/card/create
 * @access Public
 */
const createCardPayment = asyncHandler(async (req, res) => {
  const { orderId, amount, cardDetails } = req.body;

  if (!orderId || !amount || !cardDetails) {
    res.status(400);
    throw new Error('Missing required fields: orderId, amount, cardDetails');
  }

  // Validate card details
  const { cardNumber, cardholderName, expiryDate, cvv } = cardDetails;

  if (!cardNumber || !cardholderName || !expiryDate || !cvv) {
    res.status(400);
    throw new Error('Invalid card details provided');
  }

  const result = await PaymentService.processPayment({
    orderId,
    amount,
    paymentMethod: 'card'
  });

  if (result.success) {
    res.json({
      success: true,
      message: result.message,
      orderId: result.orderId,
      paymentMethod: 'card'
    });
  } else {
    res.status(400).json({
      success: false,
      message: result.error
    });
  }
});


module.exports = {
  createVNPayPaymentLink,
  handleVNPayIPN,
  handleVNPayReturn,
  getPaymentMethods,
  createCardPayment
};
