/**
 * Factory để tạo dữ liệu danh mục sản phẩm
 * Sử dụng 6 danh mục cố định tiếng Việt
 */
const categories = [
  {
    name: 'Bàn phím',
    description: 'Bàn phím máy tính chất lượng cao, chuyên dụng cho văn phòng và gaming',
    key: 'keyboard',
    translationKey: 'category_keyboard',
    icon: 'Keyboard',
    image: 'https://images.unsplash.com/photo-1587829191301-42b50b99e145?w=300&h=300&fit=crop',
  },
  {
    name: 'Chuột',
    description: 'Chuột máy tính công ergonomic, độ chính xác cao cho làm việc và chơi game',
    key: 'mouse',
    translationKey: 'category_mouse',
    icon: 'Mouse',
    image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=300&h=300&fit=crop',
  },
  {
    name: 'Tai nghe',
    description: 'Tai nghe máy tính với âm thanh sống động, thích hợp cho công việc và giải trí',
    key: 'headphones',
    translationKey: 'category_headphones',
    icon: 'Headphones',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop',
  },
  {
    name: 'Tản nhiệt',
    description: 'Tản nhiệt máy tính hiệu quả, giải pháp tối ưu cho làm mát CPU và GPU',
    key: 'cooling',
    translationKey: 'category_cooling',
    icon: 'Zap',
    image: 'https://images.unsplash.com/photo-1516129750519-a4ec90e16fe8?w=300&h=300&fit=crop',
  },
  {
    name: 'Laptop Gaming',
    description: 'Laptop gaming hiệu suất cao với GPU mạnh mẽ, thích hợp chơi game AAA',
    key: 'gaming_laptop',
    translationKey: 'category_gaming_laptop',
    icon: 'Gamepad2',
    image: 'https://images.unsplash.com/photo-1593642632367-c85cabc56f10?w=300&h=300&fit=crop',
  },
  {
    name: 'Laptop Văn phòng',
    description: 'Laptop văn phòng nhẹ nhàng, pin lâu dành cho công việc hằng ngày',
    key: 'office_laptop',
    translationKey: 'category_office_laptop',
    icon: 'Briefcase',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=300&fit=crop',
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
      key: overrides.key || category.key,
      translationKey: overrides.translationKey || category.translationKey,
      icon: overrides.icon || category.icon,
      image: overrides.image || category.image,
    };
  }

  /**
   * Tạo tất cả 6 danh mục cố định
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = 6, overrides = {}) {
    return categories.slice(0, count).map((category, index) => {
      return {
        name: overrides.name || category.name,
        description: overrides.description || category.description,
        key: overrides.key || category.key,
        translationKey: overrides.translationKey || category.translationKey,
        icon: overrides.icon || category.icon,
        image: overrides.image || category.image,
      };
    });
  }
}

module.exports = CategoryFactory;
