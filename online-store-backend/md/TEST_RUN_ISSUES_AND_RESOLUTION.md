# Báo cáo vấn đề và kết quả test backend

## 1. Phạm vi

Tài liệu này tổng hợp các lỗi, warning và vấn đề môi trường đã được phát hiện trong quá trình kiểm tra backend, các thay đổi đã thực hiện để xử lý chúng, cùng kết quả chạy test và khởi động backend gần nhất.

Báo cáo không ghi mật khẩu, token, API secret hoặc nội dung credential thật.

## 2. Kết luận nhanh

Lần chạy đầy đủ gần nhất đã hoàn tất thành công:

```text
Discovered: 38 test files
Passed:     38 test files
Failed:     0 test files
```

Report runtime:

```json
{
  "status": "passed",
  "totals": {
    "discovered": 38,
    "passed": 38,
    "failed": 0
  },
  "failedFiles": [],
  "errors": []
}
```

Backend cũng khởi động thành công:

```text
[STARTUP] mongo-connect completed in 1783ms
[ExchangeRateScheduler] Bắt đầu scheduler (interval: 86400s)
[ExchangeRateScheduler] Bắt đầu cập nhật tỷ giá...
[STARTUP] backend ready
[ExchangeRateScheduler] Không có tỷ giá thay đổi
```

`Không có tỷ giá thay đổi` là trạng thái hợp lệ, không phải lỗi cập nhật database.

Không chạy `npm run build` theo yêu cầu của dự án; việc xác minh tập trung vào syntax check, test runtime và startup backend.

## 3. Phân loại vấn đề

| Nhóm | Vấn đề | Trạng thái |
| --- | --- | --- |
| Lỗi code/i18n | Controller gọi sai namespace hoặc translation key không tồn tại | Đã sửa |
| Lỗi test fixture | Mock request thiếu `req.app`, làm broadcast giả bị warning | Đã sửa |
| Lỗi logic scheduler | Nuốt lỗi database và log `cập nhật thành công: 0` | Đã sửa |
| Lỗi test timing | Test ảnh remote timeout do DNS chậm | Đã sửa bằng timeout riêng |
| Lỗi test migration | Đọc TTL index trước khi Mongoose tạo index | Đã cải thiện test setup |
| Môi trường | MongoDB/`MONGO_URI` từng thiếu hoặc connection bị đóng | Đã giải quyết ở lần chạy cuối |
| Môi trường | Backend chưa chạy port 5000 | Đã giải quyết ở lần chạy cuối |
| Môi trường | JWT secret chưa được nạp | Đã giải quyết ở lần chạy cuối |
| Test có chủ đích | Invalid signature, file quá lớn, ảnh remote lỗi, DB fallback | Không phải failure |

## 4. Các lỗi đã phát hiện và cách xử lý

### 4.1. Translation key không tồn tại

#### Hiện tượng

`getMessage()` log lỗi khi key không tồn tại và trả lại chính chuỗi key:

```text
Translation not found: en/order.noCartItems
Translation not found: vi/product.notFound
Translation not found: vi/product.deletedSuccessfully
Translation not found: vi/admin-controllers-messages.review_deleted
Translation not found: vi/admin-controllers-messages.review_permanently_deleted
```

Cơ chế fallback trong `src/i18n/messages.js` không throw exception. Vì vậy test có thể vẫn pass nhưng response có nguy cơ chứa raw key thay vì câu dịch.

#### Nguyên nhân

Controller dùng namespace/key cũ, trong khi locale hiện tại dùng namespace và tên key khác, chủ yếu là các key dạng snake_case trong `admin-controllers-messages`.

#### Cách sửa

Đã cập nhật các controller:

- `src/controllers/orderController.js`
- `src/controllers/productController.js`
- `src/controllers/reviewController.js`
- `src/controllers/shippingController.js`
- `src/controllers/shipmentController.js`

Một số mapping quan trọng:

```js
'order.notFound'                 -> 'orders.order_not_found'
'order.noCartItems'              -> 'orders.error_cart_empty'
'order.notAuthorized'            -> 'auth.notAuthorized'
'product.notFound'               -> 'api-errors.product_not_found'
'product.insufficientStock'      -> 'errors.insufficient_stock'
'order.invalidPromoCode'         -> 'coupons.error_not_found'
'order.couponExpired'            -> 'coupons.error_coupon_expired'
'order.couponLimitExceeded'      -> 'coupons.error_usage_limit_reached'
'order.couponMinAmount'          -> 'coupons.error_min_order_requirement'
'validation.product.quantityInvalid -> 'validation.quantity.invalid'
```

