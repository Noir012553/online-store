/**
 * Model khách hàng
 * Khác với User: khách hàng có thể được tạo khi checkout mà không cần đăng ký
 * Quản lý liên hệ, upsert by phone number
 */

const mongoose = require('mongoose');

/**
 * Schema cho khách hàng
 * Khác với User vì khách hàng có thể tạo khi checkout mà không cần đăng ký account
 *
 * @field {String} name - Tên khách hàng (bắt buộc)
 * @field {String} email - Email khách hàng (duy nhất, bắt buộc, lowercase)
 * @field {String} phone - Số điện thoại khách hàng (bắt buộc)
 *   Được sử dụng làm primary key trong hệ thống upsert
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {phone, isDeleted} - Tìm khách hàng theo phone + filter xóa mềm (upsert operation)
 *
 * @logic UPSERT by Phone Number
 *   - Nếu phone tồn tại: Update thông tin khách hàng
 *   - Nếu phone chưa tồn tại: Tạo khách hàng mới
 *   Điều này giúp tránh trùng lặp khách hàng khi checkout
 */
const CustomerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes để tối ưu query
// Compound index for upsert by phone operation
CustomerSchema.index({ phone: 1, isDeleted: 1 });

// Partial unique index: email unique only for non-deleted customers
// This allows reusing emails of deleted customers
CustomerSchema.index(
  { email: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { isDeleted: false }
  }
);

const Customer = mongoose.model('Customer', CustomerSchema);

module.exports = Customer;
