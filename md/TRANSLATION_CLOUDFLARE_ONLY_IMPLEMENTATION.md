# Báo cáo sửa và triển khai luồng dịch Cloudflare-only

## Mục tiêu và quyết định

Phân tích dữ liệu trước đó cho thấy có khoảng **4.896 bản ghi `status: success` nhưng chỉ khoảng 1.456 bản ghi được `approved`**. Các lỗi validator gặp nhiều gồm `inconsistent`, `missing_technical_token` và `mixed_language`. Vì vậy, `status: success` không được xem là đồng nghĩa với bản dịch đạt chất lượng.

Luồng dịch mới chỉ dùng **Cloudflare AI**. Khi Cloudflare rate limit hoặc hết quota trên các cấu hình khả dụng, công việc phải được ghi nhận là lỗi/chưa hoàn tất để retry sau; không tự chuyển sang LibreTranslate và không đánh dấu thành công nhờ provider dự phòng.

> Các thay đổi dưới đây là thay đổi đã thực hiện trong codebase của phiên làm việc. Chưa có thao tác deploy production, push hoặc cập nhật dữ liệu MongoDB trong quá trình này.

## Các thay đổi đã thực hiện

### 1. Chuyển dịch sản phẩm sang service Cloudflare-only

Tạo `online-store-backend/src/services/productTranslationService.js` để gom phần chia đoạn và dịch sản phẩm bằng Cloudflare. Luồng này:

- Chia nội dung theo ranh giới câu, xuống dòng hoặc khoảng trắng; kích thước mặc định là `CLOUDFLARE_AI_INPUT_CHUNK_SIZE=1800`, giới hạn tối đa 6.000 ký tự mỗi đoạn.
- Dịch các đoạn tuần tự và giữ khoảng trắng giữa các đoạn khi ghép lại.
- Từ chối output rỗng hoặc bị rút ngắn nghiêm trọng; với output được xác định là chưa đầy đủ, chia nhỏ và thử lại tối đa hai cấp.
- Chỉ trả metadata provider là `cloudflare` / `['cloudflare']`; lỗi rate limit/quota được đẩy lên caller thay vì tạo kết quả dịch giả thành công.

Các luồng product seeder, catalog retranslation, retranslate seeder và translation controller được chuyển sang service này hoặc gọi Cloudflare trực tiếp cho loại nội dung không phải sản phẩm.

### 2. Giữ retry/rotation trong phạm vi Cloudflare

`online-store-backend/src/services/cloudflareAiService.js` tiếp tục xử lý retry các lỗi tạm thời và lần lượt thử các cấu hình Cloudflare khả dụng. Khi gặp rate limit/quota, cấu hình bị cooldown; nếu không còn cấu hình Cloudflare khả dụng, lỗi được truyền lên để dừng/để lại phần việc chưa hoàn tất. Nội dung nguồn là đầu vào dịch; không còn dùng bản nháp từ LibreTranslate trong prompt, cache idempotency hoặc cơ chế retry.

Cloudflare cũng nhận giới hạn output `max_tokens` (mặc định 2.048, có thể đặt qua `CLOUDFLARE_AI_MAX_TOKENS`) và prompt yêu cầu giữ nguyên thông số kỹ thuật, số liệu, markup, tên thương hiệu và định dạng.

Không nên tạo tài khoản/key chỉ để né hạn mức. Chỉ cấu hình các credential Cloudflare được cấp phép và xác nhận rõ quota áp dụng; nếu quota cạn, để batch retry sau thay vì chuyển provider.

### 3. Sửa hành vi seeder và retranslate khi hết quota

- `online-store-backend/src/services/productTranslationSeederService.js` không còn fallback counter, draft wrapper hoặc cache kết quả fallback.
- `online-store-backend/src/services/productCatalogRetranslationService.js` ghi metadata mới rõ ràng là `provider: 'cloudflare'`, `providersUsed: ['cloudflare']`, `providerSource: 'primary'`, `failoverReason: null`.
- `online-store-backend/src/seeds/retranslateSeeder.js` không còn nhánh chạy LibreTranslate-only. Bản dịch mới vẫn được validator đánh giá riêng; chỉ được tính là đã sửa khi quality status là `approved` và không còn validation error. Gặp Cloudflare quota sẽ ngừng nhận việc mới và báo phần còn lại chưa hoàn tất.
- `online-store-backend/src/controllers/translationController.js` đọc `translatedText` từ product translation service mới.