Các key quản trị sản phẩm/đơn hàng được chuyển sang:

```js
'admin-controllers-messages.product_not_found'
'admin-controllers-messages.product_image_required'
'admin-controllers-messages.product_invalid_price'
'admin-controllers-messages.product_invalid_stock'
'admin-controllers-messages.product_already_deleted'
'admin-controllers-messages.product_deleted'
'admin-controllers-messages.product_not_deleted'
'admin-controllers-messages.order_already_deleted'
'admin-controllers-messages.order_not_deleted'
```

Review dùng key hiện có:

```js
'admin-controllers-messages.review_removed'
'admin-controllers-messages.review_permanently_removed'
```

Đã bổ sung các message còn thiếu trong `admin-controllers-messages.json` cho đủ 9 locale:

```text
vi, en, pt, fr, de, it, es, nl, sv
```

Kiểm tra sau sửa:

```text
All changed message keys resolve in 9 languages
```

### 4.2. Warning Socket.IO broadcast do mock request thiếu `req.app`

#### Hiện tượng

Các test product controller từng in:

```text
Failed to broadcast new product: Cannot read properties of undefined (reading 'get')
Failed to broadcast product update: Cannot read properties of undefined (reading 'get')
Failed to broadcast product delete: Cannot read properties of undefined (reading 'get')
```

#### Nguyên nhân

Production controller gọi:

```js
req.app.get('io')
```

nhưng request mock trong test không có `app`.

#### Cách sửa

Trong:

```text
src/test/controllers/products/productController.test.js
```

đã bổ sung:

```js
app: { get: sandbox.stub().returns(null) }
```

cho các test create, update và delete product.

Kết quả:

```text
productController.test.js: 13 passing
```

Warning broadcast giả không còn xuất hiện trong output product controller.

### 4.3. Scheduler tỷ giá báo thành công không chính xác

#### Hiện tượng

Log cũ:

```text
[ExchangeRateScheduler] Cập nhật thành công: 0 tỷ giá
```

Con số `0` có thể có nghĩa là dữ liệu không thay đổi, nhưng implementation cũ cũng nuốt lỗi database và trả `0`, khiến hai trạng thái bị đánh đồng.

#### Cách sửa

Trong:

```text
src/services/exchangeRateSchedulerService.js
```

đã đổi log:

```js
if (updatedCount > 0) {
  console.log(`[ExchangeRateScheduler] Cập nhật thành công: ${updatedCount} tỷ giá thay đổi`);
} else {
  console.log('[ExchangeRateScheduler] Không có tỷ giá thay đổi');
}
```

Lỗi trong `_updateRate()` không còn bị nuốt:

```js
catch (err) {
  console.error(`[ExchangeRateScheduler] Lỗi cập nhật ${fromCode}->${toCode}:`, err);
  throw err;
}
```

Kết quả startup mới:

```text
[ExchangeRateScheduler] Không có tỷ giá thay đổi
```

Đây là log chính xác khi không có rate nào thay đổi.

### 4.4. TTL index bị kiểm tra quá sớm

#### Hiện tượng

Migration test từng in:

```text
TTL index not yet created (will create on first insert)
```

#### Nguyên nhân

Test gọi `collection.getIndexes()` trước khi Mongoose đồng bộ index từ schema.

#### Cách sửa

Trong:

```text
src/test/translation-migration-smoke.test.js
```

đã gọi tạo index trước khi đọc:

```js
await ProductCatalogTranslationCache.createIndexes();
const indexes = await ProductCatalogTranslationCache.collection.getIndexes();
```

và tương tự cho:

```js
await UserContentTranslationCache.createIndexes();
```

Mục đích là kiểm tra index thực tế trong MongoDB, không skip assertion.

Migration test hiện pass:

```text
10 passing
```

Output diagnostic vẫn có thể in cảnh báo TTL nếu danh sách index chưa thể hiện rõ `expireAfterSeconds`. Đây là mục cần kiểm tra trực tiếp bằng metadata index nếu muốn loại bỏ hoàn toàn log diagnostic, nhưng hiện không làm test fail.

### 4.5. Test ảnh remote bị timeout

#### Hiện tượng

Một số test bị timeout mặc định của Mocha:

```text
Timeout of 2000ms exceeded
```

