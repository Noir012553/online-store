/**
 * Controller quản lý nhà cung cấp
 * Xử lý: CRUD nhà cung cấp, phân trang, tìm kiếm, soft/hard delete
 * Quản lý liên hệ nhà cung cấp
 */
const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');

/**
 * Lấy danh sách nhà cung cấp công khai (Public)
 * @route GET /api/suppliers/public/list
 * @access Public
 */
const getPublicSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({ isDeleted: false })
    .select('name')
    .sort({ name: 1 });

  res.json(suppliers);
});

/**
 * Lấy danh sách nhà cung cấp với phân trang và tìm kiếm (Admin only)
 * @route GET /api/suppliers
 * @access Private/Admin
 */
const getSuppliers = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        name: { $regex: req.query.keyword, $options: 'i' },
      }
    : {};

  const count = await Supplier.countDocuments({ ...keyword, isDeleted: false });
  const suppliers = await Supplier.find({ ...keyword, isDeleted: false })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ suppliers, page, pages: Math.ceil(count / pageSize) });
});

/**
 * Lấy chi tiết nhà cung cấp theo ID (Admin only)
 * @route GET /api/suppliers/:id
 * @access Private/Admin
 */
const getSupplierById = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, isDeleted: false });

  if (supplier) {
    res.json(supplier);
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

/**
 * Tạo nhà cung cấp mới (Admin only)
 * @route POST /api/suppliers
 * @access Private/Admin
 */
const createSupplier = asyncHandler(async (req, res) => {
  const { name, phone, email, description } = req.body;

  const supplierExists = await Supplier.findOne({ email });

  if (supplierExists) {
    res.status(400);
    throw new Error('Supplier already exists');
  }

  const supplier = new Supplier({
    name,
    phone,
    email,
    description,
  });

  const createdSupplier = await supplier.save();
  res.status(201).json(createdSupplier);
});

/**
 * Cập nhật thông tin nhà cung cấp (Admin only)
 * @route PUT /api/suppliers/:id
 * @access Private/Admin
 */
const updateSupplier = asyncHandler(async (req, res) => {
  const { name, phone, email, description } = req.body;

  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    supplier.name = name || supplier.name;
    supplier.phone = phone || supplier.phone;
    supplier.email = email || supplier.email;
    supplier.description = description || supplier.description;

    const updatedSupplier = await supplier.save();
    res.json(updatedSupplier);
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

/**
 * Xóa mềm nhà cung cấp (Admin only)
 * @route DELETE /api/suppliers/:id
 * @access Private/Admin
 */
const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    supplier.isDeleted = true;
    await supplier.save();
    res.json({ message: 'Supplier removed' });
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

/**
 * Xóa cứng nhà cung cấp (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/suppliers/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  await supplier.deleteOne();
  res.json({ message: 'Supplier permanently removed' });
});

module.exports = {
  getPublicSuppliers,
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  hardDeleteSupplier,
};
