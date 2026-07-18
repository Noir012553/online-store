/**
 * Controller quản lý mã giảm giá (coupon)
 * Xử lý: CRUD coupon, tính toán giảm giá, soft delete
 * Hỗ trợ discount percentage/fixed, applicable products/categories, date range
 */
const asyncHandler = require('express-async-handler');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
const Coupon = require('../models/Coupon');
const Currency = require('../models/Currency');
const ExchangeRate = require('../models/ExchangeRate');
const { convertOrderAmount } = require('../utils/orderRevenue');
const {
  broadcastCouponCreated,
  broadcastCouponUpdated,
  broadcastCouponDeleted,
  broadcastCouponRestored,
} = require('../socket/socketHandler');

const isValidDiscountType = (value) => ['percentage', 'fixed'].includes(value);
const normalizeIdArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const toUpperTrimmedString = (value) => String(value || '').trim().toUpperCase();

const getActiveCurrencyCode = async (value) => {
  const code = toUpperTrimmedString(value);
  if (!code) return null;

  const currency = await Currency.findOne({ code, isActive: true }, { code: 1, _id: 0 }).lean();
  return currency?.code || null;
};

const convertCouponAmount = (amount, fromCode, toCode, exchangeRates) =>
  Math.round(convertOrderAmount(amount, fromCode, toCode, exchangeRates) * 100) / 100;

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
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;

  const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false })
    .populate('applicableProducts', 'name')
    .populate('applicableCategories', 'name');

  if (coupon) {
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'coupons.error_not_found'));
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
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
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
    throw new Error(getMessage(lang, 'coupons.error_not_found_or_expired'));
  }

  if (coupon.currentUses >= coupon.maxUses) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_usage_limit_reached'));
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
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const {
    code,
    description,
    discountType,
    discountValue,
    maxUses,
    minOrderAmount,
    currencyCode,
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
  const nextCurrencyCode = toUpperTrimmedString(currencyCode);
  const nextStartDate = new Date(startDate);
  const nextEndDate = new Date(endDate);
  const nextApplicableProducts = normalizeIdArray(applicableProducts);
  const nextApplicableCategories = normalizeIdArray(applicableCategories);

  if (!nextCode || !nextCurrencyCode || !isValidDiscountType(nextDiscountType) || !Number.isFinite(nextDiscountValue) || !Number.isFinite(nextMaxUses) || !Number.isFinite(nextMinOrderAmount) || Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_missing_fields'));
  }

  const couponCurrency = await Currency.findOne({ code: nextCurrencyCode, isActive: true }, { _id: 1 }).lean();
  if (!couponCurrency) {
    res.status(400);
    throw new Error('currencyCode must reference an active currency');
  }

  if (nextDiscountType === 'percentage' && nextDiscountValue > 100) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_discount_percent_limit'));
  }

  if (nextDiscountValue <= 0) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_discount_positive'));
  }

  if (nextMaxUses < 1) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_max_uses_invalid'));
  }

  if (nextMinOrderAmount < 0) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_min_order_invalid'));
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_date_invalid'));
  }

  const couponExists = await Coupon.findOne({
    code: nextCode,
    isDeleted: false,
  });

  if (couponExists) {
    res.status(400);
    throw new Error(getMessage(lang, 'coupons.error_code_already_exists'));
  }

  const coupon = new Coupon({
    code: nextCode,
    description,
    discountType: nextDiscountType,
    discountValue: nextDiscountValue,
    maxUses: nextMaxUses,
    minOrderAmount: nextMinOrderAmount,
    currencyCode: nextCurrencyCode,
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
        currencyCode: createdCoupon.currencyCode,
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
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_not_found'));
  }

  const nextCode = req.body.code !== undefined ? toUpperTrimmedString(req.body.code) : coupon.code;
  const nextDiscountType = req.body.discountType !== undefined ? req.body.discountType : coupon.discountType;
  const nextDiscountValue = req.body.discountValue !== undefined ? Number(req.body.discountValue) : coupon.discountValue;
  const nextMaxUses = req.body.maxUses !== undefined ? Number(req.body.maxUses) : coupon.maxUses;
  const nextMinOrderAmount = req.body.minOrderAmount !== undefined ? Number(req.body.minOrderAmount) : coupon.minOrderAmount;
  const nextCurrencyCode = req.body.currencyCode !== undefined ? toUpperTrimmedString(req.body.currencyCode) : coupon.currencyCode;
  const nextApplicableProducts = req.body.applicableProducts !== undefined ? normalizeIdArray(req.body.applicableProducts) : coupon.applicableProducts;
  const nextApplicableCategories = req.body.applicableCategories !== undefined ? normalizeIdArray(req.body.applicableCategories) : coupon.applicableCategories;
  const nextStartDate = req.body.startDate !== undefined ? new Date(req.body.startDate) : coupon.startDate;
  const nextEndDate = req.body.endDate !== undefined ? new Date(req.body.endDate) : coupon.endDate;
  const nextIsActive = req.body.isActive !== undefined ? req.body.isActive : coupon.isActive;

  if (!nextCode || !nextCurrencyCode || !isValidDiscountType(nextDiscountType) || !Number.isFinite(nextDiscountValue) || !Number.isFinite(nextMaxUses) || !Number.isFinite(nextMinOrderAmount) || Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.missing_invalid_fields'));
  }

  const couponCurrency = await Currency.findOne({ code: nextCurrencyCode, isActive: true }, { _id: 1 }).lean();
  if (!couponCurrency) {
    res.status(400);
    throw new Error('currencyCode must reference an active currency');
  }

  if (nextDiscountType === 'percentage' && nextDiscountValue > 100) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.percentage_discount_exceeds_100'));
  }

  if (nextDiscountValue <= 0) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.discount_value_greater_than_zero'));
  }

  if (nextMaxUses < 1) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.max_uses_at_least_one'));
  }

  if (nextMinOrderAmount < 0) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.min_order_amount_negative'));
  }

  if (nextStartDate >= nextEndDate) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.start_date_before_end_date'));
  }

  const couponExists = await Coupon.findOne({
    code: nextCode,
    isDeleted: false,
    _id: { $ne: coupon._id },
  });

  if (couponExists) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_code_exists'));
  }

  coupon.code = nextCode;
  coupon.description = req.body.description !== undefined ? req.body.description : coupon.description;
  coupon.discountType = nextDiscountType;
  coupon.discountValue = nextDiscountValue;
  coupon.maxUses = nextMaxUses;
  coupon.minOrderAmount = nextMinOrderAmount;
  coupon.currencyCode = nextCurrencyCode;
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
        currencyCode: updatedCoupon.currencyCode,
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
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_not_found'));
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

  res.json({ message: getMessage(lang, 'admin-controllers-messages.coupon_deleted') });
});