#### Nguyên nhân

DNS tới hostname `.invalid` trong môi trường test mất hơn 2 giây. Đây là đặc tính network của môi trường, không phải import/export logic bị treo.

#### Cách sửa

Trong:

```text
src/test/import-file-validator.test.js
```

đã đặt timeout riêng 10 giây cho các test network chậm:

```js
}).timeout(10000);
```

Áp dụng cho:

- Remote image không tải được nhưng ZIP vẫn hợp lệ.
- Retry transient remote image failure.
- Retry transient HTTP image failure.

Không tăng timeout toàn bộ suite.

Kết quả:

```text
import-file-validator.test.js: 54 passing
```

## 5. Các vấn đề môi trường từng gặp

### 5.1. MongoDB connection bị đóng

Lỗi cũ:

```text
connection 1 to 159.143.161.57:27017 closed
```

Đây là lỗi database/network, không phải lỗi logic controller.

Ở lần chạy cuối:

```text
✅ Connected to MongoDB
✅ Database check completed
✅ db-state.test.js
```

### 5.2. `MONGO_URI` hoặc `TEST_MONGO_URI` bị thiếu

Lỗi cũ:

```text
MongooseError: The `uri` parameter to `openUri()` must be a string, got "undefined"
```

Tại thời điểm lỗi, migration test gọi `mongoose.connect(process.env.MONGO_URI)` nhưng process không có biến môi trường cần thiết.

Ở lần chạy cuối, MongoDB đã được cấu hình và:

```text
translation-migration-smoke.test.js: 10 passing
```

### 5.3. JWT secret bị thiếu

Lỗi cũ:

```text
JWT access secret is not configured
```

Nguyên nhân là test/app không nạp đủ secret cần thiết. Sau khi môi trường được nạp đúng:

```text
app-readiness.test.js: 3 passing
userController.test.js: 9 passing
```

Không hard-code secret vào source code.

### 5.4. Backend chưa chạy port 5000

Lỗi cũ:

```text
connect ECONNREFUSED 127.0.0.1:5000
```

Sau khi khởi động backend:

```text
[STARTUP] backend ready
```

Các test endpoint và simple test đều pass.

### 5.5. VNPAY timezone

Lỗi cũ do expected phụ thuộc timezone process:

```text
expected '20240115173045' to equal '20240115103045'
```

Kết quả mới:

```text
vnpayAdapter.test.js: 37 passing
vnpay-quick.test.js: passed
vnpay-signature-fix.test.js: passed
```

Các test kiểm tra format VNPAY timezone và zero-padding đều pass.

## 6. Các lỗi cũ đã được xử lý trước hoặc không còn tái hiện

### Duplicate declaration

Report cũ từng có:

```text
Identifier 'SpecKeyRegistry' has already been declared
Identifier 'StaticTranslation' has already been declared
```

Các test liên quan hiện đã load và pass:

- `productController.test.js`
- `translation-api.test.js`
- `translation-helper.test.js`
- `translation-product-cache.test.js`

### Mock controller không khớp contract

Các lỗi trước đây gồm:

```text
Cannot read properties of undefined (reading 'lang')
Cannot read properties of undefined (reading 'toString')
populate is not a function
```

Đây là các vấn đề test fixture/query chain. Sau khi cập nhật mock và môi trường, các suite liên quan đều pass:

- Category.
- Coupon.
- Customer.
- Order.
- Product.
- Review.
- User.

### Lỗi import/export field `specs`

Các test trước đây từng reject product thiếu `specs`, dù sản phẩm có thể hợp lệ mà không có thông số kỹ thuật.

Đã thống nhất:

- Hỗ trợ `specs` canonical.
- Fallback field legacy.
- Cho phép `specs: {}`.
- Không đánh fail chỉ vì sản phẩm không có specs.

### Lỗi ảnh trong ZIP

Đã dùng chung giới hạn ảnh 5 MiB giữa exporter, ZIP importer và Cloudinary. Exporter không giữ reference tới binary asset đã bị bỏ qua do download lỗi hoặc quá lớn.

## 7. Log xuất hiện nhưng không phải failure

Các log sau là nhánh lỗi được test có chủ đích hoặc diagnostic hợp lệ:

### VNPAY validation

```text
[VNPAY.createPaymentUrl] Error: Missing required field: clientIp
[VNPAY.createPaymentUrl] Error: Missing required field: orderId
[VNPAY.createPaymentUrl] Error: Missing required field: amount
[VNPAY.createPaymentUrl] Error: Missing required field: description
❌ VNPAY signature verification failed
```

