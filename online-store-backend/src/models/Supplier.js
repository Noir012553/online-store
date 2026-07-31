/**
 * Model nhà cung cấp
 * Quản lý: tên, liên hệ
 * Cung cấp sản phẩm cho hệ thống, soft delete
 */

const mongoose = require('mongoose');

/**
 * Schema cho nhà cung cấp
 *
 * @field {String} name - Tên nhà cung cấp (duy nhất, bắt buộc)
 *   Ví dụ: TechCorp, ElectroHub, Gadget World, Digital Store...
 * @field {String} phone - Số điện thoại liên hệ (bắt buộc)
 * @field {String} email - Email liên hệ (duy nhất, bắt buộc)
 * @field {String} description - Mô tả nhà cung cấp
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {name, isDeleted} - Tìm nhà cung cấp theo tên + filter xóa mềm
 */
const supplierSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
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

// Indexes để tối ưu query (unique: true tự động tạo index, không cần thêm)
supplierSchema.index({ name: 1, isDeleted: 1 });

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
