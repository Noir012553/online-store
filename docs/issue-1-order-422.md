# Issue 1: Lỗi tạo đơn hàng HTTP 422

## Vấn đề

`POST /api/orders` trả HTTP 422 khi sản phẩm thiếu hoặc có `baseCurrencyCode` không hợp lệ.

Backend yêu cầu mã tiền tệ dạng chuỗi 3 ký tự viết hoa như `VND`, `USD`. Dữ liệu sản phẩm cũ có trường này bị thiếu hoặc rỗng nên làm checkout thất bại.

## Đã hoàn thành

- Bổ sung kiểm tra `baseCurrencyCode` khi import product.
- Chuẩn hóa mã tiền tệ về chữ hoa và định dạng 3 ký tự.
- Cập nhật template import JSON/CSV.
- Thêm script `repair-product-currencies.js` để sửa dữ liệu cũ.
- Đã sửa 109 sản phẩm trên database dev sang `VND`.
- Dữ liệu sản phẩm không còn thiếu hoặc sai `baseCurrencyCode` trong phạm vi đã xử lý.
- Luồng checkout không còn lỗi 422 do currency.

## Còn lại

- Các môi trường khác cần chạy migration dữ liệu tương ứng nếu còn sản phẩm thiếu `baseCurrencyCode`.
- Các lỗi nghiệp vụ khác như tồn kho hoặc exchange rate được xử lý theo luồng riêng.

## Trạng thái

**Hoàn thành trong phạm vi lỗi `baseCurrencyCode` và luồng checkout.**
