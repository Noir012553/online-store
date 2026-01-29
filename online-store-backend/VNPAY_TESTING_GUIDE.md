# VNPAY Sandbox Testing Guide

## 📋 Overview

Hướng dẫn toàn diện để test thanh toán VNPAY Sandbox.

---

## 🚀 Quick Start (1 phút)

### **Chạy Quick Test Script**

```bash
npm run test:vnpay
```

**Output:**
- ✅ Verify config từ .env
- ✅ Tạo payment URL
- ✅ Verify signature
- ✅ In ra payment link
- ✅ Test IPN callback

---

## 📊 Test Scenarios

### **Scenario 1: Quick Test (Fastest)**

```bash
# Chạy script nhanh
npm run test:vnpay

# Kết quả:
# - Payment URL đã tạo
# - Copy link từ console
# - Paste vào browser
```

**Mất thời gian:** ~5 giây  
**Kiểm tra được:** Signature, URL structure, IPN verification

---

### **Scenario 2: Run Full Unit Tests**

```bash
npm test
```

**Mất thời gian:** ~30 giây  
**Kiểm tra được:** Tất cả edge cases

---

### **Scenario 3: Watch Mode (Development)**

```bash
npm run test:vnpay:watch
```

**Mất thời gian:** Liên tục  
**Kiểm tra được:** Auto reload khi code thay đổi

---

## 🧪 Manual Sandbox Test (Browser)

### **Step 1: Get Payment Link**

```bash
npm run test:vnpay
```

Sẽ in ra URL như:
```
https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=10000000&vnp_Command=pay&...
```

### **Step 2: Copy & Paste Link to Browser**

Mở link trên và test.

### **Step 3: Use Test Card**

| Field | Value |
|-------|-------|
| Card Number | 9704198526191432198 |
| Card Holder | NGUYEN VAN A |
| Expiry | 07/15 |
| OTP | 123456 |

### **Step 4: Wait for Result**

VNPAY sẽ redirect về `VNPAY_RETURN_URL` (từ .env)

```
https://manln.online/return
```

### **Step 5: Check Backend Logs**

```
npm run dev
```

Xem logs:
```
🔐 VNPAY SIGNATURE CALCULATION...
✅ Payment URL created successfully
[VNPAY IPN] Processing webhook callback...
```

---

## 🔍 Debugging

### **Check Config**

```bash
npm run test:vnpay
```

Xem section "CONFIGURATION" để verify:
- ✅ Terminal ID
- ✅ Secret Key (length)
- ✅ Endpoint URL
- ✅ Return URL
- ✅ Callback URL

### **Verify Signature**

```bash
npm run test:vnpay
```

Xem section "TEST 3: Verify Signature" để check:
- ✅ Signature match: YES/NO
- ✅ Hash length: 128 chars (HMAC-SHA512)

### **Check URL Parameters**

```bash
npm run test:vnpay
```

Xem section "TEST 2: Verify URL Structure":
- ✅ vnp_TmnCode
- ✅ vnp_Amount (nhân 100)
- ✅ vnp_TxnRef
- ✅ vnp_OrderInfo
- ✅ vnp_SecureHash
- ✅ vnp_Email: NOT PRESENT (CORRECT!)
- ✅ vnp_PhoneNumber: NOT PRESENT (CORRECT!)

---

## 🛠️ Troubleshooting

### **Error: Code 70 (Invalid Request)**

```bash
npm run test:vnpay
```

Check:
1. ✅ VNPAY_TMN_CODE = 5G8P0VEL
2. ✅ VNPAY_HASH_SECRET length = 34 chars (no spaces)
3. ✅ IPN URL configured in VNPAY Dashboard:
   - https://backend.manln.online/api/payments/webhook/vnpay

**Fix:** Update VNPAY Dashboard IPN URL (see VNPAY_TESTING_GUIDE.md)

---

### **Error: Code 99 (Signature Mismatch)**

```bash
npm run test:vnpay
```

Check:
1. ✅ vnp_Email NOT in URL
2. ✅ vnp_PhoneNumber NOT in URL
3. ✅ Signature match: YES (from test output)
4. ✅ Hash length = 128 chars

**Status:** ✅ FIXED in VnpayAdapter.js

---

### **Error: Code 09 (Transaction Not Exist)**

This means:
- ❌ Card details wrong
- ❌ Amount wrong
- ❌ Transaction expired

**Fix:** Use correct test card details

---

## 📝 Test Results Format

```
╔════════════════════════════════════════════════════════╗
║        VNPAY Quick Test - Sandbox Testing              ║
╚════════════════════════════════════════════════════════╝

📋 CONFIGURATION:
   Partner ID (TMN Code): 5G8P0VEL
   Secret Key length: 34 chars
   Secret Key (masked): A6RUZCM16R***PBX94
   Endpoint: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
   Return URL: https://manln.online/return
   Callback URL: https://backend.manln.online/vnpay-api/webhook/vnpay

✅ Adapter initialized successfully

📌 TEST 1: Create Payment URL
   ✅ Payment URL created successfully
   Order ID: TEST-1704067200000
   Amount: 100,000 VND
   Transaction Ref: TEST-1704067200000-1704067200000
   Hash length: 128 chars (should be 128)

📌 TEST 2: Verify URL Structure
   ✅ URL Parameters:
   ✅ vnp_TmnCode: 5G8P0VEL
   ✅ vnp_Amount: 10000000
   ✅ vnp_TxnRef: TEST-1704067200000-1704067200000
   ✅ vnp_OrderInfo: Test payment TEST-1704067200000
   ✅ vnp_SecureHash: dae14ead... (128 chars)
   ✅ vnp_Email: NOT PRESENT (CORRECT - should not be in URL)
   ✅ vnp_PhoneNumber: NOT PRESENT (CORRECT - should not be in URL)

📌 TEST 3: Verify Signature
   Signature match: ✅ YES

📌 TEST 4: Payment Link for Testing
   🔗 COPY & PASTE THIS LINK TO TEST IN BROWSER:
   https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...

📝 TEST CARD DETAILS:
   Card Number: 9704198526191432198
   Card Holder: NGUYEN VAN A
   Expiry: 07/15
   OTP: 123456

📌 TEST 5: Simulate IPN Callback Verification
   IPN Signature verification: ✅ PASS

╔════════════════════════════════════════════════════════╗
║                      SUMMARY                            ║
╚════════════════════════════════════════════════════════╝

✅ All tests passed! Ready for sandbox testing.

📋 Next Steps:
   1. Open the payment link in browser
   2. Use test card details above
   3. Wait for VNPAY callback (IPN)
   4. Check backend logs for IPN processing
```

---

## 🔗 Useful Links

- VNPAY Sandbox: https://sandbox.vnpayment.vn/apis/vnpay-demo/
- VNPAY Admin: https://sandbox.vnpayment.vn/merchantv2/
- VNPAY Docs: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
- Test Card SIT: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login

---

## 📞 Support

If tests fail:
1. Check backend logs: `npm run dev`
2. Run quick test: `npm run test:vnpay`
3. Verify .env config
4. Check VNPAY Dashboard IPN URL

---

## ✅ Checklist Before Production

- [ ] Test card payment works (Code 00)
- [ ] IPN callback received
- [ ] Order status updated
- [ ] Email notification sent
- [ ] Return URL redirect works
- [ ] Error handling for failed payments
- [ ] Rate limiting enabled
- [ ] HTTPS enforced

---

**Last Updated:** 2025-01-25  
**Status:** ✅ All tests passing
