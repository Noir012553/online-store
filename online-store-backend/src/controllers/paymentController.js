/**
 * PaymentController - Xử lý payment requests
 * 
 * Endpoints:
 * - POST /api/payments/initiate - Tạo payment session
 * - GET /api/payments/gateways - Danh sách gateway hỗ trợ
 * - GET /api/payments/confirm/:orderId - Xác nhận thanh toán
 * - POST /api/payments/webhook/:gateway - Webhook callback từ gateway
 * - GET /api/payments/history/:orderId - Lịch sử thanh toán
 * - POST /api/payments/:paymentId/refund - Hoàn tiền
 */

const asyncHandler = require('express-async-handler');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { getClientIp } = require('../utils/getClientIp');
const { getMessage } = require('../i18n/messages');

const PAYMENT_MESSAGE_KEYS = {
  PAYMENT_GATEWAY_UNSUPPORTED: 'gateway_unsupported',
  PAYMENT_GATEWAY_CURRENCY_UNSUPPORTED: 'gateway_currency_unsupported',
  PAYMENT_INITIATION_FAILED: 'payment_initiation_failed',
  PAYMENT_WEBHOOK_SIGNATURE_MISSING: 'webhook_signature_missing',
  PAYMENT_WEBHOOK_INVALID: 'webhook_invalid',
  PAYMENT_WEBHOOK_PROCESSING_FAILED: 'webhook_processing_failed',
  PAYMENT_RECORD_NOT_FOUND: 'payment_record_not_found',
  PAYMENT_ORDER_NOT_FOUND: 'order_not_found',
  PAYMENT_RECONCILIATION_FAILED: 'payment_reconciliation_failed',
  PAYMENT_WEBHOOK_ALREADY_PROCESSED: 'webhook_already_processed',
  PAYMENT_WEBHOOK_PROCESSED: 'webhook_processed',
  PAYMENT_NOT_FOUND: 'payment_not_found',
  PAYMENT_SUCCESSFUL_RECORD_NOT_FOUND: 'successful_payment_not_found',
  PAYMENT_GATEWAY_ADAPTER_NOT_FOUND: 'gateway_adapter_not_found',
  PAYMENT_REFUND_FAILED: 'refund_failed',
  PAYMENT_REFUND_PROCESSED: 'refund_success',
  PAYMENT_CONFIRMATION_FAILED: 'payment_confirmation_failed',
};

const getPaymentMessage = (lang, code, params) => {
  const key = PAYMENT_MESSAGE_KEYS[code] || 'payment_failed';
  return getMessage(lang, `payment-messages.${key}`, params);
};

const createPaymentError = (result, lang) => {
  const error = new Error(getPaymentMessage(lang, result.code, result.params));
  error.code = result.code || 'PAYMENT_INITIATION_FAILED';
  error.params = result.params;
  return error;
};

/**
 * Tạo payment session
 * @route POST /api/payments/initiate
 * @access Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const {
    orderId,
    gateway,
    customerInfo = {},
  } = req.body;


  // Kiểm tra fields bắt buộc
  if (!orderId || !gateway) {
    const missingFields = [];
    if (!orderId) missingFields.push('orderId');
    if (!gateway) missingFields.push('gateway');
    res.status(400);
    throw new Error(getMessage(req.lang, 'payment-messages.missing_required_fields', { fields: missingFields.join(', ') }));
  }


  // Kiểm tra order tồn tại
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'payment-messages.order_not_found', { orderId }));
  }

  // Kiểm tra order chưa thanh toán
  if (order.isPaid) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'payment-messages.order_already_paid', { orderId }));
  }

  // Lấy IP từ Cloudflare Tunnel
  const clientIp = getClientIp(req);
  if (!clientIp || clientIp === '0.0.0.0') {
    res.status(400);
    throw new Error(getMessage(req.lang, 'payment-messages.cannot_determine_client_ip'));
  }

  // Tạo payment
  const result = await paymentService.initiatePayment(
    orderId,
    gateway,
    customerInfo,
    {
      clientIp,
      lang: req.lang,
      description: `Thanh toan don hang ${orderId}`,
    }
  );

  if (!result.success) {
    res.status(400);
    throw createPaymentError(result, req.lang);
  }

  return res.status(200).json({
    success: true,
    data: result.data,
  });
});

/**
 * Danh sách gateway thanh toán hỗ trợ
 * @route GET /api/payments/gateways
 * @access Public
 */
const getSupportedGateways = asyncHandler(async (req, res) => {
  const gateways = paymentService.getSupportedGateways();

  res.status(200).json({
    success: true,
    data: {
      gateways,
      count: gateways.length,
    },
  });
});

/**
 * Xác nhận thanh toán sau khi user redirect lại
 * @route GET /api/payments/confirm/:orderId
 * @access Private
 */
const confirmPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const result = await paymentService.confirmPayment(orderId);

  if (!result.success) {
    const code = result.code || 'PAYMENT_CONFIRMATION_FAILED';
    res.status(result.httpStatus || 500).json({
      success: false,
      code,
      params: result.params,
      message: getPaymentMessage(req.lang, code, result.params),
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: result.data,
  });
});

/**
 * Webhook callback từ payment gateway
 * VNPAY: POST /api/payments/webhook/vnpay?vnp_Amount=1000&vnp_ResponseCode=00&...
 * 
 * @route POST /api/payments/webhook/:gateway
 * @access Public (but needs signature verification)
 */
