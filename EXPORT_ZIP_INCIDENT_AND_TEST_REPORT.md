# Báo cáo sự cố, kiến trúc và kiểm thử Export ZIP

## 1. Phạm vi tài liệu

Tài liệu này ghi lại toàn bộ quá trình điều tra và kiểm thử chức năng export sản phẩm dạng ZIP, bao gồm:

- Lỗi trả HTTP `200` nhưng file ZIP bị cắt hoặc không mở được.
- Đảm bảo ZIP được hoàn tất trước khi gửi response.
- Đảm bảo có `products.json` hoặc `products.csv`.
- Đảm bảo có ảnh chính và ảnh gallery.
- Hỗ trợ `locales=vi` và alias cũ `lang=vi`.
- Phân biệt lỗi code, database, Next.js proxy, Cloudflare Tunnel và Cloudinary.
- Export đồng bộ và async export job.
- Chạy kiểm thử bằng Windows PowerShell và Playwright.
- Cấu hình production mặc định nhưng vẫn cho phép override local/staging.

Tài liệu này bổ sung cho:

```text
EXPORT_ZIP_TROUBLESHOOTING.md
```

Không ghi tài khoản, mật khẩu hoặc access token thật vào tài liệu này.

---

## 2. Môi trường và cấu trúc dự án

### 2.1. Thư mục kiểm thử chính

Phiên bản code đã dùng để kiểm thử:

```text
Backend:
E:\Dev Camp\26-4-4\online-store-backend

Frontend:
E:\Dev Camp\26-4-4\online-store-frontend
```

Backend chạy tại:

```text
http://127.0.0.1:5000
```

Frontend local chạy tại:

```text
http://127.0.0.1:3000
```

Production hiện tại:

```text
Frontend: https://manln.online
Backend:  https://backend.manln.online
```

### 2.2. Thành phần chính

```text
online-store-backend/
├─ src/
│  ├─ app.js
│  ├─ controllers/
│  │  └─ productImportController.js
│  ├─ routes/
│  │  └─ productRoutes.js
│  ├─ services/
│  │  ├─ exportJobService.js
│  │  ├─ exportStorage.js
│  │  └─ exportMetrics.js
│  ├─ models/
│  │  └─ ExportJob.js
│  └─ test/
│     ├─ importFileValidator.test.js
│     └─ exportJobService.test.js
└─ scripts/
   └─ test-export-production.ps1

online-store-frontend/
├─ src/
│  ├─ config.ts
│  ├─ lib/
│  │  └─ api.ts
│  ├─ components/admin/
│  │  └─ ImportExportWidget.tsx
│  └─ pages/admin/
│     └─ exportProducts.tsx
├─ next.config.ts
└─ .env.local
```

### 2.3. Phiên bản công cụ

Các phiên bản ghi nhận trên máy Windows dùng để test:

```text
Windows PowerShell: 5.1.26100.9168
Node.js:             v24.14.1
npm:                 11.13.0
Playwright:          1.62.1
Next.js runtime:     16.3.1
React:               19.2.0
TypeScript:          5.9.3
```

Phiên bản package backend/frontend trong code:

```text
archiver:  ^8.0.0
express:   ^5.2.1
mongoose:  ^9.0.1
next:      ^16.2.4
react:     19.2.0
typescript: ^5.9.3
```

Trong môi trường agent, kiểm tra TypeScript từng hiển thị Node `v22.22.0` và npm `10.9.4`. Đây là môi trường chạy kiểm tra riêng, không phải phiên bản PowerShell trên máy Windows dùng để chạy test thực tế.

---

## 3. Cấu trúc endpoint

Router sản phẩm được mount dưới `/api/products`.

### 3.1. Export đồng bộ

```text
GET /api/products/admin/export-bundle
```

Ví dụ:

```text
/api/products/admin/export-bundle?format=json&locales=vi&limit=10
```

### 3.2. Export async

Dùng cùng endpoint nhưng thêm `async=true`:

```text
/api/products/admin/export-bundle?format=json&locales=vi&limit=100&async=true
```

Response enqueue thành công:

```text
HTTP 202
{
  "success": true,
  "jobId": "...",
  "status": "queued"
}
```

### 3.3. Job status và download

```text
GET  /api/products/admin/export-jobs/:id
POST /api/products/admin/export-jobs/:id/cancel
POST /api/products/admin/export-jobs/:id/retry
GET  /api/products/admin/export-jobs/:id/download
```

Job thông thường chuyển trạng thái:

```text
queued -> processing -> ready
```

Trạng thái lỗi:

```text
failed
cancelled
```

---

## 4. Kiến trúc export ZIP hiện tại

### 4.1. Luồng đồng bộ

Các hàm chính nằm trong:

```text
online-store-backend/src/controllers/productImportController.js
```

Luồng hiện tại:

```text
Parse query
-> resolve filter/category/brand
-> truy vấn products theo batch bằng keyset pagination `_id`
-> lấy translation cache
-> serialize product
-> tải ảnh remote
-> tạo ZIP trong thư mục tạm
-> append products.json hoặc products.csv
-> append image assets
-> await archive.finalize()
-> await finished(output)
-> stat file để lấy Content-Length
-> res.download(file ZIP hoàn chỉnh)
-> cleanup thư mục tạm
```

Đoạn invariant quan trọng:

```js
await appendExportContent(archive, payload, contentFormat);
await archive.finalize();
await streamFinished;
```

Response chỉ được gửi sau khi file hoàn tất:

