/**
 * Controller quản lý khách hàng
 * Xử lý: CRUD khách hàng, phân trang, tìm kiếm, soft/hard delete
 * Quản lý liên hệ (email, phone), địa chỉ giao hàng
 */
const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');

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
  res.status(201).json(createdCustomer);
});

/**
 * Cập nhật thông tin khách hàng (Admin only)
 * @route PUT /api/customers/:id
 * @access Private/Admin
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address } = req.body;

  const customer = await Customer.findById(req.params.id);

  if (customer) {
    // Kiểm tra email duplicate khi update (nếu email thay đổi)
    if (email && email.toLowerCase() !== customer.email.toLowerCase()) {
      const emailExists = await Customer.findOne({
        email: email.toLowerCase(),
        _id: { $ne: customer._id },
        isDeleted: false
      });

      if (emailExists) {
        res.status(409);
        throw new Error('Email already in use');
      }
    }

    customer.name = name || customer.name;
    customer.email = email || customer.email;
    customer.phone = phone || customer.phone;
    customer.address = address || customer.address;

    const updatedCustomer = await customer.save();
    res.json(updatedCustomer);
  } else {
    res.status(404);
    throw new Error('Customer not found');
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
 * Xóa cứng khách hàng (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/customers/:id/hard
 * @access Private/SuperAdmin
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
 * @route POST /api/customers/phone/:phone
 * @access Public
 */
const createOrUpdateCustomerByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { name, email, address } = req.body;

  let customer = await Customer.findOne({ phone, isDeleted: false });

  if (customer) {
    // Nếu cập nhật email và email mới khác email cũ, kiểm tra email duplicate
    if (email && email.toLowerCase() !== customer.email.toLowerCase()) {
      const emailExists = await Customer.findOne({
        email: email.toLowerCase(),
        _id: { $ne: customer._id },
        isDeleted: false
      });

      if (emailExists) {
        res.status(409);
        throw new Error('Email already in use');
      }
    }

    customer.name = name || customer.name;
    customer.email = email || customer.email;
    customer.address = address || customer.address;

    const updatedCustomer = await customer.save();
    res.json({
      message: 'Customer updated',
      customer: updatedCustomer
    });
  } else {
    if (!name || !email) {
      res.status(400);
      throw new Error('Name and email are required for new customer');
    }

    // Kiểm tra email đã tồn tại trước khi tạo mới
    const emailExists = await Customer.findOne({
      email: email.toLowerCase(),
      isDeleted: false
    });

    if (emailExists) {
      res.status(409);
      throw new Error('Email already in use');
    }

    const newCustomer = new Customer({
      name,
      email,
      phone,
      address: address || ''
    });

    const createdCustomer = await newCustomer.save();
    res.status(201).json({
      message: 'Customer created',
      customer: createdCustomer
    });
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
