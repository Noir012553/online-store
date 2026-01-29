/**
 * Controller quản lý sản phẩm
 * Xử lý: CRUD sản phẩm, phân trang, tìm kiếm, lọc theo danh mục/nhãn hiệu
 * Hỗ trợ upload ảnh, soft/hard delete, top-rated products
 */
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Order = require('../models/Order');
const User = require('../models/User');
const { withTimeout } = require('../utils/mongooseUtils');

/**
 * Lấy danh sách sản phẩm tối ưu cho home page
 * Không populate reviews (quá nặng), chỉ populate category + supplier
 * @route GET /api/products/featured
 * @access Public
 */
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;

  // Build query with filters (tương tự getProducts nhưng nhẹ hơn)
  const keywordFilters = [];
  if (req.query.keyword) {
    const searchTerm = req.query.keyword.trim();
    keywordFilters.push({ name: { $regex: searchTerm, $options: 'i' } });
    if (!isNaN(searchTerm) && searchTerm !== '') {
      const priceValue = Number(searchTerm);
      let lowerBound, upperBound;
      if (priceValue < 1000000) {
        const multiplier = Math.pow(10, 6 - searchTerm.length);
        lowerBound = priceValue * multiplier;
        upperBound = (priceValue + 1) * multiplier - 1;
      } else {
        lowerBound = priceValue * 0.9;
        upperBound = priceValue * 1.1;
      }
      keywordFilters.push({ price: { $gte: lowerBound, $lte: upperBound } });
    }
  }

  const category = req.query.category
    ? { category: new mongoose.Types.ObjectId(req.query.category) }
    : {};
  const brand = req.query.brand ? { brand: req.query.brand } : {};

  const priceFilter = {};
  if (req.query.minPrice || req.query.maxPrice) {
    priceFilter.price = {};
    if (req.query.minPrice) priceFilter.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) priceFilter.price.$lte = Number(req.query.maxPrice);
  }

  const stockFilter = {};
  if (req.query.inStock !== undefined && req.query.inStock !== '') {
    const inStock = req.query.inStock === 'true';
    if (inStock) {
      stockFilter.countInStock = { $gt: 0 };
    } else {
      stockFilter.countInStock = { $eq: 0 };
    }
  }

  const query = { isDeleted: false, ...category, ...brand, ...priceFilter, ...stockFilter };
  if (keywordFilters.length > 0) {
    query.$or = keywordFilters;
  }

  // Lightweight query - NO populate reviews
  const count = await withTimeout(Product.countDocuments(query), 10000);
  const products = await withTimeout(
    Product.find(query)
      .populate('category')
      .populate('supplier')
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    15000
  );

  res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy danh sách sản phẩm với phân trang, tìm kiếm và lọc
 * @route GET /api/products
 * @access Public
 */
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;

  // Build keyword filter - search by both name and price
  const keywordFilters = [];
  if (req.query.keyword) {
    const searchTerm = req.query.keyword.trim();
    // Always search by name
    keywordFilters.push({ name: { $regex: searchTerm, $options: 'i' } });

    // If keyword is numeric, also search by price
    if (!isNaN(searchTerm) && searchTerm !== '') {
      const priceValue = Number(searchTerm);

      let lowerBound, upperBound;

      if (priceValue < 1000000) {
        // Prefix search: 85 -> 850000 to 859999, 3 -> 3000000 to 3999999
        const multiplier = Math.pow(10, 6 - searchTerm.length);
        lowerBound = priceValue * multiplier;
        upperBound = (priceValue + 1) * multiplier - 1;
      } else {
        // Exact range search: price >= 1 million, search with ±10% range
        lowerBound = priceValue * 0.9;
        upperBound = priceValue * 1.1;
      }

      keywordFilters.push({ price: { $gte: lowerBound, $lte: upperBound } });
    }
  }

  // Convert category string to ObjectId if provided
  const category = req.query.category
    ? { category: new mongoose.Types.ObjectId(req.query.category) }
    : {};
  const brand = req.query.brand ? { brand: req.query.brand } : {};

  // Price range filter
  const priceFilter = {};
  if (req.query.minPrice || req.query.maxPrice) {
    priceFilter.price = {};
    if (req.query.minPrice) priceFilter.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) priceFilter.price.$lte = Number(req.query.maxPrice);
  }

  // Stock status filter
  const stockFilter = {};
  if (req.query.inStock !== undefined && req.query.inStock !== '') {
    const inStock = req.query.inStock === 'true';
    if (inStock) {
      stockFilter.countInStock = { $gt: 0 };
    } else {
      stockFilter.countInStock = { $eq: 0 };
    }
  }

  // Build final query
  const query = { isDeleted: false, ...category, ...brand, ...priceFilter, ...stockFilter };
  if (keywordFilters.length > 0) {
    query.$or = keywordFilters;
  }

  const count = await withTimeout(Product.countDocuments(query), 15000);
  const products = await withTimeout(
    Product.find(query)
      .populate('reviews')
      .populate('category')
      .populate('supplier')
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    20000
  );

  res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy chi tiết sản phẩm theo ID
 * @route GET /api/products/:id
 * @access Public
 */
