/**
 * PaymentService - Service điều phối thanh toán
 * 
 * Chức năng:
 * 1. Quản lý các payment gateway adapters (VNPAY, MoMo, Stripe...)
 * 2. Tạo payment session
 * 3. Xử lý webhook callback
 * 4. Cập nhật trạng thái order
 * 5. Quản lý transaction history
 */

const Payment = require('../models/Payment');
const Order = require('../models/Order');
const PaymentMethod = require('../models/PaymentMethod');
const VnpayAdapter = require('../adapters/payment/VnpayAdapter');
const PayPalAdapter = require('../adapters/payment/PayPalAdapter');
const { loadVnpayRuntimeConfig } = require('./vnpayRuntimeConfigService');
const { loadPayPalRuntimeConfig } = require('./paypalRuntimeConfigService');
const { broadcastPaymentSuccess, broadcastOrderStatusUpdate } = require('../socket/socketHandler');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const { convertOrderAmount, getActiveExchangeRates } = require('../utils/orderRevenue');
const { sendOrderPaymentSuccessEmail } = require('./emailService');
const { markOrderPaid, releaseReservedOrderInventory } = require('./inventoryService');

const createPaymentFailure = (code, params = {}) => ({
  success: false,
  code,
  params,
});

class PaymentService {
  constructor() {
    this.adapters = {};
    this.vnpayCheckoutEnabled = false;
    this.paypalCheckoutEnabled = false;
    this.initializeAdapters();
  }

  /**
   * Khởi tạo tất cả payment gateway adapters
   */
  initializeAdapters() {
    try {
      // VNPAY Adapter
      const vnpayConfig = {
        partnerId: process.env.VNPAY_TMN_CODE,
        partnerKey: process.env.VNPAY_HASH_SECRET,
        endpoint: process.env.VNPAY_ENDPOINT || 'https://sandbox.vnpayment.vn/paygate',
        returnUrl: process.env.VNPAY_RETURN_URL,
        callbackUrl: process.env.VNPAY_CALLBACK_URL,
      };

      if (vnpayConfig.partnerId && vnpayConfig.partnerKey) {
        this.adapters['vnpay'] = new VnpayAdapter(vnpayConfig);
      }
    } catch (error) {
      console.error('[PaymentService.initializeAdapters] Error:', error.message);
    }
  }

  async refreshVnpayAdapter() {
    const { config, checkoutEnabled } = await loadVnpayRuntimeConfig();
    this.vnpayCheckoutEnabled = checkoutEnabled;
    const adapter = new VnpayAdapter(config);
    try {
      adapter.validateConfig();
      this.adapters.vnpay = adapter;
      return true;
    } catch {
      delete this.adapters.vnpay;
      return false;
    }
  }

  async refreshPayPalAdapter() {
    const [{ config, configured }, method] = await Promise.all([
      loadPayPalRuntimeConfig(),
      PaymentMethod.findOne({ code: 'paypal' }).select('isEnabled').lean(),
    ]);
    const adapter = new PayPalAdapter(config);
    try {
      adapter.validateConfig();
      this.adapters.paypal = adapter;
      this.paypalCheckoutEnabled = Boolean(configured && method?.isEnabled);
      return true;
    } catch {
      delete this.adapters.paypal;
      this.paypalCheckoutEnabled = false;
      return false;
    }
  }

