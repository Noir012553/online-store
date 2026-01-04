/**
 * Order State Machine Service
 * Manages order states and transitions
 */

const Order = require('../models/Order');

/**
 * Order state transitions diagram:
 * 
 * pending_payment
 *   ↓
 * processing (when payment confirmed)
 *   ↓
 * shipped (when GHN shipping created)
 *   ↓
 * delivered (when delivered)
 *   ↓
 * completed
 * 
 * Additionally:
 * Any state → cancelled (customer cancellation)
 * cancelled → refunded (refund processed)
 */

const OrderStates = {
  PENDING_PAYMENT: 'pending_payment',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

const PaymentStatuses = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

class OrderStateService {
  /**
   * Valid state transitions
   */
  static validTransitions = {
    [OrderStates.PENDING_PAYMENT]: [
      OrderStates.PROCESSING,
      OrderStates.CANCELLED
    ],
    [OrderStates.PROCESSING]: [
      OrderStates.SHIPPED,
      OrderStates.CANCELLED
    ],
    [OrderStates.SHIPPED]: [
      OrderStates.DELIVERED,
      OrderStates.CANCELLED
    ],
    [OrderStates.DELIVERED]: [
      OrderStates.COMPLETED,
      OrderStates.CANCELLED
    ],
    [OrderStates.COMPLETED]: [
      OrderStates.CANCELLED
    ],
    [OrderStates.CANCELLED]: [
      OrderStates.REFUNDED
    ],
    [OrderStates.REFUNDED]: []
  };

  /**
   * Check if transition is valid
   */
  static isValidTransition(fromState, toState) {
    const validNextStates = this.validTransitions[fromState] || [];
    return validNextStates.includes(toState);
  }

  /**
   * Transition order to new state
   */
  static async transitionOrder(orderId, newState, metadata = {}) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Check if transition is valid
      if (!this.isValidTransition(order.status, newState)) {
        return {
          success: false,
          error: `Invalid transition from ${order.status} to ${newState}`
        };
      }

      // Update order state
      order.status = newState;

      // Update state timestamps
      const timestamp = new Date();
      if (!order.stateTimestamps) {
        order.stateTimestamps = {};
      }
      order.stateTimestamps[newState] = timestamp;

      // Add metadata if provided
      if (metadata) {
        if (!order.stateMetadata) {
          order.stateMetadata = {};
        }
        order.stateMetadata[newState] = metadata;
      }

      await order.save();

      return {
        success: true,
        orderId: order._id,
        newState: order.status,
        timestamp
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to transition order state'
      };
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(orderId, paymentStatus, transactionId = null) {
    try {
      const updateData = {
        paymentStatus,
        paymentDate: new Date()
      };

      if (transactionId) {
        updateData.paymentTransactionId = transactionId;
      }

      const order = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true }
      );

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      return {
        success: true,
        orderId: order._id,
        paymentStatus: order.paymentStatus
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to update payment status'
      };
    }
  }

  /**
   * Get order current state and history
   */
  static async getOrderStateInfo(orderId) {
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
        currentState: order.status,
        paymentStatus: order.paymentStatus,
        stateTimestamps: order.stateTimestamps || {},
        stateMetadata: order.stateMetadata || {},
        validNextStates: this.validTransitions[order.status] || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to get order state'
      };
    }
  }

  /**
   * Cancel order
   */
  static async cancelOrder(orderId, reason = '') {
    try {
      const result = await this.transitionOrder(orderId, OrderStates.CANCELLED, {
        reason,
        cancelledAt: new Date()
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to cancel order'
      };
    }
  }

  /**
   * Process refund
   */
  static async processRefund(orderId, refundAmount, reason = '') {
    try {
      // First, verify order is cancelled
      const order = await Order.findById(orderId);

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      if (order.status !== OrderStates.CANCELLED) {
        return {
          success: false,
          error: 'Order must be cancelled before processing refund'
        };
      }

      // Update order with refund info
      order.status = OrderStates.REFUNDED;
      order.paymentStatus = PaymentStatuses.REFUNDED;
      order.refundAmount = refundAmount;
      order.refundReason = reason;
      order.refundDate = new Date();

      await order.save();

      return {
        success: true,
        orderId: order._id,
        refundAmount: order.refundAmount,
        newState: order.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to process refund'
      };
    }
  }

  /**
   * Get available states
   */
  static getAvailableStates() {
    return Object.values(OrderStates);
  }

  /**
   * Get available payment statuses
   */
  static getAvailablePaymentStatuses() {
    return Object.values(PaymentStatuses);
  }
}

module.exports = OrderStateService;
module.exports.OrderStates = OrderStates;
module.exports.PaymentStatuses = PaymentStatuses;
