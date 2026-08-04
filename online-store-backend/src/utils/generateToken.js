/**
 * Utility Functions - Hàm helper cho các chức năng chung
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const tokenConfig = require('../config/tokenConfig');

const {
  algorithm: JWT_ALGORITHM,
  access: { secret: ACCESS_TOKEN_SECRET, expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  refresh: {
    secret: REFRESH_TOKEN_SECRET,
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    cookieMaxAgeMs: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  },
} = tokenConfig;

/**
 * Tạo JWT access token cho người dùng (short-lived)
 * @param {String} id - User ID
 * @returns {String} JWT access token có thời hạn 60 phút
 */
const generateAccessToken = (id) => {
  return jwt.sign({ id, type: 'access' }, ACCESS_TOKEN_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
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
      algorithm: JWT_ALGORITHM,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
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
  JWT_ALGORITHM,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
};
