# Issue 6: Dropdown native và responsive

## Vấn đề

Dropdown dựa trên Radix có thể gây lệch vị trí, tràn viewport hoặc thao tác không ổn định trên tablet/mobile.

## Cách xử lý

- Dùng `<select>` native cho các trường chọn đơn giản.
- Dùng implementation nội bộ cho menu điều hướng/ngôn ngữ.
- Giữ Popover cho multi-select cần tìm kiếm, checkbox và chọn nhiều mục.
- Không thay đổi dữ liệu, callback, validation, quyền, route hoặc style hiện có.

## Đã hoàn thành

- Đã rà soát toàn bộ frontend.
- Đã loại bỏ wrapper và dependency Radix Select/Dropdown trong phạm vi issue.
- Menu tài khoản, menu sản phẩm và bộ chọn ngôn ngữ dùng implementation nội bộ.
- Các trường coupon và form phù hợp dùng native `<select>`.
- Đã xóa import `Select` không sử dụng.

## Còn lại

- Cần kiểm tra trực tiếp thao tác dropdown trên mobile, tablet và desktop.
- Cần kiểm tra nội dung dịch dài và các luồng admin trên preview.

## Trạng thái

**Hoàn thành phần loại bỏ phụ thuộc Radix; còn xác minh trực tiếp trên preview.**
