# Các vấn đề hiện tại

Tài liệu này tổng hợp các lỗi đã kiểm tra và trạng thái xử lý hiện tại.

## 1. Ảnh team trên Cloudinary

### Trạng thái

Đã xử lý bằng lệnh riêng:

```bash
cd online-store-backend
npm run seed:about-media
```

Seeder kiểm tra asset theo `publicId`, chỉ upload khi asset chưa tồn tại, sau đó lưu dữ liệu vào MongoDB collection `aboutmedia`.

Các public ID:

```text
laptop-store/about/team/team-1
laptop-store/about/team/team-2
laptop-store/about/team/team-3
laptop-store/about/team/team-4
```

Bản ghi lưu các trường chính:

```text
key
kind
publicId
url
srcSet
sourceUrl
sortOrder
```

API `/api/products/about/media` đọc ảnh team từ MongoDB.

## 2. Video hero About

### Trạng thái

Video hero cũng đã được đưa vào cùng seeder `seed:about-media`.

Public ID:

```text
laptop-store/about/hero/about-hero
```

Bản ghi MongoDB dùng:

```text
key: about-hero
kind: hero
publicId
url
posterUrl
sourceUrl
```

Nếu video chưa tồn tại trên Cloudinary, seeder cần biến môi trường:

```env
ABOUT_HERO_SOURCE=https://...
```

Nếu asset đã tồn tại, seeder sẽ dùng lại asset hiện có và vẫn cập nhật bản ghi MongoDB.

API `/api/products/about/media` đọc `hero.url` và `hero.poster` từ MongoDB.

Sau khi chạy seed hoặc cập nhật backend production, cần restart/redeploy backend rồi reload trang `/about`.

## 3. Lỗi export sản phẩm và Cloudflare Tunnel

### Triệu chứng

Các lỗi từng quan sát:

```text
net::ERR_QUIC_PROTOCOL_ERROR 200 (OK)
net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)
ERR_INCOMPLETE_CHUNKED_ENCODING
```

### Nhận định

Export ZIP có thể đã được backend tạo thành công nhưng kết nối bị đóng hoặc body bị cắt trên đường truyền qua proxy/Cloudflare Tunnel.

Các lớp kết nối production:

```text
manln.online -> frontend/Next.js
backend.manln.online -> backend
```

Luồng async export hiện tại:

```text
POST/GET export-bundle với async=true
-> nhận jobId
-> polling export-jobs/:id
-> chờ status ready
-> download export-jobs/:id/download
```

Frontend đã có retry giới hạn cho:

- access token hết hạn trong lúc export;
- lỗi mạng dạng `TypeError`, bao gồm lỗi transport có thể xảy ra với QUIC.

Retry frontend không thay thế việc kiểm tra log backend hoặc Cloudflare Tunnel. Nếu response có HTTP 200 nhưng file ZIP hỏng, cần kiểm tra stream, `Content-Length`, thời điểm `archive.finalize()` và log tunnel.

## 4. Lỗi `analytics/top-customers` trả HTTP 503

### Triệu chứng

```text
GET /api/analytics/top-customers?limit=5&page=1&sort=-totalSpent&days=0&lang=vi&locale=vi-VN&currencyCode=VND
503 Service Unavailable
```

### Phân biệt với lỗi export

Request này không thuộc trang xuất sản phẩm.

Trang `/admin/importExport` gọi:

```text
/products/admin/export-stats
/categories
/products/admin/export-bundle
/products/admin/export-jobs/:id/download
```

`/api/analytics/top-customers` được gọi từ Dashboard. Request Dashboard có thể hoàn tất sau khi người dùng đã chuyển sang trang Import/Export.

### Nguyên nhân cần kiểm tra

1. Backend chưa sẵn sàng hoặc MongoDB bị mất kết nối.

   `app.js` có thể trả:

   ```text
   DATABASE_UNAVAILABLE
   SERVICE_NOT_READY
   ```

2. Aggregation bị timeout.

   `getTopCustomers` thực hiện `$lookup` orders cho các customer, tính tổng tiền rồi sort ở Node.js. Query bị giới hạn thời gian bằng `withTimeout`.

   Khi timeout, error handler chuyển thành:

   ```text
   SERVICE_UNAVAILABLE
   HTTP 503
   ```

3. Frontend gọi API này với `skipRetry: true`, nên lỗi 503 tạm thời được hiển thị ngay.

### Cần kiểm tra tiếp

Trong Network response cần xem trường `code`. Đồng thời kiểm tra log backend tại thời điểm request:

```text
[ErrorHandler]
database:blocked
Database operation timed out
```

Không nên quy lỗi này cho Cloudflare Tunnel nếu response là JSON error do backend tạo. Tunnel lỗi thường cần kiểm tra thêm mã 502/504, log connection hoặc HTML error response.

