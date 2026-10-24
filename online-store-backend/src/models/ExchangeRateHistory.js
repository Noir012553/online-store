/**
 * Model lưu lịch sử tỷ giá quy đổi
 * Tracking mỗi lần tỷ giá thay đổi để phân tích xu hướng
 */

const mongoose = require('mongoose');

/**
 * Schema cho lịch sử tỷ giá
 *
 * @field {String} fromCode - Mã tiền tệ nguồn
 * @field {String} toCode - Mã tiền tệ đích
 * @field {Number} oldRate - Tỷ giá cũ (nếu là update)
 * @field {Number} newRate - Tỷ giá mới
 * @field {Number} rateChange - Thay đổi % ((newRate - oldRate) / oldRate * 100)
 * @field {String} changeType - 'increase' | 'decrease' | 'init'
 * @field {String} source - Nguồn tỷ giá (manual, api, etc.)
 * @field {Date} recordedAt - Thời điểm ghi nhận
 */
const exchangeRateHistorySchema = mongoose.Schema(
  {
    fromCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      index: true,
    },
    toCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      index: true,
    },
    oldRate: {
      type: Number,
      default: null,
    },
    newRate: {
      type: Number,
      required: true,
      min: 0.0000001,
    },
    rateChange: {
      type: Number,
      default: null, // % thay đổi
    },
    changeType: {
      type: String,
      enum: ['increase', 'decrease', 'init'],
      default: 'init',
    },
    source: {
      type: String,
      enum: ['manual', 'api', 'import'],
      default: 'manual',
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // Dùng recordedAt thay vì createdAt
  }
);

// Index compound để tìm lịch sử nhanh
exchangeRateHistorySchema.index({ fromCode: 1, toCode: 1, recordedAt: -1 });
exchangeRateHistorySchema.index({ recordedAt: -1 });

const ExchangeRateHistory = mongoose.model(
  'ExchangeRateHistory',
  exchangeRateHistorySchema
);

module.exports = ExchangeRateHistory;
