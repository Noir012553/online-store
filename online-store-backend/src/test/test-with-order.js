#!/usr/bin/env node

/**
 * Test complete payment flow with a specific order ID
 * Run: npm run test:flow <orderId> or node test/test-with-order.js <orderId>
 * Example: node test/test-with-order.js 696b670b041e2f97fa56677c
 */

const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
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
