const mongoose = require('mongoose');

/**
 * Schema để lưu danh sách token đã bị revoke (logout)
 * 
 * @field {String} token - JWT token đã bị revoke
 * @field {String} userId - ID của user (để dễ dàng tra cứu)
 * @field {Date} expiresAt - Thời điểm token hết hạn (dùng cho TTL index)
 * @field {Date} revokedAt - Thời điểm token bị revoke (tức lúc logout)
 * @field {String} reason - Lý do revoke (logout, password-change, etc.)
 * 
 * @index {expiresAt} - TTL index để tự động xóa expired tokens sau 7 ngày
 */
const TokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true, // Để tìm kiếm nhanh
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true, // Để tìm tất cả tokens của 1 user
  },
  revokedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index - tự động xóa sau expiry time
  },
  reason: {
    type: String,
    enum: ['logout', 'password-change', 'security', 'manual'],
    default: 'logout',
  },
});

module.exports = mongoose.model('TokenBlacklist', TokenBlacklistSchema);
