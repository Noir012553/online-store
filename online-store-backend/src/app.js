/**
 * Express Application Entry Point - Server chính cho hệ thống e-commerce laptop
 * Quản lý middleware, kết nối database, định tuyến API, xử lý lỗi toàn cục
 * Chạy trên port 5000 (hoặc PORT env)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const http = require('http');

// ==================== Import Routes ====================
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const couponRoutes = require('./routes/couponRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const addressRoutes = require('./routes/addressRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const shippingProviderRoutes = require('./routes/shippingProviderRoutes');
const shipmentRoutes = require('./routes/shipmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { globalLimiter } = require('./middleware/rateLimitMiddleware');
const paymentController = require('./controllers/paymentController');
const asyncHandler = require('express-async-handler');
const { socketHandler } = require('./socket/socketHandler');

// ==================== Initialize Express App ====================
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Log startup config immediately
console.log('[INIT] Starting backend...');
console.log(`[INIT] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[INIT] PORT: ${PORT}`);
console.log(`[INIT] MONGO_URI: ${MONGO_URI ? 'SET' : 'NOT_SET'}`);

/**
 * Express Application Entry Point
 *
 * Quản lý:
 * - Cấu hình middleware
 * - Kết nối database MongoDB
 * - Định tuyến API
 * - Xử lý lỗi toàn cục
 *
 * Cấu trúc:
 * GET /                     - Health check
 * /api/users               - User authentication & management
 * /api/products            - Product CRUD operations
 * /api/orders              - Order management
 * /api/customers           - Customer management (upsert by phone)
 * /api/suppliers           - Supplier management
 * /api/categories          - Category management
 * /api/reviews             - Product reviews
 * /api/coupons             - Discount coupon management
 */

// ==================== Middleware Configuration ====================

/**
 * Security Headers Middleware
 * Thêm các security headers để bảo vệ backend
 * - Strict-Transport-Security: Bắt buộc HTTPS
 * - X-Content-Type-Options: Ngăn MIME type sniffing
 * - X-Frame-Options: Ngăn clickjacking
 * - X-XSS-Protection: Bảo vệ chống XSS
 * - Referrer-Policy: Kiểm soát referrer info
 */
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/**
 * CORS Middleware
 * Cho phép frontend từ các domain khác gọi API (Cross-Origin Requests)
 *
 * Allowed Origins:
 * - Production: https://manln.online (Frontend URL)
 * - Development: http://localhost:3000
 * - Backend domains are NOT needed (Next.js proxies requests, no direct CORS)
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins for CORS requests
    const allowedOrigins = [
      'http://localhost:3000',
      'https://manln.online',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow if:
    // 1. No origin (same-site or non-browser requests)
    // 2. In allowed list
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

/**
 * Cookie Parser Middleware
 * Cho phép Express đọc httpOnly cookies từ request headers
 * Cần thiết để refresh token được lưu trong secure cookies
 */
app.use(cookieParser());

/**
 * JSON Parser Middleware
 * Cho phép Express đọc JSON từ request body
 * Hỗ trợ request headers: Content-Type: application/json
 */
app.use(express.json());

/**
 * URL-Encoded Parser Middleware
 * Cho phép Express đọc form data từ request body
 * Hỗ trợ request headers: Content-Type: application/x-www-form-urlencoded
 */
app.use(express.urlencoded({ extended: true }));

/**
 * Trust Proxy Middleware
 * Cloudflare Tunnel kết nối từ localhost (loopback)
 * Nên ta tin tưởng loopback proxy để lấy đúng IP từ cf-connecting-ip header
 */
app.set('trust proxy', 'loopback');

/**
 * Static Files Middleware
 * Cho phép truy cập file ảnh từ folder uploads
 * Ví dụ: http://localhost:5000/uploads/image.jpg
 */
app.use('/uploads', express.static('uploads'));

/**
 * Global Rate Limiter Middleware
 * Áp dụng cho tất cả /api/* routes để ngăn DoS/scraping
 * Limit: 100 requests per 15 minutes per IP
 */
app.use('/api/', globalLimiter);

// ==================== Database Connection ====================

/**
 * Kết nối MongoDB sử dụng Mongoose với retry logic
 * - Connection string từ environment variable MONGO_URI
 * - Sử dụng mặc định trong tests, ngoài production dùng MongoDB Atlas
 * - Retry logic với exponential backoff cho connection failures
 */
const mongooseOptions = {
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 8000,  // Reduce timeout to 8 seconds
  socketTimeoutMS: 45000,
  connectTimeoutMS: 8000,           // Reduce timeout to 8 seconds
  retryWrites: true,
  w: 'majority',
  family: 4,
};

let connectionAttempts = 0;
const maxConnectionAttempts = 3;  // Reduce max attempts to 3 (total 8+16+32 = 56 seconds max wait)

const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      console.error('[CRITICAL] MONGO_URI environment variable is not set');
      console.error('[HELP] Set MONGO_URI via Cloudflare Tunnel environment variables or in .env file');
      return;
    }

    await mongoose.connect(MONGO_URI, mongooseOptions);
    connectionAttempts = 0;
    console.log('[DB] MongoDB connected successfully');
  } catch (err) {
    connectionAttempts++;
    const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);

    // Log connection error with details
    console.error(`[DB_ERROR] Connection attempt ${connectionAttempts} failed:`, {
      error: err.message,
      nextRetryIn: `${delay}ms`,
      uri: MONGO_URI ? '***' : 'NOT_SET',
    });

    if (connectionAttempts < maxConnectionAttempts) {
      console.log(`[DB] Retrying connection in ${delay}ms...`);
      setTimeout(connectDB, delay);
    } else {
      console.error('[CRITICAL] Failed to connect to MongoDB after maximum attempts');
      console.error('[HELP] Check MONGO_URI and MongoDB availability');
    }
  }
};

