/**
 * CurrencyService - Service quản lý mệnh giá
 * Chức năng:
 * 1. CRUD mệnh giá (Currency)
 * 2. Validate mã tiền tệ
 * 3. Quản lý mệnh giá mặc định
 */

const Currency = require('../models/Currency');
const ExchangeRate = require('../models/ExchangeRate');

class CurrencyService {
  /**
   * Tạo mệnh giá mới
   * @param {Object} data - { code, name, symbol, position, decimalPlaces, isActive, isDefault, description }
   * @returns {Object} Currency object
   */
  async createCurrency(data) {
    // Nếu isDefault = true, cần set isDefault = false cho các mệnh giá khác
    if (data.isDefault) {
      await Currency.updateMany({ isDefault: true }, { isDefault: false });
    }

    const currency = new Currency(data);
    await currency.save();
    return currency;
  }

  /**
   * Lấy tất cả mệnh giá
   * @param {Object} filter - { isActive, isDefault }
   * @returns {Array} Danh sách Currency
   */
  async getCurrencies(filter = {}) {
    const query = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    if (filter.isDefault !== undefined) query.isDefault = filter.isDefault;

    return await Currency.find(query).sort({ isDefault: -1, code: 1 });
  }

  /**
   * Lấy mệnh giá theo code
   * @param {String} code - Mã tiền tệ (VND, USD, EUR...)
   * @returns {Object} Currency object
   */
  async getCurrencyByCode(code) {
    const currency = await Currency.findOne({ code: code.toUpperCase() });
    if (!currency) {
      const error = new Error('Currency does not exist');
      error.code = 'CURRENCY_NOT_FOUND';
      error.params = { code: code.toUpperCase() };
      throw error;
    }
    return currency;
  }

  /**
   * Lấy mệnh giá theo ID
   * @param {String} id - MongoDB ID
   * @returns {Object} Currency object
   */
  async getCurrencyById(id) {
    const currency = await Currency.findById(id);
    if (!currency) {
      const error = new Error('Currency does not exist');
      error.code = 'CURRENCY_NOT_FOUND';
      throw error;
    }
    return currency;
  }

  /**
   * Cập nhật mệnh giá
   * @param {String} id - MongoDB ID
   * @param {Object} updates - Dữ liệu cập nhật
   * @returns {Object} Currency object cập nhật
   */
  async updateCurrency(id, updates) {
    const currency = await Currency.findById(id);
    if (!currency) {
      const error = new Error('Currency does not exist');
      error.code = 'CURRENCY_NOT_FOUND';
      throw error;
    }

    // Không được phép xóa mệnh giá mặc định
    if (currency.isDefault && updates.isDefault === false) {
      // Kiểm tra xem có mệnh giá mặc định khác không
      const otherDefaults = await Currency.findOne({
        _id: { $ne: id },
        isDefault: true,
      });
      if (!otherDefaults && updates.isDefault !== true) {
        const error = new Error('At least one default currency is required');
        error.code = 'NO_DEFAULT_CURRENCY';
        throw error;
      }
    }

    // Nếu cập nhật isDefault = true, cần set isDefault = false cho các mệnh giá khác
    if (updates.isDefault === true) {
      await Currency.updateMany(
        { _id: { $ne: id }, isDefault: true },
        { isDefault: false }
      );
    }

    Object.assign(currency, updates);
    await currency.save();
    return currency;
  }

  /**
   * Xóa mệnh giá
   * @param {String} id - MongoDB ID
   */
  async deleteCurrency(id) {
    const currency = await Currency.findById(id);
    if (!currency) {
      const error = new Error('Currency does not exist');
      error.code = 'CURRENCY_NOT_FOUND';
      throw error;
    }

    // Không được xóa mệnh giá mặc định
    if (currency.isDefault) {
      const error = new Error('Cannot delete default currency');
      error.code = 'CANNOT_DELETE_DEFAULT_CURRENCY';
      throw error;
    }

    // Kiểm tra xem có exchange rate nào dùng mệnh giá này không
    const relatedRates = await ExchangeRate.findOne({
      $or: [{ fromCode: currency.code }, { toCode: currency.code }],
    });

    if (relatedRates) {
      const error = new Error('Cannot delete currency with related exchange rates');
      error.code = 'CURRENCY_HAS_RELATED_RATES';
      throw error;
    }

    await Currency.findByIdAndDelete(id);
  }

  /**
   * Lấy mệnh giá mặc định
   * @returns {Object} Currency object
   */
  async getDefaultCurrency() {
    const currency = await Currency.findOne({ isDefault: true });
    if (!currency) {
      const error = new Error('No default currency found');
      error.code = 'NO_DEFAULT_CURRENCY';
      throw error;
    }
    return currency;
  }

  /**
   * Kiểm tra mệnh giá tồn tại
   * @param {String} code - Mã tiền tệ
   * @returns {Boolean}
   */
  async currencyExists(code) {
    const currency = await Currency.findOne({ code: code.toUpperCase() });
    return !!currency;
  }

  /**
   * Đếm tổng mệnh giá
   * @returns {Number}
   */
  async countCurrencies(filter = {}) {
    const query = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    return await Currency.countDocuments(query);
  }
}

module.exports = new CurrencyService();