const getProductById = asyncHandler(async (req, res) => {
  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404);
    throw new Error('Product not found');
  }

  const product = await withTimeout(
    Product.findById(req.params.id)
      .populate('reviews')
      .populate('category')
      .populate('supplier'),
    15000
  );

  if (product && !product.isDeleted) {
    res.json(product);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

/**
 * Tạo sản phẩm mới (Admin only)
 * Bắt buộc phải upload ảnh, tối đa 5MB
 * @route POST /api/products
 * @access Private/Admin
 */
const createProduct = asyncHandler(async (req, res) => {
  const {
    name, price, description, brand, category, countInStock, supplier,
    originalPrice, featured, images, features, specs, deal
  } = req.body;

  if (!req.file) {
    res.status(400);
    throw new Error('Product image is required');
  }

  const product = new Product({
    name,
    price,
    originalPrice,
    user: req.user._id,
    image: `/${req.file.path}`,
    images: images || [],
    brand,
    category,
    countInStock,
    description,
    supplier,
    featured: featured || false,
    features: features || [],
    specs: specs || {},
    deal: deal || {},
    numReviews: 0,
    rating: 0,
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

/**
 * Cập nhật thông tin sản phẩm (Admin only)
 * @route PUT /api/products/:id
 * @access Private/Admin
 */
const updateProduct = asyncHandler(async (req, res) => {
  const {
    name, price, description, brand, category, countInStock, supplier,
    originalPrice, featured, images, features, specs, deal
  } = req.body;

  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  product.name = name || product.name;
  product.price = price !== undefined ? price : product.price;
  product.originalPrice = originalPrice !== undefined ? originalPrice : product.originalPrice;
  product.description = description || product.description;
  product.brand = brand || product.brand;
  product.category = category || product.category;
  product.countInStock = countInStock !== undefined ? countInStock : product.countInStock;
  product.supplier = supplier || product.supplier;
  product.featured = featured !== undefined ? featured : product.featured;
  product.images = images || product.images;
  product.features = features || product.features;
  product.specs = specs || product.specs;
  product.deal = deal || product.deal;

  if (req.file) {
    product.image = `/${req.file.path}`;
  }

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

/**
 * Xóa mềm sản phẩm (Admin only)
 * Sản phẩm vẫn tồn tại trong DB nhưng không hiển thị
 * @route DELETE /api/products/:id
 * @access Private/Admin
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  product.isDeleted = true;
  await product.save();

  res.json({ message: 'Product deleted' });
});

/**
 * Khôi phục sản phẩm đã xóa mềm (Admin only)
 * @route PUT /api/products/:id/restore
 * @access Private/Admin
 */
const restoreProduct = asyncHandler(async (req, res) => {
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (!product.isDeleted) {
    res.status(400);
    throw new Error('Product is not deleted');
  }

  product.isDeleted = false;
  const restoredProduct = await product.save();

  res.json(restoredProduct);
});

/**
 * Lấy danh sách sản phẩm đã xóa mềm (Admin only)
 * @route GET /api/products/deleted/list
 * @access Private/Admin
 */
const getDeletedProducts = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 9;
  const page = Number(req.query.pageNumber) || 1;

  const count = await withTimeout(Product.countDocuments({ isDeleted: true }), 15000);
  const products = await withTimeout(
    Product.find({ isDeleted: true })
      .populate('reviews')
      .populate('category')
      .populate('supplier')
      .sort({ updatedAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    20000
  );

  res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Xóa cứng sản phẩm (Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/products/:id/hard
 * @access Private/Admin
 */
const hardDeleteProduct = asyncHandler(async (req, res) => {
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  await withTimeout(Product.findByIdAndDelete(req.params.id), 8000);
  res.json({ message: 'Product permanently deleted' });
});

/**
 * Lấy sản phẩm được đề xuất (phổ biến nhất)
 * @route GET /api/products/top/rated
 * @access Public
 */
const getTopRatedProducts = asyncHandler(async (req, res) => {
  const products = await withTimeout(
    Product.find({ isDeleted: false })
      .sort({ rating: -1 })
      .limit(3),
    8000
  );

  res.json(products);
});

/**
 * Lấy thống kê chung của cửa hàng (Public) - Optimized with aggregation
 * Sử dụng MongoDB aggregation pipeline để tính tất cả metrics trong 1 query
 * @route GET /api/products/stats/overview
 * @access Public
 */
const getStatsOverview = asyncHandler(async (req, res) => {
  // Tính stats sản phẩm với aggregation
  const productStats = await withTimeout(
    Product.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inStockProducts: {
            $sum: { $cond: [{ $gt: ['$countInStock', 0] }, 1, 0] },
          },
        },
      },
    ]),
    8000
  );

  // Tính stats đơn hàng + doanh thu (trong một lần query)
  const orderStats = await withTimeout(
    Order.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
        },
      },
    ]),
    8000
  );

  // Đếm khách hàng
  const totalCustomers = await withTimeout(
    User.countDocuments({ role: 'user', isDeleted: false }),
    5000
  );

  const productData = productStats[0] || {
    totalProducts: 0,
    inStockProducts: 0,
  };
  const orderData = orderStats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
  };

  res.json({
    totalProducts: productData.totalProducts,
    inStockProducts: productData.inStockProducts,
    totalOrders: orderData.totalOrders,
    totalRevenue: orderData.totalRevenue,
    totalCustomers,
  });
});

/**
 * Lấy danh sách testimonials từ reviews (Public)
 * @route GET /api/products/testimonials/featured
 * @access Public
 */
const getTestimonials = asyncHandler(async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const reviews = await withTimeout(
      Review.find({ isDeleted: false })
        .populate('user', 'name')
        .sort({ rating: -1, createdAt: -1 })
        .limit(limit * 2),
      8000
    );

    // Pick random testimonials to vary the results
    const shuffled = reviews.sort(() => Math.random() - 0.5);
    const testimonials = shuffled.slice(0, limit).map(review => {
      // Use uploaded avatar if available, otherwise fallback to dicebear generated avatar
      const avatar = review.avatar
        ? `${process.env.BACKEND_URL || 'http://localhost:5000'}${review.avatar}`
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${review.user?._id || review._id}`;

      return {
        name: review.user?.name || review.name || 'Khách hàng ẩn danh',
        role: 'Khách hàng',
        content: review.comment,
        rating: review.rating,
        avatar,
      };
    });

    res.json(testimonials);
  } catch (error) {
    // Return empty testimonials array instead of throwing error
    res.json([]);
  }
});

module.exports = {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getDeletedProducts,
  hardDeleteProduct,
  getTopRatedProducts,
  getStatsOverview,
  getTestimonials,
};