connectDB();

mongoose.connection.on('disconnected', () => {
  console.warn('[DB_WARN] MongoDB disconnected, attempting reconnect...');
  setTimeout(connectDB, 3000);
});

mongoose.connection.on('connected', () => {
  console.log('[DB] MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB_ERROR] Mongoose error:', err.message);
});


// ==================== Routes Setup ====================

/**
 * Favicon Handler
 * GET /favicon.ico - Trả về empty response để tránh lỗi 404
 * Trình duyệt tự động yêu cầu favicon, không ghi log lỗi
 */
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // 204 No Content
});

/**
 * Health Check Route
 * GET / - Kiểm tra server có chạy không
 * Response: { message: "Laptop Store Backend API is running!" }
 *
 * Used by Cloudflare Tunnel to verify container is alive
 */
app.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }[dbState] || 'unknown';

  res.status(200).json({
    message: 'Laptop Store Backend API is running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: dbStatus,
      connected: dbState === 1,
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Payment Webhook Routes - Root Level
 * VNPAY gọi lại: /vnpay-api/webhook/vnpay?vnp_Amount=...&vnp_ResponseCode=...
 * Route này PHẢI ở trước /api/* routes để tránh bị catch bởi global /api/* rate limiter
 *
 * Routes:
 * - GET/POST /vnpay-api/webhook/vnpay - VNPAY Callback (IPN)
 * - GET/POST /api/payments/webhook/vnpay - Alias (qua /api/payments)
 */
// VNPAY Callback endpoint - phải ở root level, không qua /api/payments
app.all('/vnpay-api/webhook/:gateway', asyncHandler(paymentController.handleWebhook));

/**
 * API Routes Mounting
 * Tất cả routes sử dụng /api/... prefix
 */
app.use('/api/users', userRoutes);           // User authentication & admin
app.use('/api/products', productRoutes);     // Product management
app.use('/api/orders', orderRoutes);         // Order processing
app.use('/api/payments', paymentRoutes);     // Payment gateway integration (VNPAY, MoMo, Stripe...)
app.use('/api/customers', customerRoutes);   // Customer management
app.use('/api/suppliers', supplierRoutes);   // Supplier management
app.use('/api/categories', categoryRoutes);  // Category management
app.use('/api/reviews', reviewRoutes);       // Product reviews
app.use('/api/coupons', couponRoutes);       // Coupon system
app.use('/api/analytics', analyticsRoutes);          // Dashboard analytics (optimized)
app.use('/api/addresses', addressRoutes);            // Customer addresses (shipping)
app.use('/api/shipping', shippingRoutes);            // Multi-carrier shipping integration
app.use('/api/shipping-providers', shippingProviderRoutes); // Shipping provider config (admin)
app.use('/api/shipments', shipmentRoutes);  // Shipment management (create, track, print)

// ==================== Error Handling Middleware ====================

/**
 * 404 Not Found Handler
 * Được gọi khi request đến route không tồn tại
 * Chuyển sang error handler middleware để xử lý
 */
app.use(notFound);

/**
 * Global Error Handler
 * Xử lý tất cả lỗi từ controllers
 * Trong development: trả về full stack trace
 * Trong production: chỉ trả về error message
 */
app.use(errorHandler);

// ==================== Server Startup ====================

/**
 * Global error handlers cho uncaught exceptions
 * Ngăn process crash khi có error không được catch
 */
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
  // Continue running instead of crashing
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });
  // Continue running instead of crashing
});

/**
 * Khởi động Express server với Socket.io
 * - Tạo HTTP server từ Express app
 * - Gắn Socket.io vào HTTP server
 * - Lắng nghe trên cổng PORT
 * - In ra thông tin server đã khởi động
 */
const server = http.createServer(app);

// ==================== Socket.io Configuration ====================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://manln.online',
  'https://www.manln.online',
  process.env.FRONTEND_URL,
].filter(Boolean);

console.log('[SOCKET.IO] Allowed origins:', allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests without origin (mobile apps, same-origin requests)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Log rejected origins for debugging
      console.warn(`[SOCKET.IO] CORS rejected - origin not allowed: ${origin}`);
      return callback(new Error('CORS not allowed'), false);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  // Heartbeat settings để tránh disconnect hàng loạt
  pingInterval: 25000, // Server gửi ping mỗi 25 giây
  pingTimeout: 20000, // Chờ 20 giây cho pong từ client
});

// Initialize socket handlers
socketHandler(io);

// Make io accessible to other modules (paymentService, etc.)
app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  console.log('[SERVER] ✅ Laptop Store Backend API is running!');
  console.log(`[SERVER] Port: ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[SERVER] DB Status: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...'}`);
  console.log('[SERVER] WebSocket enabled via Socket.io');
  console.log('[SERVER] Listening on 0.0.0.0:' + PORT);
});

// Graceful shutdown handler
server.on('error', (err) => {
  console.error('[SERVER_ERROR] Listen error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle SIGTERM for graceful shutdown (Railway sends this)
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after 30 seconds');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, closing server gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

module.exports = { app, io, server };
