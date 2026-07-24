/**
 * ExchangeRateService - Service quản lý tỷ giá quy đổi
 * Chức năng:
 * 1. CRUD tỷ giá
 * 2. Tính toán quy đổi tiền tệ
 * 3. Cache tỷ giá
 * 4. Lưu lịch sử tỷ giá (PHASE 3.5)
 */

const ExchangeRate = require('../models/ExchangeRate');
const ExchangeRateHistory = require('../models/ExchangeRateHistory');
const Currency = require('../models/Currency');

const createExchangeRateError = (code, params = {}) => Object.assign(new Error(code), { code, params });

// Cache tỷ giá trong bộ nhớ (đơn giản)
let rateCache = {};
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 phút

class ExchangeRateService {
  /**
   * Tạo tỷ giá mới
   * @param {Object} data - { fromCode, toCode, rate, source }
   * @returns {Object} ExchangeRate object
   */
  async createExchangeRate(data) {
    // Validate: fromCode != toCode
    if (data.fromCode === data.toCode) {
      throw createExchangeRateError('EXCHANGE_RATE_CURRENCIES_MATCH');
    }

    // Validate: cả hai mệnh giá phải tồn tại
    await this._validateCurrencies(data.fromCode, data.toCode);

    // Kiểm tra tỷ giá này đã tồn tại chưa
    const existing = await ExchangeRate.findOne({
      fromCode: data.fromCode,
      toCode: data.toCode,
    });

    if (existing) {
      throw createExchangeRateError('EXCHANGE_RATE_ALREADY_EXISTS', {
        fromCode: data.fromCode,
        toCode: data.toCode,
      });
    }

    const exchangeRate = new ExchangeRate(data);
    await exchangeRate.save();

    // Ghi lịch sử (init)
    await this._recordHistory(data.fromCode, data.toCode, null, data.rate, 'init', data.source);

    // Clear cache
    this._clearCache();

    return exchangeRate;
  }

  /**
   * Lấy tất cả tỷ giá
   * @param {Object} filter - { isActive, fromCode, toCode }
   * @returns {Array} Danh sách ExchangeRate
   */
  async getExchangeRates(filter = {}) {
    const query = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    if (filter.fromCode) query.fromCode = filter.fromCode.toUpperCase();
    if (filter.toCode) query.toCode = filter.toCode.toUpperCase();

    return await ExchangeRate.find(query).sort({ fromCode: 1, toCode: 1 });
  }

  /**
   * Lấy tỷ giá theo ID
   * @param {String} id - MongoDB ID
   * @returns {Object} ExchangeRate object
   */
  async getExchangeRateById(id) {
    const rate = await ExchangeRate.findById(id);
    if (!rate) {
      throw createExchangeRateError('EXCHANGE_RATE_NOT_FOUND');
    }
    return rate;
  }

  /**
   * Lấy tỷ giá giữa hai mệnh giá
   * @param {String} fromCode - Mã tiền tệ nguồn
   * @param {String} toCode - Mã tiền tệ đích
   * @returns {Object} ExchangeRate object
   */
  async getExchangeRate(fromCode, toCode) {
    if (fromCode === toCode) {
      // Nếu là cùng mệnh giá, tỷ giá = 1
      return { fromCode, toCode, rate: 1 };
    }

    const rate = await ExchangeRate.findOne({
      fromCode: fromCode.toUpperCase(),
      toCode: toCode.toUpperCase(),
      isActive: true,
    });

    if (!rate) {
      throw createExchangeRateError('EXCHANGE_RATE_PAIR_NOT_FOUND', { fromCode, toCode });
    }

    return rate;
  }

  /**
   * Cập nhật tỷ giá
   * @param {String} id - MongoDB ID
   * @param {Object} updates - Dữ liệu cập nhật
   * @returns {Object} ExchangeRate object cập nhật
   */
  async updateExchangeRate(id, updates) {
    const rate = await ExchangeRate.findById(id);
    if (!rate) {
      throw createExchangeRateError('EXCHANGE_RATE_NOT_FOUND');
    }

    // Nếu cập nhật fromCode hoặc toCode, cần validate
    if (updates.fromCode || updates.toCode) {
      const fromCode = updates.fromCode || rate.fromCode;
      const toCode = updates.toCode || rate.toCode;

      if (fromCode === toCode) {
        throw createExchangeRateError('EXCHANGE_RATE_CURRENCIES_MATCH');
      }

      await this._validateCurrencies(fromCode, toCode);

      // Kiểm tra tỷ giá mới này đã tồn tại chưa
      const existing = await ExchangeRate.findOne({
        _id: { $ne: id },
        fromCode,
        toCode,
      });

      if (existing) {
        throw createExchangeRateError('EXCHANGE_RATE_ALREADY_EXISTS', { fromCode, toCode });
      }
    }

    // Cập nhật rateUpdatedAt khi thay đổi rate
    const oldRate = rate.rate;
    if (updates.rate) {
      updates.rateUpdatedAt = new Date();

      // Ghi lịch sử
      await this._recordHistory(
        rate.fromCode,
        rate.toCode,
        oldRate,
        updates.rate,
        'update',
        updates.source || rate.source
      );
    }

    Object.assign(rate, updates);
    await rate.save();

    // Clear cache
    this._clearCache();

    return rate;
  }

