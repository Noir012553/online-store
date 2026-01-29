/**
 * Out-of-Stock Product Seeder
 * Thêm 1 sản phẩm hết hàng (countInStock = 0) cho mỗi danh mục
 * Để test hiển thị trạng thái "Hết hàng" trong admin
 */

const Product = require('../models/Product');

const seedOutOfStockProducts = async (userId, categoryIds, supplierIds) => {
  try {
    const outOfStockProducts = [];
    const categoryNames = ['Bàn phím', 'Chuột', 'Tai nghe', 'Tản nhiệt', 'Laptop Gaming', 'Laptop Văn phòng'];

    // Tạo 1 sản phẩm hết hàng cho mỗi danh mục
    for (let i = 0; i < categoryIds.length; i++) {
      const imageUrl = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400';
      const productData = {
        user: userId,
        name: `[HẾT HÀNG] Sản phẩm mẫu - ${categoryNames[i]}`,
        brand: 'Test Brand',
        category: categoryIds[i],
        supplier: supplierIds[i % supplierIds.length],
        image: imageUrl,
        images: [imageUrl],
        price: 1000000 + i * 100000,
        originalPrice: 1500000 + i * 100000,
        countInStock: 0, // HẾT HÀNG
        description: `Sản phẩm này đã hết hàng. Danh mục: ${categoryNames[i]}`,
        rating: 4.5,
        numReviews: Math.floor(Math.random() * 50),
        featured: false,
        specs: {
          example: 'out-of-stock test'
        },
        features: ['Hết hàng', 'Chờ nhập kho'],
      };

      outOfStockProducts.push(productData);
    }

    // Save vào database
    const createdProducts = await Product.create(outOfStockProducts);

    return createdProducts;
  } catch (error) {
    throw error;
  }
};

module.exports = seedOutOfStockProducts;
