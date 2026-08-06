# Báo cáo thiếu key/value bản dịch

## Phạm vi kiểm tra

- Backend locale: `online-store-backend/src/locales/`
- Frontend translation calls: `online-store-frontend/src/`
- Ngôn ngữ đang hoạt động: `vi`, `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`
- Namespace được kiểm tra gồm các file static UI, admin, order, profile, policy, banner và products.

## Vấn đề phát hiện

### 1. Key được frontend gọi nhưng không có trong catalog

Có 104 key được gọi từ frontend nhưng không tồn tại trong bất kỳ locale nào. Các nhóm chính:

- `admin`
- `admin-banners`
- `admin-translation`
- `admin-translation-batch`
- `admin-translation-override`
- `banner`
- `common`
- `contact`
- `errors`
- `order-confirmation`
- `pagination`
- `policies`
- `profile`
- `users`

Khi thiếu key, hàm `t()` trả về chính tên key, khiến giao diện có thể hiển thị nội dung như `admin_batch_status_success` thay vì văn bản đã dịch.

### 2. Placeholder không được interpolate

Trang sản phẩm từng ghép chuỗi tìm kiếm theo cách sau:

```text
Found {{count}} products for "{{query}}" - 4 results for "a"
```

Nguyên nhân là `{{count}}` và `{{query}}` chưa được thay thế bằng dữ liệu runtime, đồng thời component còn nối thêm key `results_for` lần thứ hai.

### 3. Namespace không nhất quán

Trang xác nhận đơn hàng sử dụng namespace `orderConfirmation`, trong khi file locale thực tế là `order-confirmation.json`. Vì vậy các key trong trang không được tải đúng namespace.

### 4. Locale không đồng đều

So sánh toàn bộ 76 namespace JSON cho 9 ngôn ngữ phát hiện nhiều khác biệt cấu trúc. Một phần thuộc các file backend/seed chỉ tồn tại ở một ngôn ngữ, không phải toàn bộ đều là nội dung frontend cần dịch. Không nên giải quyết bằng cách sao chép tiếng Việt thành bản dịch giả cho các ngôn ngữ khác.

## Đã xử lý

- Bổ sung các key UI còn thiếu vào catalog mặc định `vi` ở các namespace liên quan.
- Sửa trang sản phẩm để interpolate `count` và `query` từ key `search_results_count`.
- Đổi namespace `orderConfirmation` thành `order-confirmation`.
- Cập nhật `translationController` để hợp nhất bản dịch locale hiện tại với từng key từ locale mặc định `vi`. Locale thiếu key sẽ nhận giá trị mặc định thay vì hiển thị tên key.
- Bổ sung key `empty_no_description` cho các file `products.json` còn thiếu.

## Trạng thái bản dịch

Các locale chưa có bản dịch riêng cho một số key mới sẽ tạm thời dùng fallback tiếng Việt. Đây là cơ chế chống hiển thị key thô, không thay thế cho việc dịch nội dung bản địa hóa hoàn chỉnh.

## Kiểm tra đã chạy

- `npm run build` frontend: đạt.
- Kiểm tra cú pháp toàn bộ JavaScript backend: đạt.
- Kiểm tra JSON các locale đã chỉnh sửa: đạt.
- `git diff --check`: đạt.

## Việc còn lại

1. Dịch riêng các key fallback tiếng Việt cho `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`.
2. Phân loại các namespace backend/seed chỉ dùng nội bộ khỏi namespace UI.
3. Chuẩn hóa các key trùng nghĩa hoặc khác tên giữa các namespace.
4. Thêm kiểm tra CI để phát hiện frontend gọi key chưa tồn tại trước khi build.
