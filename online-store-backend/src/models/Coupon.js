/**
 * Model mã giảm giá (coupon)
 * Quản lý mã khuyến mãi: percentage, fixed amount, có giới hạn sử dụng
 * Hỗ trợ áp dụng cho sản phẩm/danh mục cụ thể, date range, soft delete
 */

const mongoose = require('mongoose');

/**
 * Schema cho mã giảm giá/coupon
 * 
 * @field {String} code - Mã coupon (duy nhất, bắt buộc, auto uppercase)
 *   Ví dụ: SUMMER20, WELCOME100, FLASH15, VIP50
 * @field {String} description - Mô tả mã giảm giá
 * @field {String} discountType - Loại giảm giá: 'percentage' (%) hoặc 'fixed' (số tiền cố định)
 * @field {Number} discountValue - Giá trị giảm giá
 *   - Nếu percentage: 20 (tức 20%)
 *   - Nếu fixed: 100000 (tức 100,000 VND)
 * @field {Number} maxUses - Số lần sử dụng tối đa (mặc định: 100)
 * @field {Number} currentUses - Số lần đã sử dụng (mặc định: 0)
 * @field {Number} minOrderAmount - Số tiền đơn hàng tối thiểu để áp dụng (mặc định: 0)
 * @field {Array} applicableProducts - Danh sách sản phẩm áp dụng (ref: Product)
 *   Nếu rỗng: áp dụng cho tất cả sản phẩm
 * @field {Array} applicableCategories - Danh sách danh mục áp dụng (ref: Category)
 *   Nếu rỗng: áp dụng cho tất cả danh mục
 * @field {Date} startDate - Ngày bắt đầu áp dụng (bắt buộc)
 * @field {Date} endDate - Ngày kết thúc áp dụng (bắt buộc)
 * @field {Boolean} isActive - Đang hoạt động (mặc định: true)
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 * 
 * @index {isActive, isDeleted} - Tìm coupon đang hoạt động + filter xóa mềm
 * @index {startDate, endDate} - Tìm coupon theo khoảng thời gian
 * 
 * @validation
 *   - discountValue >= 0 (min: 0)
 *   - currentUses <= maxUses (kiểm tra trong controller)
 *   - startDate < endDate (kiểm tra trong controller)
 */
const couponSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: '',
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxUses: {
      type: Number,
      required: true,
      default: 100,
    },
    currentUses: {
      type: Number,
      default: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes để tối ưu query (unique: true tự động tạo index, không cần thêm)
couponSchema.index({ isActive: 1, isDeleted: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
