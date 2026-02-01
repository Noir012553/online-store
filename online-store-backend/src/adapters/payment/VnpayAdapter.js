/**
 * VNPAYAdapter - VNPAY Payment Gateway Implementation (2026 Compliance)
 *
 * Tuân thủ VNPAY 2026 Documentation: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 *
 * VNPAY yêu cầu:
 * 1. Sắp xếp param theo thứ tự alphabet (A-Z)
 * 2. Tính HMAC-SHA512 signature từ chuỗi hash data
 * 3. Redirect user tới VNPAY payment page: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
 * 4. Xử lý webhook callback (IPN) từ VNPAY
 * 5. Verify signature từ VNPAY webhook
 *
 * ⚠️ CẬP NHẬT IPN URL TẠI VNPAY DASHBOARD:
 * Đăng nhập: https://sandbox.vnpayment.vn/merchantv2/
 * Cấu hình IPN URL: https://backend.manln.online/api/payments/webhook/vnpay
 * (Hoặc dùng SIT testing: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login)
 */

const BasePaymentGateway = require('./BasePaymentGateway');

class VnpayAdapter extends BasePaymentGateway {
  constructor(config) {
    /**
     * config: {
     *   partnerId: String,       // vnp_TmnCode (Terminal ID từ VNPAY email)
     *                            // VD: 5G8P0VEL
     *   partnerKey: String,      // vnp_HashSecret (Secret key từ VNPAY email)
     *                            // VD: A6RUZCM16RI19H8M63R0H6SCQEJPBX94
     *   endpoint: String,        // VNPAY Payment Gateway URL (VNPAY 2026)
     *                            // Sandbox: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
     *                            // Production: https://pay.vnpay.vn/vpcpay.html
     *   returnUrl: String,       // URL để VNPAY redirect lại sau thanh toán
     *                            // VD: https://manln.online/return
     *   callbackUrl: String,     // URL webhook IPN (server-to-server callback)
     *                            // PHẢI config tại VNPAY dashboard
     *                            // VD: https://backend.manln.online/api/payments/webhook/vnpay
     *   version: String          // API version (mặc định 2.1.0)
     * }
     */
    super(config);

    // ⚠️ QUAN TRỌNG: Trim secret key để loại bỏ trailing/leading spaces
    // Lỗi này gây ra signature mismatch!
    if (this.config.partnerKey) {
      this.config.partnerKey = this.config.partnerKey.trim();
    }

    this.gatewayName = 'VNPAY';
    this.supportedCurrencies = ['VND'];

    // VNPAY 2026 Response Codes (từ documentation)
    this.supportedStatus = {
      '00': 'success',          // Giao dịch thành công
      '01': 'failed',           // Giao dịch bị từ chối
      '02': 'cancelled',        // Giao dịch bị hủy
      '04': 'failed',           // Giao dịch bị từ chối
      '05': 'processing',       // Giao dịch chờ xử lý
      '06': 'processing',       // Giao dịch chờ xác nhận
      '07': 'expired',          // Giao dịch hết hạn
      '09': 'failed',           // GD không tồn tại
      '10': 'cancelled',        // Giao dịch bị hủy
      '11': 'insufficient_fund', // Tài khoản không đủ tiền
      '12': 'invalid_card',     // Thẻ không hợp lệ
      '13': 'invalid_otp',      // OTP không hợp lệ
      '14': 'failed',           // Card tạm khóa
      '15': 'failed',           // Thẻ bị khóa vĩnh viễn
      '21': 'processing',       // Giao dịch đang chờ xử lý
      '99': 'processing',       // Chưa biết trạng thái
    };
  }

  /**
   * Validate VNPAY config
   */
  validateConfig() {
    const required = ['partnerId', 'partnerKey', 'endpoint', 'returnUrl'];
    for (const field of required) {
      if (!this.config[field]) {
        throw new Error(`VNPAY config missing: ${field}`);
      }
    }
  }

