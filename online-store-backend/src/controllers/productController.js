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
const Category = require('../models/Category');
const Currency = require('../models/Currency');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const { withTimeout } = require('../utils/mongooseUtils');
const { normalizeSpecs } = require('../utils/specNormalizer');
const { broadcastNewProduct, broadcastProductUpdated, broadcastProductDeleted, broadcastProductRestored } = require('../socket/socketHandler');
const { deleteImageFile } = require('../utils/fileUtils');
const { uploadToCloudinary, deleteFromCloudinary, isCloudinaryUrl, extractPublicIdFromUrl } = require('../services/cloudinaryService');
const { overlayTranslationBatchWithFallback, overlayTranslation } = require('../services/translationHelper');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getMessage } = require('../i18n/messages');
const { localizeProductCategory, localizeProductCategories } = require('../services/categoryLocalizationService');
const { getReportingCurrency, sumOrdersInCurrency } = require('../utils/orderRevenue');
const { getCurrencyMetadata, formatAmountFields, formatProducts } = require('../utils/currencyResponseFormatter');

const DEFAULT_LANG = getDefaultLanguage().code;

const parseDealInput = (deal) => {
  if (deal === undefined || deal === null || deal === '') {
    return {};
  }

  if (typeof deal === 'string') {
    try {
      return JSON.parse(deal);
    } catch (error) {
      return {};
    }
  }

  return deal;
};

const buildDiscountFilter = (minDiscount, maxDiscount) => {
  const hasMin = minDiscount !== undefined && minDiscount !== '';
  const hasMax = maxDiscount !== undefined && maxDiscount !== '';

  if (!hasMin && !hasMax) {
    return null;
  }

  const parsedMin = hasMin ? Number(minDiscount) : undefined;
  const parsedMax = hasMax ? Number(maxDiscount) : undefined;
  const computedDiscount = {
    $cond: [
      { $gt: [{ $ifNull: ['$originalPrice', 0] }, 0] },
      {
        $multiply: [
          {
            $divide: [
              { $subtract: [{ $ifNull: ['$originalPrice', 0] }, '$price'] },
              { $ifNull: ['$originalPrice', 0] },
            ],
          },
          100,
        ],
      },
      -1,
    ],
  };

  const conditions = [];
  if (parsedMin !== undefined || parsedMax !== undefined) {
    const computedConditions = [];
    if (parsedMin !== undefined) {
      computedConditions.push({ $gte: [computedDiscount, parsedMin] });
    }
    if (parsedMax !== undefined) {
      computedConditions.push({ $lte: [computedDiscount, parsedMax] });
    }
    conditions.push({ $expr: { $and: computedConditions } });
  }

  const dealConditions = [];
  if (parsedMin !== undefined) {
    dealConditions.push({ $gte: [{ $ifNull: ['$deal.discount', -1] }, parsedMin] });
  }
  if (parsedMax !== undefined) {
    dealConditions.push({ $lte: [{ $ifNull: ['$deal.discount', -1] }, parsedMax] });
  }
  conditions.push({ $expr: { $and: dealConditions } });

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
};

const buildRatingFilter = (minRating, maxRating) => {
  const hasMin = minRating !== undefined && minRating !== '';
  const hasMax = maxRating !== undefined && maxRating !== '';

  if (!hasMin && !hasMax) {
    return null;
  }

  const rating = {};
  if (hasMin) rating.$gte = Number(minRating);
  if (hasMax) rating.$lte = Number(maxRating);
  return { rating };
};

