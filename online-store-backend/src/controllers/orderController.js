/**
 * Controller quản lý đơn hàng
 * Xử lý: tạo đơn hàng, cập nhật trạng thái, soft/hard delete
 * Hỗ trợ phân trang, tìm kiếm, quản lý khách hàng tự động
 */
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Currency = require('../models/Currency');
const { withTimeout } = require('../utils/mongooseUtils');
const { broadcastNewOrder, broadcastOrderStatusUpdate, broadcastOrderDeleted, broadcastOrderRestored } = require('../socket/socketHandler');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');
const { convertOrderAmount } = require('../utils/orderRevenue');
const { calculateSelectedShipping } = require('../services/shippingService');

const DEFAULT_ITEM_WEIGHT_GRAMS = 500;
const WAREHOUSE_DISTRICT_ID = 1458;

const createOrderError = (lang, errorCode, messageKey, values = {}) => {
  const error = new Error(getMessage(lang, messageKey, values));
  error.errorCode = errorCode;
  return error;
};

const roundCurrencyAmount = (amount, decimalPlaces) => {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(amount * multiplier) / multiplier;
};

const convertFromCatalogCurrency = (amount, catalogCurrency, currencyCode, exchangeRates, decimalPlaces) => {
  return roundCurrencyAmount(
    convertOrderAmount(amount, catalogCurrency, currencyCode, exchangeRates),
    decimalPlaces
  );
};

/**
 * Cập nhật trạng thái đơn hàng (isPaid, isDelivered)
 * @route PUT /api/orders/:id/status
 * @access Private/Admin
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const { orderId } = req.params;
  const { isPaid, isDelivered } = req.body;

  const order = await withTimeout(Order.findOne({ _id: orderId, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage(lang, 'order.notFound'));
  }

  let updated = false;
  if (isPaid !== undefined && order.isPaid !== isPaid) {
    order.isPaid = isPaid;
    if (isPaid) {
      order.paidAt = new Date();
    }
    updated = true;
  }

  if (isDelivered !== undefined && order.isDelivered !== isDelivered) {
    order.isDelivered = isDelivered;
    if (isDelivered) {
      order.deliveredAt = new Date();
    }
    updated = true;
  }

  if (updated) {
    const updatedOrder = await order.save();

    // Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      broadcastOrderStatusUpdate(io, updatedOrder);
    }

    res.json(updatedOrder);
  } else {
    res.json(order);
  }
});


/**
 * Tạo đơn hàng mới
 * Kiểm tra stock, tự động upsert khách hàng theo phone number
 * Hỗ trợ idempotency key để prevent duplicate orders
 * ⚠️ SECURITY: Backend recalculates totalPrice từ DB, không tin client
 * @route POST /api/orders
 * @access Private
 */
