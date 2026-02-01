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

/**
 * Tạo đơn hàng mới
 * Kiểm tra stock, tự động upsert khách hàng theo phone number
 * @route POST /api/orders
 * @access Private
 */
const addOrderItems = asyncHandler(async (req, res) => {
  const {
    orderItems,
    itemsPrice,
    taxPrice,
    totalPrice,
    customerPhone,
    customerName,
    customerEmail,
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400);
    throw new Error('No order items');
  }

  for (const item of orderItems) {
    const product = await withTimeout(Product.findById(item.product), 8000);
    if (!product) {
      res.status(404);
      throw new Error(`Product ${item.product} not found`);
    }
    if (product.countInStock < item.qty) {
      res.status(400);
      throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.countInStock}, Requested: ${item.qty}`);
    }
  }

  let customerId = null;

  // Always try to create or find customer data
  if (customerPhone || customerName || customerEmail) {
    // First try to find by phone if available
    if (customerPhone) {
      let customer = await withTimeout(Customer.findOne({ phone: customerPhone, isDeleted: false }), 8000);

      if (customer) {
        // Update existing customer with new info
        if (customerName) customer.name = customerName;

        // If email is changing, verify it doesn't conflict with another customer
        if (customerEmail && customerEmail.toLowerCase().trim() !== customer.email) {
          const normalizedNewEmail = customerEmail.toLowerCase().trim();
          const existingEmailCustomer = await withTimeout(
            Customer.findOne({
              email: normalizedNewEmail,
              _id: { $ne: customer._id },
              isDeleted: false
            }),
            8000
          );
          // Only throw error if another active customer has this email
          // Allow updating to a new email if no one else has it
          if (existingEmailCustomer) {
            res.status(409);
            throw new Error('Email already in use by another customer');
          }
          customer.email = normalizedNewEmail; // Use normalized (lowercase, trimmed) email
        } else if (!customer.email && customerEmail) {
          // Set email if customer doesn't have one yet
          customer.email = customerEmail.toLowerCase().trim();
        }

        try {
          await customer.save();
        } catch (saveError) {
          // Handle Mongoose unique constraint errors
          if (saveError.code === 11000) {
            const field = Object.keys(saveError.keyPattern)[0];
            if (field === 'email') {
              res.status(409);
              throw new Error('Email already in use by another customer');
            }
          }
          throw saveError;
        }
      } else {
        // Create new customer - require name and email
        if (!customerName || !customerEmail) {
          res.status(400);
          throw new Error('Customer name and email are required for new customer');
        }

        // Check if email already exists
        const existingEmailCustomer = await withTimeout(
          Customer.findOne({ email: customerEmail.toLowerCase().trim(), isDeleted: false }),
          8000
        );
        if (existingEmailCustomer) {
          res.status(409);
          throw new Error('Email already in use');
        }

        customer = new Customer({
          name: customerName,
          email: customerEmail.toLowerCase().trim(),
          phone: customerPhone,
        });
        try {
          await customer.save();
        } catch (saveError) {
          // Handle Mongoose unique constraint errors
          if (saveError.code === 11000) {
            const field = Object.keys(saveError.keyPattern)[0];
            if (field === 'email') {
              res.status(409);
              throw new Error('Email already in use by another customer');
            }
          }
          throw saveError;
        }
      }
      customerId = customer._id;
    } else if (customerEmail) {
      // Try to find by email if no phone provided
      let customer = await withTimeout(Customer.findOne({ email: customerEmail, isDeleted: false }), 8000);

      if (customer) {
        if (customerName) customer.name = customerName;
        try {
          await customer.save();
        } catch (saveError) {
          // Handle Mongoose unique constraint errors
          if (saveError.code === 11000) {
            const field = Object.keys(saveError.keyPattern)[0];
            if (field === 'email') {
              res.status(409);
              throw new Error('Email already in use by another customer');
            }
          }
          throw saveError;
        }
      } else {
        // Create new customer - need name and phone or generate them
        // Check if email already exists
        const existingEmailCustomer = await withTimeout(
          Customer.findOne({ email: customerEmail.toLowerCase().trim(), isDeleted: false }),
          8000
        );
        if (existingEmailCustomer) {
          res.status(409);
          throw new Error('Email already in use');
        }

        const generatedPhone = `090${String(Math.random() * 10000000).padStart(7, '0')}`;
        customer = new Customer({
          name: customerName || 'Customer',
          email: customerEmail,
          phone: generatedPhone,
        });
        await customer.save();
      }
      customerId = customer._id;
    } else if (customerName) {
      // Only name provided - need to generate phone and email
      const generatedPhone = `090${String(Math.random() * 10000000).padStart(7, '0')}`;
      const generatedEmail = `customer-${Date.now()}@generated.local`;
      const customer = new Customer({
        name: customerName,
        email: generatedEmail,
        phone: generatedPhone,
      });
      await customer.save();
      customerId = customer._id;
    }
  }

  const order = new Order({
    orderItems,
    user: req.user._id,
    customer: customerId,
    itemsPrice: itemsPrice || 0,
    taxPrice: taxPrice || 0,
    totalPrice: totalPrice || 0,
    isPaid: false, // Mặc định chưa thanh toán
    isDelivered: false, // Mặc định chưa giao
    paymentMethod: 'cod', // Mặc định COD
  });

  const createdOrder = await order.save();

  // Return populated order with customer data
  const populatedOrder = await withTimeout(
    Order.findById(createdOrder._id).populate('customer', 'name email phone'),
    8000
  );

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
    res.json(order);
  } else {
    res.status(404);
    throw new Error('Order not found');
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
    console.log(`[Fallback] No user-linked orders found for user ${req.user._id} (${req.user.email}), matching by customer email...`);

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

      console.log(`[Fallback] Found ${count} orders matching customer email ${customerEmail}, returning page ${page}`);
    } else {
      console.log(`[Fallback] No orders found with email matching for user ${req.user._id}`);
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
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.isDeleted = true;
  await order.save();

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
    throw new Error('Order not found');
  }

  if (!order.isDeleted) {
    res.status(400);
    throw new Error('Order is not deleted');
  }

  order.isDeleted = false;
  const restoredOrder = await order.save();

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
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.isDelivered = true;
  order.deliveredAt = Date.now();

  const updatedOrder = await withTimeout(order.save(), 8000);
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
    throw new Error('Order not found');
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
};
