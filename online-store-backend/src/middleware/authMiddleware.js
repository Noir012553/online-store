/**
 * Middleware - Xử lý request/response, xác thực, phân quyền
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { isTokenRevoked } = require('../utils/tokenBlacklist');
const { ACCESS_TOKEN_SECRET } = require('../utils/generateToken');
const { getMessage } = require('../i18n/messages');

/**
 * Middleware xác thực JWT token
 * Giải mã token từ Authorization header (Bearer token)
 * Gán thông tin user vào req.user để sử dụng ở các route sau
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

      if (decoded.type && decoded.type !== 'access') {
        res.status(401);
        throw new Error(getMessage(req.lang, 'auth-messages.invalidTokenType'));
      }

      // Check if token is revoked (logout)
      const revoked = await isTokenRevoked(token);
      if (revoked) {
        res.status(401);
        throw new Error(getMessage(req.lang, 'auth-messages.tokenRevoked'));
      }

      const user = await User.findById(decoded.id).select('-password');

      // Check if user exists and hasn't been soft-deleted
      if (!user || user.isDeleted) {
        res.status(401);
        throw new Error(getMessage(req.lang, 'auth-messages.userNotFound'));
      }

      req.user = user;
      return next();
    } catch (error) {
      res.status(401);
      throw new Error(getMessage(req.lang, 'auth-messages.notAuthorized'));
    }
  }

  if (!token) {
    res.status(401);
    throw new Error(getMessage(req.lang, 'auth-messages.noToken'));
  }
});

/**
 * Middleware kiểm tra quyền Admin
 * Chỉ cho phép người dùng có role = 'admin' hoặc 'super-admin'
 * Phải sử dụng sau middleware protect
 */
const admin = asyncHandler((req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super-admin')) {
    next();
  } else {
    res.status(401);
    throw new Error(getMessage(req.lang, 'auth-messages.notAdminAuth'));
  }
});

/**
 * Middleware kiểm tra quyền Super Admin
 * Chỉ cho phép người dùng có role = 'super-admin'
 * Phải sử dụng sau middleware protect
 */
const superAdmin = asyncHandler((req, res, next) => {
  if (req.user && req.user.role === 'super-admin') {
    next();
  } else {
    res.status(401);
    throw new Error(getMessage(req.lang, 'auth-messages.notSuperAdminAuth'));
  }
});

/**
 * Middleware kiểm tra quyền người dùng
 * Cho phép người dùng có role khớp với các role được chỉ định
 * Phải sử dụng sau middleware protect
 */
const authorize = (...roles) => {
  return asyncHandler((req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403);
      throw new Error(getMessage(req.lang, 'auth-messages.notAuthorized'));
    }
  });
};

module.exports = { protect, admin, superAdmin, authorize };