```js
const { size } = await fs.promises.stat(filePath);
res.setHeader('Content-Type', 'application/zip');
res.setHeader('Content-Length', size);
res.download(filePath, fileName, callback);
```

Mục đích là không còn tình trạng gửi header `200` trước khi ZIP hoàn tất.

### 4.2. Product metadata

`serializeProductForExport()` tạo metadata gồm:

```js
{
  ...productData,
  productId: _id.toString(),
  categoryId: category?._id?.toString(),
  category: category?.name,
  images,
  imagePublicIds,
  imageAssetPaths,
  translations
}
```

File JSON trong ZIP có dạng tổng quát:

```json
{
  "success": true,
  "format": "zip",
  "contentFormat": "json",
  "locales": ["vi"],
  "products": [
    {
      "productId": "...",
      "images": [
        {
          "url": "https://...",
          "position": 0,
          "type": "main",
          "assetPath": "assets/images/product-id-0.jpg"
        }
      ],
      "imageAssetPaths": [
        "assets/images/product-id-0.jpg"
      ]
    }
  ]
}
```

### 4.3. Ảnh chính và gallery

`getExportImages()` xử lý:

```js
productData.image
productData.images
```

Quy tắc:

- `image` là ảnh chính, type mặc định là `main`.
- `images` là gallery/ảnh chi tiết.
- Có hỗ trợ dạng phần tử string hoặc object.
- Có hỗ trợ `imagePublicIds` và `publicId` trên từng ảnh.
- URL trùng được loại bỏ.
- Không có field runtime riêng tên `detailImages` trong Product model hiện tại.

Asset path:

```text
assets/images/{productId}-{position}.{extension}
```

### 4.4. Tải ảnh remote

Các giới hạn hiện tại:

```js
const EXPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EXPORT_IMAGE_DOWNLOAD_CONCURRENCY = 4;
```

Ảnh chỉ chấp nhận các content type đã biết:

```text
image/jpeg -> jpg
image/png  -> png
image/webp -> webp
image/gif  -> gif
image/avif -> avif
image/svg+xml -> svg
```

Mỗi request ảnh có timeout tối đa 30 giây:

```js
AbortSignal.timeout(30000)
```

Có giới hạn kích thước qua `Content-Length` và trong lúc đọc stream.

Các URL trùng được cache trong `assetsByUrl` để không tải lại trong cùng một archive.

Concurrency được giới hạn bằng worker pool tối đa 4 task:

```js
const workerCount = Math.min(
  EXPORT_IMAGE_DOWNLOAD_CONCURRENCY,
  imageTasks.length,
);

await Promise.all(
  Array.from({ length: workerCount }, processImageTasks),
);
```

Nếu một ảnh remote lỗi nhưng request export chưa bị hủy:

```text
Ảnh binary bị bỏ qua
URL gốc vẫn giữ trong products.json
Các ảnh khác vẫn tiếp tục export
```

Log tương ứng:

```text
[EXPORT_IMAGE_ASSET_SKIPPED]
```

Nếu client thật sự hủy request thì lỗi được throw để cleanup đúng.

### 4.5. Locale và translation

Parser hỗ trợ cả hai dạng:

```text
locales=vi
lang=vi
```

Logic alias:

```js
const locales = requestedLocales ?? legacyLocale;
```

Translation fallback sử dụng:

```text
locale yêu cầu
-> fallback cấu hình
-> default language
```

---

## 5. Async export job

### 5.1. Worker

File:

```text
online-store-backend/src/services/exportJobService.js
```

Cấu hình chính:

```js
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 5000;
const EXPORT_LEASE_MS = 10 * 60 * 1000;
const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
```

Worker thực hiện:

```text
claim job queued
-> status processing
-> tạo payload
-> tạo ZIP
-> lưu local hoặc S3
-> cập nhật status ready
-> cung cấp downloadUrl
```

File được tạo theo job/attempt:

```text
{jobId}-{attempt}.zip
```

### 5.2. Heartbeat và retry

Lease được gia hạn định kỳ trong lúc job chạy. Nếu job lỗi, worker có thể retry tối đa 3 attempts.

Kết quả job có các thông tin:

```text
jobId
status
attempts
createdAt
startedAt
finishedAt
errorMessage
 downloadUrl khi ready
```

### 5.3. Storage

File:

```text
online-store-backend/src/services/exportStorage.js
```

Hỗ trợ:

```text
EXPORT_STORAGE=local
EXPORT_STORAGE=s3
```

Local mặc định lưu trong thư mục tạm export job.

S3 sử dụng:

```text
EXPORT_S3_BUCKET
EXPORT_S3_REGION hoặc AWS_REGION
EXPORT_S3_PREFIX
EXPORT_S3_ENDPOINT tùy cấu hình
```

File local phải được kiểm tra là managed path trước khi xóa hoặc download.

---

## 6. Các lỗi đã gặp và cách xử lý

### 6.1. HTTP 200 nhưng ZIP bị cắt

Lỗi ban đầu:

```text
GET /api/products/admin/export-bundle?format=json&locales=vi
net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)
```

Các biểu hiện liên quan:

```text
ERR_INCOMPLETE_CHUNKED_ENCODING
ZIP truncated
Premature close
```

Nguyên nhân:

```text
Archive được pipe trực tiếp vào HTTP response trước khi xử lý xong toàn bộ product/translation/image.
```

Cách xử lý:

```text
Tạo ZIP trong file tạm
-> finalize archive
-> chờ output stream finish
-> set Content-Length
-> res.download file hoàn chỉnh
```

### 6.2. Ảnh remote làm fail toàn bộ export

Lỗi:

```text
EXPORT_IMAGE_DOWNLOAD_FAILED
```

Cách xử lý:

- Giới hạn timeout từng ảnh 30 giây.
- Giới hạn kích thước 5 MB.
- Giới hạn concurrency 4.
- Ảnh lỗi không làm fail toàn bộ export nếu client còn kết nối.
- Giữ URL gốc trong metadata.
- Log mã lỗi ảnh bị bỏ qua.

### 6.3. Cloudinary

Log thực tế khi test ảnh hợp lệ:

```text
host: res.cloudinary.com
status: 200
outcome: success
elapsedMs: khoảng 50-80ms cho phần lớn ảnh
```

Một số ảnh chậm hơn:

```text
khoảng 1.5-2.1 giây
```

nhưng vẫn trả `200` và `success`.

Kết luận: các log Cloudinary này không cho thấy URL ảnh hỏng. Lỗi `limit=100` xảy ra do thời gian tổng của export đồng bộ, không phải do từng URL Cloudinary.

### 6.4. Client/proxy đóng connection

Các lỗi đã gặp:

```text
ERR_STREAM_PREMATURE_CLOSE
ECONNRESET
EPIPE
socket hang up
context canceled
stream canceled by remote
```

Controller có kiểm tra:

```js
req.aborted
res.destroyed
ERR_STREAM_PREMATURE_CLOSE
ECONNRESET
EPIPE
```

Nếu client đã ngắt, backend không cố gửi thêm JSON lỗi sau khi response đã bị destroy.

### 6.5. Cloudflare Tunnel

Các mã đã gặp:

```text
530
1033
524
```

Ý nghĩa:

```text
530/1033: tunnel/origin availability
524: Cloudflare chờ origin quá lâu
```

Không dùng lỗi Cloudflare để kết luận logic ZIP nếu backend local chưa pass độc lập.

### 6.6. Database timeout

Lỗi:

```text
Database operation timed out after 7000ms
Database operation timed out after 8000ms
Database operation timed out after 10000ms
```

Một API bị ảnh hưởng trong giao diện:

```text
/api/analytics/top-customers?limit=5&page=1&sort=-totalSpent&days=0&lang=vi&locale=vi-VN&currencyCode=VND
```

Response:

```text
HTTP 503
Máy chủ đang gặp vấn đề. Vui lòng thử lại sau
```

Đây là lỗi analytics/database riêng, không phải lỗi ZIP trực tiếp.

`withTimeout()` dùng `Promise.race()`, nên timeout Promise bên ngoài không nhất thiết hủy query MongoDB thật. Chưa tăng timeout mù quáng; cần kiểm tra bằng MongoDB `explain`, `executionTimeMillis`, `docsExamined`, `keysExamined` và pool metrics.

### 6.7. PowerShell tách sai `else`/`finally`

Lỗi:

```text
else : The term 'else' is not recognized
finally : The term 'finally' is not recognized
```

Nguyên nhân:

- Dán `}` và `else {` thành hai lệnh độc lập ở console.
- Dán phần `finally` sau khi khối `try/catch` đã được thực thi xong.

Cách xử lý:

- Dùng script `.ps1` hoàn chỉnh thay vì dán nhiều block thủ công.
- Nếu chạy inline, `} else {` phải ở cùng một khối lệnh.
- Không dán `finally` sau khi prompt đã quay về `PS C:\...>`.

### 6.8. PowerShell làm mất quote khi dùng `node -e`

Lỗi:

```text
SyntaxError: missing ) after argument list
Expected ',', got '<eof>'
```

Cách xử lý:

```powershell
@'
... JavaScript ...
'@ | node -
```

### 6.9. Test đọc HTTP 500 như ZIP

Một script test cũ gọi validator ZIP ngay cả khi response là HTTP 500, tạo thêm lỗi gây nhiễu:

```text
ZIP_END_OF_CENTRAL_DIRECTORY_NOT_FOUND
```

Cách xử lý:

```text
Nếu status != 200:
  đọc body lỗi
  không gọi ZIP validator
```

Script production mới đã kiểm tra status trước khi validate ZIP.

### 6.10. Frontend chạy build/config cũ

Frontend từng proxy tới:

```text
https://backend.manln.online
```

trong khi backend local chạy:

```text
http://127.0.0.1:5000
```

Với `next start`, nếu chưa build lại, frontend có thể tiếp tục dùng build `.next` cũ và chưa có async polling mới.