const addOrderItems = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const {
    cartItems,
    couponCode,
    customerPhone,
    customerName,
    customerEmail,
    idempotencyKey,
    shippingAddress,
    shippingProvider,
    shippingService,
    paymentMethod,
  } = req.body;

  if (!cartItems || cartItems.length === 0) {
    res.status(400);
    throw createOrderError(lang, 'ORDER_NO_ITEMS', 'order.noCartItems');
  }

  // ==================== IDEMPOTENCY CHECK ====================
  // If idempotencyKey provided, check if order already created with this key
  if (idempotencyKey) {
    const existingOrder = await withTimeout(
      Order.findOne({
        idempotencyKey,
        createdAt: { $gte: new Date(Date.now() - 3600000) } // 1 hour window
      }),
      5000
    );

    if (existingOrder) {
      // Return existing order to prevent duplicate
      return res.status(200).json({
        success: true,
        data: existingOrder,
        isDuplicate: true,
      });
    }
  }

  // ==================== BACKEND PRICE RECALCULATION ====================
  // Security: Query DB prices, DO NOT trust client totalPrice
  // Optimized: Use $in to fetch all products in 1 query instead of N queries
  const productMap = new Map();
  const productIdList = [];
  const cartItemsByProductId = new Map();

  for (const item of cartItems) {
    const productId = item.productId || item.product;
    if (!productId) {
      res.status(400);
      throw new Error(getMessage(lang, 'validation.product.idRequired'));
    }
    productIdList.push(productId);
    cartItemsByProductId.set(String(productId), item);
  }

  // Fetch all products in 1 query with $in operator
  const products = await withTimeout(
    Product.find({ _id: { $in: productIdList } }),
    8000
  );

  // Create map for quick lookup
  const productLookup = new Map(products.map(p => [String(p._id), p]));

  // Validate all products exist and check stock
  for (const item of cartItems) {
    const productId = String(item.productId || item.product);
    const product = productLookup.get(productId);

    if (!product) {
      res.status(404);
      throw new Error(getMessage(lang, 'product.notFound'));
    }

    // Stock check
    if (product.countInStock < item.quantity) {
      res.status(400);
      throw createOrderError(lang, 'ORDER_INSUFFICIENT_STOCK', 'product.insufficientStock');
    }

    productMap.set(productId, {
      product,
      quantity: item.quantity,
    });

  }

  let customerId = null;

  // Always try to create or find customer data
  if (customerPhone || customerName || customerEmail) {
    try {
      // Case 1: Phone provided - upsert by phone (most reliable for order creation)
      if (customerPhone) {
        const normalizedEmail = customerEmail ? customerEmail.toLowerCase().trim() : null;

        // Use findOneAndUpdate with upsert to avoid race condition
        const customer = await withTimeout(
          Customer.findOneAndUpdate(
            { phone: customerPhone, isDeleted: false },
            {
              $set: {
                ...(customerName && { name: customerName }),
                ...(normalizedEmail && { email: normalizedEmail }),
                updatedAt: new Date()
              }
            },
            { returnDocument: 'after', upsert: true, runValidators: true }
          ),
          8000
        );
        customerId = customer._id;
      }
      // Case 2: Email provided but no phone - upsert by email
      else if (customerEmail) {
        const normalizedEmail = customerEmail.toLowerCase().trim();

        if (!customerName) {
          res.status(400);
          throw createOrderError(lang, 'CUSTOMER_NAME_REQUIRED', 'product.customerNameRequired');
        }

        // Generate a unique phone number if not provided
        const generatedPhone = `090${String(Math.random() * 10000000).padStart(7, '0')}`;

        const customer = await withTimeout(
          Customer.findOneAndUpdate(
            { email: normalizedEmail, isDeleted: false },
            {
              $set: {
                name: customerName,
                email: normalizedEmail,
                ...(generatedPhone && !customerPhone && { phone: generatedPhone }), // Only set if we generated it
              }
            },
            { returnDocument: 'after', upsert: true, runValidators: true }
          ),
          8000
        );
        customerId = customer._id;
      }
      // Case 3: Only name provided - create new with generated email and phone
      else if (customerName) {
        const generatedPhone = `090${String(Math.random() * 10000000).padStart(7, '0')}`;
        const generatedEmail = `customer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@generated.local`;

        const customer = new Customer({
          name: customerName,
          email: generatedEmail,
          phone: generatedPhone,
        });
        await customer.save();
        customerId = customer._id;
      }
    } catch (err) {
      // Handle duplicate key errors from unique indexes
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        res.status(409);
        throw createOrderError(lang, 'CUSTOMER_FIELD_IN_USE', 'product.fieldInUse');
      }
      throw err;
    }
  }

  // PHASE 3: Historical Currency Accuracy - Get current exchange rates
  const { currencyCode: requestedCurrencyCode } = req.body;
  let exchangeRates = [];

  if (typeof requestedCurrencyCode !== 'string' || !requestedCurrencyCode) {
    res.status(400);
    throw createOrderError(lang, 'ORDER_CURRENCY_REQUIRED', 'checkout.error_currency_required');
  }

  const currencyCode = requestedCurrencyCode.toUpperCase();
  const paymentCurrency = await Currency.findOne({ code: currencyCode, isActive: true }, { code: 1 }).lean();
  if (!paymentCurrency) {
    res.status(400);
    throw createOrderError(lang, 'ORDER_CURRENCY_NOT_FOUND', 'checkout.error_currency_not_found');
  }

  try {
    const ExchangeRate = require('../models/ExchangeRate');
    const rates = await withTimeout(
      ExchangeRate.find({ isActive: true }, { fromCode: 1, toCode: 1, rate: 1, rateUpdatedAt: 1, _id: 0 }),
      5000
    );
    exchangeRates = rates.map((rate) => ({
      fromCode: rate.fromCode,
      toCode: rate.toCode,
      rate: rate.rate,
      rateUpdatedAt: rate.rateUpdatedAt,
    }));
  } catch (err) {
    res.status(503);
    throw new Error('Currency exchange rates are temporarily unavailable');
  }

  const baseCurrency = await Currency.findOne(
    { isActive: true, isDefault: true },
    { code: 1 }
  ).lean();

  if (!baseCurrency) {
    res.status(503);
    throw createOrderError(lang, 'ORDER_CURRENCY_CONFIG_UNAVAILABLE', 'common.error_request_title');
  }

  const baseCurrencyCode = baseCurrency.code;
  const getProductBaseCurrencyCode = (product) => product.baseCurrencyCode;
  const productBaseCurrencyCodes = Array.from(
    productMap.values(),
    ({ product }) => getProductBaseCurrencyCode(product)
  );

  if (productBaseCurrencyCodes.some((code) => typeof code !== 'string' || !/^[A-Z]{3}$/.test(code))) {
    res.status(422);
    throw new Error('Product base currency is missing or invalid');
  }

  const referencedCurrencyCodes = new Set([
    baseCurrencyCode,
    currencyCode,
    ...productBaseCurrencyCodes,
  ]);
  const currencyMetadata = await Currency.find(
    { code: { $in: Array.from(referencedCurrencyCodes) } },
    { code: 1, decimalPlaces: 1, _id: 0 }
  ).lean();
  const currencyDecimalPlaces = new Map(currencyMetadata.map((currency) => [currency.code, currency.decimalPlaces]));

  for (const code of referencedCurrencyCodes) {
    if (!currencyDecimalPlaces.has(code)) {
      res.status(503);
      throw createOrderError(lang, 'ORDER_CURRENCY_CONFIG_UNAVAILABLE', 'common.error_request_title');
    }
  }

  const hasExchangeRate = (fromCode, toCode) =>
    fromCode === toCode || exchangeRates.some(
      (rate) =>
        (rate.fromCode === fromCode && rate.toCode === toCode) ||
        (rate.fromCode === toCode && rate.toCode === fromCode)
    );

  for (const sourceCurrencyCode of referencedCurrencyCodes) {
    if (!hasExchangeRate(sourceCurrencyCode, baseCurrencyCode) || !hasExchangeRate(baseCurrencyCode, currencyCode)) {
      res.status(503);
      throw createOrderError(lang, 'ORDER_RATES_UNAVAILABLE', 'common.error_server_desc');
    }
  }

  const convertToBaseCurrency = (amount, sourceCurrencyCode) =>
    convertFromCatalogCurrency(
      amount,
      sourceCurrencyCode,
      baseCurrencyCode,
      exchangeRates,
      currencyDecimalPlaces.get(baseCurrencyCode)
    );
  const calculatedItemsPrice = Array.from(productMap.values()).reduce(
    (total, { product, quantity }) =>
      total + convertToBaseCurrency(product.price * quantity, getProductBaseCurrencyCode(product)),
    0
  );
  let appliedCoupon = null;
  let discountAmount = 0;

  if (couponCode) {
    const Coupon = require('../models/Coupon');
    const coupon = await withTimeout(
      Coupon.findOne({ code: couponCode.toUpperCase(), isDeleted: false, isActive: true }),
      8000
    );

    if (!coupon) {
      res.status(404);
      throw new Error(getMessage(lang, 'order.invalidPromoCode'));
    }

    const now = new Date();
    if (coupon.startDate > now || coupon.endDate < now) {
      res.status(400);
      throw new Error(getMessage(lang, 'order.couponExpired'));
    }
    if (coupon.currentUses >= coupon.maxUses) {
      res.status(400);
      throw new Error(getMessage(lang, 'order.couponLimitExceeded'));
    }
    if (!coupon.currencyCode) {
      res.status(400);
      throw new Error('Coupon is missing currencyCode');
    }

    const couponCurrencyCode = coupon.currencyCode.toUpperCase();
    if (!currencyDecimalPlaces.has(couponCurrencyCode) || !hasExchangeRate(couponCurrencyCode, baseCurrencyCode)) {
      res.status(503);
      throw createOrderError(lang, 'ORDER_RATES_UNAVAILABLE', 'common.error_server_desc');
    }
    const baseMinOrderAmount = convertToBaseCurrency(coupon.minOrderAmount, couponCurrencyCode);
    if (calculatedItemsPrice < baseMinOrderAmount) {
      res.status(400);
      throw new Error(getMessage(lang, 'order.couponMinAmount'));
    }

    discountAmount = coupon.discountType === 'percentage'
      ? Math.round((calculatedItemsPrice * coupon.discountValue) / 100)
      : coupon.discountType === 'fixed'
        ? convertToBaseCurrency(coupon.discountValue, couponCurrencyCode)
        : 0;
    appliedCoupon = {
      code: coupon.code,
      couponId: coupon._id,
      couponCurrencyCode,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      couponMinOrderAmount: coupon.minOrderAmount,
      baseMinOrderAmount,
      baseDiscountAmount: discountAmount,
      discountAmount,
    };
  }

  let baseShippingFee = 0;

  if (shippingProvider || shippingService) {
    if (!shippingProvider || !shippingService || !shippingAddress?.districtId || !shippingAddress?.wardCode) {
      res.status(400);
      throw new Error('A valid shipping provider, service, and address are required');
    }

    const totalWeight = Array.from(productMap.values()).reduce(
      (weight, { quantity }) => weight + (DEFAULT_ITEM_WEIGHT_GRAMS * quantity),
      0
    );

    try {
      baseShippingFee = await calculateSelectedShipping({
        providerCode: shippingProvider,
        serviceType: shippingService,
        from: { districtId: WAREHOUSE_DISTRICT_ID },
        to: { districtId: shippingAddress.districtId, wardCode: shippingAddress.wardCode },
        weight: Math.max(totalWeight, 100),
        value: calculatedItemsPrice,
        lang,
      });
    } catch {
      res.status(502);
      throw new Error(getMessage(lang, 'shipping.cannotCalculateFee'));
    }
  }

  const convertedItemsPrice = convertFromCatalogCurrency(
    calculatedItemsPrice,
    baseCurrencyCode,
    currencyCode,
    exchangeRates,
    currencyDecimalPlaces.get(currencyCode)
  );
  const convertedShippingFee = convertFromCatalogCurrency(
    baseShippingFee,
    baseCurrencyCode,
    currencyCode,
    exchangeRates,
    currencyDecimalPlaces.get(currencyCode)
  );
  const convertedDiscountAmount = convertFromCatalogCurrency(
    discountAmount,
    baseCurrencyCode,
    currencyCode,
    exchangeRates,
    currencyDecimalPlaces.get(currencyCode)
  );

  if (appliedCoupon) {
    appliedCoupon.discountAmount = convertedDiscountAmount;
  }

  // ==================== FINAL TOTAL CALCULATION ====================
  const taxPrice = 0;
  const totalPrice = roundCurrencyAmount(
    Math.max(0, convertedItemsPrice + taxPrice + convertedShippingFee - convertedDiscountAmount),
    currencyDecimalPlaces.get(currencyCode)
  );
  const baseTotalPrice = roundCurrencyAmount(
    Math.max(0, calculatedItemsPrice + baseShippingFee - discountAmount),
    currencyDecimalPlaces.get(baseCurrencyCode)
  );
  const exchangeRateCapturedAt = new Date();

  // Map cartItems to orderItems with actual product data from DB
  const orderItems = Array.from(productMap.entries()).map(([productId, { product, quantity }]) => ({
    product: product._id,
    name: typeof product.name === 'object' ? product.name[getDefaultLanguage().code] || Object.values(product.name).find(Boolean) || product.name : product.name,
    qty: quantity,
    price: convertFromCatalogCurrency(
      product.price,
      getProductBaseCurrencyCode(product),
      currencyCode,
      exchangeRates,
      currencyDecimalPlaces.get(currencyCode)
    ),
    image: product.image || product.images?.[0] || '',
  }));

  const order = new Order({
    orderItems,
    user: req.user._id,
    customer: customerId,
    itemsPrice: convertedItemsPrice,
    discount: convertedDiscountAmount,
    taxPrice,
    totalPrice,
    shippingFee: convertedShippingFee,
    appliedCoupon, // Store coupon used for audit trail
    shippingAddress, // ← Save shipping address for shipment creation
    shippingProvider, // ← Save shipping provider preference
    shippingService, // ← Save shipping service preference
    isPaid: false, // Mặc định chưa thanh toán
    isDelivered: false, // Mặc định chưa giao
    paymentMethod: paymentMethod || 'cod', // ← Use provided payment method, default to COD
    idempotencyKey, // ← Store idempotency key for duplicate prevention
    currencyCode, // PHASE 3: Save currency code at order creation time
    baseCurrencyCode,
    baseItemsPrice: calculatedItemsPrice,
    baseDiscount: discountAmount,
    baseTotalPrice,
    baseShippingFee,
    exchangeRateCapturedAt,
    exchangeRates, // PHASE 3: Save exchange rates snapshot for historical accuracy
  });

  const createdOrder = await order.save();

  // Return populated order with customer data
  const populatedOrder = await withTimeout(
    Order.findById(createdOrder._id)
      .populate('customer', 'name email phone')
      .populate('user', 'username email name'),
    8000
  );

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastNewOrder(io, {
        _id: populatedOrder._id,
        orderItems: populatedOrder.orderItems,
        customer: populatedOrder.customer,
        user: populatedOrder.user,
        totalPrice: populatedOrder.totalPrice,
        isPaid: populatedOrder.isPaid,
        isDelivered: populatedOrder.isDelivered,
        createdAt: populatedOrder.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
  }

  res.status(201).json({
    success: true,
    data: populatedOrder,
  });
});

