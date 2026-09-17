# Cloudflare Translation Retry Issue

## Tóm tắt

Hệ thống seed sản phẩm và các module sau sản phẩm đã hoàn tất với trạng thái `COMPLETED`, nhưng còn các bản ghi dịch sản phẩm bị lỗi do Cloudflare hết ngân sách request:

```text
CLOUDFLARE_AI_REQUEST_BUDGET_EXCEEDED
```

Hiện còn 91 bản ghi `failed_error`, chủ yếu thuộc ngôn ngữ `pt` (Portuguese).

## Bằng chứng từ seed report

Các report gần nhất ghi nhận:

- `seed-report-2026-09-17T02-57-11.txt`
  - `Status: COMPLETED`
  - `Pending: 140`
  - `translation_failed: 91`
- `seed-report-2026-09-17T04-25-58.txt`
  - Product pipeline hoàn tất cho 608 sản phẩm
  - `rateLimitCount: 0`
  - `errorCount: 0`
  - `Pending: 102`
  - `translation_failed: 91`
- `seed-report-2026-09-17T06-15-34.txt`
  - Hoàn tất các module `inventory`, `outOfStock`, `reviews`, `orders`, `coupons`, `specTranslations`
  - `Status: COMPLETED`
- `seed-report-2026-09-17T07-36-07.md`
  - Product pipeline hoàn tất cho 614 sản phẩm
  - Mỗi ngôn ngữ có `successCount: 4425`, `rateLimitCount: 0`, `errorCount: 0`
  - `storefrontReadiness: matchedCount 614, modifiedCount 614`
  - `Pending: 92`
  - `translation_failed: 91`

Các bản ghi lỗi được kiểm tra bằng:

```bash
npm run translate:report -- --status=failed_error --limit=1000
```

Kết quả:

```text
Total: 91
Language: pt
Status: failed_error
Errors: translation_failed
Last error: CLOUDFLARE_AI_REQUEST_BUDGET_EXCEEDED
Retries: 1
```

## Nguyên nhân kỹ thuật

Khi Cloudflare request thất bại, `src/services/rateLimitHandler.js` lưu bản ghi với:

```js
status: 'failed_error'
qualityStatus: 'pending'
validationErrors: ['translation_failed']
translatedText: originalText
```

Do đó phần giao diện có thể hiển thị nội dung tiếng Việt gốc ở những trường chưa dịch được.

`src/services/cloudflareAiService.js` có cơ chế xoay nhiều cấu hình Cloudflare khi gặp quota/rate limit. Tuy nhiên, nếu budget nội bộ hoặc budget của các tài khoản Cloudflare đều đã hết, xoay config không thể tạo thêm quota.

Ngoài ra, `failed_rate_limit` chỉ được gán khi lỗi có HTTP status `429`. Lỗi `CLOUDFLARE_AI_REQUEST_BUDGET_EXCEEDED` được lưu thành `failed_error`, vì vậy việc truy vấn `failed_rate_limit` trả về `0` là đúng theo code hiện tại.

## Vấn đề với lệnh seed hiện tại

Lệnh sau không tối ưu cho việc retry:

```bash
npm run seed -- --only-module=__product-pipeline__ --skip-scrape --shutdown-machine
```

Lệnh này vẫn quét và import lại toàn bộ sản phẩm. Cache giúp bỏ qua một số bản dịch đã được duyệt, nhưng pipeline vẫn xử lý toàn bộ product pipeline và không giới hạn ngay từ đầu vào 91 bản ghi lỗi.

## Luồng retry đã có trong code

Code đã có service retry targeted:

- `src/services/rateLimitHandler.js:206`
  - Lọc các status `failed_error`, `failed_rate_limit`
  - Chuyển chúng sang `pending_retry`
- `src/services/productTranslationSeederService.js:308`
  - Lấy danh sách bản ghi lỗi theo `targetLang`
  - Gọi Cloudflare chỉ cho từng bản ghi lỗi
  - Cập nhật lại trạng thái và retry count
- `src/routes/translationRoutes.js:221`
  - API admin:

```text
POST /api/translations/admin/retry/:lang
```

Đối với 91 lỗi hiện tại:

```text
POST /api/translations/admin/retry/pt
```

API này yêu cầu quyền admin và chạy retry ở background.

## Thiếu sót hiện tại

`online-store-backend/package.json` chưa có script:

```text
translate:retry
```

Vì vậy lệnh sau hiện chưa thể chạy:

```bash
npm run translate:retry -- --lang=pt
```

NPM sẽ báo:

```text
npm error Missing script: "translate:retry"
```

## Hướng triển khai đề xuất

Thêm một CLI retry targeted, không hardcode token:

1. Đọc `ADMIN_EMAIL`, `ADMIN_PASSWORD` và `BACKEND_URL` từ environment.
2. Gọi `POST /api/users/login` để lấy `accessToken` động.
3. Gọi `POST /api/translations/admin/retry/:lang` với token vừa lấy.
4. Cho phép truyền `--lang=pt` và giới hạn retry nếu cần.
5. Không ghi token hoặc mật khẩu vào file/report.
6. Trả exit code khác `0` nếu login hoặc retry thất bại.

