/**
 * Controller quản lý đơn hàng
 * Xử lý: tạo đơn hàng, cập nhật trạng thái (paid/delivered), soft/hard delete
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
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
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

        if (shippingAddress && shippingAddress.address) customer.address = shippingAddress.address;
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
          address: shippingAddress?.address || ''
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
        if (shippingAddress && shippingAddress.address) customer.address = shippingAddress.address;
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
          address: shippingAddress?.address || ''
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
        address: shippingAddress?.address || ''
      });
      await customer.save();
      customerId = customer._id;
    }
  }

  const order = new Order({
    orderItems,
    user: req.user._id,
    customer: customerId,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  });

  const createdOrder = await order.save();

  // Return populated order with customer data
  const populatedOrder = await withTimeout(
    Order.findById(createdOrder._id).populate('customer', 'name email phone address'),
    8000
  );

  res.status(201).json({
    order: populatedOrder,
    customer: customerId ? { _id: customerId } : null
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
      .populate('customer', 'name email phone address'),
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
 * Cập nhật đơn hàng thành đã thanh toán
 * Tự động giảm stock khi payment xác nhận
 * @route PUT /api/orders/:id/pay
 * @access Private
 */
const updateOrderToPaid = asyncHandler(async (req, res) => {
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (order) {
    for (const item of order.orderItems) {
      const product = await withTimeout(Product.findById(item.product), 8000);
      if (product) {
        product.countInStock -= item.qty;
        if (product.countInStock < 0) {
          product.countInStock = 0;
        }
        await product.save();
      }
    }

    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id,
      status: req.body.status,
      update_time: req.body.update_time,
      email_address: req.body.email_address,
    };

    const updatedOrder = await order.save();

    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Order not found');
  }
});

/**
 * Cập nhật đơn hàng thành đã giao (Admin only)
 * @route PUT /api/orders/:id/deliver
 * @access Private/Admin
 */
const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await withTimeout(Order.findById(req.params.id), 8000);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();

    const updatedOrder = await order.save();

    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Order not found');
  }
});

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại (có phân trang)
 * @route GET /api/orders/myorders
 * @access Private
 */
const getMyOrders = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.pageNumber) || 1;

  const count = await withTimeout(Order.countDocuments({ user: req.user._id, isDeleted: false }), 8000);
  const orders = await withTimeout(
    Order.find({ user: req.user._id, isDeleted: false })
      .populate('user', 'username email')
      .populate('customer', 'name email phone address')
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
        select: 'name email phone address',
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
        select: 'name email phone address',
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
  updateOrderToPaid,
  updateOrderToDelivered,
  getMyOrders,
  getOrders,
  deleteOrder,
  restoreOrder,
  getDeletedOrders,
  hardDeleteOrder,
};