/**
 * Lấy danh sách sản phẩm tối ưu cho home page
 * Không populate reviews (quá nặng), chỉ populate category + supplier
 * @route GET /api/products/featured
 * @access Public
 */
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;
  const lang = req.lang;

  // Build query with filters (tương tự getProducts nhưng nhẹ hơn)
  const keywordFilters = [];
  if (req.query.keyword) {
    const searchTerm = req.query.keyword.trim();
    const regex = { $regex: searchTerm, $options: 'i' };

    keywordFilters.push({
      name: regex
    });
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

  const discountFilter = buildDiscountFilter(req.query.minDiscount, req.query.maxDiscount);

  const query = { isDeleted: false, ...category, ...brand, ...priceFilter, ...stockFilter };
  if (discountFilter) {
    query.$and = query.$and || [];
    query.$and.push(discountFilter);
  }
  if (keywordFilters.length > 0) {
    query.$or = keywordFilters;
  }

  // Lightweight query - NO populate reviews, use lean() to reduce memory
  // Sort by featured first, then by createdAt to ensure diverse and fresh products
  const count = await withTimeout(Product.countDocuments(query), 10000);
  const products = await withTimeout(
    Product.find(query)
      .populate('category')
      .populate('supplier')
      .lean()
      .sort({ featured: -1, createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    15000
  );

  const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, lang);
  res.json({ products: await formatProducts(localizedProducts, lang), page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy danh sách sản phẩm với phân trang, tìm kiếm và lọc
 * @route GET /api/products
 * @access Public
 */
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;
  const lang = req.lang;

  // Build keyword filter - search by name and price
  const keywordFilters = [];
  if (req.query.keyword) {
    const searchTerm = req.query.keyword.trim();
    const regex = { $regex: searchTerm, $options: 'i' };

    keywordFilters.push({
      name: regex
    });

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

  let category = {};
  if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
    category = { category: new mongoose.Types.ObjectId(req.query.category) };
  }
  const brand = req.query.brand ? { brand: req.query.brand } : {};
  const featuredFilter = req.query.featured === 'true' ? { featured: true } : {};
  const dealFilter = req.query.hasDeal === 'true' ? { 'deal.discount': { $gt: 0 } } : {};

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

  const discountFilter = buildDiscountFilter(req.query.minDiscount, req.query.maxDiscount);
  const ratingFilter = buildRatingFilter(req.query.minRating, req.query.maxRating);

  // Build final query
  const query = { isDeleted: false, ...category, ...brand, ...featuredFilter, ...dealFilter, ...priceFilter, ...stockFilter };
  if (discountFilter) {
    query.$and = query.$and || [];
    query.$and.push(discountFilter);
  }
  if (ratingFilter) {
    query.$and = query.$and || [];
    query.$and.push(ratingFilter);
  }
  if (keywordFilters.length > 0) {
    query.$or = keywordFilters;
  }

  const count = await withTimeout(Product.countDocuments(query), 15000);
  const products = await withTimeout(
    Product.find(query)
      .populate('category')
      .populate('supplier')
      .lean() // Use lean() to reduce memory overhead for large product lists
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    20000
  );

  const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, lang);
  res.json({ products: await formatProducts(localizedProducts, lang), page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy chi tiết sản phẩm theo ID
 * Hỗ trợ `lang` query parameter để dịch product name/description
 * @route GET /api/products/:id
 * @access Public
 */
const getProductById = asyncHandler(async (req, res) => {
  const lang = req.lang;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404);
    throw new Error(getMessage(lang, 'product.notFound'));
  }

  const product = await withTimeout(
    Product.findById(req.params.id)
      .populate({ path: 'reviews', options: { limit: 50 } }) // Limit reviews to prevent memory leak
      .populate('category')
      .populate('supplier'),
    15000
  );

  if (product && !product.isDeleted) {
    let productObj = product.toObject ? product.toObject() : product;

    const translatedProduct = await overlayTranslation(productObj, 'product', lang);
    const localizedProduct = await localizeProductCategory(translatedProduct, lang);

    res.json((await formatProducts([localizedProduct], lang))[0]);
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'product.notFound'));
  }
});

/**
 * Tạo sản phẩm mới (Admin only)
 * Bắt buộc phải upload ảnh, tối đa 5MB
 * @route POST /api/products
 * @access Private/Admin
 */
const createProduct = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const {
    name, price, description, brand, category, countInStock, supplier,
    originalPrice, baseCurrencyCode, featured, images, features, specs, deal, image, imagePublicId
  } = req.body;
  const parsedDeal = parseDealInput(deal);

  // Image can be from:
  // 1. URL (from Cloudinary signed upload) - req.body.image
  // 2. File (legacy backend upload) - req.file
  if (!image && !req.file) {
    res.status(400);
    throw new Error(getMessage(lang.toUpperCase(), 'product.imageRequired'));
  }

  // ==================== VALIDATE PRICE AND STOCK ====================
  const numPrice = parseFloat(price);
  const numCountInStock = parseInt(countInStock);

  if (isNaN(numPrice) || numPrice <= 0) {
    console.error('Price validation failed:', { isNaN: isNaN(numPrice), numPrice });
    res.status(400);
    throw new Error(getMessage(lang.toUpperCase(), 'product.invalidPrice'));
  }

  if (isNaN(numCountInStock) || numCountInStock < 0) {
    console.error('Stock validation failed:', { isNaN: isNaN(numCountInStock), numCountInStock });
    res.status(400);
    throw new Error(getMessage(lang.toUpperCase(), 'product.invalidStock'));
  }

  if (!category || !mongoose.Types.ObjectId.isValid(category)) {
    res.status(400);
    throw new Error('A valid category is required');
  }

  const resolvedCategory = await Category.findOne({ _id: category, isDeleted: false }).select('_id').lean();
  if (!resolvedCategory) {
    res.status(400);
    throw new Error('The selected category does not exist');
  }

  const normalizedSpecs = normalizeSpecs(specs || {});
  const normalizedBaseCurrencyCode = typeof baseCurrencyCode === 'string'
    ? baseCurrencyCode.trim().toUpperCase()
    : '';
  const baseCurrency = await Currency.exists({
    code: normalizedBaseCurrencyCode,
    isActive: true,
  });

  if (!baseCurrency) {
    res.status(400);
    throw new Error('A valid active base currency is required');
  }

  // Validate and parse originalPrice if provided
  let numOriginalPrice = originalPrice ? parseFloat(originalPrice) : undefined;
  if (originalPrice && (isNaN(numOriginalPrice) || numOriginalPrice < numPrice)) {
    numOriginalPrice = undefined;
  }

  // ==================== HANDLE IMAGE URL ====================
  let imageUrl = null;
  let imagePubicId = null;

  if (image) {
    // Signed upload from Cloudinary - use URL and publicId directly
    imageUrl = image;
    imagePubicId = imagePublicId || null;
  } else if (req.file) {
    // Legacy backend upload - upload file to Cloudinary
    try {
      const folder = req.user.role === 'admin' || req.user.role === 'super-admin' ? 'admins' : 'users';
      const cloudinaryResult = await uploadToCloudinary(req.file.buffer, folder);
      imageUrl = cloudinaryResult.url;
      imagePubicId = cloudinaryResult.publicId;
    } catch (error) {
      console.error('[PRODUCT_CREATE] Cloudinary upload failed:', error.message);
      res.status(500);
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  }

  const product = new Product({
    name: name || '',
    price: numPrice,
    originalPrice: numOriginalPrice,
    baseCurrencyCode: normalizedBaseCurrencyCode,
    user: req.user._id,
    image: imageUrl,
    imagePublicId: imagePubicId,
    images: images || [],
    brand,
    category: resolvedCategory._id,
    countInStock: numCountInStock,
    description: description || '',
    supplier,
    featured: featured || false,
    features: features || [],
    specs: normalizedSpecs,
    deal: parsedDeal,
    numReviews: 0,
    rating: 0,
  });

  const createdProduct = await product.save();

  // Populate fields để response data consistent với getProductById
  const populatedProduct = await withTimeout(
    Product.findById(createdProduct._id)
      .populate('reviews')
      .populate('category')
      .populate('supplier'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastNewProduct(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        brand: populatedProduct.brand,
        category: populatedProduct.category,
        countInStock: populatedProduct.countInStock,
        image: populatedProduct.image,
        createdAt: populatedProduct.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
    console.warn('[WARNING] Failed to broadcast new product:', err.message);
  }

  const productResponse = populatedProduct.toObject ? populatedProduct.toObject() : populatedProduct;
  const localizedProduct = await localizeProductCategory(productResponse, req.lang);
  res.status(201).json((await formatProducts([localizedProduct], req.lang))[0]);
});

/**
 * Cập nhật thông tin sản phẩm (Admin only)
 * @route PUT /api/products/:id
 * @access Private/Admin
 */
const updateProduct = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const {
    name, price, description, brand, category, countInStock, supplier,
    originalPrice, baseCurrencyCode, featured, images, features, specs, deal, image, imagePublicId
  } = req.body;

  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error(getMessage(lang.toUpperCase(), 'product.notFound'));
  }

  // ==================== VALIDATE PRICE AND STOCK ====================
  // Only validate if they're being updated
  if (price !== undefined) {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      res.status(400);
      throw new Error(getMessage(lang.toUpperCase(), 'product.invalidPrice'));
    }
  }

  if (countInStock !== undefined) {
    const numCountInStock = parseInt(countInStock);
    if (isNaN(numCountInStock) || numCountInStock < 0) {
      res.status(400);
      throw new Error(getMessage(lang.toUpperCase(), 'product.invalidStock'));
    }
  }

  const normalizedSpecs = specs ? normalizeSpecs(specs) : product.specs;

  if (name !== undefined) {
    product.name = name;
  }

  if (price !== undefined) {
    product.price = parseFloat(price);
  }

  if (originalPrice !== undefined) {
    const numOriginalPrice = parseFloat(originalPrice);
    product.originalPrice = (isNaN(numOriginalPrice) || numOriginalPrice < product.price) ? product.originalPrice : numOriginalPrice;
  }

  if (baseCurrencyCode !== undefined) {
    const normalizedBaseCurrencyCode = typeof baseCurrencyCode === 'string'
      ? baseCurrencyCode.trim().toUpperCase()
      : '';
    const baseCurrency = await Currency.exists({
      code: normalizedBaseCurrencyCode,
      isActive: true,
    });

    if (!baseCurrency) {
      res.status(400);
      throw new Error('A valid active base currency is required');
    }

    product.baseCurrencyCode = normalizedBaseCurrencyCode;
  }

  if (description !== undefined) {
    product.description = description;
  }

  if (brand !== undefined) {
    product.brand = brand;
  }

  if (category !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(category)) {
      res.status(400);
      throw new Error('A valid category is required');
    }

    const resolvedCategory = await Category.findOne({ _id: category, isDeleted: false }).select('_id').lean();
    if (!resolvedCategory) {
      res.status(400);
      throw new Error('The selected category does not exist');
    }

    product.category = resolvedCategory._id;
  }

  if (countInStock !== undefined) {
    product.countInStock = parseInt(countInStock);
  }

  if (supplier !== undefined) {
    product.supplier = supplier;
  }

  if (featured !== undefined) {
    product.featured = featured;
  }

  if (images !== undefined) {
    product.images = images;
  }

  if (features !== undefined) {
    product.features = features;
  }

  if (specs !== undefined) {
    product.specs = normalizedSpecs;
  }

  if (deal !== undefined) {
    product.deal = parseDealInput(deal);
  }

  if (image || req.file) {
    // Delete old image first if replacing
    if (product.image && isCloudinaryUrl(product.image) && product.imagePublicId) {
      try {
        await deleteFromCloudinary(product.imagePublicId);
        console.log('[PRODUCT_UPDATE] Old image deleted from Cloudinary:', product.imagePublicId);
      } catch (deleteError) {
        console.warn('[PRODUCT_UPDATE] Failed to delete old image:', deleteError.message);
      }
    }

    if (image) {
      // Signed upload from Cloudinary - use URL and publicId directly
      product.image = image;
      product.imagePublicId = imagePublicId || null;
      console.log('[PRODUCT_UPDATE] Image updated from Cloudinary upload:', { url: image });
    } else if (req.file) {
      // Legacy backend upload - upload file to Cloudinary
      try {
        const folder = req.user.role === 'admin' || req.user.role === 'super-admin' ? 'admins' : 'users';
        const cloudinaryResult = await uploadToCloudinary(req.file.buffer, folder);
        product.image = cloudinaryResult.url;
        product.imagePublicId = cloudinaryResult.publicId;
        console.log('[PRODUCT_UPDATE] New image uploaded to Cloudinary:', { url: cloudinaryResult.url });
      } catch (error) {
        console.error('[PRODUCT_UPDATE] Cloudinary upload failed:', error.message);
        res.status(500);
        throw new Error(`Failed to upload image: ${error.message}`);
      }
    }
  }

  const updatedProduct = await product.save();
  const populatedProduct = await withTimeout(
    Product.findById(updatedProduct._id)
      .populate('category')
      .populate('supplier'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastProductUpdated(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        brand: populatedProduct.brand,
        category: populatedProduct.category,
        countInStock: populatedProduct.countInStock,
        image: populatedProduct.image,
        updatedAt: populatedProduct.updatedAt,
      });
    }
  } catch (err) {
    console.warn('[WARNING] Failed to broadcast product update:', err.message);
  }

  const productResponse = populatedProduct.toObject ? populatedProduct.toObject() : populatedProduct;
  const localizedProduct = await localizeProductCategory(productResponse, req.lang);
  res.json((await formatProducts([localizedProduct], req.lang))[0]);
});

