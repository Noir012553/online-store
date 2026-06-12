/**
 * GHN Provider Seeder
 * Tạo GHN provider configuration cho Sandbox
 * 
 * Sử dụng:
 * node src/seed-ghn.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ShippingProvider = require('../models/ShippingProvider');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

async function seedGhnProvider() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);

    // Check if GHN provider already exists
    const existingGhn = await ShippingProvider.findOne({ code: 'ghn' });
    
    if (existingGhn) {
      
      // Update existing provider
      existingGhn.apiKey = process.env.GHN_API_TOKEN || '097ed591-ec72-11f0-a3d6-dac90fb956b5';
      existingGhn.apiUrl = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
      existingGhn.isActive = true;
      existingGhn.isDeleted = false;
      
      await existingGhn.save();
    } else {
      // Create new GHN provider
      const ghnProvider = new ShippingProvider({
        name: 'Giao Hàng Nhanh',
        code: 'ghn',
        description: 'Dịch vụ vận chuyển Giao Hàng Nhanh (GHN)',
        logo: 'https://cdn.ghn.vn/images/logo.png',
        apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        apiKey: process.env.GHN_API_TOKEN || '097ed591-ec72-11f0-a3d6-dac90fb956b5',
        token: process.env.GHN_SHOP_ID || '199019',
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

      await ghnProvider.save();
    }

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

// Check environment variables
if (!process.env.GHN_API_TOKEN && !process.env.MONGO_URI) {
}

seedGhnProvider();
