/**
 * Factory để tạo dữ liệu mã giảm giá động
 * Tạo coupons với relationships đến products và categories
 */
class CouponFactory {
  /**
   * Tạo một mã giảm giá
   * @param {Object} overrides - Dữ liệu override
   * @param {Array} productIds - Danh sách ID sản phẩm áp dụng
   * @param {Array} categoryIds - Danh sách ID danh mục áp dụng
   * @param {Number} index - Index để tạo dữ liệu khác nhau
   */
  static create(overrides = {}, productIds = [], categoryIds = [], index = 0) {
    const startDate = new Date();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const coupons = [
      {
        code: 'SUMMER20',
        description: 'Summer sale - 20% off all products',
        discountType: 'percentage',
        discountValue: 20,
        maxUses: 50,
        minOrderAmount: 500000,
      },
      {
        code: 'WELCOME100',
        description: 'Welcome new customer - 100k off',
        discountType: 'fixed',
        discountValue: 100000,
        maxUses: 100,
        minOrderAmount: 300000,
      },
      {
        code: 'FLASH15',
        description: 'Flash sale - 15% off select items',
        discountType: 'percentage',
        discountValue: 15,
        maxUses: 30,
        minOrderAmount: 1000000,
      },
      {
        code: 'VIP50',
        description: 'VIP customer - 50k off',
        discountType: 'fixed',
        discountValue: 50000,
        maxUses: 200,
        minOrderAmount: 0,
      },
    ];

    const base = coupons[index % coupons.length];
    return {
      code: overrides.code || base.code,
      description: overrides.description || base.description,
      discountType: overrides.discountType || base.discountType,
      discountValue: overrides.discountValue || base.discountValue,
      maxUses: overrides.maxUses || base.maxUses,
      minOrderAmount: overrides.minOrderAmount || base.minOrderAmount,
      applicableProducts: overrides.applicableProducts || productIds.slice(0, 3),
      applicableCategories: overrides.applicableCategories || categoryIds.slice(0, 2),
      startDate: overrides.startDate || startDate,
      endDate: overrides.endDate || endDate,
      isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    };
  }

  /**
   * Tạo nhiều mã giảm giá cùng lúc
   * @param {Number} count - Số lượng coupon muốn tạo
   * @param {Array} productIds - Danh sách ID sản phẩm áp dụng
   * @param {Array} categoryIds - Danh sách ID danh mục áp dụng
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = 4, productIds = [], categoryIds = [], overrides = {}) {
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(this.create({ ...overrides }, productIds, categoryIds, i));
    }
    return result;
  }
}

module.exports = CouponFactory;
