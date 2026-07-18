/**
 * Controller quản lý đánh giá sản phẩm
 * Xử lý: CRUD review, phân trang, tìm kiếm, cập nhật rating sản phẩm
 * Mỗi người dùng chỉ review 1 sản phẩm một lần, soft/hard delete
 */
const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Product = require('../models/Product');
const { withTimeout } = require('../utils/mongooseUtils');
const { getMessage } = require('../i18n/messages');

const { getActiveLangCodes, getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');

/**
 * Lấy danh sách đánh giá sản phẩm với phân trang và tìm kiếm
 * @route GET /api/products/:productId/reviews?lang=<locale>
 * @access Public
 *
 * Rule #2 (Dynamic Data): Overlay role translation based on lang parameter
 * - Frontend passes ?lang=<locale> (one of SUPPORTED_LANGUAGES codes)
 * - Backend overlays role translation from document fields (role.vi, role.en, etc.)
 * - Fallback to default language if lang not supported or translation missing
 * - Frontend MUST add locale to useEffect dependency to re-fetch when lang changes
 */
const getProductReviews = asyncHandler(async (req, res) => {
  try {
    const defaultLang = getDefaultLanguage();
    const requestedLang = (req.query.lang || defaultLang.code).toLowerCase();
    const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang.code;
    const langUpper = lang.toUpperCase();
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
        .skip(pageSize * (page - 1))
        .lean(),
      8000
    );

    res.json({ reviews, page, pages: Math.ceil(count / pageSize), totalReviews: count });
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
  const { deleteOldFile } = require('../utils/fileCleanup');
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || req.lang || defaultLang.code).toLowerCase();
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.productId);

  if (product) {
    const alreadyReviewed = await Review.findOne({ product: req.params.productId, user: req.user._id, isDeleted: false });

    if (alreadyReviewed) {
      // Clean up uploaded file if review already exists
      if (req.file) {
        deleteOldFile(`/${req.file.path}`);
      }
      res.status(400);
      throw new Error(getMessage(lang, 'admin-controllers-messages.product_reviewed_by_user'));
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

    const ratingStats = await Review.aggregate([
      { $match: { product: product._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    product.numReviews = ratingStats[0]?.count || 0;
    product.rating = ratingStats[0]?.avgRating || 0;

    await product.save();
    res.status(201).json(createdReview);
  } else {
    // Clean up uploaded file if product not found
    if (req.file) {
      deleteOldFile(`/${req.file.path}`);
    }
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.product_not_found'));
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
  const { deleteOldFile } = require('../utils/fileCleanup');
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || req.lang || defaultLang.code).toLowerCase();
  const { rating, comment } = req.body;

  const review = await Review.findOne({ _id: req.params.id, user: req.user._id, isDeleted: false });

  if (review) {
    review.rating = rating || review.rating;
    review.comment = comment || review.comment;

    // Delete old avatar if new file is being uploaded
    if (req.file && review.avatar) {
      deleteOldFile(review.avatar);
    }

    // Update avatar if new file is provided
    if (req.file) {
      let relativeUrl = req.file.path;
      if (!relativeUrl.startsWith('/')) {
        relativeUrl = '/' + relativeUrl;
      }
      review.avatar = relativeUrl;
    }

    const updatedReview = await review.save();

    const product = await Product.findById(updatedReview.product);

    const ratingStats = await Review.aggregate([
      { $match: { product: product._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    product.numReviews = ratingStats[0]?.count || 0;
    product.rating = ratingStats[0]?.avgRating || 0;
    await product.save();

    res.json(updatedReview);
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.review_not_found_unauthorized'));
  }
});

/**
 * Xóa mềm đánh giá (Admin only)
 * Xóa file avatar nếu có, nhưng giữ lại bản ghi trong DB
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route DELETE /api/reviews/:id
 * @access Private/Admin
 */
const deleteReview = asyncHandler(async (req, res) => {
  const { deleteOldFile } = require('../utils/fileCleanup');
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || req.lang || defaultLang.code).toLowerCase();
  const review = await Review.findById(req.params.id);

  if (review) {
    // Delete associated avatar file
    if (review.avatar) {
      deleteOldFile(review.avatar);
    }

    review.isDeleted = true;
    await review.save();

    const product = await Product.findById(review.product);

    const ratingStats = await Review.aggregate([
      { $match: { product: product._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    product.numReviews = ratingStats[0]?.count || 0;
    product.rating = ratingStats[0]?.avgRating || 0;
    await product.save();

    res.json({ message: getMessage(lang, 'admin-controllers-messages.review_deleted') });
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.review_not_found'));
  }
});

/**
 * Xóa cứng đánh giá (Super Admin only)
 * Xóa vĩnh viễn khỏi database + xóa file avatar nếu có
 * Tự động cập nhật rating & numReviews của sản phẩm
 * @route DELETE /api/reviews/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteReview = asyncHandler(async (req, res) => {
  const { deleteOldFile } = require('../utils/fileCleanup');
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || req.lang || defaultLang.code).toLowerCase();
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.review_not_found'));
  }

  // Delete associated avatar file
  if (review.avatar) {
    deleteOldFile(review.avatar);
  }

  await review.deleteOne();

  const product = await Product.findById(review.product);

  const ratingStats = await Review.aggregate([
    { $match: { product: product._id, isDeleted: false } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  product.numReviews = ratingStats[0]?.count || 0;
  product.rating = ratingStats[0]?.avgRating || 0;
  await product.save();

  res.json({ message: getMessage(lang, 'admin-controllers-messages.review_permanently_deleted') });
});

module.exports = {
  getProductReviews,
  createProductReview,
  updateReview,
  deleteReview,
  hardDeleteReview,
};