/**
 * Xóa mềm sản phẩm (Admin only)
 * Sản phẩm vẫn tồn tại trong DB nhưng không hiển thị
 * @route DELETE /api/products/:id
 * @access Private/Admin
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error(getMessage(lang.toUpperCase(), 'product.notFound'));
  }

  // Prevent double soft-delete
  if (product.isDeleted) {
    res.status(400);
    throw new Error(getMessage(lang.toUpperCase(), 'product.alreadyDeleted'));
  }

  product.isDeleted = true;
  await product.save();

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastProductDeleted(io, product._id.toString());
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
    console.warn('[WARNING] Failed to broadcast product delete:', err.message);
  }

  res.json({ message: getMessage(lang.toUpperCase(), 'product.deletedSuccessfully') });
});

/**
 * Khôi phục sản phẩm đã xóa mềm (Admin only)
 * @route PUT /api/products/:id/restore
 * @access Private/Admin
 */
const restoreProduct = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error(getMessage(lang.toUpperCase(), 'product.notFound'));
  }

  if (!product.isDeleted) {
    res.status(400);
    throw new Error(getMessage(lang.toUpperCase(), 'product.notDeleted'));
  }

  product.isDeleted = false;
  const restoredProduct = await product.save();
  const populatedProduct = await withTimeout(
    Product.findById(restoredProduct._id)
      .populate('category')
      .populate('supplier'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastProductRestored(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        brand: populatedProduct.brand,
        category: populatedProduct.category,
        countInStock: populatedProduct.countInStock,
        image: populatedProduct.image,
        createdAt: populatedProduct.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
    console.warn('[WARNING] Failed to broadcast product restore:', err.message);
  }

  const productResponse = populatedProduct.toObject ? populatedProduct.toObject() : populatedProduct;
  const localizedProduct = await localizeProductCategory(productResponse, req.lang);
  res.json((await formatProducts([localizedProduct], req.lang))[0]);
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
      .populate('category')
      .populate('supplier')
      .lean() // Use lean() to reduce memory overhead for large product lists
      .sort({ updatedAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    20000
  );

  const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', req.lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, req.lang);
  res.json({ products: await formatProducts(localizedProducts, req.lang), page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Xóa cứng sản phẩm (Admin only)
 * Workflow: Soft delete (ẩn) → Hard delete (xóa vĩnh viễn + cleanup Cloudinary)
 * @route DELETE /api/products/:id/hard
 * @access Private/Admin (admin và super-admin đều được)
 */
const hardDeleteProduct = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const product = await withTimeout(Product.findById(req.params.id), 8000);

  if (!product) {
    res.status(404);
    throw new Error(getMessage(lang.toUpperCase(), 'product.notFound'));
  }

  // Xóa ảnh từ Cloudinary nếu có
  let deletedImages = 0;
  let failedDeletions = [];

  try {
    // Xóa ảnh chính nếu là Cloudinary URL
    if (product.image && isCloudinaryUrl(product.image) && product.imagePublicId) {
      try {
        await deleteFromCloudinary(product.imagePublicId);
        deletedImages++;
        console.log('[PRODUCT_HARD_DELETE] Main image deleted from Cloudinary');
      } catch (error) {
        failedDeletions.push({ image: product.image, error: error.message });
        console.warn('[PRODUCT_HARD_DELETE] Failed to delete main image:', error.message);
      }
    }

    // Xóa tất cả ảnh bổ sung (nếu có)
    if (Array.isArray(product.images) && product.images.length > 0) {
      for (const imgPath of product.images) {
        if (imgPath && isCloudinaryUrl(imgPath)) {
          try {
            const publicId = extractPublicIdFromUrl(imgPath);
            if (publicId) {
              await deleteFromCloudinary(publicId);
              deletedImages++;
            }
          } catch (error) {
            failedDeletions.push({ image: imgPath, error: error.message });
            console.warn('[PRODUCT_HARD_DELETE] Failed to delete additional image:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('[PRODUCT_HARD_DELETE] Error during image cleanup:', error.message);
    // Continue with product deletion anyway
  }

  // Xóa document từ database
  try {
    await withTimeout(Product.findByIdAndDelete(req.params.id), 8000);
    console.log('[PRODUCT_HARD_DELETE] Product document deleted from database');
  } catch (dbError) {
    console.error('[PRODUCT_HARD_DELETE] Failed to delete product from database:', dbError.message);
    res.status(500);
    throw new Error(`Failed to delete product: ${dbError.message}`);
  }

  res.json({
    message: 'Product permanently deleted',
    deletedImages,
    failedDeletions: failedDeletions.length > 0 ? failedDeletions : undefined
  });
});

/**
 * Lấy sản phẩm được đề xuất (phổ biến nhất)
 * @route GET /api/products/top/rated
 * @access Public
 */
const getTopRatedProducts = asyncHandler(async (req, res) => {
  try {
    const lang = req.lang;

    const products = await withTimeout(
      Product.find({ isDeleted: false })
        .populate('category')
        .sort({ rating: -1 })
        .limit(3)
        .lean(),
      8000
    );

    if (!products || products.length === 0) {
      return res.json([]);
    }

    // Process results to apply language-specific name and category (Rule #2: Dynamic Database Translations)
    let processedProducts = products.map(product => {
      let nameValue = product.name;

      // Handle object name format for language-specific translation
      if (typeof nameValue === 'object' && nameValue !== null) {
        const fallbackChain = [lang, DEFAULT_LANG];
        for (const fallbackLang of fallbackChain) {
          if (nameValue[fallbackLang]) {
            nameValue = nameValue[fallbackLang];
            break;
          }
        }
        if (typeof nameValue === 'object') {
          nameValue = '';
        }
      }

      return {
        ...product,
        name: nameValue,
      };
    });

    res.json(await formatProducts(await localizeProductCategories(processedProducts, lang), lang));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[PRODUCT_TOP_RATED] Error:', error);
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy sản phẩm được đánh giá cao',
      error: error.message
    });
  }
});

/**
 * Lấy thống kê chung của cửa hàng (Public) - Optimized with aggregation
 * Sử dụng MongoDB aggregation pipeline để tính tất cả metrics trong 1 query
 * @route GET /api/products/stats/overview
 * @access Public
 */
const getStatsOverview = asyncHandler(async (req, res) => {
  const reportingCurrency = await getReportingCurrency(req.query.currency);

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

  const [totalOrders, totalRevenue] = await Promise.all([
    Order.countDocuments({ isDeleted: false }),
    sumOrdersInCurrency({ isDeleted: false }, reportingCurrency),
  ]);

  // Đếm khách hàng
  const totalCustomers = await withTimeout(
    User.countDocuments({ role: 'user', isDeleted: false }),
    5000
  );

  const productData = productStats[0] || {
    totalProducts: 0,
    inStockProducts: 0,
  };
  const orderData = {
    totalOrders,
    totalRevenue,
  };

  const currencies = await getCurrencyMetadata([reportingCurrency]);
  res.json(formatAmountFields({
    totalProducts: productData.totalProducts,
    inStockProducts: productData.inStockProducts,
    totalOrders: orderData.totalOrders,
    totalRevenue: orderData.totalRevenue,
    totalCustomers,
  }, currencies.get(reportingCurrency), req.lang, [['totalRevenue', 'formattedTotalRevenue']]));
});

/**
 * Lấy danh sách testimonials từ reviews (Public)
 * @route GET /api/products/testimonials/featured
 * @access Public
 */
const getTestimonials = asyncHandler(async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const defaultLang = getDefaultLanguage();
    const lang = (req.query.lang || defaultLang.code).toLowerCase();
    const langUpper = lang.toUpperCase();

    // Load role labels from StaticTranslation (Rule #1: Static UI via i18n)
    const StaticTranslation = require('../models/StaticTranslation');
    let roleLabels = {
      customer: 'Customer',
      anonymous: 'Anonymous Customer',
    };
    let fallbackLabels = roleLabels;
    try {
      // Load target language translations (use lowercase to match seeded data)
      const staticTrans = await StaticTranslation.findOne({
        code: lang,
        namespace: 'testimonial',
        isDeleted: false,
      }).lean();
      if (staticTrans && staticTrans.translations) {
        roleLabels = {
          customer: staticTrans.translations.role_customer || roleLabels.customer,
          anonymous: staticTrans.translations.anonymous_customer || roleLabels.anonymous,
        };
      }

      // Load fallback translations for all non-default language requests
      if (lang !== DEFAULT_LANG) {
        const fallbackTrans = await StaticTranslation.findOne({
          code: DEFAULT_LANG,
          namespace: 'testimonial',
          isDeleted: false,
        }).lean();
        if (fallbackTrans && fallbackTrans.translations) {
          fallbackLabels = {
            customer: fallbackTrans.translations.role_customer || roleLabels.customer,
            anonymous: fallbackTrans.translations.anonymous_customer || roleLabels.anonymous,
          };
          // Use fallback for missing keys in target language
          roleLabels = {
            customer: staticTrans?.translations?.role_customer || fallbackLabels.customer,
            anonymous: staticTrans?.translations?.anonymous_customer || fallbackLabels.anonymous,
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load testimonial labels:', error.message);
    }

    // Lấy reviews và populate user để kiểm tra role
    const allReviews = await withTimeout(
      Review.find({ isDeleted: false })
        .populate('user', 'name role profileImage')
        .sort({ rating: -1, createdAt: -1 })
        .limit(limit * 5), // Lấy nhiều hơn để sau đó lọc bỏ admin
      8000
    );

    // Lọc bỏ reviews từ admin/super-admin
    const filteredReviews = allReviews.filter(review => {
      // Nếu review không có user (vô danh) hoặc user có role là 'user' thì giữ lại
      return !review.user || review.user.role === 'user';
    });

    // Fetch translation cache for review content if needed (only for non-default languages)
    let translationMap = {};
    if (lang !== DEFAULT_LANG) {
      const translations = await UserContentTranslationCache.find({
        entityId: { $in: filteredReviews.map(r => r._id.toString()) },
        targetLang: langUpper,
      }).lean();
      translationMap = Object.fromEntries(
        translations.map(t => [t.entityId.toString(), t])
      );
    }

    // Pick random testimonials to vary the results
    const shuffled = filteredReviews.sort(() => Math.random() - 0.5);
    const testimonials = shuffled.slice(0, limit).map(review => {
      // Xác định avatar: ưu tiên review.avatar, sau đó review.user.profileImage
      let avatarUrl = review.avatar || (review.user && review.user.profileImage);
      let avatar;

      if (avatarUrl) {
        if (avatarUrl.startsWith('http')) {
          avatar = avatarUrl;
        } else {
          avatar = `${process.env.BACKEND_URL || 'http://localhost:5000'}${avatarUrl}`;
        }
      } else {
        // Fallback ảnh mặc định (placeholder) thay vì Dicebear
        avatar = 'https://ui-avatars.com/api/?background=random&color=fff&name=' + encodeURIComponent(review.name || 'User');
      }

      // Get translated content if available
      let content = review.comment;
      const reviewId = review._id.toString();
      if (translationMap[reviewId] && translationMap[reviewId].content) {
        content = translationMap[reviewId].content;
      }

      return {
        name: review.name || (review.user && review.user.name) || roleLabels.anonymous,
        role: roleLabels.customer,
        content: content,
        rating: review.rating,
        avatar,
      };
    });

    res.json(testimonials);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching testimonials:', error);
    }
    const lang = req.lang;
    res.status(500).json({ error: getMessage(lang.toUpperCase(), 'testimonial.fetchFailed') });
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