  async capturePayPalOrder(orderId, paypalOrderId, io = null, lang) {
    try {
      await this.refreshPayPalAdapter();
      const adapter = this.adapters.paypal;
      if (!this.paypalCheckoutEnabled || !adapter || !orderId || !paypalOrderId) {
        return createPaymentFailure('PAYMENT_CAPTURE_FAILED');
      }
      const payment = await Payment.findOne({ orderId, gateway: 'paypal', gatewayOrderId: paypalOrderId })
        .sort({ createdAt: -1 });
      if (!payment || payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'expired') {
        return createPaymentFailure('PAYMENT_RECORD_NOT_FOUND');
      }
      if (payment.status === 'success') {
        return { success: true, data: { orderId: String(orderId), paymentStatus: 'success', isPaid: true } };
      }
      const order = await Order.findById(orderId);
      if (!order || order.paymentMethod !== 'paypal') return createPaymentFailure('PAYMENT_ORDER_NOT_FOUND');
      if (order.isPaid) return createPaymentFailure('PAYMENT_ORDER_ALREADY_PAID');

      const providerOrder = await adapter.getOrder(paypalOrderId);
      if (!providerOrder || providerOrder.id !== payment.gatewayOrderId
        || providerOrder.intent !== 'CAPTURE'
        || !['APPROVED', 'COMPLETED'].includes(providerOrder.status)
        || !providerOrder.purchase_units?.some(unit => unit.reference_id === String(orderId)
          && unit.custom_id === String(orderId))) {
        return createPaymentFailure('PAYMENT_RECONCILIATION_FAILED');
      }
      const capture = providerOrder.status === 'COMPLETED'
        ? providerOrder
        : await adapter.captureOrder(paypalOrderId, `capture-${payment._id}`);
      const captureDetails = this.getPayPalCaptureDetails(capture, payment, orderId);
      if (!captureDetails.valid) return createPaymentFailure('PAYMENT_RECONCILIATION_FAILED');
      return this.finalizePayPalPayment(payment, order, capture, captureDetails.capture, io, lang);
    } catch {
      return createPaymentFailure('PAYMENT_CAPTURE_FAILED');
    }
  }

  getPayPalCaptureDetails(response, payment, orderId) {
    const unit = response?.purchase_units?.find(item => item.reference_id === String(orderId)
      && item.custom_id === String(orderId));
    const capture = unit?.payments?.captures?.find(item => item.status === 'COMPLETED');
    const amount = Number(capture?.amount?.value);
    const currency = String(capture?.amount?.currency_code || '').toUpperCase();
    const valid = Boolean(response?.status === 'COMPLETED' && capture?.id
      && currency === payment.providerCurrency
      && amount === Number(payment.providerAmount));
    return { valid, capture, amount, currency };
  }

  async finalizePayPalPayment(payment, order, response, capture, io, lang, webhookData = null) {
    const paidResult = await markOrderPaid(order._id, 'paypal');
    const transition = await Payment.updateOne(
      { _id: payment._id, status: { $in: ['pending', 'processing'] } },
      { $set: {
        status: 'success',
        gatewayTransactionId: capture.id,
        transactionRef: capture.id,
        paidAt: new Date(),
        rawResponse: response,
        webhookData,
        webhookVerified: Boolean(webhookData),
        providerAmount: Number(capture.amount.value),
        providerCurrency: capture.amount.currency_code,
        metadata: { paypalStatus: response.status },
      } }
    );
    if (!transition.modifiedCount) {
      const current = await Payment.findById(payment._id).select('status').lean();
      if (current?.status !== 'success') return createPaymentFailure('PAYMENT_RECONCILIATION_FAILED');
      return { success: true, orderId: String(order._id), transactionStatus: 'success' };
    }

    const paidOrder = await Order.findById(order._id)
      .populate('customer', 'name email phone')
      .populate('user', 'name email');
    try { await sendOrderPaymentSuccessEmail(paidOrder, lang); } catch {}
    if (io) broadcastPaymentSuccess(io, {
      orderId: paidOrder._id.toString(),
      isPaid: paidOrder.isPaid,
      inventoryStatus: paidOrder.inventoryStatus,
      createdAt: paidOrder.createdAt.toISOString(),
    });
    return {
      success: true,
      orderId: String(order._id),
      transactionStatus: 'success',
      needsReview: paidResult.needsReview,
    };
  }

