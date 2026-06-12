/**
 * BasePaymentGateway - Abstract class for all payment gateways
 * 
 * Tất cả cổng thanh toán (VNPAY, MoMo, Stripe...) phải implement các method này.
 * Mục đích: Chuẩn hóa interface, đảm bảo mỗi gateway đều có đầy đủ chức năng.
 */

class BasePaymentGateway {
  constructor(config) {
    /**
     * config: {
     *   partnerId: String,      // ID nhà cung cấp (từ gateway)
     *   partnerKey: String,     // Secret key (từ gateway)
     *   endpoint: String,       // API endpoint của gateway
     *   webhookSecret: String,  // Secret để verify webhook signature
     *   redirectUrl: String,    // URL redirect sau khi thanh toán
     *   callbackUrl: String,    // URL để gateway gọi webhook
     * }
     */
    if (new.target === BasePaymentGateway) {
      throw new TypeError('BasePaymentGateway is an abstract class and cannot be instantiated directly');
    }

    this.config = config;
    this.gatewayName = 'undefined';
    this.version = '1.0';
  }

  /**
   * Tạo link thanh toán / request thanh toán
   * 
   * @param {Object} paymentData
   *   - orderId: String        // ID đơn hàng
   *   - amount: Number         // Số tiền (đơn vị nhỏ nhất của currency)
   *   - currency: String       // Đơn vị tiền tệ
   *   - description: String    // Mô tả thanh toán
   *   - customer: Object       // Thông tin khách hàng
   *     - name: String
   *     - email: String
   *     - phone: String
   *   - [optional] metadata: Object   // Dữ liệu bổ sung
   * 
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     data: {
   *       redirectUrl: String,        // URL để redirect user
   *       transactionId: String,      // ID tạm thời từ gateway (nếu có)
   *       requestData: Object,        // Dữ liệu gửi đi
   *     },
   *     error?: String                // Thông báo lỗi nếu có
   *   }
   */
  async createPaymentUrl(paymentData) {
    throw new Error(`${this.gatewayName}.createPaymentUrl() must be implemented`);
  }

  /**
   * Verify/kiểm tra chữ ký từ webhook callback
   * Mục đích: Đảm bảo webhook được gửi từ gateway, không phải attacker
   * 
   * @param {Object} webhookData - Dữ liệu nhận từ webhook
   * @param {String} signature   - Chữ ký (HMAC-SHA256/512 tùy gateway)
   * 
   * @returns {Object}
   *   {
   *     valid: Boolean,
   *     data?: Object,         // Dữ liệu đã được parse nếu hợp lệ
   *     error?: String         // Lý do không hợp lệ
   *   }
   */
  async verifyChecksum(webhookData, signature) {
    throw new Error(`${this.gatewayName}.verifyChecksum() must be implemented`);
  }

  /**
   * Xử lý IPN (Instant Payment Notification) callback
   * Cập nhật trạng thái đơn hàng dựa trên response từ gateway
   * 
   * @param {Object} ipnData - Dữ liệu IPN từ webhook
   * 
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     transaction: {
   *       gatewayTransactionId: String,
   *       status: String,              // 'success', 'failed', 'cancelled', etc.
   *       amount: Number,
   *       orderId: String,
   *       description?: String,
   *       metadata?: Object,
   *     },
   *     error?: String
   *   }
   */
  async handleIPN(ipnData) {
    throw new Error(`${this.gatewayName}.handleIPN() must be implemented`);
  }

  /**
   * Kiểm tra trạng thái giao dịch từ gateway
   * Sử dụng khi cần xác nhận trạng thái (reconciliation)
   * 
   * @param {String} transactionId - ID giao dịch từ gateway
   * 
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     transaction?: {
   *       id: String,
   *       status: String,    // 'success', 'failed', 'processing', 'cancelled'
   *       amount: Number,
   *       ...
   *     },
   *     error?: String
   *   }
   */
  async queryTransaction(transactionId) {
    throw new Error(`${this.gatewayName}.queryTransaction() must be implemented`);
  }

