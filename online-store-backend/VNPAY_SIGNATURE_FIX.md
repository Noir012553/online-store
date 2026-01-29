# 🔐 VNPAY Webhook Signature Verification Fix

## 🐛 The Problem (Lỗi gốc)

Bạn gặp lỗi:
```
❌ SIGNATURE VERIFICATION FAILED!
- Received (lowercase): 5fd57944e9391f749617720d14687bae8b8ff3937c7b56e9a857d65ef6f8e0b07e1ec1ab8f00bfad54b7f525c95b4584401d88d6c777c284a0d8f8b310ca09be
- Expected (lowercase): ec3828e62e75fd6f221d04121988cbe87ca71e7c73164f7cc26c0314304431308996491f4d898ed80afc7906548cf09831a95fd9043bd8cc8e54e57c01cd0736
```

### Root Cause (Nguyên nhân sâu)

Đây là vấn đề kinh điển khi tích hợp VNPAY webhook:

1. **VNPAY tính signature với dấu +:**
   ```
   URL Query: vnp_OrderInfo=Thanh+toan+don+hang+...
   Signature calculated by VNPAY with: Thanh+toan+don+hang...
   ```

2. **Express.js tự động decode query string:**
   ```
   Browser/VNPAY gửi: ?vnp_OrderInfo=Thanh+toan+...
   Express req.query:  {vnp_OrderInfo: "Thanh toan ..."}  (+ được decode → khoảng trắng)
   ```

3. **Code verify không xử lý re-encoding:**
   ```javascript
   // ❌ OLD CODE (WRONG)
   createVnpayIpnSignatureString(sortedData) {
     const parts = [];
     Object.keys(sortedData).forEach(key => {
       const value = String(sortedData[key]);
       // KHÔNG encode → Khớp với Express-decoded value (khoảng trắng)
       parts.push(`${key}=${value}`);
     });
     return parts.join('&');
   }
   ```

4. **Signature mismatch:**
   ```
   VNPAY signature: HMAC-SHA512(Thanh+toan+don+hang...)
   Code verify:     HMAC-SHA512(Thanh toan don hang...)  ← Khác!
   Result: ❌ FAILED
   ```

## ✅ The Solution (Cách sửa)

### File được sửa
- `src/adapters/payment/VnpayAdapter.js` - Line 605-631

### What was changed (Thay đổi)

```javascript
// ✅ NEW CODE (FIXED)
createVnpayIpnSignatureString(sortedData) {
  const parts = [];
  
  Object.keys(sortedData).forEach(key => {
    const value = String(sortedData[key]);
    // ✅ FIX: Re-encode để khớp với signature của VNPAY
    // 1. encodeURIComponent() xử lý ký tự đặc biệt
    // 2. Thay %20 (space) bằng + (standard querystring format)
    let encoded = encodeURIComponent(value);
    encoded = encoded.replace(/%20/g, '+');
    
    parts.push(`${key}=${encoded}`);
  });
  
  return parts.join('&');
}
```

### Why this works (Tại sao nó hoạt động)

1. `encodeURIComponent(value)` - Encode tất cả ký tự đặc biệt
   - Khoảng trắng → `%20`
   - Ký tự khác như `&`, `=`, `?` → `%XX`

2. `encoded.replace(/%20/g, '+')` - Thay `%20` bằng `+`
   - Vì VNPAY dùng standard URL form encoding (space = +)
   - Không phải percent encoding (space = %20)

3. Kết quả là chuỗi matching chính xác với cách VNPAY tính:
   ```
   VNPAY: Thanh+toan+don+hang...
   Our code: Thanh+toan+don+hang...
   ✅ MATCH!
   ```

## 📊 Process Flow (So sánh trước/sau)