  async handlePayPalWebhook(headers, event, io = null, lang) {
    try {
      await this.refreshPayPalAdapter();
      const adapter = this.adapters.paypal;
      if (!adapter || !await adapter.verifyWebhook(headers, event)) {
        return createPaymentFailure('PAYMENT_WEBHOOK_INVALID');
      }
      if (event?.event_type === 'CHECKOUT.ORDER.APPROVED') {
        const paypalOrderId = event.resource?.id;
        const payment = await Payment.findOne({ gateway: 'paypal', gatewayOrderId: paypalOrderId });
        if (!payment) return { success: true, code: 'PAYMENT_WEBHOOK_IGNORED' };
        return this.capturePayPalOrder(payment.orderId, paypalOrderId, io, lang);
      }
      if (event?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const resource = event.resource || {};
        const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;
        const payment = paypalOrderId
          ? await Payment.findOne({ gateway: 'paypal', gatewayOrderId: paypalOrderId })
          : null;
        if (!payment) return { success: true, code: 'PAYMENT_WEBHOOK_IGNORED' };
        const order = await Order.findById(payment.orderId);
        if (!order) return createPaymentFailure('PAYMENT_ORDER_NOT_FOUND');
        const providerOrder = await adapter.getOrder(paypalOrderId);
        const unit = providerOrder?.purchase_units?.find(item => item.reference_id === String(order._id)
          && item.custom_id === String(order._id));
        const providerCapture = unit?.payments?.captures?.find(item => item.id === resource.id && item.status === 'COMPLETED');
        const details = this.getPayPalCaptureDetails({
          ...providerOrder,
          purchase_units: unit ? [{ ...unit, payments: { captures: providerCapture ? [providerCapture] : [] } }] : [],
        }, payment, order._id);
        if (providerOrder?.id !== payment.gatewayOrderId || providerOrder?.status !== 'COMPLETED'
          || !providerCapture || !details.valid) return createPaymentFailure('PAYMENT_RECONCILIATION_FAILED');
        return this.finalizePayPalPayment(payment, order, { ...providerOrder, webhookEventType: event.event_type }, resource, io, lang, event);
      }
      return { success: true, code: 'PAYMENT_WEBHOOK_IGNORED' };
    } catch {
      return createPaymentFailure('PAYMENT_WEBHOOK_PROCESSING_FAILED');
    }
  }


  /**
   * Tạo payment session
   * 
   * @param {String} orderId       - ID đơn hàng
   * @param {String} gateway       - Cổng thanh toán (vnpay, momo, etc.)
   * The amount and currency are always read from the persisted order.
   * @param {Object} customerInfo  - Thông tin khách hàng
   * @param {Object} options       - Tùy chọn thêm
   * 
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     data: {
   *       paymentId: String,      // ID Payment document
   *       redirectUrl: String,    // URL để redirect user
   *       ...
   *     },
   *     error?: String
   *   }
   */
  async initiatePayment(orderId, gateway, customerInfo = {}, options = {}) {
    try {
      const lang = (options.lang || getDefaultLanguage().code).toUpperCase();

      // Validate required fields - throw errors instead of returning failure
      if (!orderId) {
        throw new Error(getMessage(lang, 'checkout.error_missing_order_id'));
      }
      if (!gateway) {
        throw new Error(getMessage(lang, 'checkout.error_missing_gateway'));
      }
      // VNPay requires a client IP; PayPal Checkout does not use it.
      const normalizedGateway = gateway.toLowerCase();
      if (normalizedGateway !== 'paypal' && !options.clientIp) {
        throw new Error(getMessage(lang, 'checkout.error_missing_client_ip'));
      }

      // Kiểm tra gateway được support
      if (normalizedGateway === 'vnpay') await this.refreshVnpayAdapter();
      if (normalizedGateway === 'paypal') await this.refreshPayPalAdapter();
      const adapter = this.adapters[normalizedGateway];
      if (!adapter) {
        throw new Error(getMessage(lang, 'checkout.error_unsupported_gateway'));
      }
      const method = await PaymentMethod.findOne({ code: normalizedGateway }).lean();
      const enabled = normalizedGateway === 'vnpay' ? this.vnpayCheckoutEnabled
        : normalizedGateway === 'paypal' ? this.paypalCheckoutEnabled : method?.isEnabled;
      if (!enabled || !method || method.isDeleted) {
        const error = new Error('Selected payment method is unavailable.');
        error.code = 'PAYMENT_METHOD_UNAVAILABLE';
        throw error;
      }

      // Kiểm tra order tồn tại
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error(getMessage(lang, 'checkout.error_order_not_found'));
      }

      // Kiểm tra order chưa thanh toán
      if (order.isPaid) {
        throw new Error(getMessage(lang, 'checkout.error_order_already_paid'));
      }
      if (order.paymentMethod !== normalizedGateway) {
        const error = new Error('Selected payment method does not match the order.');
        error.code = 'PAYMENT_METHOD_UNAVAILABLE';
        throw error;
      }

      if (order.inventoryStatus === 'released' || order.inventoryStatus === 'needs_review') {
        throw new Error(getMessage(lang, 'checkout.error_order_not_found'));
      }
      if (order.inventoryStatus === 'reserved' && order.inventoryHoldExpiresAt <= new Date()) {
        await releaseReservedOrderInventory(order._id, new Date());
        throw new Error(getMessage(lang, 'checkout.error_order_not_found'));
      }

      const amount = Number(order.totalPrice);
      const currency = order.currencyCode;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(getMessage(lang, 'checkout.error_invalid_amount'));
      }

