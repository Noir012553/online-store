#!/usr/bin/env node

/**
 * Simple test script to verify VNPAY signature verification
 * Run: node test-simple.js
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
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║        VNPAY Webhook Test - Signature Verification        ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Get config
    console.log('📋 Step 1: Checking VNPAY Config...');
    const configRes = await makeRequest('GET', '/api/payments/debug/vnpay-config');
    
    if (!configRes.data.success) {
      console.error('❌ Failed to get config');
      process.exit(1);
    }

    const config = configRes.data.config;
    console.log(`✅ Secret Key Length: ${config.VNPAY_HASH_SECRET_LENGTH} characters`);
    console.log(`✅ Terminal ID: ${config.VNPAY_TMN_CODE}`);
    console.log(`✅ Endpoint: ${config.VNPAY_ENDPOINT}`);

    // Step 2: Test webhook
    console.log('\n📋 Step 2: Testing Webhook Processing...');
    console.log('📤 Sending POST to /api/payments/debug/test-webhook...\n');
    
    const webhookRes = await makeRequest('POST', '/api/payments/debug/test-webhook');
    
    if (!webhookRes.data.success) {
      console.error('❌ Webhook test failed!');
      console.error('   Error:', webhookRes.data.error);
      console.error('   Message:', webhookRes.data.message);
      
      if (webhookRes.data.details) {
        console.error('\n📊 Signature Details:');
        console.error('   Calculated:', webhookRes.data.details.signature?.calculated?.substring(0, 50) + '...');
        console.error('   Length:', webhookRes.data.details.signature?.length);
      }
    } else {
      console.log('✅ Webhook test passed!');
      console.log('   Order:', webhookRes.data.details?.orderTested);
      console.log('   Signature Length:', webhookRes.data.details?.signature?.length);
      
      if (webhookRes.data.details?.webhookResponse?.success === false) {
        console.log('\n⚠️  WARNING: Signature verification failed during webhook processing!');
        console.log('   This means signature data format mismatch between creation and verification');
      } else if (webhookRes.data.details?.webhookResponse?.success) {
        console.log('\n✅ Signature verification PASSED!');
      }
    }

    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║                     Test Complete                          ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n⚠️  Make sure backend is running: npm run dev');
    process.exit(1);
  }
}

test();
