/**
 * Factory để tạo dữ liệu sản phẩm động
 * Tạo sản phẩm với relationships đến category, supplier, user
 */
class ProductFactory {
  /**
   * Tạo một sản phẩm
   * @param {Object} overrides - Dữ liệu override
   * @param {ObjectId} userId - ID của người tạo sản phẩm
   * @param {ObjectId} categoryId - ID danh mục
   * @param {ObjectId} supplierId - ID nhà cung cấp
   * @param {Number} index - Index để tạo dữ liệu khác nhau
   */
  static create(overrides = {}, userId, categoryId, supplierId, index = 0) {
    const prices = [15000000, 20000000, 25000000, 12000000, 18000000, 45990000, 28990000, 35990000, 42990000, 14990000];
    const brands = ['Dell', 'HP', 'Lenovo', 'ASUS', 'Apple', 'MSI', 'Acer'];
    const names = [
      'Gaming Laptop Pro', 'Ultrabook Elite', 'Business Workstation',
      'Student Laptop', 'Creative Power Station', 'XPS 15', 'Katana GF66', 'ROG Strix G15'
    ];
    const cpus = ['Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Intel Core i5-1235U'];
    const rams = ['8GB DDR4', '16GB DDR5', '32GB DDR5', '8GB LPDDR5', '16GB LPDDR5'];
    const storages = ['256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD'];
    const gpus = ['Intel Iris Xe', 'NVIDIA RTX 3050', 'NVIDIA RTX 3060', 'NVIDIA RTX 3070', 'NVIDIA RTX 4050', 'NVIDIA RTX 4060', 'Apple M1'];
    const displays = ['13.3" FHD', '14" FHD', '15.6" FHD+', '15.6" QHD', '16" OLED'];
    const oses = ['Windows 11 Home', 'Windows 11 Pro', 'macOS Ventura', 'Linux'];
    const weights = ['1.2kg', '1.5kg', '1.8kg', '2.0kg', '2.3kg'];
    const batteries = ['50Wh', '56Wh', '57Wh', '86Wh', '90Wh'];

    const features = [
      ['Màn hình viền mỏng', 'Bàn phím có đèn', 'Pin lâu 8+ giờ'],
      ['Tản nhiệt tốt', 'Âm thanh Dolby', 'WiFi 6E'],
      ['Vân tay mở khóa', 'Bảo mật IR camera', 'Bàn phím TrackPoint'],
      ['Cảm ứng nhanh', 'GPU rời mạnh', 'Tản nhiệt ROG'],
      ['Thiết kế siêu mỏng', 'Pin sử dụng cả ngày', 'Cổng USB-C đa năng']
    ];

    const price = overrides.price || prices[index % prices.length];
    const originalPrice = price + Math.random() * 10000000;
    const hasDiscount = Math.random() > 0.3;

    return {
      user: overrides.user || userId,
      name: overrides.name || names[index % names.length],
      image: overrides.image || `/uploads/product_${index + 1}.jpg`,
      images: overrides.images || [
        `/uploads/product_${index + 1}.jpg`,
        `/uploads/product_${index + 1}_alt.jpg`
      ],
      brand: overrides.brand || brands[index % brands.length],
      category: overrides.category || categoryId,
      supplier: overrides.supplier || supplierId,
      description: overrides.description || 'Premium laptop with latest specifications and excellent performance',
      specs: overrides.specs || {
        cpu: cpus[index % cpus.length],
        ram: rams[index % rams.length],
        storage: storages[index % storages.length],
        display: displays[index % displays.length],
        gpu: gpus[index % gpus.length],
        os: oses[index % oses.length],
        weight: weights[index % weights.length],
        battery: batteries[index % batteries.length]
      },
      features: overrides.features || features[index % features.length],
      rating: overrides.rating || (4 + Math.random() * 1),
      numReviews: overrides.numReviews || Math.floor(Math.random() * 300),
      price: price,
      originalPrice: hasDiscount ? originalPrice : undefined,
      countInStock: overrides.countInStock || Math.floor(Math.random() * 100 + 5),
      featured: overrides.featured !== undefined ? overrides.featured : Math.random() > 0.6,
      deal: overrides.deal !== undefined ? overrides.deal : (Math.random() > 0.7 ? {
        discount: Math.floor(Math.random() * 30 + 10),
        endTime: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000)
      } : {}),
      reviews: overrides.reviews || [],
    };
  }

  /**
   * Tạo nhiều sản phẩm cùng lúc với relationships
   * @param {Number} count - Số lượng sản phẩm muốn tạo
   * @param {ObjectId} userId - ID của người tạo sản phẩm
   * @param {Array} categoryIds - Danh sách ID danh mục
   * @param {Array} supplierIds - Danh sách ID nhà cung cấp
   * @param {Object} overrides - Dữ liệu override
   */
  static createMany(count = 20, userId, categoryIds = [], supplierIds = [], overrides = {}) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const catIdx = i % categoryIds.length;
      const supIdx = i % supplierIds.length;
      result.push(this.create(
        { ...overrides },
        userId,
        categoryIds[catIdx],
        supplierIds[supIdx],
        i
      ));
    }
    return result;
  }
}

module.exports = ProductFactory;