/**
 * Lấy chi tiết đơn hàng theo ID
 * @route GET /api/orders/:id
 * @access Private
 */
const getOrderById = asyncHandler(async (req, res) => {
  const lang = req.query.lang;
  if (typeof lang !== 'string' || !isSupportedLanguage(lang)) {
    return res.sendStatus(400);
  }

  let order = await withTimeout(
    Order.findOne({ _id: req.params.id, isDeleted: false })
      .populate('user', 'username email')
      .populate('customer', 'name email phone'),
    8000
  );

  if (order) {
    const isOwner = req.user && (
      String(order.user?._id || order.user || '') === String(req.user._id) ||
      (order.customer && order.customer.email && order.customer.email.toLowerCase() === req.user.email.toLowerCase())
    );
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super-admin');

    if (!isOwner && !isAdmin) {
      res.status(403);
      throw new Error(getMessage(lang, 'order.notAuthorized'));
    }

    // Apply translations to orderItems for the requested language
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    const productIds = new Set();
    if (order.orderItems && Array.isArray(order.orderItems)) {
      order.orderItems.forEach(item => {
        if (item.product) {
          productIds.add(item.product.toString());
        }
      });
    }

    let translationMap = {};
    if (productIds.size > 0) {
      const translations = await ProductCatalogTranslationCache.find({
        entityId: { $in: Array.from(productIds) },
        targetLang: lang
      }).lean();

      translations.forEach(t => {
        translationMap[t.entityId] = t;
      });
    }

    order = {
      ...order.toObject ? order.toObject() : order,
      orderItems: (order.orderItems || []).map(item => {
        const translation = translationMap[item.product?.toString()];
        return {
          ...(item.toObject ? item.toObject() : item),
          name: (translation && translation.name) ? translation.name : item.name
        };
      })
    };

    res.json(order);
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'order.notFound'));
  }
});

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại (có phân trang)
 * @route GET /api/orders/myorders
 * @access Private
 * @param {string} lang - Ngôn ngữ (e.g., 'vi', 'en') để dịch product names từ cache
 *
 * Fallback: Nếu user không có orders (ví dụ orders cũ không có field user),
 * sẽ match orders theo customer email của user
 */
