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
        name: { type: String, required: true },
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
      enum: ['cod', 'card', 'bank_transfer', 'e_wallet'],
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

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
