/**
 * Fix MongoDB indexes - Drop all indexes and rebuild
 * Dùng để khắc phục E11000 duplicate key errors
 * 
 * Sử dụng: node scripts/fix-indexes.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function fixIndexes() {
    try {
        await mongoose.connect(MONGO_URI);

        // Get User model
        const User = require('../models/User');

        // Drop all indexes on User collection
        await User.collection.dropIndexes();

        // Recreate indexes (Mongoose will create them automatically on next operation)
        await User.syncIndexes();

        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

fixIndexes();
