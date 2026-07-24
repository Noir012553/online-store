/**
 * Payment Routes
 *
 * Endpoints:
 * POST   /api/payments/initiate          - Tạo payment session
 * GET    /api/payments/gateways          - Danh sách gateway
 * GET    /api/payments/debug             - Debug status (dev only)
 * GET    /api/payments/confirm/:orderId  - Xác nhận thanh toán
 * POST   /api/payments/webhook/:gateway  - Webhook callback
 * GET    /api/payments/history/:orderId  - Lịch sử thanh toán
 * GET    /api/payments/:paymentId        - Chi tiết payment
 * POST   /api/payments/:paymentId/refund - Hoàn tiền
 * GET    /api/payments                   - Danh sách tất cả payments (admin)
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const asyncHandler = require('express-async-handler');
const paymentService = require('../services/paymentService');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiatePaymentLimiter } = require('../middleware/rateLimitMiddleware');
const { protect, admin } = require('../middleware/authMiddleware');
const { getMessage } = require('../i18n/messages');

const getPaymentLanguage = (req) => req.lang;

// Webhook endpoint - không cần auth (nhưng verify signature)
// PHẢI để trước các route khác để tránh conflict
// QUAN TRỌNG: Chấp nhận cả GET và POST vì VNPAY gửi GET request callback
router.all('/webhook/:gateway', paymentController.handleWebhook);

// ⚠️ VNPAY Callback Alias - Nếu VNPAY Dashboard cấu hình URL khác
// VD: https://backend.manln.online/vnpay-api/webhook/vnpay
// Forward tới /api/payments/webhook/vnpay
router.all('/vnpay-api/webhook/:gateway', paymentController.handleWebhook);

// Public endpoint
router.get('/gateways', paymentController.getSupportedGateways);

const requireDevelopment = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  return res.status(404).json({
    success: false,
    code: 'PAYMENT_DEBUG_DISABLED',
    message: getMessage(getPaymentLanguage(req), 'errors.page_not_found'),
  });
};

router.use('/debug', protect, admin, requireDevelopment);

// Debug endpoint (chỉ cho development)
router.get('/debug/status', asyncHandler(async (req, res) => {
  const paymentLang = getPaymentLanguage(req);
  const supportedGateways = paymentService.getSupportedGateways();
  const environmentVariables = {
    VNPAY_TMN_CODE: Boolean(process.env.VNPAY_TMN_CODE),
    VNPAY_HASH_SECRET: Boolean(process.env.VNPAY_HASH_SECRET),
    VNPAY_ENDPOINT: Boolean(process.env.VNPAY_ENDPOINT),
    VNPAY_RETURN_URL: Boolean(process.env.VNPAY_RETURN_URL),
    VNPAY_CALLBACK_URL: Boolean(process.env.VNPAY_CALLBACK_URL),
  };

  res.status(200).json({
    success: true,
    code: 'PAYMENT_DEBUG_STATUS',
    data: {
      supportedGateways,
      gatewayCount: supportedGateways.length,
      environmentVariables,
      configured: supportedGateways.length > 0,
    }
  });
}));

// Debug endpoint: Complete flow test - Create payment + webhook for specific order
router.post('/debug/test-complete-flow', asyncHandler(async (req, res) => {
  const paymentLang = getPaymentLanguage(req);

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_DEBUG_DISABLED',
      message: getMessage(paymentLang, 'payment.devModeOnly')
    });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_ORDER_ID_REQUIRED',
      message: getMessage(paymentLang, 'payment.missingOrderId')
    });
  }

  try {
    // Step 1: Create payment session
    const paymentResult = await paymentService.initiatePayment(
      orderId,
      'vnpay',
      28556000, // Amount for this order
      {},
      {
        clientIp: '127.0.0.1',
        description: `Test payment for order ${orderId}`,
      }
    );

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_DEBUG_CREATE_FAILED',
        message: getMessage(paymentLang, 'errors.generic_error'),
      });
    }

    const paymentId = paymentResult.data.paymentId;
    const requestData = paymentResult.data.requestData;

    // Step 2: Create webhook payload
    const vnpayAdapter = paymentService.adapters['vnpay'];

    const createDate = new Date();
    const year = createDate.getFullYear();
    const month = String(createDate.getMonth() + 1).padStart(2, '0');
    const day = String(createDate.getDate()).padStart(2, '0');
    const hours = String(createDate.getHours()).padStart(2, '0');
    const minutes = String(createDate.getMinutes()).padStart(2, '0');
    const seconds = String(createDate.getSeconds()).padStart(2, '0');
    const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

    const amountForVnpay = Math.round(28556000 * 100);

    const testPayload = {
      vnp_Amount: String(amountForVnpay),
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: 'TEST-' + Date.now(),
      vnp_CardType: 'ATM',
      vnp_Command: 'pay',
      vnp_CreateDate: vnpCreateDate,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: requestData.vnp_OrderInfo,
      vnp_OrderType: '190000',
      vnp_PayDate: vnpCreateDate,
      vnp_ResponseCode: '00', // Success
      vnp_TmnCode: process.env.VNPAY_TMN_CODE,
      vnp_TransactionNo: 'TEST-' + Date.now(),
      vnp_TxnRef: requestData.vnp_TxnRef, // Use same TxnRef from payment
      vnp_Version: '2.1.0',
    };

    // Calculate signature
    const sortedData = Object.keys(testPayload)
      .sort()
      .reduce((acc, key) => {
        acc[key] = testPayload[key];
        return acc;
      }, {});

    const signatureData = Object.keys(sortedData)
      .map(key => `${key}=${String(sortedData[key])}`)
      .join('&');

    const crypto = require('crypto');
    const secretKey = process.env.VNPAY_HASH_SECRET.trim();
    const signature = crypto.createHmac('sha512', secretKey)
      .update(signatureData)
      .digest('hex');

    const finalPayload = {
      ...testPayload,
      vnp_SecureHash: signature,
    };

    // Step 3: Send webhook
    const axios = require('axios');
    const backendUrl = `http://localhost:${process.env.PORT || 5000}`;
    const webhookUrl = `${backendUrl}/api/payments/webhook/vnpay`;

    const webhookResponse = await axios.post(webhookUrl, finalPayload, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    // Step 4: Verify payment was updated
    if (webhookResponse.data.success) {
      const Payment = require('../models/Payment');
      const updatedPayment = await Payment.findById(paymentId);
    }

    res.status(200).json({
      success: webhookResponse.data.success,
      code: 'PAYMENT_DEBUG_FLOW_COMPLETED',
      data: {
        orderId,
        paymentId,
        webhookSucceeded: Boolean(webhookResponse.data.success),
      }
    });

  } catch (error) {
    console.error('[PAYMENT_DEBUG_COMPLETE_FLOW_ERROR]', error);
    res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_FLOW_FAILED',
      message: getMessage(paymentLang, 'errors.generic_error'),
    });
  }
}));

// Debug endpoint: Test VNPAY configuration
router.get('/debug/vnpay-config', asyncHandler(async (req, res) => {
  const paymentLang = getPaymentLanguage(req);

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_DEBUG_DISABLED',
      message: getMessage(paymentLang, 'payment.devModeOnly')
    });
  }

  res.status(200).json({
    success: true,
    code: 'PAYMENT_DEBUG_CONFIG_STATUS',
    data: {
      terminalCodeConfigured: Boolean(process.env.VNPAY_TMN_CODE),
      hashSecretConfigured: Boolean(process.env.VNPAY_HASH_SECRET),
      endpointConfigured: Boolean(process.env.VNPAY_ENDPOINT),
      returnUrlConfigured: Boolean(process.env.VNPAY_RETURN_URL),
      callbackUrlConfigured: Boolean(process.env.VNPAY_CALLBACK_URL),
    },
  });
}));

// Debug endpoint: Test VNPAY signature calculation WITHOUT needing a real order
router.post('/debug/test-signature', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    const paymentLang = getPaymentLanguage(req);
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_DEBUG_DISABLED',
      message: getMessage(paymentLang, 'payment.devModeOnly')
    });
  }

  const { orderId, amount = 1000000 } = req.body;

  // Nếu không provide orderId, lấy từ list orders chưa thanh toán
  let testOrderId = orderId;

  if (!testOrderId) {
    const unpaidOrder = await Order.findOne({ isPaid: false, isDeleted: false })
      .select('_id totalPrice')
      .lean();

    if (!unpaidOrder) {
      // Tạo test order nếu cần
      const testProduct = await Product.findOne().select('_id name price').lean();
      if (testProduct) {
        const testOrder = new Order({
          orderItems: [
            {
              name: testProduct.name || 'Test Product',
              qty: 1,
              image: testProduct.image || '',
              price: testProduct.price,
              product: testProduct._id,
            }
          ],
          itemsPrice: testProduct.price,
          taxPrice: 0,
          totalPrice: testProduct.price,
          isPaid: false,
          paymentMethod: 'card',
          shippingAddress: {
            name: 'Test Customer',
            phone: '0912345678',
            address: 'Test Address',
          },
        });

        await testOrder.save();
        testOrderId = testOrder._id.toString();
      } else {
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_DEBUG_PRODUCTS_UNAVAILABLE',
          message: getMessage(getPaymentLanguage(req), 'errors.generic_error'),
        });
      }
    } else {
      testOrderId = unpaidOrder._id.toString();
    }
  }

  try {
    const result = await paymentService.initiatePayment(
      testOrderId,
      'vnpay',
      amount,
      {},
      {
        clientIp: req.ip || '127.0.0.1',
        description: 'Test payment - DEBUG',
      }
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        code: 'PAYMENT_DEBUG_SIGNATURE_COMPLETED',
        data: {
          paymentId: result.data.paymentId,
          redirectUrl: result.data.redirectUrl,
          orderId: testOrderId,
        }
      });
    } else {
      res.status(400).json({
        success: false,
        code: 'PAYMENT_DEBUG_SIGNATURE_FAILED',
        message: getMessage(getPaymentLanguage(req), 'errors.generic_error'),
      });
    }
  } catch (error) {
    console.error('[PAYMENT_DEBUG_SIGNATURE_ERROR]', error);
    res.status(500).json({
      success: false,
      code: 'PAYMENT_DEBUG_SIGNATURE_FAILED',
      message: getMessage(getPaymentLanguage(req), 'errors.generic_error'),
    });
  }
}));

// Test helper: Test VNPAY webhook with proper signature
router.post('/debug/test-webhook', asyncHandler(async (req, res) => {
  const paymentLang = getPaymentLanguage(req);

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_DEBUG_DISABLED',
      message: getMessage(paymentLang, 'payment.devModeOnly')
    });
  }

  // Lấy order chưa thanh toán gần đây
  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice')
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (orders.length === 0) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_UNPAID_ORDER_NOT_FOUND',
      message: getMessage(paymentLang, 'errors.generic_error'),
    });
  }

  const order = orders[0];
  const orderId = order._id.toString();
  const amount = order.totalPrice;

  const vnpayAdapter = paymentService.adapters['vnpay'];
  if (!vnpayAdapter) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_GATEWAY_UNAVAILABLE',
      message: getMessage(paymentLang, 'payment.gateway_adapter_not_found'),
    });
  }

  // Tạo test payload
  const createDate = new Date();
  const year = createDate.getFullYear();
  const month = String(createDate.getMonth() + 1).padStart(2, '0');
  const day = String(createDate.getDate()).padStart(2, '0');
  const hours = String(createDate.getHours()).padStart(2, '0');
  const minutes = String(createDate.getMinutes()).padStart(2, '0');
  const seconds = String(createDate.getSeconds()).padStart(2, '0');
  const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const txnRef = `${orderId}-${Date.now()}`;
  const amountForVnpay = Math.round(amount * 100);

  const testPayload = {
    vnp_Amount: String(amountForVnpay),
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: 'TEST12345678',
    vnp_CardType: 'ATM',
    vnp_Command: 'pay',
    vnp_CreateDate: vnpCreateDate,
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanhtoandonhang${orderId}`,
    vnp_OrderType: '190000',
    vnp_PayDate: vnpCreateDate,
    vnp_ResponseCode: '00',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: 'TEST-' + Date.now(),
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };

  // Sắp xếp và tính signature
  const sortedData = Object.keys(testPayload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = testPayload[key];
      return acc;
    }, {});

  const signatureData = Object.keys(sortedData)
    .map(key => `${key}=${String(sortedData[key])}`)
    .join('&');

  const crypto = require('crypto');
  const secretKey = process.env.VNPAY_HASH_SECRET.trim();
  const signature = crypto.createHmac('sha512', secretKey)
    .update(signatureData)
    .digest('hex');

  const finalPayload = {
    ...testPayload,
    vnp_SecureHash: signature,
  };

  // Send webhook to itself
  try {
    const axios = require('axios');
    const backendUrl = `http://localhost:${process.env.PORT || 5000}`;
    const webhookUrl = `${backendUrl}/api/payments/webhook/vnpay`;

    const webhookResponse = await axios.post(webhookUrl, finalPayload, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    res.status(200).json({
      success: true,
      code: 'PAYMENT_DEBUG_WEBHOOK_COMPLETED',
      data: {
        orderId,
        webhookSucceeded: Boolean(webhookResponse.data.success),
      }
    });
  } catch (error) {
    console.error('[PAYMENT_DEBUG_WEBHOOK_ERROR]', error);
    res.status(500).json({
      success: false,
      code: 'PAYMENT_DEBUG_WEBHOOK_FAILED',
      message: getMessage(paymentLang, 'errors.generic_error'),
    });
  }
}));

// Test helper: Simulate VNPAY webhook callback (get URL instead of POST)
router.get('/debug/simulate-webhook', asyncHandler(async (req, res) => {
  const paymentLang = getPaymentLanguage(req);

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_DEBUG_DISABLED',
      message: getMessage(paymentLang, 'payment.devModeOnly')
    });
  }

  // Lấy payment hoàn thành gần đây (hoặc tạo test order mới)
  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice')
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (orders.length === 0) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_UNPAID_ORDER_NOT_FOUND',
      message: getMessage(paymentLang, 'errors.generic_error'),
    });
  }

  const order = orders[0];
  const orderId = order._id.toString();
  const amount = order.totalPrice;

  // Tạo VNPAY payload tương tự như callback từ VNPAY
  // Tính toán signature
  const vnpayAdapter = paymentService.adapters['vnpay'];
  if (!vnpayAdapter) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_GATEWAY_UNAVAILABLE',
      message: getMessage(paymentLang, 'payment.gateway_adapter_not_found'),
    });
  }

  // Tạo test data (giả lập VNPAY callback)
  const createDate = new Date();
  const year = createDate.getFullYear();
  const month = String(createDate.getMonth() + 1).padStart(2, '0');
  const day = String(createDate.getDate()).padStart(2, '0');
  const hours = String(createDate.getHours()).padStart(2, '0');
  const minutes = String(createDate.getMinutes()).padStart(2, '0');
  const seconds = String(createDate.getSeconds()).padStart(2, '0');
  const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const txnRef = `${orderId}-${Date.now()}`;
  const amountForVnpay = Math.round(amount * 100); // VNPAY format

  // Payload giống như VNPAY sẽ gửi
  const testPayload = {
    vnp_Amount: amountForVnpay.toString(),
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: '12345678',
    vnp_CardType: 'ATM',
    vnp_Command: 'pay',
    vnp_CreateDate: vnpCreateDate,
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Payment for order ${orderId}`,
    vnp_OrderType: '190000',
    vnp_PayDate: vnpCreateDate,
    vnp_ResponseCode: '00', // Success
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: '12345678',
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };

  // Sắp xếp theo alphabet để tính signature
  const sortedData = Object.keys(testPayload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = testPayload[key];
      return acc;
    }, {});

  // Tính signature bằng cách tương tự như VNPAY
  const signatureString = Object.keys(sortedData)
    .map(key => `${key}=${sortedData[key]}`)
    .join('&');

  const crypto = require('crypto');
  const secretKey = process.env.VNPAY_HASH_SECRET.trim();
  const signature = crypto.createHmac('sha512', secretKey)
    .update(signatureString)
    .digest('hex');

  const finalPayload = {
    ...testPayload,
    vnp_SecureHash: signature,
  };


  res.status(200).json({
    success: true,
    code: 'PAYMENT_DEBUG_WEBHOOK_PAYLOAD_CREATED',
    data: {
      orderId,
      amount,
    },
  });
}));

// Test helper: Lấy danh sách order chưa thanh toán
router.get('/debug/orders', asyncHandler(async (req, res) => {
  const { limit = 10, page = 1 } = req.query;
  const skip = (page - 1) * limit;

  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice orderItems createdAt paymentMethod')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Order.countDocuments({ isPaid: false, isDeleted: false });

  res.status(200).json({
    success: true,
    data: {
      orders: orders.map(order => ({
        orderId: order._id.toString(),
        totalPrice: order.totalPrice,
        itemCount: order.orderItems?.length || 0,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    },
  });
}));

// Test helper: Tạo test order
router.post('/debug/create-test-order', asyncHandler(async (req, res) => {
  const { amount = 5000000, itemCount = 1 } = req.body;

  // Lấy product đầu tiên từ DB
  let product = await Product.findOne().lean();

  if (!product) {
    return res.status(400).json({
      success: false,
      code: 'PAYMENT_DEBUG_PRODUCTS_UNAVAILABLE',
      message: getMessage(getPaymentLanguage(req), 'errors.generic_error'),
    });
  }

  // Tạo test order
  const testOrder = new Order({
    orderItems: [
      {
        name: product.name || 'Test Product',
        qty: itemCount,
        image: product.image || '',
        price: Math.floor(amount / itemCount),
        product: product._id,
      }
    ],
    itemsPrice: amount,
    taxPrice: 0,
    totalPrice: amount,
    isPaid: false,
    paymentMethod: 'card',
    shippingAddress: {
      name: 'Test Customer',
      phone: '0912345678',
      address: 'Test Address',
    },
  });

  await testOrder.save();

  res.status(201).json({
    success: true,
    data: {
      orderId: testOrder._id.toString(),
      orderItem: testOrder.orderItems[0],
      totalPrice: testOrder.totalPrice,
      isPaid: testOrder.isPaid,
    }
  });
}));

// Private endpoints (cần auth)
// Rate limited: 10 payment initiations per hour per user
router.post('/initiate', protect, initiatePaymentLimiter, paymentController.initiatePayment);
router.post('/create', protect, initiatePaymentLimiter, paymentController.initiatePayment); // Alias for /initiate
router.get('/confirm/:orderId', protect, paymentController.confirmPayment);
router.get('/history/:orderId', protect, paymentController.getPaymentHistory);
router.get('/:paymentId', protect, paymentController.getPaymentDetails);
router.post('/:paymentId/refund', protect, admin, paymentController.refundPayment);

// Admin endpoints
router.get('/', protect, admin, paymentController.getAllPayments);

module.exports = router;
