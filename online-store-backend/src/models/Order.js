/**
 * Model đơn hàng
 * Quản lý: order items, order status
 * Hỗ trợ soft delete
 */

const mongoose = require('mongoose');

/**
 * Schema cho đơn hàng
 *
 * @field {ObjectId} user - ID người dùng tạo đơn hàng (ref: User, optional)
 * @field {ObjectId} customer - ID khách hàng (ref: Customer, optional) - Dùng khi checkout không có tài khoản
 * @field {Array} orderItems - Danh sách sản phẩm trong đơn
 *   - {String} name - Tên sản phẩm
 *   - {Number} qty - Số lượng
 *   - {String} image - Ảnh sản phẩm
 *   - {Number} price - Giá tại thời điểm order
 *   - {ObjectId} product - ID sản phẩm (ref: Product)
 * @field {Number} taxPrice - Tiền thuế
 * @field {Number} totalPrice - Tổng tiền
 * @field {String} currencyCode - Mã tiền tệ khi tạo order (VND, USD, EUR, SEK) - PHASE 3
 * @field {Array} exchangeRates - Tỷ giá tại thời điểm tạo order (để tracking history) - PHASE 3
 *   - {String} fromCode - Tiền tệ nguồn
 *   - {String} toCode - Tiền tệ đích
 *   - {Number} rate - Tỷ giá
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {user, isDeleted} - Tìm đơn hàng theo user + filter xóa mềm
 */
const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    orderItems: [
      {
        name: {
          type: String,
          required: true,
        },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'Product',
        },
      },
    ],
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    discount: {
      type: Number,
      required: true,
      default: 0,
    },
    appliedCoupon: {
      code: String,
      couponId: mongoose.Schema.Types.ObjectId,
      couponCurrencyCode: String,
      discountType: String,
      discountValue: Number,
      couponMinOrderAmount: Number,
      baseMinOrderAmount: Number,
      baseDiscountAmount: Number,
      discountAmount: Number,
    },
    // Payment Status
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'card', 'bank_transfer', 'e_wallet', 'vnpay', 'momo'],
      default: 'cod',
    },
    // Delivery Status
    isDelivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    // Shipping Information
    shippingAddress: {
      name: String,
      phone: String,
      address: String,
      provinceId: Number,
      provinceName: String,
      districtId: Number,
      districtName: String,
      wardCode: String,
      wardName: String,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    providerShippingFee: {
      type: Number,
      default: 0,
    },
    providerInsuranceValue: {
      type: Number,
      default: 0,
    },
    providerCurrencyCode: {
      type: String,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    shippingProvider: {
      type: String,
      enum: ['ghn', 'ghtk', 'viettel', null],
      default: null,
    },
    shippingService: String, // e.g., "standard", "express"
    // Shipment Tracking
    shipmentStatus: {
      type: String,
      enum: ['pending', 'ready', 'picking', 'in_transit', 'delivered', 'cancelled', 'failed'],
      default: 'pending',
    },
    ghnOrderCode: String, // Mã đơn hàng từ GHN (e.g., "LWD8CF")
    ghnOrderCodeNorm: String, // Mã chuẩn hóa từ GHN
    trackingNumber: String, // Mã vận đơn
    shipmentCreatedAt: Date,
    expectedDeliveryTime: Date,
    shippingHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        description: String,
      },
    ],
    // For printing label
    printLabelToken: String,
    printLabelUrl: String,
    // Idempotency Key - Prevent duplicate order creation
    // Format: timestamp-random-random
    idempotencyKey: {
      type: String,
      index: true,
      sparse: true, // Only index non-null values
    },
    // PHASE 3: Historical Currency Accuracy
    // Lưu tiền tệ & tỷ giá khi tạo order để tracking lịch sử
    currencyCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
      index: true,
    },
    baseCurrencyCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    baseItemsPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    baseDiscount: {
      type: Number,
      required: true,
      default: 0,
    },
    baseTotalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    baseShippingFee: {
      type: Number,
      required: true,
      default: 0,
    },
    exchangeRateCapturedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    exchangeRates: [
      {
        fromCode: String,
        toCode: String,
        rate: Number,
        rateUpdatedAt: Date,
        _id: false, // Disable _id for subdocument
      },
    ],
    isDeleted: {
        type: Boolean,
        default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes để tối ưu query
orderSchema.index({ user: 1, isDeleted: 1 });
orderSchema.index({ customer: 1, isDeleted: 1 }); // Tối ưu query getMyOrders & historical orders
// Note: idempotencyKey index is already handled in field definition above with sparse: true

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
