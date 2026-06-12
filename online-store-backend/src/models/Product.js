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
 * @field {ObjectId} supplier - ID nhà cung cấp (ref: Supplier, tùy chọn)
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
/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - image
 *         - brand
 *         - category
 *       properties:
 *         _id:
 *           type: string
 *           description: ID của sản phẩm
 *         name:
 *           type: string
 *           description: Tên sản phẩm
 *         price:
 *           type: number
 *           description: Giá sản phẩm (VND)
 *         image:
 *           type: string
 *           description: Đường dẫn ảnh chính
 *         brand:
 *           type: string
 *           description: Thương hiệu
 *         category:
 *           type: object
 *           properties:
 *             _id: { type: string }
 *             name: { type: string }
 *         specs:
 *           type: object
 *           description: Thông số kỹ thuật chi tiết
 *           properties:
 *             cpu: { type: string }
 *             ram: { type: string }
 *             storage: { type: string }
 *             display: { type: string }
 *             gpu: { type: string }
 *             os: { type: string }
 *             weight: { type: string }
 *             battery: { type: string }
 *             switchType: { type: string }
 *             layout: { type: string }
 *             keycapMaterial: { type: string }
 *             connection: { type: string }
 *             maxDPI: { type: string }
 *             pollRate: { type: string }
 *             buttons: { type: string }
 *             mouseType: { type: string }
 *             driver: { type: string }
 *             frequency: { type: string }
 *             impedance: { type: string }
 *             cableLength: { type: string }
 *             type: { type: string }
 *             tdp: { type: string }
 *             fanSpeed: { type: string }
 *             noiseLevel: { type: string }
 *             condition: { type: string }
 *             led: { type: string }
 *             warranty: { type: string }
 *             sensor: { type: string }
 *             durability: { type: string }
 *             size: { type: string }
 *         countInStock:
 *           type: number
 *           description: Số lượng tồn kho
 *         rating:
 *           type: number
 *           description: Điểm đánh giá (0-5)
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
    imagePublicId: {
      type: String,
      default: null, // Cloudinary public ID để dễ xóa
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
      default: '',
    },
    features: [
      {
        type: String,
      }
    ],
    featuresTranslations: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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

// Text indexes để tối ưu full-text search (keyword search)
// Tìm kiếm trong name (both VI và EN), description, brand, features
// Weights: name (3x) > description (2x) > brand, features (1x)
productSchema.index(
  { 'name': 'text', description: 'text', brand: 'text', features: 'text' },
  { weights: { name: 3, description: 2, brand: 1, features: 1 }, default_language: 'none' }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
