/**
 * Controller quản lý mã giảm giá (coupon)
 * Xử lý: CRUD coupon, tính toán giảm giá, soft delete
 * Hỗ trợ discount percentage/fixed, applicable products/categories, date range
 */
const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');
const {
  broadcastCouponCreated,
  broadcastCouponUpdated,
  broadcastCouponDeleted,
  broadcastCouponRestored,
} = require('../socket/socketHandler');

const isValidDiscountType = (value) => ['percentage', 'fixed'].includes(value);
const normalizeIdArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const toUpperTrimmedString = (value) => String(value || '').trim().toUpperCase();

/**
 * Lấy danh sách mã giảm giá (chỉ còn hạn và đang hoạt động)
 * @route GET /api/coupons
 * @access Public
 */
const getCoupons = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 10;
  const page = Number(req.query.pageNumber) || 1;

  const keyword = req.query.keyword
    ? {
        $or: [
          { code: { $regex: req.query.keyword, $options: 'i' } },
          { description: { $regex: req.query.keyword, $options: 'i' } },
        ],
      }
    : {};

  const query = { ...keyword, isDeleted: false, isActive: true };
  const now = new Date();
  query.startDate = { $lte: now };
  query.endDate = { $gte: now };

  if (req.query.discountType && isValidDiscountType(req.query.discountType)) {
    query.discountType = req.query.discountType;
  }

  const count = await Coupon.countDocuments(query);
  const coupons = await Coupon.find(query)
    .populate('applicableProducts', 'name')
    .populate('applicableCategories', 'name')
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ coupons, page, pages: Math.ceil(count / pageSize), total: count });
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

const getDeletedCoupons = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 10;
  const page = Number(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        $or: [
          { code: { $regex: req.query.keyword, $options: 'i' } },
          { description: { $regex: req.query.keyword, $options: 'i' } },
        ],
      }
    : {};

  const query = { ...keyword, isDeleted: true };

  if (req.query.discountType && isValidDiscountType(req.query.discountType)) {
    query.discountType = req.query.discountType;
  }
  const count = await Coupon.countDocuments(query);
  const coupons = await Coupon.find(query)
    .populate('applicableProducts', 'name')
    .populate('applicableCategories', 'name')
    .sort({ updatedAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ coupons, page, pages: Math.ceil(count / pageSize), total: count });
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

  const nextCode = toUpperTrimmedString(code);
  const nextDiscountType = discountType;
  const nextDiscountValue = Number(discountValue);
  const nextMaxUses = maxUses !== undefined ? Number(maxUses) : 100;
  const nextMinOrderAmount = minOrderAmount !== undefined ? Number(minOrderAmount) : 0;
  const nextStartDate = new Date(startDate);
  const nextEndDate = new Date(endDate);
  const nextApplicableProducts = normalizeIdArray(applicableProducts);
  const nextApplicableCategories = normalizeIdArray(applicableCategories);

  if (!nextCode || !isValidDiscountType(nextDiscountType) || !Number.isFinite(nextDiscountValue) || !Number.isFinite(nextMaxUses) || !Number.isFinite(nextMinOrderAmount) || Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    res.status(400);
    throw new Error('Missing or invalid required fields');
  }

  if (nextDiscountType === 'percentage' && nextDiscountValue > 100) {
    res.status(400);
    throw new Error('Percentage discount cannot exceed 100');
  }

  if (nextDiscountValue <= 0) {
    res.status(400);
    throw new Error('Discount value must be greater than 0');
  }

  if (nextMaxUses < 1) {
    res.status(400);
    throw new Error('Max uses must be at least 1');
  }

  if (nextMinOrderAmount < 0) {
    res.status(400);
    throw new Error('Minimum order amount cannot be negative');
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error('Start date must be before end date');
  }

  const couponExists = await Coupon.findOne({
    code: nextCode,
    isDeleted: false,
  });

  if (couponExists) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  const coupon = new Coupon({
    code: nextCode,
    description,
    discountType: nextDiscountType,
    discountValue: nextDiscountValue,
    maxUses: nextMaxUses,
    minOrderAmount: nextMinOrderAmount,
    applicableProducts: nextApplicableProducts,
    applicableCategories: nextApplicableCategories,
    startDate: nextStartDate,
    endDate: nextEndDate,
    isActive: true,
  });

  const createdCoupon = await coupon.save();

  try {
    const io = req.app.get('io');
    if (io) {
      broadcastCouponCreated(io, {
        _id: createdCoupon._id,
        code: createdCoupon.code,
        description: createdCoupon.description,
        discountType: createdCoupon.discountType,
        discountValue: createdCoupon.discountValue,
        maxUses: createdCoupon.maxUses,
        minOrderAmount: createdCoupon.minOrderAmount,
        isActive: createdCoupon.isActive,
        startDate: createdCoupon.startDate,
        endDate: createdCoupon.endDate,
      });
    }
  } catch (err) {
    console.warn('[WARNING] Failed to broadcast coupon create:', err.message);
  }

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

  const nextCode = req.body.code !== undefined ? toUpperTrimmedString(req.body.code) : coupon.code;
  const nextDiscountType = req.body.discountType !== undefined ? req.body.discountType : coupon.discountType;
  const nextDiscountValue = req.body.discountValue !== undefined ? Number(req.body.discountValue) : coupon.discountValue;
  const nextMaxUses = req.body.maxUses !== undefined ? Number(req.body.maxUses) : coupon.maxUses;
  const nextMinOrderAmount = req.body.minOrderAmount !== undefined ? Number(req.body.minOrderAmount) : coupon.minOrderAmount;
  const nextApplicableProducts = req.body.applicableProducts !== undefined ? normalizeIdArray(req.body.applicableProducts) : coupon.applicableProducts;
  const nextApplicableCategories = req.body.applicableCategories !== undefined ? normalizeIdArray(req.body.applicableCategories) : coupon.applicableCategories;
  const nextStartDate = req.body.startDate !== undefined ? new Date(req.body.startDate) : coupon.startDate;
  const nextEndDate = req.body.endDate !== undefined ? new Date(req.body.endDate) : coupon.endDate;
  const nextIsActive = req.body.isActive !== undefined ? req.body.isActive : coupon.isActive;

  if (!nextCode || !isValidDiscountType(nextDiscountType) || !Number.isFinite(nextDiscountValue) || !Number.isFinite(nextMaxUses) || !Number.isFinite(nextMinOrderAmount) || Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    res.status(400);
    throw new Error('Missing or invalid fields');
  }

  if (nextDiscountType === 'percentage' && nextDiscountValue > 100) {
    res.status(400);
    throw new Error('Percentage discount cannot exceed 100');
  }

  if (nextDiscountValue <= 0) {
    res.status(400);
    throw new Error('Discount value must be greater than 0');
  }

  if (nextMaxUses < 1) {
    res.status(400);
    throw new Error('Max uses must be at least 1');
  }

  if (nextMinOrderAmount < 0) {
    res.status(400);
    throw new Error('Minimum order amount cannot be negative');
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error('Start date must be before end date');
  }

  const couponExists = await Coupon.findOne({
    code: nextCode,
    isDeleted: false,
    _id: { $ne: coupon._id },
  });

  if (couponExists) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  coupon.code = nextCode;
  coupon.description = req.body.description !== undefined ? req.body.description : coupon.description;
  coupon.discountType = nextDiscountType;
  coupon.discountValue = nextDiscountValue;
  coupon.maxUses = nextMaxUses;
  coupon.minOrderAmount = nextMinOrderAmount;
  coupon.applicableProducts = nextApplicableProducts;
  coupon.applicableCategories = nextApplicableCategories;
  coupon.startDate = nextStartDate;
  coupon.endDate = nextEndDate;
  coupon.isActive = nextIsActive;

  const updatedCoupon = await coupon.save();

  try {
    const io = req.app.get('io');
    if (io) {
      broadcastCouponUpdated(io, {
        _id: updatedCoupon._id,
        code: updatedCoupon.code,
        description: updatedCoupon.description,
        discountType: updatedCoupon.discountType,
        discountValue: updatedCoupon.discountValue,
        maxUses: updatedCoupon.maxUses,
        minOrderAmount: updatedCoupon.minOrderAmount,
        isActive: updatedCoupon.isActive,
        startDate: updatedCoupon.startDate,
        endDate: updatedCoupon.endDate,
      });
    }
  } catch (err) {
    console.warn('[WARNING] Failed to broadcast coupon update:', err.message);
  }

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

  try {
    const io = req.app.get('io');
    if (io) {
      broadcastCouponDeleted(io, coupon._id.toString());
    }
  } catch (err) {
    console.warn('[WARNING] Failed to broadcast coupon delete:', err.message);
  }

  res.json({ message: 'Coupon deleted' });
});

const restoreCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  coupon.isDeleted = false;
  await coupon.save();

  try {
    const io = req.app.get('io');
    if (io) {
      broadcastCouponRestored(io, {
        _id: coupon._id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxUses: coupon.maxUses,
        minOrderAmount: coupon.minOrderAmount,
        isActive: coupon.isActive,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
      });
    }
  } catch (err) {
    console.warn('[WARNING] Failed to broadcast coupon restore:', err.message);
  }

  res.json({ message: 'Coupon restored', coupon });
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

  if (coupon.discountType === 'percentage' && coupon.discountValue > 100) {
    res.status(400);
    throw new Error('Percentage discount cannot exceed 100');
  }

  if (coupon.applicableProducts.length > 0) {
    const selectedProductIds = Array.isArray(products)
      ? products.map((item) => {
          if (item && typeof item === 'object') {
            return String(item._id || item.product || item.id || item);
          }
          return String(item);
        })
      : [];

    if (selectedProductIds.length > 0) {
      const applicableProductIds = coupon.applicableProducts.map((item) => String(item));
      const hasApplicableProduct = selectedProductIds.some((id) => applicableProductIds.includes(id));

      if (!hasApplicableProduct) {
        res.status(400);
        throw new Error('Coupon does not apply to the selected products');
      }
    }
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (orderAmount * coupon.discountValue) / 100;
  } else if (coupon.discountType === 'fixed') {
    discount = coupon.discountValue;
  }

  const finalAmount = Math.max(0, orderAmount - discount);

  res.json({
    success: true,
    coupon: coupon.code,
    couponId: coupon._id.toString(),
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    originalAmount: orderAmount,
    discount,
    finalAmount,
    expiresAt: coupon.endDate,
    remainingUses: Math.max(0, coupon.maxUses - coupon.currentUses),
  });
});

module.exports = {
  getCoupons,
  getCouponById,
  getCouponByCode,
  getDeletedCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  restoreCoupon,
  hardDeleteCoupon,
  calculateDiscount,
};