  /**
   * Hoàn tiền / Refund
   * 
   * @param {Object} refundData
   *   - transactionId: String   // ID giao dịch cần hoàn
   *   - amount: Number          // Số tiền hoàn (có thể part of transaction)
   *   - reason?: String         // Lý do hoàn tiền
   * 
   * @returns {Object}
   *   {
   *     success: Boolean,
   *     refundId?: String,       // ID của hoàn tiền từ gateway
   *     amount?: Number,
   *     error?: String
   *   }
   */
  async refund(refundData) {
    throw new Error(`${this.gatewayName}.refund() must be implemented`);
  }

  /**
   * Helper: Validate config
   * Mỗi gateway kiểm tra config của mình có đầy đủ không
   */
  validateConfig() {
    throw new Error(`${this.gatewayName}.validateConfig() must be implemented`);
  }

  /**
   * Helper: Parse and normalize amount
   * Chuyển đổi amount sang định dạng của gateway
   * 
   * @param {Number} amount
   * @param {String} currency
   * @returns {Number}
   */
  normalizeAmount(amount, currency = 'VND') {
    // Mặc định: trả về amount nguyên
    // VNPAY: x100 (cent), Stripe: chia 100, etc.
    return amount;
  }

  /**
   * Helper: Create HMAC signature
   *
   * ⚠️ VNPAY REQUIREMENT: Signature PHẢI viết HOA (toUpperCase)
   * Ví dụ: 8FE821BF9A6B26B1... (KHÔNG phải 8fe821bf9a6b26b1...)
   *
   * @param {String} data      - Dữ liệu cần sign
   * @param {String} key       - Secret key
   * @param {String} algorithm - 'sha256', 'sha512' (mặc định sha256)
   * @returns {String}         - Hex string (UPPERCASE)
   */
  createSignature(data, key, algorithm = 'sha256') {
    const crypto = require('crypto');
    return crypto.createHmac(algorithm, key).update(data).digest('hex').toUpperCase();
  }

  /**
   * Helper: Verify HMAC signature
   * 
   * @param {String} data      - Dữ liệu đã được sign
   * @param {String} signature - Chữ ký nhận được
   * @param {String} key       - Secret key
   * @param {String} algorithm - 'sha256', 'sha512'
   * @returns {Boolean}
   */
  verifySignature(data, signature, key, algorithm = 'sha256') {
    const expectedSignature = this.createSignature(data, key, algorithm);
    // Dùng timingSafeEqual để chống timing attack
    const crypto = require('crypto');
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  }

  /**
   * Helper: Format dữ liệu request thành chuỗi (để sign)
   * Gateway khác nhau có cách format khác nhau
   * Ví dụ VNPAY: key1=value1&key2=value2&... (KHÔNG ENCODE khi hash!)
   *
   * ⚠️ QUAN TRỌNG: Chuỗi này được dùng để HASH, không phải để tạo URL
   * URL encoding xảy ra ở bước sau (khi tạo final URL)
   *
   * ⚠️ VNPAY 2026 Requirement: Tất cả values PHẢI là STRING
   * Không được để number type vào chuỗi hash
   *
   * @param {Object} data
   * @param {String} format - 'query' hoặc 'json' (mặc định 'query')
   * @returns {String}
   */
  formatDataForSignature(data, format = 'query') {
    if (format === 'json') {
      return JSON.stringify(data);
    }

    // format = 'query': sắp xếp key theo alphabet, KHÔNG ENCODE
    // VNPAY yêu cầu: key1=value1&key2=value2&...
    // Encoding xảy ra ở bước sau khi tạo URL
    // ⚠️ QUAN TRỌNG: Explicit convert tất cả values sang String (không rely on implicit conversion)
    return Object.keys(data)
      .sort()
      .map(key => `${key}=${String(data[key])}`)
      .join('&');
  }

  /**
   * Helper: Generate unique transaction reference
   * 
   * @param {String} orderId
   * @returns {String}
   */
  generateTransactionRef(orderId) {
    // Format: orderId-timestamp (milliseconds) để tránh trùng lặp TxnRef
    const timestamp = Date.now();
    return `${orderId}-${timestamp}`;
  }
}

module.exports = BasePaymentGateway;