Ví dụ biến môi trường cần dùng:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-password
BACKEND_URL=http://localhost:5000
```

Lệnh mục tiêu:

```bash
npm run translate:retry -- --lang=pt
```

## Trạng thái hiện tại

- Seed product pipeline: hoàn tất.
- Seed post-products: hoàn tất.
- Crawl lại: không cần.
- Chạy lại toàn bộ seed: không cần.
- 91 bản dịch `pt`: cần retry targeted sau khi Cloudflare cấp lại quota.
- `translate:retry`: chưa được thêm vào `package.json`.

## Vấn đề seed dữ liệu test `outOfStock`

Các sản phẩm có tên dạng:

```text
[HẾT HÀNG] Sản phẩm mẫu - <Tên danh mục>
```

không phải dữ liệu crawler. Chúng được tạo bởi `src/seeds/outOfStockSeeder.js` để kiểm thử trạng thái hết hàng. Module này hiện được đăng ký trong `SEED_PHASES.postProducts` tại `src/seeds/seedRegistry.js`, nên mỗi lần chạy post-products có thể tạo dữ liệu test cùng với dữ liệu production.

### Hướng xử lý đề xuất

- Không chạy `outOfStock` trong seed production mặc định.
- Tạo lệnh riêng, ví dụ `npm run seed:test-fixtures`, để tạo fixture khi cần kiểm thử.
- Đánh dấu fixture bằng trường rõ ràng như `isTestData: true` hoặc `seedSource: 'outOfStock-fixture'`.
- Dùng `try/finally` để xóa fixture ngay sau khi test kết thúc.
- Tạo thêm `npm run cleanup:test-fixtures` để dọn các fixture nếu tiến trình test bị dừng đột ngột.
- Dọn các sản phẩm test đã được tạo từ những lần seed trước bằng tiêu chí định danh an toàn; không xóa chỉ dựa trên tên nếu chưa xác minh phạm vi dữ liệu.

## Lỗi `ORDER_PRODUCT_NOT_FOUND` khi khởi động backend

### Log ghi nhận

Backend khởi động thành công và hệ thống translation không có lỗi:

```text
[STARTUP] backend ready
✅ Loaded 76 translation files for VI
✅ Loaded 76 translation files for EN
✅ Loaded 76 translation files for PT
✅ Loaded 76 translation files for FR
✅ Loaded 76 translation files for DE
✅ Loaded 76 translation files for IT
✅ Loaded 76 translation files for ES
✅ Loaded 76 translation files for NL
✅ Loaded 76 translation files for SV
⚠️ Failed files: 0
```

Lỗi xảy ra khi frontend gọi:

```text
/api/orders/summary?lang=vi&locale=vi-VN&currencyCode=VND
```

Log backend:

```text
Error: Không tìm thấy sản phẩm
errorCode: ORDER_PRODUCT_NOT_FOUND
src/controllers/orderController.js:202
```

HTTP response:

```text
404
```

### Nhận định

Đây không phải lỗi khởi động backend hay lỗi load translation. Đây là lỗi dữ liệu/order: một order hoặc order item đang tham chiếu đến sản phẩm không tồn tại, đã bị xóa hoặc không còn thỏa điều kiện truy vấn sản phẩm.

Cần kiểm tra các product reference trong orders và xác minh các sản phẩm đó tồn tại trong collection `Product` với trạng thái phù hợp. Không nên sửa bằng cách nuốt lỗi hoặc trả dữ liệu giả cho order summary.

## Thứ tự seed sau khi chỉ chạy dịch sản phẩm

Nếu report chỉ có:

```text
Modules executed: __product-pipeline__
```

thì product pipeline đã hoàn tất các bước:

1. Import sản phẩm.
2. Dịch sản phẩm.
3. Cập nhật `storefrontReadiness`.

Các module seed phụ thuộc sau sản phẩm chưa chắc đã chạy. Do module `outOfStock` hiện đang tạo dữ liệu test, không nên chạy nguyên phase `post-products` trong production.

Lệnh production an toàn hơn là chạy các module cần thiết nhưng bỏ qua fixture `outOfStock`:

```powershell
npm run seed -- --modules=inventory,reviews,orders,coupons,specTranslations --shutdown-machine
```

Lệnh này không crawl lại và không dịch lại toàn bộ product pipeline. Nó chạy inventory, reviews, orders, coupons và spec translations, sau đó hẹn shutdown Windows nếu thành công.

Nếu report đã ghi:

```text
storefrontReadiness:
matchedCount: 614
modifiedCount: 614
```

thì không cần chạy thêm lệnh storefront. Nếu dữ liệu cũ chưa được cập nhật, có thể chạy:

```powershell
npm run backfill:storefront
```

Trong câu hỏi trước, `stonefone` được hiểu là `storefront`. Sau khi seed xong, khởi động backend bằng:

```powershell
npm start
```

Nếu `/api/orders/summary` vẫn trả `ORDER_PRODUCT_NOT_FOUND`, cần xử lý các order item tham chiếu product không hợp lệ trước khi coi dữ liệu order đã sẵn sàng.