const handleWebhook = asyncHandler(async (req, res) => {
  const { gateway } = req.params;

  // Tùy theo gateway, dữ liệu có thể ở req.body hoặc req.query
  // VNPAY: GET request (query string) hoặc POST request (body)
  // MoMo: POST request (body)
  let webhookData = {};

  // Ưu tiên req.query (VNPAY thường gửi GET)
  if (Object.keys(req.query).length > 0) {
    // Ensure all query parameters are strings (not arrays)
    webhookData = Object.keys(req.query).reduce((acc, key) => {
      const value = req.query[key];
      acc[key] = Array.isArray(value) ? value[0] : value;
      return acc;
    }, {});
  }

  // Merge với body nếu có
  if (req.body && Object.keys(req.body).length > 0) {
    // Ensure all body parameters are strings (not arrays)
    const bodyData = Object.keys(req.body).reduce((acc, key) => {
      const value = req.body[key];
      acc[key] = Array.isArray(value) ? value[0] : value;
      return acc;
    }, {});
    webhookData = { ...webhookData, ...bodyData };
  }

  // Signature có thể ở query string hoặc header
  let signature = req.query.vnp_SecureHash ||
                  req.body?.vnp_SecureHash ||
                  req.headers['x-vnpay-signature'];

  // Ensure signature is string (Express may parse it as array if duplicate param)
  if (Array.isArray(signature)) {
    signature = signature[0];
  }

  if (!signature || signature === undefined) {
    // IMPORTANT: Trả về 200 để VNPAY biết webhook đã được nhận
    // Nếu trả về 4xx/5xx, VNPAY sẽ tiếp tục gửi lại webhook
    res.status(200).json({
      success: false,
      code: 'PAYMENT_WEBHOOK_SIGNATURE_MISSING',
      message: getPaymentMessage(req.lang, 'PAYMENT_WEBHOOK_SIGNATURE_MISSING'),
    });
    return;
  }

  // Lấy io instance từ app
  const io = req.app.get('io');

  // Xử lý webhook
  const result = await paymentService.handleWebhook(gateway, webhookData, signature, io);

  if (!result.success) {
    // Vẫn trả về 200 để gateway biết webhook đã được nhận
    // (tuy nhiên không xử lý được)
    const code = result.code || 'PAYMENT_WEBHOOK_PROCESSING_FAILED';
    res.status(200).json({
      success: false,
      code,
      params: result.params,
      message: getPaymentMessage(req.lang, code, result.params),
    });
    return;
  }

  // Webhook xử lý thành công
  console.log(`✅ Webhook processed: ${gateway} - Order ${result.orderId} - ${result.transactionStatus}`);

  res.status(200).json({
    success: true,
    code: 'PAYMENT_WEBHOOK_PROCESSED',
    message: getPaymentMessage(req.lang, 'PAYMENT_WEBHOOK_PROCESSED'),
    orderId: result.orderId,
  });
});

/**
 * Lịch sử thanh toán của một order
 * @route GET /api/payments/history/:orderId
 * @access Private
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const result = await paymentService.getPaymentHistory(orderId);

  if (!result.success) {
    res.status(400);
    throw createPaymentError(result, req.lang);
  }

  res.status(200).json({
    success: true,
    data: result.data,
  });
});

/**
 * Hoàn tiền
 * @route POST /api/payments/:paymentId/refund
 * @access Private (admin only)
 */
const refundPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;

  // Tìm payment
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    res.status(404);
    const error = new Error(getPaymentMessage(req.lang, 'PAYMENT_NOT_FOUND'));
    error.code = 'PAYMENT_NOT_FOUND';
    throw error;
  }

  // Hoàn tiền
  const result = await paymentService.refundPayment(payment.orderId, reason);

  if (!result.success) {
    res.status(400);
    throw createPaymentError(result, req.lang);
  }

  res.status(200).json({
    success: true,
    code: 'PAYMENT_REFUND_PROCESSED',
    message: getPaymentMessage(req.lang, 'PAYMENT_REFUND_PROCESSED'),
    data: {
      refundId: result.refundId,
      orderId: payment.orderId,
    },
  });
});

/**
 * Get payment details
 * @route GET /api/payments/:paymentId
 * @access Private
 */
const getPaymentDetails = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findById(paymentId).lean();
  if (!payment) {
    res.status(404);
    const error = new Error(getPaymentMessage(req.lang, 'PAYMENT_NOT_FOUND'));
    error.code = 'PAYMENT_NOT_FOUND';
    throw error;
  }

  res.status(200).json({
    success: true,
    data: payment,
  });
});

/**
 * Get all payments (admin only)
 * @route GET /api/payments
 * @access Private (admin only)
 */
const getAllPayments = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    gateway,
    status,
    orderId,
  } = req.query;

  const filter = {};
  if (gateway) filter.gateway = gateway.toLowerCase();
  if (status) filter.status = status.toLowerCase();
  if (orderId) filter.orderId = orderId;

  const skip = (page - 1) * limit;

  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Payment.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: payments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

module.exports = {
  initiatePayment,
  getSupportedGateways,
  confirmPayment,
  handleWebhook,
  getPaymentHistory,
  refundPayment,
  getPaymentDetails,
  getAllPayments,
};
