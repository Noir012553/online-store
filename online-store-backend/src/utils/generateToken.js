/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}_refresh` : undefined);

if (!ACCESS_TOKEN_SECRET) {
  throw new Error('JWT access secret is not configured');
}

if (!REFRESH_TOKEN_SECRET) {
  throw new Error('JWT refresh secret is not configured');
}

/**
 * Tạo JWT access token cho người dùng (short-lived)
 * @param {String} id - User ID
 * @returns {String} JWT access token có thời hạn 60 phút
 */
const generateAccessToken = (id) => {
  return jwt.sign({ id, type: 'access' }, ACCESS_TOKEN_SECRET, {
    expiresIn: '60m',
  });
};

/**
 * Tạo JWT refresh token cho người dùng (long-lived)
 * @param {String} id - User ID
 * @returns {Object} refresh token payload metadata
 */
const generateRefreshToken = (id) => {
  const jti = crypto.randomUUID();

  return {
    refreshToken: jwt.sign({ id, type: 'refresh', jti }, REFRESH_TOKEN_SECRET, {
      expiresIn: '7d',
    }),
    refreshTokenId: jti,
  };
};

/**
 * Tạo cả access token và refresh token
 * Dùng cho login/register
 * @param {String} id - User ID
 * @returns {Object} { accessToken, refreshToken, refreshTokenId }
 */
const generateTokenPair = (id) => {
  const { refreshToken, refreshTokenId } = generateRefreshToken(id);

  return {
    accessToken: generateAccessToken(id),
    refreshToken,
    refreshTokenId,
  };
};

// Keep old generateToken for backward compatibility
const generateToken = (id) => generateAccessToken(id);

module.exports = {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
};
