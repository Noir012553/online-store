/**
 * Base Payment Handler Interface
 * Define common interface for all payment methods
 */

export interface OrderData {
  _id: string;
  orderItems: Array<{
    product: string;
    name: string;
    qty: number;
    image: string;
    price: number;
  }>;
  shippingAddress: {
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: string;
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  note?: string;
}

export interface PaymentContext {
  orderId: string;
  amount: number;
  order: OrderData;
  formData: any;
}

export interface PaymentResult {
  success: boolean;
  message: string;
  redirectUrl?: string;
  shouldClearCart?: boolean;
  nextAction?: 'redirect' | 'navigate' | 'none';
  errorMessage?: string;
}

export abstract class PaymentHandler {
  abstract name: string;
  abstract methodId: string;

  /**
   * Validate payment method specific data
   */
  abstract validate(): Promise<{ valid: boolean; errors?: Record<string, string> }>;

  /**
   * Process the payment
   */
  abstract process(context: PaymentContext): Promise<PaymentResult>;

  /**
   * Get display name
   */
  getDisplayName(): string {
    return this.name;
  }
}
