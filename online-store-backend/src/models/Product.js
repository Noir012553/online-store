/**
 * Model sản phẩm laptop
 * Quản lý: tên, ảnh, giá, kho, thương hiệu, danh mục, nhà cung cấp
 * Hỗ trợ review, rating, tìm kiếm, lọc, soft delete
 */

const mongoose = require('mongoose');

/**
 * Schema cho sản phẩm laptop
 *
 * @field {ObjectId} user - ID admin tạo sản phẩm (ref: User)
 * @field {String} name - Tên sản phẩm (bắt buộc)
 * @field {String} image - Đường dẫn ảnh sản phẩm chính (bắt buộc)
 * @field {Array} images - Danh sách ảnh sản phẩm (URLs)
 * @field {String} brand - Nhãn hiệu: Dell, HP, Lenovo, ASUS, Apple...
 * @field {ObjectId} category - ID danh mục sản phẩm (ref: Category, bắt buộc)
 * @field {String} description - Mô tả chi tiết sản phẩm (bắt buộc)
 * @field {Array} features - Danh sách các tính năng nổi bật
 * @field {Object} specs - Thông số kỹ thuật: cpu, ram, storage, display, gpu, os, weight, battery
 * @field {Array} reviews - Danh sách đánh giá (ref: Review)
 * @field {Number} rating - Điểm đánh giá trung bình (0-5)
 * @field {Number} numReviews - Tổng số đánh giá
 * @field {Number} price - Giá sản phẩm (VND, bắt buộc)
 * @field {Number} originalPrice - Giá gốc trước khuyến mãi (VND)
 * @field {Number} countInStock - Số lượng tồn kho
 * @field {ObjectId} supplier - ID nhà cung cấp (ref: Supplier, bắt buộc)
 * @field {Boolean} featured - Sản phẩm nổi bật (mặc định: false)
 * @field {Object} deal - Khuyến mãi: { discount (%), endTime (Date) }
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {name, isDeleted} - Tìm sản phẩm theo tên + filter xóa mềm
 * @index {category} - Tìm sản phẩm theo danh mục
 * @index {brand} - Tìm sản phẩm theo nhãn hiệu
 * @index {isDeleted} - Filter xóa mềm
 */
const productSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    images: [
      {
        type: String,
      },
    ],
    brand: {
      type: String,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Category',
    },
    description: {
      type: String,
      required: true,
    },
    features: [
      {
        type: String,
      },
    ],
    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    reviews: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review',
      },
    ],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    originalPrice: {
      type: Number,
    },
    countInStock: {
      type: Number,
      required: true,
      default: 0,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Supplier',
    },
    featured: {
      type: Boolean,
      default: false,
    },
    deal: {
      discount: {
        type: Number,
      },
      endTime: {
        type: Date,
      },
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
productSchema.index({ name: 1, isDeleted: 1 });
productSchema.index({ category: 1, isDeleted: 1 });
productSchema.index({ brand: 1, isDeleted: 1 });
productSchema.index({ isDeleted: 1 });
productSchema.index({ price: 1, isDeleted: 1 });
productSchema.index({ countInStock: 1, isDeleted: 1 });
productSchema.index({ featured: 1, isDeleted: 1 });
productSchema.index({ rating: -1, isDeleted: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