Khi test code mới local, dùng:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:5000"
npm run dev
```

Khi test production, không đặt override local.

### 6.11. Turbopack Windows resource error

Đã gặp:

```text
TurbopackInternalError
os error 1450
Insufficient system resources exist
```

Kết luận:

- Đây là lỗi tài nguyên Windows/Turbopack.
- Không phải file `try-get-preview-data.js` bị hỏng.
- TypeScript vẫn có thể kiểm tra độc lập bằng `npx --no-install tsc --noEmit`.
- Không chạy `npm run build` chỉ để kiểm tra TypeScript theo quy trình đã thống nhất.

### 6.12. MongoDB cursor hết hạn trong async export

Khi chạy job cũ với nhiều ảnh remote, backend ghi nhận:

```text
[EXPORT_ZIP_OUTPUT_ERROR] { message: 'cursor id 7613744106173969536 not found' }
[EXPORT_ZIP_OUTPUT_ERROR] { message: 'cursor id 6229555173115654491 not found' }
```

Hai attempt đều chạy khoảng 17-19 phút và kết thúc bằng `MongoServerError` trong `FindCursor.getMore`. Đây là lỗi logic trong luồng xử lý, không phải lỗi PS1 theo sai job.

Nguyên nhân là MongoDB cursor được mở tại `productImportController.js` rồi giữ qua các lần `yield`, translation và tải ảnh remote. Mỗi ảnh có timeout tối đa 30 giây; khi có nhiều ảnh timeout, cursor không được đọc trong thời gian đủ dài và MongoDB đóng cursor.

Đã sửa trong source:

- Bỏ cursor stream dài hạn.
- Đọc từng batch độc lập bằng keyset pagination theo `_id` tăng dần.
- Mỗi batch hoàn tất truy vấn trước khi xử lý translation và ảnh.
- Batch tiếp theo dùng điều kiện `_id: { $gt: lastId }`, tránh trùng hoặc bỏ sót product trong cùng luồng export.
- Worker kiểm tra yêu cầu cancel giữa các batch.
- API job trả thêm `cancelRequested` để phân biệt `processing` với đang chờ hủy.

Không dùng `noCursorTimeout` hoặc chỉ tăng timeout cursor như một cách khắc phục, vì các cách đó giữ resource MongoDB lâu hơn và chỉ che nguyên nhân.

### 6.13. Startup bị hiểu nhầm là cần mở frontend

Dòng log:

```text
⏱️ Load time: 357ms
```

chỉ phản ánh thời gian nạp các file translation, không phải tổng thời gian backend sẵn sàng. Backend vẫn phải hoàn tất kết nối MongoDB, các seed, resume language setup, migration coupon currency và kiểm tra storage trước khi đặt `startupReady = true`.

Mở `https://manln.online/` không phải điều kiện để backend tiếp tục. Server bắt đầu listen trước khi gọi `connectDB()`, còn các API dùng database bị giữ ở `503 SERVICE_NOT_READY` cho tới khi readiness hoàn tất. Việc mở frontend chỉ tạo request đúng lúc backend có thể vừa hoàn tất startup, nên dễ tạo cảm giác frontend đã kích hoạt tiến trình.

Đã tối ưu trong source:

- Scheduler tỷ giá không còn chặn readiness; chạy nền và tự ghi log lỗi nếu cập nhật thất bại.
- Các phase startup được đo riêng bằng log `[STARTUP]`, giúp xác định chính xác seed/migration/query nào chậm.
- Seed và migration bắt buộc vẫn hoàn tất trước khi `startupReady = true`.
- Dùng `/readyz` làm mốc kiểm tra thay vì mở trang frontend.

Các tác vụ nền không được đánh dấu ready nếu chưa hoàn tất phần dữ liệu bắt buộc; không chạy seed song song mù quáng vì có thể tạo race condition giữa các collection.

### 6.14. Cloudflare Tunnel resolve `localhost` sang IPv6

Trong lần chạy mới, tunnel đã đăng ký connection nhưng không gọi được backend:

```text
Unable to reach the origin service
 dial tcp [::1]:5000: connectex: No connection could be made because the target machine actively refused it
```

Nguyên nhân là `localhost` được resolve sang IPv6 `::1`, trong khi backend đang listen tại IPv4. Vì vậy request login qua `https://backend.manln.online` trả `502` và PS1 dừng ở bước login; chưa tạo export job trong lần chạy này.

Đã đổi ingress Windows sang địa chỉ IPv4 tường minh:

```text
manln.online          -> http://127.0.0.1:3000
backend.manln.online  -> http://127.0.0.1:5000
```

File cấu hình:

```text
online-store-backend/.cloudflared/config.windows.yml
```

Sau khi sửa phải khởi động lại tunnel để cloudflared đọc cấu hình mới. Cảnh báo DNS refresh riêng của cloudflared vẫn cần theo dõi, nhưng không được gộp với lỗi origin `::1:5000`.

### 6.15. Backend chạy seed mỗi lần `npm start`

Quan sát khi restart backend:

```text
npm start
-> node src/app.js
-> chạy lại các startup seed/migration
```

Đây không phải là lệnh `npm run seed`, mà các seed được gọi trực tiếp trong `connectDB()` tại:

```text
online-store-backend/src/app.js
```

Các phase được gọi sau mỗi process mới:

```text
seed-homepage-banners
seed-translations
seed-brands
seed-currency
seed-languages
resume-language-setups
migrate-coupon-currencies
```

Các cờ như `translationsSeeded`, `brandsSeeded` và `currencySeeded` chỉ nằm trong memory của process. Khi chạy lại `npm start`, process mới đặt các cờ về `false`, nên chúng không thể ngăn seed ở lần restart tiếp theo.

Ảnh hưởng đo được:

```text
seed-translations: 417580ms, khoảng 6 phút 58 giây
seed-translations: 785677ms, khoảng 13 phút 05 giây
```

`seedTranslations()` xử lý khoảng 684 file translation bằng các lần `findOneAndUpdate()` tuần tự, tương ứng 9 ngôn ngữ × khoảng 76 namespace. Đây là nguyên nhân chính làm backend mất nhiều phút trước khi đạt `startupReady`.

Phân biệt hành vi hiện tại:

- Banner kiểm tra số lượng bản ghi trước; thường không tạo trùng nếu dữ liệu đã tồn tại.
- Translation vẫn đọc và upsert lại toàn bộ namespace ở mỗi lần khởi động.
- Brand, currency và language có tính chất idempotent hơn nhưng vẫn được gọi lại.
- Đây là vấn đề hiệu năng startup/backend, chưa có bằng chứng là memory leak, `localStorage`, React hook hoặc frontend state.

Kết luận tạm thời:

```text
Không thay đổi cơ chế seed trong phạm vi điều tra import/export hiện tại.
```

Hướng xử lý để xem xét sau:

- Lưu seed version/checksum trong database để bỏ qua dữ liệu không thay đổi.
- Chuyển seed translation đầy đủ sang lệnh chạy riêng thay vì chạy trong `npm start`.
- Dùng bulk write hoặc chỉ cập nhật namespace đã thay đổi.
- Giữ các dữ liệu bắt buộc như currency/language trong startup nếu readiness vẫn phụ thuộc vào chúng.

### 6.16. Export async `limit=500` thất bại do database timeout

Kết quả kiểm thử local mới nhất:

```text
Environment: local
Target: backend
Query: format=json&locales=vi&limit=500&async=true
Max wait: 179 minutes
Job ID: 6a99559f777ac82bab95866a
```

Job được enqueue và worker retry đúng thiết kế:

```text
ENQUEUE STATUS: 202
attempt 1: processing -> queued -> timeout sau 34258ms
attempt 2: processing -> queued -> timeout sau 31775ms
attempt 3: processing -> failed -> timeout sau 31574ms
FINAL RESULT: FAIL
```

Lỗi thực tế:

```text
Database operation timed out after 30000ms
```

Stack trỏ tới:

```text
online-store-backend/src/utils/mongooseUtils.js:26
```

Nguyên nhân đã xác định ở mức luồng xử lý:

- `limit=100` chỉ cần xử lý một batch và đã tạo ZIP thành công với 794 image entries.
- `limit=500` cần xử lý nhiều batch lớn hơn, trong đó có truy vấn sản phẩm, populate category và truy vấn product translation cache.
- Các thao tác database export được bọc bởi `withExportTimeout(..., 30000)` và query MongoDB cũng dùng `maxTimeMS(30000)` tại `productImportController.js`.
- Một thao tác trong luồng tạo payload vượt 30 giây, khiến attempt thất bại trước khi ZIP hoàn tất.
- `-MaxWaitMinutes 179` chỉ tăng thời gian PowerShell poll job; không tăng giới hạn 30000ms của từng thao tác database.

`withTimeout()` tại `mongooseUtils.js` dùng `Promise.race()`. Khi timeout Promise bên ngoài, query MongoDB gốc không nhất thiết bị hủy ngay. Nếu nhiều attempt hoặc job chạy đồng thời, query còn lại có thể tiếp tục sử dụng connection pool và làm tăng áp lực database.

Đây chưa phải kết luận rằng ảnh bị lỗi. Với job `limit=500` bị failed:

```text
Không có ZIP hoàn chỉnh để download.
Không có ZIP RESULT.
Không thể xác nhận số ảnh của job này.
```

Kết quả ảnh đã được xác nhận ở job `limit=100`:

```text
imageEntryCount: 794
hasImagesFolder: true
missingAssetPaths: []
FINAL RESULT: PASS
```

Cần phân biệt thêm với lỗi `ROUTE_NOT_FOUND`:

- `ROUTE_NOT_FOUND` xuất hiện sau một số job `ready` nhưng log chưa in method và URL request, nên chưa xác định được request 404 cụ thể.
- Đây là vấn đề truy cập route/download riêng, không phải nguyên nhân của `limit=500` database timeout.
- Các lần test có `[DOWNLOAD STATUS] 200` và `ZIP RESULT ok: true` cho thấy download route có lúc hoạt động bình thường.

Kết luận hiện tại:

```text
limit=10: PASS, ZIP và ảnh hợp lệ
limit=100: PASS, ZIP và 794 ảnh hợp lệ
limit=500: FAIL trước khi tạo ZIP hoàn chỉnh do database operation timeout 30000ms
```

Fix đã áp dụng:

- Giảm `EXPORT_BATCH_SIZE` từ 250 xuống 100 tại `productImportController.js` để giới hạn kích thước truy vấn sản phẩm và translation cache trong mỗi batch.
- Giữ timeout database 30000ms để không che khuất query chậm bằng cách tăng timeout mù quáng.
- Chuẩn hóa endpoint download async trong `online-store-frontend/src/lib/api.ts`: nếu backend trả URL bắt đầu bằng `/api/`, frontend không nối thêm một `/api` thứ hai.

Cần retest thực tế `limit=500` sau khi backend/frontend được khởi động lại. Kết quả pass phải xác nhận cả job `ready`, download HTTP 200, ZIP hợp lệ và `missingAssetPaths: []`.

Không tăng timeout database mù quáng. Nếu `limit=500` vẫn timeout sau khi giảm batch, bước tiếp theo là xác định operation cụ thể bị chậm bằng `explain('executionStats')`, pool metrics và log phase/batch.

---

## 7. Cập nhật frontend async

### 7.1. API client

File:

```text
online-store-frontend/src/lib/api.ts
```

Đã bổ sung API flow:

```text
exportProductBundleAsync()
```

Flow:

```text
GET export-bundle?async=true
-> kiểm tra HTTP 202
-> lấy jobId
-> poll /products/admin/export-jobs/:id mỗi 5 giây
-> dừng khi ready/failed/cancelled
-> download /products/admin/export-jobs/:id/download
-> kiểm tra application/zip
-> trả Blob
```

Timeout tổng mặc định của frontend async:

```text
30 phút
```

### 7.2. Giao diện

Đã chuyển sang async API:

```text
online-store-frontend/src/components/admin/ImportExportWidget.tsx
online-store-frontend/src/pages/admin/exportProducts.tsx
```

Frontend không còn giả định mọi response `2xx` đều là Blob ZIP. Response `202 JSON` được xử lý như job.

