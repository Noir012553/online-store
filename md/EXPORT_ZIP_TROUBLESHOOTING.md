# Điều tra lỗi export ZIP sản phẩm

## Phạm vi

Lỗi ban đầu:

```text
GET /api/products/admin/export-bundle?format=json&locales=vi
net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)
```

Các mục tiêu kiểm tra:

- ZIP phải được hoàn tất trước khi gửi về client.
- Không được trả HTTP 200 nhưng body ZIP bị cắt.
- Bao gồm ảnh chính và ảnh gallery/ảnh chi tiết.
- Hỗ trợ `locales=vi` và alias cũ `lang=vi`.
- Phân biệt lỗi backend, database, proxy và Cloudflare Tunnel.

## Các lỗi đã xác định

### 1. Archive được pipe vào response trước khi hoàn tất

Code cũ bắt đầu gửi archive trực tiếp vào `res` trước khi xử lý xong sản phẩm, bản dịch và ảnh. Nếu lỗi xảy ra sau khi header đã gửi, client nhận được:

```text
HTTP 200
ERR_HTTP2_PROTOCOL_ERROR
ERR_INCOMPLETE_CHUNKED_ENCODING
ZIP truncated
```

Nguyên nhân là response đã có status 200 nhưng archive chưa ghi xong hoặc bị destroy giữa chừng.

### 2. Ảnh remote làm hỏng toàn bộ export

Một ảnh sản phẩm không tải được có thể gây:

```text
EXPORT_IMAGE_DOWNLOAD_FAILED
```

Code cũ coi lỗi một ảnh là lỗi toàn bộ export và trả HTTP 500.

Hành vi hiện tại:

- Ảnh tải được được thêm vào ZIP.
- Ảnh tải lỗi được bỏ qua binary asset.
- URL gốc vẫn được giữ trong `products.json`.
- Ghi log:

```text
[EXPORT_IMAGE_ASSET_SKIPPED]
```

- Request bị client hủy thật sự vẫn được throw để cleanup đúng.

### 3. Client hoặc proxy đóng connection giữa chừng

Các lỗi đã quan sát:

```text
Premature close
ERR_STREAM_PREMATURE_CLOSE
ECONNRESET
EPIPE
context canceled
stream canceled by remote
```

Các nguyên nhân có thể:

- Browser timeout.
- Next.js proxy đóng request.
- Cloudflare Tunnel đóng stream.
- Người dùng reload hoặc đóng trang.
- Export lâu khi có nhiều sản phẩm hoặc ảnh remote.

Controller hiện kiểm tra:

```js
req.aborted
res.destroyed
ERR_STREAM_PREMATURE_CLOSE
ECONNRESET
EPIPE
```

Khi client đã ngắt, backend không cố gửi thêm JSON lỗi 500.

### 4. Cloudflare Tunnel không ổn định

Cloudflare từng trả:

```text
530
1033
```

Tunnel log có:

```text
context canceled
stream canceled by remote
Failed to refresh DNS local resolver
failed to accept incoming stream requests
timeout: no recent network activity
```

Cấu hình có hai lớp proxy:

```text
manln.online -> frontend localhost:3000
backend.manln.online -> backend localhost:5000
```

Vì vậy export production có thể lúc thành công, lúc trả 500 hoặc bị cắt. Đây là vấn đề hạ tầng/proxy, không thể dùng kết quả production để kết luận riêng logic ZIP.

### 5. Database timeout

Đã gặp:

```text
Database operation timed out after 7000ms
Database operation timed out after 8000ms
```

`withTimeout()` hiện dùng `Promise.race()`. Cách này timeout Promise bên ngoài nhưng không hủy query MongoDB thật sự. Query có thể tiếp tục chạy và giữ connection trong pool.

Chưa thay đổi timeout mù quáng. Cần kiểm tra thêm bằng MongoDB:

- `explain("executionStats")`.
- `executionTimeMillis`.
- `docsExamined`.
- `keysExamined`.
- Pool metrics.

### 6. Test Playwright từng chạy sai URL

Có lúc truyền:

```text
-BaseUrl http://127.0.0.1:3000
```

