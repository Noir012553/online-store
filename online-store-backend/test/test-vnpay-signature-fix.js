#!/usr/bin/env node

/**
 * Test script để verify VNPAY signature fix
 * 
 * Kiểm tra:
 * 1. Chuỗi signature được tạo đúng (với + thay vì space)
 * 2. HMAC-SHA512 được tính đúng
 * 3. Fix hoạt động cho webhook từ VNPAY
 * 
 * Chạy: npm run test:vnpay:signature hoặc node test/test-vnpay-signature-fix.js
 */

const crypto = require('crypto');

// ============================================
// Simulate VNPAY webhook data (như VNPAY gửi)
// ============================================

// VNPAY gửi webhook với dấu +
const vnpayWebhookUrl = '/api/payments/webhook/vnpay?vnp_Amount=4830050000&vnp_BankCode=NCB&vnp_BankTranNo=VNP15411683&vnp_CardType=ATM&vnp_OrderInfo=Thanh+toan+don+hang+69781d&vnp_PayDate=20260127090806&vnp_ResponseCode=00&vnp_TmnCode=5G8P0VEL&vnp_TransactionNo=15411683&vnp_TransactionStatus=00&vnp_TxnRef=69781d4587a2d32b280d207a-1769479504891';

// Express tự động decode → space
const expressDecodedData = {
  'vnp_Amount': '4830050000',
  'vnp_BankCode': 'NCB',
  'vnp_BankTranNo': 'VNP15411683',
  'vnp_CardType': 'ATM',
  'vnp_OrderInfo': 'Thanh toan don hang 69781d',  // ← Khác! + được decode → space
  'vnp_PayDate': '20260127090806',
  'vnp_ResponseCode': '00',
  'vnp_TmnCode': '5G8P0VEL',
  'vnp_TransactionNo': '15411683',
  'vnp_TransactionStatus': '00',
  'vnp_TxnRef': '69781d4587a2d32b280d207a-1769479504891'
};

const VNPAY_SECRET = 'A6RUZCM16RI19H8M63R0H6SCQEJPBX94';


// ============================================
// OLD APPROACH (WRONG)
// ============================================

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  keys.forEach(key => {
    sorted[key] = obj[key];
  });
  return sorted;
}

function createVnpayIpnSignatureString_OLD(sortedData) {
  const parts = [];
  Object.keys(sortedData).forEach(key => {
    const value = String(sortedData[key]);
    // ❌ WRONG: Không encode - dùng Express-decoded value (space)
    parts.push(`${key}=${value}`);
  });
  return parts.join('&');
}

const sortedOld = sortObject(expressDecodedData);
const signatureDataOld = createVnpayIpnSignatureString_OLD(sortedOld);


const hashOld = crypto.createHmac('sha512', VNPAY_SECRET)
  .update(signatureDataOld)
  .digest('hex');


// ============================================
// NEW APPROACH (FIXED)
// ============================================

function createVnpayIpnSignatureString_NEW(sortedData) {
  const parts = [];
  Object.keys(sortedData).forEach(key => {
    const value = String(sortedData[key]);
    // ✅ FIXED: Re-encode để khớp với VNPAY
    let encoded = encodeURIComponent(value);
    encoded = encoded.replace(/%20/g, '+');
    parts.push(`${key}=${encoded}`);
  });
  return parts.join('&');
}

const sortedNew = sortObject(expressDecodedData);
const signatureDataNew = createVnpayIpnSignatureString_NEW(sortedNew);


const hashNew = crypto.createHmac('sha512', VNPAY_SECRET)
  .update(signatureDataNew)
  .digest('hex');


// ============================================
// COMPARISON
// ============================================




// ============================================
// Detailed breakdown
// ============================================


const orderInfoValue = 'Thanh toan don hang 69781d';



const encoded = encodeURIComponent(orderInfoValue).replace(/%20/g, '+');



// ============================================
// Final verdict
// ============================================