  /**
   * VNPAY 2026 Amount Format
   * ========================
   * VNPAY yêu cầu amount = amount * 100 (đơn vị: VND x 100)
   * VD: 100,000 VND → 10,000,000 (10 triệu)
   *
   * ⚠️ KHÔNG được gửi số lẻ! Phải là số nguyên.
   * ⚠️ Amount phải > 0 (VNPAY yêu cầu tối thiểu)
   *
   * @param {Number} amount - Số tiền gốc (VND)
   * @param {String} currency - Loại tiền tệ (mặc định VND)
   * @returns {Number} Amount nhân 100 (số nguyên)
   */
  normalizeAmount(amount, currency = 'VND') {
    const normalized = Math.round(amount * 100);

    if (normalized <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!Number.isInteger(normalized)) {
      throw new Error('Normalized amount must be integer');
    }

    return normalized;
  }

  /**
   * Tạo link thanh toán VNPAY (VNPAY 2026 Compliant)
   * ================================================
   *
   * Các bước:
   * 1. Sắp xếp tất cả parameters theo thứ tự alphabet (A-Z)
   * 2. Format chuỗi: key1=value1&key2=value2&... (KHÔNG URL encode)
   * 3. Tính HMAC-SHA512 signature: crypto.createHmac('sha512', secretKey).update(data).digest('hex')
   * 4. Thêm signature vào URL parameters
   * 5. Redirect user tới https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?[params]
   *
   * ⚠️ QUAN TRỌNG:
   * - Chỉ các tham số trong danh sách allowed mới được tham gia vào hash
   * - vnp_Email và vnp_PhoneNumber KHÔNG tham gia vào chuỗi hash
   * - KHÔNG encode khi tính signature, chỉ encode khi tạo URL cuối cùng
   * - TxnRef phải UNIQUE cho mỗi giao dịch
   * - Amount phải nhân 100
   * - OrderInfo phải sanitize (loại bỏ ký tự đặc biệt)
   *
   * @param {Object} paymentData - Dữ liệu thanh toán
   * @returns {Promise<Object>} {success, data: {redirectUrl, transactionRef, requestData}}
   */
  async createPaymentUrl(paymentData) {
    try {
      this.validateConfig();

      const {
        orderId,
        amount,
        description,
        customer = {},
        metadata = {},
        clientIp,
      } = paymentData;

      // Validate required fields
      if (!orderId || !amount) {
        throw new Error('Missing required fields: orderId, amount');
      }

      // Validate clientIp - REQUIRED (no fallback)
      if (!clientIp) {
        throw new Error('Missing required field: clientIp - Must provide actual client IP from request');
      }

      // Validate description - REQUIRED (no fallback)
      if (!description) {
        throw new Error('Missing required field: description - Must provide payment description');
      }

      // Chuẩn bị dữ liệu gửi tới VNPAY
      const ipAddress = clientIp; // IP khách hàng (từ req) - không có fallback
      const createDate = this.formatDate(new Date());

      const txnRef = this.generateTransactionRef(orderId);

      // ============================================
      // Xử lý OrderInfo - Replace khoảng trắng bằng dấu +
      // ✅ VNPAY spec: spaces → + (not %20 or removed)
      // Ref: PowerShell test script verified working
      // ============================================
      let sanitizedDescription = description;
      // Replace whitespace với + (giống VNPAY standard)
      sanitizedDescription = sanitizedDescription
        .trim()
        .replace(/\s+/g, '+'); // Khoảng trắng → dấu +

      // Danh sách các tham số BẮT BUỘC tham gia vào chuỗi băm (SecureHash)
      // VNPAY 2.1.0 chỉ cho phép các tham số này
      // Email và PhoneNumber KHÔNG được đưa vào chuỗi băm!
      // ⚠️ VNPAY REQUIREMENT: Tất cả values PHẢI là STRING
      // ✅ PowerShell test script verified: using "other" for vnp_OrderType (not "190000")
      const vnpayDataForHash = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.config.partnerId,
        vnp_Amount: String(this.normalizeAmount(amount)), // ✅ PHẢI convert sang STRING (phải nhân 100)
        vnp_CurrCode: 'VND',
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: sanitizedDescription,
        vnp_OrderType: 'other', // ✅ Updated from "190000" based on verified PowerShell test
        vnp_Locale: 'vn', // Ngôn ngữ VN
        vnp_ReturnUrl: this.config.returnUrl,
        vnp_IpAddr: ipAddress,
        vnp_CreateDate: createDate,
      };

      // Loại bỏ tất cả undefined/null values
      const cleanedData = Object.fromEntries(
        Object.entries(vnpayDataForHash).filter(([_, value]) => value !== null && value !== undefined)
      );

      // ============================================
      // BƯỚC 1: Sắp xếp param theo thứ tự alphabet (VNPAY 2026 requirement)
      // ============================================
      const sortedData = this.sortObject(cleanedData);

      // ============================================
      // BƯỚC 2: Format chuỗi dữ liệu để tính chữ ký
      // ✅ VNPAY 2026 Requirement (PowerShell verified):
      // - vnp_OrderInfo: KHÔNG encode (giữ dấu +)
      // - Các param khác: PHẢI URL encode (theo URI standard)
      // Ví dụ: vnp_ReturnUrl=https%3A%2F%2Fmanln.online%2Freturn
      // ============================================
      const signatureData = this.createVnpaySignatureString(sortedData);

      // ============================================
      // BƯỚC 3: Tính HMAC-SHA512 signature (VNPAY 2026 requirement)
      // Công thức: HMAC-SHA512(secretKey, signatureData)
      // Kết quả: 128 ký tự hex string
      // ============================================
      const secretKey = this.config.partnerKey;
      const signature = this.createSignature(signatureData, secretKey, 'sha512');

      // ============================================
      // BƯỚC 4: Thêm signature vào URL
      // Chú ý: Email/Phone KHÔNG được thêm vào URL (gây lỗi Code 99)
      // VNPAY sẽ reject nếu có extra parameter không nằm trong hash
      // ============================================
      let finalUrlParams = { ...sortedData, vnp_SecureHash: signature };

      // ============================================
      // BƯỚC 5: Tạo URL redirect cuối cùng
      // ✅ VNPAY 2026 Requirement:
      // - Dấu + trong vnp_OrderInfo PHẢI giữ nguyên (KHÔNG encode thành %2B)
      // - Phải khớp với chuỗi đã dùng để băm signature
      // - Các param khác: Standard URL encoding (%20 → +)
      //
      // ⚠️  CRITICAL: Signature hash KHÔNG được replace/modify!
      // Chỉ replace dấu + trong các params bình thường, KHÔNG signature
      // ============================================

      // Tách signature ra riêng
      const { vnp_SecureHash, ...paramsWithoutHash } = finalUrlParams;

      // Build query string từ các params (KHÔNG có signature)
      let queryParams = Object.keys(paramsWithoutHash)
        .map(key => {
          const value = String(paramsWithoutHash[key]);
          // ✅ Custom encoding: giữ lại dấu +, không encode thành %2B
          // encodeURIComponent biến + thành %2B, nên ta replace lại
          const encoded = encodeURIComponent(value).replace(/%2B/g, '+');
          return `${key}=${encoded}`;
        })
        .join('&');

      // Thêm signature vào cuối (KHÔNG encode, giữ nguyên hex string)
      const redirectUrl = `${this.config.endpoint}?${queryParams}&vnp_SecureHash=${vnp_SecureHash}`;

      console.log(`✅ VNPAY payment URL created - Order: ${sortedData.vnp_TxnRef}`);

      return {
        success: true,
        data: {
          redirectUrl,
          transactionRef: sortedData.vnp_TxnRef,
          requestData: sortedData,
        },
      };
    } catch (error) {
      console.error(`[${this.gatewayName}.createPaymentUrl] Error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify HMAC-SHA512 signature từ VNPAY webhook (VNPAY 2026 Compliant)
   * ================================================================
   *
   * Dùng để xác thực rằng webhook được gửi từ VNPAY, không phải attacker
   *
   * Các bước:
   * 1. Loại bỏ vnp_SecureHash khỏi dữ liệu
   * 2. Loại bỏ vnp_Email, vnp_PhoneNumber (không tham gia vào signature)
   * 3. Sắp xếp lại theo thứ tự alphabet
   * 4. Format thành chuỗi: key1=value1&key2=value2&...
   * 5. Tính HMAC-SHA512 với secret key
   * 6. So sánh với vnp_SecureHash từ VNPAY
   *
   * ⚠️ QUAN TRỌNG:
   * - Phải loại bỏ email/phone vì chúng KHÔNG tham gia vào hash
   * - Sắp xếp PHẢI theo alphabet A-Z
   * - KHÔNG được URL encode khi tính signature
   *
   * @param {Object} webhookData - Dữ liệu webhook từ VNPAY
   * @param {String} signature - vnp_SecureHash từ VNPAY
   * @returns {Promise<Object>} {valid: Boolean, data?: Object, error?: String}
   */
  async verifyChecksum(webhookData, signature) {
    try {
      // ============================================
      // BƯỚC 1: Loại bỏ vnp_SecureHash khỏi dữ liệu
      // ============================================
      const { vnp_SecureHash, ...dataToVerify } = webhookData;

      // ============================================
      // BƯỚC 2: Loại bỏ vnp_Email và vnp_PhoneNumber
      // (những field này KHÔNG tham gia vào hash)
      // ============================================
      const { vnp_Email, vnp_PhoneNumber, ...dataForVerify } = dataToVerify;

      // ============================================
      // BƯỚC 3: Sắp xếp theo alphabet A-Z (VNPAY 2026 requirement)
      // ============================================
      const sortedData = this.sortObject(dataForVerify);

      // ============================================
      // BƯỚC 4: Format thành chuỗi signature data
      // ⚠️ QUAN TRỌNG: IPN verification khác với URL creation!
      //
      // Express.js đã decode query string:
      // - URL Query: vnp_OrderInfo=Thanh+toan+...
      // - Express req.query: {vnp_OrderInfo: "Thanh toan ..."}
      //
      // Nên khi verify, KHÔNG được encode lại - chỉ nối đơn giản
      // ============================================
      const signatureData = this.createVnpayIpnSignatureString(sortedData);

      // ============================================
      // BƯỚC 5: Tính HMAC-SHA512 signature
      // ============================================
      const expectedSignature = this.createSignature(signatureData, this.config.partnerKey, 'sha512');

      // ============================================
      // BƯỚC 6: So sánh signature (case-insensitive)
      // ⚠️ VNPAY trả về lowercase, code tính là uppercase
      // Nên so sánh bằng .toLowerCase()
      // ============================================
      const receivedSigLower = String(vnp_SecureHash).toLowerCase();
      const expectedSigLower = expectedSignature.toLowerCase();

      if (receivedSigLower !== expectedSigLower) {
        console.error(`❌ VNPAY signature verification failed`);
        return {
          valid: false,
          error: 'Invalid signature - Webhook verification failed. Check secret key and parameter sorting.',
        };
      }

      return {
        valid: true,
        data: webhookData,
      };
    } catch (error) {
      console.error(`[${this.gatewayName}.verifyChecksum] Error:`, error.message);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Xử lý IPN callback từ VNPAY (Instant Payment Notification)
   * ========================================================
   *
   * IPN là webhook callback từ VNPAY để thông báo kết quả thanh toán
   * VNPAY sẽ POST tới callbackUrl với dữ liệu giao dịch
   *
   * Các bước:
   * 1. Verify signature từ VNPAY (xác thực webhook là thật)
   * 2. Parse response code thành status (success/failed/cancelled/etc.)
   * 3. Lấy thông tin giao dịch từ ipnData
   * 4. Cập nhật trạng thái order trong database
   * 5. Trả về response 200 để VNPAY biết đã nhận được webhook
   *
   * ⚠️ QUAN TRỌNG:
   * - Phải verify signature trước, không sẽ bị hack
   * - Phải return 200 để VNPAY stop gửi lại webhook
   * - Phải handle duplicate IPN (VNPAY có thể gửi nhiều lần)
   * - IPN là server-to-server, không phải user redirect
   *
   * @param {Object} ipnData - Dữ liệu từ VNPAY webhook
   * @returns {Promise<Object>} {success, transaction: {...}}
   */
  async handleIPN(ipnData) {
    try {
      // ============================================
      // BƯỚC 1: Verify signature (xác thực webhook là thật)
      // ============================================
      const verifyResult = await this.verifyChecksum(ipnData, ipnData.vnp_SecureHash);
      if (!verifyResult.valid) {
        return {
          success: false,
          error: verifyResult.error,
        };
      }

      // ============================================
      // BƯỚC 2: Parse dữ liệu từ IPN
      // ============================================
      const responseCode = ipnData.vnp_ResponseCode; // '00' = thành công
      const transactionStatus = this.supportedStatus[responseCode] || 'unknown';
      const amount = parseInt(ipnData.vnp_Amount) / 100; // VNPAY trả lại amount * 100, cần chia lại
      const orderId = this.extractOrderIdFromTxnRef(ipnData.vnp_TxnRef);

      // ============================================
      // BƯỚC 3: Xây dựng transaction object
      // ============================================
      const transaction = {
        gatewayTransactionId: ipnData.vnp_TransactionNo || ipnData.vnp_TxnRef,
        transactionRef: ipnData.vnp_TxnRef,
        status: transactionStatus,
        amount,
        orderId,
        description: ipnData.vnp_OrderInfo,
        bankCode: ipnData.vnp_BankCode,
        bankTranNo: ipnData.vnp_BankTranNo,
        cardType: ipnData.vnp_CardType, // 'ATM', 'QRCODE', 'INTCARD'
        payDate: this.parseVnpayDate(ipnData.vnp_PayDate),
        responseCode,
        metadata: {
          rawIpnData: ipnData,
        },
      };

      // ============================================
      // BƯỚC 4: Return success response
      // Backend sẽ dùng transaction object này để update order status
      // ============================================
      return {
        success: true,
        transaction,
      };
    } catch (error) {
      console.error(`[${this.gatewayName}.handleIPN] Error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Query transaction status từ VNPAY
   * Lưu ý: VNPAY không cung cấp query API công khai, phải dùng IPN
   * Cái này là mock/placeholder
   */
  async queryTransaction(transactionId) {
    try {
      // TODO: Nếu VNPAY hỗ trợ query API, implement ở đây
      // Hiện tại VNPAY chỉ hỗ trợ IPN callback, không có query API
      return {
        success: false,
        error: 'VNPAY does not support direct transaction query. Use IPN webhook instead.',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Refund - VNPAY refund API
   * Lưu ý: Refund VNPAY có quy tắc riêng (phải refund trong vòng N ngày)
   */
  async refund(refundData) {
    try {
      const { transactionId, amount, reason } = refundData;

      if (!transactionId || !amount) {
        return {
          success: false,
          error: 'Missing required fields: transactionId, amount',
        };
      }

      // TODO: Implement VNPAY refund API call
      // Hiện tại return placeholder
      return {
        success: false,
        error: 'VNPAY refund API not yet implemented',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ===== Helper Methods =====
   */

  /**
   * ✅ VNPAY 2026 Signature String Formatter - For Creating Payment URL
   *
   * Dùng cho việc TẠO URL thanh toán (tính signature để gửi cho VNPAY)
   *
   * VNPAY spec:
   * - vnp_OrderInfo: Giữ nguyên (có dấu +, KHÔNG URL encode)
   * - Các param khác: PHẢI URL encode theo URI standard
   *
   * @param {Object} sortedData - Dữ liệu đã sắp xếp
   * @returns {String} - Signature string sẵn sàng để hash
   */
  createVnpaySignatureString(sortedData) {
    const parts = [];

    Object.keys(sortedData).forEach(key => {
      const value = String(sortedData[key]);

      if (key === 'vnp_OrderInfo') {
        // ✅ vnp_OrderInfo: KHÔNG encode (đã có dấu + từ trước)
        parts.push(`${key}=${value}`);
      } else {
        // ✅ Các param khác: URL encode
        let encoded = encodeURIComponent(value);
        // Replace %20 with + (standard querystring format)
        encoded = encoded.replace(/%20/g, '+');
        parts.push(`${key}=${encoded}`);
      }
    });

    return parts.join('&');
  }

  /**
   * ✅ VNPAY IPN Signature String Formatter - For Verifying IPN Callback (FIXED)
   *
   * Dùng cho việc KIỂM TRA chữ ký từ IPN callback (dữ liệu đã được decode)
   *
   * ⚠️ CRITICAL FIX: Express.js tự động decode query string
   * - Query string từ URL: `vnp_OrderInfo=Thanh+toan+...` (dấu +)
   * - Express decode thành: `vnp_OrderInfo: "Thanh toan ..."` (khoảng trắng)
   *
   * VNPAY tính signature với dấu +, không phải khoảng trắng!
   * Nên khi verify, PHẢI encode lại để khớp với signature của VNPAY:
   * - Khoảng trắng → + (standard form encoding)
   * - Ký tự đặc biệt khác → %XX (URL encoding)
   *
   * @param {Object} sortedData - Dữ liệu webhook đã decode (từ Express req.query)
   * @returns {String} - Signature string để verify (encoded đúng theo VNPAY)
   */
  createVnpayIpnSignatureString(sortedData) {
    const parts = [];

    Object.keys(sortedData).forEach(key => {
      const value = String(sortedData[key]);
      // ✅ FIX: Re-encode theo cách VNPAY tính signature
      // 1. encodeURIComponent xử lý ký tự đặc biệt
      // 2. %20 (space encoded) → + (standard querystring format)
      let encoded = encodeURIComponent(value);
      encoded = encoded.replace(/%20/g, '+');

      parts.push(`${key}=${encoded}`);
    });

    return parts.join('&');
  }

  /**
   * Sắp xếp object theo key alphabet
   */
  sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    keys.forEach(key => {
      sorted[key] = obj[key];
    });
    return sorted;
  }

  /**
   * Format ngày tháng theo YYYYMMDDHHMMSS (định dạng VNPAY)
   */
  formatDate(date) {
    // Format theo Vietnam timezone (GMT+7) cho VNPAY
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getValue = (type) => {
      const part = parts.find(p => p.type === type);
      return part ? part.value : '00';
    };

    const year = getValue('year');
    const month = getValue('month');
    const day = getValue('day');
    const hour = getValue('hour');
    const minute = getValue('minute');
    const second = getValue('second');

    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Parse VNPAY date format (YYYYMMDDHHMMSS) thành Date object
   */
  parseVnpayDate(dateString) {
    if (!dateString || dateString.length !== 14) {
      return null;
    }
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6));
    const day = parseInt(dateString.substring(6, 8));
    const hours = parseInt(dateString.substring(8, 10));
    const minutes = parseInt(dateString.substring(10, 12));
    const seconds = parseInt(dateString.substring(12, 14));
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  /**
   * Extract orderId từ vnp_TxnRef
   * TxnRef format: orderId-timestamp
   */
  extractOrderIdFromTxnRef(txnRef) {
    if (!txnRef) return null;
    const parts = txnRef.split('-');
    return parts[0]; // Trả về orderId (phần đầu)
  }
}

module.exports = VnpayAdapter;
