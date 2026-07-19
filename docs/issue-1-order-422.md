# Vấn đề 1: API tạo đơn trả về 422

## Trạng thái

- **Loại:** Phân tích, chưa triển khai sửa lỗi
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

## Cần xác minh

1. Kiểm tra phần **Response** của request lỗi trong trình duyệt để xác nhận thông báo backend.
2. Ghi nhận các `productId` có trong `cartItems` của request lỗi.
3. Kiểm tra các sản phẩm tương ứng trong database.
4. Xác nhận mỗi sản phẩm có `baseCurrencyCode` hợp lệ như `VND` hoặc `USD`.
5. Kiểm tra nhóm sản phẩm cũ, dữ liệu seed hoặc dữ liệu import vì có thể được tạo trước khi trường này trở thành bắt buộc.

## Phạm vi ảnh hưởng dự kiến

Nếu chỉ một sản phẩm có dữ liệu tiền tệ không hợp lệ, mọi đơn hàng chứa sản phẩm đó có thể thất bại ở bước tạo đơn. Các sản phẩm khác có dữ liệu hợp lệ không nhất thiết bị ảnh hưởng.

## Ghi chú

`Step5OrderReview.tsx` là component checkout cũ và gửi payload khác, nhưng hiện không được render trong luồng checkout chính. Nếu component này được sử dụng, lỗi dự kiến sẽ là HTTP 400 do thiếu `cartItems`, không phải nguyên nhân trực tiếp của lỗi 422 đang phân tích.
