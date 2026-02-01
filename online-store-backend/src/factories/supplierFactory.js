/**
 * Factory để tạo dữ liệu nhà cung cấp động
 * Sử dụng danh sách nhà cung cấp được định nghĩa sẵn
 */
const suppliers = [
  { name: 'TechCorp', email: 'info@techcorp.com' },
  { name: 'ElectroHub', email: 'sales@electrohub.com' },
  { name: 'Gadget World', email: 'support@gadgetworld.com' },
  { name: 'Digital Store', email: 'contact@digitalstore.com' },
  { name: 'Innovation Labs', email: 'hello@innovationlabs.com' },
];

class SupplierFactory {
  /**
   * Tạo một nhà cung cấp
   * @param {Object} overrides - Dữ liệu override
   * @param {Number} index - Index để lấy từ danh sách mặc định
   */
  static create(overrides = {}, index = 0) {
    const base = suppliers[index % suppliers.length];
    return {
      name: overrides.name || base.name,
      email: overrides.email || base.email,
      phone: overrides.phone || `+84${Math.floor(Math.random() * 900000000 + 100000000)}`,
      address: overrides.address || `${index + 1} Business Street, Hanoi, Vietnam`,
    };
  }

  /**
   * Tạo nhiều nhà cung cấp cùng lúc
   * @param {Number} count - Số lượng nhà cung cấp muốn tạo
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = 5, overrides = {}) {
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(this.create({ ...overrides }, i));
    }
    return result;
  }
}

module.exports = SupplierFactory;