nhưng request thực tế vẫn đi tới:

```text
https://manln.online
```

hoặc Builder/Cloudflare host.

Khi đó lỗi export bị trộn giữa:

- Backend local.
- Next.js rewrite.
- Cloudflare Tunnel.
- Production backend.

Script Playwright phải in và kiểm tra:

```text
[LOGIN PAGE]
[ACTUAL PAGE]
[LOGIN API]
```

URL thực tế phải khớp với `$BaseUrl`.

### 7. Login bị chặn bởi loading toàn app

`CurrencyProvider` trước đây trả `LoadingGate` cho toàn bộ ứng dụng trong khi chờ `/api/currencies`. Khi API chậm, Playwright không tìm thấy:

```text
#login-email
```

Mặc dù `/login` trả HTTP 200.

Đã thay đổi để app render với currency fallback trong khi request currency chạy nền.

### 8. Lệnh TypeScript chạy nhầm package

Lệnh chạy từ thư mục backend hoặc `C:\Windows\System32`:

```text
npx tsc --noEmit
```

có thể tải nhầm package `tsc@2.0.4`.

Lệnh đúng tại frontend:

```powershell
Set-Location "E:\Dev Camp\26-4-2 copy 69\online-store-frontend"
npx --no-install tsc --noEmit
```

Không chạy `npm run build` chỉ để kiểm tra TypeScript.

## Các thay đổi backend chính

File:

```text
online-store-backend/src/controllers/productImportController.js
```

### Hoàn tất ZIP trước khi gửi HTTP

Luồng hiện tại:

```text
Tạo ZIP trong thư mục tạm
-> append products.json/products.csv và image assets
-> await archive.finalize()
-> await finished(output)
-> set Content-Length
-> res.download(file ZIP hoàn chỉnh)
-> cleanup thư mục tạm
```

Các điểm quan trọng:

```js
await archive.finalize();
await streamFinished;
```

và:

```js
res.setHeader('Content-Length', size);
res.download(filePath, fileName, callback);
```

### Ảnh chính và ảnh chi tiết

`getExportImages()` xử lý:

```js
product.image
product.images
```

Trong đó:

- `product.image` là ảnh chính.
- `product.images` là danh sách gallery/ảnh chi tiết.
- URL trùng được loại bỏ.
- Không có field riêng `detailImages` trong Product model hiện tại.

Asset được thêm vào:

```text
assets/images/{productId}-{position}.{extension}
```

Metadata trong `products.json` chứa:

```json
{
  "url": "https://...",
  "position": 0,
  "type": "main",
  "assetPath": "assets/images/product-id-0.jpg"
}
```

### Thứ tự tải ảnh

Trong `prepareExportBatchForArchive()`:

```js
for (const product of batch) {
  for (const image of product.images) {
    const assetPath = await assetPromise;
  }
}
```

Do dùng `await` trong `for...of`, ảnh được xử lý tuần tự. Mỗi URL duy nhất chỉ tải một lần nhờ `assetsByUrl`.

Nếu ảnh tải lỗi, asset binary bị bỏ qua nhưng URL vẫn tồn tại trong metadata.

## Các thay đổi frontend chính

File:

```text
online-store-frontend/src/lib/context/CurrencyContext.tsx
```

App không còn bị chặn bởi `LoadingGate` trong lúc currency API chậm hoặc lỗi. Fallback currency là VND.

TypeScript frontend đã kiểm tra thành công với:

```powershell
npx --no-install tsc --noEmit
```

## Kết quả kiểm tra gần nhất

Các route HTML trên Builder đã trả 200:

```text
/
/login
/products
```

TypeScript frontend:

```text
PASS
```

Các API sau vẫn trả Cloudflare 530:

```text
/api/languages/active-config
/api/translations
/api/banners
/api/brands
/api/categories
```

Lần chạy cuối cùng của script kiểm thử chưa kết luận được ZIP vì JavaScript truyền qua `node -e` bị PowerShell làm mất dấu quote:

```text
SyntaxError: missing ) after argument list
Expected ',', got '<eof>'
```

