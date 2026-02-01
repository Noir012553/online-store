/**
 * Manual script để tạo GHN provider
 * Sử dụng: node create-ghn-provider.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

const ShippingProviderSchema = new mongoose.Schema(
  {
    name: String,
    code: { type: String, unique: true, lowercase: true },
    description: String,
    logo: String,
    apiUrl: String,
    apiKey: String,
    token: String,
    isActive: Boolean,
    isDeleted: Boolean,
    serviceTypes: [
      {
        code: String,
        name: String,
        estimatedDays: String,
      },
    ],
  },
  { timestamps: true }
);

async function createGhnProvider() {
  try {
    console.log('📡 Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const ShippingProvider = mongoose.model('ShippingProvider', ShippingProviderSchema);

    // Delete existing if any
    await ShippingProvider.deleteOne({ code: 'ghn' });
    console.log('🗑️  Cleared old GHN provider (if exists)');

    // Create new
    const ghnProvider = await ShippingProvider.create({
      name: 'Giao Hàng Nhanh',
      code: 'ghn',
      description: 'Dịch vụ vận chuyển Giao Hàng Nhanh (GHN)',
      logo: 'https://cdn.ghn.vn/images/logo.png',
      apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2',
      apiKey: process.env.GHN_API_TOKEN || '097ed591-ec72-11f0-a3d6-dac90fb956b5',
      token: process.env.GHN_SHOP_ID || '199019',
      isActive: true,
      isDeleted: false,
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

    console.log('✅ GHN provider created successfully!');
    console.log('\n📋 Provider details:');
    console.log('   ID:', ghnProvider._id);
    console.log('   Code:', ghnProvider.code);
    console.log('   API Key:', ghnProvider.apiKey.substring(0, 8) + '...');
    console.log('   Shop ID:', ghnProvider.token);
    console.log('   Active:', ghnProvider.isActive);

    // Verify it can be retrieved
    const retrieved = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false, isActive: true }).select('+apiKey');
    if (retrieved) {
      console.log('\n✅ Verified: Provider is retrievable from DB');
    } else {
      console.log('\n❌ ERROR: Provider not found in DB');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done! You can now start the server.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check MONGO_URI in .env');
    console.error('2. Ensure MongoDB is running');
    console.error('3. Check database connection permissions');
    process.exit(1);
  }
}

createGhnProvider();
