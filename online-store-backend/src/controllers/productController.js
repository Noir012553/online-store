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
const CloudinaryUploadClaim = require('../models/CloudinaryUploadClaim');
const UserContentTranslationCache = require('../models/UserContentTranslationCache');
const { withTimeout } = require('../utils/mongooseUtils');
const { normalizeSpecs } = require('../utils/specNormalizer');
const { registerUnknownSpecKeys } = require('../services/specKeyTranslationService');
const { sanitizePlainText, sanitizeDescriptionText } = require('../utils/plainTextSanitizer');
const { broadcastNewProduct, broadcastProductUpdated, broadcastProductDeleted, broadcastProductRestored } = require('../socket/socketHandler');
const { deleteImageFile } = require('../utils/fileUtils');
const { uploadToCloudinary, deleteFromCloudinary, isCloudinaryUrl, extractPublicIdFromUrl, validateCloudinaryImage } = require('../services/cloudinaryService');
const {
  getStorefrontVisibleProductIds,
  overlayTranslationBatchWithFallback,
  overlayTranslation,
} = require('../services/translationHelper');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getMessage } = require('../i18n/messages');
const { ABOUT_MEDIA, getCloudinaryDeliveryUrl, getCloudinaryVideoUrl, getCloudinaryVideoPosterUrl } = require('../config/aboutMedia');
const { enqueueCloudinaryCleanup } = require('../services/cloudinaryCleanupOutbox');
const { localizeProductCategory, localizeProductCategories } = require('../services/categoryLocalizationService');
const { convertOrderAmount, getActiveExchangeRates, getReportingCurrency, sumOrdersInCurrency } = require('../utils/orderRevenue');
const { getCurrencyMetadata, formatAmountFields, formatProducts } = require('../utils/currencyResponseFormatter');

const DEFAULT_LANG = getDefaultLanguage().code;

const getActiveDealDiscount = (deal) => {
  const discount = Number(deal?.discount);
  if (!Number.isFinite(discount) || discount <= 0) return 0;

  if (deal?.endTime) {
    const endTime = new Date(deal.endTime).getTime();
    if (!Number.isFinite(endTime) || endTime <= Date.now()) return 0;
  }

  return discount;
};

const getProductSort = (sortBy) => {
  switch (sortBy) {
    case 'name':
      return { name: 1, _id: 1 };
    case 'price-asc':
      return { price: 1, _id: 1 };
    case 'price-desc':
      return { price: -1, _id: 1 };
    case 'rating':
      return { rating: -1, _id: 1 };
    default:
      return { featured: -1, createdAt: -1, _id: 1 };
  }
};

const findStorefrontVisibleProductIds = async (query) => {
  const products = await withTimeout(
    Product.find(query)
      .select('_id name description brand specs')
      .lean(),
    20000
  );

  return getStorefrontVisibleProductIds(products);
};

