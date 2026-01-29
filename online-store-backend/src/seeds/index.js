/**
 * Database Seeder - Khởi tạo dữ liệu test/demo
 * Dùng factories để tạo dữ liệu động với relationships
 */

require('dotenv').config();
const mongoose = require('mongoose');

/**
 * ==================== SEEDS - Database Initialization ====================
 * 
 * Script để khởi tạo database với dữ liệu test/demo
 * 
 * Cách dùng:
 * npm run seed           - Chạy seed script
 * npm run seed:clear    - Xóa tất cả data (nếu có)
 * 
 * Thứ tự seeding (phải theo dependencies):
 * 1. Users (admin, user1, user2)
 * 2. Categories (6 danh mục)
 * 3. Suppliers (5 nhà cung cấp)
 * 4. Products (20 sản phẩm liên kết đến users, categories, suppliers)
 * 5. Customers (5 khách hàng)
 * 6. Reviews (8 đánh giá liên kết đến products, users)
 * 7. Orders (600 đơn hàng liên kết đến users, products, customers)
 * 8. Coupons (4 mã giảm giá liên kết đến products, categories)
 */

// ==================== Import Seeders ====================

const seedUsers = require('./userSeeder');
const seedCategories = require('./categorySeeder');
const seedSuppliers = require('./supplierSeeder');
const seedProducts = require('./productSeeder');
const seedOutOfStockProducts = require('./outOfStockSeeder');
const seedCustomers = require('./customerSeeder');
const seedLocations = require('./locationSeeder');
const seedAddresses = require('./addressSeeder');
const seedReviews = require('./reviewSeeder');
const seedOrdersEnhanced = require('./orderSeederEnhanced');
const seedCoupons = require('./couponSeeder');
const seedShippingProviders = require('./shippingProviderSeeder');

// ==================== Main Seed Function ====================

/**
 * Main seed orchestrator
 * Thực thi seeding tuần tự theo thứ tự dependencies
 */
const seed = async () => {
  try {
    // ==================== Database Connection ====================

    /**
     * Kết nối MongoDB
     * Sử dụng MONGO_URI từ .env file
     */
    await mongoose.connect(process.env.MONGO_URI);

    // ==================== Start Seeding ====================

    /**
     * 1. Seed Users (base entity)
     * Tạo: 1 admin (admin@laptop.com / admin123) + 1 regular user (anyemail@email.com / 123456)
     */
    const users = await seedUsers();

    /**
     * 2. Seed Categories & Suppliers (independent entities)
     * Tạo: 6 danh mục sản phẩm
     * Tạo: 5 nhà cung cấp
     */
    const categories = await seedCategories();
    const suppliers = await seedSuppliers();

    /**
     * 3. Seed Products (depends on users, categories, suppliers)
     * Tạo: 20 sản phẩm laptop
     * Liên kết: admin user (users[0]) -> tác giả sản phẩm
     * Liên kết: categories, suppliers -> product relationships
     */
    const products = await seedProducts(
      users[0]._id,
      categories.map(c => c._id),
      suppliers.map(s => s._id)
    );

    /**
     * 3.5. Seed Out-of-Stock Products (for testing stock status display)
     * Tạo: 1 sản phẩm hết hàng (countInStock = 0) cho mỗi danh mục
     * Mục đích: Test xem "Hết hàng" badge hiển thị đúng không
     */
    const outOfStockProducts = await seedOutOfStockProducts(
      users[0]._id,
      categories.map(c => c._id),
      suppliers.map(s => s._id)
    );

    /**
     * 4. Seed Customers (independent entity) - MUST BE BEFORE ORDERS & ADDRESSES
     * Tạo: 30 khách hàng
     * Đặc biệt: Có thể upsert by phone number từ checkout
     */
    const customers = await seedCustomers();

    /**
     * 4.2. Seed Shipping Providers (MUST RUN BEFORE LOCATIONS)
     * Tạo: GHN provider từ GHN_TOKEN environment variable
     * Đặc biệt: Nếu provider đã tồn tại, sẽ skip (không ghi đè)
     * Điều kiện: GHN_TOKEN phải được set trong .env file
     * IMPORTANT: Location seeder cần GHN provider để fetch data!
     */
    try {
      const providers = await seedShippingProviders();
      if (providers.length > 0) {
        console.log(`✅ Shipping providers configured successfully`);
      }
    } catch (providerError) {
      console.warn(`⚠️ Shipping providers seeding failed: ${providerError.message}`);
      throw new Error('Shipping providers must be configured before locations');
    }

    /**
     * 4.25. Seed Locations (independent entity)
     * Tạo: Sync provinces, districts, wards từ GHN API vào Database
     * Dữ liệu: Dữ liệu thực từ partner API (không mock data)
     * MUST RUN BEFORE addresses seeding (vì addresses phụ thuộc vào location data)
     * MUST RUN AFTER shipping providers (cần GHN provider để fetch data)
     */
    try {
      const locationResult = await seedLocations();
      console.log(`📍 ✅ Successfully synced location data from GHN API`);
    } catch (locationError) {
      console.error(`❌ Location seeding failed: ${locationError.message}`);
      throw new Error('Locations must be seeded before addresses');
    }

    /**
     * 4.5. Seed Addresses (depends on customers + locations)
     * Tạo: 1-2 địa chỉ giao hàng cho mỗi khách hàng
     * Liên kết: customers, locations
     * Dữ liệu: Location data từ GHN API (synced từ locationSeeder)
     * Đặc biệt: Mỗi khách hàng có ít nhất 1 default address
     */
    const addresses = await seedAddresses();

    /**
     * 5. Seed Reviews (depends on products, users)
     * Tạo: 8 đánh giá sản phẩm
     * Liên kết: products, users
     * Auto update: product rating & numReviews
     */
    try {
      const reviews = await seedReviews(products, users);
      console.log(`⭐ ✅ Successfully seeded ${reviews.length} reviews`);
    } catch (reviewError) {
      console.warn(`⚠️ Reviews seeding failed: ${reviewError.message}`);
    }

    /**
     * 6. Seed Orders (depends on products, customers)
     * IMPORTANT: Customers MUST be seeded first!
     * Tạo: ~600 đơn hàng mẫu phân phối across 24 months (2 years)
     * Liên kết: customers, products
     * Mô phỏng: Trạng thái thanh toán & giao hàng
     * Mục đích: Dashboard charts (ngày/tháng/quý/năm) có đủ dữ liệu
     *
     * Ensure each order is linked to a customer with proper data
     */
    const orders = await seedOrdersEnhanced(products, users, customers);

    /**
     * 7. Seed Coupons (depends on products, categories)
     * Tạo: 4 mã giảm giá (SUMMER20, WELCOME100, FLASH15, VIP50)
     * Liên kết: products, categories
     * Tính năng: percentage/fixed discount, usage limits, date ranges
     */
    try {
      const coupons = await seedCoupons(products, categories);
      console.log(`🎟️ ✅ Successfully seeded ${coupons.length} coupons`);
    } catch (couponError) {
      console.warn(`⚠️ Coupons seeding failed: ${couponError.message}`);
    }

    // ==================== Seeding Summary ====================

    console.log('\n✅ All seeding completed successfully!\n');

    /**
     * Exit process khi hoàn thành
     */
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed with error:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

// ==================== Execute ====================

/**
 * Chạy seed function
 * Được gọi khi chạy: npm run seed
 */
seed();
