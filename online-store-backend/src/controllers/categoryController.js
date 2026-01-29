/**
 * Controller quản lý danh mục sản phẩm
 * Xử lý: CRUD danh mục, phân trang, tìm kiếm, soft/hard delete
 * Kiểm tra trùng lặp tên danh mục
 */
const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const { withTimeout } = require('../utils/mongooseUtils');

/**
 * Lấy danh sách danh mục sản phẩm với phân trang và tìm kiếm
 * @route GET /api/categories
 * @access Public
 */
const getCategories = asyncHandler(async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 10;
    const page = parseInt(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
      ? {
          name: { $regex: req.query.keyword, $options: 'i' },
        }
      : {};

    const count = await withTimeout(
      Category.countDocuments({ ...keyword, isDeleted: false }),
      8000
    );
    const categories = await withTimeout(
      Category.find({ ...keyword, isDeleted: false })
        .limit(pageSize)
        .skip(pageSize * (page - 1)),
      8000
    );

    res.json({ categories, page, pages: Math.ceil(count / pageSize) });
  } catch (error) {
    throw error;
  }
});

/**
 * Lấy chi tiết danh mục theo ID
 * @route GET /api/categories/:id
 * @access Public
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ _id: req.params.id, isDeleted: false });

  if (category) {
    res.json(category);
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

/**
 * Tạo danh mục sản phẩm mới (Admin only)
 * @route POST /api/categories
 * @access Private/Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const categoryExists = await Category.findOne({ name });

  if (categoryExists) {
    res.status(400);
    throw new Error('Category already exists');
  }

  const category = new Category({
    name,
    description,
  });

  const createdCategory = await category.save();
  res.status(201).json(createdCategory);
});

/**
 * Cập nhật thông tin danh mục (Admin only)
 * @route PUT /api/categories/:id
 * @access Private/Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const category = await Category.findById(req.params.id);

  if (category) {
    category.name = name || category.name;
    category.description = description || category.description;

    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

/**
 * Xóa mềm danh mục (Admin only)
 * @route DELETE /api/categories/:id
 * @access Private/Admin
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (category) {
    category.isDeleted = true;
    await category.save();
    res.json({ message: 'Category removed' });
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

/**
 * Xóa cứng danh mục (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/categories/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  await category.deleteOne();
  res.json({ message: 'Category permanently removed' });
});

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  hardDeleteCategory,
};
