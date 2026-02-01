/**
 * Model danh mục sản phẩm
 * Quản lý các danh mục: Laptops, Accessories, Peripherals, Software, Storage, Networking
 * Hỗ trợ soft delete, phân trang, tìm kiếm
 */

const mongoose = require('mongoose');

/**
 * Schema cho danh mục sản phẩm
 * 
 * @field {String} name - Tên danh mục (duy nhất, bắt buộc)
 *   Ví dụ: Laptops, Accessories, Peripherals, Software, Storage, Networking
 * @field {String} description - Mô tả danh mục
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 * 
 * @index {name, isDeleted} - Tìm danh mục theo tên + filter xóa mềm
 */
const categorySchema = mongoose.Schema(
  {
    name: {
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

// Indexes để tối ưu query
categorySchema.index({ name: 1, isDeleted: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