      const providerCurrency = normalizedGateway === 'paypal'
        ? (['USD', 'EUR', 'SEK'].includes(String(currency).toUpperCase()) ? String(currency).toUpperCase() : 'USD')
        : 'VND';
      const activeRates = await getActiveExchangeRates();
      const convertedAmount = convertOrderAmount(
        amount,
        currency,
        providerCurrency,
        order.exchangeRates || [],
        activeRates
      );
      const providerAmount = normalizedGateway === 'paypal'
        ? Math.round(convertedAmount * 100) / 100
        : Math.round(convertedAmount);
      if (!Number.isFinite(providerAmount) || providerAmount <= 0) {
        throw new Error(getMessage(lang, 'checkout.error_invalid_amount'));
      }
      if (!adapter.supportsCurrency(providerCurrency)) {
        const error = new Error('PAYMENT_GATEWAY_CURRENCY_UNSUPPORTED');
        error.code = 'PAYMENT_GATEWAY_CURRENCY_UNSUPPORTED';
        error.params = { gateway, currency: providerCurrency };
        throw error;
      }

      const payment = new Payment({
        orderId,
        gateway: gateway.toLowerCase(),
        amount,
        currency,
        providerAmount,
        providerCurrency,
        status: 'pending',
        callbackUrl: normalizedGateway === 'paypal' ? adapter.config.webhookUrl : options.callbackUrl,
      });

      await payment.save();

      // Gọi adapter để tạo link thanh toán
      const paymentResult = normalizedGateway === 'paypal'
        ? await adapter.createOrder({
          orderId,
          amount: providerAmount,
          currency: providerCurrency,
          description: options.description || `Payment for order ${orderId}`,
          lang: options.lang,
          requestId: `create-${payment._id}`,
        })
        : await adapter.createPaymentUrl({
          orderId,
          amount: providerAmount,
          currency: providerCurrency,
          description: options.description || `Payment for order ${orderId}`,
          customer: customerInfo,
          metadata: options.metadata || {},
          clientIp: options.clientIp || '127.0.0.1',
        });

      if (!paymentResult.success) {
        // Cập nhật Payment thành failed
        payment.status = 'failed';
        payment.failureReason = paymentResult.error;
        await payment.save();
        await releaseReservedOrderInventory(order._id);

        throw new Error(getMessage(lang, 'checkout.error_payment_url_creation'));
      }

