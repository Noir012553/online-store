/**
 * Manual script để tạo GHN provider
 * Sử dụng: node scripts/create-ghn-provider.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

const { getActiveLangCodes } = require('../src/config/languageInventory');

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
    await mongoose.connect(MONGO_URI);

    const ShippingProvider = mongoose.model('ShippingProvider', ShippingProviderSchema);

    // Delete existing if any
    await ShippingProvider.deleteOne({ code: 'ghn' });

    // Create new
    const activeLangs = getActiveLangCodes();

    const ghnProvider = await ShippingProvider.create({
      name: 'shipping_provider_ghn_name',
      code: 'ghn',
      description: 'shipping_provider_ghn_description',
      logo: 'https://cdn.ghn.vn/images/logo.png',
      apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2',
      apiKey: process.env.GHN_API_TOKEN || '097ed591-ec72-11f0-a3d6-dac90fb956b5',
      token: process.env.GHN_SHOP_ID || '199019',
      isActive: true,
      isDeleted: false,
      serviceTypes: [
        {
          code: 'standard',
          name: Object.fromEntries(
            activeLangs.map(lang => [
              lang,
              'shipping_service_standard'
            ])
          ),
          estimatedDays: '2-3',
        },
        {
          code: 'express',
          name: Object.fromEntries(
            activeLangs.map(lang => [
              lang,
              'shipping_service_express'
            ])
          ),
          estimatedDays: '1-2',
        },
      ],
    });

    // Verify it can be retrieved
    const retrieved = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false, isActive: true }).select('+apiKey');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

createGhnProvider();
