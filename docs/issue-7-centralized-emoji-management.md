# Issue 7: Quản lý emoji tập trung

## Vấn đề

Emoji và ký hiệu Unicode từng được hard-code ở nhiều component UI, log CLI, locale và nội dung email/API, gây khó bảo trì và thiếu nhất quán.

## Cách xử lý

- Frontend dùng `src/lib/uiEmoji.ts` cho emoji/ký hiệu UI lặp lại.
- Backend dùng `src/utils/cliSymbols.js` cho output CLI, seed và script.
- Phân biệt emoji UI, ký hiệu CLI, icon vector, dữ liệu currency, locale và nội dung marketing.
- Các nội dung API, email, locale, metadata cờ ngôn ngữ và report lưu file được quản lý theo quy trình riêng.

## Đã hoàn thành

- Chuẩn hóa các nhóm UI, CLI, diagnostic và seeder an toàn.
- Sửa formatter để nhận diện đúng emoji ngoài BMP như `📌` và `🔥`.
- Các entry point runtime được xác định đã dùng registry phù hợp.
- Các ngoại lệ có chủ đích được phân loại và giữ nguyên để không thay đổi contract hoặc nội dung đã biên tập.

## Trạng thái

**Hoàn thành trong phạm vi emoji UI và ký hiệu CLI thuộc runtime an toàn.** Không đặt mục tiêu loại bỏ mọi Unicode khỏi toàn repository.