## 5. Lỗi `VM72 reportAllChanges startTime`

### Triệu chứng

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
at et.reportAllChanges
at requestIdleCallback
```

### Kết quả kiểm tra

Source code frontend không chứa:

```text
web-vitals
reportAllChanges
onCLS
onLCP
onINP
```

Stack trace nằm trong `VM72` và dùng `requestIdleCallback`, nên nhiều khả năng là script đo Web Vitals được inject bởi Builder preview, môi trường preview hoặc extension trình duyệt.

Lỗi này không liên quan trực tiếp đến:

- component About;
- video hero;
- overlay About;
- luồng export sản phẩm.

### Cách xác nhận

- Thử cửa sổ ẩn danh và tắt extension.
- So sánh Builder preview với domain production.
- Mở source của `VM72` trong DevTools để xác định script inject.

Nếu chỉ xảy ra trong Builder preview thì không cần sửa application code.

## 6. Các lệnh seed liên quan

Cài dependency trước khi chạy seed:

```bash
cd online-store-backend
npm ci
```

Chỉ xử lý media About:

```bash
npm run seed:about-media
```

Full seed:

```bash
npm run seed
```

Full seed có thể chạy product pipeline, dịch sản phẩm và các seed khác. Không cần chạy `npm run build` chỉ để kiểm tra các vấn đề trong tài liệu này.

## 7. Đối chiếu source và test hiện tại

Phần này phản ánh trạng thái được đối chiếu từ source/test hiện tại, không phải kết quả runtime mới.

### Lỗi cần xử lý trước khi kết luận test translation đã pass

- `online-store-backend/src/controllers/translationController.js` gọi `StaticTranslation.findOne()` ở các luồng static translation, fallback và health, nhưng hiện chưa thấy import `../models/StaticTranslation` tương ứng ở đầu file. Cần bổ sung hoặc xác minh dependency trước khi kết luận các endpoint này hoạt động.
- `online-store-backend/src/test/test-config.js` chỉ loại một danh sách cố định khỏi test mặc định. Các file `translation-api.test.js`, `db-state.test.js` và `language-sync-flow.test.js` vẫn có nguy cơ được discovery dù phụ thuộc MongoDB/backend hoặc có thể kết thúc mà không fail process khi request lỗi. Phải tách chúng thành integration/manual test hoặc sửa runner.
- `online-store-backend/src/test/translation-integration.test.js` vẫn còn assertion kiểu `status < 500` và `status < 400`. Đây không đủ để xác nhận response contract; test phải kiểm tra status mong đợi, body và thay đổi dữ liệu.
- Regression test ZIP tại `online-store-backend/src/test/import-file-validator.test.js` kiểm tra metadata kích thước sai, trong khi `online-store-backend/src/utils/zipImport.js` vẫn dùng metadata cho compression ratio trước khi đọc buffer thật. Cần đồng bộ code và test.

### Cảnh báo bảo mật và độ tin cậy chưa hoàn tất

- SSRF chưa có policy đồng nhất: validator import chưa resolve DNS private IP và `cloudinaryService.js` còn tải URL bằng `fetch(..., redirect: 'follow')` trực tiếp.
- ZIP import vẫn giữ archive, dữ liệu giải nén và asset trong memory; giới hạn kích thước chưa loại bỏ hoàn toàn rủi ro OOM.
- CSV export chưa trung hòa giá trị bắt đầu bằng `=`, `+`, `-` hoặc `@`.
- SVG chưa được sanitize đầy đủ cho script, event handler, `foreignObject` và external reference.
- Import chưa atomic trên toàn bộ Product, Category, translation và Cloudinary; vẫn cần test concurrent import, duplicate key và rollback khi lỗi giữa chừng.
- Quota export/import và disk cleanup vẫn có khả năng race giữa bước kiểm tra quota và bước tạo job/upload.

### Frontend và môi trường kiểm thử

- Frontend hiện chưa có test runner, test script hoặc script `typecheck` chính thức; việc kiểm tra type phải chạy riêng từ `online-store-frontend` bằng `npx --no-install tsc --noEmit`.
- `online-store-frontend/scripts/check-ui-emoji.js` quét `src/test`, nhưng thư mục này hiện không tồn tại; `npm run check:emoji` cần được sửa trước khi dùng làm quality check.
- Root `package.json` đang bị xóa trong working tree và không thấy `pnpm-lock.yaml` trong repository; không chạy workflow npm/pnpm ở root cho tới khi xác minh đây là thay đổi có chủ ý.

### Contract `specs`

Validator hiện tại cho phép sản phẩm thiếu `specs` và normalize thành `{}`; `specs: {}` cũng là trạng thái hợp lệ theo code/test hiện tại. Không được ghi hoặc test theo giả định cũ rằng `specs` luôn bắt buộc và phải không rỗng.
