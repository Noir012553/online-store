/**
 * Payment Processing Service
 * High-level service to orchestrate payment processing
 */

import { PaymentHandlerRegistry } from './PaymentHandlerRegistry';
import { PaymentContext, PaymentResult, OrderData } from './PaymentHandler';
import { orderAPI } from '../../lib/api';

export interface ProcessPaymentParams {
  paymentMethod: string;
  orderId: string;
  amount: number;
  formData: any;
}

export class PaymentProcessingService {
  /**
   * Create order and process payment
   */
  static async processPayment(
    orderData: any,
    paymentMethod: string,
    formData: any
  ): Promise<{
    success: boolean;
    order?: OrderData;
    paymentResult?: PaymentResult;
    error?: string;
  }> {
    try {
      // Step 1: Create order
      const orderResponse = await orderAPI.createOrder(orderData);
      const order = orderResponse.order || orderResponse;
      const orderId = order._id || order.id;

      // Step 2: Get payment handler
      const handler = PaymentHandlerRegistry.getHandler(paymentMethod);
      if (!handler) {
        return {
          success: false,
          order,
          error: `Payment method "${paymentMethod}" is not supported`
        };
      }

      // Step 3: Validate payment method
      const validation = await handler.validate();
      if (!validation.valid) {
        return {
          success: false,
          order,
          error: Object.values(validation.errors || {}).join(', ')
        };
      }

      // Step 4: Process payment
      const paymentContext: PaymentContext = {
        orderId,
        amount: orderData.totalPrice,
        order,
        formData
      };

      const paymentResult = await handler.process(paymentContext);

      return {
        success: paymentResult.success,
        order,
        paymentResult,
        error: paymentResult.errorMessage
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment processing failed';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Handle payment redirect
   */
  static handlePaymentRedirect(paymentResult: PaymentResult): void {
    if (paymentResult.nextAction === 'redirect' && paymentResult.redirectUrl) {
      window.location.href = paymentResult.redirectUrl;
    }
  }
}
