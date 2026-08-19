/**
 * Controller quản lý danh mục sản phẩm
 * Xử lý: CRUD danh mục, phân trang, tìm kiếm, soft/hard delete
 * Kiểm tra trùng lặp tên danh mục
 */
const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { withTimeout } = require('../utils/mongooseUtils');
const { getMessage } = require('../i18n/messages');
const { localizeCategory, localizeCategories } = require('../services/categoryLocalizationService');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSourceNames = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map(name => String(name).trim()).filter(Boolean))]
    : []
);

/**
 * Lấy danh sách danh mục sản phẩm với phân trang và tìm kiếm
 * @route GET /api/categories
 * @access Public
 */
const getCategories = asyncHandler(async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize) || 10, 500);
    const page = Math.max(parseInt(req.query.pageNumber) || 1, 1);
    const searchTerm = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const query = { isDeleted: false };

    if (req.query.withProducts === 'true') {
      const [usedCategoryIds, activeCategories] = await Promise.all([
        withTimeout(
          Product.distinct('category', { isDeleted: false, category: { $ne: null } }),
          8000
        ),
        withTimeout(Category.find({ isDeleted: false }).lean(), 8000),
      ]);
      const categoriesById = new Map(activeCategories.map(category => [category._id.toString(), category]));
      const canonicalBySourceName = new Map();

      activeCategories.forEach((category) => {
        canonicalBySourceName.set(String(category.name).trim().toLowerCase(), category);
      });
      activeCategories.forEach((category) => {
        (category.sourceNames || []).forEach((sourceName) => {
          canonicalBySourceName.set(String(sourceName).trim().toLowerCase(), category);
        });
      });

      const canonicalCategoryIds = [...new Set(
        usedCategoryIds
          .map(categoryId => categoriesById.get(categoryId.toString()))
          .map(category => category && canonicalBySourceName.get(String(category.name).trim().toLowerCase()))
          .filter(Boolean)
          .map(category => category._id.toString())
      )];
      query._id = { $in: canonicalCategoryIds };
    }

    if (searchTerm) {
      const nameRegex = { $regex: escapeRegex(searchTerm), $options: 'i' };
      const translations = req.lang
        ? await withTimeout(
          CategoryCatalogTranslationCache.find({
            name: nameRegex,
            targetLang: req.lang,
            status: 'success',
          }).lean(),
          8000
        )
        : [];
      const translatedCategoryIds = translations.map(translation => translation.entityId);

      query.$or = [
        { name: nameRegex },
        ...(translatedCategoryIds.length > 0 ? [{ _id: { $in: translatedCategoryIds } }] : []),
      ];
    }

    const count = await withTimeout(
      Category.countDocuments(query),
      8000
    );
    const categories = await withTimeout(
      Category.find(query)
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .lean(),
      8000
    );

    const localizedCategories = await localizeCategories(categories, req.lang);
    res.json({ categories: localizedCategories, page, pages: Math.ceil(count / pageSize) });
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
  const lang = req.lang;
  const category = await Category.findOne({ _id: req.params.id, isDeleted: false }).lean();

  if (!category) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.category_not_found'));
  }

  res.json(await localizeCategory(category, req.lang));
});

/**
 * Tạo danh mục sản phẩm mới (Admin only)
 * @route POST /api/categories
 * @access Private/Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, sourceNames, description, translationKey, icon, image, key, slug } = req.body;
  const lang = req.lang;

  // Check uniqueness on name
  const categoryExists = await Category.findOne({ name: { $regex: name, $options: 'i' }, isDeleted: false });

  if (categoryExists) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.category_already_exists'));
  }

  const category = new Category({
    name: name || '',
    sourceNames: normalizeSourceNames(sourceNames),
    description: description || '',
    translationKey: translationKey || null,
    icon: icon || 'Laptop',
    image: image || null,
    key: key || null,
    slug: slug || null,
  });

  const createdCategory = await category.save();
  const categoryResponse = createdCategory.toObject ? createdCategory.toObject() : createdCategory;
  res.status(201).json(await localizeCategory(categoryResponse, req.lang));
});

/**
 * Cập nhật thông tin danh mục (Admin only)
 * @route PUT /api/categories/:id
 * @access Private/Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { name, sourceNames, description, translationKey, icon, image, key, slug } = req.body;
  const lang = req.lang;

  const category = await Category.findById(req.params.id);

  if (category) {
    if (name) category.name = name;
    if (sourceNames !== undefined) category.sourceNames = normalizeSourceNames(sourceNames);
    if (description) category.description = description;
    if (translationKey !== undefined) category.translationKey = translationKey;
    if (icon) category.icon = icon;
    if (image !== undefined) category.image = image;
    if (key) category.key = key;
    if (slug) category.slug = slug;

    const updatedCategory = await category.save();
    const categoryResponse = updatedCategory.toObject ? updatedCategory.toObject() : updatedCategory;
    res.json(await localizeCategory(categoryResponse, req.lang));
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.category_not_found'));
  }
});

/**
 * Xóa mềm danh mục (Admin only)
 * @route DELETE /api/categories/:id
 * @access Private/Admin
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const category = await Category.findById(req.params.id);

  if (category) {
    category.isDeleted = true;
    await category.save();
    res.json({ message: getMessage(lang, 'admin-controllers-messages.category_removed') });
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.category_not_found'));
  }
});

/**
 * Xóa cứng danh mục (Super Admin only)
 * Xóa vĩnh viễn khỏi database
 * @route DELETE /api/categories/:id/hard
 * @access Private/SuperAdmin
 */
const hardDeleteCategory = asyncHandler(async (req, res) => {
  const lang = req.lang;
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.category_not_found'));
  }

  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    res.status(409);
    throw new Error('Cannot permanently delete a category that is linked to products.');
  }

  await category.deleteOne();
  res.json({ message: getMessage(lang, 'admin-controllers-messages.category_permanently_removed') });
});

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  hardDeleteCategory,
};
