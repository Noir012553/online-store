#!/usr/bin/env node

/**
 * GHN Provider Setup Script
 * 
 * Sử dụng:
 * npm run setup-ghn
 * 
 * hoặc:
 * node setup-ghn.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

// Import model
const ShippingProvider = require('./src/models/ShippingProvider');

async function setupGHN() {
  try {
    console.log('\n========================================');
    console.log('  GHN Provider Setup');
    console.log('========================================\n');

    // Get credentials from environment
    const ghnToken = process.env.GHN_API_TOKEN;
    const ghnShopId = process.env.GHN_SHOP_ID;

    if (!ghnToken) {
      console.error('❌ ERROR: GHN_API_TOKEN not set in environment');
      console.log('\nPlease set GHN credentials in .env file:');
      console.log('  GHN_API_TOKEN=your-token');
      console.log('  GHN_SHOP_ID=your-shop-id');
      console.log('  GHN_USE_SANDBOX=true (for sandbox mode)');
      process.exit(1);
    }

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if provider exists
    const existingProvider = await ShippingProvider.findOne({ code: 'ghn' });

    if (existingProvider) {
      console.log('📝 Updating existing GHN provider...');
      existingProvider.apiKey = ghnToken;
      existingProvider.token = ghnShopId;
      existingProvider.isActive = true;
      existingProvider.isDeleted = false;

      await existingProvider.save();
      console.log('✅ GHN provider updated successfully\n');
    } else {
      console.log('📝 Creating new GHN provider...');
      const newProvider = new ShippingProvider({
        name: 'Giao Hàng Nhanh',
        code: 'ghn',
        description: 'Dịch vụ vận chuyển Giao Hàng Nhanh (GHN)',
        logo: 'https://cdn.ghn.vn/images/logo.png',
        apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        apiKey: ghnToken,
        token: ghnShopId,
        isActive: true,
        serviceTypes: [
          {
            code: 'standard',
            name: 'Giao hàng tiêu chuẩn',
            estimatedDays: '2-3 ngày',
          },
          {
            code: 'express',
            name: 'Giao hàng nhanh',
            estimatedDays: '1-2 ngày',
          },
        ],
      });

      await newProvider.save();
      console.log('✅ GHN provider created successfully\n');
    }

    // Display configuration
    console.log('========================================');
    console.log('  Configuration Summary');
    console.log('========================================');
    console.log('Mode: 🧪 SANDBOX');
    console.log(`Token: ${ghnToken.substring(0, 8)}...`);
    console.log(`Shop ID: ${ghnShopId || 'not set'}`);
    console.log('========================================\n');

    console.log('🎉 Setup completed successfully!');
    console.log('\nYou can now:');
    console.log('  1. Start the backend: npm run dev');
    console.log('  2. Start the frontend: cd frontend && npm run dev');
    console.log('  3. Test the checkout flow with GHN integration\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
    console.error('\nPlease ensure:');
    console.error('  1. MongoDB is running');
    console.error('  2. .env file has correct MONGO_URI');
    console.error('  3. GHN credentials are correct\n');
    process.exit(1);
  }
}

setupGHN();
