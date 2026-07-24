/**
 * CurrencyController - Controller quản lý mệnh giá
 */

const currencyService = require('../services/currencyService');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');

const getAdminLanguage = (req) => {
  if (req.user?.language) {
    return req.user.language.toUpperCase();
  }
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    return acceptLang.split(',')[0].split('-')[0].toUpperCase();
  }
  return getDefaultLanguage().code.toUpperCase();
};

const currencyMessageKeys = {
  CURRENCY_NOT_FOUND: 'checkout.error_currency_not_found',
  NO_DEFAULT_CURRENCY: 'checkout.error_currency_required',
  CANNOT_DELETE_DEFAULT_CURRENCY: 'checkout.error_cannot_delete_default_currency',
  CURRENCY_HAS_RELATED_RATES: 'checkout.error_cannot_delete_currency_with_rates',
  CURRENCY_ALREADY_EXISTS: 'admin-common.admin_currency_error_exists',
};

const sendCurrencyError = (res, status, lang, error) => {
  const code = error.code || 'CURRENCY_OPERATION_FAILED';
  const key = currencyMessageKeys[code] || 'common.error_request_title';

  return res.status(status).json({
    success: false,
    code,
    params: error.params,
    message: getMessage(lang, key, error.params),
  });
};

/**
 * GET /api/currencies
 * Lấy danh sách tất cả mệnh giá
 */
exports.getAllCurrencies = async (req, res) => {
  try {
    const { isActive } = req.query;
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const currencies = await currencyService.getCurrencies(filter);

    res.json({
      success: true,
      data: currencies,
      count: currencies.length,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.getAllCurrencies] Error:', error);
    }
    sendCurrencyError(res, 500, getAdminLanguage(req), error);
  }
};

/**
 * GET /api/currencies/:id
 * Lấy thông tin một mệnh giá
 */
exports.getCurrencyById = async (req, res) => {
  try {
    const { id } = req.params;
    const currency = await currencyService.getCurrencyById(id);

    res.json({
      success: true,
      data: currency,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.getCurrencyById] Error:', error);
    }
    sendCurrencyError(res, 404, getAdminLanguage(req), error);
  }
};

/**
 * POST /api/currencies
 * Tạo mệnh giá mới
 */
exports.createCurrency = async (req, res) => {
  const adminLang = getAdminLanguage(req);

  try {
    const { code, name, symbol, position, decimalPlaces, isActive, isDefault, description } =
      req.body;

    if (!code || !name || !symbol) {
      return sendCurrencyError(res, 400, adminLang, { code: 'CURRENCY_REQUIRED_FIELDS' });
    }

    const currencyData = {
      code: code.toUpperCase(),
      name,
      symbol,
      position: position || 'after',
      decimalPlaces: decimalPlaces ?? 2,
      isActive: isActive ?? true,
      isDefault: isDefault ?? false,
      description,
    };

    const currency = await currencyService.createCurrency(currencyData);

    res.status(201).json({
      success: true,
      data: currency,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.createCurrency] Error:', error);
    }

    if (error.code === 11000) {
      error.code = 'CURRENCY_ALREADY_EXISTS';
      return sendCurrencyError(res, 409, adminLang, error);
    }

    sendCurrencyError(res, 400, adminLang, error);
  }
};

/**
 * PUT /api/currencies/:id
 * Cập nhật mệnh giá
 */
exports.updateCurrency = async (req, res) => {
  const adminLang = getAdminLanguage(req);

  try {
    const { id } = req.params;
    const { code, name, symbol, position, decimalPlaces, isActive, isDefault, description } =
      req.body;

    const updates = {};

    if (code) updates.code = code.toUpperCase();
    if (name) updates.name = name;
    if (symbol) updates.symbol = symbol;
    if (position) updates.position = position;
    if (decimalPlaces !== undefined) updates.decimalPlaces = decimalPlaces;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isDefault !== undefined) updates.isDefault = isDefault;
    if (description !== undefined) updates.description = description;

    const currency = await currencyService.updateCurrency(id, updates);

    res.json({
      success: true,
      data: currency,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.updateCurrency] Error:', error);
    }

    sendCurrencyError(res, error.code === 'CURRENCY_NOT_FOUND' ? 404 : 400, adminLang, error);
  }
};

/**
 * DELETE /api/currencies/:id
 * Xóa mệnh giá
 */
exports.deleteCurrency = async (req, res) => {
  const adminLang = getAdminLanguage(req);

  try {
    const { id } = req.params;

    await currencyService.deleteCurrency(id);

    res.json({
      success: true,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.deleteCurrency] Error:', error);
    }

    sendCurrencyError(res, error.code === 'CURRENCY_NOT_FOUND' ? 404 : 400, adminLang, error);
  }
};