### 4. Loại bỏ tool và cấu hình LibreTranslate

- Xóa service sản phẩm cũ `online-store-backend/src/services/libretranslateProductService.js` sau khi chuyển phần chunking cần thiết sang service mới.
- Xóa option `--libretranslate-only` khỏi `online-store-backend/src/scripts/retranslate.js`.
- Gỡ kiểm tra endpoint/ngôn ngữ/smoke test LibreTranslate khỏi `online-store-backend/src/scripts/translation-preflight.js`.
- Gỡ các biến cấu hình LibreTranslate khỏi `online-store-backend/.env.example`.
- Xóa toàn bộ tool độc lập `libretranslate-tool/` (CLI, client, product translator, test, package và Docker Compose).

### 5. Ngăn tái sử dụng checkpoint của chính sách provider cũ

`online-store-backend/src/utils/retranslateProgress.js` thêm `translationPolicy: 'cloudflare-only-v1'` vào signature checkpoint. Nhờ đó checkpoint được tạo theo chính sách provider cũ không bị hiểu nhầm là kết quả của luồng Cloudflare-only.

### 6. Giữ khả năng đọc dữ liệu lịch sử

Một số chuỗi như `libretranslate`, `fallback_libretranslate` và `translated_via_libre` vẫn còn trong schema enum, selector, báo cáo hoặc script migration. Đây là hỗ trợ đọc, lọc, báo cáo hay xử lý bản ghi lịch sử; không phải đường gọi LibreTranslate để tạo bản dịch mới. Các record cũ vẫn có thể được chọn để retranslate bằng Cloudflare.

Không có bản ghi MongoDB nào được cập nhật hoặc migration nào được chạy trong phiên làm việc này.

## Kiểm thử và giới hạn xác nhận

Đã xác nhận trước đó:

- Test Cloudflare AI service: **9/9 passed**.
- Test retranslate progress/checkpoint: **18/18 passed**.
- Các test tập trung cho chunking giới hạn kích thước, bảo toàn whitespace, retry output không đầy đủ và truyền lỗi rate limit đã qua.
- `node --check` và `git diff --cached --check` đã qua ở lần kiểm tra trước.

Còn chưa xác nhận sau lần chỉnh fixture mới nhất:

- Test concurrency `retranslates independent records with the configured concurrency cap` cần chạy lại; lần chạy cuối bị môi trường từ chối do lỗi ACL/safety judge không khả dụng. Vì vậy không kết luận test này đã pass.
- Fixture test concurrency vừa được chỉnh để dùng entity `product_name` và stub product lock/catalog sync; chưa có lần chạy kiểm tra cú pháp/test được xác nhận sau chỉnh sửa đó.
- Các test cần MongoDB bị chặn bởi môi trường (URI không hợp lệ hoặc MongoDB không chạy tại `127.0.0.1:27017`).
- Không chạy `npm run build`.

## File liên quan

- `online-store-backend/src/services/productTranslationService.js`
- `online-store-backend/src/services/cloudflareAiService.js`
- `online-store-backend/src/services/productTranslationSeederService.js`
- `online-store-backend/src/services/productCatalogRetranslationService.js`
- `online-store-backend/src/seeds/retranslateSeeder.js`
- `online-store-backend/src/controllers/translationController.js`
- `online-store-backend/src/scripts/retranslate.js`
- `online-store-backend/src/scripts/translation-preflight.js`
- `online-store-backend/src/utils/retranslateProgress.js`
- `online-store-backend/src/test/translation-product-cache.test.js`
- `online-store-backend/src/test/cloudflare-ai-service.test.js`
- `online-store-backend/src/test/retranslate-progress.test.js`
