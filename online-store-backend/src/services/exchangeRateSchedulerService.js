/**
 * ExchangeRateSchedulerService - Tự động cập nhật tỷ giá
 * Tích hợp với các API bên ngoài (Fixer.io, OpenExchangeRates, etc.)
 * Cập nhật tỷ giá hàng ngày tự động
 */

const ExchangeRate = require('../models/ExchangeRate');
const ExchangeRateHistory = require('../models/ExchangeRateHistory');

const DEFAULT_RATES = {
  VND_USD: 0.000041,
  USD_VND: 24390,
  USD_EUR: 0.92,
  EUR_USD: 1.0870,
  VND_EUR: 0.00003772,
  EUR_VND: 26521.74,
  EUR_SEK: 10.85,
  SEK_EUR: 0.0922,
};

class ExchangeRateSchedulerService {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.errorCount = 0;
    this.maxErrorsBeforeAlert = 3;
  }

  /**
   * Khởi động scheduler
   * @param {Object} options - { interval, externalApi }
   */
  async startScheduler(options = {}) {
    const interval = options.interval || 24 * 60 * 60 * 1000; // 24 giờ
    const externalApi = options.externalApi || null;

    if (this.isRunning) {
      console.warn('[ExchangeRateScheduler] Scheduler đã đang chạy');
      return;
    }

    this.isRunning = true;
    console.log('[ExchangeRateScheduler] Bắt đầu scheduler (interval: ' + interval / 1000 + 's)');

    try {
      await this.updateExchangeRates(externalApi);
    } catch (err) {
      this.isRunning = false;
      this.errorCount++;
      console.error('[ExchangeRateScheduler] Lỗi cập nhật tỷ giá:', err);
      throw err;
    }

    // Lên lịch chạy định kỳ
    this.schedulerId = setInterval(async () => {
      try {
        await this.updateExchangeRates(externalApi);
        this.errorCount = 0; // Reset error count nếu thành công
      } catch (err) {
        console.error('[ExchangeRateScheduler] Lỗi cập nhật tỷ giá:', err);
        this.errorCount++;

        // Cảnh báo nếu lỗi quá nhiều lần
        if (this.errorCount >= this.maxErrorsBeforeAlert) {
          console.warn(
            `[ExchangeRateScheduler] CẢNH BÁO: Lỗi cập nhật tỷ giá ${this.errorCount} lần liên tiếp`
          );
        }
      }
    }, interval);
  }

  /**
   * Dừng scheduler
   */
  stopScheduler() {
    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.isRunning = false;
      console.log('[ExchangeRateScheduler] Scheduler đã dừng');
    }
  }

  /**
   * Cập nhật tất cả tỷ giá
   * @param {String} externalApi - API để fetch tỷ giá (optional)
   */
  async updateExchangeRates(externalApi = null) {
    try {
      this.lastRunTime = new Date();
      console.log('[ExchangeRateScheduler] Bắt đầu cập nhật tỷ giá...');

      let rates;
      if (externalApi === 'fixer') {
        rates = await this._fetchFromFixerIO();
      } else if (externalApi === 'exchangerate-api') {
        rates = await this._fetchFromExchangeRateAPI();
      } else {
        // Cập nhật từ tỷ giá mặc định (demo purposes)
        rates = this._getDefaultRates();
      }

      // Cập nhật database
      let updatedCount = 0;
      for (const [pair, newRate] of Object.entries(rates)) {
        const [fromCode, toCode] = pair.split('_');
        updatedCount += await this._updateRate(fromCode, toCode, newRate, externalApi || 'manual');
      }

      console.log(`[ExchangeRateScheduler] Cập nhật thành công: ${updatedCount} tỷ giá`);
      return updatedCount;
    } catch (err) {
      console.error('[ExchangeRateScheduler] Lỗi cập nhật:', err);
      throw err;
    }
  }

  /**
   * Cập nhật một tỷ giá
   * @private
   */
  async _updateRate(fromCode, toCode, newRate, source) {
    try {
      const existing = await ExchangeRate.findOne({ fromCode, toCode });

      if (!existing) {
        // Tạo mới nếu chưa tồn tại
        const er = new ExchangeRate({
          fromCode,
          toCode,
          rate: newRate,
          source,
          isActive: true,
        });
        await er.save();

        // Ghi lịch sử (init)
        await ExchangeRateHistory.create({
          fromCode,
          toCode,
          oldRate: null,
          newRate,
          rateChange: null,
          changeType: 'init',
          source,
          recordedAt: new Date(),
        });

        return 1;
      }

      // Nếu tỷ giá thay đổi
      if (existing.rate !== newRate) {
        const oldRate = existing.rate;
        const rateChange = ((newRate - oldRate) / oldRate) * 100;
        const changeType = rateChange > 0 ? 'increase' : 'decrease';

        existing.rate = newRate;
        existing.source = source;
        existing.rateUpdatedAt = new Date();
        await existing.save();

        // Ghi lịch sử
        await ExchangeRateHistory.create({
          fromCode,
          toCode,
          oldRate,
          newRate,
          rateChange: Math.round(rateChange * 100) / 100,
          changeType,
          source,
          recordedAt: new Date(),
        });

        console.log(`[ExchangeRateScheduler] ${fromCode}->${toCode}: ${oldRate} => ${newRate} (${rateChange > 0 ? '+' : ''}${Math.round(rateChange * 100) / 100}%)`);
        return 1;
      }

      return 0;
    } catch (err) {
      console.error(`[ExchangeRateScheduler] Lỗi cập nhật ${fromCode}->${toCode}:`, err);
      return 0;
    }
  }

  /**
   * Fetch từ Fixer.io API
   * @private
   */
  async _fetchFromFixerIO() {
    const apiKey = process.env.FIXER_API_KEY;
    if (!apiKey) {
      throw new Error('FIXER_API_KEY không được cấu hình');
    }

    const response = await fetch(`https://api.fixer.io/latest?access_key=${apiKey}&base=EUR`);
    const data = await response.json();

    if (!data.success) {
      throw new Error('Fixer.io API error: ' + data.error?.info);
    }

    // Convert từ EUR base sang các tỷ giá cần
    const rates = {};
    const eurRates = data.rates;

    // EUR -> USD
    if (eurRates.USD) {
      rates.EUR_USD = eurRates.USD;
      rates.USD_EUR = 1 / eurRates.USD;
    }

    // Nếu có USD rate, tính VND
    if (eurRates.VND) {
      rates.EUR_VND = eurRates.VND;
      rates.VND_EUR = 1 / eurRates.VND;
    }

    // SEK rates
    if (eurRates.SEK) {
      rates.EUR_SEK = eurRates.SEK;
      rates.SEK_EUR = 1 / eurRates.SEK;
    }

    return rates;
  }

  /**
   * Fetch từ ExchangeRate-API
   * @private
   */
  async _fetchFromExchangeRateAPI() {
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    if (!apiKey) {
      throw new Error('EXCHANGERATE_API_KEY không được cấu hình');
    }

    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
    );
    const data = await response.json();

    if (data.result === 'error') {
      throw new Error('ExchangeRate-API error: ' + data['error-type']);
    }

    const rates = {};
    const usdRates = data.conversion_rates;

    // USD -> currencies
    if (usdRates.VND) {
      rates.USD_VND = usdRates.VND;
      rates.VND_USD = 1 / usdRates.VND;
    }

    if (usdRates.EUR) {
      rates.USD_EUR = usdRates.EUR;
      rates.EUR_USD = 1 / usdRates.EUR;
    }

    if (usdRates.SEK) {
      rates.USD_SEK = usdRates.SEK;
      rates.SEK_USD = 1 / usdRates.SEK;
    }

    return rates;
  }

  /**
   * Lấy tỷ giá mặc định
   * @private
   */
  _getDefaultRates() {
    return DEFAULT_RATES;
  }

  /**
   * Lấy trạng thái scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      errorCount: this.errorCount,
      uptime: this.schedulerId ? 'running' : 'stopped',
    };
  }

  /**
   * Cập nhật một tỷ giá thủ công
   * @param {String} fromCode
   * @param {String} toCode
   * @param {Number} newRate
   */
  async updateRateManually(fromCode, toCode, newRate) {
    return await this._updateRate(fromCode, toCode, newRate, 'manual');
  }
}

module.exports = new ExchangeRateSchedulerService();
