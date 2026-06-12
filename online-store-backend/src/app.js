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
const path = require('path');

// ==================== Import Routes ====================
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const couponRoutes = require('./routes/couponRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const addressRoutes = require('./routes/addressRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const shippingProviderRoutes = require('./routes/shippingProviderRoutes');
const shipmentRoutes = require('./routes/shipmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const translationRoutes = require('./routes/translationRoutes');
const languageRoutes = require('./routes/languageRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { globalLimiter } = require('./middleware/rateLimitMiddleware');
const paymentController = require('./controllers/paymentController');
const asyncHandler = require('express-async-handler');
const { socketHandler } = require('./socket/socketHandler');
const expressJSDocSwagger = require('express-jsdoc-swagger');
const swaggerOptions = require('./config/swagger');
const seedHomepageHeroBanners = require('./seeds/bannerSeeder');
const { getMessage } = require('./i18n/messages');

// ==================== Initialize Express App ====================
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;


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
      'http://localhost:5000', // Cho phép từ chính backend
      'https://manln.online',
      'https://backend.manln.online',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow if:
    // 1. No origin (same-site or non-browser requests)
    // 2. In allowed list
    // 3. Builder.io dev server (*.builderio.xyz or *.builderio.dev)
    const isBuilderDev = origin && /\.builderio\.(xyz|dev)$/.test(origin);
    if (!origin || allowedOrigins.includes(origin) || isBuilderDev) {
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
 * Tăng limit lên 50MB để hỗ trợ description dài và multiple images
 */
app.use(express.json({ limit: '50mb' }));

/**
 * URL-Encoded Parser Middleware
 * Cho phép Express đọc form data từ request body
 * Hỗ trợ request headers: Content-Type: application/x-www-form-urlencoded
 * Tăng limit lên 50MB để hỗ trợ large payloads
 */
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * Trust Proxy Middleware
 * Cloudflare Tunnel kết nối từ localhost (loopback)
 * Nên ta tin tưởng loopback proxy để lấy đúng IP từ cf-connecting-ip header
 */
app.set('trust proxy', 'loopback');

/**
 * Static Files Middleware
 * - /uploads: Phục vụ file ảnh động từ API (phân loại theo user, admin, reviewer)
 */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/**
 * Swagger UI Middleware
 * Tài liệu API trực quan cho dự án
 */
expressJSDocSwagger(app)(swaggerOptions);

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
let homepageHeroBannersSeeded = false;

const ensureHomepageHeroBanners = async () => {
  if (homepageHeroBannersSeeded) {
    return;
  }

  try {
    const createdBanners = await seedHomepageHeroBanners();
    homepageHeroBannersSeeded = true;

    if (createdBanners.length > 0) {
      // Banners seeded successfully
    }
  } catch (error) {
    console.warn('[SEED] Homepage hero banner seed skipped:', error.message);
  }
};

const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      console.error('[CRITICAL] MONGO_URI environment variable is not set');
      console.error('[HELP] Set MONGO_URI via Cloudflare Tunnel environment variables or in .env file');
      return;
    }

    await mongoose.connect(MONGO_URI, mongooseOptions);
    connectionAttempts = 0;
    await ensureHomepageHeroBanners();
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
  // MongoDB reconnected
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
    message: getMessage('VI', 'api.backendRunning'),
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
 * Health check endpoint - Memory Status
 * GET /health/cache - Monitor memory usage
 */
app.get('/health/cache', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    res.json({
      status: heapPercent > 90 ? 'critical' : heapPercent > 80 ? 'warning' : 'healthy',
      memory: {
        heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
        heapPercent: heapPercent.toFixed(1),
        rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * Health check endpoint cho static files
 * GET /health/uploads - Kiểm tra xem /uploads có được serve đúng không
 */
app.get('/health/uploads', (req, res) => {
  const uploadDir = path.join(__dirname, '../uploads');
  const adminDir = path.join(uploadDir, 'admins');

  try {
    const fs = require('fs');
    const uploadsExists = fs.existsSync(uploadDir);
    const adminsExists = fs.existsSync(adminDir);
    let adminFiles = [];

    if (adminsExists) {
      adminFiles = fs.readdirSync(adminDir);
    }

    res.json({
      message: 'Static files status',
      uploadDir,
      adminDir,
      uploadsExists,
      adminsExists,
      adminFilesCount: adminFiles.length,
      adminFileSample: adminFiles.slice(0, 3),
      testFile: 'admin_69bb64168097c2a29b6036f8_1773928672951.png',
      testFileExists: adminFiles.includes('admin_69bb64168097c2a29b6036f8_1773928672951.png'),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      uploadDir,
    });
  }
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
app.use('/api/banners', bannerRoutes);       // Marketing banner management
app.use('/api/analytics', analyticsRoutes);          // Dashboard analytics (optimized)
app.use('/api/addresses', addressRoutes);            // Customer addresses (shipping)
app.use('/api/shipping', shippingRoutes);            // Multi-carrier shipping integration
app.use('/api/shipping-providers', shippingProviderRoutes); // Shipping provider config (admin)
app.use('/api/shipments', shipmentRoutes);  // Shipment management (create, track, print)
app.use('/api/newsletter', newsletterRoutes); // Newsletter subscriptions
app.use('/api/translations', translationRoutes); // Translation service (Cloudflare AI) - Tier 1, 2, 3
app.use('/api/languages', languageRoutes); // Language management (admin - Tier 3)

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
  'http://localhost:5000',
  'https://manln.online',
  'https://backend.manln.online',
];


const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests without origin (mobile apps, same-origin requests)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Development mode: allow all origins for easier testing
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[SOCKET.IO] Development mode - allowing origin: ${origin}`);
        return callback(null, true);
      }

      // Production: log rejected origins for debugging
      console.warn(`[SOCKET.IO] CORS rejected - origin not allowed: ${origin}`);
      return callback(new Error('CORS not allowed'), false);
    },
    methods: ['GET', 'POST'],
    credentials: true,
    allowEIO3: true, // Allow Engine.IO 3 clients
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  // Heartbeat settings để tránh disconnect hàng loạt
  pingInterval: 25000, // Server gửi ping mỗi 25 giây
  pingTimeout: 20000, // Chờ 20 giây cho pong từ client
  // Additional options for reliability
  allowUpgrades: true,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB
});

// Initialize socket handlers
socketHandler(io);

// Make io accessible to other modules (paymentService, etc.)
app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  // Server started successfully
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
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after 30 seconds');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

module.exports = { app, io, server };
