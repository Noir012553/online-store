#!/usr/bin/env node

/**
 * Test complete payment flow with the latest unpaid order from MongoDB.
 * Run: npm run test:flow
 */

const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { baseUrl, mongoUri, timeoutMs } = require('./test-config');
const { getAdminToken } = require('./adminAuth');

async function findTestOrder() {
  const order = await Order.findOne({
    isPaid: false,
    isDeleted: false,
    'orderItems.0': { $exists: true },
    totalPrice: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();

  if (!order) {
    throw new Error('No eligible unpaid order found in MongoDB');
  }

  return order._id.toString();
}

function makeRequest(method, requestPath, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestPath, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function test() {
  if (!mongoUri) {
    throw new Error('TEST_MONGO_URI or MONGO_URI is required');
  }

  await mongoose.connect(mongoUri);
  try {
    const orderId = await findTestOrder();
    const token = await getAdminToken(baseUrl, timeoutMs);
    const response = await makeRequest(
      'POST',
      '/api/payments/debug/test-complete-flow',
      token,
      { orderId },
    );

    if (!response.data?.success) {
      throw new Error(`Payment flow failed: ${response.status} ${JSON.stringify(response.data)}`);
    }

    console.log(`Payment flow completed for order ${orderId}`);
  } finally {
    await mongoose.disconnect();
  }
}

test().catch((error) => {
  console.error(`[test-flow] ${error.message}`);
  process.exitCode = 1;
});
