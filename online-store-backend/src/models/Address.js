/**
 * Model địa chỉ giao hàng
 * Hỗ trợ multi-address per customer
 * Tích hợp với GHN để validate province/district/ward
 */

const mongoose = require('mongoose');

/**
 * Schema cho địa chỉ giao hàng
 *
 * @field {ObjectId} customer - ID khách hàng (ref: Customer, bắt buộc)
 * @field {String} fullName - Tên người nhận (bắt buộc)
 * @field {String} phone - Số điện thoại người nhận (bắt buộc)
 * @field {Number} provinceId - ID tỉnh/thành từ GHN
 * @field {String} provinceName - Tên tỉnh/thành
 * @field {Number} districtId - ID quận/huyện từ GHN
 * @field {String} districtName - Tên quận/huyện
 * @field {Number} wardId - ID phường/xã từ GHN
 * @field {String} wardName - Tên phường/xã
 * @field {String} street - Địa chỉ chi tiết (Số nhà, tên đường, etc.)
 * @field {String} zipCode - Mã bưu điện (không bắt buộc)
 * @field {String} addressType - Loại địa chỉ: 'home' / 'office' (mặc định: 'home')
 * @field {Boolean} isDefault - Địa chỉ mặc định (mặc định: false)
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {customer, isDeleted} - Tìm địa chỉ theo customer + filter xóa mềm
 * @index {customer, isDefault} - Tìm địa chỉ mặc định của customer
 */
const AddressSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^[0-9\-\+]{9,15}$/, 'Vui lòng nhập số điện thoại hợp lệ'],
    },
    provinceId: {
      type: Number,
      required: true,
    },
    provinceName: {
      type: String,
      required: true,
      trim: true,
    },
    districtId: {
      type: Number,
      required: true,
    },
    districtName: {
      type: String,
      required: true,
      trim: true,
    },
    wardId: {
      type: Number,
      required: true,
    },
    wardName: {
      type: String,
      required: true,
      trim: true,
    },
    street: {
      type: String,
      required: true,
      trim: true,
      minlength: [5, 'Địa chỉ phải có ít nhất 5 ký tự'],
    },
    zipCode: {
      type: String,
      trim: true,
    },
    addressType: {
      type: String,
      enum: {
        values: ['home', 'office'],
        message: 'Loại địa chỉ phải là "home" hoặc "office"',
      },
      default: 'home',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
AddressSchema.index({ customer: 1, isDeleted: 1 });
AddressSchema.index({ customer: 1, isDefault: 1 });

// Pre-save hook: Khi set address làm default, unset các address khác của customer
AddressSchema.pre('save', async function() {
  if (this.isDefault && !this.isDeleted) {
    await this.constructor.updateMany(
      { customer: this.customer, _id: { $ne: this._id }, isDeleted: false },
      { isDefault: false }
    );
  }
});

const Address = mongoose.model('Address', AddressSchema);

module.exports = Address;