  /**
   * Xóa tỷ giá
   * @param {String} id - MongoDB ID
   */
  async deleteExchangeRate(id) {
    const rate = await ExchangeRate.findById(id);
    if (!rate) {
      throw createExchangeRateError('EXCHANGE_RATE_NOT_FOUND');
    }

    await ExchangeRate.findByIdAndDelete(id);

    // Clear cache
    this._clearCache();
  }

  /**
   * Quy đổi tiền từ một mệnh giá sang mệnh giá khác
   * @param {Number} amount - Số tiền
   * @param {String} fromCode - Mã tiền tệ nguồn
   * @param {String} toCode - Mã tiền tệ đích
   * @returns {Object} { amount, fromCode, toCode, rate, convertedAmount }
   */
  async convertAmount(amount, fromCode, toCode) {
    if (amount < 0) {
      throw createExchangeRateError('EXCHANGE_RATE_AMOUNT_NEGATIVE');
    }

    // Nếu cùng mệnh giá, không cần quy đổi
    if (fromCode.toUpperCase() === toCode.toUpperCase()) {
      return {
        amount,
        fromCode,
        toCode,
        rate: 1,
        convertedAmount: amount,
      };
    }

    const [rate, targetCurrency] = await Promise.all([
      this.getExchangeRate(fromCode, toCode),
      Currency.findOne({ code: toCode.toUpperCase() }, { decimalPlaces: 1 }).lean(),
    ]);

    if (!targetCurrency) {
      throw createExchangeRateError('EXCHANGE_RATE_CURRENCY_NOT_FOUND', { currencyCode: toCode });
    }

    const multiplier = 10 ** targetCurrency.decimalPlaces;

    return {
      amount,
      fromCode,
      toCode,
      rate: rate.rate,
      convertedAmount: Math.round(amount * rate.rate * multiplier) / multiplier,
    };
  }

  /**
   * Đếm tổng tỷ giá
   * @returns {Number}
   */
  async countExchangeRates(filter = {}) {
    const query = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    return await ExchangeRate.countDocuments(query);
  }

  /**
   * Validate hai mệnh giá tồn tại
   * @private
   */
  async _validateCurrencies(fromCode, toCode) {
    const [fromExists, toExists] = await Promise.all([
      Currency.findOne({ code: fromCode.toUpperCase() }),
      Currency.findOne({ code: toCode.toUpperCase() }),
    ]);

    if (!fromExists) {
      throw createExchangeRateError('EXCHANGE_RATE_CURRENCY_NOT_FOUND', { currencyCode: fromCode });
    }

    if (!toExists) {
      throw createExchangeRateError('EXCHANGE_RATE_CURRENCY_NOT_FOUND', { currencyCode: toCode });
    }
  }

  /**
   * Lấy lịch sử tỷ giá
   * @param {String} fromCode - Mã tiền tệ nguồn
   * @param {String} toCode - Mã tiền tệ đích
   * @param {Object} options - { limit, days, startDate, endDate }
   * @returns {Array} Danh sách lịch sử
   */
  async getExchangeRateHistory(fromCode, toCode, options = {}) {
    const query = {
      fromCode: fromCode.toUpperCase(),
      toCode: toCode.toUpperCase(),
    };

    // Filter theo ngày (mặc định 30 ngày gần nhất)
    const days = options.days || 30;
    const startDate = options.startDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = options.endDate || new Date();

    query.recordedAt = { $gte: startDate, $lte: endDate };

    const limit = options.limit || 100;
    return await ExchangeRateHistory.find(query)
      .sort({ recordedAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Lấy thống kê thay đổi tỷ giá (tăng/giảm)
   * @param {String} fromCode
   * @param {String} toCode
   * @param {Number} days - Số ngày (mặc định 30)
   * @returns {Object} { increases, decreases, avgChange, lastRate, currentRate }
   */
  async getExchangeRateStats(fromCode, toCode, days = 30) {
    const history = await this.getExchangeRateHistory(fromCode, toCode, { days });

    const increases = history.filter(h => h.changeType === 'increase').length;
    const decreases = history.filter(h => h.changeType === 'decrease').length;
    const avgChange = history.length > 0
      ? history.reduce((sum, h) => sum + (h.rateChange || 0), 0) / history.length
      : 0;

    const current = await this.getExchangeRate(fromCode, toCode);
    const last = history[0];

    return {
      increases,
      decreases,
      avgChange: Math.round(avgChange * 100) / 100,
      firstRate: history[history.length - 1]?.newRate || current.rate,
      lastRate: last?.newRate || current.rate,
      currentRate: current.rate,
      totalChanges: history.length,
      period: `${days} days`,
    };
  }

  /**
   * Ghi lịch sử tỷ giá
   * @private
   */
  async _recordHistory(fromCode, toCode, oldRate, newRate, changeType = 'init', source = 'manual') {
    let rateChange = null;
    let finalChangeType = changeType;

    if (changeType === 'update' && oldRate !== null) {
      rateChange = ((newRate - oldRate) / oldRate) * 100;
      finalChangeType = rateChange > 0 ? 'increase' : 'decrease';
    }

    await ExchangeRateHistory.create({
      fromCode,
      toCode,
      oldRate,
      newRate,
      rateChange: rateChange ? Math.round(rateChange * 100) / 100 : null,
      changeType: finalChangeType,
      source,
      recordedAt: new Date(),
    });
  }

  /**
   * Clear cache
   * @private
   */
  _clearCache() {
    rateCache = {};
    cacheTimestamp = null;
  }
}

module.exports = new ExchangeRateService();
