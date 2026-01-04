/**
 * Model địa điểm Việt Nam
 * Lưu trữ tỉnh/thành phố, quận/huyện, phường/xã
 * (Hiện tại dữ liệu từ external API, model dùng cho caching nếu cần)
 */

const mongoose = require('mongoose');

/**
 * Schema cho dữ liệu địa điểm (Provinces/Districts/Wards)
 * Ghi chú: Hiện tại sử dụng live API từ provinces.open-api.vn
 * Schema này là reference để lưu trữ nếu cần cache dữ liệu
 */
const locationSchema = mongoose.Schema(
  {
    country: {
      type: String,
      required: true,
    },
    provinces: [
      {
        name: { type: String, required: true },
        districts: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
