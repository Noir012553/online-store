/**
 * Controller quản lý địa chỉ giao hàng
 * Xử lý: CRUD địa chỉ, set default address, soft/hard delete
 * Validate địa chỉ thông qua GHN API
 */

const asyncHandler = require('express-async-handler');
const Address = require('../models/Address');
const Customer = require('../models/Customer');
const ghnService = require('../services/ghnService');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

// Helper: Get language from request
const getAddressLanguage = (req) => {
  const { getActiveLangCodes } = require('../config/languageInventory');

  if (req.user?.language) {
    return req.user.language.toUpperCase();
  }
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const primaryLang = acceptLang.split(',')[0].split('-')[0].toUpperCase();
    const activeLangs = getActiveLangCodes();
    if (activeLangs.includes(primaryLang)) {
      return primaryLang;
    }
  }
  return getDefaultLanguage().code.toUpperCase();
};

/**
 * Lấy danh sách địa chỉ của khách hàng
 * @route GET /api/addresses
 * @query customerId - ID khách hàng (bắt buộc)
 * @access Private
 */
const getAddresses = asyncHandler(async (req, res) => {
  const addressLang = getAddressLanguage(req);
  const { customerId } = req.query;

  if (!customerId) {
    return res.status(400).json({ message: getMessage(addressLang, 'address.customerRequired') });
  }

  // Verify customer exists
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  if (!customer) {
    return res.status(404).json({ message: getMessage(addressLang, 'address.customerNotFound') });
  }

  const addresses = await Address.find({
    customer: customerId,
    isDeleted: false,
  }).sort({ isDefault: -1, createdAt: -1 });

  res.json({
    count: addresses.length,
    addresses,
  });
});

/**
 * Lấy chi tiết địa chỉ theo ID
 * @route GET /api/addresses/:id
 * @access Private
 */
const getAddressById = asyncHandler(async (req, res) => {
  const addressLang = getAddressLanguage(req);
  const address = await Address.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).populate('customer');

  if (!address) {
    return res.status(404).json({ message: getMessage(addressLang, 'address.notFound') });
  }

  res.json(address);
});

/**
 * Tạo địa chỉ mới
 * @route POST /api/addresses
 * @body {customerId, fullName, phone, provinceId, districtId, wardId, street, addressType}
 * @access Private
 */
const createAddress = asyncHandler(async (req, res) => {
  const addressLang = getAddressLanguage(req);
  const { customerId, fullName, phone, provinceId, districtId, wardId, street, addressType, isDefault } = req.body;

  // Validate required fields
  if (!customerId || !fullName || !phone || !provinceId || !districtId || !wardId || !street) {
    return res.status(400).json({ message: getMessage(addressLang, 'address.missingFields') });
  }

  // Verify customer exists
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  if (!customer) {
    return res.status(404).json({ message: getMessage(addressLang, 'address.customerNotFound') });
  }

  // Validate province/district/ward với GHN
  const ghnValidation = await ghnService.validateProvincDistrictWard({
    provinceId,
    districtId,
    wardId,
  });

  if (!ghnValidation.valid) {
    return res.status(400).json({ message: ghnValidation.error });
  }

  // Create address
  const address = new Address({
    customer: customerId,
    fullName,
    phone,
    provinceId: ghnValidation.province.ProvinceID,
    provinceName: ghnValidation.province.ProvinceName,
    districtId: ghnValidation.district.DistrictID,
    districtName: ghnValidation.district.DistrictName,
    wardId: ghnValidation.ward.WardID,
    wardName: ghnValidation.ward.WardName,
    street,
    addressType: addressType || 'home',
    isDefault: isDefault || false,
  });

  const savedAddress = await address.save();

  const lang = getAddressLanguage(req);
  res.status(201).json({
    message: getMessage(lang, 'admin-controllers-messages.address_created_success'),
    address: savedAddress,
  });
});

/**
 * Cập nhật địa chỉ
 * @route PUT /api/addresses/:id
 * @body {fullName, phone, provinceId, districtId, wardId, street, addressType}
 * @access Private
 */