const formatProductsForDisplay = async (products, reportingCurrency, locale) => {
  if (!reportingCurrency) {
    return formatProducts(products, locale);
  }

  const [currencies, activeRates] = await Promise.all([
    getCurrencyMetadata([reportingCurrency]),
    getActiveExchangeRates(),
  ]);

  return products.map((product) => {
    const data = product.toObject ? product.toObject() : product;
    const displayPrice = convertOrderAmount(
      data.price,
      data.baseCurrencyCode,
      reportingCurrency,
      data.exchangeRates,
      activeRates
    );
    const displayOriginalPrice = Number.isFinite(data.originalPrice) && data.originalPrice > data.price
      ? convertOrderAmount(
        data.originalPrice,
        data.baseCurrencyCode,
        reportingCurrency,
        data.exchangeRates,
        activeRates
      )
      : undefined;

    return formatAmountFields(
      {
        ...data,
        displayPrice,
        ...(displayOriginalPrice !== undefined && { displayOriginalPrice }),
        discountPercentage: Math.max(
          Number.isFinite(data.originalPrice) && data.originalPrice > data.price
            ? Math.round(((data.originalPrice - data.price) / data.originalPrice) * 100)
            : 0,
          getActiveDealDiscount(data.deal)
        ),
      },
      currencies.get(reportingCurrency),
      locale,
      [
        ['displayPrice', 'formattedPrice'],
        ['displayOriginalPrice', 'formattedOriginalPrice'],
      ]
    );
  });
};

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
 * Không populate reviews (quá nặng), chỉ populate category
 * @route GET /api/products/featured
 * @access Public
 */
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;
  const lang = req.lang;
  const reportingCurrency = req.query.currencyCode
    ? await getReportingCurrency(req.query.currencyCode)
    : null;

  // Build query with filters (tương tự getProducts nhưng nhẹ hơn)
  const keywordFilters = [];
  if (typeof req.query.keyword === 'string') {
    const searchTerm = req.query.keyword.trim();
    const safeSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: safeSearchTerm, $options: 'i' };

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
  const specsFilter = req.query.hasSpecs === 'true'
    ? { specs: { $type: 'object', $ne: {} } }
    : {};

  const query = {
    isDeleted: false,
    featured: true,
    ...category,
    ...brand,
    ...priceFilter,
    ...stockFilter,
    ...specsFilter,
  };
  if (discountFilter) {
    query.$and = query.$and || [];
    query.$and.push(discountFilter);
  }
  if (keywordFilters.length > 0) {
    query.$or = keywordFilters;
  }

  const visibleProductIds = await findStorefrontVisibleProductIds(query);
  const count = visibleProductIds.size;
  const productQuery = { ...query, _id: { $in: [...visibleProductIds] } };
  const prioritizeSpecs = req.query.prioritizeSpecs === 'true';
  const products = await withTimeout(
    prioritizeSpecs
      ? Product.aggregate([
        { $match: productQuery },
        {
          $addFields: {
            hasSpecs: {
              $cond: [
                { $eq: [{ $type: '$specs' }, 'object'] },
                { $ne: ['$specs', {}] },
                false,
              ],
            },
          },
        },
        { $sort: { hasSpecs: -1, featured: -1, createdAt: -1, _id: 1 } },
        { $skip: pageSize * (page - 1) },
        { $limit: pageSize },
        { $project: { hasSpecs: 0 } },
      ])
      : Product.find(productQuery)
        .populate('category')
        .lean()
        .sort({ featured: -1, createdAt: -1, _id: 1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1)),
    15000
  );
  const populatedProducts = prioritizeSpecs
    ? await Product.populate(products, { path: 'category' })
    : products;

  const translatedProducts = await overlayTranslationBatchWithFallback(populatedProducts, 'product', lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, lang);
  res.json({ products: await formatProductsForDisplay(localizedProducts, reportingCurrency, req.locale), page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy danh sách sản phẩm với phân trang, tìm kiếm và lọc
 * @route GET /api/products
 * @access Public
 */
const getAdminTranslationProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 10, 500);
  const page = Number(req.query.pageNumber) || 1;
  const lang = req.lang;
  const query = { isDeleted: false };

  if (typeof req.query.keyword === 'string' && req.query.keyword.trim()) {
    const safeSearchTerm = req.query.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.name = { $regex: safeSearchTerm, $options: 'i' };
  }

  const [count, products] = await Promise.all([
    Product.countDocuments(query),
    withTimeout(
      Product.find(query)
        .populate('category')
      .lean()
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1)),
      20000
    ),
  ]);

  const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, lang);
  res.json({
    products: await formatProductsForDisplay(localizedProducts, null, req.locale),
    page,
    pages: Math.ceil(count / pageSize),
    total: count,
  });
});

