/**
 * Cash on Delivery (COD) Payment Handler
 * Handles payment collection on delivery
 */

import { PaymentHandler, PaymentContext, PaymentResult } from './PaymentHandler';

export class CODHandler extends PaymentHandler {
  name = 'Thanh toán khi nhận hàng';
  methodId = 'cod';

  async validate(): Promise<{ valid: boolean; errors?: Record<string, string> }> {
    // COD doesn't require validation
    return { valid: true };
  }

  async process(context: PaymentContext): Promise<PaymentResult> {
    try {
      // For COD, order is already created on backend
      // No additional payment processing needed
      // Just store order info and navigate

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lastOrder', JSON.stringify(context.order));
      }

      return {
        success: true,
        message: 'Đơn hàng đã được tạo thành công! Thanh toán sẽ được thực hiện khi giao hàng.',
        shouldClearCart: true,
        nextAction: 'navigate'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'COD processing failed';
      return {
        success: false,
        message: 'Lỗi khi xử lý đơn hàng',
        errorMessage
      };
    }
  }
}
