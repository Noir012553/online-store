/**
 * ExchangeRateController - Controller quản lý tỷ giá quy đổi
 */

const exchangeRateService = require('../services/exchangeRateService');
const { getMessage } = require('../i18n/messages');
const { getDefaultLanguage } = require('../config/languageInventory');
const Currency = require('../models/Currency');
const { formatCurrency, formatExchangeRate } = require('../utils/currencyFormatter');

const getAdminLanguage = (req) => (req.lang || getDefaultLanguage().code).toUpperCase();

const formatRateData = (rate, lang) => {
  const data = rate.toObject ? rate.toObject() : rate;

  return {
    ...data,
    formattedRate: formatExchangeRate(data.rate, lang),
  };
};

const formatRateHistory = (history, lang) => history.map((entry) => ({
  ...entry,
  formattedOldRate: entry.oldRate === null ? null : formatExchangeRate(entry.oldRate, lang),
  formattedNewRate: formatExchangeRate(entry.newRate, lang),
}));

const formatRateStats = (stats, lang) => ({
  ...stats,
  formattedFirstRate: formatExchangeRate(stats.firstRate, lang),
  formattedLastRate: formatExchangeRate(stats.lastRate, lang),
  formattedCurrentRate: formatExchangeRate(stats.currentRate, lang),
});

const exchangeRateMessageKeys = {
  EXCHANGE_RATE_NOT_FOUND: 'not_found',
  EXCHANGE_RATE_PAIR_NOT_FOUND: 'pair_not_found',
  EXCHANGE_RATE_CURRENCIES_MATCH: 'currencies_match',
  EXCHANGE_RATE_ALREADY_EXISTS: 'already_exists',
  EXCHANGE_RATE_AMOUNT_NEGATIVE: 'amount_non_negative',
  EXCHANGE_RATE_CURRENCY_NOT_FOUND: 'currency_not_found',
};

const sendExchangeRateError = (res, status, lang, error) => {
  const code = error.code || 'EXCHANGE_RATE_OPERATION_FAILED';
  const key = exchangeRateMessageKeys[code] || 'operation_failed';

  return res.status(status).json({
    success: false,
    code,
    message: getMessage(lang, `exchange-rate.${key}`, error.params),
  });
};

const getExchangeRateErrorStatus = (error, fallbackStatus = 400) => {
  if (['EXCHANGE_RATE_NOT_FOUND', 'EXCHANGE_RATE_PAIR_NOT_FOUND', 'EXCHANGE_RATE_CURRENCY_NOT_FOUND'].includes(error.code)) {
    return 404;
  }

  if (error.code === 'EXCHANGE_RATE_ALREADY_EXISTS') {
    return 409;
  }

  return fallbackStatus;
};

/**
 * GET /api/exchange-rates
 * Lấy danh sách tất cả tỷ giá
 */
exports.getAllExchangeRates = async (req, res) => {
  try {
    const { isActive, fromCode, toCode } = req.query;
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (fromCode) {
      filter.fromCode = fromCode.toUpperCase();
    }

    if (toCode) {
      filter.toCode = toCode.toUpperCase();
    }

    const rates = await exchangeRateService.getExchangeRates(filter);
    const adminLang = getAdminLanguage(req);

    res.json({
      success: true,
      data: rates.map((rate) => formatRateData(rate, adminLang)),
      count: rates.length,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getAllExchangeRates] Error:', error);
    return sendExchangeRateError(res, 500, getAdminLanguage(req), error);
  }
};

/**
 * GET /api/exchange-rates/:id
 * Lấy thông tin một tỷ giá
 */
exports.getExchangeRateById = async (req, res) => {
  try {
    const { id } = req.params;
    const rate = await exchangeRateService.getExchangeRateById(id);

    res.json({
      success: true,
      data: formatRateData(rate, getAdminLanguage(req)),
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateById] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error, 404), getAdminLanguage(req), error);
  }
};

/**
 * GET /api/exchange-rates/pair/:fromCode/:toCode
 * Lấy tỷ giá giữa hai mệnh giá
 */
exports.getExchangeRatePair = async (req, res) => {
  try {
    const { fromCode, toCode } = req.params;
    const adminLang = getAdminLanguage(req);

    if (!fromCode || !toCode) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_CODES_REQUIRED',
        message: getMessage(adminLang, 'exchange-rate.required_codes'),
      });
    }

    const rate = await exchangeRateService.getExchangeRate(fromCode, toCode);

    res.json({
      success: true,
      data: formatRateData(rate, getAdminLanguage(req)),
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRatePair] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error, 404), getAdminLanguage(req), error);
  }
};

/**
 * POST /api/exchange-rates
 * Tạo tỷ giá mới
 */
