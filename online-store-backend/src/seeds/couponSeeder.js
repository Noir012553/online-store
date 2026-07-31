/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Coupon = require('../models/Coupon');
const Currency = require('../models/Currency');
const CouponFactory = require('../factories/couponFactory');

/**
 * Seed dữ liệu mã giảm giá
 * Tạo 4 coupons với relationships đến products và categories
 * @param {Array} products - Danh sách products
 * @param {Array} categories - Danh sách categories
 */
const seedCoupons = async (products, categories) => {
  await Coupon.deleteMany({});

  const productIds = products.map(p => p._id);
  const categoryIds = categories.map(c => c._id);

  const baseCurrency = await Currency.findOne({ isActive: true, isDefault: true }, { code: 1 }).lean();
  if (!baseCurrency) {
    throw new Error('An active default currency must be configured before seeding coupons');
  }

  const coupons = CouponFactory.createMany(4, productIds, categoryIds, { currencyCode: baseCurrency.code });
  const createdCoupons = await Coupon.create(coupons);

  return createdCoupons;
};

module.exports = seedCoupons;
