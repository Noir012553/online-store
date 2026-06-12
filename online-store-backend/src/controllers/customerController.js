/**
 * Controller quản lý khách hàng
 * Xử lý: CRUD khách hàng, phân trang, tìm kiếm, soft/hard delete
 * Quản lý liên hệ (email, phone), địa chỉ giao hàng
 */
const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const { broadcastNewCustomer, broadcastCustomerUpdated, broadcastCustomerDeleted, broadcastCustomerRestored } = require('../socket/socketHandler');

/**
 * Lấy danh sách khách hàng với phân trang và tìm kiếm (Admin only)
 * @route GET /api/customers
 * @access Private/Admin
 */
const getCustomers = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        name: { $regex: req.query.keyword, $options: 'i' },
      }
    : {};

  const count = await Customer.countDocuments({ ...keyword, isDeleted: false });
  const customers = await Customer.find({ ...keyword, isDeleted: false })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ customers, page, pages: Math.ceil(count / pageSize) });
});

/**
 * Lấy chi tiết khách hàng theo ID (Admin only)
 * @route GET /api/customers/:id
 * @access Private/Admin
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });

  if (customer && !customer.isDeleted) {
    res.json(customer);
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

/**
 * Tạo khách hàng mới (Admin only)
 * @route POST /api/customers
 * @access Private/Admin
 */
const createCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address } = req.body;

  const customerExists = await Customer.findOne({ email });

  if (customerExists) {
    res.status(400);
    throw new Error('Customer already exists');
  }

  const customer = new Customer({
    name,
    email,
    phone,
    address,
  });

  const createdCustomer = await customer.save();

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastNewCustomer(io, {
        _id: createdCustomer._id,
        name: createdCustomer.name,
        email: createdCustomer.email,
        phone: createdCustomer.phone,
        address: createdCustomer.address,
        createdAt: createdCustomer.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
    console.warn('[WARNING] Failed to broadcast new customer:', err.message);
  }

  res.status(201).json(createdCustomer);
});

/**
 * Cập nhật thông tin khách hàng (Admin only)
 * FIX: Handle 11000 error properly instead of race condition check
 * @route PUT /api/customers/:id
 * @access Private/Admin
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address } = req.body;

  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Build update object
  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email.toLowerCase().trim();
  if (phone) updateData.phone = phone;
  if (address) updateData.address = address;

  try {
    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    // ==================== REAL-TIME BROADCAST ====================
    // Emit socket event để admin dashboard cập nhật tự động
    try {
      const io = req.app.get('io');
      if (io) {
        broadcastCustomerUpdated(io, {
          _id: updatedCustomer._id,
          name: updatedCustomer.name,
          email: updatedCustomer.email,
          phone: updatedCustomer.phone,
          address: updatedCustomer.address,
          updatedAt: updatedCustomer.updatedAt,
        });
      }
    } catch (err) {
      // Socket broadcast error không nên làm request fail
      console.warn('[WARNING] Failed to broadcast customer update:', err.message);
    }

    res.json(updatedCustomer);
  } catch (err) {
    // Handle duplicate email/phone error from unique index
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      res.status(409);
      throw new Error(`${field.charAt(0).toUpperCase() + field.slice(1)} already in use`);
    }
    throw err;
  }
});

/**
 * Xóa mềm khách hàng (Admin only)
 * @route DELETE /api/customers/:id
 * @access Private/Admin
 */
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (customer) {
    customer.isDeleted = true;
    await customer.save();

    // ==================== REAL-TIME BROADCAST ====================
    // Emit socket event để admin dashboard cập nhật tự động
    try {
      const io = req.app.get('io');
      if (io) {
        broadcastCustomerDeleted(io, customer._id.toString());
      }
    } catch (err) {
      // Socket broadcast error không nên làm request fail
      console.warn('[WARNING] Failed to broadcast customer delete:', err.message);
    }

    res.json({ message: 'Customer removed' });
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

/**
 * Khôi phục khách hàng đã xóa mềm (Admin only)
 * @route PUT /api/customers/:id/restore
 * @access Private/Admin
 */
const restoreCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  if (!customer.isDeleted) {
    res.status(400);
    throw new Error('Customer is not deleted');
  }

  customer.isDeleted = false;
  const restoredCustomer = await customer.save();

  // ==================== REAL-TIME BROADCAST ====================
  // Emit socket event để admin dashboard cập nhật tự động
  try {
    const io = req.app.get('io');
    if (io) {
      broadcastCustomerRestored(io, {
        _id: restoredCustomer._id,
        name: restoredCustomer.name,
        email: restoredCustomer.email,
        phone: restoredCustomer.phone,
        address: restoredCustomer.address,
        createdAt: restoredCustomer.createdAt,
      });
    }
  } catch (err) {
    // Socket broadcast error không nên làm request fail
    console.warn('[WARNING] Failed to broadcast customer restore:', err.message);
  }

  res.json(restoredCustomer);
});

