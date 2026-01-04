/**
 * Card Payment Handler
 * Handles payment through credit/debit card
 */

import { PaymentHandler, PaymentContext, PaymentResult } from './PaymentHandler';
import { paymentAPI } from '../../lib/api';

export class CardPaymentHandler extends PaymentHandler {
  name = 'Thẻ tín dụng/Ghi nợ';
  methodId = 'card';

  async validate(): Promise<{ valid: boolean; errors?: Record<string, string> }> {
    const errors: Record<string, string> = {};

    // This should be called from formData context
    // Actual validation happens in CardPaymentForm component
    return { valid: Object.keys(errors).length === 0, errors };
  }

  async process(context: PaymentContext): Promise<PaymentResult> {
    try {
      const { orderId, amount, formData } = context;

      if (!formData.cardDetails) {
        return {
          success: false,
          message: 'Vui lòng điền thông tin thẻ',
          errorMessage: 'Card details missing'
        };
      }

      const response = await paymentAPI.createCardPayment(orderId, amount, formData.cardDetails);

      if (!response.success) {
        return {
          success: false,
          message: response.message || 'Lỗi khi xử lý thanh toán thẻ',
          errorMessage: response.message
        };
      }

      // Store order info
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lastOrder', JSON.stringify(context.order));
      }

      return {
        success: true,
        message: 'Thanh toán thẻ thành công!',
        shouldClearCart: true,
        nextAction: 'navigate'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Card payment processing failed';
      return {
        success: false,
        message: 'Lỗi khi xử lý thanh toán thẻ',
        errorMessage
      };
    }
  }
}
