/**
 * Rebuild Critical Indexes for Database Optimization
 * Dùng để bật compound indexes mới cho:
 * - Order: {customer, isDeleted} - Tối ưu getMyOrders query
 * - Review: {product, user, isDeleted} - Tối ưu alreadyReviewed check
 * 
 * Sử dụng: node scripts/rebuild-critical-indexes.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function rebuildCriticalIndexes() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Import models
        const Order = require('../src/models/Order');
        const Review = require('../src/models/Review');
        const Product = require('../src/models/Product');

        console.log('\n📊 Rebuilding critical indexes...');

        // Sync indexes for Order
        console.log('  • Syncing Order indexes...');
        await Order.syncIndexes();
        console.log('    ✅ Order indexes synced');

        // Sync indexes for Review
        console.log('  • Syncing Review indexes...');
        await Review.syncIndexes();
        console.log('    ✅ Review indexes synced');

        // Sync indexes for Product (no changes but for consistency)
        console.log('  • Syncing Product indexes...');
        await Product.syncIndexes();
        console.log('    ✅ Product indexes synced');

        console.log('\n✨ Critical indexes rebuilt successfully!');
        console.log('\n📈 Performance Improvements:');
        console.log('  1. Order {customer, isDeleted}: COLLSCAN → IXSCAN for getMyOrders');
        console.log('  2. Review {product, user, isDeleted}: Faster alreadyReviewed checks');
        console.log('  3. Review $avg aggregation: Database-level calculation (no N+1)');

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error rebuilding indexes:', error);
        process.exit(1);
    }
}

rebuildCriticalIndexes();