const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 9, 500); // Max 500 products
  const page = Number(req.query.pageNumber) || 1;
  const lang = req.lang;
  const reportingCurrency = req.query.currencyCode
    ? await getReportingCurrency(req.query.currencyCode)
    : null;

  // Build keyword filter - search by name and price
  const keywordFilters = [];
  if (typeof req.query.keyword === 'string') {
    const searchTerm = req.query.keyword.trim();
    const safeSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: safeSearchTerm, $options: 'i' };

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
    const categoryId = new mongoose.Types.ObjectId(req.query.category);
    const selectedCategory = await Category.findOne({ _id: categoryId, isDeleted: false }).lean();

    if (selectedCategory) {
      const categoryNames = [selectedCategory.name, ...(selectedCategory.sourceNames || [])]
        .filter(Boolean)
        .map(name => String(name).trim());
      const relatedCategoryIds = await Category.find({
        isDeleted: false,
        $or: [
          { _id: categoryId },
          { name: { $in: categoryNames } },
          { sourceNames: { $in: categoryNames } },
        ],
      }).distinct('_id');
      category = { category: { $in: relatedCategoryIds } };
    } else {
      category = { category: categoryId };
    }
  }
  const brand = req.query.brand ? { brand: req.query.brand } : {};
  const featuredFilter = req.query.featured === 'true' ? { featured: true } : {};
  const dealFilter = req.query.hasDeal === 'true'
    ? {
      'deal.discount': { $gt: 0 },
      $and: [{
        $or: [
          { 'deal.endTime': { $exists: false } },
          { 'deal.endTime': null },
          { 'deal.endTime': { $gt: new Date() } },
        ],
      }],
    }
    : {};

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

  const visibleProductIds = await findStorefrontVisibleProductIds(query);
  const count = visibleProductIds.size;
  const products = await withTimeout(
    Product.find({ ...query, _id: { $in: [...visibleProductIds] } })
      .populate('category')
      .lean()
      .sort(getProductSort(req.query.sortBy))
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    20000
  );

  const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', lang);
  const localizedProducts = await localizeProductCategories(translatedProducts, lang);
  res.json({ products: await formatProductsForDisplay(localizedProducts, reportingCurrency, req.locale), page, pages: Math.ceil(count / pageSize), total: count });
});

/**
 * Lấy chi tiết sản phẩm theo ID
 * Hỗ trợ `lang` query parameter để dịch product name/description
 * @route GET /api/products/:id
 * @access Public
 */