Các test xác nhận hệ thống reject input/signature không hợp lệ.

### ZIP validation

```text
[ErrorHandler] { code: 'LIMIT_FILE_SIZE' }
```

Đây là test upload ZIP vượt giới hạn.

### Remote image export

```text
[EXPORT_IMAGE_ASSET_SKIPPED]
```

Đây là hành vi đúng khi ảnh remote không tải được nhưng file ZIP vẫn phải hợp lệ.

### Translation fallback

```text
[translationHelper] Error fetching translation with fallback: Error: DB error
[translationHelper] Unknown entity type: unknownType
```

Đây là test mô phỏng database error và entity type không hợp lệ.

### Cloudinary rotation

```text
[CLOUDINARY_ERROR] ... httpCode: 429
[CLOUDINARY_ACCOUNT_ROTATION] ...
```

Đây là test xác nhận chỉ rotation account khi Cloudinary trả rate limit/quota response.

### Language sync

```text
Failed to fetch languages: 401
```

Đây là flow kiểm tra lỗi xác thực, test vẫn pass vì đã xử lý trạng thái reject theo mục tiêu của test.

## 8. Kết quả từng nhóm test quan trọng

| Test suite | Kết quả |
| --- | --- |
| `vnpayAdapter.test.js` | 37 passing |
| `app-readiness.test.js` | 3 passing |
| `cloudinary-service.test.js` | 3 passing |
| `orderController.test.js` | 7 passing |
| `productController.test.js` | 13 passing |
| Review controller tests | Đạt |
| `userController.test.js` | 9 passing |
| `db-state.test.js` | Đạt |
| `frontend-offline-manual.test.js` | 10/10 |
| `import-file-validator.test.js` | 54 passing |
| `translation-migration-smoke.test.js` | 10 passing |
| `translation-product-cache.test.js` | 12 passing |
| `translation-helper.test.js` | 25 passing |
| `shadow-writes.test.js` | Đạt |
| `vnpay-quick.test.js` | Đạt |
| `vnpay-signature-fix.test.js` | Đạt |
| Unified runner | 38/38 passing |

## 9. Các file production đã thay đổi

```text
src/controllers/orderController.js
src/controllers/productController.js
src/controllers/reviewController.js
src/controllers/shipmentController.js
src/controllers/shippingController.js
src/services/exchangeRateSchedulerService.js
```

Locale đã thay đổi:

```text
src/locales/de/admin-controllers-messages.json
src/locales/en/admin-controllers-messages.json
src/locales/es/admin-controllers-messages.json
src/locales/fr/admin-controllers-messages.json
src/locales/it/admin-controllers-messages.json
src/locales/nl/admin-controllers-messages.json
src/locales/pt/admin-controllers-messages.json
src/locales/sv/admin-controllers-messages.json
src/locales/vi/admin-controllers-messages.json
```

## 10. Các file test đã thay đổi

```text
src/test/controllers/products/productController.test.js
src/test/import-file-validator.test.js
src/test/translation-migration-smoke.test.js
```

## 11. Kiểm tra đã thực hiện

Đã hoàn tất:

- JavaScript syntax check.
- Locale JSON validation.
- Kiểm tra translation key ở 9 ngôn ngữ.
- Product controller test.
- Order/review controller test.
- Import validator test.
- Full unified test runner.
- MongoDB state check.
- Translation migration check.
- Backend startup check.
- Cloudinary rotation test.
- VNPAY signature/timezone test.

Full runtime test cuối cùng:

```text
38 discovered
38 passed
0 failed
```

## 12. Trạng thái cuối cùng

Backend hiện đã đạt trạng thái kiểm tra thành công:

- Không còn failure trong 38 test module.
- MongoDB kết nối được.
- Translation system load đủ 684 file cho 9 ngôn ngữ.
- Các controller dùng translation key hợp lệ.
- Scheduler không còn báo thành công giả khi không có thay đổi.
- Product test không còn broadcast warning do mock thiếu `req.app`.
- Import/export remote image test không còn timeout giả.
- VNPAY test pass.
- Cloudinary account rotation test pass.
- Backend startup báo `backend ready`.

Log TTL diagnostic vẫn cần được theo dõi nếu muốn xác minh sâu metadata `expireAfterSeconds` trong MongoDB, nhưng không làm test suite fail hiện tại.