---

## 8. Production runtime và override

### 8.1. Frontend config

File:

```text
online-store-frontend/src/config.ts
```

Production URL mặc định:

```ts
export const PRODUCTION_BACKEND_URL = 'https://backend.manln.online';

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || PRODUCTION_BACKEND_URL
).replace(/\/+$/, '');
```

Ý nghĩa:

```text
Mặc định: production
Override explicit: NEXT_PUBLIC_API_BASE_URL
```

### 8.2. Next.js rewrite

File:

```text
online-store-frontend/next.config.ts
```

Rewrite mặc định:

```text
/api/:path* -> https://backend.manln.online/api/:path*
```

Override local:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:5000"
```

File `.env.local` hiện đặt production:

```text
NEXT_PUBLIC_FRONTEND_URL=https://manln.online
NEXT_PUBLIC_API_BASE_URL=https://backend.manln.online
```

### 8.3. Socket

Socket giữ logic local khi hostname là localhost và production khi chạy domain production. API HTTP chính vẫn đi qua `/api` và Next.js rewrite.

---

## 9. Script PowerShell production-first

File mới:

```text
online-store-backend/scripts/test-export-production.ps1
```

Mặc định:

```text
Environment: production
Target:     frontend
Limit:      100
Max wait:   30 phút
Run count:  1 job
```

Production URLs mặc định:

```text
Frontend: https://manln.online
Backend:  https://backend.manln.online
```

Local override:

```powershell
-Environment local
```

Hoặc override trực tiếp:

```powershell
-FrontendBaseUrl "http://127.0.0.1:3000"
-BackendBaseUrl "http://127.0.0.1:5000"
```

### 9.1. Lệnh PowerShell dynamic trên Windows

Các lệnh dưới đây dùng thư mục hiện tại và tự suy ra thư mục frontend cùng cấp. Không hard-code đường dẫn workspace cụ thể.

#### Terminal backend

```powershell
$backendRoot = (Get-Location).Path
Write-Host "Backend: $backendRoot"
npm start
```

#### Kiểm tra readiness local

```powershell
$port = if ($env:PORT) { $env:PORT } else { 5000 }
$readyUrl = "http://127.0.0.1:$port/readyz"

1..60 | ForEach-Object {
    try {
        $ready = Invoke-RestMethod $readyUrl
        Write-Host "Backend status: $($ready.status)"

        if ($ready.status -eq "ready") {
            $ready | ConvertTo-Json -Depth 5
            break
        }
    } catch {
        Write-Host "Backend chưa ready, chờ 5 giây..."
    }

    Start-Sleep -Seconds 5
}
```

#### Terminal frontend

```powershell
$backendRoot = (Get-Location).Path
$workspaceRoot = Split-Path $backendRoot -Parent
$frontendRoot = Join-Path $workspaceRoot "online-store-frontend"

if (-not (Test-Path $frontendRoot)) {
    throw "Không tìm thấy frontend: $frontendRoot"
}

Set-Location $frontendRoot
Write-Host "Frontend: $((Get-Location).Path)"
npm start
```

#### Terminal tunnel

```powershell
$backendRoot = (Get-Location).Path
$configPath = Join-Path $backendRoot ".cloudflared\config.windows.yml"

if (-not (Test-Path $configPath)) {
    throw "Không tìm thấy tunnel config: $configPath"
}

Write-Host "Tunnel config: $configPath"
npm run tunnel
```

#### Terminal test PS1

```powershell
$backendRoot = (Get-Location).Path
$exportScript = Join-Path $backendRoot "scripts\test-export-production.ps1"
$credentialPath = Join-Path $HOME ".online-store-export-credential.xml"

if (-not (Test-Path $exportScript)) {
    throw "Không tìm thấy script: $exportScript"
}

if (-not (Test-Path $credentialPath)) {
    throw "Không tìm thấy credential: $credentialPath"
}

Write-Host "Script: $exportScript"
Write-Host "Credential: $credentialPath"

& $exportScript `
    -Environment production `
    -Target frontend `
    -Limit 10 `
    -MaxWaitMinutes 30 `
    -CredentialPath $credentialPath
```

Thứ tự chạy là backend -> kiểm tra `ready` -> frontend -> tunnel -> PS1. Không mở frontend để kích hoạt backend và không chạy PS1 nhiều lần cho cùng một lần kiểm tra.

Credential được đọc từ file mã hóa Windows DPAPI:

```text
C:\Users\manku\.online-store-export-credential.xml
```

Không hard-code email/password trong script.

Log script:

- Không in access token.
- Không log từng URL ảnh.
- Chỉ log khi job đổi trạng thái.
- Tự lưu report trên Desktop.
- Khi timeout lúc poll, tự gửi cancel cho đúng `jobId` để không để job test treo trong queue.
- Tự dọn biến môi trường sau khi chạy.
- Không tự gọi `exit`.
- Cho phép `MaxWaitMinutes` tối đa 720 phút.

---

## 10. Kết quả kiểm thử

### 10.1. Local sync `limit=10`

Môi trường:

```text
Backend: http://127.0.0.1:5000
Frontend: http://127.0.0.1:3000
```

Kết quả:

```text
Login backend local: PASS - HTTP 200
Backend local locales=vi: PASS
Backend local alias lang=vi: PASS
Frontend local rewrite: PASS
```

ZIP:

```text
HTTP status:           200
Content-Type:          application/zip
Content-Length:        khớp body
ZIP signature:         hợp lệ
products.json:         có
Product count:         10
Image entry count:     64
Entry count:           65
Images folder:         có
missingAssetPaths:     []
```

