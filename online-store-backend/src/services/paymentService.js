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
const VnpayAdapter = require('../adapters/payment/VnpayAdapter');
const { broadcastPaymentSuccess, broadcastOrderStatusUpdate } = require('../socket/socketHandler');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const { convertOrderAmount, getActiveExchangeRates } = require('../utils/orderRevenue');

const createPaymentFailure = (code, error) => ({
  success: false,
  code,
  error: error instanceof Error ? error.message : error,
});

class PaymentService {
  constructor() {
    this.adapters = {};
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
      // Validate clientIp in options - REQUIRED
      if (!options.clientIp) {
        throw new Error(getMessage(lang, 'checkout.error_missing_client_ip'));
      }

      // Kiểm tra gateway được support
      const adapter = this.adapters[gateway.toLowerCase()];
      if (!adapter) {
        throw new Error(getMessage(lang, 'checkout.error_unsupported_gateway'));
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

      const amount = Number(order.totalPrice);
      const currency = order.currencyCode;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(getMessage(lang, 'checkout.error_invalid_amount'));
      }

      const providerCurrency = 'VND';
      const activeRates = await getActiveExchangeRates();
      const providerAmount = Math.round(convertOrderAmount(
        amount,
        currency,
        providerCurrency,
        order.exchangeRates || [],
        activeRates
      ));
      if (!Number.isFinite(providerAmount) || providerAmount <= 0) {
        throw new Error(getMessage(lang, 'checkout.error_invalid_amount'));
      }
      if (!adapter.supportsCurrency(providerCurrency)) {
        const error = new Error(`Gateway ${gateway} does not support ${providerCurrency}`);
        error.code = 'PAYMENT_GATEWAY_CURRENCY_UNSUPPORTED';
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
        callbackUrl: options.callbackUrl,
      });

      await payment.save();

      // Gọi adapter để tạo link thanh toán
      const paymentResult = await adapter.createPaymentUrl({
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

        throw new Error(getMessage(lang, 'checkout.error_payment_url_creation'));
      }

      // Lưu request data vào Payment
      payment.rawRequest = paymentResult.data.requestData;
      payment.redirectUrl = paymentResult.data.redirectUrl;
      payment.transactionRef = paymentResult.data.transactionRef;
      payment.providerAmount = providerAmount;
      await payment.save();

      return {
        success: true,
        data: {
          paymentId: payment._id.toString(),
          redirectUrl: paymentResult.data.redirectUrl,
          gateway,
          amount,
          currency,
          providerAmount,
          providerCurrency,
          transactionRef: paymentResult.data.transactionRef,
          orderId,
        },
      };
    } catch (error) {
      console.error('[PaymentService.initiatePayment] Error:', error.message);
      return createPaymentFailure(error.code || 'PAYMENT_INITIATION_FAILED', error);
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
  async handleWebhook(gateway, webhookData, signature, io = null) {
    try {
      const adapter = this.adapters[gateway.toLowerCase()];
      if (!adapter) {
        return {
          success: false,
          code: 'PAYMENT_GATEWAY_UNSUPPORTED',
          error: `Gateway "${gateway}" is not supported`,
        };
      }

      // IPN xử lý
      const ipnResult = await adapter.handleIPN(webhookData);
      if (!ipnResult.success) {
        return {
          success: false,
          code: 'PAYMENT_WEBHOOK_INVALID',
          error: ipnResult.error,
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
          error: `Payment record not found for order ${transactionInfo.orderId}`,
        };
      }

      const order = await Order.findById(transactionInfo.orderId);
      if (!order) {
        return {
          success: false,
          code: 'PAYMENT_ORDER_NOT_FOUND',
          error: `Order ${transactionInfo.orderId} not found`,
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
          error: 'Payment reconciliation failed',
        };
      }

      if (payment.status === 'success') {
        return {
          success: true,
          code: 'PAYMENT_WEBHOOK_ALREADY_PROCESSED',
          message: 'Webhook already processed',
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

      // Nếu thanh toán thành công
      if (transactionInfo.status === 'success') {
        payment.paidAt = new Date();

        // Cập nhật Order
        const paidOrder = await Order.findByIdAndUpdate(
          transactionInfo.orderId,
          {
            isPaid: true,
            paidAt: new Date(),
            paymentMethod: gateway.toLowerCase(),
          },
          { returnDocument: 'after' }
        ).populate('customer', 'name email phone');

        // Broadcast socket event cho admin thấy đơn hàng mới được thanh toán
        if (io) {
          broadcastPaymentSuccess(io, {
            orderId: order._id,
            totalPrice: paidOrder.totalPrice,
            isPaid: paidOrder.isPaid,
            customer: order.customer,
            createdAt: order.createdAt,
          });
        }
      } else if (transactionInfo.status === 'failed') {
        payment.failureReason = transactionInfo.failureReason || 'Payment failed at gateway';
        payment.failureCode = transactionInfo.failureCode;
      } else if (transactionInfo.status === 'cancelled') {
        payment.failureReason = 'Payment cancelled by user';
      }

      await payment.save();

      return {
        success: true,
        code: 'PAYMENT_WEBHOOK_PROCESSED',
        message: 'Webhook processed successfully',
        orderId: transactionInfo.orderId,
        transactionStatus: transactionInfo.status,
      };
    } catch (error) {
      console.error('[PaymentService.handleWebhook] Error:', error.message);
      console.error(error.stack);
      return createPaymentFailure('PAYMENT_WEBHOOK_PROCESSING_FAILED', error);
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
          error: `Order ${orderId} not found`,
          httpStatus: 404,
        };
      }

      // Find the most recent payment for this order (any status)
      const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });

      if (!payment) {
        return {
          success: false,
          code: 'PAYMENT_RECORD_NOT_FOUND',
          error: `No payment record found for order ${orderId}`,
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
            failureReason: payment.failureReason || `Payment ${payment.status}`,
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
            failureReason: `Payment amount (${payment.amount}) does not match order total (${order.totalPrice})`,
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
          verified: true,
        },
      };
    } catch (error) {
      console.error('[PaymentService.confirmPayment] Error:', error.message);
      return createPaymentFailure('PAYMENT_CONFIRMATION_FAILED', error);
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
      return {
        success: false,
        error: error.message,
      };
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
          error: `No successful payment found for order ${orderId}`,
        };
      }

      const adapter = this.adapters[payment.gateway];
      if (!adapter) {
        return {
          success: false,
          code: 'PAYMENT_GATEWAY_ADAPTER_NOT_FOUND',
          error: `Adapter for ${payment.gateway} not found`,
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
          error: refundResult.error,
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
        message: 'Refund processed successfully',
        refundId: refundResult.refundId,
      };
    } catch (error) {
      console.error('[PaymentService.refundPayment] Error:', error.message);
      return createPaymentFailure('PAYMENT_REFUND_FAILED', error);
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
