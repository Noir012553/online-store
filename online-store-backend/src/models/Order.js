/**
 * Model đơn hàng
 * Quản lý: order items, shipping address, payment method, status tracking
 * Hỗ trợ soft delete, tracking paid/delivered status
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
 * @field {Object} shippingAddress - Địa chỉ giao hàng
 *   - {String} address - Địa chỉ cụ thể
 *   - {String} city - Tỉnh/thành phố
 *   - {String} postalCode - Mã bưu điện
 *   - {String} country - Quốc gia
 * @field {String} paymentMethod - Phương thức thanh toán (Credit Card, PayPal, COD...)
 * @field {Object} paymentResult - Kết quả thanh toán
 *   - {String} id - Transaction ID
 *   - {String} status - Trạng thái thanh toán
 *   - {String} update_time - Thời điểm cập nhật
 *   - {String} email_address - Email thanh toán
 * @field {Number} taxPrice - Tiền thuế
 * @field {Number} shippingPrice - Tiền vận chuyển
 * @field {Number} totalPrice - Tổng tiền
 * @field {Boolean} isPaid - Đã thanh toán (mặc định: false)
 * @field {Date} paidAt - Thời điểm thanh toán
 * @field {Boolean} isDelivered - Đã giao hàng (mặc định: false)
 * @field {Date} deliveredAt - Thời điểm giao hàng
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 * 
 * @index {user, isDeleted} - Tìm đơn hàng theo user + filter xóa mềm
 * @index {isPaid} - Tìm đơn hàng theo trạng thái thanh toán
 * @index {isDelivered} - Tìm đơn hàng theo trạng thái giao hàng
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
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    isDelivered: {
      type: Boolean,
      required: true,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
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
orderSchema.index({ isPaid: 1 });
orderSchema.index({ isDelivered: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
