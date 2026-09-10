/**
 * VNPAY Quick Test Script
 * 
 * Sử dụng để test thanh toán VNPAY Sandbox nhanh chóng
 * 
 * Chạy: npm run test:vnpay hoặc node test/vnpay-quick.test.js
 * 
 * Kết quả:
 * - In ra URL thanh toán
 * - Verify signature
 * - Copy URL vào browser để test
 */

const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const VnpayAdapter = require('../adapters/payment/VnpayAdapter');

// Real config từ .env
const realConfig = {
  partnerId: process.env.VNPAY_TMN_CODE,
  partnerKey: process.env.VNPAY_HASH_SECRET,
  endpoint: process.env.VNPAY_ENDPOINT,
  returnUrl: process.env.VNPAY_RETURN_URL,
  callbackUrl: process.env.VNPAY_CALLBACK_URL,
};



// Validate config
if (!realConfig.partnerId || !realConfig.partnerKey) {
  throw new Error('VNPAY_TMN_CODE and VNPAY_HASH_SECRET are required');
}

async function testVNPAY() {
  try {
    const adapter = new VnpayAdapter(realConfig);
    adapter.validateConfig();


    // ============================================
    // TEST 1: Tạo Payment URL
    // ============================================

    const timestamp = Date.now();
    const testOrderId = `TEST-${timestamp}`;
    
    const paymentData = {
      orderId: testOrderId,
      amount: 100000, // 100,000 VND
      currency: 'VND',
      description: `Test payment ${testOrderId}`,
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        phone: '0912345678',
      },
      clientIp: '127.0.0.1',
    };

    const createResult = await adapter.createPaymentUrl(paymentData);

    assert.equal(createResult.success, true, 'VNPAY payment URL creation failed');
    assert.ok(createResult.data?.redirectUrl, 'VNPAY redirect URL is missing');
    assert.ok(createResult.data?.requestData, 'VNPAY request data is missing');


    // ============================================
    // TEST 2: Verify URL Structure
    // ============================================

    const url = createResult.data.redirectUrl;
    const urlParams = new URLSearchParams(new URL(url).search);

    ['vnp_TmnCode', 'vnp_Amount', 'vnp_TxnRef', 'vnp_OrderInfo', 'vnp_SecureHash']
      .forEach((param) => assert.ok(urlParams.get(param), `${param} is missing from payment URL`));
    assert.equal(urlParams.get('vnp_TmnCode'), realConfig.partnerId);
    assert.equal(urlParams.get('vnp_Amount'), '10000000');

    // ============================================
    // TEST 3: Verify Signature
    // ============================================

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

    assert.equal(hashMatch, true, 'VNPAY payment URL signature is invalid');

    // ============================================
    // TEST 4: Generate Payment Link
    // ============================================



    // ============================================
    // TEST 5: Simulate IPN Callback
    // ============================================

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
    assert.equal(verifyResult.valid, true, verifyResult.error || 'VNPAY IPN signature is invalid');

    // ============================================
    // SUMMARY
    // ============================================

  } catch (error) {
    process.exit(1);
  }
}

testVNPAY();
