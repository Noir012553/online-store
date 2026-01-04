/**
 * VNPay Payment Handler
 * Handles payment through VNPay gateway
 */

import { PaymentHandler, PaymentContext, PaymentResult } from './PaymentHandler';
import { paymentAPI } from '../../lib/api';

export class VNPayHandler extends PaymentHandler {
  name = 'VNPay';
  methodId = 'vnpay';

  async validate(): Promise<{ valid: boolean; errors?: Record<string, string> }> {
    // VNPay doesn't require client-side validation
    // All validation happens on backend
    return { valid: true };
  }

  async process(context: PaymentContext): Promise<PaymentResult> {
    try {
      const { orderId, amount, formData } = context;

      const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/order-confirmation?orderId=${orderId}`;

      const customerInfo = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.province,
        ward: formData.ward,
        orderInfo: `Thanh toán đơn hàng ${orderId}`
      };

      const response = await paymentAPI.createVNPayLink(orderId, amount, customerInfo, returnUrl);

      if (!response.paymentUrl) {
        return {
          success: false,
          message: 'Không thể tạo liên kết thanh toán VNPay',
          errorMessage: 'VNPay URL generation failed'
        };
      }

      // Store order info before redirect
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('checkoutOrder', JSON.stringify(context.order));
      }

      return {
        success: true,
        message: 'Redirecting to VNPay...',
        redirectUrl: response.paymentUrl,
        shouldClearCart: true,
        nextAction: 'redirect'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'VNPay payment failed';
      return {
        success: false,
        message: 'Lỗi khi tạo thanh toán VNPay',
        errorMessage
      };
    }
  }
}
