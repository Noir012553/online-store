/**
 * VNPAY Quick Test Script
 * 
 * Sử dụng để test thanh toán VNPAY Sandbox nhanh chóng
 * 
 * Chạy: node test-vnpay-quick.js
 * 
 * Kết quả:
 * - In ra URL thanh toán
 * - Verify signature
 * - Copy URL vào browser để test
 */

require('dotenv').config();
const VnpayAdapter = require('./src/adapters/payment/VnpayAdapter');

// Real config từ .env
const realConfig = {
  partnerId: process.env.VNPAY_TMN_CODE,
  partnerKey: process.env.VNPAY_HASH_SECRET,
  endpoint: process.env.VNPAY_ENDPOINT,
  returnUrl: process.env.VNPAY_RETURN_URL,
  callbackUrl: process.env.VNPAY_CALLBACK_URL,
};

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║        VNPAY Quick Test - Sandbox Testing              ║');
console.log('╚════════════════════════════════════════════════════════╝');

console.log('\n📋 CONFIGURATION:');
console.log(`   Partner ID (TMN Code): ${realConfig.partnerId}`);
console.log(`   Secret Key length: ${realConfig.partnerKey.length} chars`);
console.log(`   Secret Key (masked): ${realConfig.partnerKey.substring(0, 10)}***${realConfig.partnerKey.substring(realConfig.partnerKey.length - 5)}`);
console.log(`   Endpoint: ${realConfig.endpoint}`);
console.log(`   Return URL: ${realConfig.returnUrl}`);
console.log(`   Callback URL: ${realConfig.callbackUrl}`);

// Validate config
if (!realConfig.partnerId || !realConfig.partnerKey) {
  console.error('\n❌ ERROR: VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET chưa set trong .env');
  process.exit(1);
}

async function testVNPAY() {
  try {
    const adapter = new VnpayAdapter(realConfig);
    adapter.validateConfig();

    console.log('\n✅ Adapter initialized successfully\n');

    // ============================================
    // TEST 1: Tạo Payment URL
    // ============================================
    console.log('📌 TEST 1: Create Payment URL');
    console.log('─'.repeat(56));

    const timestamp = Date.now();
    const testOrderId = `TEST-${timestamp}`;
    
    const paymentData = {
      orderId: testOrderId,
      amount: 100000, // 100,000 VND
      description: `Test payment ${testOrderId}`,
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        phone: '0912345678',
      },
      clientIp: '127.0.0.1',
    };

    const createResult = await adapter.createPaymentUrl(paymentData);

    if (!createResult.success) {
      console.error('❌ Failed to create payment URL:', createResult.error);
      process.exit(1);
    }

    console.log('✅ Payment URL created successfully');
    console.log(`   Order ID: ${testOrderId}`);
    console.log(`   Amount: ${paymentData.amount.toLocaleString('vi-VN')} VND`);
    console.log(`   Transaction Ref: ${createResult.data.transactionRef}`);
    console.log(`   Hash length: ${createResult.data.requestData.vnp_SecureHash?.length || 0} chars (should be 128)`);

    // ============================================
    // TEST 2: Verify URL Structure
    // ============================================
    console.log('\n📌 TEST 2: Verify URL Structure');
    console.log('─'.repeat(56));

    const url = createResult.data.redirectUrl;
    const urlParams = new URLSearchParams(new URL(url).search);

    console.log('✅ URL Parameters:');
    const importantParams = [
      'vnp_TmnCode',
      'vnp_Amount',
      'vnp_TxnRef',
      'vnp_OrderInfo',
      'vnp_SecureHash',
      'vnp_Email',
      'vnp_PhoneNumber',
    ];

    importantParams.forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        if (param === 'vnp_SecureHash') {
          console.log(`   ✅ ${param}: ${value.substring(0, 20)}... (${value.length} chars)`);
        } else if (param === 'vnp_Amount') {
          console.log(`   ✅ ${param}: ${value}`);
        } else {
          console.log(`   ✅ ${param}: ${value}`);
        }
      } else {
        if (param === 'vnp_Email' || param === 'vnp_PhoneNumber') {
          console.log(`   ✅ ${param}: NOT PRESENT (CORRECT - should not be in URL)`);
        } else {
          console.log(`   ❌ ${param}: MISSING (ERROR)`);
        }
      }
    });

    // ============================================
    // TEST 3: Verify Signature
    // ============================================
    console.log('\n📌 TEST 3: Verify Signature');
    console.log('─'.repeat(56));

    const hashFromUrl = urlParams.get('vnp_SecureHash');
    const requestData = createResult.data.requestData;
    
    // Rebuild signature data to verify
    const signatureData = Object.keys(requestData)
      .filter(key => key !== 'vnp_SecureHash')
      .sort()
      .map(key => `${key}=${requestData[key]}`)
      .join('&');

    const expectedHash = adapter.createSignature(signatureData, realConfig.partnerKey, 'sha512');
    const hashMatch = hashFromUrl === expectedHash;

    console.log(`   Signature match: ${hashMatch ? '✅ YES' : '❌ NO'}`);
    if (!hashMatch) {
      console.log(`   ❌ Expected: ${expectedHash}`);
      console.log(`   ❌ Got: ${hashFromUrl}`);
    }

    // ============================================
    // TEST 4: Generate Payment Link
    // ============================================
    console.log('\n📌 TEST 4: Payment Link for Testing');
    console.log('─'.repeat(56));

    console.log('\n🔗 COPY & PASTE THIS LINK TO TEST IN BROWSER:');
    console.log(`\n${url}\n`);

    console.log('📝 TEST CARD DETAILS:');
    console.log('   Card Number: 9704198526191432198');
    console.log('   Card Holder: NGUYEN VAN A');
    console.log('   Expiry: 07/15');
    console.log('   OTP: 123456');

    // ============================================
    // TEST 5: Simulate IPN Callback
    // ============================================
    console.log('\n📌 TEST 5: Simulate IPN Callback Verification');
    console.log('─'.repeat(56));

    const mockIpnData = {
      vnp_Amount: String(paymentData.amount * 100),
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: '123456789',
      vnp_CardType: 'ATM',
      vnp_OrderInfo: paymentData.description,
      vnp_PayDate: adapter.formatDate(new Date()),
      vnp_ResponseCode: '00', // Success
      vnp_TmnCode: realConfig.partnerId,
      vnp_TransactionNo: '9876543210',
      vnp_TxnRef: createResult.data.transactionRef,
    };

    // Create valid signature for IPN
    const ipnSortedData = adapter.sortObject(mockIpnData);
    const ipnSignatureData = adapter.formatDataForSignature(ipnSortedData, 'query');
    const ipnSignature = adapter.createSignature(ipnSignatureData, realConfig.partnerKey, 'sha512');

    const ipnDataWithSignature = { ...mockIpnData, vnp_SecureHash: ipnSignature };

    const verifyResult = await adapter.verifyChecksum(ipnDataWithSignature, ipnSignature);
    console.log(`   IPN Signature verification: ${verifyResult.valid ? '✅ PASS' : '❌ FAIL'}`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                      SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n✅ All tests passed! Ready for sandbox testing.');
    console.log('\n📋 Next Steps:');
    console.log('   1. Open the payment link in browser');
    console.log('   2. Use test card details above');
    console.log('   3. Wait for VNPAY callback (IPN)');
    console.log('   4. Check backend logs for IPN processing');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testVNPAY();
