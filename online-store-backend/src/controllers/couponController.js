/**
 * Controller quản lý mã giảm giá (coupon)
 * Xử lý: CRUD coupon, tính toán giảm giá, soft delete
 * Hỗ trợ discount percentage/fixed, applicable products/categories, date range
 */
const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');

/**
 * Lấy danh sách mã giảm giá (chỉ còn hạn và đang hoạt động)
 * @route GET /api/coupons
 * @access Public
 */
const getCoupons = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;

  const keyword = req.query.keyword
    ? { code: { $regex: req.query.keyword, $options: 'i' } }
    : {};

  const query = { ...keyword, isDeleted: false, isActive: true };
  const now = new Date();
  query.startDate = { $lte: now };
  query.endDate = { $gte: now };

  const count = await Coupon.countDocuments(query);
  const coupons = await Coupon.find(query)
    .populate('applicableProducts', 'name')
    .populate('applicableCategories', 'name')
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ coupons, page, pages: Math.ceil(count / pageSize) });
});

/**
 * Lấy chi tiết mã giảm giá theo ID
 * @route GET /api/coupons/:id
 * @access Public
 */
const getCouponById = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false })
    .populate('applicableProducts', 'name')
    .populate('applicableCategories', 'name');

  if (coupon) {
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

/**
 * Xác thực và lấy mã giảm giá theo mã code
 * Kiểm tra còn hạn, đang hoạt động, chưa hết lượt sử dụng
 * @route GET /api/coupons/code/:code
 * @access Public
 */
const getCouponByCode = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const now = new Date();

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isDeleted: false,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate('applicableProducts', 'name price')
    .populate('applicableCategories', 'name');

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found or expired');
  }

  if (coupon.currentUses >= coupon.maxUses) {
    res.status(400);
    throw new Error('Coupon usage limit reached');
  }

  res.json(coupon);
});

/**
 * Tạo mã giảm giá mới (Admin only)
 * Hỗ trợ loại giảm giá theo % hoặc số tiền cố định
 * @route POST /api/coupons
 * @access Private/Admin
 */
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    maxUses,
    minOrderAmount,
    applicableProducts,
    applicableCategories,
    startDate,
    endDate,
  } = req.body;

  if (!code || !discountType || !discountValue || !startDate || !endDate) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  const couponExists = await Coupon.findOne({
    code: code.toUpperCase(),
    isDeleted: false,
  });

  if (couponExists) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  const coupon = new Coupon({
    code: code.toUpperCase(),
    description,
    discountType,
    discountValue,
    maxUses: maxUses || 100,
    minOrderAmount: minOrderAmount || 0,
    applicableProducts: applicableProducts || [],
    applicableCategories: applicableCategories || [],
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    isActive: true,
  });

  const createdCoupon = await coupon.save();

  res.status(201).json(createdCoupon);
});

/**
 * Cập nhật thông tin mã giảm giá (Admin only)
 * @route PUT /api/coupons/:id
 * @access Private/Admin
 */
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  coupon.description = req.body.description || coupon.description;
  coupon.discountValue = req.body.discountValue || coupon.discountValue;
  coupon.maxUses = req.body.maxUses || coupon.maxUses;
  coupon.minOrderAmount = req.body.minOrderAmount || coupon.minOrderAmount;
  coupon.applicableProducts = req.body.applicableProducts || coupon.applicableProducts;
  coupon.applicableCategories = req.body.applicableCategories || coupon.applicableCategories;
  coupon.startDate = req.body.startDate ? new Date(req.body.startDate) : coupon.startDate;
  coupon.endDate = req.body.endDate ? new Date(req.body.endDate) : coupon.endDate;
  coupon.isActive = req.body.isActive !== undefined ? req.body.isActive : coupon.isActive;

  const updatedCoupon = await coupon.save();

  res.json(updatedCoupon);
});

/**
 * Xóa mềm mã giảm giá (Admin only)
 * @route DELETE /api/coupons/:id
 * @access Private/Admin
 */
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  coupon.isDeleted = true;
  await coupon.save();

  res.json({ message: 'Coupon deleted' });
});

/**
 * Xóa cứng mã giảm giá (Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/coupons/:id/hard
 * @access Private/Admin
 */
const hardDeleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  await Coupon.findByIdAndDelete(req.params.id);

  res.json({ message: 'Coupon permanently deleted' });
});

/**
 * Tính toán giá trị giảm giá cho đơn hàng
 * Kiểm tra điều kiện áp dụng, tính giá cuối cùng
 * @route POST /api/coupons/calculate
 * @access Public
 */
const calculateDiscount = asyncHandler(async (req, res) => {
  const { couponCode, orderAmount, products } = req.body;

  if (!couponCode || !orderAmount) {
    res.status(400);
    throw new Error('Coupon code and order amount required');
  }

  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase(),
    isDeleted: false,
    isActive: true,
  });

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  const now = new Date();
  if (coupon.startDate > now || coupon.endDate < now) {
    res.status(400);
    throw new Error('Coupon expired');
  }

  if (coupon.currentUses >= coupon.maxUses) {
    res.status(400);
    throw new Error('Coupon usage limit reached');
  }

  if (orderAmount < coupon.minOrderAmount) {
    res.status(400);
    throw new Error(`Order amount must be at least ${coupon.minOrderAmount}`);
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (orderAmount * coupon.discountValue) / 100;
  } else if (coupon.discountType === 'fixed') {
    discount = coupon.discountValue;
  }

  const finalAmount = Math.max(0, orderAmount - discount);

  res.json({
    coupon: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    originalAmount: orderAmount,
    discount,
    finalAmount,
  });
});

module.exports = {
  getCoupons,
  getCouponById,
  getCouponByCode,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  hardDeleteCoupon,
  calculateDiscount,
};
