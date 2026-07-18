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
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/currencies
 * Tạo mệnh giá mới
 */
exports.createCurrency = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { code, name, symbol, position, decimalPlaces, isActive, isDefault, description } =
      req.body;

    // Validation
    if (!code || !name || !symbol) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'currency.requiredFields'),
      });
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
      message: getMessage(adminLang, 'currency.createdSuccess'),
      data: currency,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.createCurrency] Error:', error);
    }

    if (error.message.includes('duplicate')) {
      return res.status(409).json({
        success: false,
        message: getMessage(adminLang, 'currency.alreadyExists'),
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * PUT /api/currencies/:id
 * Cập nhật mệnh giá
 */
exports.updateCurrency = async (req, res) => {
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
      message: getMessage(adminLang, 'currency.updatedSuccess'),
      data: currency,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.updateCurrency] Error:', error);
    }

    if (error.code === 'CURRENCY_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: getMessage(adminLang, 'currency.notFound'),
      });
    }

    if (error.code === 'NO_DEFAULT_CURRENCY') {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'currency.requiresDefaultCurrency'),
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * DELETE /api/currencies/:id
 * Xóa mệnh giá
 */
exports.deleteCurrency = async (req, res) => {
  try {
    const { id } = req.params;

    await currencyService.deleteCurrency(id);

    res.json({
      success: true,
      message: getMessage(adminLang, 'currency.deletedSuccess'),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CurrencyController.deleteCurrency] Error:', error);
    }
    const adminLang = getAdminLanguage(req);

    if (error.code === 'CURRENCY_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: getMessage(adminLang, 'currency.notFound'),
      });
    }

    if (error.code === 'CANNOT_DELETE_DEFAULT_CURRENCY') {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'currency.cannotDeleteDefault'),
      });
    }

    if (error.code === 'CURRENCY_HAS_RELATED_RATES') {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'currency.hasRelatedRates'),
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
