/**
 * Factory để tạo dữ liệu danh mục sản phẩm
 * Sử dụng translation keys cho tên (description sẽ được tạo động từ API)
 */
const categories = [
  {
    name: 'Keyboard',
    sourceNames: ['Bàn Phím', 'Bàn Phím Máy Tính', 'Bàn Phím Cơ', 'Bàn Phím Gaming'],
    description: 'High quality computer keyboards for office and gaming',
    key: 'keyboard',
    slug: 'keyboard',
    icon: 'Keyboard',
    image: 'https://images.unsplash.com/photo-1587829191301-42b50b99e145?w=300&h=300&fit=crop',
    translationKey: 'category_keyboard',
  },
  {
    name: 'Mouse',
    sourceNames: ['Chuột máy tính', 'Chuột Gaming', 'Chuột Không Dây', 'Chuột Văn Phòng', 'Chuột Văn Phòng Có Dây'],
    description: 'Ergonomic computer mice with high precision for work and gaming',
    key: 'mouse',
    slug: 'mouse',
    icon: 'Mouse',
    image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=300&h=300&fit=crop',
    translationKey: 'category_mouse',
  },
  {
    name: 'Headphones',
    sourceNames: ['Headphone', 'Tai Nghe', 'Tai Nghe Chụp Tai', 'Tai Nghe Gaming'],
    description: 'Computer headphones with dynamic sound suitable for work and entertainment',
    key: 'headphones',
    slug: 'headphones',
    icon: 'Headphones',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop',
    translationKey: 'category_headphones',
  },
  {
    name: 'Cooling',
    sourceNames: ['Tản Nhiệt', 'Tản Nhiệt CPU', 'Quạt Tản Nhiệt'],
    description: 'Efficient computer cooling solutions for optimal CPU and GPU cooling',
    key: 'cooling',
    slug: 'cooling',
    icon: 'Zap',
    image: 'https://images.unsplash.com/photo-1516129750519-a4ec90e16fe8?w=300&h=300&fit=crop',
    translationKey: 'category_cooling',
  },
  {
    name: 'Gaming Laptop',
    sourceNames: ['Laptop Gaming', 'Laptop Chơi Game'],
    description: 'High performance gaming laptops with powerful GPU suitable for AAA games',
    key: 'gaming_laptop',
    slug: 'gaming-laptop',
    icon: 'Gamepad2',
    image: 'https://images.unsplash.com/photo-1593642632367-c85cabc56f10?w=300&h=300&fit=crop',
    translationKey: 'category_gaming_laptop',
  },
  {
    name: 'Office Laptop',
    sourceNames: ['Laptop Office', 'Laptop Truyền Thống', 'Laptop Văn Phòng'],
    description: 'Lightweight office laptops with long battery life for daily work',
    key: 'office_laptop',
    slug: 'office-laptop',
    icon: 'Briefcase',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=300&fit=crop',
    translationKey: 'category_office_laptop',
  },
  {
    name: 'Monitor',
    sourceNames: ['Màn Hình Máy Tính', 'Màn Hình'],
    description: 'Computer monitors for work, content creation and entertainment',
    key: 'monitor',
    slug: 'monitor',
    icon: 'Monitor',
    image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300&h=300&fit=crop',
    translationKey: 'category_monitor',
  },
  {
    name: 'Gaming Monitor',
    sourceNames: ['Màn Hình Gaming'],
    description: 'High refresh rate monitors designed for gaming',
    key: 'gaming_monitor',
    slug: 'gaming-monitor',
    icon: 'MonitorPlay',
    image: 'https://images.unsplash.com/photo-1547394765-185e1e68f34e?w=300&h=300&fit=crop',
    translationKey: 'category_gaming_monitor',
  },
  {
    name: 'Audio',
    sourceNames: ['Thiết Bị Âm Thanh', 'Loa Máy Tính', 'Loa Bluetooth', 'Tai Nghe Có Dây'],
    description: 'Audio devices and accessories for music, work and gaming',
    key: 'audio',
    slug: 'audio',
    icon: 'Volume2',
    image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=300&h=300&fit=crop',
    translationKey: 'category_audio',
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
      sourceNames: overrides.sourceNames || category.sourceNames || [],
      description: overrides.description || category.description,
      key: overrides.key || category.key,
      icon: overrides.icon || category.icon,
      image: overrides.image || category.image,
    };
  }

  /**
   * Tạo tất cả danh mục cố định
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = categories.length, overrides = {}) {
    return categories.slice(0, count).map((category, index) => {
      return {
        name: overrides.name || category.name,
        sourceNames: overrides.sourceNames || category.sourceNames || [],
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