/**
 * Lấy danh sách khách hàng đã xóa mềm (Admin only)
 * @route GET /api/customers/deleted/list
 * @access Private/Admin
 */
const getDeletedCustomers = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;

  const count = await Customer.countDocuments({ isDeleted: true });
  const customers = await Customer.find({ isDeleted: true })
    .sort({ updatedAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ customers, page, pages: Math.ceil(count / pageSize) });
});

/**
 * Xóa cứng khách hàng (Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/customers/:id/hard
 * @access Private/Admin
 */
const hardDeleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  await customer.deleteOne();
  res.json({ message: 'Customer permanently removed' });
});

/**
 * Lấy khách hàng theo số điện thoại (Public)
 * Sử dụng trong tính năng upsert khách hàng tại checkout
 * @route GET /api/customers/phone/:phone
 * @access Public
 */
const getCustomerByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.params;

  const customer = await Customer.findOne({ phone, isDeleted: false });

  if (customer) {
    res.json(customer);
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

/**
 * Tạo hoặc cập nhật khách hàng theo số điện thoại (Public)
 * Nếu khách hàng tồn tại → cập nhật, nếu không → tạo mới
 * FIX: Dùng findOneAndUpdate để tránh race condition (11000 duplicate key error)
 * @route POST /api/customers/phone/:phone
 * @access Public
 */
const createOrUpdateCustomerByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { name, email, address } = req.body;

  // Normalize email
  const normalizedEmail = email ? email.toLowerCase().trim() : null;

  // Check if trying to update to an email that's already in use by another customer
  if (normalizedEmail) {
    const existingCustomer = await Customer.findOne({
      email: normalizedEmail,
      phone: { $ne: phone },
      isDeleted: false
    });

    if (existingCustomer) {
      res.status(409);
      throw new Error('Email already in use by another customer');
    }
  }

  try {
    // Use findOneAndUpdate to avoid race condition
    // If customer with phone exists, update; otherwise create new
    const updatedCustomer = await Customer.findOneAndUpdate(
      { phone, isDeleted: false },
      {
        $set: {
          ...(name && { name }),
          ...(normalizedEmail && { email: normalizedEmail }),
          ...(address && { address }),
          updatedAt: new Date()
        }
      },
      {
        returnDocument: 'after', // Return updated document
        upsert: true, // Create if doesn't exist
        runValidators: true // Run schema validators
      }
    );

    res.json({
      message: updatedCustomer.createdAt === updatedCustomer.updatedAt ? 'Customer created' : 'Customer updated',
      customer: updatedCustomer
    });
  } catch (err) {
    // Handle duplicate email error (if somehow 2 requests race past the check above)
    if (err.code === 11000 && err.keyPattern.email) {
      res.status(409);
      throw new Error('Email already in use');
    }
    throw err;
  }
});

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  getDeletedCustomers,
  hardDeleteCustomer,
  getCustomerByPhone,
  createOrUpdateCustomerByPhone,
};