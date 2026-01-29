/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const jwt = require('jsonwebtoken');

/**
 * Tạo JWT access token cho người dùng (short-lived)
 * @param {String} id - User ID
 * @returns {String} JWT access token có thời hạn 15 phút
 */
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

/**
 * Tạo JWT refresh token cho người dùng (long-lived)
 * @param {String} id - User ID
 * @returns {String} JWT refresh token có thời hạn 7 ngày
 */
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

/**
 * Tạo cả access token và refresh token
 * Dùng cho login/register
 * @param {String} id - User ID
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (id) => {
  return {
    accessToken: generateAccessToken(id),
    refreshToken: generateRefreshToken(id),
  };
};

// Keep old generateToken for backward compatibility
const generateToken = (id) => generateAccessToken(id);

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
};
