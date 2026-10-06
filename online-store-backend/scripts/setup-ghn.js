#!/usr/bin/env node

/**
 * GHN Provider Setup Script
 *
 * Sử dụng:
 * npm run setup-ghn
 *
 * hoặc:
 * node scripts/setup-ghn.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laptop-store';

// Import model
const ShippingProvider = require('../src/models/ShippingProvider');
const { getActiveLangCodes } = require('../src/config/languageInventory');

async function setupGHN() {
  try {
    // Get credentials from environment
    const ghnToken = process.env.GHN_API_TOKEN;
    const ghnShopId = process.env.GHN_SHOP_ID;

    if (!ghnToken) {
      process.exit(1);
    }

    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);

    // Check if provider exists
    const existingProvider = await ShippingProvider.findOne({ code: 'ghn' });

    if (existingProvider) {
      existingProvider.apiKey = ghnToken;
      existingProvider.token = ghnShopId;
      existingProvider.isActive = true;
      existingProvider.isDeleted = false;

      await existingProvider.save();
    } else {
      const activeLangs = getActiveLangCodes();

      const newProvider = new ShippingProvider({
        name: 'shipping_provider_ghn_name',
        code: 'ghn',
        description: 'shipping_provider_ghn_description',
        logo: 'https://cdn.ghn.vn/images/logo.png',
        apiUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        apiKey: ghnToken,
        token: ghnShopId,
        isActive: true,
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

      await newProvider.save();
    }

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

setupGHN();
