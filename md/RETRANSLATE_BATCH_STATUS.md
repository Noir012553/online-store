# Tổng hợp sự cố và trạng thái retranslate

Cập nhật theo log đến ngày 2026-09-26. URI MongoDB, token, thông tin đăng nhập và nội dung `.env` không được đưa vào tài liệu này.

## Tóm tắt hiện trạng

- Batch cũ chạy bằng PID `17984` từng xử lý `13.410` bản ghi; log gần nhất người dùng gửi cho tiến trình này ở khoảng `718/13.410` (5%). Tiến trình phát cảnh báo Mongoose lặp lại về option `new` của `findOneAndUpdate()`.
- Một lệnh chạy sau từ thư mục `copy 27` kết nối MongoDB thành công và chạy `npm run retranslate -- --libretranslate-only --shutdown`. Lệnh tìm thấy `13.035` bản ghi: `3.440` catalog và `9.595` field-cache; cấu hình batch hiển thị concurrency `3`.
- Log cuối của lần chạy sau dừng ở khoảng `57/13.035`, với hai mô tả sản phẩm bị `LibreTranslate request timed out after 30000ms`. Chưa có log xác nhận tiến trình này đã dừng hay hoàn tất; không khởi chạy batch khác đồng thời.
- Chưa có căn cứ cho thấy batch direct-only đạt chất lượng chấp nhận được. Lần thử trước đó dịch được nhưng validator phát hiện `missing_technical_token` và không đánh dấu bản ghi là đã sửa thành công.

## Đã xử lý

### Hạ tầng dịch local

- Khôi phục WSL 2 và Docker Desktop trên máy Windows.
- LibreTranslate được chạy trong Docker, tải model cho 9 ngôn ngữ `vi,en,pt,fr,de,it,es,nl,sv` (18 model) và endpoint dịch đã trả kết quả thử nghiệm.
- Compose hiện cấu hình LibreTranslate với `--threads 1`; cấu hình này cần được cân nhắc khi chọn mức request đồng thời.

### Backend và CLI

- `online-store-backend/src/scripts/retranslate.js` hỗ trợ `--libretranslate-only`, `--concurrency=N`, `--shutdown`, kiểm tra Windows cho shutdown và báo lỗi rõ nếu thiếu `MONGO_URI`.
- `online-store-backend/src/seeds/retranslateSeeder.js` hỗ trợ worker pool giới hạn concurrency (mặc định 3), giữ các record cùng product/ngôn ngữ theo nhóm tuần tự và ngừng nhận công việc mới khi gặp quota.
- Batch chỉ trả `success` khi không có lỗi, không còn bản ghi lỗi kiểm định và không còn bản ghi chưa xử lý. Vì vậy `--shutdown` trong phiên bản này không được lên lịch nếu batch còn vấn đề.
- Option Mongoose `new: true` trong luồng retranslate được đổi sang `returnDocument: 'after'`; log lỗi record được rút gọn và có fallback ID thay vì in `undefined` hoặc toàn bộ mô tả dài.
- Mapping dữ liệu báo cáo `originalText/translatedText/validationErrors` sang `original/current/issues` đã được sửa để tránh reporter lỗi khi in các bản dịch chưa đạt kiểm định.

### LibreTranslate client

- `libretranslate-tool/src/libretranslateClient.js` mặc định giới hạn một request đồng thời nếu không có cấu hình khác. Sau timeout, concurrency hiện tại giảm một nửa (tối thiểu 1); sau chuỗi request thành công, client mới tăng dần lại, không vượt mức tối đa cấu hình.
- `online-store-backend/.env.example` đặt mẫu `LIBRETRANSLATE_MAX_PARALLEL_REQUESTS=1` và timeout mẫu 60 giây. Đây chỉ là file mẫu; nó không tự thay đổi `.env` đang dùng trên máy Windows.

## Vấn đề còn gặp / rủi ro

1. **LibreTranslate timeout:** các request dịch mô tả dài hết timeout 30 giây trong log gần nhất. Khi biến đã khai báo trong `.env`, giá trị từ `.env` có thể ghi đè giá trị mặc định trong code; cập nhật `.env.example` không cập nhật file `.env` hiện có.
2. **Hiệu năng:** Compose đặt `--threads 1`. Batch concurrency `3` là số nhóm record xử lý song song, không phải giới hạn trực tiếp số HTTP request ở mọi nhánh. Client LibreTranslate có hàng đợi riêng và giới hạn toàn cục theo cấu hình của client.
3. **Chất lượng bản dịch:** lần thử direct-only trước đó không giữ được một số thuật ngữ/thông số kỹ thuật. Không nên tiếp tục chạy cả lô bằng direct-only nếu chưa đánh giá chất lượng trên mẫu phù hợp.
4. **Cảnh báo Mongoose trong log PID cũ:** process đã nạp source trước khi sửa vẫn có thể tiếp tục phát cảnh báo; sửa file không hot-patch process đang chạy. Nếu cảnh báo còn ở một tiến trình mới, cần kiểm tra source đúng thư mục/copy đang chạy và tìm các option deprecated khác.
5. **Trạng thái batch không rõ:** các log hiện có không xác nhận PID `17984` hoặc lần chạy `copy 27` đã dừng/hoàn tất. Đừng khởi chạy batch chồng lấn trên cùng dữ liệu.
6. **Kết nối MongoDB:** lần chạy trước báo `MONGO_URI` là `undefined`; lần chạy từ `copy 27` sau đó đã kết nối thành công. Không ghi URI hoặc credential vào log/tài liệu/chat.

## Cấu hình PowerShell cho lần chạy mới

Các biến trong PowerShell chỉ áp dụng cho cửa sổ hiện tại và được ưu tiên hơn `.env`:

```powershell
$env:LIBRETRANSLATE_MAX_PARALLEL_REQUESTS = '1'
$env:LIBRETRANSLATE_TIMEOUT_MS = '60000'
```

`MONGO_URI` phải được đặt bằng connection string đúng của backend; giá trị này không có trong log và không được đoán. Nếu chạy trong cửa sổ chưa nạp URI, đặt URI cục bộ theo cách an toàn trước khi gọi CLI.

Không khởi chạy batch mới cho đến khi xác nhận batch trước đã dừng. Nếu cần chạy thử lại, giới hạn `--limit=1`, xem kết quả dịch và validation trước khi cân nhắc batch lớn. Thêm `--shutdown` chỉ khi chấp nhận tắt Windows sau một batch được đánh dấu thành công.

## Kiểm tra đã thực hiện

- `node --check` đã chạy qua cho các JavaScript file liên quan.
- `node --test libretranslate-tool/test/productTranslator.test.js`: **7/7 passed**, gồm test giới hạn request và backoff sau timeout.
- Regression test backend trong `online-store-backend/src/test/translation-product-cache.test.js` có bổ sung coverage concurrency và trạng thái validation, nhưng chưa chạy được trong môi trường dev do thiếu Mocha.
- Không chạy `npm run build`.
