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
        console.log('✅ VNPAY adapter initialized');
      } else {
        console.error('❌ VNPAY config missing - check .env');
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
   * @param {Number} amount        - Số tiền (VND)
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
  async initiatePayment(orderId, gateway, amount, customerInfo = {}, options = {}) {
    try {

      // Validate required fields - throw errors instead of returning failure
      if (!orderId) {
        throw new Error('Missing required field: orderId');
      }
      if (!gateway) {
        throw new Error('Missing required field: gateway');
      }
      if (!amount) {
        throw new Error('Missing required field: amount');
      }

      // Validate amount
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      // Validate clientIp in options - REQUIRED
      if (!options.clientIp) {
        throw new Error('Missing required option: clientIp - Must provide actual client IP');
      }

      // Kiểm tra gateway được support
      const adapter = this.adapters[gateway.toLowerCase()];
      if (!adapter) {
        throw new Error(`Gateway "${gateway}" is not supported. Supported: ${Object.keys(this.adapters).join(', ')}`);
      }

      // Kiểm tra order tồn tại
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Kiểm tra order chưa thanh toán
      if (order.isPaid) {
        console.error(`   ❌ Order is already paid!`);
        throw new Error(`Order ${orderId} is already paid`);
      }

      // Tạo Payment document (trạng thái pending)
      const payment = new Payment({
        orderId,
        gateway: gateway.toLowerCase(),
        amount,
        currency: 'VND',
        status: 'pending',
        callbackUrl: options.callbackUrl,
      });

      await payment.save();

      // Gọi adapter để tạo link thanh toán
      const paymentResult = await adapter.createPaymentUrl({
        orderId,
        amount,
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

        throw new Error(`Failed to create payment URL: ${paymentResult.error}`);
      }

      // Lưu request data vào Payment
      payment.rawRequest = paymentResult.data.requestData;
      payment.redirectUrl = paymentResult.data.redirectUrl;
      await payment.save();

      return {
        success: true,
        data: {
          paymentId: payment._id.toString(),
          redirectUrl: paymentResult.data.redirectUrl,
          gateway,
          amount,
          orderId,
        },
      };
    } catch (error) {
      console.error('[PaymentService.initiatePayment] Error:', error.message);
      return {
        success: false,
        error: error.message,
      };
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
          message: `Gateway "${gateway}" is not supported`,
        };
      }

      // IPN xử lý
      const ipnResult = await adapter.handleIPN(webhookData);
      if (!ipnResult.success) {
        return {
          success: false,
          message: ipnResult.error,
        };
      }

      const transactionInfo = ipnResult.transaction;

      // Cập nhật Payment document
      const payment = await Payment.findOne({
        orderId: transactionInfo.orderId,
        gateway: gateway.toLowerCase(),
      });

      if (!payment) {
        return {
          success: false,
          message: `Payment record not found for order ${transactionInfo.orderId}`,
        };
      }

      // Cập nhật payment info
      payment.gatewayTransactionId = transactionInfo.gatewayTransactionId;
      payment.status = transactionInfo.status;
      payment.webhookData = webhookData;
      payment.webhookVerified = true;
      payment.rawResponse = transactionInfo.metadata?.rawIpnData || webhookData;
      payment.metadata = transactionInfo.metadata || {};

      // Nếu thanh toán thành công
      if (transactionInfo.status === 'success') {
        payment.paidAt = new Date();

        // Cập nhật Order
        const order = await Order.findByIdAndUpdate(
          transactionInfo.orderId,
          {
            isPaid: true,
            paidAt: new Date(),
            paymentMethod: gateway.toLowerCase(),
          },
          { new: true }
        ).populate('customer', 'name email phone');

        // Broadcast socket event cho admin thấy đơn hàng mới được thanh toán
        if (io) {
          broadcastPaymentSuccess(io, {
            orderId: order._id,
            totalPrice: order.totalPrice,
            isPaid: order.isPaid,
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
        message: 'Webhook processed successfully',
        orderId: transactionInfo.orderId,
        transactionStatus: transactionInfo.status,
      };
    } catch (error) {
      console.error('[PaymentService.handleWebhook] Error:', error.message);
      console.error(error.stack);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Confirm payment (nếu user redirect lại)
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
          error: `Order ${orderId} not found`,
        };
      }

      const payment = await Payment.findOne({
        orderId,
        status: { $in: ['success', 'processing'] },
      }).sort({ createdAt: -1 });

      if (!payment) {
        return {
          success: false,
          error: `No successful payment found for order ${orderId}`,
        };
      }

      return {
        success: true,
        data: {
          orderId,
          isPaid: order.isPaid,
          paymentStatus: payment.status,
          paidAmount: payment.amount,
        },
      };
    } catch (error) {
      console.error('[PaymentService.confirmPayment] Error:', error.message);
      return {
        success: false,
        error: error.message,
      };
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
          error: `No successful payment found for order ${orderId}`,
        };
      }

      const adapter = this.adapters[payment.gateway];
      if (!adapter) {
        return {
          success: false,
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
        message: 'Refund processed successfully',
        refundId: refundResult.refundId,
      };
    } catch (error) {
      console.error('[PaymentService.refundPayment] Error:', error.message);
      return {
        success: false,
        error: error.message,
      };
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
