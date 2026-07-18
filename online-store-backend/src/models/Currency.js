/**
 * Model quản lý mệnh giá
 * Lưu trữ thông tin các loại tiền tệ (VND, USD, EUR, v.v.)
 */

const mongoose = require('mongoose');

/**
 * Schema cho mệnh giá
 *
 * @field {String} code - Mã tiền tệ (VND, USD, EUR) - UNIQUE, UPPERCASE
 * @field {String} name - Tên mệnh giá (Việt Nam Đồng, US Dollar...)
 * @field {String} symbol - Ký hiệu (₫, $, €...)
 * @field {String} position - Vị trí ký hiệu (before, after)
 * @field {Number} decimalPlaces - Số chữ số thập phân (VND = 0, USD = 2)
 * @field {Boolean} isActive - Mệnh giá có hoạt động không
 * @field {Boolean} isDefault - Mệnh giá mặc định (chỉ có 1 là true)
 * @field {String} description - Mô tả
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {code} - Tìm currency theo code
 */
const currencySchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'currency.code.required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [3, 'currency.code.too_short'],
      maxlength: [3, 'currency.code.too_long'],
      match: /^[A-Z]{3}$/,
    },
    name: {
      type: String,
      required: [true, 'currency.name.required'],
      trim: true,
      minlength: [3, 'currency.name.too_short'],
      maxlength: [100, 'currency.name.too_long'],
    },
    symbol: {
      type: String,
      required: [true, 'currency.symbol.required'],
      trim: true,
      maxlength: [5, 'currency.symbol.too_long'],
    },
    position: {
      type: String,
      enum: {
        values: ['before', 'after'],
        message: 'currency.position.invalid',
      },
      default: 'after',
    },
    decimalPlaces: {
      type: Number,
      default: 2,
      min: [0, 'currency.decimalPlaces.negative'],
      max: [4, 'currency.decimalPlaces.too_large'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      maxlength: [500, 'currency.description.too_long'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (note: code index is created automatically by unique constraint)
currencySchema.index({ isActive: 1 });
currencySchema.index({ isDefault: 1 });

const Currency = mongoose.model('Currency', currencySchema);

module.exports = Currency;