const getMyOrders = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;

  // Trước tiên, cố gắng lấy orders có user field
  let count = await withTimeout(Order.countDocuments({ user: req.user._id, isDeleted: false }), 8000);
  let orders = await withTimeout(
    Order.find({ user: req.user._id, isDeleted: false })
      .populate('user', 'username email')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    8000
  );

  // Fallback: Nếu user không có orders, match theo customer email (cho mock/old data)
  // Sử dụng aggregation pipeline để join với Customer collection
  if (orders.length === 0 && req.user.email) {

    const customerEmail = req.user.email.toLowerCase().trim();

    // Count total matching orders with aggregation
    const countResult = await withTimeout(
      Order.aggregate([
        {
          $match: { isDeleted: false }
        },
        {
          $lookup: {
            from: 'customers',
            localField: 'customer',
            foreignField: '_id',
            as: 'customerData'
          }
        },
        {
          $match: {
            'customerData.email': customerEmail
          }
        },
        {
          $count: 'total'
        }
      ]),
      8000
    );

    count = countResult.length > 0 ? countResult[0].total : 0;

    // Get paginated results with aggregation
    if (count > 0) {
      const aggregationResult = await withTimeout(
        Order.aggregate([
          {
            $match: { isDeleted: false }
          },
          {
            $lookup: {
              from: 'customers',
              localField: 'customer',
              foreignField: '_id',
              as: 'customerData'
            }
          },
          {
            $match: {
              'customerData.email': customerEmail
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user',
              foreignField: '_id',
              as: 'userData'
            }
          },
          {
            $sort: { createdAt: -1 }
          },
          {
            $skip: pageSize * (page - 1)
          },
          {
            $limit: pageSize
          }
        ]),
        8000
      );

      // Format results to match expected structure
      orders = aggregationResult.map(order => ({
        ...order,
        customer: order.customerData && order.customerData.length > 0 ? order.customerData[0] : null,
        user: order.userData && order.userData.length > 0 ? order.userData[0] : null
      }));

    } else {
      orders = [];
    }
  }

  // Apply translations to orderItems if lang is not default language
  const defaultLang_order = getDefaultLanguage().code;
  if (lang !== defaultLang_order) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    // Collect all product IDs from all orders
    const productIds = new Set();
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          if (item.product) {
            productIds.add(item.product.toString());
          }
        });
      }
    });

    // Fetch translations if there are product IDs
    let translationMap = {};
    if (productIds.size > 0) {
      const translations = await ProductCatalogTranslationCache.find({
        entityId: { $in: Array.from(productIds) },
        targetLang: lang
      }).lean();

      translations.forEach(t => {
        translationMap[t.entityId] = t;
      });
    }

    // Apply translations to orders
    orders = orders.map(order => ({
      ...order.toObject ? order.toObject() : order,
      orderItems: (order.orderItems || []).map(item => {
        const translation = translationMap[item.product?.toString()];
        return {
          ...(item.toObject ? item.toObject() : item),
          name: (translation && translation.name) ? translation.name : item.name
        };
      })
    }));
  }

  res.json({
    orders,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

/**
 * Lấy tất cả đơn hàng (Admin only, có phân trang)
 * @route GET /api/orders
 * @access Private/Admin
 */
const getOrders = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();

  const count = await withTimeout(Order.countDocuments({ isDeleted: false }), 8000);
  let orders = await withTimeout(
    Order.find({ isDeleted: false })
      .populate({
        path: 'user',
        select: 'username email name',
        model: 'User'
      })
      .populate({
        path: 'customer',
        select: 'name email phone',
        model: 'Customer'
      })
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    8000
  );

  // Apply translations to orderItems if lang is not default language
  const defaultLang_order = getDefaultLanguage().code;
  if (lang !== defaultLang_order) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    // Collect all product IDs from all orders
    const productIds = new Set();
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          if (item.product) {
            productIds.add(item.product.toString());
          }
        });
      }
    });

    // Fetch translations if there are product IDs
    let translationMap = {};
    if (productIds.size > 0) {
      const translations = await ProductCatalogTranslationCache.find({
        entityId: { $in: Array.from(productIds) },
        targetLang: lang
      }).lean();

      translations.forEach(t => {
        translationMap[t.entityId] = t;
      });
    }

    // Apply translations to orders
    orders = orders.map(order => ({
      ...order.toObject ? order.toObject() : order,
      orderItems: (order.orderItems || []).map(item => {
        const translation = translationMap[item.product?.toString()];
        return {
          ...(item.toObject ? item.toObject() : item),
          name: (translation && translation.name) ? translation.name : item.name
        };
      })
    }));
  }

  res.json({
    orders,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

/**
 * Xóa mềm đơn hàng (Admin only)
 * @route DELETE /api/orders/:id
 * @access Private/Admin
 */
const deleteOrder = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const order = await withTimeout(Order.findOne({ _id: req.params.id, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage(lang, 'order.alreadyDeleted'));
  }

  order.isDeleted = true;
  await order.save();

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastOrderDeleted(io, order._id.toString());
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
  }

  res.json({ message: 'Order deleted' });
});

