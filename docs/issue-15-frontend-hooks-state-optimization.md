# Rà soát hooks và state frontend

## Phạm vi

- **Ứng dụng:** `online-store-frontend`
- **Trọng tâm:** React hooks, state cục bộ, context, data fetching, cache và xử lý request bất đồng bộ.
- **Trạng thái:** Hoàn tất các hạng mục đã theo dõi trong phạm vi frontend hooks/state.

## Tổng quan

Cấu trúc hiện tại sử dụng React hooks và context đúng hướng. Các vấn đề về debounce tìm kiếm, race condition của product/category, cache translation, callback churn trong `LanguageContext`, render thừa và xử lý OAuth lặp đã được xử lý trong phạm vi theo dõi.

## Danh sách vấn đề cần tối ưu

### Đã hoàn thành

1. `HomeContent` dùng trực tiếp categories từ `CategoryContext`, loại bỏ nguồn state trùng lặp.
2. `useDraggable` giữ tọa độ mới nhất trong ref; listener không còn đăng ký lại theo từng lần di chuyển và luôn lưu đúng điểm kết thúc.
3. Callback Google OAuth được định danh theo URL và chỉ xử lý một lần, kể cả khi dependency của effect thay đổi.
4. Đã xóa hook translation trùng lặp, không có import runtime nào sử dụng.

## Checklist nghiệm thu

- [x] Gõ nhanh trong ô tìm kiếm chỉ tạo request sau thời gian debounce.
- [x] Kết quả request cũ không thể ghi đè kết quả mới.
- [x] Đổi locale hoặc product ID liên tục không hiển thị dữ liệu của request trước.
- [x] Translation không bị dùng nhầm giữa các locale hoặc source/target language khác nhau.
- [x] Chọn brand trong trang quản trị làm thay đổi đúng danh sách sản phẩm.
- [x] Context provider không làm consumer render lại do array hoặc callback không ổn định.
- [x] Không còn state mirror nếu không có lý do nghiệp vụ rõ ràng.
- [x] Kéo-thả không đăng ký lại listener theo từng tọa độ và lưu đúng vị trí cuối.
- [x] Google OAuth callback không thể gọi lại cho cùng một URL callback.
- [x] Không còn hook translation trùng lặp không sử dụng.
