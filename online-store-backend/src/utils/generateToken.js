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
const generateAccessToken = (id, authVersion = '0') => {
  return jwt.sign({ id, type: 'access', authVersion }, ACCESS_TOKEN_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
};

/**
 * Tạo JWT refresh token cho người dùng (long-lived)
 * @param {String} id - User ID
 * @param {String|null} role - User role (embedded in refresh token for cookie policy)
 * @returns {Object} refresh token payload metadata
 */
const generateRefreshToken = (id, role = null, authVersion = '0') => {
  const jti = crypto.randomUUID();

  return {
    refreshToken: jwt.sign({ id, type: 'refresh', jti, authVersion, ...(role ? { role } : {}) }, REFRESH_TOKEN_SECRET, {
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
 * @param {String|null} role - User role (embedded in refresh token for cookie policy)
 * @returns {Object} { accessToken, refreshToken, refreshTokenId }
 */
const generateTokenPair = (id, role = null, authVersion = '0') => {
  const { refreshToken, refreshTokenId } = generateRefreshToken(id, role, authVersion);

  return {
    accessToken: generateAccessToken(id, authVersion),
    refreshToken,
    refreshTokenId,
  };
};

// Keep old generateToken for backward compatibility
const generateToken = (id, authVersion = '0') => generateAccessToken(id, authVersion);

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
