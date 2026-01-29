/**
 * Model giao dịch thanh toán
 * Quản lý: lịch sử thanh toán, gateway info, transaction ID
 * Hỗ trợ kiểm tra chữ ký (signature verification) và tracking
 */

const mongoose = require('mongoose');

/**
 * Schema cho giao dịch thanh toán
 *
 * @field {ObjectId} orderId - ID đơn hàng (ref: Order)
 * @field {String} gateway - Cổng thanh toán (vnpay, momo, stripe, paypal, etc.)
 * @field {Number} amount - Số tiền thanh toán (VND)
 * @field {String} currency - Đơn vị tiền tệ (VND, USD, etc.)
 * @field {String} status - Trạng thái thanh toán (pending, success, failed, cancelled)
 * @field {String} gatewayTransactionId - ID giao dịch từ gateway (e.g., VNPay TxnRef)
 * @field {String} gatewayOrderId - ID đơn hàng từ gateway (nếu có)
 * @field {Object} rawRequest - Dữ liệu gửi đi (tối ưu: không lưu sensitive data)
 * @field {Object} rawResponse - Dữ liệu response từ gateway
 * @field {String} redirectUrl - URL redirect cho gateway (VNPAY, MoMo...)
 * @field {String} callbackUrl - URL mà gateway gọi lại webhook
 * @field {Object} webhookData - Dữ liệu nhận từ webhook
 * @field {String} webhookSignature - Chữ ký webhook để verify (HMAC-SHA256/512)
 * @field {Boolean} webhookVerified - Chữ ký đã được xác thực
 * @field {Object} metadata - Dữ liệu bổ sung từng gateway
 * @field {String} failureReason - Lý do thất bại nếu status = failed
 * @field {Date} paidAt - Thời điểm thanh toán thành công
 * @field {Date} expiredAt - Thời điểm hết hạn thanh toán
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {orderId} - Tìm payment theo order
 * @index {gatewayTransactionId} - Tìm payment theo transaction ID từ gateway
 * @index {status} - Filter theo trạng thái
 * @index {gateway} - Filter theo gateway
 */
const paymentSchema = mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    gateway: {
      type: String,
      enum: ['vnpay', 'momo', 'stripe', 'paypal', 'bank_transfer', 'cod'],
      required: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['VND', 'USD', 'EUR'],
      default: 'VND',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'cancelled', 'expired'],
      default: 'pending',
      lowercase: true,
    },
    // Gateway Transaction Info
    gatewayTransactionId: {
      type: String,
      sparse: true, // cho phép NULL nhưng unique
      index: true,
    },
    gatewayOrderId: String,
    
    // Request/Response Data
    rawRequest: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    
    // Redirect & Callback
    redirectUrl: String,
    callbackUrl: String,
    
    // Webhook Verification
    webhookData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    webhookSignature: String,
    webhookVerified: {
      type: Boolean,
      default: false,
    },
    
    // Gateway-specific metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // Error/Status Info
    failureReason: String,
    failureCode: String,
    
    // Timing
    paidAt: Date,
    expiredAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes để tối ưu query
// Note: gatewayTransactionId đã được index trong schema definition (index: true)
// Không thêm lại ở đây để tránh duplicate index warning
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ gateway: 1, status: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