Tổng kết:

```text
TOTAL:        3
PASSED:       3
FAILED:       0
FINAL RESULT: PASS
```

### 10.2. Local sync `limit=100`

Kết quả:

```text
Backend local: timeout sau 180000ms
Frontend local: HTTP 500
```

Frontend `500` là hậu quả backend sync không hoàn tất trong thời gian test. Không coi đây là bằng chứng ZIP bị corrupt.

Script cũ đã cố parse response 500 như ZIP và tạo lỗi phụ:

```text
ZIP_END_OF_CENTRAL_DIRECTORY_NOT_FOUND
```

Lỗi phụ này đã được tránh trong script mới.

### 10.3. Local async `limit=100`

Query:

```text
format=json&locales=vi&limit=100&async=true
```

Kết quả enqueue:

```text
HTTP 202
Elapsed: 282ms
Status: queued
```

Worker:

```text
queued -> processing -> ready
Attempts: 1
Thời gian hoàn tất: 227897ms, khoảng 3 phút 48 giây
```

Download:

```text
HTTP status:       200
Content-Type:      application/zip
Content-Length:    75732319 bytes
```

ZIP:

```text
ok:                  true
bytes:               75732319
contentLengthMatches true
zipSignature:        true
zipError:            ""
entryCount:          795
productCount:        100
imageEntryCount:     794
hasProductsJson:     true
hasImagesFolder:     true
missingAssetPaths:   []
```

Tổng kết:

```text
FINAL RESULT: PASS
```

### 10.4. Kiểm tra version và typecheck

Đã kiểm tra trên máy Windows:

```text
PowerShell: 5.1.26100.9168
Node:       v24.14.1
Playwright: 1.62.1
```

TypeScript:

```powershell
npx --no-install tsc --noEmit
```

Kết quả:

```text
PASS
```

Backend syntax:

```powershell
node --check src/services/exportJobService.js
node --check src/services/exportStorage.js
```

Kết quả:

```text
PASS
```

`git diff --check`:

```text
PASS
```

PowerShell parser Windows không chạy trong môi trường agent Linux do giới hạn môi trường; script đã được viết theo cú pháp PowerShell 5.1 và cần chạy thực tế trên Windows.

---

## 11. Trạng thái production hiện tại

Lần test giao diện production trước đó cho thấy frontend/build đang proxy tới production nhưng các API có thể trả lỗi hạ tầng:

```text
Cloudflare 530/1033
Cloudflare 524
socket hang up
ECONNRESET
503 SERVICE_NOT_READY
```

Các API homepage từng bị ảnh hưởng:

```text
/api/currencies
/api/translations
/api/banners
/api/brands
/api/categories
/api/languages/active-config
```

Đây là trạng thái availability của production/Tunnel, không được gán trực tiếp cho logic ZIP khi local async đã pass.

Production test cần được chạy sau khi endpoint production sẵn sàng:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File "E:\Dev Camp\26-4-4\online-store-backend\scripts\test-export-production.ps1" `
  -Environment production `
  -Target frontend `
  -Limit 10000 `
  -MaxWaitMinutes 720
```

Nếu muốn bỏ qua frontend proxy và test trực tiếp backend production:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File "E:\Dev Camp\26-4-4\online-store-backend\scripts\test-export-production.ps1" `
  -Environment production `
  -Target backend `
  -Limit 10000 `
  -MaxWaitMinutes 720
```

Không chạy hai lệnh cùng lúc vì mỗi lệnh tạo một async job riêng.

---

## 12. Log khi chạy qua đêm

Không bật:

```powershell
$env:EXPORT_DEBUG_IMAGES = "true"
```

khi chạy overnight. Cấu hình này in hai dòng cho gần như từng ảnh:

```text
[EXPORT_IMAGE_DOWNLOAD_START]
[EXPORT_IMAGE_DOWNLOAD_END]
```

Với hàng nghìn sản phẩm, log sẽ rất dài.

Nên dùng:

```powershell
$env:EXPORT_DEBUG_IMAGES = "false"
```

Script production-first cũng đã thiết kế log gọn:

```text
[LOGIN STATUS]
[ENQUEUE STATUS]
[JOB ID]
[JOB STATUS] queued
[JOB STATUS] processing
[JOB STATUS] ready
[DOWNLOAD STATUS]
[ZIP RESULT]
[FINAL RESULT]
```

Nếu job retry, backend có thể ghi nhiều lần `STARTED`/`FAILED` theo `attempt`. Đây là log hợp lệ, không phải duplicate vô nghĩa; cần đối chiếu thêm `jobId` và `attempt`.

---

## 13. Trạng thái xử lý theo từng vấn đề

Mỗi vấn đề được tách thành một hạng mục độc lập. Khi hạng mục đạt tiêu chí pass và không có thay đổi liên quan, hạng mục được đóng và không chạy lại toàn bộ test cũ.

