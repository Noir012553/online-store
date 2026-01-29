/**
 * Controller quản lý đánh giá sản phẩm
 * Xử lý: CRUD review, phân trang, tìm kiếm, cập nhật rating sản phẩm
 * Mỗi người dùng chỉ review 1 sản phẩm một lần, soft/hard delete
 */
const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Product = require('../models/Product');
const { withTimeout } = require('../utils/mongooseUtils');

/**
 * Lấy danh sách đánh giá sản phẩm với phân trang và tìm kiếm
 * @route GET /api/products/:productId/reviews
 * @access Public
 */
const getProductReviews = asyncHandler(async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 10;
    const page = parseInt(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
      ? {
          comment: { $regex: req.query.keyword, $options: 'i' },
        }
      : {};

    const count = await withTimeout(
      Review.countDocuments({ ...keyword, product: req.params.productId, isDeleted: false }),
      8000
    );
    const reviews = await withTimeout(
      Review.find({ ...keyword, product: req.params.productId, isDeleted: false })
        .populate('user', 'name')
        .limit(pageSize)
        .skip(pageSize * (page - 1)),
      8000
    );

    res.json({ reviews, page, pages: Math.ceil(count / pageSize) });
  } catch (error) {
    throw error;
  }
});

/**
 * Tạo đánh giá sản phẩm mới (Người dùng đăng nhập)
 * Mỗi người dùng chỉ có thể đánh giá 1 lần trên mỗi sản phẩm
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route POST /api/products/:productId/reviews
 * @access Private
 */
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.productId);

  if (product) {
    const alreadyReviewed = await Review.findOne({ product: req.params.productId, user: req.user._id, isDeleted: false });

    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed by this user');
    }

    // Use name from user, fallback to username if name is not set
    const reviewerName = req.user.name || req.user.username;

    const review = new Review({
      name: reviewerName,
      rating: Number(rating),
      comment,
      avatar: req.file ? `/${req.file.path}` : null,
      user: req.user._id,
      product: req.params.productId,
    });

    const createdReview = await review.save();

    const productReviews = await Review.find({ product: product._id, isDeleted: false });
    product.numReviews = productReviews.length;
    product.rating = productReviews.reduce((acc, item) => item.rating + acc, 0) / productReviews.length;

    await product.save();
    res.status(201).json(createdReview);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

/**
 * Cập nhật đánh giá sản phẩm
 * Chỉ người dùng đã viết đánh giá mới được cập nhật
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route PUT /api/reviews/:id
 * @access Private
 */
const updateReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const review = await Review.findOne({ _id: req.params.id, user: req.user._id, isDeleted: false });

  if (review) {
    review.rating = rating || review.rating;
    review.comment = comment || review.comment;

    const updatedReview = await review.save();

    const product = await Product.findById(updatedReview.product);
    const productReviews = await Review.find({ product: product._id, isDeleted: false });
    product.numReviews = productReviews.length;
    product.rating = productReviews.reduce((acc, item) => item.rating + acc, 0) / productReviews.length;
    await product.save();

    res.json(updatedReview);
  } else {
    res.status(404);
    throw new Error('Review not found or you are not authorized to update this review');
  }
});

/**
 * Xóa mềm đánh giá (Admin only)
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route DELETE /api/reviews/:id
 * @access Private/Admin
 */
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (review) {
    review.isDeleted = true;
    await review.save();

    const product = await Product.findById(review.product);
    const productReviews = await Review.find({ product: product._id, isDeleted: false });
    product.numReviews = productReviews.length;
    product.rating = productReviews.length > 0 ? productReviews.reduce((acc, item) => item.rating + acc, 0) / productReviews.length : 0;
    await product.save();

    res.json({ message: 'Review removed' });
  } else {
    res.status(404);
    throw new Error('Review not found');
  }
});

/**
 * Xóa cứng đánh giá (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route DELETE /api/reviews/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  await review.deleteOne();

  const product = await Product.findById(review.product);
  const productReviews = await Review.find({ product: product._id, isDeleted: false });
  product.numReviews = productReviews.length;
  product.rating = productReviews.length > 0 ? productReviews.reduce((acc, item) => item.rating + acc, 0) / productReviews.length : 0;
  await product.save();

  res.json({ message: 'Review permanently removed' });
});

module.exports = {
  getProductReviews,
  createProductReview,
  updateReview,
  deleteReview,
  hardDeleteReview,
};