const updateAddress = asyncHandler(async (req, res) => {
  const { fullName, phone, provinceId, districtId, wardId, street, addressType, isDefault } = req.body;

  const address = await Address.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!address) {
    const lang = getAddressLanguage(req);
    return res.status(404).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_found') });
  }

  const lang = getAddressLanguage(req);

  // Validate nếu có thay đổi province/district/ward
  if (provinceId || districtId || wardId) {
    const ghnValidation = await ghnService.validateProvincDistrictWard({
      provinceId: provinceId || address.provinceId,
      districtId: districtId || address.districtId,
      wardId: wardId || address.wardId,
    });

    if (!ghnValidation.valid) {
      return res.status(400).json({ message: ghnValidation.error });
    }

    address.provinceId = ghnValidation.province.ProvinceID;
    address.provinceName = ghnValidation.province.ProvinceName;
    address.districtId = ghnValidation.district.DistrictID;
    address.districtName = ghnValidation.district.DistrictName;
    address.wardId = ghnValidation.ward.WardID;
    address.wardName = ghnValidation.ward.WardName;
  }

  // Update fields
  if (fullName) address.fullName = fullName;
  if (phone) address.phone = phone;
  if (street) address.street = street;
  if (addressType) address.addressType = addressType;
  if (typeof isDefault === 'boolean') address.isDefault = isDefault;

  const updatedAddress = await address.save();

  res.json({
    message: getMessage(lang, 'admin-controllers-messages.address_updated_success'),
    address: updatedAddress,
  });
});

/**
 * Đặt địa chỉ làm mặc định
 * @route PUT /api/addresses/:id/default
 * @access Private
 */
const setAsDefault = asyncHandler(async (req, res) => {
  const lang = getAddressLanguage(req);
  const address = await Address.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!address) {
    return res.status(404).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_found') });
  }

  address.isDefault = true;
  const updatedAddress = await address.save();

  res.json({
    message: getMessage(lang, 'admin-controllers-messages.address_set_default_success'),
    address: updatedAddress,
  });
});

/**
 * Xóa mềm địa chỉ
 * @route DELETE /api/addresses/:id
 * @access Private
 */
const deleteAddress = asyncHandler(async (req, res) => {
  const lang = getAddressLanguage(req);
  const address = await Address.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!address) {
    return res.status(404).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_found') });
  }

  address.isDeleted = true;
  await address.save();

  res.json({ message: getMessage(lang, 'admin-controllers-messages.address_deleted_success') });
});

/**
 * Xóa cứng địa chỉ (Admin only)
 * @route DELETE /api/addresses/:id/hard
 * @access Private/Admin
 */
const hardDeleteAddress = asyncHandler(async (req, res) => {
  const lang = getAddressLanguage(req);
  const address = await Address.findById(req.params.id);

  if (!address) {
    return res.status(404).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_found') });
  }

  await Address.findByIdAndDelete(req.params.id);

  res.json({ message: getMessage(lang, 'admin-controllers-messages.address_hard_deleted_success') });
});

/**
 * Lấy danh sách địa chỉ đã xóa (Admin only)
 * @route GET /api/addresses/deleted/list
 * @access Private/Admin
 */
const getDeletedAddresses = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;

  const count = await Address.countDocuments({ isDeleted: true });
  const addresses = await Address.find({ isDeleted: true })
    .populate('customer')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ deletedAt: -1 });

  res.json({
    addresses,
    page,
    pages: Math.ceil(count / pageSize),
  });
});

/**
 * Restore địa chỉ đã xóa (Admin only)
 * @route PUT /api/addresses/:id/restore
 * @access Private/Admin
 */
const restoreAddress = asyncHandler(async (req, res) => {
  const lang = getAddressLanguage(req);
  const address = await Address.findById(req.params.id);

  if (!address) {
    return res.status(404).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_found') });
  }

  if (!address.isDeleted) {
    return res.status(400).json({ message: getMessage(lang, 'admin-controllers-messages.address_not_deleted') });
  }

  address.isDeleted = false;
  await address.save();

  res.json({
    message: getMessage(lang, 'admin-controllers-messages.address_restored_success'),
    address,
  });
});

module.exports = {
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  setAsDefault,
  deleteAddress,
  hardDeleteAddress,
  getDeletedAddresses,
  restoreAddress,
};
