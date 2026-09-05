const asyncHandler = require('express-async-handler');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { withTimeout } = require('../utils/mongooseUtils');
const { overlayTranslationBatch, overlayTranslation } = require('../services/translationHelper');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

const EXCLUDED_BRAND_PATTERN = /^iKBC\s*(?:&(?:amp;)*|and)\s*Durgod$/i;

const getBrands = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();

  const brands = await withTimeout(
    Brand.find({ isDeleted: false, name: { $not: EXCLUDED_BRAND_PATTERN } }).lean(),
    8000
  );

  const productBrands = await withTimeout(
    Product.distinct('brand', { isDeleted: false, storefrontReady: true }),
    8000
  );
  const brandNames = new Map(brands.map((brand) => [brand.name.trim().toLowerCase(), brand]));

  productBrands
    .map((name) => String(name || '').trim())
    .filter((name) => name && !EXCLUDED_BRAND_PATTERN.test(name))
    .forEach((name) => {
      const normalizedName = name.toLowerCase();
      if (!brandNames.has(normalizedName)) {
        brandNames.set(normalizedName, {
          _id: `product-brand-${normalizedName.replace(/[^a-z0-9]+/gi, '-')}`,
          name,
          logo: null,
          description: null,
          key: normalizedName.replace(/[^a-z0-9]+/gi, '-'),
        });
      }
    });

  const translatedBrands = await overlayTranslationBatch([...brandNames.values()], 'brand', lang);

  res.json({ brands: translatedBrands });
});

const getBrandById = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();
  const brand = await Brand.findOne({ _id: req.params.id, isDeleted: false }).lean();

  if (!brand) {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.brand_not_found'));
  }

  const translatedBrand = await overlayTranslation(brand, 'brand', lang);

  res.json(translatedBrand);
});

const createBrand = asyncHandler(async (req, res) => {
  const { name, logo, description, key } = req.body;
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();

  if (EXCLUDED_BRAND_PATTERN.test(String(name || '').trim())) {
    res.status(400);
    throw new Error('This brand is not allowed');
  }

  const brandExists = await Brand.findOne({ name: { $regex: name, $options: 'i' }, isDeleted: false });

  if (brandExists) {
    res.status(400);
    throw new Error(getMessage(lang, 'admin-controllers-messages.brand_already_exists'));
  }

  const brand = new Brand({
    name: name || '',
    logo: logo || null,
    description: description || null,
    key: key || null,
  });

  const createdBrand = await brand.save();
  res.status(201).json(createdBrand.toObject ? createdBrand.toObject() : createdBrand);
});

const updateBrand = asyncHandler(async (req, res) => {
  const { name, logo, description, key } = req.body;
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();

  const brand = await Brand.findById(req.params.id);

  if (brand) {
    if (name && EXCLUDED_BRAND_PATTERN.test(String(name).trim())) {
      res.status(400);
      throw new Error('This brand is not allowed');
    }
    if (name) brand.name = name;
    if (logo !== undefined) brand.logo = logo;
    if (description !== undefined) brand.description = description;
    if (key) brand.key = key;

    const updatedBrand = await brand.save();
    res.json(updatedBrand.toObject ? updatedBrand.toObject() : updatedBrand);
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.brand_not_found'));
  }
});

const deleteBrand = asyncHandler(async (req, res) => {
  const defaultLang = getDefaultLanguage();
  const lang = (req.query.lang || defaultLang.code).toLowerCase();
  const brand = await Brand.findById(req.params.id);

  if (brand) {
    brand.isDeleted = true;
    await brand.save();
    res.json({ message: getMessage(lang, 'admin-controllers-messages.brand_removed') });
  } else {
    res.status(404);
    throw new Error(getMessage(lang, 'admin-controllers-messages.brand_not_found'));
  }
});

module.exports = {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
};
