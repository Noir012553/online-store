/**
 * Middleware - Xử lý request/response, xác thực, phân quyền
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

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
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      // Check if user exists and hasn't been soft-deleted
      if (!user || user.isDeleted) {
        res.status(401);
        throw new Error('User not found or account has been deleted');
      }

      req.user = user;
      return next();
    } catch (error) {
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
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
    throw new Error('Not authorized as an admin');
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
    throw new Error('Not authorized as a super admin');
  }
});

module.exports = { protect, admin, superAdmin };
