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
-> truy vấn products theo batch
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

## 13. Kết luận và quyết định kiến trúc

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
Async enqueue/poll/download: PASS
```

### Đã xác định

```text
Sync limit=10: hoạt động tốt
Sync limit=100: không phù hợp do timeout tổng
Async limit=100: hoạt động tốt nhưng mất khoảng 4 phút
Cloudinary URL hợp lệ: không phải nguyên nhân chính
Analytics database 503: lỗi riêng
Cloudflare 530/1033/524: lỗi hạ tầng/proxy
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
```

Không nên dùng synchronous export `limit=10000` qua Cloudflare. Async job là hướng phù hợp vì request enqueue trả nhanh, worker xử lý độc lập với timeout HTTP/proxy và chỉ download file sau khi ZIP đã hoàn tất.
