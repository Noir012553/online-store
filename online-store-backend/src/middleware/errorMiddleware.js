/**
 * Middleware xử lý 404 Not Found
 * Được gọi khi request đến route không tồn tại
 * Chuyển sang error handler middleware
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
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
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  let errorDetails = null;

  // Log lỗi chi tiết (cho debugging trên Cloudflare Tunnel)
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    status: statusCode,
    message,
    path: req.originalUrl,
    method: req.method,
    errorName: err.name,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  // Log ra console để có thể xem trên Cloudflare Tunnel logs
  console.error('[ERROR]', JSON.stringify(errorLog, null, 2));

  // Xử lý lỗi E11000 (duplicate key) từ MongoDB
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already in use`;
  }

  // Xử lý lỗi validation từ Mongoose
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map(e => e.message);
    message = errors.join(', ');
  }

  // Xử lý lỗi timeout database
  if (message.includes('timed out') || message.includes('timeout')) {
    statusCode = 503; // Service Unavailable
    message = 'Kết nối database timeout - vui lòng thử lại sau';
  }

  res.status(statusCode);

  // Trong development mode: trả về chi tiết error để dễ debug
  if (process.env.NODE_ENV === 'development') {
    errorDetails = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
    };
  }

  res.json({
    success: false,
    error: message,
    ...(errorDetails && { details: errorDetails }),
    timestamp: new Date().toISOString(),
  });
};

module.exports = { notFound, errorHandler };