      // Lưu request data vào Payment
      payment.rawRequest = normalizedGateway === 'paypal' ? { orderId: paymentResult.data.order.id } : paymentResult.data.requestData;
      payment.rawResponse = normalizedGateway === 'paypal' ? paymentResult.data.order : payment.rawResponse;
      payment.redirectUrl = normalizedGateway === 'paypal' ? paymentResult.data.approvalUrl : paymentResult.data.redirectUrl;
      payment.gatewayOrderId = normalizedGateway === 'paypal' ? paymentResult.data.orderId : payment.gatewayOrderId;
      payment.transactionRef = paymentResult.data.transactionRef;
      payment.providerAmount = providerAmount;
      await payment.save();

      return {
        success: true,
        data: {
          paymentId: payment._id.toString(),
          redirectUrl: normalizedGateway === 'paypal' ? paymentResult.data.approvalUrl : paymentResult.data.redirectUrl,
          gateway,
          amount,
          currency,
          providerAmount,
          providerCurrency,
          transactionRef: paymentResult.data.transactionRef || paymentResult.data.orderId,
          orderId,
        },
      };
    } catch (error) {
      console.error('[PaymentService.initiatePayment] Error:', error.message);
      return createPaymentFailure(error.code || 'PAYMENT_INITIATION_FAILED', error.params);
    }
  }

  /**
   * Xử lý webhook callback từ payment gateway
   *
   * @param {String} gateway       - Cổng thanh toán
   * @param {Object} webhookData   - Dữ liệu từ webhook
   * @param {String} signature     - Chữ ký để verify
   *
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     message: String,
   *     orderId?: String,
   *     transactionStatus?: String,
   *   }
   */
  async handleWebhook(gateway, webhookData, signature, io = null, lang) {
    try {
      if (gateway.toLowerCase() === 'vnpay') await this.refreshVnpayAdapter();
      const adapter = this.adapters[gateway.toLowerCase()];
      if (!adapter) {
        return {
          success: false,
          code: 'PAYMENT_GATEWAY_UNSUPPORTED',
          params: { gateway },
        };
      }

      // IPN xử lý
      const ipnResult = await adapter.handleIPN({
        ...webhookData,
        vnp_SecureHash: webhookData.vnp_SecureHash || signature,
      });
      if (!ipnResult.success) {
        return {
          success: false,
          code: 'PAYMENT_WEBHOOK_INVALID',
          params: {},
        };
      }

      const transactionInfo = ipnResult.transaction;

      // Cập nhật Payment document
      const payment = await Payment.findOne({
        orderId: transactionInfo.orderId,
        gateway: gateway.toLowerCase(),
        $or: [
          { transactionRef: transactionInfo.transactionRef },
          { status: { $in: ['pending', 'processing'] } },
        ],
      }).sort({ createdAt: -1 });

      if (!payment) {
        return {
          success: false,
          code: 'PAYMENT_RECORD_NOT_FOUND',
          params: { orderId: transactionInfo.orderId },
        };
      }

      const order = await Order.findById(transactionInfo.orderId);
      if (!order) {
        return {
          success: false,
          code: 'PAYMENT_ORDER_NOT_FOUND',
          params: { orderId: transactionInfo.orderId },
        };
      }

      const expectedProviderAmount = payment.providerAmount ?? Math.round(convertOrderAmount(
        Number(order.totalPrice),
        order.currencyCode,
        payment.providerCurrency,
        order.exchangeRates || []
      ));
      const amountMatches = Math.abs(expectedProviderAmount - transactionInfo.amount) < 0.01;
      const referenceMatches = !payment.transactionRef || payment.transactionRef === transactionInfo.transactionRef;
      const currencyMatches = transactionInfo.currency === payment.providerCurrency && transactionInfo.currency === 'VND';
      if (!currencyMatches || !amountMatches || !referenceMatches) {
        payment.failureReason = 'Provider payment data does not match the order snapshot';
        payment.status = 'failed';
        payment.webhookData = webhookData;
        payment.webhookVerified = true;
        await payment.save();
        return {
          success: false,
          code: 'PAYMENT_RECONCILIATION_FAILED',
          params: {},
        };
      }

      if (payment.status === 'success') {
        return {
          success: true,
          code: 'PAYMENT_WEBHOOK_ALREADY_PROCESSED',
          params: {},
          orderId: transactionInfo.orderId,
          transactionStatus: payment.status,
        };
      }

      // Cập nhật payment info
      payment.gatewayTransactionId = transactionInfo.gatewayTransactionId;
      payment.transactionRef = transactionInfo.transactionRef;
      payment.providerAmount = transactionInfo.amount;
      payment.providerCurrency = transactionInfo.currency;
      payment.status = transactionInfo.status;
      payment.webhookData = webhookData;
      payment.webhookVerified = true;
      payment.rawResponse = transactionInfo.metadata?.rawIpnData || webhookData;
      payment.metadata = transactionInfo.metadata || {};

      let paymentNeedsReview = false;

      // Nếu thanh toán thành công
      if (transactionInfo.status === 'success') {
        payment.paidAt = new Date();

        const paidResult = await markOrderPaid(transactionInfo.orderId, gateway.toLowerCase());
        paymentNeedsReview = paidResult.needsReview;
        const paidOrder = await Order.findById(transactionInfo.orderId)
          .populate('customer', 'name email phone')
          .populate('user', 'name email');

        try {
          await sendOrderPaymentSuccessEmail(paidOrder, lang);
        } catch (emailError) {
          console.error('[PaymentService.handleWebhook] Payment confirmation email failed:', emailError.message);
        }

        // Broadcast socket event cho admin thấy đơn hàng mới được thanh toán
        if (io) {
          broadcastPaymentSuccess(io, {
            orderId: paidOrder._id.toString(),
            isPaid: paidOrder.isPaid,
            inventoryStatus: paidOrder.inventoryStatus,
            createdAt: paidOrder.createdAt.toISOString(),
          });
        }
      } else if (transactionInfo.status === 'failed') {
        payment.failureReason = transactionInfo.failureReason;
        payment.failureCode = transactionInfo.failureCode || 'PAYMENT_STATUS_FAILED';
      } else if (transactionInfo.status === 'cancelled') {
        payment.failureCode = 'PAYMENT_STATUS_CANCELLED';
      } else if (transactionInfo.status === 'expired') {
        payment.failureCode = 'PAYMENT_STATUS_EXPIRED';
      }

      await payment.save();
      if (['failed', 'cancelled', 'expired'].includes(transactionInfo.status)) {
        await releaseReservedOrderInventory(transactionInfo.orderId);
      }

      return {
        success: true,
        code: 'PAYMENT_WEBHOOK_PROCESSED',
        params: {},
        orderId: transactionInfo.orderId,
        transactionStatus: transactionInfo.status,
        needsReview: paymentNeedsReview,
      };
    } catch (error) {
      console.error('[PaymentService.handleWebhook] Error:', error.message);
      console.error(error.stack);
      return createPaymentFailure('PAYMENT_WEBHOOK_PROCESSING_FAILED');
    }
  }

  /**
   * Confirm payment (nếu user redirect lại)
   * ⚠️ SECURITY: Verifies payment amount matches order total
   *
   * @param {String} orderId
   * @returns {Object}
   */
  async confirmPayment(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return {
          success: false,
          code: 'PAYMENT_ORDER_NOT_FOUND',
          params: { orderId },
          httpStatus: 404,
        };
      }

      // Find the most recent payment for this order (any status)
      const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });

      if (!payment) {
        return {
          success: false,
          code: 'PAYMENT_RECORD_NOT_FOUND',
          params: { orderId },
          httpStatus: 404,
        };
      }

      // IPN race condition: user redirected back before webhook processed.
      // Return pending state so frontend can poll instead of showing failure.
      if (payment.status === 'pending' || payment.status === 'processing') {
        return {
          success: true,
          data: {
            orderId,
            isPaid: order.isPaid,
            paymentStatus: payment.status,
            verified: false,
            isPending: true,
          },
        };
      }

      // Payment actually failed at the gateway
      if (['failed', 'cancelled', 'expired'].includes(payment.status)) {
        return {
          success: true,
          data: {
            orderId,
            isPaid: order.isPaid,
            paymentStatus: payment.status,
            verified: false,
            failureCode: payment.failureCode || `PAYMENT_STATUS_${payment.status.toUpperCase()}`,
          },
        };
      }

      // ==================== CRITICAL: VERIFY AMOUNT ====================
      // Allow small tolerance for floating-point rounding (amounts are in order currency)
      const amountDifference = Math.abs(payment.amount - order.totalPrice);
      const AMOUNT_TOLERANCE = Math.max(1, order.totalPrice * 0.001); // 0.1% tolerance

      if (amountDifference > AMOUNT_TOLERANCE) {
        console.error('[PaymentService.confirmPayment] AMOUNT MISMATCH DETECTED:', {
          orderId,
          expectedAmount: order.totalPrice,
          paidAmount: payment.amount,
          difference: amountDifference,
        });

        return {
          success: true,
          data: {
            orderId,
            isPaid: order.isPaid,
            paymentStatus: payment.status,
            verified: false,
            isAmountMismatch: true,
            failureCode: 'PAYMENT_AMOUNT_MISMATCH',
            currency: order.currencyCode,
            failureParams: {
              paidAmount: payment.amount,
              orderTotal: order.totalPrice,
            },
          },
        };
      }

      return {
        success: true,
        data: {
          orderId,
          isPaid: order.isPaid,
          paymentStatus: payment.status,
          paidAmount: payment.amount,
          totalPrice: order.totalPrice,
          currency: order.currencyCode,
          verified: true,
        },
      };
    } catch (error) {
      console.error('[PaymentService.confirmPayment] Error:', error.message);
      return createPaymentFailure('PAYMENT_CONFIRMATION_FAILED');
    }
  }

  /**
   * Get payment history cho một order
   */
  async getPaymentHistory(orderId) {
    try {
      const payments = await Payment.find({ orderId })
        .sort({ createdAt: -1 })
        .lean();

      return {
        success: true,
        data: payments,
      };
    } catch (error) {
      console.error('[PaymentService.getPaymentHistory] Error:', error.message);
      return createPaymentFailure('PAYMENT_HISTORY_FETCH_FAILED', { orderId });
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(orderId, reason = '') {
    try {
      const payment = await Payment.findOne({
        orderId,
        status: 'success',
      }).sort({ createdAt: -1 });

      if (!payment) {
        return {
          success: false,
          code: 'PAYMENT_SUCCESSFUL_RECORD_NOT_FOUND',
          params: { orderId },
        };
      }

      const adapter = this.adapters[payment.gateway];
      if (!adapter) {
        return {
          success: false,
          code: 'PAYMENT_GATEWAY_ADAPTER_NOT_FOUND',
          params: { gateway: payment.gateway },
        };
      }

      // Gọi adapter refund
      const refundResult = await adapter.refund({
        transactionId: payment.gatewayTransactionId,
        amount: payment.amount,
        reason,
      });

      if (!refundResult.success) {
        return {
          success: false,
          code: 'PAYMENT_REFUND_FAILED',
          params: {},
        };
      }

      // Cập nhật payment status
      payment.status = 'cancelled'; // hoặc thêm status 'refunded'
      await payment.save();

      // Cập nhật order
      await Order.findByIdAndUpdate(orderId, {
        isPaid: false,
        paidAt: null,
      });

      return {
        success: true,
        code: 'PAYMENT_REFUND_PROCESSED',
        params: {},
        refundId: refundResult.refundId,
      };
    } catch (error) {
      console.error('[PaymentService.refundPayment] Error:', error.message);
      return createPaymentFailure('PAYMENT_REFUND_FAILED');
    }
  }

  /**
   * Get list of supported gateways
   */
  getSupportedGateways() {
    return Object.keys(this.adapters);
  }

  /**
   * Check if gateway is supported
   */
  isGatewaySupported(gateway) {
    return gateway.toLowerCase() in this.adapters;
  }
}

// Export singleton instance
module.exports = new PaymentService();
