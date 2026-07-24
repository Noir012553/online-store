/**
 * ExchangeRateController - Controller quản lý tỷ giá quy đổi
 */

const exchangeRateService = require('../services/exchangeRateService');
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

    res.json({
      success: true,
      data: rates,
      count: rates.length,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getAllExchangeRates] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
      data: rate,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateById] Error:', error);
    res.status(404).json({
      success: false,
      message: error.message,
    });
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
        message: getMessage(adminLang, 'exchangeRate.requiredCodes'),
      });
    }

    const rate = await exchangeRateService.getExchangeRate(fromCode, toCode);

    res.json({
      success: true,
      data: rate,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRatePair] Error:', error);
    res.status(404).json({
      success: false,
      message: error.message,
    });
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
        message: getMessage(adminLang, 'exchangeRate.requiredFields'),
      });
    }

    if (rate <= 0) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'exchangeRate.rateMustBePositive'),
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
      message: getMessage(adminLang, 'exchangeRate.createdSuccess'),
      data: exchangeRate,
    });
  } catch (error) {
    console.error('[ExchangeRateController.createExchangeRate] Error:', error);

    if (error.message.includes('không tồn tại')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
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
          message: getMessage(adminLang, 'exchangeRate.rateMustBePositive'),
        });
      }
      updates.rate = parseFloat(rate);
    }
    if (source) updates.source = source;
    if (isActive !== undefined) updates.isActive = isActive;

    const exchangeRate = await exchangeRateService.updateExchangeRate(id, updates);

    res.json({
      success: true,
      message: getMessage(adminLang, 'exchangeRate.updatedSuccess'),
      data: exchangeRate,
    });
  } catch (error) {
    console.error('[ExchangeRateController.updateExchangeRate] Error:', error);

    if (error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
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
      message: getMessage(adminLang, 'exchangeRate.deletedSuccess'),
    });
  } catch (error) {
    console.error('[ExchangeRateController.deleteExchangeRate] Error:', error);

    if (error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
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
        message: getMessage(adminLang, 'exchangeRate.requiredFields'),
      });
    }

    if (amount < 0) {
      return res.status(400).json({
        success: false,
        message: getMessage(adminLang, 'exchangeRate.amountNonNegative'),
      });
    }

    const result = await exchangeRateService.convertAmount(amount, fromCode, toCode);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[ExchangeRateController.convertAmount] Error:', error);

    if (error.message.includes('does not exist') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
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
        message: getMessage(adminLang, 'exchangeRate.requiredCodes'),
      });
    }

    const history = await exchangeRateService.getExchangeRateHistory(
      fromCode,
      toCode,
      { days: parseInt(days), limit: parseInt(limit) }
    );

    res.json({
      success: true,
      data: history,
      count: history.length,
      period: `${days} days`,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateHistory] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
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
        message: getMessage(adminLang, 'exchangeRate.requiredCodes'),
      });
    }

    const stats = await exchangeRateService.getExchangeRateStats(
      fromCode,
      toCode,
      parseInt(days)
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[ExchangeRateController.getExchangeRateStats] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
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
      message: getMessage(adminLang, 'exchangeRate.updatedRates', { count: updatedCount }),
      data: { updatedCount, timestamp: new Date() },
    });
  } catch (error) {
    console.error('[ExchangeRateController.updateRatesNow] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
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
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