const getProductById = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const reportingCurrency = req.query.currencyCode
    ? await getReportingCurrency(req.query.currencyCode)
    : null;

  // Validate MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404);
    throw new Error(getMessage(lang, 'product.notFound'));
  }

  const product = await withTimeout(
    Product.findById(req.params.id)
      .populate({ path: 'reviews', options: { limit: 50 } }) // Limit reviews to prevent memory leak
      .populate('category'),
    15000
  );

  if (product && !product.isDeleted) {
    let productObj = product.toObject ? product.toObject() : product;
    const visibleProductIds = await getStorefrontVisibleProductIds([productObj]);

    if (!visibleProductIds.has(productObj._id.toString())) {
      res.status(404);
      throw new Error(getMessage(lang, 'product.notFound'));
    }

    const translatedProduct = await overlayTranslation(productObj, 'product', lang);
    const localizedProduct = await localizeProductCategory(translatedProduct, lang);

    res.json((await formatProductsForDisplay([localizedProduct], reportingCurrency, req.locale))[0]);
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
    name, price, description, brand, category, countInStock,
    originalPrice, baseCurrencyCode, featured, images, specs, deal, image, imagePublicId, imageClaimId
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

  const normalizedName = sanitizePlainText(name);
  const normalizedBrand = sanitizePlainText(brand);
  const normalizedDescription = sanitizeDescriptionText(description);
  await registerUnknownSpecKeys(specs || {});
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
  let imageClaim = null;

  if (image) {
    try {
      await validateCloudinaryImage({ publicId: imagePublicId, url: image, allowedFolders: ['admins'] });
      imageClaim = await CloudinaryUploadClaim.reserve({
        claimId: imageClaimId,
        ownerId: req.user._id,
        publicId: imagePublicId,
        purpose: 'product',
      });
      if (!imageClaim) throw new Error('Invalid upload claim');
      imageUrl = image;
      imagePubicId = imagePublicId;
    } catch (error) {
      res.status(400);
      throw new Error(getMessage(lang.toUpperCase(), 'common.image_validation_failed'));
    }
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
    name: normalizedName,
    price: numPrice,
    originalPrice: numOriginalPrice,
    baseCurrencyCode: normalizedBaseCurrencyCode,
    user: req.user._id,
    image: imageUrl,
    imagePublicId: imagePubicId,
    images: images || [],
    brand: normalizedBrand,
    category: resolvedCategory._id,
    countInStock: numCountInStock,
    description: normalizedDescription,
    featured: featured || false,
    specs: normalizedSpecs,
    deal: parsedDeal,
    numReviews: 0,
    rating: 0,
  });

  let createdProduct;
  try {
    createdProduct = await product.save();
  } catch (error) {
    if (imageClaim) await CloudinaryUploadClaim.release(imageClaim._id, req.user._id);
    throw error;
  }

  if (imageClaim) await CloudinaryUploadClaim.attach(imageClaim._id, req.user._id);

  // Populate fields để response data consistent với getProductById
  const populatedProduct = await withTimeout(
    Product.findById(createdProduct._id)
      .populate('reviews')
      .populate('category'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      const formattedProduct = (await formatProducts([populatedProduct], req.lang))[0];
      broadcastNewProduct(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        formattedPrice: formattedProduct.formattedPrice,
        originalPrice: populatedProduct.originalPrice,
        formattedOriginalPrice: formattedProduct.formattedOriginalPrice,
        baseCurrencyCode: populatedProduct.baseCurrencyCode,
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
    name, price, description, brand, category, countInStock,
    originalPrice, baseCurrencyCode, featured, images, specs, deal, image, imagePublicId, imageClaimId
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

  if (specs) await registerUnknownSpecKeys(specs);
  const normalizedSpecs = specs ? normalizeSpecs(specs) : product.specs;

  if (name !== undefined) {
    product.name = sanitizePlainText(name);
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
    product.description = sanitizeDescriptionText(description);
  }

  if (brand !== undefined) {
    product.brand = sanitizePlainText(brand);
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

  if (featured !== undefined) {
    product.featured = featured;
  }

  if (images !== undefined) {
    product.images = images;
  }

  if (specs !== undefined) {
    product.specs = normalizedSpecs;
  }

  if (deal !== undefined) {
    product.deal = parseDealInput(deal);
  }

  const previousImagePublicId = product.imagePublicId;
  let uploadedImagePublicId = null;
  let imageClaim = null;

  if (image || req.file) {
    if (image) {
      try {
        await validateCloudinaryImage({ publicId: imagePublicId, url: image, allowedFolders: ['admins'] });
        imageClaim = await CloudinaryUploadClaim.reserve({
          claimId: imageClaimId,
          ownerId: req.user._id,
          publicId: imagePublicId,
          purpose: 'product',
        });
        if (!imageClaim) throw new Error('Invalid upload claim');
        product.image = image;
        product.imagePublicId = imagePublicId;
        console.log('[PRODUCT_UPDATE] Image updated from Cloudinary upload:', { url: image });
      } catch (error) {
        res.status(400);
        throw new Error(getMessage(lang.toUpperCase(), 'common.image_validation_failed'));
      }
    } else if (req.file) {
      // Legacy backend upload - upload file to Cloudinary
      try {
        const folder = req.user.role === 'admin' || req.user.role === 'super-admin' ? 'admins' : 'users';
        const cloudinaryResult = await uploadToCloudinary(req.file.buffer, folder);
        uploadedImagePublicId = cloudinaryResult.publicId;
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

  let updatedProduct;
  try {
    updatedProduct = await product.save();
  } catch (error) {
    if (uploadedImagePublicId) {
      try {
        await deleteFromCloudinary(uploadedImagePublicId);
      } catch (cleanupError) {
        console.warn('[PRODUCT_UPDATE] Failed to clean up replacement image:', cleanupError.message);
      }
    }
    if (imageClaim) await CloudinaryUploadClaim.release(imageClaim._id, req.user._id);

    if (error.name === 'VersionError') {
      res.status(409);
      throw new Error('Product was changed by another administrator. Please reload and try again.');
    }

    throw error;
  }

  if (imageClaim) await CloudinaryUploadClaim.attach(imageClaim._id, req.user._id);

  if (previousImagePublicId && previousImagePublicId !== updatedProduct.imagePublicId) {
    await enqueueCloudinaryCleanup(previousImagePublicId);
  }
  const populatedProduct = await withTimeout(
    Product.findById(updatedProduct._id)
      .populate('category'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  try {
    const io = req.app.get('io');
    if (io) {
      const formattedProduct = (await formatProducts([populatedProduct], req.lang))[0];
      broadcastProductUpdated(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        formattedPrice: formattedProduct.formattedPrice,
        originalPrice: populatedProduct.originalPrice,
        formattedOriginalPrice: formattedProduct.formattedOriginalPrice,
        baseCurrencyCode: populatedProduct.baseCurrencyCode,
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
  try {
    await product.save();
  } catch (error) {
    if (error.name === 'VersionError') {
      res.status(409);
      throw new Error('Product was changed by another administrator. Please reload and try again.');
    }
    throw error;
  }

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
  let restoredProduct;
  try {
    restoredProduct = await product.save();
  } catch (error) {
    if (error.name === 'VersionError') {
      res.status(409);
      throw new Error('Product was changed by another administrator. Please reload and try again.');
    }
    throw error;
  }
  const populatedProduct = await withTimeout(
    Product.findById(restoredProduct._id)
      .populate('category'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      const formattedProduct = (await formatProducts([populatedProduct], req.lang))[0];
      broadcastProductRestored(io, {
        _id: populatedProduct._id,
        name: populatedProduct.name,
        price: populatedProduct.price,
        formattedPrice: formattedProduct.formattedPrice,
        originalPrice: populatedProduct.originalPrice,
        formattedOriginalPrice: formattedProduct.formattedOriginalPrice,
        baseCurrencyCode: populatedProduct.baseCurrencyCode,
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

  try {
    await withTimeout(Product.findByIdAndDelete(req.params.id), 8000);
    console.log('[PRODUCT_HARD_DELETE] Product document deleted from database');
  } catch (dbError) {
    console.error('[PRODUCT_HARD_DELETE] Failed to delete product from database:', dbError.message);
    res.status(500);
    throw new Error(`Failed to delete product: ${dbError.message}`);
  }

  const imagePublicIds = new Set();
  if (product.image && isCloudinaryUrl(product.image) && product.imagePublicId) {
    imagePublicIds.add(product.imagePublicId);
  }
  for (const image of product.images || []) {
    if (image && isCloudinaryUrl(image)) {
      const publicId = extractPublicIdFromUrl(image);
      if (publicId) imagePublicIds.add(publicId);
    }
  }
  await Promise.all([...imagePublicIds].map(enqueueCloudinaryCleanup));

  res.json({
    message: 'Product permanently deleted',
    queuedImageCleanups: imagePublicIds.size,
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

    const visibleProductIds = await findStorefrontVisibleProductIds({ isDeleted: false });
    const products = await withTimeout(
      Product.find({ isDeleted: false, _id: { $in: [...visibleProductIds] } })
        .populate('category')
        .sort({ rating: -1 })
        .limit(3)
        .lean(),
      8000
    );

    if (!products || products.length === 0) {
      return res.json([]);
    }

    const translatedProducts = await overlayTranslationBatchWithFallback(products, 'product', lang);
    const localizedProducts = await localizeProductCategories(translatedProducts, lang);
    const reportingCurrency = req.query.currencyCode
      ? await getReportingCurrency(req.query.currencyCode)
      : null;
    res.json(await formatProductsForDisplay(localizedProducts, reportingCurrency, req.locale));
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
  }, currencies.get(reportingCurrency), req.locale, [['totalRevenue', 'formattedTotalRevenue']]));
});

/**
 * Lấy danh sách testimonials từ reviews (Public)
 * @route GET /api/products/testimonials/featured
 * @access Public
 */
const getAboutMedia = (req, res) => {
  const team = ABOUT_MEDIA.team.map(({ key, publicId }) => ({
    key,
    url: getCloudinaryDeliveryUrl(publicId, 640),
    srcSet: [640, 1200]
      .map((width) => getCloudinaryDeliveryUrl(publicId, width))
      .filter(Boolean)
      .map((url, index) => `${url} ${[640, 1200][index]}w`)
      .join(', '),
  }));

  res.json({
    team,
    hero: {
      url: getCloudinaryVideoUrl(ABOUT_MEDIA.hero.publicId),
      poster: getCloudinaryVideoPosterUrl(ABOUT_MEDIA.hero.publicId),
    },
  });
};

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

    const filteredReviews = allReviews.filter((review) => {
      const isCustomerReview = !review.user || review.user.role === 'user';
      const isAboutReviewer = ABOUT_MEDIA.reviewers.some(({ publicId }) => review.avatarPublicId === publicId);
      return isCustomerReview && isAboutReviewer && isCloudinaryUrl(review.avatar);
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
        avatar: review.avatar,
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
  getAdminTranslationProducts,
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
  getAboutMedia,
  getTestimonials,
};
