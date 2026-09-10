#!/usr/bin/env node

/**
 * Test complete payment flow with a specific order ID
 * Run: npm run test:flow <orderId> or node test/with-order.test.js <orderId>
 * Example: node test/with-order.test.js 696b670b041e2f97fa56677c
 */

const http = require('http');
const https = require('https');
const { baseUrl, adminToken } = require('./test-config');

function makeRequest(method, requestPath, body = null) {
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
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
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
  const orderId = process.argv[2];

  if (!orderId) {
    process.exit(1);
  }



  try {
    const response = await makeRequest(
      'POST',
      '/api/payments/debug/test-complete-flow',
      { orderId }
    );

    if (response.data.success) {
      
    } else {
      
      if (response.data.details?.error?.includes('not found')) {
      }
    }


    process.exit(response.data.success ? 0 : 1);
  } catch (error) {
    process.exit(1);
  }
}

test();