### BEFORE (Sai)
```
VNPAY Webhook Query:
  vnp_OrderInfo=Thanh+toan+don+hang+69781d

Express decode:
  req.query.vnp_OrderInfo = "Thanh toan don hang 69781d"  (+ → space)

Signature string for verification:
  "vnp_OrderInfo=Thanh toan don hang 69781d"

VNPAY signature data (để tham khảo):
  "vnp_OrderInfo=Thanh+toan+don+hang+69781d"

Comparison:
  ❌ "Thanh+toan..." ≠ "Thanh toan..."
  FAILED!
```

### AFTER (Sửa)
```
VNPAY Webhook Query:
  vnp_OrderInfo=Thanh+toan+don+hang+69781d

Express decode:
  req.query.vnp_OrderInfo = "Thanh toan don hang 69781d"  (+ → space)

Signature string for verification (NEW):
  encodeURIComponent("Thanh toan don hang 69781d")
  = "Thanh%20toan%20don%20hang%2069781d"
  
  .replace(/%20/g, '+')
  = "Thanh+toan+don+hang+69781d"

VNPAY signature data:
  "vnp_OrderInfo=Thanh+toan+don+hang+69781d"

Comparison:
  ✅ "Thanh+toan..." = "Thanh+toan..."
  SUCCESS!
```

## 🧪 Testing the Fix (Kiểm tra fix)

Sau khi apply fix, webhook từ VNPAY sẽ pass signature verification.

### Expected log output:
```
✅ SIGNATURE VERIFICATION PASSED - Webhook is authentic!
```

Thay vì:
```
❌ SIGNATURE VERIFICATION FAILED!
```

## 📝 How VNPAY Webhook Works (Quy trình)

1. **User thanh toán trên VNPAY** → VNPAY callback IPN
2. **VNPAY gửi webhook (GET)** tới: `/api/payments/webhook/vnpay?vnp_Amount=...&vnp_OrderInfo=Thanh+toan+...`
3. **PaymentController nhận webhook** (line 145-240 in paymentController.js)
4. **PaymentService.handleWebhook()** gọi VnpayAdapter.handleIPN()
5. **VnpayAdapter.verifyChecksum()** kiểm tra signature (line 325-417)
6. **createVnpayIpnSignatureString()** tạo chuỗi để verify (line 620-631) **← FIX ở đây**
7. **HMAC-SHA512** compare với vnp_SecureHash từ VNPAY
8. **Nếu khớp** → Order được mark as paid

## ⚠️ Other Common Issues (Những lỗi khác)

Nếu signature vẫn fail sau fix này, check:

1. **Secret Key (`VNPAY_HASH_SECRET`)**
   - Có trailing/leading spaces không? (Code đã trim ở line 45)
   - Copy chính xác từ VNPAY dashboard không?
   - Check case-sensitive? (VNPAY secret là case-sensitive)

2. **Environment Variables**
   - Check `.env` có đúng `VNPAY_HASH_SECRET` không
   - Không có Unicode BOM ở đầu file không?

3. **Parameter Sorting**
   - Phải sắp xếp A-Z (sortObject() làm việc này)
   - VNPAY yêu cầu các field trong signature data được sắp xếp

4. **Excluded Fields**
   - `vnp_SecureHash` - loại bỏ trước khi verify ✅
   - `vnp_Email`, `vnp_PhoneNumber` - loại bỏ ✅

5. **VNPAY Dashboard Config**
   - IPN URL có đúng không?
   - Có cấu hình webhook trong dashboard không?
   - Check log trong VNPAY dashboard

## 🔗 References

- VNPAY Docs: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
- VNPAY Dashboard: https://sandbox.vnpayment.vn/merchantv2/
- RFC 3986 (URL Encoding): https://tools.ietf.org/html/rfc3986

## ✅ Checklist Before Testing

- [ ] Apply fix tới `VnpayAdapter.js`
- [ ] Check `.env` có đúng `VNPAY_HASH_SECRET` không
- [ ] Check `.env` có đúng `VNPAY_TMN_CODE` không
- [ ] Check `.env` có đúng `VNPAY_RETURN_URL` không
- [ ] VNPAY dashboard có configure IPN URL không?
- [ ] MongoDB connection working?
- [ ] Backend running on correct port?
