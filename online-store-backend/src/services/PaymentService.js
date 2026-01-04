/**
 * Unified Payment Service
 * Handles all payment processing logic for different payment methods
 */

const Order = require('../models/Order');
const vnpayService = require('./vnpayService');
const ShippingService = require('./ShippingService');

class PaymentService {
  /**
   * Process payment based on payment method
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} - Payment result
   */
  static async processPayment(paymentData) {
    const { orderId, amount, paymentMethod, returnUrl, customerInfo, clientIp } = paymentData;

    // Validate required fields
    if (!orderId || !amount || !paymentMethod) {
      return {
        success: false,
        error: 'Missing required payment fields'
      };
    }

    // Route to appropriate payment handler
    switch (paymentMethod) {
      case 'vnpay':
        return this.processVNPayPayment(orderId, amount, returnUrl, customerInfo, clientIp);
      case 'card':
        return this.processCardPayment(orderId, amount);
      case 'cod':
        return this.processCODPayment(orderId);
      case 'bank':
        return this.processBankTransferPayment(orderId);
      default:
        return {
          success: false,
          error: `Payment method "${paymentMethod}" is not supported`
        };
    }
  }

  /**
   * Process VNPay payment - returns payment URL for redirect
   */
  static async processVNPayPayment(orderId, amount, returnUrl, customerInfo, clientIp) {
    try {
      const paymentUrl = vnpayService.buildPaymentUrl({
        orderId,
        amount,
        returnUrl: returnUrl || 'http://localhost:3000/order-confirmation',
        customerName: customerInfo?.name,
        customerEmail: customerInfo?.email,
        customerPhone: customerInfo?.phone,
        address: customerInfo?.address,
        city: customerInfo?.city,
        ward: customerInfo?.ward,
        orderInfo: `Laptop Store - Order #${orderId}`,
        clientIp: clientIp || '127.0.0.1'
      });

      return {
        success: true,
        paymentUrl,
        message: 'VNPay payment URL created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to create VNPay payment URL'
      };
    }
  }

  /**
   * Process card payment - validates and marks order as paid
   * In production, this should integrate with actual payment gateway
   */
  static async processCardPayment(orderId, amount) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // In production: Send card details to payment gateway (Stripe, Payoo, etc.)
      // For now, simulate successful payment
      order.paymentStatus = 'paid';
      order.paymentMethod = 'card';
      order.paymentTransactionId = `CARD_${Date.now()}`;
      order.paymentDate = new Date();
      order.status = 'processing';

      await order.save();

      return {
        success: true,
        orderId,
        message: 'Card payment processed successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to process card payment'
      };
    }
  }

  /**
   * Process COD payment - order created, payment on delivery
   */
  static async processCODPayment(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // COD is recorded but not marked as paid yet
      order.paymentMethod = 'cod';
      order.paymentStatus = 'pending';
      order.status = 'pending_payment';

      await order.save();

      return {
        success: true,
        orderId,
        message: 'COD order created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to process COD order'
      };
    }
  }

  /**
   * Process bank transfer payment - order created, payment by bank transfer
   */
  static async processBankTransferPayment(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Bank transfer is recorded but not marked as paid yet
      order.paymentMethod = 'bank';
      order.paymentStatus = 'pending';
      order.status = 'pending_payment';

      await order.save();

      return {
        success: true,
        orderId,
        message: 'Bank transfer order created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to process bank transfer order'
      };
    }
  }

  /**
   * Handle payment verification (from IPN or return URL)
   */
  static async verifyAndCompletePayment(verifyResult, orderId) {
    try {
      if (!verifyResult.valid || !verifyResult.success) {
        return {
          success: false,
          error: 'Payment verification failed'
        };
      }

      // Update order status to paid
      const order = await Order.findByIdAndUpdate(
        orderId,
        {
          paymentStatus: 'paid',
          paymentMethod: verifyResult.paymentMethod || 'vnpay',
          paymentTransactionId: verifyResult.transactionNo,
          paymentDate: new Date(),
          status: 'processing'
        },
        { new: true }
      );

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Create shipping order
      const shippingResult = await ShippingService.createShippingOrder({
        clientOrderCode: order._id.toString(),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.shippingAddress?.address,
        districtId: order.shippingAddress?.districtId,
        wardCode: order.shippingAddress?.wardCode,
        weight: this.calculateOrderWeight(order.orderItems),
        ghnServiceId: order.shippingMethod,
        codAmount: 0
      });

      if (shippingResult.success) {
        // Save shipping tracking info
        await Order.findByIdAndUpdate(order._id, {
          shippingOrderId: shippingResult.orderId,
          trackingNumber: shippingResult.orderId
        });
      }

      return {
        success: true,
        orderId: order._id,
        message: 'Payment verified and order processing started'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to verify and complete payment'
      };
    }
  }

  /**
   * Get order payment status
   */
  static async getOrderPaymentStatus(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      return {
        success: true,
        orderId: order._id,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalPrice,
        paymentDate: order.paymentDate
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to get payment status'
      };
    }
  }

  /**
   * Helper: Calculate order weight from items
   */
  static calculateOrderWeight(orderItems) {
    // Assume each item weighs ~2kg
    return (orderItems?.length || 1) * 2000;
  }
}

module.exports = PaymentService;
