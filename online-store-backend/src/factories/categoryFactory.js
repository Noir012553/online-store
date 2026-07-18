/**
 * Factory để tạo dữ liệu danh mục sản phẩm
 * Sử dụng translation keys cho tên (description sẽ được tạo động từ API)
 */
const categories = [
  {
    name: 'Keyboard',
    description: 'High quality computer keyboards for office and gaming',
    key: 'keyboard',
    slug: 'keyboard',
    icon: 'Keyboard',
    image: 'https://images.unsplash.com/photo-1587829191301-42b50b99e145?w=300&h=300&fit=crop',
    translationKey: 'category_keyboard',
  },
  {
    name: 'Mouse',
    description: 'Ergonomic computer mice with high precision for work and gaming',
    key: 'mouse',
    slug: 'mouse',
    icon: 'Mouse',
    image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=300&h=300&fit=crop',
    translationKey: 'category_mouse',
  },
  {
    name: 'Headphones',
    description: 'Computer headphones with dynamic sound suitable for work and entertainment',
    key: 'headphones',
    slug: 'headphones',
    icon: 'Headphones',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop',
    translationKey: 'category_headphones',
  },
  {
    name: 'Cooling',
    description: 'Efficient computer cooling solutions for optimal CPU and GPU cooling',
    key: 'cooling',
    slug: 'cooling',
    icon: 'Zap',
    image: 'https://images.unsplash.com/photo-1516129750519-a4ec90e16fe8?w=300&h=300&fit=crop',
    translationKey: 'category_cooling',
  },
  {
    name: 'Gaming Laptop',
    description: 'High performance gaming laptops with powerful GPU suitable for AAA games',
    key: 'gaming_laptop',
    slug: 'gaming-laptop',
    icon: 'Gamepad2',
    image: 'https://images.unsplash.com/photo-1593642632367-c85cabc56f10?w=300&h=300&fit=crop',
    translationKey: 'category_gaming_laptop',
  },
  {
    name: 'Office Laptop',
    description: 'Lightweight office laptops with long battery life for daily work',
    key: 'office_laptop',
    slug: 'office-laptop',
    icon: 'Briefcase',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=300&fit=crop',
    translationKey: 'category_office_laptop',
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
        slug: overrides.slug || category.slug,
        translationKey: overrides.translationKey || category.translationKey,
        icon: overrides.icon || category.icon,
        image: overrides.image || category.image,
      };
    });
  }
}

module.exports = CategoryFactory;
