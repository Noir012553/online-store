const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');
const localizeCategories = async (categories, lang) => {
  if (!Array.isArray(categories) || categories.length === 0 || !lang) {
    return categories;
  }

  const categoryIds = categories
    .map(category => category?._id?.toString())
    .filter(Boolean);

  if (categoryIds.length === 0) return categories;

  const translations = await CategoryCatalogTranslationCache.find({
    entityId: { $in: categoryIds },
    targetLang: lang,
    status: 'success',
  }).lean();
  const translationsById = new Map(translations.map(translation => [translation.entityId, translation]));

  return categories.map(category => {
    const translation = translationsById.get(category._id.toString());
    if (!translation) return category;

    return {
      ...category,
      name: translation.name || category.name,
      description: translation.description || category.description,
    };
  });
};

const localizeCategory = async (category, lang) => {
  if (!category) return category;
  const [localizedCategory] = await localizeCategories([category], lang);
  return localizedCategory;
};

const localizeProductCategories = async (products, lang) => {
  if (!Array.isArray(products) || products.length === 0 || !lang) {
    return products;
  }

  const categoryMap = new Map();
  products.forEach(product => {
    if (product.category?._id) {
      categoryMap.set(product.category._id.toString(), product.category);
    }
  });

  const localizedCategories = await localizeCategories([...categoryMap.values()], lang);
  const localizedById = new Map(localizedCategories.map(category => [category._id.toString(), category]));

  return products.map(product => ({
    ...product,
    category: product.category?._id
      ? localizedById.get(product.category._id.toString()) || product.category
      : product.category,
  }));
};

const localizeProductCategory = async (product, lang) => {
  if (!product?.category?._id || !lang) return product;
  return {
    ...product,
    category: await localizeCategory(product.category, lang),
  };
};

module.exports = {
  localizeCategory,
  localizeCategories,
  localizeProductCategory,
  localizeProductCategories,
};
