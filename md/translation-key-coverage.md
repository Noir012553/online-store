# Báo cáo thiếu key/value bản dịch

## Phạm vi kiểm tra

- Backend locale: `online-store-backend/src/locales/`
- Frontend translation calls: `online-store-frontend/src/`
- Ngôn ngữ đang hoạt động: `vi`, `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`
- Namespace được kiểm tra gồm các file static UI, admin, order, profile, policy, banner và products.

## Vấn đề phát hiện

### 1. Key được frontend gọi nhưng không có trong catalog

Các key UI đã được bổ sung vào catalog mặc định `vi`. Kiểm tra tĩnh hiện tại quét 1.968 lời gọi dịch trong 229 file frontend và không còn phát hiện key nào không tồn tại trong catalog.

Checker được đăng ký bằng lệnh `npm run check:translation-keys` ở backend. Checker bỏ qua lời gọi có key động và kiểm tra toàn bộ catalog mặc định, phù hợp với cơ chế fallback của `LanguageContext` và `translationController`.

Khi thiếu key, hàm `t()` có thể trả về chính tên key, khiến giao diện hiển thị nội dung như `admin_batch_status_success` thay vì văn bản đã dịch.

### 2. Placeholder không được interpolate

Trang sản phẩm từng ghép chuỗi tìm kiếm theo cách sau:

```text
Found {{count}} products for "{{query}}" - 4 results for "a"
```

Nguyên nhân là `{{count}}` và `{{query}}` chưa được thay thế bằng dữ liệu runtime, đồng thời component còn nối thêm key `results_for` lần thứ hai.

### 3. Namespace không nhất quán

Trang xác nhận đơn hàng sử dụng namespace `orderConfirmation`, trong khi file locale thực tế là `order-confirmation.json`. Vì vậy các key trong trang không được tải đúng namespace.

### 4. Locale không đồng đều

So sánh toàn bộ 76 namespace JSON cho 9 ngôn ngữ hiện còn 137 vấn đề ở 10 namespace. Phần lớn thuộc các file backend/seed, file locale nội bộ chưa được tạo hoặc cấu trúc lồng nhau, không phải toàn bộ đều là nội dung frontend cần dịch. Không nên giải quyết bằng cách sao chép tiếng Việt thành bản dịch giả cho các ngôn ngữ khác.

## Đã xử lý

- Bổ sung các key UI còn thiếu vào catalog mặc định `vi` ở các namespace liên quan.
- Sửa trang sản phẩm để interpolate `count` và `query` từ key `search_results_count`.
- Đổi namespace `orderConfirmation` thành `order-confirmation`.
- Cập nhật `translationController` để hợp nhất bản dịch locale hiện tại với từng key từ locale mặc định `vi`. Locale thiếu key sẽ nhận giá trị mặc định thay vì hiển thị tên key.
- Bổ sung key `empty_no_description` cho các file `products.json` còn thiếu.
- Dịch bổ sung 27 key sản phẩm mới cho `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`, gồm các nhóm flash deal, tiện ích, gaming, productivity và CTA.
- Dịch bổ sung toàn bộ key còn thiếu trong `admin-banners.json` cho 8 locale không mặc định.
- Thêm checker `verify-frontend-translation-keys.js` và script `check:translation-keys` để phát hiện key frontend bị thiếu trước CI/build.
- Dịch và đồng bộ toàn bộ key trong `payment-messages.json`, `shipping-messages.json` và `shipment.json` cho 8 locale không mặc định.

## Trạng thái bản dịch

Các key mới trong `products.json`, `admin-banners.json`, `payment-messages.json`, `shipping-messages.json` và `shipment.json` hiện đã có bản dịch riêng ở cả 9 locale. Các namespace UI đang được frontend tải đều có đủ key; khác biệt còn lại nằm ở namespace backend/seed, file nội bộ chưa được tạo và `validation-messages.json` có cấu trúc lồng nhau. Fallback chỉ chống hiển thị key thô, không thay thế cho bản dịch bản địa hóa hoàn chỉnh.

## Kiểm tra đã chạy

- `npm run build` frontend: đạt.
- `npm run check:translation-keys` backend: đạt, 1.968 lời gọi dịch trong 229 file.
- Kiểm tra cú pháp 293 file JavaScript backend: đạt.
- Kiểm tra JSON 652 file locale: đạt.
- Kiểm tra parity `products.json`, `admin-banners.json`, `payment-messages.json`, `shipping-messages.json` và `shipment.json` ở 9 locale: đạt.
- `git diff --check`: đạt.
- `verify-key-consistency.js`: còn 137 vấn đề ở 10/76 namespace, thuộc backend/seed, file locale nội bộ chưa được tạo hoặc `validation-messages.json` có cấu trúc lồng nhau.

## Việc còn lại

1. Dịch riêng các key còn thiếu trong `admin-controllers-messages.json` và `user-messages.json`.
2. Phân loại hoặc tạo các file locale nội bộ còn thiếu: `api.json`, `email.json`, `shipping.json`, `user.json`.
3. Chuẩn hóa các key trùng nghĩa hoặc khác tên giữa các namespace backend/seed, đồng thời quyết định quy ước cho `validation-messages.json` có cấu trúc lồng nhau.
4. Tích hợp `npm run check:translation-keys` vào pipeline CI trước bước frontend build.