/**
 * Khôi phục đơn hàng đã xóa mềm (Admin only)
 * @route PUT /api/orders/:id/restore
 * @access Private/Admin
 */
const restoreOrder = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage(lang, 'order.notFound'));
  }

  if (!order.isDeleted) {
    res.status(400);
    throw new Error(getMessage(lang, 'order.notDeleted'));
  }

  order.isDeleted = false;
  const restoredOrder = await order.save();

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      const populatedOrder = await withTimeout(
        Order.findById(restoredOrder._id)
          .populate('customer', 'name email phone')
          .populate('user', 'username email name'),
        8000
      );

      broadcastOrderRestored(io, {
        _id: populatedOrder._id,
        orderItems: populatedOrder.orderItems,
        customer: populatedOrder.customer,
        user: populatedOrder.user,
        totalPrice: populatedOrder.totalPrice,
        isPaid: populatedOrder.isPaid,
        isDelivered: populatedOrder.isDelivered,
        createdAt: populatedOrder.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
  }

  res.json(restoredOrder);
});

/**
 * Lấy danh sách đơn hàng đã xóa mềm (Admin only)
 * @route GET /api/orders/deleted/list
 * @access Private/Admin
 */
const getDeletedOrders = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();

  const count = await withTimeout(Order.countDocuments({ isDeleted: true }), 8000);
  let orders = await withTimeout(
    Order.find({ isDeleted: true })
      .populate({
        path: 'user',
        select: 'username email name',
        model: 'User'
      })
      .populate({
        path: 'customer',
        select: 'name email phone',
        model: 'Customer'
      })
      .sort({ deletedAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1)),
    8000
  );

  // Apply translations to orderItems if lang is not default language
  const defaultLang_order = getDefaultLanguage().code;
  if (lang !== defaultLang_order) {
    const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');

    const productIds = new Set();
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          if (item.product) {
            productIds.add(item.product.toString());
          }
        });
      }
    });

    let translationMap = {};
    if (productIds.size > 0) {
      const translations = await ProductCatalogTranslationCache.find({
        entityId: { $in: Array.from(productIds) },
        targetLang: lang
      }).lean();

      translations.forEach(t => {
        translationMap[t.entityId] = t;
      });
    }

    orders = orders.map(order => ({
      ...order.toObject ? order.toObject() : order,
      orderItems: (order.orderItems || []).map(item => {
        const translation = translationMap[item.product?.toString()];
        return {
          ...(item.toObject ? item.toObject() : item),
          name: (translation && translation.name) ? translation.name : item.name
        };
      })
    }));
  }

  res.json({
    orders,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

/**
 * Cập nhật đơn hàng thành đã giao
 * @route PUT /api/orders/:id/deliver
 * @access Private/Admin
 */
const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const orderId = req.params.id;

  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const order = await withTimeout(Order.findOne({ _id: orderId, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage(lang, 'order.notFound'));
  }

  order.isDelivered = true;
  order.deliveredAt = Date.now();

  const updatedOrder = await withTimeout(order.save(), 8000);

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard & khách hàng cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      // Populate customer data để broadcast
      const populatedOrder = await withTimeout(
        Order.findById(updatedOrder._id)
          .populate('customer', 'name email phone')
          .populate('user', 'username email name'),
        8000
      );

      broadcastOrderStatusUpdate(io, {
        _id: populatedOrder._id,
        customer: populatedOrder.customer,
        user: populatedOrder.user,
        isPaid: populatedOrder.isPaid,
        isDelivered: populatedOrder.isDelivered,
        deliveredAt: populatedOrder.deliveredAt,
        totalPrice: populatedOrder.totalPrice,
        createdAt: populatedOrder.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
  }

  res.json(updatedOrder);
});

/**
 * Xóa cứng đơn hàng (Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/orders/:id/hard
 * @access Private/Admin
 */
const hardDeleteOrder = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = req.query.lang || defaultLang.code; // Rule #2: Get language from query param
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage(lang, 'order.notFound'));
  }

  await withTimeout(Order.findByIdAndDelete(req.params.id), 8000);

  res.json({ message: 'Order permanently deleted' });
});

module.exports = {
  addOrderItems,
  getOrderById,
  updateOrderToDelivered,
  getMyOrders,
  getOrders,
  deleteOrder,
  restoreOrder,
  getDeletedOrders,
  hardDeleteOrder,
  updateOrderStatus,
};