Ngoài ra summary của script cũ báo sai `PASS` do `$script:results` không được khởi tạo đúng kiểu array. Không được tin summary đó.

## Điều kiện để xác nhận ZIP pass

Kết quả export phải có:

```text
status: 200
ok: true
contentType: application/zip
contentLengthMatches: true
zipSignature: true
zipError: ""
hasProductsJson: true
hasImagesFolder: true
missingAssetPaths: []
```

Đối với metadata ảnh:

```text
imageReferences >= includedImageReferences
missingAssetPaths = []
```

`skippedImageReferences > 0` có thể xảy ra nếu ảnh remote lỗi. Đây là hành vi bỏ qua có chủ ý, không đồng nghĩa ZIP bị hỏng.

## Quy trình test được khuyến nghị

### Test local

1. Khởi động backend tại port 5000.
2. Khởi động frontend dev tại port 3000 với:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:5000"
npm run dev
```

3. Dùng:

```text
http://127.0.0.1:3000
```

4. Kiểm tra login và export local trước.

### Test production/Builder

Chỉ chạy sau khi local pass. Khi test production, nếu API trả 530/1033 thì kết luận là Cloudflare/Tunnel availability, không gán lỗi đó cho ZIP backend.

## Kết luận

Lỗi cốt lõi ban đầu là archive được gửi ra trước khi hoàn tất, sau đó lỗi ảnh remote hoặc client/proxy disconnect làm body ZIP bị cắt dù status đã là 200.

Luồng backend hiện đã được chuyển sang tạo ZIP hoàn chỉnh trước khi dùng `res.download()`, có chờ `archive.finalize()`, chờ output finish, cleanup file tạm và xử lý ảnh lỗi không fatal.

Phần còn cần xác nhận bằng test local là ZIP thực tế có đủ `products.json`, thư mục `assets/images` và mọi `assetPath` trong metadata có tồn tại trong archive hay không. Nếu local pass nhưng Builder fail, vấn đề còn lại nằm ở Cloudflare Tunnel hoặc proxy production.

## Cập nhật mới nhất

### Async local `limit=500`

Đã kiểm thử bằng runner dynamic sau khi tải copy 10:

```text
Login:       HTTP 200
Enqueue:     HTTP 202
Lifecycle:   queued -> processing -> ready
Products:    500
Image assets: 3039
ZIP:         valid=true
Final:       PASS
```

Kết luận: lỗi database timeout của lần `limit=500` cũ không tái hiện trong lần chạy local mới nhất. Vẫn phải theo dõi thời gian và storage khi tăng limit; không suy ra rằng 1 triệu sản phẩm có thể dùng một ZIP duy nhất.

### `ROUTE_NOT_FOUND` sau download thành công

Nếu log có:

```text
GET /api/products/admin/export-jobs/:id/download
ROUTE_NOT_FOUND
```

nhưng client vẫn nhận ZIP hợp lệ, kiểm tra `src/services/exportStorage.js`. Không truyền trực tiếp `next` vào callback `res.download()`. Callback phải chỉ gọi `next(error)` khi có lỗi; gọi `next(null)` sau thành công sẽ tạo 404 giả ở middleware cuối.

Sau khi cập nhật source, restart backend bằng `npm start`; không cần `npm run build` cho backend test.

### Credential DPAPI

Credential test được lưu ngoài repository tại:

```text
$HOME\.online-store-export-credential.xml
```

PowerShell đọc file bằng:

```powershell
$credentialPath = Join-Path $HOME ".online-store-export-credential.xml"
$credential = Import-Clixml -LiteralPath $credentialPath
$env:EXPORT_TEST_EMAIL = $credential.UserName
$env:EXPORT_TEST_PASSWORD = $credential.GetNetworkCredential().Password
```

Sau test cần dọn:

```powershell
Remove-Item Env:EXPORT_TEST_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:EXPORT_TEST_PASSWORD -ErrorAction SilentlyContinue
```

Không hard-code username cụ thể như `C:\Users\manku` trong script hoặc tài liệu; `$HOME` tự resolve theo user Windows hiện tại.
