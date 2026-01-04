/**
 * Bank Transfer Payment Handler
 * Handles bank transfer payment method
 */

import { PaymentHandler, PaymentContext, PaymentResult } from './PaymentHandler';

export class BankTransferHandler extends PaymentHandler {
  name = 'Chuyển khoản ngân hàng';
  methodId = 'bank';

  async validate(): Promise<{ valid: boolean; errors?: Record<string, string> }> {
    // Bank transfer doesn't require validation
    return { valid: true };
  }

  async process(context: PaymentContext): Promise<PaymentResult> {
    try {
      // For bank transfer, order is already created
      // User will transfer manually with order code
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lastOrder', JSON.stringify(context.order));
      }

      return {
        success: true,
        message: 'Đơn hàng đã được tạo thành công! Vui lòng chuyển khoản với mã đơn hàng.',
        shouldClearCart: true,
        nextAction: 'navigate'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bank transfer processing failed';
      return {
        success: false,
        message: 'Lỗi khi xử lý đơn hàng',
        errorMessage
      };
    }
  }
}