| Hạng mục | Bằng chứng | Trạng thái |
|---|---|---|
| Production là runtime mặc định | `src/config.ts`, `next.config.ts`, `.env.local` dùng production fallback | Đã đóng |
| Credential test an toàn | Đọc từ file DPAPI, không hard-code và không ghi token | Đã đóng |
| Login admin | Backend local trả HTTP 200 và access token hợp lệ | Đã đóng |
| ZIP đồng bộ nhỏ | `limit=10`, ZIP hợp lệ, `products.json`, 64 ảnh, không thiếu asset | Đã đóng |
| Locale và alias | `locales=vi` và `lang=vi` đều pass | Đã đóng |
| Frontend local rewrite | Frontend local proxy đúng tới backend local với `limit=10` | Đã đóng |
| Cloudinary image download | Các ảnh kiểm tra trả `200`, outcome `success` | Đã đóng |
| Sync export quy mô lớn | `limit=100` timeout sau 180 giây | Đã xác định: không dùng sync cho export lớn |
| Async enqueue/poll/download | `limit=100`, `202`, `queued -> processing -> ready`, ZIP hợp lệ | Đã đóng ở local |
| Frontend async flow | Đã thêm enqueue, polling và download Blob | Đã đóng ở source code; cần xác nhận sau deploy |
| Production availability | Từng gặp Cloudflare `530/1033/524`, `ECONNRESET`; lần mới gặp origin `::1:5000` bị từ chối | Đã đổi ingress sang `127.0.0.1`; cần restart tunnel và test lại |
| Analytics database | `top-customers` trả `503` do database timeout | Việc riêng, chưa xử lý |
| MongoDB cursor trong export lớn | Reproduced `cursor id not found` sau khoảng 17-19 phút; đã chuyển sang keyset pagination | Đã sửa trong source; cần test hồi quy |
| Async production `limit=10` | Login/enqueue/poll pass, job `6a98ed3fa7fb9820e29e5d39` ready sau 31 giây; PS1 timeout trước download | Tạo ZIP pass; download/validate chưa chạy |
| Async production quy mô lớn | Chưa chạy bằng `limit=10000` sau khi sửa pagination | Chưa kiểm tra |
| Backend startup/readiness | `357ms` chỉ là translation load; readiness bị chi phối bởi DB/seed/migration/scheduler | Đã tối ưu source; cần đo lại qua `/readyz` |
| Production test sau khi tải source mới | PS1 dynamic chạy đúng tới login nhưng nhận `502` do tunnel gọi `::1:5000` | Đã sửa config IPv4; chưa chạy lại sau khi restart tunnel |

### Quy tắc không chạy lại

- Không chạy lại hạng mục đã đóng chỉ vì đang kiểm tra một hạng mục khác.
- Chỉ chạy lại khi file/code liên quan thay đổi, cấu hình môi trường thay đổi, deploy mới hoặc xuất hiện regression.
- Lỗi Cloudflare chỉ mở lại hạng mục production availability; không mở lại kết luận ZIP local.
- Lỗi analytics/database chỉ xử lý trong hạng mục analytics; không dùng nó làm lý do chạy lại export ZIP.
- Khi kiểm tra async lớn, chỉ ghi `jobId`, lần chuyển trạng thái và kết quả ZIP; không bật log từng ảnh.
- Một lần test chỉ tạo một job, tránh test frontend và backend đồng thời làm phát sinh job trùng.

### Thứ tự xử lý còn lại

```text
1. Production availability
2. Frontend production async flow sau deploy
3. Async production limit=100 hoặc limit=500
4. Async production limit=10000 nếu các bước trước pass
5. Analytics/database xử lý riêng
```

---

## 14. Kết luận và quyết định kiến trúc

### Đã giải quyết

```text
ZIP phải hoàn tất trước khi response: PASS
products.json: PASS
Ảnh chính: PASS
Ảnh gallery: PASS
Asset paths: PASS
locales=vi: PASS
lang=vi: PASS
Local frontend rewrite: PASS
Async enqueue/poll/download: PASS ở local; production `limit=10` mới xác nhận đến `ready`
Keyset pagination tránh giữ MongoDB cursor qua I/O dài: đã áp dụng trong source
```

### Đã xác định

```text
Sync limit=10: hoạt động tốt
Sync limit=100: không phù hợp do timeout tổng
Async limit=100: hoạt động tốt nhưng mất khoảng 4 phút
Cloudinary URL hợp lệ: không phải nguyên nhân chính
Analytics database 503: lỗi riêng
Cloudflare 530/1033/524: lỗi hạ tầng/proxy
MongoDB `cursor id not found`: lỗi logic do giữ cursor qua remote I/O; đã tái hiện và đã chuyển sang keyset pagination
PS1 `ASYNC_JOB_TIMEOUT`: timeout phía client không tự hủy job; script đã bổ sung cancel đúng job khi timeout
PS1 production mới: login nhận `502` vì tunnel route tới IPv6 `::1:5000`; đã đổi ingress sang `127.0.0.1`, cần restart tunnel
Backend startup chậm: `357ms` không phải tổng startup; scheduler nền và log phase đã được áp dụng, cần xác nhận phase chậm qua `/readyz` và log `[STARTUP]`
```

### Quyết định sử dụng

```text
Export nhỏ:
  Có thể dùng sync nếu cần response trực tiếp.

Export lớn:
  Dùng async export job.

Production mặc định:
  https://manln.online
  https://backend.manln.online

Local/staging:
  Chỉ dùng khi override explicit bằng biến môi trường hoặc tham số PS1.

Startup:
  Dùng `/readyz` để xác nhận backend sẵn sàng.
  Không cần mở frontend để kích hoạt backend.
  Scheduler và maintenance chạy nền sau khi phần khởi tạo bắt buộc đã được kiểm tra.
```

Không nên dùng synchronous export `limit=10000` qua Cloudflare. Async job là hướng phù hợp vì request enqueue trả nhanh, worker xử lý độc lập với timeout HTTP/proxy và chỉ download file sau khi ZIP đã hoàn tất. Trong worker, product được đọc theo các batch keyset độc lập; không giữ MongoDB cursor trong lúc tải ảnh hoặc ghi ZIP.
