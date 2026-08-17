#!/usr/bin/env node

/**
 * Simple test script to verify VNPAY signature verification
 * Run: npm test:simple or node test/test-simple.js
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

  try {
    // Step 1: Get config
    const configRes = await makeRequest('GET', '/api/payments/debug/vnpay-config');
    
    if (!configRes.data.success) {
      process.exit(1);
    }

    const config = configRes.data.config;

    // Step 2: Test webhook
    
    const webhookRes = await makeRequest('POST', '/api/payments/debug/test-webhook');
    
    if (!webhookRes.data.success) {
      
      if (webhookRes.data.details) {
      }
    } else {
      
      if (webhookRes.data.details?.webhookResponse?.success === false) {
      } else if (webhookRes.data.details?.webhookResponse?.success) {
      }
    }


    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

test();
