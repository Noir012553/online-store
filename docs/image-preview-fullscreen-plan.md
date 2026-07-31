# Kế hoạch xem ảnh full-size/full-screen

## 1. Hiện trạng

Ứng dụng hiện hiển thị ảnh sản phẩm và avatar ở nhiều kích thước cố định, nhưng chưa có trải nghiệm xem ảnh full-size/full-screen dùng chung.

Các khu vực liên quan:

- `online-store-frontend/src/pages/product/[id].tsx`: ảnh chính và thumbnail sản phẩm; thumbnail chỉ đổi ảnh chính, ảnh chính hiện chỉ có hiệu ứng zoom khi hover.
- `online-store-frontend/src/components/QuickViewModal.tsx`: ảnh sản phẩm trong modal Xem Nhanh; chưa mở được ảnh lớn độc lập.
- `online-store-frontend/src/components/ProductCard.tsx`: ảnh thumbnail trên thẻ sản phẩm.
- `online-store-frontend/src/pages/cart.tsx`: ảnh sản phẩm trong giỏ hàng.
- `online-store-frontend/src/pages/admin/usersAdmin.tsx`: avatar user/admin/superadmin trong bảng danh sách.
- `online-store-frontend/src/pages/admin/editUser/[id].tsx`: avatar trong form chỉnh sửa người dùng.
- `online-store-frontend/src/pages/profile.tsx`: avatar của tài khoản đang đăng nhập.
- `online-store-frontend/src/pages/product/[id].tsx`: avatar người đánh giá sản phẩm.
- `online-store-frontend/src/pages/about.tsx`: avatar testimonial.

## 2. Ý tưởng triển khai

Tạo một lightbox/ảnh viewer dùng chung cho các ảnh cần xem chi tiết:

- Click vào ảnh sản phẩm hoặc avatar để mở lớp phủ toàn màn hình.
- Hiển thị ảnh ở chế độ `object-contain`, giữ nguyên tỉ lệ và không cắt ảnh.
- Có nút đóng dạng văn bản **“Đóng”** thay cho nút chỉ có biểu tượng X.
- Nhãn nút “Đóng” phải lấy từ hệ thống dịch static hiện có, ưu tiên key đã được dùng cho các dialog/nút đóng như `dialog_close` hoặc `close_button`; không hard-code nội dung theo ngôn ngữ trong component.
- Cho phép đóng bằng:
  - Nút “Đóng”.
  - Click vùng nền bên ngoài ảnh.
  - Phím `Escape`.
- Với gallery sản phẩm, có thể thêm nút ảnh trước/sau và trạng thái số thứ tự ảnh.
- Khóa scroll của trang nền khi viewer đang mở.
- Đảm bảo lớp phủ có z-index cao hơn navbar và các dropdown hiện tại.
- Trên mobile, ảnh chiếm phần lớn màn hình nhưng vẫn chừa vùng thao tác cho nút “Đóng”.
- Avatar vẫn giữ hình tròn ở giao diện thường; chỉ chuyển sang ảnh nguyên tỉ lệ khi mở viewer.

## 3. Nguyên tắc giao diện

- Giữ nguyên bảng màu, style bo góc và ngôn ngữ hình ảnh hiện tại.
- Không thay đổi cách hiển thị thumbnail, card sản phẩm hoặc avatar khi viewer chưa mở.
- Dùng class CSS/Tailwind có tên và mục đích rõ ràng; không thêm inline style mới.
- Giữ nguyên các breakpoint responsive đang có.
- Ưu tiên khả năng truy cập: `aria-label`/tên nút dịch được, focus rõ ràng và thao tác bàn phím đầy đủ.

## 4. Phạm vi đề xuất

### Giai đoạn 1 — Sản phẩm

1. Ảnh chính và gallery tại trang chi tiết sản phẩm.
2. Ảnh trong modal Xem Nhanh.
3. Ảnh sản phẩm trong card và giỏ hàng nếu cần xem nhanh.

### Giai đoạn 2 — Avatar

1. Avatar trong hồ sơ người dùng.
2. Avatar trong trang quản trị danh sách user/admin/superadmin.
3. Avatar trong form chỉnh sửa người dùng.
4. Avatar của reviewer và testimonial.

## 5. Tiêu chí hoàn thành

- Mọi điểm được chọn trong phạm vi đều mở được ảnh full-size/full-screen.
- Nút hiển thị chữ “Đóng” và lấy nội dung từ static translation, không thêm chuỗi ngôn ngữ trực tiếp vào component.
- Đóng được bằng nút, nền phủ và phím `Escape`.
- Không bị navbar, dropdown hoặc modal khác che lên.
- Không làm thay đổi bố cục hiện tại khi chưa mở viewer.
- Hoạt động ổn định trên desktop và mobile.
