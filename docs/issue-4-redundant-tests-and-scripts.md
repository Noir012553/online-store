# Issue 4: Script và wiring trùng

## Vấn đề

Một số package script có thể trỏ tới file không tồn tại, còn một số script cùng tên xuất hiện ở nhiều thư mục. Điều này gây khó phân biệt entry point chính với script manual hoặc legacy.

## Đã hoàn thành

- Rà soát package script và cấu trúc thư mục script ở frontend/backend.
- Xóa các npm script seed chắc chắn trỏ tới file không tồn tại.
- Sửa lệnh chạy offline manual về đúng đường dẫn `node src/test/offline-manual.js`.
- Xác nhận các entry point chính đang trỏ tới file tồn tại, gồm `online-store-frontend/src/test/offline-manual.js`, `online-store-frontend/scripts/check-ui-emoji.js` và `online-store-backend/scripts/check-cli-symbols.js`.
- Giữ các alias dùng chung file vì chúng phục vụ các nhóm nghiệp vụ khác nhau.

## Ghi chú

- Các script seed, repair, translation và test còn khai báo trong `online-store-backend/package.json` là entry point hợp lệ tại thời điểm rà soát.
- Các script manual/legacy chỉ nên xóa sau khi xác nhận không còn được sử dụng.
- Không tự động xóa file chỉ dựa trên tên hoặc vị trí thư mục.

## Trạng thái

**Hoàn thành phần sửa wiring xác định được.** Việc phân loại hoặc xóa script manual/legacy là quyết định vận hành riêng.
