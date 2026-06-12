/**
 * Controller quản lý đơn hàng
 * Xử lý: tạo đơn hàng, cập nhật trạng thái, soft/hard delete
 * Hỗ trợ phân trang, tìm kiếm, quản lý khách hàng tự động
 */
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { withTimeout } = require('../utils/mongooseUtils');
const { broadcastNewOrder, broadcastOrderStatusUpdate, broadcastOrderDeleted, broadcastOrderRestored } = require('../socket/socketHandler');
const { getMessage } = require('../i18n/messages');

/**
 * Cập nhật trạng thái đơn hàng (isPaid, isDelivered)
 * @route PUT /api/orders/:id/status
 * @access Private/Admin
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { isPaid, isDelivered } = req.body;

  const order = await withTimeout(Order.findOne({ _id: orderId, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage('VI', 'order.notFound'));
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
    shippingFee = 0,
  } = req.body;

  if (!cartItems || cartItems.length === 0) {
    res.status(400);
    throw new Error(getMessage('VI', 'order.noCartItems'));
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
      throw new Error(getMessage('VI', 'validation.product.idRequired'));
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
  let calculatedItemsPrice = 0;
  for (const item of cartItems) {
    const productId = String(item.productId || item.product);
    const product = productLookup.get(productId);

    if (!product) {
      res.status(404);
      throw new Error(getMessage('VI', 'product.notFound'));
    }

    // Stock check
    if (product.countInStock < item.quantity) {
      res.status(400);
      throw new Error(getMessage('VI', 'product.insufficientStock'));
    }

    productMap.set(productId, {
      product,
      quantity: item.quantity,
    });

    calculatedItemsPrice += product.price * item.quantity;
  }

  // ==================== COUPON VALIDATION & DISCOUNT ====================
  let appliedCoupon = null;
  let discountAmount = 0;

  if (couponCode) {
    const Coupon = require('../models/Coupon');
    const coupon = await withTimeout(
      Coupon.findOne({
        code: couponCode.toUpperCase(),
        isDeleted: false,
        isActive: true,
      }),
      8000
    );

    if (!coupon) {
      res.status(404);
      throw new Error(getMessage('VI', 'order.invalidPromoCode'));
    }

    const now = new Date();
    if (coupon.startDate > now || coupon.endDate < now) {
      res.status(400);
      throw new Error(getMessage('VI', 'order.couponExpired'));
    }

    if (coupon.currentUses >= coupon.maxUses) {
      res.status(400);
      throw new Error(getMessage('VI', 'order.couponLimitExceeded'));
    }

    if (calculatedItemsPrice < coupon.minOrderAmount) {
      res.status(400);
      throw new Error(getMessage('VI', 'order.couponMinAmount'));
    }

    // Calculate discount
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((calculatedItemsPrice * coupon.discountValue) / 100);
    } else if (coupon.discountType === 'fixed') {
      discountAmount = coupon.discountValue;
    }

    appliedCoupon = {
      code: coupon.code,
      couponId: coupon._id,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
    };
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
          throw new Error(getMessage('VI', 'product.customerNameRequired'));
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
        throw new Error(getMessage('VI', 'product.fieldInUse'));
      }
      throw err;
    }
  }

  // ==================== FINAL TOTAL CALCULATION ====================
  const taxPrice = 0; // Vietnam: thuế đã bao gồm trong giá
  const totalPrice = Math.max(0, calculatedItemsPrice + taxPrice + Number(shippingFee) - discountAmount);

  // Map cartItems to orderItems with actual product data from DB
  const orderItems = Array.from(productMap.entries()).map(([productId, { product, quantity }]) => ({
    product: product._id,
    name: typeof product.name === 'object' ? product.name.vi || product.name.en || product.name : product.name,
    qty: quantity,
    price: product.price, // Use DB price, not client price
    image: product.image || product.images?.[0] || '',
  }));

  const order = new Order({
    orderItems,
    user: req.user._id,
    customer: customerId,
    itemsPrice: calculatedItemsPrice, // Server-calculated
    taxPrice, // Server-calculated
    totalPrice, // Server-calculated
    shippingFee: Number(shippingFee) || 0,
    appliedCoupon, // Store coupon used for audit trail
    shippingAddress, // ← Save shipping address for shipment creation
    shippingProvider, // ← Save shipping provider preference
    shippingService, // ← Save shipping service preference
    isPaid: false, // Mặc định chưa thanh toán
    isDelivered: false, // Mặc định chưa giao
    paymentMethod: paymentMethod || 'cod', // ← Use provided payment method, default to COD
    idempotencyKey, // ← Store idempotency key for duplicate prevention
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
  const order = await withTimeout(
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
      throw new Error(getMessage('VI', 'order.notAuthorized'));
    }

    res.json(order);
  } else {
    res.status(404);
    throw new Error(getMessage('VI', 'order.notFound'));
  }
});

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại (có phân trang)
 * @route GET /api/orders/myorders
 * @access Private
 *
 * Fallback: Nếu user không có orders (ví dụ orders cũ không có field user),
 * sẽ match orders theo customer email của user
 */
const getMyOrders = asyncHandler(async (req, res) => {
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

  const count = await withTimeout(Order.countDocuments({ isDeleted: false }), 8000);
  const orders = await withTimeout(
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
  const order = await withTimeout(Order.findOne({ _id: req.params.id, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage('VI', 'order.alreadyDeleted'));
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
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage('VI', 'order.notFound'));
  }

  if (!order.isDeleted) {
    res.status(400);
    throw new Error(getMessage('VI', 'order.notDeleted'));
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

  const count = await withTimeout(Order.countDocuments({ isDeleted: true }), 8000);
  const orders = await withTimeout(
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

  const order = await withTimeout(Order.findOne({ _id: orderId, isDeleted: false }), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage('VI', 'order.notFound'));
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
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error(getMessage('VI', 'order.notFound'));
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
