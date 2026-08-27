/**
 * Middleware xử lý 404 Not Found
 * Được gọi khi request đến route không tồn tại
 * Chuyển sang error handler middleware
 */
const { getMessage } = require('../i18n/messages');

const API_DEBUG_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.API_DEBUG || '').toLowerCase());

const sendApiError = (res, req, statusCode, code, messageKey = 'common.error_request_title', params = {}) => {
  const message = getMessage(req.lang || req.query?.lang || req.body?.lang, messageKey, params);
  return res.status(statusCode).json({
    success: false,
    code,
    params,
    message,
    error: message,
  });
};

const notFound = (req, res, next) => {
  const error = new Error(getMessage(req.lang, 'common.not_found_title'));
  error.errorCode = 'ROUTE_NOT_FOUND';
  error.exposeMessage = true;
  res.status(404);
  next(error);
};

/**
 * Middleware xử lý lỗi toàn cục
 * Trả về JSON response với error message
 * Trong development mode: bao gồm stack trace
 * Trong production mode: chỉ message mà thôi
 *
 * Logging được gửi tới stderr để dễ debug trên Cloudflare Tunnel
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || (res.statusCode === 200 ? 500 : res.statusCode);
  const applicationCode = err.errorCode || (typeof err.code === 'string' ? err.code : null);
  let code = applicationCode || 'REQUEST_FAILED';
  let message = applicationCode && err.exposeMessage
    ? err.message
    : getMessage(req.lang, 'common.error_request_title');
  let params = err.params || {};

  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    params = { field: Object.keys(err.keyPattern || {})[0] };
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_FAILED';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_RESOURCE_ID';
  } else if (err.message?.includes('timed out') || err.message?.includes('timeout')) {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = getMessage(req.lang, 'common.error_server_desc');
  }

  if (API_DEBUG_ENABLED) {
    console.error('[API_DEBUG] request:error', {
      requestId: req.apiRequestId,
      method: req.method,
      path: req.originalUrl,
      query: req.query,
      featuredDebugStage: req.featuredDebugStage,
      statusCode,
      code,
      errorName: err.name,
      message: err.message,
      stack: err.stack,
    });
  }

  if (process.env.NODE_ENV === 'development' && statusCode !== 401 && statusCode !== 403) {
    console.error('[ErrorHandler]', err);
  }

  res.status(statusCode).json({
    success: false,
    code,
    params,
    message,
    error: message,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { notFound, errorHandler, sendApiError };
