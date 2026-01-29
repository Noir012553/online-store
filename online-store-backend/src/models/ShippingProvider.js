/**
 * Model nhà vận chuyển
 * Lưu trữ thông tin các carrier
 * Bao gồm API credentials
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Schema cho nhà vận chuyển
 *
 * @field {String} name - Tên nhà vận chuyển
 * @field {String} code - Mã code duy nhất (duy nhất, bắt buộc)
 * @field {String} logo - URL logo nhà vận chuyển
 * @field {String} description - Mô tả về nhà vận chuyển
 * @field {Number} basePrice - Giá cơ bản (VND) - deprecated, sử dụng API thực
 * @field {Array} serviceTypes - Danh sách dịch vụ hỗ trợ:
 *   - {String} code - Mã dịch vụ (e.g., "standard", "express")
 *   - {String} name - Tên dịch vụ
 *   - {Number} estimatedDays - Số ngày giao hàng dự kiến (e.g., 2-3 ngày)
 * @field {String} apiUrl - URL base API của nhà vận chuyển
 * @field {String} apiKey - API Key (mã hóa trước khi lưu)
 * @field {String} apiKeyEncrypted - API Key encrypted (private)
 * @field {String} token - Token API (nếu cần)
 * @field {Boolean} isActive - Kích hoạt/vô hiệu hóa nhà vận chuyển
 * @field {Date} lastSyncProvince - Thời điểm sync lần cuối từ GHN
 * @field {Boolean} isDeleted - Cờ xóa mềm
 * @field {Date} createdAt - Thời điểm tạo (auto)
 * @field {Date} updatedAt - Thời điểm cập nhật (auto)
 *
 * @index {code, isDeleted} - Tìm provider theo code
 */
const ShippingProviderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    basePrice: {
      type: Number,
      default: 0,
    },
    serviceTypes: [
      {
        code: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        estimatedDays: {
          type: String,
          default: '2-3',
        },
      },
    ],
    apiUrl: {
      type: String,
      required: true,
      trim: true,
    },
    apiKey: {
      type: String,
      required: true,
      select: false, // Không lấy theo mặc định để bảo mật
    },
    token: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSyncProvince: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ShippingProviderSchema.index({ code: 1, isDeleted: 1 });

// Pre-save: Kiểm tra xem apiKey có thay đổi, không cần mã hóa vì MongoDB đã secure
// Trong production, cân nhắc sử dụng field-level encryption
ShippingProviderSchema.pre('save', async function() {
  // Validate required fields khi create
  if (this.isNew && (!this.apiUrl || !this.apiKey)) {
    throw new Error('apiUrl và apiKey là bắt buộc');
  }
});

/**
 * Instance method: Lấy API Key (decrypt nếu cần)
 */
ShippingProviderSchema.methods.getApiKey = function() {
  return this.apiKey;
};

/**
 * Static method: Lấy provider by code
 */
ShippingProviderSchema.statics.getByCode = function(code) {
  return this.findOne({ code: code.toLowerCase(), isDeleted: false, isActive: true }).select('+apiKey');
};

const ShippingProvider = mongoose.model('ShippingProvider', ShippingProviderSchema);

module.exports = ShippingProvider;