exports.createExchangeRate = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { fromCode, toCode, rate, source, isActive } = req.body;

    // Validation
    if (!fromCode || !toCode || rate === undefined) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_FIELDS_REQUIRED',
        message: getMessage(adminLang, 'exchange-rate.required_fields'),
      });
    }

    if (rate <= 0) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_RATE_INVALID',
        message: getMessage(adminLang, 'exchange-rate.rate_must_be_positive'),
      });
    }

    const rateData = {
      fromCode: fromCode.toUpperCase(),
      toCode: toCode.toUpperCase(),
      rate: parseFloat(rate),
      source: source || 'manual',
      isActive: isActive ?? true,
    };

    const exchangeRate = await exchangeRateService.createExchangeRate(rateData);

    res.status(201).json({
      success: true,
      message: getMessage(adminLang, 'exchange-rate.created_success'),
      data: formatRateData(exchangeRate, adminLang),
    });
  } catch (error) {
    console.error('[ExchangeRateController.createExchangeRate] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * PUT /api/exchange-rates/:id
 * Cập nhật tỷ giá
 */
exports.updateExchangeRate = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { id } = req.params;
    const { fromCode, toCode, rate, source, isActive } = req.body;

    const updates = {};

    if (fromCode) updates.fromCode = fromCode.toUpperCase();
    if (toCode) updates.toCode = toCode.toUpperCase();
    if (rate !== undefined) {
      if (rate <= 0) {
        return res.status(400).json({
          success: false,
          code: 'EXCHANGE_RATE_RATE_INVALID',
        message: getMessage(adminLang, 'exchange-rate.rate_must_be_positive'),
        });
      }
      updates.rate = parseFloat(rate);
    }
    if (source) updates.source = source;
    if (isActive !== undefined) updates.isActive = isActive;

    const exchangeRate = await exchangeRateService.updateExchangeRate(id, updates);

    res.json({
      success: true,
      message: getMessage(adminLang, 'exchange-rate.updated_success'),
      data: formatRateData(exchangeRate, adminLang),
    });
  } catch (error) {
    console.error('[ExchangeRateController.updateExchangeRate] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * DELETE /api/exchange-rates/:id
 * Xóa tỷ giá
 */
exports.deleteExchangeRate = async (req, res) => {
  try {
    const { id } = req.params;

    const adminLang = getAdminLanguage(req);
    await exchangeRateService.deleteExchangeRate(id);

    res.json({
      success: true,
      message: getMessage(adminLang, 'exchange-rate.deleted_success'),
    });
  } catch (error) {
    console.error('[ExchangeRateController.deleteExchangeRate] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * POST /api/exchange-rates/convert
 * Quy đổi tiền từ một mệnh giá sang mệnh giá khác
 */
exports.convertAmount = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { amount, fromCode, toCode } = req.body;

    // Validation
    if (amount === undefined || !fromCode || !toCode) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_FIELDS_REQUIRED',
        message: getMessage(adminLang, 'exchange-rate.required_fields'),
      });
    }

    if (amount < 0) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_AMOUNT_INVALID',
        message: getMessage(adminLang, 'exchange-rate.amount_non_negative'),
      });
    }

    const result = await exchangeRateService.convertAmount(amount, fromCode, toCode);
    const currencies = await Currency.find(
      { code: { $in: [result.fromCode.toUpperCase(), result.toCode.toUpperCase()] } },
      { code: 1, symbol: 1, position: 1, decimalPlaces: 1, _id: 0 }
    ).lean();
    const currenciesByCode = new Map(currencies.map((currency) => [currency.code, currency]));
    const fromCurrency = currenciesByCode.get(result.fromCode.toUpperCase());
    const toCurrency = currenciesByCode.get(result.toCode.toUpperCase());

    res.json({
      success: true,
      data: {
        ...result,
        formattedAmount: formatCurrency(result.amount, fromCurrency, adminLang),
        formattedConvertedAmount: formatCurrency(result.convertedAmount, toCurrency, adminLang),
        formattedRate: formatExchangeRate(result.rate, adminLang),
      },
    });
  } catch (error) {
    console.error('[ExchangeRateController.convertAmount] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * GET /api/exchange-rates/history/:fromCode/:toCode
 * Lấy lịch sử tỷ giá (PHASE 3.5)
 */
exports.getExchangeRateHistory = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { fromCode, toCode } = req.params;
    const { days = 30, limit = 100 } = req.query;

    if (!fromCode || !toCode) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_CODES_REQUIRED',
        message: getMessage(adminLang, 'exchange-rate.required_codes'),
      });
    }

    const history = await exchangeRateService.getExchangeRateHistory(
      fromCode,
      toCode,
      { days: parseInt(days), limit: parseInt(limit) }
    );

    res.json({
      success: true,
      data: formatRateHistory(history, adminLang),
      count: history.length,
      periodDays: Number(days),
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateHistory] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * GET /api/exchange-rates/stats/:fromCode/:toCode
 * Lấy thống kê tỷ giá (PHASE 3.5)
 */
exports.getExchangeRateStats = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const { fromCode, toCode } = req.params;
    const { days = 30 } = req.query;

    if (!fromCode || !toCode) {
      return res.status(400).json({
        success: false,
        code: 'EXCHANGE_RATE_CODES_REQUIRED',
        message: getMessage(adminLang, 'exchange-rate.required_codes'),
      });
    }

    const stats = await exchangeRateService.getExchangeRateStats(
      fromCode,
      toCode,
      parseInt(days)
    );

    res.json({
      success: true,
      data: formatRateStats(stats, adminLang),
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateStats] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * POST /api/exchange-rates/scheduler/update
 * Cập nhật tỷ giá ngay lập tức (Admin only) (PHASE 3.5)
 */
exports.updateRatesNow = async (req, res) => {
  try {
    const adminLang = getAdminLanguage(req);
    const schedulerService = require('../services/exchangeRateSchedulerService');
    const { externalApi } = req.body;

    const updatedCount = await schedulerService.updateExchangeRates(externalApi);

    res.json({
      success: true,
      message: getMessage(adminLang, 'exchange-rate.updated_rates', { count: updatedCount }),
      data: { updatedCount, timestamp: new Date() },
    });
  } catch (error) {
    console.error('[ExchangeRateController.updateRatesNow] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};

/**
 * GET /api/exchange-rates/scheduler/status
 * Lấy trạng thái scheduler (Admin only) (PHASE 3.5)
 */
exports.getSchedulerStatus = async (req, res) => {
  try {
    const schedulerService = require('../services/exchangeRateSchedulerService');
    const status = schedulerService.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getSchedulerStatus] Error:', error);
    return sendExchangeRateError(res, getExchangeRateErrorStatus(error), getAdminLanguage(req), error);
  }
};
