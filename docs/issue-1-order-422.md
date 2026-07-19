# Vấn đề 1: API tạo đơn trả về 422

## Trạng thái

- **Loại:** Đã xác minh nguyên nhân, đã triển khai biện pháp sửa dữ liệu và chặn import lỗi
- **Endpoint:** `POST /api/orders?lang=vi`
- **Lỗi quan sát được:** `422 Unprocessable Content`

## Mô tả

Khi người dùng hoàn tất thanh toán, frontend gửi yêu cầu tạo đơn hàng nhưng API trả về HTTP 422.

## Phân tích nguyên nhân

Theo mã nguồn backend, nhánh trả về HTTP 422 nằm tại:

- `online-store-backend/src/controllers/orderController.js:311-314`

Điều kiện lỗi xảy ra khi một hoặc nhiều sản phẩm trong giỏ hàng có `baseCurrencyCode`:

- Bị thiếu
- Không phải chuỗi
- Không có đúng định dạng mã tiền tệ 3 ký tự viết hoa, ví dụ `VND` hoặc `USD`

Thông báo lỗi tương ứng từ backend là:

```text
Product base currency is missing or invalid
```

Trường `baseCurrencyCode` được khai báo bắt buộc trong schema sản phẩm tại:

- `online-store-backend/src/models/Product.js:195-201`

## Đối chiếu frontend

Luồng checkout hiện tại gửi payload từ:

- `online-store-frontend/src/components/checkout/Step3Payment.tsx:76-101`

Payload có các trường chính:

- `cartItems`
- `shippingAddress`
- `paymentMethod`
- `currencyCode`

Cấu trúc này phù hợp với validator tạo đơn. Các lỗi thiếu trường payload thông thường đi qua validation middleware và trả về HTTP 400, không phải HTTP 422.

## Kết quả xác minh

Đã chạy script PowerShell trên môi trường dev với tài khoản seed `anyemail@email.com` và nhận được:

```text
Sản phẩm: Bàn phím Rapoo V501-87
productId: 6a52fba6ea4ad8f244faacb5
baseCurrencyCode: <empty>
HTTP 422
```

Response không hiển thị nội dung lỗi trong terminal, nhưng status 422 khớp chính xác với điều kiện tại `orderController.js:311-314`. Dữ liệu sản phẩm xác nhận `baseCurrencyCode` đang rỗng.

## Biện pháp đã triển khai

- Bổ sung `baseCurrencyCode` vào danh sách trường bắt buộc của product import.
- Chuẩn hóa mã tiền tệ import về chữ hoa và từ chối giá trị không khớp `/^[A-Z]{3}$/`.
- Cập nhật template JSON/CSV để luôn có `baseCurrencyCode`.
- Thêm migration `online-store-backend/src/scripts/repair-product-currencies.js` để tìm và sửa các sản phẩm cũ có mã tiền tệ lỗi bằng currency mặc định đang active.

Chạy kiểm tra trước khi ghi dữ liệu:

```powershell
npm run repair:product-currencies:dry-run
```

Sau khi xem danh sách và xác nhận currency mặc định phù hợp, chạy sửa dữ liệu:

```powershell
npm run repair:product-currencies
```

Có thể chỉ định rõ currency:

```powershell
npm run repair:product-currencies -- --currency=VND
```

## Phạm vi ảnh hưởng dự kiến

Nếu chỉ một sản phẩm có dữ liệu tiền tệ không hợp lệ, mọi đơn hàng chứa sản phẩm đó có thể thất bại ở bước tạo đơn. Các sản phẩm khác có dữ liệu hợp lệ không nhất thiết bị ảnh hưởng.

## Ghi chú

`Step5OrderReview.tsx` là component checkout cũ và gửi payload khác, nhưng hiện không được render trong luồng checkout chính. Nếu component này được sử dụng, lỗi dự kiến sẽ là HTTP 400 do thiếu `cartItems`, không phải nguyên nhân trực tiếp của lỗi 422.

Sau migration, cần chạy lại test tạo đơn. Nếu sản phẩm `6a52fba6ea4ad8f244faacb5` đã được sửa sang mã tiền tệ hợp lệ, request không còn được phép thất bại vì lỗi `baseCurrencyCode`; các lỗi nghiệp vụ khác như thiếu tồn kho hoặc cấu hình exchange rate vẫn có thể trả về status khác.

## Cập nhật tiến độ và kết quả thực tế

### Trạng thái sửa dữ liệu

Đã hoàn tất sửa dữ liệu trên database dev:

- Dry-run ban đầu phát hiện **109 sản phẩm** có `baseCurrencyCode` không hợp lệ hoặc bị thiếu.
- Currency mặc định đang active được xác định là `VND`.
- Đã chạy `npm run repair:product-currencies` và cập nhật **109 sản phẩm sang `VND`**.
- Đã chạy dry-run xác nhận sau khi sửa:

```text
Tìm thấy 0 sản phẩm có baseCurrencyCode không hợp lệ.
DRY RUN: chưa cập nhật dữ liệu. Currency sẽ dùng: VND
```

Nguyên nhân dữ liệu gây ra lỗi `422` đã được xử lý hoàn tất trên database dev.

### Kết quả test thực tế

#### Sanity test

Lệnh:

```powershell
npm run test:simple
```

Kết quả: **Đạt**. Process kết thúc với exit code `0`.

#### Unified test runner

Lệnh:

```powershell
npm run test
```

Kết quả: **1 test file đạt, 4 test file thất bại**.

- `test-simple.js`: đạt.
- `test-backend-endpoints-phase3.js`: 6/8 test đạt; 2 test thất bại do không tìm thấy dữ liệu product/language phù hợp (`Cannot read properties of null`).
- `test-phase4-e2e-simplified.js`: thất bại do thiếu module `ProductCatalogTranslationCache`.
- `test-rollback-procedures.js`: thất bại do import sai đường dẫn `../src/app`.
- `test-shadow-writes.js`: thất bại do thiếu module `LiveTranslationCache`.

#### Backend suite

Lệnh:

```powershell
npm run test -- --suite=backend
```

Kết quả: **thất bại 2 test file** do các lỗi dữ liệu/module nêu trên; không phải lỗi `baseCurrencyCode`.

#### Payment tag suite

Lệnh:

```powershell
npm run test -- --tags=payments
```

Kết quả: **không chạy được test nào** vì `testRegistry.js` đang trỏ các file payment tới `src/test-*.js`, trong khi file thực tế nằm tại `src/test/test-*.js`.

### Kết luận hiện tại

- **Đã hoàn tất:** sửa 109 sản phẩm lỗi và xác nhận database không còn sản phẩm thiếu/sai `baseCurrencyCode`.
- **Đã đạt:** sanity test backend.
- **Chưa hoàn tất xác minh:** chạy lại checkout thực tế qua frontend để xác nhận toàn bộ request `POST /api/orders?lang=vi` thành công.
- Các test còn thất bại hiện tại liên quan tới dữ liệu test, module thiếu và đường dẫn trong test registry; chưa có bằng chứng cho thấy chúng liên quan tới lỗi `baseCurrencyCode`.
