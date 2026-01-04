/**
 * Payment Handler Registry
 * Central registry for all payment handlers
 */

import { PaymentHandler } from './PaymentHandler';
import { VNPayHandler } from './VNPayHandler';
import { CardPaymentHandler } from './CardPaymentHandler';
import { CODHandler } from './CODHandler';
import { BankTransferHandler } from './BankTransferHandler';

export class PaymentHandlerRegistry {
  private static handlers: Map<string, PaymentHandler> = new Map();

  static {
    // Register all available payment handlers
    this.register(new VNPayHandler());
    this.register(new CardPaymentHandler());
    this.register(new CODHandler());
    this.register(new BankTransferHandler());
  }

  /**
   * Register a payment handler
   */
  static register(handler: PaymentHandler): void {
    this.handlers.set(handler.methodId, handler);
  }

  /**
   * Get handler by method ID
   */
  static getHandler(methodId: string): PaymentHandler | undefined {
    return this.handlers.get(methodId);
  }

  /**
   * Get all registered handlers
   */
  static getAllHandlers(): PaymentHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Check if handler exists
   */
  static hasHandler(methodId: string): boolean {
    return this.handlers.has(methodId);
  }
}
