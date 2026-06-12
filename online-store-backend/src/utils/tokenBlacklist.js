const jwt = require('jsonwebtoken');
const TokenBlacklist = require('../models/TokenBlacklist');

/**
 * Thêm token vào blacklist (khi logout)
 * @param {String} token - JWT token
 * @param {String} userId - User ID
 * @param {String} reason - Lý do revoke (logout, password-change, etc.)
 */
const revokeToken = async (token, userId, reason = 'logout') => {
  try {
    // Giải mã token để lấy expiration time
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.exp) {
      return null;
    }

    // Convert JWT exp (seconds) to milliseconds
    const expiresAt = new Date(decoded.exp * 1000);

    // Lưu token vào blacklist
    const blacklistedToken = await TokenBlacklist.create({
      token,
      userId,
      expiresAt,
      reason,
    });

    return blacklistedToken;
  } catch (error) {
    return null;
  }
};

/**
 * Kiểm tra xem token có bị revoke không
 * @param {String} token - JWT token
 * @returns {Boolean} true nếu token bị revoke, false nếu còn valid
 */
const isTokenRevoked = async (token) => {
  try {
    const blacklistedToken = await TokenBlacklist.findOne({ token });
    return !!blacklistedToken;
  } catch (error) {
    // Nếu có lỗi, vẫn cho phép request (fail open)
    return false;
  }
};

/**
 * Revoke tất cả token của user (khi password change, etc.)
 * @param {String} userId - User ID
 * @param {String} reason - Lý do revoke
 */
const revokeAllUserTokens = async (userId, reason = 'password-change') => {
  try {
    // Đây chỉ là placeholder - trong thực tế bạn cần track tất cả tokens của user
    // hoặc dùng Redis cache để lưu danh sách active tokens
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Cleanup expired blacklist entries (optional - TTL index sẽ tự động xóa)
 */
const cleanupExpiredTokens = async () => {
  try {
    const result = await TokenBlacklist.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result;
  } catch (error) {
    return null;
  }
};

module.exports = {
  revokeToken,
  isTokenRevoked,
  revokeAllUserTokens,
  cleanupExpiredTokens,
};
