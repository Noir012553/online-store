# Tóm tắt tối ưu LaptopStore

## Homepage

- Giữ nguyên giao diện đỏ/trắng, responsive breakpoint và các carousel hiện có.
- Bổ sung fallback bản dịch offline cho header, hero, khu vực sản phẩm, feature, footer, tìm kiếm và newsletter.
- Khi API sản phẩm lỗi hoặc trả dữ liệu rỗng, homepage hiển thị empty state và liên kết đến catalog thay vì để vùng nội dung trống.
- Khi API thương hiệu lỗi hoặc không có dữ liệu, section thương hiệu vẫn hiển thị trạng thái rõ ràng.
- Banner hai bên vẫn giữ vị trí động bằng CSS variable, không dùng inline style trong JSX.

## Khuyến mại nhanh

- Nhãn tiếng Việt:
  - `Khuyến Mại Nhanh`
  - `Ưu Đãi Có Thời Hạn`
- Countdown tiếp tục được tính động từ thời gian kết thúc deal qua `timeLeft`; không hardcode giá trị hiển thị.
- Deal chỉ hiển thị sản phẩm còn deal hoạt động thông qua `isActiveDeal`.

## Sản phẩm và bộ lọc

- Homepage lấy sản phẩm nổi bật từ endpoint tối ưu với tiêu chí `inStock=true`.
- Mỗi danh mục lấy tối đa 8 sản phẩm để hiển thị carousel homepage.
- Các request deal và danh mục dùng `Promise.allSettled`, nên một request lỗi không làm mất toàn bộ dữ liệu đã tải thành công.
- Catalog vẫn giữ bộ lọc và phân trang riêng: thương hiệu, giá, giảm giá, đánh giá, còn hàng, nổi bật, deal nóng và sắp xếp.
- Khi bộ lọc thay đổi, trang catalog reset về trang đầu; nếu trang hiện tại vượt tổng số trang, trang được điều chỉnh về trang hợp lệ.

## Currency và offline

- Currency context luôn có giá trị fallback, ưu tiên theo thứ tự:
  1. Currency khớp locale.
  2. Currency mặc định từ server.
  3. `FALLBACK_CURRENCY` VND.
- Chỉ hiển thị `LoadingGate` khi currency còn đang tải.
- Bản dịch có fallback IndexedDB và fallback cục bộ tối thiểu khi API translation không khả dụng.

## Kiểm tra

- TypeScript: pass với `npx tsc --noEmit`.
- Offline support tests: 10/10 pass.
- Kiểm tra emoji UI: pass.
- Dev server và homepage preview: HTTP 200, không phát hiện runtime error.

## Vấn đề còn theo dõi

- HTTP 530/1033 từ backend hoặc Cloudflare là vấn đề hạ tầng, không được giải quyết chỉ bằng fallback frontend.
- Preview còn ghi nhận các request `429 RATE_LIMIT_TOKEN_REFRESH` tới `/api/users/refresh`; cần kiểm tra cơ chế refresh token ở backend/proxy để tránh retry hoặc refresh lặp.
- Một số ảnh banner/logo có thể rơi về placeholder nếu nguồn asset không phản hồi.
