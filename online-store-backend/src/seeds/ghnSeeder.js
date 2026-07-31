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
const { getActiveLangCodes } = require('../config/languageInventory');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

// Helper to create multilingual service type names
const createServiceTypeName = () => {
  const serviceTypeTranslations = {
    'vi': 'shipping_service_standard',
    'en': 'Standard Delivery',
    'pt': 'Entrega Padrão',
    'fr': 'Livraison Standard',
    'de': 'Standardversand',
    'it': 'Consegna Standard',
    'es': 'Entrega Estándar',
    'nl': 'Standaardlevering',
    'sv': 'Standardleverans',
  };
  const names = {};
  getActiveLangCodes().forEach(lang => {
    names[lang] = serviceTypeTranslations[lang] || serviceTypeTranslations['vi'];
  });
  return names;
};

const createExpressTypeName = () => {
  const expressTypeTranslations = {
    'vi': 'shipping_service_express',
    'en': 'Express Delivery',
    'pt': 'Entrega Expressa',
    'fr': 'Livraison Express',
    'de': 'Expressversand',
    'it': 'Consegna Express',
    'es': 'Entrega Express',
    'nl': 'Expreslevering',
    'sv': 'Snabblevering',
  };
  const names = {};
  getActiveLangCodes().forEach(lang => {
    names[lang] = expressTypeTranslations[lang] || expressTypeTranslations['vi'];
  });
  return names;
};

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
      existingGhn.currencyCode = 'VND';
      existingGhn.isActive = true;
      existingGhn.isDeleted = false;
      
      await existingGhn.save();
    } else {
      // Create new GHN provider
      const ghnProvider = new ShippingProvider({
        name: 'GHN Express',
        code: 'ghn',
        description: 'shipping_provider_ghn_description',
        logo: 'https://cdn.ghn.vn/images/logo.png',
        apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        apiKey: process.env.GHN_API_TOKEN || '097ed591-ec72-11f0-a3d6-dac90fb956b5',
        token: process.env.GHN_SHOP_ID || '199019',
        currencyCode: 'VND',
        isActive: true,
        serviceTypes: [
          {
            code: 'standard',
            name: createServiceTypeName(),
            estimatedDays: '2-3',
          },
          {
            code: 'express',
            name: createExpressTypeName(),
            estimatedDays: '1-2',
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
