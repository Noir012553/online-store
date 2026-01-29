/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

const Coupon = require('../models/Coupon');
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

  const coupons = CouponFactory.createMany(4, productIds, categoryIds);
  const createdCoupons = await Coupon.create(coupons);

  return createdCoupons;
};

module.exports = seedCoupons;
