#!/usr/bin/env node

/**
 * Test complete payment flow with a specific order ID
 * Run: node test-with-order.js <orderId>
 * Example: node test-with-order.js 696b670b041e2f97fa56677c
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
    console.log('\n❌ Usage: node test-with-order.js <orderId>');
    console.log('Example: node test-with-order.js 696b670b041e2f97fa56677c\n');
    process.exit(1);
  }

  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║     COMPLETE PAYMENT FLOW TEST WITH REAL ORDER             ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Testing with Order ID:', orderId);
  console.log('   Expected: Payment created → Webhook processed → Order updated\n');

  try {
    const response = await makeRequest(
      'POST',
      '/api/payments/debug/test-complete-flow',
      { orderId }
    );

    if (response.data.success) {
      console.log('✅ COMPLETE FLOW TEST PASSED!\n');
      console.log('📊 Results:');
      console.log('   ✅ Payment created:', response.data.details.paymentId);
      console.log('   ✅ Signature verified');
      console.log('   ✅ Webhook processed');
      console.log('   ✅ Order updated to PAID\n');
      
      console.log('🎉 VNPAY Payment Integration is WORKING!\n');
    } else {
      console.log('❌ COMPLETE FLOW TEST FAILED\n');
      console.log('📊 Error:');
      console.log('   Message:', response.data.message);
      console.log('   Details:', response.data.details);
      
      if (response.data.details?.error?.includes('not found')) {
        console.log('\n⚠️  Possible causes:');
        console.log('   1. Order ID does not exist in database');
        console.log('   2. Order already marked as paid');
        console.log('   3. Invalid MongoDB ObjectId format\n');
      }
    }

    console.log('╔═════════════════════════════════════════════════════════════╗');
    console.log('║                     Test Complete                          ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');

    process.exit(response.data.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n⚠️  Make sure backend is running: npm run dev\n');
    process.exit(1);
  }
}

test();
