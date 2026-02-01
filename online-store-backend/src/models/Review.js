/**
 * Model đánh giá sản phẩm
 * Mỗi user chỉ review 1 sản phẩm một lần
 * Quản lý rating (1-5), comment, cập nhật product rating trung bình
 */

const mongoose = require('mongoose');

/**
 * Schema cho đánh giá/bình luận sản phẩm
 *
 * @field {String} name - Tên người đánh giá (bắt buộc)
 * @field {Number} rating - Điểm đánh giá (1-5, bắt buộc)
 * @field {String} comment - Nội dung bình luận (bắt buộc)
 * @field {String} avatar - Đường dẫn ảnh avatar người review (URL)
 * @field {ObjectId} user - ID người dùng đánh giá (ref: User, bắt buộc)
 * @field {ObjectId} product - ID sản phẩm được đánh giá (ref: Product, bắt buộc)
 * @field {Boolean} isDeleted - Cờ xóa mềm (mặc định: false)
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {product, isDeleted} - Tìm đánh giá của sản phẩm + filter xóa mềm
 * @index {user} - Tìm đánh giá của người dùng
 *
 * @logic
 *   - Mỗi user chỉ có thể đánh giá 1 lần trên mỗi sản phẩm
 *   - Khi xóa/update review, tự động cập nhật rating & numReviews của Product
 *   - Avatar có thể upload từ form hoặc để trống (fallback dicebear)
 */
const reviewSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    avatar: {
      type: String,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
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
reviewSchema.index({ product: 1, isDeleted: 1 });
reviewSchema.index({ user: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