const restoreCoupon = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_not_found'));
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

  res.json({ message: getMessage(lang, 'admin-controllers-messages.coupon_restored'), coupon });
});

/**
 * Xóa cứng mã giảm giá (Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/coupons/:id/hard
 * @access Private/Admin
 */
const hardDeleteCoupon = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_not_found'));
  }

  await Coupon.findByIdAndDelete(req.params.id);

  res.json({ message: getMessage(lang, 'admin-controllers-messages.coupon_permanently_deleted') });
});

/**
 * Tính toán giá trị giảm giá cho đơn hàng
 * Kiểm tra điều kiện áp dụng, tính giá cuối cùng
 * @route POST /api/coupons/calculate
 * @access Public
 */
const calculateDiscount = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage().code;
  const requestedLang = req.query.lang || defaultLang;
  const lang = isSupportedLanguage(requestedLang) ? requestedLang : defaultLang;
  const { couponCode, orderAmount, orderCurrencyCode, products } = req.body;
  const normalizedOrderAmount = Number(orderAmount);
  const normalizedOrderCurrencyCode = await getActiveCurrencyCode(orderCurrencyCode);

  if (!couponCode || !Number.isFinite(normalizedOrderAmount) || normalizedOrderAmount < 0 || !normalizedOrderCurrencyCode) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_code_amount_required'));
  }

  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase(),
    isDeleted: false,
    isActive: true,
  });

  if (!coupon) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_not_found'));
  }

  const now = new Date();
  if (coupon.startDate > now || coupon.endDate < now) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_expired'));
  }

  if (coupon.currentUses >= coupon.maxUses) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.coupon_usage_limit_reached'));
  }

  const couponCurrencyCode = await getActiveCurrencyCode(coupon.currencyCode);
  if (!couponCurrencyCode) {
    res.status(400);
    throw new Error('Coupon currencyCode must reference an active currency');
  }

  const exchangeRates = await ExchangeRate.find(
    { isActive: true },
    { fromCode: 1, toCode: 1, rate: 1, _id: 0 }
  ).lean();
  const minimumOrderAmount = convertCouponAmount(
    coupon.minOrderAmount,
    couponCurrencyCode,
    normalizedOrderCurrencyCode,
    exchangeRates
  );

  if (normalizedOrderAmount < minimumOrderAmount) {
    res.status(400);
    throw new Error(`Order amount must be at least ${minimumOrderAmount} ${normalizedOrderCurrencyCode}`);
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

  const requestedDiscount = coupon.discountType === 'percentage'
    ? (normalizedOrderAmount * coupon.discountValue) / 100
    : convertCouponAmount(coupon.discountValue, couponCurrencyCode, normalizedOrderCurrencyCode, exchangeRates);
  const discount = Math.min(normalizedOrderAmount, requestedDiscount);
  const finalAmount = normalizedOrderAmount - discount;

  res.json({
    success: true,
    coupon: coupon.code,
    couponId: coupon._id.toString(),
    couponCurrencyCode,
    currencyCode: normalizedOrderCurrencyCode,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minimumOrderAmount,
    originalAmount: normalizedOrderAmount,
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
