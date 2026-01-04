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

// ==================== Import Routes ====================
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const locationRoutes = require('./routes/locationRoutes');
const couponRoutes = require('./routes/couponRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const paymentIntegrationRoutes = require('./routes/paymentIntegrationRoutes');
const ghnTestRoutes = require('./routes/ghnTestRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// ==================== Initialize Express App ====================
const app = express();
const PORT = process.env.PORT || 3000;
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
 * /api/locations           - Vietnam location data (provinces/districts/wards)
 * /api/coupons             - Discount coupon management
 */

// ==================== Middleware Configuration ====================

/**
 * CORS Middleware
 * Cho phép frontend từ các domain khác gọi API (Cross-Origin Requests)
 * Trong development: cho phép tất cả origins
 * Trong production: nên chỉ cho phép specific domains
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Cho phép tất cả *.fly.dev domains (preview deployments)
    // Cho phép tất cả *.railway.app domains
    // Cho phép localhost và FRONTEND_URL
    if (!origin ||
        allowedOrigins.includes(origin) ||
        /^https:\/\/.*\.fly\.dev$/.test(origin) ||
        /^https:\/\/.*\.railway\.app$/.test(origin)) {
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
 * Static Files Middleware
 * Cho phép truy cập file ảnh từ folder uploads
 * Ví dụ: http://localhost:5000/uploads/image.jpg
 */
app.use('/uploads', express.static('uploads'));

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
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority',
  family: 4,
};

let connectionAttempts = 0;
const maxConnectionAttempts = 5;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, mongooseOptions);
    connectionAttempts = 0;
  } catch (err) {
    connectionAttempts++;
    const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);

    if (connectionAttempts < maxConnectionAttempts) {
      setTimeout(connectDB, delay);
    }
  }
};

connectDB();

mongoose.connection.on('disconnected', () => {
  setTimeout(connectDB, 3000);
});

/**
 * Auto-seed provinces data after server starts (non-blocking)
 * This is optional - provinces can be seeded manually via npm run seed
 */
const autoSeedProvinces = async () => {
  try {
    // Wait for DB connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (mongoose.connection.readyState === 1) {
            clearInterval(interval);
            resolve(null);
          }
        }, 100);
      });
    }

    const Province = require('./models/Province');
    const count = await Province.countDocuments().catch(() => 0);

    if (count === 0) {
      try {
        const vietnamProvinces = require('./data/vietnamProvinces.json');
        await Province.insertMany(vietnamProvinces.map(p => ({
          code: String(p.code),
          name: p.name,
        })));
      } catch (error) {
        // Silently continue if province seeding fails
      }
    }
  } catch (error) {
    // Silently continue if auto-seed fails
  }
};

// Run auto-seed after 3 seconds (non-blocking)
setTimeout(autoSeedProvinces, 3000);

// ==================== Routes Setup ====================

/**
 * Health Check Route
 * GET / - Kiểm tra server có chạy không
 * Response: { message: "Laptop Store Backend API is running!" }
 */
app.get('/', (req, res) => {
  res.json({ message: 'Laptop Store Backend API is running!' });
});

/**
 * API Routes Mounting
 * Tất cả routes sử dụng /api/... prefix
 */
app.use('/api/users', userRoutes);           // User authentication & admin
app.use('/api/products', productRoutes);     // Product management
app.use('/api/orders', orderRoutes);         // Order processing
app.use('/api/customers', customerRoutes);   // Customer management
app.use('/api/suppliers', supplierRoutes);   // Supplier management
app.use('/api/categories', categoryRoutes);  // Category management
app.use('/api/reviews', reviewRoutes);       // Product reviews
app.use('/api/locations', locationRoutes);   // Vietnam location API
app.use('/api/coupons', couponRoutes);       // Coupon system
app.use('/api/analytics', analyticsRoutes);  // Dashboard analytics (optimized)
app.use('/api/shipping', shippingRoutes);    // Shipping methods & GHN API
app.use('/api/payment', paymentIntegrationRoutes);  // Payment integration (VNPay + all payment methods)

// GHN Test Routes (development only - để test GHN API integration)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test/ghn', ghnTestRoutes);   // GHN API test endpoints
}

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
 * Khởi động Express server
 * - Lắng nghe trên cổng PORT (mặc định 5000)
 * - In ra thông tin server đã khởi động
 * - In ra environment mode (development/production)
 * - In ra các static routes có sẵn
 */
app.listen(PORT, '0.0.0.0', () => {
  // Server started
});

module.exports = app;
