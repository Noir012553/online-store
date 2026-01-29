/**
 * Factory để tạo dữ liệu danh mục sản phẩm
 * Sử dụng 6 danh mục cố định tiếng Việt
 */
const categories = [
  {
    name: 'Bàn phím',
    description: 'Bàn phím máy tính chất lượng cao, chuyên dụng cho văn phòng và gaming'
  },
  {
    name: 'Chuột',
    description: 'Chuột máy tính công ergonomic, độ chính xác cao cho làm việc và chơi game'
  },
  {
    name: 'Tai nghe',
    description: 'Tai nghe máy tính với âm thanh sống động, thích hợp cho công việc và giải trí'
  },
  {
    name: 'Tản nhiệt',
    description: 'Tản nhiệt máy tính hiệu quả, giải pháp tối ưu cho làm mát CPU và GPU'
  },
  {
    name: 'Laptop Gaming',
    description: 'Laptop gaming hiệu suất cao với GPU mạnh mẽ, thích hợp chơi game AAA'
  },
  {
    name: 'Laptop Văn phòng',
    description: 'Laptop văn phòng nhẹ nhàng, pin lâu dành cho công việc hằng ngày'
  }
];

class CategoryFactory {
  /**
   * Tạo một danh mục
   * @param {Object} overrides - Dữ liệu override
   * @param {Number} index - Index để lấy từ danh sách cố định
   */
  static create(overrides = {}, index = 0) {
    const category = categories[index % categories.length];
    return {
      name: overrides.name || category.name,
      description: overrides.description || category.description,
    };
  }

  /**
   * Tạo tất cả 6 danh mục cố định
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = 6, overrides = {}) {
    return categories.map((category, index) => {
      if (index >= count) return null;
      return {
        name: overrides.name || category.name,
        description: overrides.description || category.description,
      };
    }).filter(Boolean);
  }
}

module.exports = CategoryFactory;
