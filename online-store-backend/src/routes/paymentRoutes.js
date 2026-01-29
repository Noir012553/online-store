/**
 * Payment Routes
 *
 * Endpoints:
 * POST   /api/payments/initiate          - Tạo payment session
 * GET    /api/payments/gateways          - Danh sách gateway
 * GET    /api/payments/debug             - Debug status (dev only)
 * GET    /api/payments/confirm/:orderId  - Xác nhận thanh toán
 * POST   /api/payments/webhook/:gateway  - Webhook callback
 * GET    /api/payments/history/:orderId  - Lịch sử thanh toán
 * GET    /api/payments/:paymentId        - Chi tiết payment
 * POST   /api/payments/:paymentId/refund - Hoàn tiền
 * GET    /api/payments                   - Danh sách tất cả payments (admin)
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const asyncHandler = require('express-async-handler');
const paymentService = require('../services/paymentService');
const Order = require('../models/Order');
const Product = require('../models/Product');

// Webhook endpoint - không cần auth (nhưng verify signature)
// PHẢI để trước các route khác để tránh conflict
// QUAN TRỌNG: Chấp nhận cả GET và POST vì VNPAY gửi GET request callback
router.all('/webhook/:gateway', paymentController.handleWebhook);

// ⚠️ VNPAY Callback Alias - Nếu VNPAY Dashboard cấu hình URL khác
// VD: https://backend.manln.online/vnpay-api/webhook/vnpay
// Forward tới /api/payments/webhook/vnpay
router.all('/vnpay-api/webhook/:gateway', paymentController.handleWebhook);

// Public endpoint
router.get('/gateways', paymentController.getSupportedGateways);

// Debug endpoint (chỉ cho development)
router.get('/debug/status', asyncHandler(async (req, res) => {
  const supportedGateways = paymentService.getSupportedGateways();
  const envVars = {
    VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE ? '✅ SET' : '❌ NOT SET',
    VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET ? '✅ SET' : '❌ NOT SET',
    VNPAY_ENDPOINT: process.env.VNPAY_ENDPOINT || '❌ NOT SET',
    VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL || '❌ NOT SET',
    VNPAY_CALLBACK_URL: process.env.VNPAY_CALLBACK_URL || '❌ NOT SET',
  };

  res.status(200).json({
    success: true,
    data: {
      supportedGateways,
      gatewayCount: supportedGateways.length,
      environmentVariables: envVars,
      status: supportedGateways.length > 0 ? '✅ Ready for payment' : '❌ No payment gateways configured',
      hint: 'If no gateways are configured, check environment variables in PaymentService.js'
    }
  });
}));

// Debug endpoint: Complete flow test - Create payment + webhook for specific order
router.post('/debug/test-complete-flow', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available in development mode'
    });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      error: 'Missing orderId in request body',
      hint: 'Example: { "orderId": "696b670b041e2f97fa56677c" }'
    });
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       [DEBUG] COMPLETE PAYMENT FLOW TEST                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n📋 Testing order:', orderId);

  try {
    // Step 1: Create payment session
    console.log('\n📋 STEP 1: Creating Payment Session...');
    const paymentResult = await paymentService.initiatePayment(
      orderId,
      'vnpay',
      28556000, // Amount for this order
      {},
      {
        clientIp: '127.0.0.1',
        description: `Test payment for order ${orderId}`,
      }
    );

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create payment',
        details: paymentResult.error
      });
    }

    console.log('✅ Payment session created');
    const paymentId = paymentResult.data.paymentId;
    const requestData = paymentResult.data.requestData;
    console.log('   - Payment ID:', paymentId);
    console.log('   - Transaction Ref:', requestData.vnp_TxnRef);

    // Step 2: Create webhook payload
    console.log('\n📋 STEP 2: Creating Webhook Payload...');
    const vnpayAdapter = paymentService.adapters['vnpay'];

    const createDate = new Date();
    const year = createDate.getFullYear();
    const month = String(createDate.getMonth() + 1).padStart(2, '0');
    const day = String(createDate.getDate()).padStart(2, '0');
    const hours = String(createDate.getHours()).padStart(2, '0');
    const minutes = String(createDate.getMinutes()).padStart(2, '0');
    const seconds = String(createDate.getSeconds()).padStart(2, '0');
    const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

    const amountForVnpay = Math.round(28556000 * 100);

    const testPayload = {
      vnp_Amount: String(amountForVnpay),
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: 'TEST-' + Date.now(),
      vnp_CardType: 'ATM',
      vnp_Command: 'pay',
      vnp_CreateDate: vnpCreateDate,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: requestData.vnp_OrderInfo,
      vnp_OrderType: '190000',
      vnp_PayDate: vnpCreateDate,
      vnp_ResponseCode: '00', // Success
      vnp_TmnCode: process.env.VNPAY_TMN_CODE,
      vnp_TransactionNo: 'TEST-' + Date.now(),
      vnp_TxnRef: requestData.vnp_TxnRef, // Use same TxnRef from payment
      vnp_Version: '2.1.0',
    };

    // Calculate signature
    const sortedData = Object.keys(testPayload)
      .sort()
      .reduce((acc, key) => {
        acc[key] = testPayload[key];
        return acc;
      }, {});

    const signatureData = Object.keys(sortedData)
      .map(key => `${key}=${String(sortedData[key])}`)
      .join('&');

    const crypto = require('crypto');
    const secretKey = process.env.VNPAY_HASH_SECRET.trim();
    const signature = crypto.createHmac('sha512', secretKey)
      .update(signatureData)
      .digest('hex');

    const finalPayload = {
      ...testPayload,
      vnp_SecureHash: signature,
    };

    console.log('✅ Webhook payload created');
    console.log('   - Amount:', amountForVnpay);
    console.log('   - TxnRef:', finalPayload.vnp_TxnRef);
    console.log('   - Signature:', signature.substring(0, 40) + '...');

    // Step 3: Send webhook
    console.log('\n📋 STEP 3: Sending Webhook Callback...');
    console.log('   - Endpoint: POST /api/payments/webhook/vnpay');

    const axios = require('axios');
    const backendUrl = `http://localhost:${process.env.PORT || 5000}`;
    const webhookUrl = `${backendUrl}/api/payments/webhook/vnpay`;

    const webhookResponse = await axios.post(webhookUrl, finalPayload, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('✅ Webhook response received');
    console.log('   - Status:', webhookResponse.status);
    console.log('   - Success:', webhookResponse.data.success);
    console.log('   - Message:', webhookResponse.data.message);

    // Step 4: Verify payment was updated
    if (webhookResponse.data.success) {
      console.log('\n📋 STEP 4: Verifying Payment Update...');
      const Payment = require('../models/Payment');
      const updatedPayment = await Payment.findById(paymentId);

      if (updatedPayment) {
        console.log('✅ Payment record updated');
        console.log('   - Status:', updatedPayment.status);
        console.log('   - Gateway TxnID:', updatedPayment.gatewayTransactionId);
        console.log('   - Webhook Verified:', updatedPayment.webhookVerified);
      }
    }

    res.status(200).json({
      success: webhookResponse.data.success,
      message: 'Complete flow test finished',
      details: {
        orderId,
        paymentId,
        webhook: webhookResponse.data,
        payload: finalPayload,
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
      stack: error.stack.split('\n').slice(0, 5)
    });
  }
}));

// Debug endpoint: Test VNPAY configuration
router.get('/debug/vnpay-config', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available in development mode'
    });
  }

  const config = {
    VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE,
    VNPAY_HASH_SECRET: '***' + (process.env.VNPAY_HASH_SECRET?.substring(process.env.VNPAY_HASH_SECRET.length - 5) || ''),
    VNPAY_HASH_SECRET_LENGTH: process.env.VNPAY_HASH_SECRET?.length || 0,
    VNPAY_ENDPOINT: process.env.VNPAY_ENDPOINT,
    VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL,
    VNPAY_CALLBACK_URL: process.env.VNPAY_CALLBACK_URL,
  };

  const checklist = {
    '✅ Terminal ID (vnp_TmnCode)': {
      value: config.VNPAY_TMN_CODE,
      expected: '5G8P0VEL',
      match: config.VNPAY_TMN_CODE === '5G8P0VEL'
    },
    '✅ Secret Key Length': {
      value: config.VNPAY_HASH_SECRET_LENGTH,
      expected: '32 or 34 characters',
      match: config.VNPAY_HASH_SECRET_LENGTH === 32 || config.VNPAY_HASH_SECRET_LENGTH === 34
    },
    '✅ Endpoint': {
      value: config.VNPAY_ENDPOINT,
      expected: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      match: config.VNPAY_ENDPOINT === 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    },
    '⚠️  Return URL (in VNPAY Dashboard)': {
      value: config.VNPAY_RETURN_URL,
      expected: 'https://manln.online/return',
      info: 'Verify this URL is configured in VNPAY Dashboard > Cấu hình > Return URL'
    },
    '⚠️  Callback URL (in VNPAY Dashboard)': {
      value: config.VNPAY_CALLBACK_URL,
      expected: 'https://backend.manln.online/vnpay-api/webhook/vnpay',
      info: 'Must match IPN URL in VNPAY Dashboard > Cấu hình > IPN URL'
    }
  };

  res.status(200).json({
    success: true,
    config,
    checklist,
    action_items: [
      '1️⃣  Verify Terminal ID (vnp_TmnCode) matches VNPAY email',
      '2️⃣  Verify Secret Key is copied correctly from VNPAY email',
      '3️⃣  Login to https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login',
      '4️⃣  Check IPN URL matches VNPAY_CALLBACK_URL in .env',
      '5️⃣  Check Return URL matches VNPAY_RETURN_URL in .env',
      '6️⃣  Whitelist your server IP in VNPAY Dashboard (if required)',
      '7️⃣  Click "Sửa" (Edit) to update any URLs in VNPAY Dashboard'
    ]
  });
}));

// Debug endpoint: Test VNPAY signature calculation WITHOUT needing a real order
router.post('/debug/test-signature', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available in development mode'
    });
  }

  const { orderId, amount = 1000000 } = req.body;

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        [DEBUG] VNPAY SIGNATURE TEST - Manually trigger       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Nếu không provide orderId, lấy từ list orders chưa thanh toán
  let testOrderId = orderId;

  if (!testOrderId) {
    console.log('\n⚠️  No orderId provided, getting one from database...');
    const unpaidOrder = await Order.findOne({ isPaid: false, isDeleted: false })
      .select('_id totalPrice')
      .lean();

    if (!unpaidOrder) {
      console.log('❌ No unpaid orders found in database');
      console.log('   Please provide orderId in request body or create an order first');

      // Tạo test order nếu cần
      const testProduct = await Product.findOne().select('_id name price').lean();
      if (testProduct) {
        const testOrder = new Order({
          orderItems: [
            {
              name: testProduct.name || 'Test Product',
              qty: 1,
              image: testProduct.image || '',
              price: testProduct.price || 100000,
              product: testProduct._id,
            }
          ],
          itemsPrice: testProduct.price || 100000,
          taxPrice: 0,
          totalPrice: testProduct.price || 100000,
          isPaid: false,
          paymentMethod: 'card',
          shippingAddress: {
            name: 'Test Customer',
            phone: '0912345678',
            address: 'Test Address',
          },
        });

        await testOrder.save();
        testOrderId = testOrder._id.toString();
        console.log(`✅ Test order created: ${testOrderId}`);
      } else {
        return res.status(400).json({
          success: false,
          error: 'No products found. Please seed database first (npm run seed)',
          hint: 'Provide orderId as string (valid MongoDB ObjectId) in request body'
        });
      }
    } else {
      testOrderId = unpaidOrder._id.toString();
      console.log(`✅ Using unpaid order: ${testOrderId}`);
      console.log(`   Total: ${unpaidOrder.totalPrice} VNĐ`);
    }
  }

  try {
    const result = await paymentService.initiatePayment(
      testOrderId,
      'vnpay',
      amount,
      {},
      {
        clientIp: req.ip || '127.0.0.1',
        description: 'Test payment - DEBUG',
      }
    );

    if (result.success) {
      console.log('\n✅ TEST PASSED - Payment URL created successfully');
      res.status(200).json({
        success: true,
        message: 'Signature test successful',
        data: {
          paymentId: result.data.paymentId,
          redirectUrl: result.data.redirectUrl,
          orderId: testOrderId,
          note: 'Check backend logs for detailed signature calculation info'
        }
      });
    } else {
      console.log('\n❌ TEST FAILED');
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Test helper: Test VNPAY webhook with proper signature
router.post('/debug/test-webhook', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available in development mode'
    });
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          [DEBUG] VNPAY WEBHOOK TEST - COMPREHENSIVE            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Lấy order chưa thanh toán gần đây
  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice')
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (orders.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No unpaid orders found. Create one first.',
      hint: 'POST /api/payments/debug/create-test-order'
    });
  }

  const order = orders[0];
  const orderId = order._id.toString();
  const amount = order.totalPrice;

  const vnpayAdapter = paymentService.adapters['vnpay'];
  if (!vnpayAdapter) {
    return res.status(400).json({
      success: false,
      error: 'VNPAY adapter not initialized',
    });
  }

  // Tạo test payload
  const createDate = new Date();
  const year = createDate.getFullYear();
  const month = String(createDate.getMonth() + 1).padStart(2, '0');
  const day = String(createDate.getDate()).padStart(2, '0');
  const hours = String(createDate.getHours()).padStart(2, '0');
  const minutes = String(createDate.getMinutes()).padStart(2, '0');
  const seconds = String(createDate.getSeconds()).padStart(2, '0');
  const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const txnRef = `${orderId}-${Date.now()}`;
  const amountForVnpay = Math.round(amount * 100);

  const testPayload = {
    vnp_Amount: String(amountForVnpay), // ✅ MUST BE STRING
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: 'TEST12345678',
    vnp_CardType: 'ATM',
    vnp_Command: 'pay',
    vnp_CreateDate: vnpCreateDate,
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanhtoandonhang${orderId}`,
    vnp_OrderType: '190000',
    vnp_PayDate: vnpCreateDate,
    vnp_ResponseCode: '00', // Success
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: 'TEST-' + Date.now(),
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };

  // Sắp xếp và tính signature
  const sortedData = Object.keys(testPayload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = testPayload[key];
      return acc;
    }, {});

  const signatureData = Object.keys(sortedData)
    .map(key => `${key}=${String(sortedData[key])}`)
    .join('&');

  const crypto = require('crypto');
  const secretKey = process.env.VNPAY_HASH_SECRET.trim();
  const signature = crypto.createHmac('sha512', secretKey)
    .update(signatureData)
    .digest('hex');

  const finalPayload = {
    ...testPayload,
    vnp_SecureHash: signature,
  };

  console.log('\n✅ STEP 1: Test Payload Generated');
  console.log('   - Order ID:', orderId);
  console.log('   - Amount:', amount, 'VND');
  console.log('   - Amount (VNPAY format):', amountForVnpay);
  console.log('   - TxnRef:', txnRef);

  console.log('\n✅ STEP 2: Signature Calculation');
  console.log('   - Signature Data:', signatureData.substring(0, 100) + '...');
  console.log('   - Secret Key Length:', secretKey.length);
  console.log('   - Calculated Signature:', signature);

  console.log('\n✅ STEP 3: Sending Test Webhook...');
  console.log('   - Endpoint: POST /api/payments/webhook/vnpay');
  console.log('   - Method: Making internal POST request');

  // Send webhook to itself
  try {
    const axios = require('axios');
    const backendUrl = `http://localhost:${process.env.PORT || 5000}`;
    const webhookUrl = `${backendUrl}/api/payments/webhook/vnpay`;

    console.log('   - URL:', webhookUrl);

    const webhookResponse = await axios.post(webhookUrl, finalPayload, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('\n✅ STEP 4: Webhook Response Received');
    console.log('   - Status:', webhookResponse.status);
    console.log('   - Success:', webhookResponse.data.success);
    console.log('   - Message:', webhookResponse.data.message);

    if (webhookResponse.data.success) {
      console.log('   ✅ WEBHOOK VERIFIED SUCCESSFULLY!');
    } else {
      console.log('   ❌ Webhook processing failed');
      console.log('   - Reason:', webhookResponse.data.message);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook test completed',
      details: {
        orderTested: orderId,
        payloadSent: finalPayload,
        webhookResponse: webhookResponse.data,
        signature: {
          calculated: signature,
          length: signature.length,
        }
      }
    });
  } catch (error) {
    console.error('\n❌ WEBHOOK TEST FAILED');
    console.error('   Error:', error.message);

    res.status(200).json({
      success: false,
      message: 'Webhook test failed',
      error: error.message,
      testPayload: finalPayload,
      signature: {
        calculated: signature,
        length: signature.length,
      }
    });
  }
}));

// Test helper: Simulate VNPAY webhook callback (get URL instead of POST)
router.get('/debug/simulate-webhook', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available in development mode'
    });
  }

  // Lấy payment hoàn thành gần đây (hoặc tạo test order mới)
  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice')
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (orders.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No unpaid orders found. Create one first using POST /api/payments/debug/create-test-order',
    });
  }

  const order = orders[0];
  const orderId = order._id.toString();
  const amount = order.totalPrice;

  // Tạo VNPAY payload tương tự như callback từ VNPAY
  // Tính toán signature
  const vnpayAdapter = paymentService.adapters['vnpay'];
  if (!vnpayAdapter) {
    return res.status(400).json({
      success: false,
      error: 'VNPAY adapter not initialized',
    });
  }

  // Tạo test data (giả lập VNPAY callback)
  const createDate = new Date();
  const year = createDate.getFullYear();
  const month = String(createDate.getMonth() + 1).padStart(2, '0');
  const day = String(createDate.getDate()).padStart(2, '0');
  const hours = String(createDate.getHours()).padStart(2, '0');
  const minutes = String(createDate.getMinutes()).padStart(2, '0');
  const seconds = String(createDate.getSeconds()).padStart(2, '0');
  const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const txnRef = `${orderId}-${Date.now()}`;
  const amountForVnpay = Math.round(amount * 100); // VNPAY format

  // Payload giống như VNPAY sẽ gửi
  const testPayload = {
    vnp_Amount: amountForVnpay.toString(),
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: '12345678',
    vnp_CardType: 'ATM',
    vnp_Command: 'pay',
    vnp_CreateDate: vnpCreateDate,
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Payment for order ${orderId}`,
    vnp_OrderType: '190000',
    vnp_PayDate: vnpCreateDate,
    vnp_ResponseCode: '00', // Success
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: '12345678',
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };

  // Sắp xếp theo alphabet để tính signature
  const sortedData = Object.keys(testPayload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = testPayload[key];
      return acc;
    }, {});

  // Tính signature bằng cách tương tự như VNPAY
  const signatureString = Object.keys(sortedData)
    .map(key => `${key}=${sortedData[key]}`)
    .join('&');

  const crypto = require('crypto');
  const secretKey = process.env.VNPAY_HASH_SECRET.trim();
  const signature = crypto.createHmac('sha512', secretKey)
    .update(signatureString)
    .digest('hex');

  const finalPayload = {
    ...testPayload,
    vnp_SecureHash: signature,
  };

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     [DEBUG] VNPAY WEBHOOK SIMULATION PAYLOAD GENERATED        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n📋 TEST PAYLOAD:');
  console.log(JSON.stringify(finalPayload, null, 2));

  res.status(200).json({
    success: true,
    message: 'Test webhook payload generated',
    note: 'Copy the query string below and GET /api/payments/webhook/vnpay with these parameters',
    orderId,
    amount,
    queryString: new URLSearchParams(finalPayload).toString(),
    payload: finalPayload,
    testUrl: `/api/payments/webhook/vnpay?${new URLSearchParams(finalPayload).toString()}`,
  });
}));

// Test helper: Lấy danh sách order chưa thanh toán
router.get('/debug/orders', asyncHandler(async (req, res) => {
  const { limit = 10, page = 1 } = req.query;
  const skip = (page - 1) * limit;

  const orders = await Order.find({ isPaid: false, isDeleted: false })
    .select('_id totalPrice orderItems createdAt paymentMethod')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Order.countDocuments({ isPaid: false, isDeleted: false });

  res.status(200).json({
    success: true,
    data: {
      orders: orders.map(order => ({
        orderId: order._id.toString(),
        totalPrice: order.totalPrice,
        itemCount: order.orderItems?.length || 0,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
      hint: 'Copy orderId from the list and use in POST /api/payments/initiate',
    },
  });
}));

// Test helper: Tạo test order
router.post('/debug/create-test-order', asyncHandler(async (req, res) => {
  const { amount = 5000000, itemCount = 1 } = req.body;

  // Lấy product đầu tiên từ DB
  let product = await Product.findOne().lean();

  if (!product) {
    return res.status(400).json({
      success: false,
      error: 'No products found in database. Please seed products first.',
      hint: 'Run: npm run seed'
    });
  }

  // Tạo test order
  const testOrder = new Order({
    orderItems: [
      {
        name: product.name || 'Test Product',
        qty: itemCount,
        image: product.image || '',
        price: Math.floor(amount / itemCount),
        product: product._id,
      }
    ],
    itemsPrice: amount,
    taxPrice: 0,
    totalPrice: amount,
    isPaid: false,
    paymentMethod: 'card',
    shippingAddress: {
      name: 'Test Customer',
      phone: '0912345678',
      address: 'Test Address',
    },
  });

  await testOrder.save();

  res.status(201).json({
    success: true,
    data: {
      orderId: testOrder._id.toString(),
      orderItem: testOrder.orderItems[0],
      totalPrice: testOrder.totalPrice,
      isPaid: testOrder.isPaid,
      hint: 'Copy orderId and use it in POST /api/payments/initiate'
    }
  });
}));

// Private endpoints (cần auth)
// TODO: Thêm authMiddleware khi có
router.post('/initiate', paymentController.initiatePayment);
router.post('/create', paymentController.initiatePayment); // Alias for /initiate
router.get('/confirm/:orderId', paymentController.confirmPayment);
router.get('/history/:orderId', paymentController.getPaymentHistory);
router.get('/:paymentId', paymentController.getPaymentDetails);
router.post('/:paymentId/refund', paymentController.refundPayment);

// Admin endpoints
// TODO: Thêm adminMiddleware khi có
router.get('/', paymentController.getAllPayments);

module.exports = router;
