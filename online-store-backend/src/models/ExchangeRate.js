/**
 * Model quản lý tỷ giá quy đổi
 * Lưu trữ tỷ giá giữa các mệnh giá (VND->USD, USD->EUR, v.v.)
 */

const mongoose = require('mongoose');

/**
 * Schema cho tỷ giá quy đổi
 *
 * @field {String} fromCode - Mã tiền tệ nguồn (ref: Currency.code)
 * @field {String} toCode - Mã tiền tệ đích (ref: Currency.code)
 * @field {Number} rate - Tỷ giá (1 fromCode = ? toCode)
 * @field {String} source - Nguồn tỷ giá (manual, api, etc.)
 * @field {Boolean} isActive - Tỷ giá có hoạt động không
 * @field {Date} updatedAt - Lần cập nhật gần nhất tỷ giá
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {fromCode, toCode} - Tìm tỷ giá nhanh
 * @constraint - fromCode != toCode
 */
const exchangeRateSchema = mongoose.Schema(
  {
    fromCode: {
      type: String,
      required: [true, 'exchangeRate.fromCode.required'],
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    toCode: {
      type: String,
      required: [true, 'exchangeRate.toCode.required'],
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    rate: {
      type: Number,
      required: [true, 'exchangeRate.rate.required'],
      min: [0.0000001, 'exchangeRate.rate.too_small'],
      max: [999999999, 'exchangeRate.rate.too_large'],
    },
    source: {
      type: String,
      enum: {
        values: ['manual', 'api', 'import'],
        message: 'exchangeRate.source.invalid',
      },
      default: 'manual',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rateUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Validation: fromCode != toCode
exchangeRateSchema.pre('save', async function () {
  if (this.fromCode === this.toCode) {
    throw new Error('exchangeRate.codes.must_differ');
  }
});

// Unique compound index: fromCode + toCode (chỉ một tỷ giá cho mỗi cặp)
exchangeRateSchema.index({ fromCode: 1, toCode: 1 }, { unique: true });
exchangeRateSchema.index({ fromCode: 1 });
exchangeRateSchema.index({ toCode: 1 });
exchangeRateSchema.index({ isActive: 1 });
exchangeRateSchema.index({ rateUpdatedAt: 1 });

const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);

module.exports = ExchangeRate;
