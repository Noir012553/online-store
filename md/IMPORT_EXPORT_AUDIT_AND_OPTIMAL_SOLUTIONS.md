# Audit Import/Export sản phẩm và giải pháp tối ưu

## 1. Mục đích và phạm vi

Tài liệu này tổng hợp các vấn đề đã điều tra trong các luồng:

- Import sản phẩm bằng ZIP chứa `products.json` hoặc `products.csv`.
- Export sản phẩm dạng JSON/CSV và ZIP chứa metadata cùng ảnh.
- Async export job (`queued -> processing -> ready`).
- Khả năng dùng dữ liệu trong ZIP để import lại.
- Các lỗi runtime, loading, proxy và hạ tầng có thể ảnh hưởng tới admin.
- Các rủi ro bảo mật khi file bị đổi đuôi, MIME bị giả mạo, payload độc hại hoặc URL ảnh nguy hiểm.

Mục tiêu của giải pháp là bảo đảm:

1. File không đúng định dạng bị từ chối ở boundary.
2. Payload lớn hoặc dữ liệu bất thường không làm cạn RAM, CPU, disk hoặc connection pool.
3. Import không tạo dữ liệu sai, ghi một phần hoặc tạo bản ghi trùng khi chạy đồng thời.
4. Export không bị SSRF, không làm hỏng ZIP do một ảnh lỗi và có thể xác minh kết quả đầu ra.
5. Lỗi phụ không khóa toàn bộ giao diện admin.

Tài liệu này là kết quả audit, kế hoạch hardening và cập nhật tiến độ triển khai ZIP import.

### Cập nhật triển khai ZIP import

- Trạng thái: `Đã triển khai code, đã kiểm tra syntax và có quy trình test local; còn cần test commit có kiểm soát và deploy backend/frontend`.
- Backend chỉ nhận `.zip` tại route import file; route JSON/CSV trực tiếp và endpoint template JSON/CSV đã được gỡ khỏi product API.
- Frontend chỉ cho chọn ZIP, giữ nguyên `dry-run`, `insert`, `update` và `upsert`.
- Giao diện nhập đã chuyển thành luồng 3 bước: chọn/kéo thả ZIP, kiểm tra trước, rồi xác nhận nhập chính thức; nút nhập chỉ hoạt động khi đã chọn file hợp lệ.
- Frontend có retry/timeout cho `active-config`; danh sách đơn hàng giữ dữ liệu cũ khi API tạm lỗi và hiển thị nút thử lại thay vì chuyển thành trạng thái rỗng.
- Kiểm tra production hiện tại: `backend.manln.online/readyz` trả `200 ready`, `manln.online/api/languages/active-config` trả `200`; request `/api/orders` không token trả `401` đúng lớp xác thực. Các lỗi 503 trước đó được đánh giá là sự cố tạm thời của backend/Mongo readiness.
- ZIP bị giới hạn kích thước nén 100 MB, tổng kích thước giải nén 256 MB, số entry 10.000, số image entry 5.000 và tỷ lệ nén tối đa 100:1.
- Archive phải chứa đúng một `products.json` hoặc `products.csv`; chỉ cho phép data entry ở root và asset entry dưới `assets/images/`.
- Mỗi sản phẩm trong ZIP phải có `name`, `brand`, `price`, `category`, `baseCurrencyCode`, `image`, `description` và `countInStock`; `specs` là tùy chọn và được normalize thành `{}` nếu thiếu. Dữ liệu sai kiểu hoặc sai định dạng vẫn bị từ chối.
- `assets/images` được kiểm tra trong dry-run và có thể upload lại lên Cloudinary khi commit import; cần tiếp tục xác minh mapping account Cloudinary được lưu đầy đủ trên mọi field ảnh.
- Đã bổ sung regression test cho ZIP export hợp lệ, path traversal, archive có hai data entry và product thiếu trường bắt buộc.
- Kiểm tra cú pháp backend đã PASS; một số regression runtime test chưa chạy được trong môi trường agent vì thiếu `mongoose`/Mocha. Node dynamic runner đã kiểm tra syntax và được dùng để test local qua PowerShell.
- Đã bổ sung test dynamic export → validate ZIP → import ZIP bằng Node Playwright global tại `online-store-backend/scripts/test-export-dynamic.js` và wrapper Node.js `online-store-backend/src/test/import-export.test.js`.
- Runner nhận động environment, frontend/backend URL, locale, format JSON/CSV, mode insert/update/upsert, file ZIP có sẵn và report; mặc định import ở chế độ dry-run, chỉ ghi thật khi truyền `--commit-import` hoặc `--commit-import`.
- PowerShell đặt `NODE_PATH=C:\Windows\system32\node_modules` để dùng Playwright global; Python Playwright không còn là dependency của luồng test này. Các file Python cũ chỉ được giữ lại để đối chiếu lịch sử và không còn được wrapper gọi.
- Khi không truyền `--zip-output`, runner tự lưu vào `online-store-backend/tmp/products-export-<timestamp>.zip`, ví dụ `products-export-1788759680606.zip`, nên không ghi đè file export trước đó.
- Không chạy `npm run build` theo quy ước dự án.

### Nhật ký vấn đề và quy trình kiểm thử cập nhật

#### Các vấn đề đã gặp và cách xử lý

1. **Import trước đây còn cho phép JSON/CSV trực tiếp**
   - Frontend từng có textarea và chọn JSON/CSV.
   - Backend từng có route import body JSON/CSV.
   - Đã chuyển toàn bộ product import sang ZIP-only: chỉ còn `POST /api/products/admin/import-file`.
   - ZIP phải chứa đúng một `products.json` hoặc `products.csv` ở root; asset chỉ được nằm dưới `assets/images/`.

2. **Dữ liệu sản phẩm thiếu trường bắt buộc**
   - Chế độ ZIP dùng strict validation trước khi ghi database.
   - Required fields: `name`, `brand`, `price`, `category`, `baseCurrencyCode`, `image`, `description` và `countInStock`.
   - `countInStock: 0` vẫn hợp lệ.
   - `specs` là tùy chọn; object rỗng hoặc thiếu được normalize thành `{}`. Array, chuỗi sai JSON hoặc giá trị có kiểu không hợp lệ vẫn bị từ chối.
   - Một row lỗi sẽ làm lượt import bị từ chối, không được bypass bằng frontend validation.

3. **Luồng giao diện import khó kiểm soát**
   - Đã thiết kế lại `/admin/importProducts` thành 3 bước: chọn/kéo thả ZIP, kiểm tra trước, xác nhận nhập chính thức.
   - File chưa được upload ngay khi chọn.
   - Dry-run được bật trước; nút commit chỉ xuất hiện sau khi có kết quả kiểm tra.

4. **Runner Python và Node bị trùng hướng triển khai**
   - Runner chính hiện dùng Node Playwright global: `scripts/test-export-dynamic.js`.
   - Wrapper `src/test/import-export.test.js` không gọi Python nữa.
   - Vị trí Playwright global được ghi nhận trên Windows: `C:\Windows\system32\node_modules`.
   - Các file Python cũ chỉ giữ để đối chiếu, không phải entry point hiện tại.

5. **Tên file ZIP cố định làm dễ ghi đè kết quả cũ**
   - Khi không truyền `--zip-output`, runner tự sinh tên:
     `online-store-backend/tmp/products-export-<timestamp>.zip`.
   - Ví dụ: `products-export-1788837742211.zip`.
   - Chỉ dùng tên cố định khi truyền rõ `--zip-output`.

6. **Khác biệt kiểu dữ liệu `specs` giữa export và import**
   - Một số sản phẩm export `specs` dưới dạng chuỗi JSON, nên runner phải parse trước khi kiểm tra.
   - Backend hiện cho phép thiếu `specs` hoặc `specs: {}` và normalize thành object rỗng; không được dùng tiêu chí “object không rỗng” làm required field.
   - Dữ liệu sai JSON, array hoặc sai kiểu vẫn phải bị từ chối trước khi ghi database.

7. **Lỗi availability của API và Cloudflare/Tunnel**
   - `active-config` và `orders` từng trả `503`; `translations`, `categories`, `currencies` từng có `530/1033`.
   - Frontend đã thêm retry/timeout cho locale và giữ dữ liệu đơn hàng cũ khi retry thất bại.
   - Đây là lỗi readiness/upstream/proxy, không được dùng để kết luận ZIP validator sai.
   - Production readiness đã từng xác nhận qua `/readyz` trả `200 ready`; `/api/orders` không token trả `401` là đúng authentication.

8. **Các giới hạn còn tồn tại**
   - `assets/images` trong ZIP hiện chỉ được kiểm tra và giữ metadata; chưa upload binary trở lại Cloudinary.
   - Chưa có transaction/staging atomic cho toàn bộ ZIP.
   - Chưa hoàn tất SSRF policy dùng chung cho mọi URL ảnh.
   - Chưa có manifest/checksum đầy đủ cho từng asset.
   - Không chạy nhiều async export lớn đồng thời; production test cần giới hạn sản phẩm và theo dõi timeout.

#### Điều kiện trước khi test local

- Backend chạy tại `http://127.0.0.1:5000`.
- Frontend chạy tại `http://127.0.0.1:3000` nếu test qua rewrite.
- Tài khoản test được đọc từ biến môi trường `EXPORT_TEST_EMAIL` và `EXPORT_TEST_PASSWORD`, hoặc file DPAPI:
  `C:\Users\<username>\.online-store-export-credential.xml`.
- Node có thể load Playwright global từ `C:\Windows\system32\node_modules`.
- Không ghi credential, token hoặc password vào Markdown/report.

#### Các lệnh kiểm thử Node Playwright global

Chạy từ thư mục `online-store-backend`.

**1. Kiểm tra syntax, không gọi API:**

```powershell
node --check .\scripts\test-export-dynamic.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json: OK')"
```

**2. Export-only và validate ZIP:**

```powershell
npm run test:export:dynamic -- `
  --environment local `
  --target frontend `
  --format json `
  --limit 10 `
  --report .\tmp\export-report.json
```

**3. Export → validate → import dry-run, khuyến nghị chạy đầu tiên:**

```powershell
npm run test:import:export:dynamic -- `
  --environment local `
  --target frontend `
  --import `
  --format json `
  --mode upsert `
  --limit 10 `
  --report .\tmp\import-export-report.json
```

Lệnh này tự tạo ZIP dynamic trong:

```text
online-store-backend/tmp/products-export-<timestamp>.zip
```

**4. Test backend trực tiếp, bỏ qua frontend rewrite:**

```powershell
npm run test:import:export:dynamic -- `
  --environment local `
  --target backend `
  --import `
  --format json `
  --mode upsert `
  --limit 10
```

**5. Import lại ZIP đã có:**

```powershell
npm run test:import:export:dynamic -- `
  --environment local `
  --target frontend `
  --import `
  --import-file .\tmp\products-export-1788837742211.zip `
  --format json `
  --mode upsert
```

**6. Dùng wrapper Node.js:**

```powershell
node .\src\test\import-export.test.js `
  --environment local `
  --target frontend `
  --format json `
  --mode upsert `
  --limit 10 `
  --report .\tmp\import-export-report.json
```

Wrapper chuyển tham số vào runner Node.js; credential được đọc từ biến môi trường hoặc file DPAPI trên Windows.

**7. Commit thật:**

Chỉ thêm `--commit-import` hoặc `--commit-import` sau khi dry-run đã PASS:

```powershell
npm run test:import:export:dynamic -- `
  --environment local `
  --target frontend `
  --import `
  --import-file .\tmp\products-export-1788837742211.zip `
  --format json `
  --mode upsert `
  --commit-import
```

Không thêm cờ commit trong lần test đầu tiên.

#### Cách đọc log kết quả

Kết quả thành công thường có:

```text
[login] HTTP 200
[enqueue] HTTP 202
[poll] status=queued
[poll] status=processing
[poll] status=ready
[zip output] ...\tmp\products-export-<timestamp>.zip
[validate] valid=true products=10 images=...
[import dry-run] HTTP 200
[FINAL RESULT] PASS
```

Các lỗi thường gặp:

| Log | Ý nghĩa | Xử lý |
|---|---|---|
| `LOGIN_FAILED_401` | Credential không hợp lệ hoặc hết hạn | Kiểm tra DPAPI/env credential |
| `ENQUEUE_FAILED_503` | Backend/Mongo chưa ready | Kiểm tra `/readyz`, không kết luận ZIP lỗi |
| `ZIP_DATA_ENTRY_INVALID` | ZIP thiếu hoặc có nhiều data entry | Chỉ giữ một `products.json` hoặc `products.csv` ở root |
| `ZIP_REQUIRED_FIELDS_MISSING` | Sản phẩm thiếu trường strict | Sửa dữ liệu trước khi import; database chưa bị ghi |
| `ZIP_INVALID_*` | ZIP hỏng, path traversal, asset thiếu hoặc magic bytes sai | Dùng report để xác định entry lỗi |
| `IMPORT_FAILED_4xx` | Backend từ chối dữ liệu hoặc request | Đọc `errors` trong report và không commit lại mù quáng |
| `530/1033` | Cloudflare/upstream không tới origin | Kiểm tra tunnel/backend readiness |

#### Kiểm thử giao diện thủ công

1. Mở `/admin/importProducts`.
2. Chọn file `online-store-backend/tmp/products-export-<timestamp>.zip`.
3. Xác nhận UI chỉ nhận `.zip` và hiển thị tên/kích thước file.
4. Chọn mode `upsert`.
5. Bấm **Kiểm tra file ZIP**.
6. Kiểm tra tổng sản phẩm, số thêm mới, số cập nhật, warning, errors và preview.
7. Chỉ khi preview hợp lệ mới bấm **Xác nhận nhập chính thức**.
8. Thử một file `.json`, ZIP thiếu `description`, ZIP có `specs` rỗng và ZIP có hai data entry để xác nhận UI/backend đều từ chối.

---

## 2. Kết luận nhanh

### Đã xác nhận

- Frontend import hiện chỉ nhận `.zip`.
- Backend upload import chỉ nhận ZIP chứa đúng một data file; không còn route JSON/CSV trực tiếp.
- Đổi tên ZIP thành `.json` hoặc gửi request trực tiếp không phải cách bypass hợp lệ: file phải có MIME ZIP, chữ ký ZIP hợp lệ và cấu trúc archive an toàn.
- `products.json` và `products.csv` trong ZIP được đưa qua adapter và pipeline import hiện có sau khi giải nén có giới hạn.
- ZIP import dùng chế độ validate đầy đủ, bắt buộc các trường cốt lõi và `specs` không rỗng trước khi ghi dữ liệu.
- Binary trong `assets/images` chưa được importer dùng để khôi phục ảnh. Import hiện dùng URL/public ID trong metadata.
- Log `EXPORT_JOB_READY` xác nhận backend đã tạo và lưu ZIP thành công; chưa tự nó xác nhận browser đã tải đủ ZIP và ZIP mở được.
- Dashboard và statistics đã được tách dữ liệu chính khỏi các request phụ để giảm thời gian hiển thị loading.
- Backend đã kiểm tra cú pháp bằng `node --check`; một số unit/regression runtime test còn phụ thuộc `mongoose`/Mocha trong môi trường local. Dynamic export/import test chạy qua Node Playwright global; không chạy `npm run build` theo yêu cầu.

### Rủi ro ưu tiên cao còn tồn tại

| Mức | Vấn đề | Ảnh hưởng |
|---|---|---|
| P1 | SSRF khi export ảnh từ URL trong dữ liệu sản phẩm | Backend có thể gọi localhost, private network hoặc metadata endpoint |
| P1 | Import payload lớn và cấu trúc lồng sâu | OOM, CPU exhaustion, request timeout |
| P1 | Read-then-write khi insert/update/upsert | Race condition, duplicate hoặc ghi đè sai khi import đồng thời |
| P1 | Import không atomic hoàn toàn | Có thể ghi một phần trước khi lỗi ở bước tiếp theo |
| P1 | Category chỉ kiểm tra format, chưa kiểm tra tồn tại đầy đủ | Product trỏ tới category không tồn tại hoặc sai dữ liệu |
| P2 | CSV parser tự viết và âm thầm bỏ qua row sai số cột | Mất dữ liệu nhưng kết quả vẫn có thể báo import thành công một phần |
| P2 | CSV formula injection | CSV export mở bằng Excel/Sheets có thể chạy công thức nguy hiểm |
| P2 | URL ảnh chưa có allowlist/SSRF policy dùng chung | URL độc hại lọt qua validator và bị dùng ở export/import |
| P2 | SVG chỉ kiểm tra chữ ký sơ bộ | SVG có thể chứa script hoặc external reference nguy hiểm |
| P2 | Parse số bằng `parseFloat`/`parseInt` không chặt | Chuỗi như `100abc` có thể bị chấp nhận một phần |
| P2 | Chưa giới hạn quota export theo user | Admin bị lộ tài khoản có thể spam job và làm đầy tài nguyên |

---

## 3. Kiến trúc và hành vi hiện tại

### 3.1. Import frontend

File chính:

```text
online-store-frontend/src/pages/admin/importProducts.tsx
```

Frontend:

- Chỉ chấp nhận file có đuôi `.zip`.
- Kiểm tra kích thước tối đa 100 MB trước khi upload.
- Gửi multipart tới `/api/products/admin/import-file?lang=...`.
- Hỗ trợ các mode `insert`, `update`, `upsert`.
- Có `dryRun` để kiểm tra trước khi ghi.
- Không còn textarea hoặc lựa chọn upload JSON/CSV trực tiếp.
- ZIP phải chứa đúng một `products.json` hoặc `products.csv`.

Điểm quan trọng:

```tsx
<input
  type="file"
  accept=".zip"
  onChange={handleDirectFileUpload}
/>
```

```ts
if (!file.name.toLowerCase().endsWith('.zip')) {
  toast.error('Chỉ được nhập file ZIP chứa đầy đủ dữ liệu sản phẩm.');
  return;
}
if (file.size > 100 * 1024 * 1024) {
  toast.error('ZIP tối đa 100 MB');
  return;
}
```

Kiểm tra frontend chỉ là UX, không phải security boundary. Client có thể bỏ qua JavaScript hoặc tự gửi HTTP request.

### 3.2. Import backend

Các file chính:

```text
online-store-backend/src/config/multerConfig.js
online-store-backend/src/utils/fileUtils.js
online-store-backend/src/middleware/uploadValidationMiddleware.js
online-store-backend/src/utils/importAdapters/JSONAdapter.js
online-store-backend/src/utils/importAdapters/CSVAdapter.js
online-store-backend/src/utils/productImportValidator.js
online-store-backend/src/controllers/productImportController.js
online-store-backend/src/routes/productRoutes.js
```

Route hiện tại:

```js
router.post(
  '/admin/import-file',
  protect,
  admin,
  uploadImport.single('file'),
  validateImportUpload,
  importProductsFromFile,
);
```

Backend upload filter chỉ cho:

```js
const allowedTypes = {
  '.zip': ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
};
```

Giới hạn ZIP là 100 MB ở cả frontend và backend. Middleware kiểm tra đuôi `.zip`, MIME, chữ ký ZIP và cấu trúc archive trước khi đưa dữ liệu vào adapter.

`readImportZip()` kiểm tra:

- Archive có chữ ký ZIP hợp lệ và giải nén được.
- Đúng một `products.json` hoặc `products.csv` ở root.
- Không có path traversal, entry trùng hoặc entry ngoài whitelist.
- Giới hạn entry, kích thước giải nén, image entry và compression ratio.

Sau khi parse, `validateProductArray(..., { requireComplete: true })` từ chối toàn bộ lượt nhập nếu bất kỳ sản phẩm nào thiếu trường bắt buộc, `specs` rỗng/sai cấu trúc hoặc dữ liệu số/URL không hợp lệ.

### 3.3. Export đồng bộ và async

Các file chính:

```text
online-store-backend/src/controllers/productImportController.js
online-store-backend/src/services/exportJobService.js
online-store-backend/src/services/exportStorage.js
online-store-backend/src/routes/productRoutes.js
online-store-frontend/src/components/admin/ImportExportWidget.tsx
```

Luồng async:

```text
POST/GET export-bundle?async=true
-> nhận jobId
-> polling export-jobs/:id
-> queued
-> processing
-> ready
-> download export-jobs/:id/download
```

Luồng tạo ZIP hiện đã cố gắng hoàn tất file trước khi gửi:

```js
await archive.finalize();
await streamFinished;
const { size } = await fs.promises.stat(filePath);
res.setHeader('Content-Length', size);
res.download(filePath, fileName, callback);
```

Frontend tải ZIP bằng Blob:

```ts
const blob = await productAPI.exportProductBundleAsync(...);
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `products-export-${Date.now()}.zip`;
link.click();
```

### 3.4. Nội dung ZIP

ZIP thường chứa:

```text
products.json hoặc products.csv
assets/images/...
```

Metadata có thể chứa:

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
      "imageAssetPaths": ["assets/images/product-id-0.jpg"]
    }
  ]
}
```

`JSONAdapter` chấp nhận cả array trực tiếp và object có `products`:

```js
const products = Array.isArray(parsed)
  ? parsed
  : parsed.products;
```

Vì vậy, sau khi giải nén, `products.json` có thể đưa vào luồng import hiện tại nếu kích thước và dữ liệu hợp lệ.

Tuy nhiên đây chưa phải backup database đầy đủ:

- ZIP không được upload trực tiếp vào import hiện tại.
- `assets/images` chưa được importer đọc và upload lại.
- Import chủ yếu dùng URL/public ID trong `products.json`.
- Nếu URL ảnh cũ không còn truy cập được thì metadata vẫn import được nhưng ảnh có thể hỏng.
- File `products.json` lớn hơn 10 MB sẽ bị frontend từ chối nếu upload qua UI hiện tại.

---

## 4. Các vấn đề đã giải quyết

### 4.1. ZIP bị cắt hoặc HTTP 200 nhưng archive hỏng

Nguyên nhân trước đây là stream archive có thể được pipe vào response trước khi toàn bộ product, translation và image hoàn tất. Khi lỗi xảy ra sau khi header đã gửi, client thấy HTTP 200 nhưng nhận ZIP không hoàn chỉnh.

Hướng hiện tại:

```text
Tạo file ZIP tạm
-> append metadata và image assets
-> await archive.finalize()
-> await finished(output)
-> stat file
-> gửi Content-Length
-> res.download()
-> cleanup
```

Cần tiếp tục xác minh bằng cả backend và client, không chỉ dựa vào status job:

```text
HTTP status = 200
Content-Type = application/zip
Content-Length khớp số byte tải được
ZIP signature hợp lệ
Archive mở được
Có products.json hoặc products.csv
Các imageAssetPaths đều tồn tại hoặc được báo skipped có chủ ý
```

### 4.2. Một ảnh remote lỗi làm hỏng toàn bộ export

Export hiện có:

- Timeout mỗi ảnh tối đa 30 giây.
- Tối đa 5 MB mỗi ảnh.
- Allowlist content type.
- Kiểm tra magic bytes cơ bản.
- Retry tối đa 3 lần.
- Concurrency tối đa 4 worker.
- Cache URL trùng trong cùng archive.

Nếu một ảnh lỗi, binary có thể bị bỏ qua và URL vẫn được giữ trong metadata. Đây là hành vi chấp nhận được về availability, nhưng phải ghi thống kê rõ ràng để người dùng biết ZIP không chứa đủ binary ảnh.

### 4.3. Dashboard/statistics loading lâu

Các nguyên nhân đã xác định:

- Dashboard từng chờ namespace translation trước khi gọi dữ liệu.
- Dashboard từng chờ `top-customers` và `paid-orders` trước khi tắt spinner chính.
- Dashboard từng gọi chart trùng khi mount.
- Statistics từng chờ 12 API trong cùng một flow trước khi tắt spinner.
- Admin layout tải nhiều namespace và có full-screen overlay khi `admin-common` đang loading.
- Translation request lỗi 500/socket hang up có thể bị timeout 30 giây và retry.

Cách đã áp dụng:

- Dữ liệu summary chính được tải và render trước.
- Request phụ dùng `Promise.allSettled()` và tải nền.
- Spinner chính tắt sau khi dữ liệu cốt lõi có kết quả.
- Namespace được khởi động song song thay vì chặn API dữ liệu.
- Thêm xử lý lỗi để request phụ không tạo `unhandledRejection`.
- Loại bỏ lời gọi chart trùng.

Đây là tối ưu perceived loading, không thay thế việc sửa backend translation/proxy.

### 4.4. Currency hoặc translation loading khóa toàn app

Trước đây loading gate của provider có thể ngăn trang login hoặc admin render khi API nền chậm. Đã chuyển một số dữ liệu sang fallback và tải nền để UI không bị khóa toàn bộ.

Vẫn cần theo dõi overlay trong:

```text
online-store-frontend/src/components/admin/_AdminLayout.tsx
```

vì layout còn tải nhiều namespace cùng lúc và hiển thị overlay khi `admin-common` đang loading.

---

## 5. Các vấn đề cần sửa và giải pháp tối ưu

## P1-A. SSRF khi export ảnh từ URL sản phẩm

### Hiện trạng

Trong `productImportController.js`, URL ảnh được parse và chỉ kiểm tra protocol:

```js
parsedUrl = new URL(sourceUrl);

if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  throw createExportError(502, 'EXPORT_IMAGE_URL_INVALID');
}

response = await fetch(parsedUrl, {
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
});
```

Chỉ kiểm tra `http`/`https` chưa chặn được:

```text
http://127.0.0.1:...
http://localhost/...
http://169.254.169.254/...
http://10.x.x.x/...
http://172.16.x.x - 172.31.x.x/...
http://192.168.x.x/...
IPv6 loopback/private/link-local
hostname resolve ra private IP
redirect từ public host vào private IP
DNS rebinding
```

### Ảnh hưởng

Backend có quyền mạng nội bộ cao hơn browser. Attacker có thể nhập một URL ảnh độc hại rồi yêu cầu admin export để backend gọi dịch vụ nội bộ, metadata service hoặc port quản trị.

### Giải pháp tối ưu

Tạo một SSRF-safe fetcher dùng chung cho mọi remote URL:

1. Chỉ cho `https` trong production, chỉ cho `http` khi có allowlist cấu hình rõ ràng.
2. Parse hostname chuẩn hóa bằng `url.hostname`.
3. Resolve DNS trước khi kết nối.
4. Từ chối loopback, private, link-local, multicast, unspecified và metadata ranges của IPv4/IPv6.
5. Không tin redirect mặc định. Dùng `redirect: 'manual'`, validate từng `Location`, tối đa 2-3 redirect.
6. Pin kết quả DNS hoặc dùng HTTP agent có DNS lookup được kiểm soát để giảm DNS rebinding.
7. Chỉ allow hostname cần thiết nếu business dùng Cloudinary/CDN cố định.
8. Chặn credentials trong URL (`user:pass@host`).
9. Giới hạn tổng thời gian, số byte, số redirect và số request.
10. Không log URL có query token đầy đủ; chỉ log hostname và hash path.

Policy nên được áp dụng ở cả:

- `sourceUrl` import.
- `image` và `images` trong product import.
- Remote image export.
- Bất kỳ endpoint nào fetch URL do admin/user cung cấp.

Không nên chỉ dùng regex hostname; cần kiểm tra IP sau DNS resolution.

---

## P1-B. DoS/OOM từ JSON hoặc CSV lớn

### Hiện trạng

- Frontend giới hạn 10 MB.
- Multer backend giới hạn 100 MB.
- `memoryStorage()` giữ toàn bộ file trong RAM.
- JSON được parse thành object hoàn chỉnh.
- Chưa có giới hạn đồng nhất cho record, field, độ sâu object, độ dài string hoặc tổng số translation.

### Ảnh hưởng

Một admin account bị lộ hoặc request trực tiếp có thể gửi nhiều file lớn, nhiều object lồng sâu hoặc số lượng record rất lớn để làm:

- Tăng heap Node.js.
- Tăng thời gian parse/validate.
- Tăng MongoDB bulk operation.
- Giữ connection pool quá lâu.
- Làm worker export/import bị starvation.

### Giải pháp tối ưu

1. Dùng một cấu hình giới hạn chung ở backend làm source of truth.
2. Giảm `memoryStorage` nếu có thể; stream file vào temporary file với quota disk.
3. Giới hạn đồng thời bằng rate limit và semaphore theo user.
4. Đặt giới hạn:
   - bytes;
   - số record;
   - số field mỗi record;
   - độ dài string;
   - object depth;
   - số translation/language;
   - số image URL;
   - tổng kích thước text.
5. Parse JSON bằng parser có giới hạn hoặc xử lý NDJSON/chunk nếu dataset lớn.
6. CSV đọc theo stream, không giữ toàn bộ file và toàn bộ product array nếu không cần.
7. Reject sớm trước khi chạy database.
8. Có timeout riêng cho parse, validate và database.
9. Ghi metrics: bytes, records, parse time, validation time, DB time, rejected reason.

Giới hạn frontend có thể giữ 10 MB để UX nhanh, nhưng backend phải tự bảo vệ dù request không đi qua frontend.

---

## P1-C. Race condition và duplicate trong insert/update/upsert

### Hiện trạng

`handleInsertMode()` và `handleUpsertMode()` đọc các product hiện có trước, sau đó mới tạo `bulkOps`:

```js
const existingProducts = await Product.find({
  $or: filters,
  isDeleted: false,
}).lean();

// Sau đó mới tạo bulkOps và bulkWrite
```

Hai import chạy đồng thời có thể cùng thấy sản phẩm chưa tồn tại rồi cùng insert/upsert.

### Giải pháp tối ưu

1. Xác định khóa nghiệp vụ rõ ràng:
   - `sku` nếu có;
   - hoặc khóa chuẩn hóa `name + brand` nếu business thực sự cho phép.
2. Tạo unique index phù hợp, có cân nhắc `isDeleted` và dữ liệu cũ.
3. Chuẩn hóa key trước khi query và ghi.
4. Dùng `bulkWrite` vẫn cần unique index; bulkWrite không tự giải quyết race giữa nhiều request.
5. Bắt duplicate key (`11000`) và trả lỗi theo từng record hoặc yêu cầu retry an toàn.
6. Dùng idempotency key cho mỗi lần import.
7. Nếu import phải all-or-nothing, dùng MongoDB transaction với giới hạn batch; nếu batch rất lớn thì dùng staging collection và commit theo phiên.
8. Lưu `importJobId`/audit record để retry không tạo dữ liệu mới ngoài ý muốn.

Không nên chỉ dựa vào bước `find()` trước `bulkWrite()` để đảm bảo uniqueness.

---

## P1-D. Import không atomic và lỗi một phần

### Hiện trạng

Import có nhiều giai đoạn:

```text
parse -> validate -> resolve category -> write products -> translations -> cleanup ảnh/cache
```

Nếu lỗi xảy ra sau khi product đã ghi, database có thể ở trạng thái một phần.

### Giải pháp tối ưu

Chọn một trong hai mô hình rõ ràng:

#### Mô hình A: Transaction

- Parse và validate toàn bộ trước.
- Dùng MongoDB session transaction cho các collection cần nhất quán.
- Chia batch nếu transaction quá lớn.
- Chỉ enqueue side effects sau khi commit.

#### Mô hình B: Staging import job

Phù hợp với file lớn:

```text
upload -> validate -> staging records -> preview/dry-run
-> user confirm -> commit batches -> completed/failed
```

Mỗi record cần trạng thái và error code riêng. Nếu commit một phần là chủ ý, API phải trả rõ:

```json
{
  "inserted": 10,
  "updated": 5,
  "failed": 2,
  "skipped": 1,
  "partial": true,
  "errors": []
}
```

Không nên báo thành công chung nếu có row bị skip hoặc fail mà người dùng không biết.

---

## P1-E. Category ID/name — đã có kiểm tra tồn tại, cần tiếp tục harden

### Trạng thái source hiện tại

`productImportController.js` đã resolve category trước khi ghi và từ chối category không tồn tại trong import validation. Vì vậy tuyên bố cũ rằng category chỉ được kiểm tra format không còn đúng.

Các việc còn cần kiểm tra:

- Chuẩn hóa khác hoa thường và mapping tên/ID trong mọi mode import.
- Scope `isDeleted` và tenant/store nếu deployment có nhiều scope.
- Regression test cho category bị xóa, ID hợp lệ nhưng không thuộc scope và import concurrent.

---

## Đã xử lý: validation upload dùng `path` đúng cách

File:

```text
online-store-backend/src/middleware/uploadValidationMiddleware.js
```

Middleware hiện dùng `path` để kiểm tra extension và đã có import:

```js
const path = require('path');
const extension = path.extname(req.file.originalname || '').toLowerCase();
```

### Trạng thái

Đã kiểm tra cú pháp middleware bằng `node --check`. Phần upload import hiện cũng dùng middleware riêng để từ chối mọi file không phải ZIP trước khi đọc archive.

---

## P2-A. CSV parser tự viết và âm thầm bỏ qua dòng lỗi

File:

```text
online-store-backend/src/utils/importAdapters/CSVAdapter.js
```

Hiện tại:

```js
if (values.length !== headers.length) {
  console.warn(`CSV row ${i + 1}: column count mismatch with header, skipping`);
  continue;
}
```

### Rủi ro

- Mất record mà import vẫn tiếp tục.
- Không hỗ trợ đầy đủ quoted field chứa newline theo RFC 4180.
- Dòng malformed có thể làm lệch dữ liệu.
- Header trùng hoặc header nguy hiểm chưa được kiểm soát rõ.

### Giải pháp tối ưu

- Dùng thư viện CSV parser đã hỗ trợ RFC 4180 và streaming.
- Không skip âm thầm; trả lỗi hoặc warning có row number, raw reason và tổng số bị bỏ qua.
- Reject header trùng, header rỗng, header ngoài allowlist nếu không có prefix hợp lệ.
- Có policy rõ: strict mode cho import production, permissive mode chỉ cho preview.
- Kiểm tra newline `\\r\\n` và encoding UTF-8/BOM.

---

## P2-B. CSV formula injection

### Rủi ro

Các giá trị bắt đầu bằng ký tự sau có thể bị Excel/Sheets hiểu là công thức:

```text
=  +  -  @
```

Ví dụ tên sản phẩm hoặc brand nhập từ nguồn ngoài:

```text
=HYPERLINK("https://attacker.example", "click")
```

Khi export CSV và người dùng mở bằng spreadsheet, công thức có thể được thực thi theo chính sách của ứng dụng.

### Giải pháp tối ưu

- Khi export CSV, prefix các cell nguy hiểm bằng dấu nháy đơn hoặc tab theo policy đã thống nhất.
- Escape CSV đúng chuẩn.
- Không áp dụng escape vào JSON vì JSON không có hành vi công thức như spreadsheet.
- Ghi rõ trong tài liệu export rằng CSV là dữ liệu untrusted.
- Test các giá trị bắt đầu bằng `=`, `+`, `-`, `@`, tab và CR/LF.

Nếu product name cần giữ nguyên tuyệt đối, có thể dùng một cột hiển thị escaped và một format JSON làm format bảo toàn dữ liệu.

---

## P2-C. Validation số chưa chặt

File:

```text
online-store-backend/src/utils/productImportValidator.js
```

Code hiện tại:

```js
const price = parseFloat(product.price);
const stock = parseInt(product.countInStock);
```

`parseFloat('100abc')` có thể trả `100`, và `parseInt('10xyz')` có thể trả `10`.

### Giải pháp tối ưu

- Chuẩn hóa input string trước.
- Dùng regex hoặc schema validation để yêu cầu toàn bộ chuỗi là số hợp lệ.
- Dùng `Number.isFinite()` sau parse.
- Reject `NaN`, Infinity, số âm, precision ngoài giới hạn và giá trị quá lớn.
- Xác định rõ integer cho stock và decimal/precision cho price.
- Không dùng truthiness để kiểm tra số vì `0` là giá trị hợp lệ trong một số field.

Ví dụ policy:

```text
price: decimal > 0, tối đa 2 chữ số thập phân hoặc precision theo currency
countInStock: integer >= 0
rating: number trong [0, 5]
numReviews: integer >= 0
```

---

## P2-D. Prototype pollution và object type confusion

Các object từ JSON/CSV không nên được đưa trực tiếp vào MongoDB hoặc merge không kiểm soát.

Cần reject key ở mọi boundary:

```text
__proto__
constructor
prototype
```

Áp dụng cho:

- Product object.
- `specs`.
- `deal`.
- `translations`.
- Nested image object.
- Category mapping.

Các object cần được dựng lại vào plain object allowlist, không dùng spread toàn bộ payload vào update document.

Validator hiện đã có nhiều bước làm sạch field, nhưng cần rà soát đồng nhất ở mọi nested object, đặc biệt `translations.specs` và các object ảnh.

---

## P2-E. URL ảnh trong import chưa có policy chặt

Validator đang lưu `image` và `images` sau khi trim:

```js
if (product.image) {
  cleaned.image = String(product.image).trim();
}
```

Trong khi `sourceUrl` có kiểm tra protocol cơ bản, image fields chưa có cùng lớp kiểm tra.

### Giải pháp tối ưu

- Dùng URL policy dùng chung với export SSRF protection.
- Chỉ cho `https` hoặc hostname CDN allowlist.
- Giới hạn độ dài URL.
- Reject URL có credentials, control characters hoặc scheme bất thường.
- Không fetch URL ngay trong synchronous import nếu không cần.
- Nếu cần tải ảnh, đưa vào background job có quota và SSRF-safe fetcher.
- Lưu URL đã normalize và audit source.

---

## P2-F. SVG và content sniffing

Export hiện cho phép `image/svg+xml` và kiểm tra sơ bộ buffer có `<svg`. Điều này chỉ chứng minh nội dung có vẻ là SVG, không chứng minh SVG an toàn.

### Rủi ro

- `<script>` hoặc event handler.
- External entity/reference.
- `foreignObject` chứa HTML.
- External image hoặc URL tracking.
- Nội dung làm nặng trình render.

### Giải pháp tối ưu

- Nếu không cần SVG, loại khỏi allowlist.
- Nếu cần, sanitize bằng thư viện SVG sanitizer đã được kiểm chứng.
- Xóa script, event handler, `foreignObject`, external references và dangerous attributes.
- Re-encode ảnh raster nếu mục đích chỉ là hiển thị.
- Đặt `Content-Disposition: attachment` khi phục vụ file không cần render inline.
- Không tin extension hoặc MIME từ remote server; kiểm tra content và policy.

---

## P2-G. Quota và lifecycle cho export job

File:

```text
online-store-backend/src/services/exportJobService.js
```

Job có lease, retry và retention cleanup. Tuy nhiên cần bổ sung quota nghiệp vụ:

- Số job queued/processing tối đa mỗi user.
- Tổng byte ZIP tối đa mỗi user trong một khoảng thời gian.
- Số sản phẩm tối đa mỗi job.
- Tổng dung lượng ảnh remote mỗi job.
- Rate limit cho enqueue, retry và download.
- Hủy job phải dừng fetch ảnh và cleanup file tạm.
- Không để local export directory đầy disk.

Nên có metrics và cảnh báo:

```text
queued_count
processing_count
job_duration_ms
zip_bytes
image_download_bytes
skipped_image_count
failure_by_stage
storage_cleanup_errors
```

---

## 6. Những rủi ro chỉ phát sinh nếu hỗ trợ import ZIP trực tiếp

Hiện tại chưa có ZIP extraction/import route. Nếu thêm trong tương lai, không được chỉ đổi `accept` thành `.zip` và giải nén trực tiếp.

### 6.1. ZIP Slip/path traversal

Entry như sau phải bị từ chối:

```text
../../app.js
/tmp/file
C:\Windows\...
```

Mọi entry phải được resolve dưới một thư mục tạm riêng:

```text
resolvedPath.startsWith(extractionRoot + path.sep)
```

Không dùng tên entry làm đường dẫn tuyệt đối.

### 6.2. Symlink/hardlink

Không extract symlink, hardlink hoặc entry đặc biệt. Kiểm tra file type trước khi ghi và chạy trong thư mục isolation.

### 6.3. ZIP bomb/decompression bomb

Giới hạn đồng thời:

- Kích thước ZIP nén.
- Tổng kích thước sau giải nén.
- Tỷ lệ nén tối đa.
- Số entry.
- Kích thước mỗi entry.
- Độ sâu archive lồng nhau.
- Thời gian giải nén.

Không dùng `unzip` hệ thống với input không tin cậy mà không có quota.

### 6.4. Duplicate manifest và path collision

Chỉ cho phép một manifest rõ ràng:

```text
products.json hoặc products.csv
```

Từ chối duplicate entry, case collision và file ngoài allowlist nếu không cần.

### 6.5. Malicious asset

Ảnh trong ZIP phải qua:

- Allowlist extension/content type.
- Magic bytes.
- Giới hạn bytes.
- Decode/re-encode nếu cần.
- SVG sanitization hoặc loại SVG.

Không phục vụ file ZIP/asset với đường dẫn do user điều khiển.

### 6.6. Import transaction và manifest integrity

Manifest nên chứa:

```text
schemaVersion
exportId
productCount
sha256 của manifest
sha256 của từng asset
```

Trước khi ghi database:

1. Verify archive.
2. Verify manifest schema.
3. Verify asset path chỉ nằm trong allowlist.
4. Verify checksum nếu có.
5. Chạy dry-run.
6. Chỉ commit sau khi user xác nhận.

ZIP export/import chỉ nên được xem là data transfer package, không phải backup database nếu không có snapshot đầy đủ các collection và metadata liên quan.

---

## 7. Lỗi proxy, translation và loading admin

### 7.1. `request_timeout` và translations 500

Frontend `src/lib/api.ts` có timeout mặc định khoảng 30 giây và chuyển lỗi abort thành:

```ts
throw new Error('request_timeout');
```

GET có thể retry một lần với các status 500/502/503/504 nếu không bị tắt retry.

Khi `/api/translations?lang=vi&ns=notifications` trả 500 hoặc backend proxy gặp `socket hang up`/`ECONNRESET`, UI có thể chờ timeout rồi retry, tạo cảm giác loading kéo dài.

### 7.2. Giải pháp tối ưu

- Translation namespace không nên là dependency cứng để render dữ liệu dashboard.
- Có fallback text khi namespace phụ lỗi.
- Cache static translation theo locale/namespace.
- Backend translation endpoint cần timeout ngắn, health/readiness rõ và log request ID.
- Phân biệt lỗi backend JSON 503 với lỗi tunnel/proxy 502/530.
- Không retry vô hạn; retry có backoff và chỉ áp dụng cho request an toàn.
- Theo dõi latency p50/p95/p99 của translations và analytics.

### 7.3. Admin layout overlay

`_AdminLayout.tsx` tải nhiều namespace đồng thời:

```ts
Promise.all([
  loadNamespace('admin'),
  loadNamespace('admin-common'),
  loadNamespace('admin-banners'),
  loadNamespace('admin-coupons'),
  loadNamespace('admin-customers'),
  loadNamespace('admin-export'),
  loadNamespace('admin-import'),
  loadNamespace('admin-notifications'),
  loadNamespace('admin-orders'),
  loadNamespace('admin-translation'),
  loadNamespace('admin-users'),
  loadNamespace('export'),
  loadNamespace('import'),
]);
```

Nên:

- Chỉ preload namespace dùng cho navigation và shell.
- Load namespace theo từng page khi cần.
- Không dùng full-screen overlay cho namespace không critical.
- Giữ shell và nội dung đã có dữ liệu hiển thị được khi namespace phụ đang retry.

---

## 8. Xác minh export ZIP đúng cách

Log sau:

```text
[EXPORT_JOB_STARTED]
[EXPORT_JOB_READY]
status: ready
storageMode: local
```

có nghĩa backend đã hoàn thành job và lưu file theo storage mode. Để kết luận end-to-end thành công cần thêm:

```text
DOWNLOAD STATUS: 200
CONTENT-TYPE: application/zip
BYTES DOWNLOADED = CONTENT-LENGTH
ZIP SIGNATURE: true
ZIP OPEN: true
HAS PRODUCTS JSON/CSV: true
MISSING ASSET PATHS: []
```

Nếu có `skippedImageReferences > 0`, cần phân biệt:

- ZIP vẫn hợp lệ nhưng một số remote image không tải được.
- ZIP hỏng hoặc thiếu manifest là lỗi nghiêm trọng hơn.

Không nên kết luận export thành công chỉ từ HTTP 200 hoặc chỉ từ `EXPORT_JOB_READY`.

---

## 9. Quy trình import ZIP hiện tại

Quy trình trực tiếp đã triển khai:

```text
1. Chọn ZIP tại /admin/importProducts.
2. Frontend gửi multipart ZIP tới /api/products/admin/import-file.
3. Backend kiểm tra chữ ký ZIP, kích thước nén/giải nén, entry path, duplicate name và entry type.
4. Backend yêu cầu đúng một products.json hoặc products.csv ở root.
5. Backend đọc data entry trong giới hạn và đưa vào JSONAdapter/CSVAdapter.
6. Chạy dry-run trước.
7. Kiểm tra category, SKU, price, stock, translations và image URL.
8. Chọn upsert/insert/update phù hợp.
9. Xác minh kết quả và audit log.
```

Các entry `assets/images/...` được cho phép để tương thích với export bundle và được đếm giới hạn, nhưng chưa được upload lại lên Cloudinary. Vì vậy ZIP import hiện khôi phục metadata sản phẩm và URL/public ID, chưa khôi phục binary media.

Nếu ZIP không hợp lệ hoặc không muốn dùng tính năng ZIP, vẫn có thể giải nén offline rồi upload riêng `products.json` hoặc `products.csv`.

Đổi `.zip` thành `.json` không biến binary ZIP thành JSON. Backend vẫn kiểm tra chữ ký và cấu trúc archive, không tin extension hoặc MIME riêng lẻ.

---

## 10. Lộ trình triển khai đề xuất

### Phase 1: Sửa lỗi availability và chặn rủi ro lớn

1. Thêm `const path = require('path');` vào `uploadValidationMiddleware.js`.
2. Tạo và dùng SSRF-safe URL fetcher cho export ảnh.
3. Đồng nhất upload limit backend/frontend và thêm giới hạn record/depth/string.
4. Kiểm tra category tồn tại trước khi ghi.
5. Thêm unique index/key policy và xử lý duplicate key.
6. Xác định import atomic hoặc staging job.
7. Bổ sung quota cho import/export job.

### Phase 2: Hardening dữ liệu

1. Thay CSV parser bằng parser streaming chuẩn.
2. Không skip malformed row âm thầm.
3. Chặn CSV formula injection khi export.
4. Siết validation số, boolean, date và enum.
5. Reject prototype keys ở nested object.
6. Dùng image URL policy chung.
7. Sanitize hoặc loại SVG.

### Phase 3: Observability và regression tests

Tạo test cho:

- ZIP đổi tên thành JSON.
- MIME đúng nhưng nội dung sai.
- JSON có byte null.
- JSON array và JSON wrapper có `products`.
- CSV quoted comma, quoted newline, BOM, CRLF.
- CSV sai số cột.
- Formula payload `=`, `+`, `-`, `@`.
- `price: "100abc"`, `countInStock: "10xyz"`.
- `__proto__`, `constructor`, `prototype` ở nested object.
- URL localhost/private/link-local/metadata.
- Redirect public -> private.
- Ảnh vượt 5 MB hoặc sai magic bytes.
- Hai import upsert đồng thời.
- Import thất bại giữa chừng.
- Export job retry/cancel/cleanup.
- Content-Length và ZIP integrity.

Metrics cần có request ID/job ID và không ghi secret/token trong log.

### Phase 4: Triển khai ZIP import

Đã triển khai:

- Extraction trong memory với giới hạn compressed/uncompressed size.
- ZIP Slip/path traversal, duplicate entry và entry type protection.
- Giới hạn compression ratio, số entry và số asset image entry.
- Chỉ chấp nhận một `products.json` hoặc `products.csv` ở root.
- Tái sử dụng JSONAdapter/CSVAdapter, dry-run và mode import hiện có.
- Frontend upload trực tiếp ZIP.

Chưa hoàn tất:

- Manifest/version và checksum cho từng asset.
- Xác minh mapping `cloudinaryAccountId` bền vững cho binary `assets/images` trên Product/Banner và cleanup về sau.
- Transaction/staging riêng cho toàn bộ ZIP.
- Kiểm thử tích hợp qua production proxy và deploy production.

---

## 11. Checklist release

### Import

- [ ] Backend reject MIME/extension mismatch.
- [ ] Backend không tin frontend validation.
- [ ] Có giới hạn bytes, records, fields, depth và string length.
- [ ] JSON/CSV parser có timeout và không OOM.
- [ ] Category được resolve và verify.
- [ ] Unique index bảo vệ khóa nghiệp vụ.
- [ ] Import có dry-run và audit result.
- [ ] Có policy atomic/staging.
- [ ] Không có prototype key nguy hiểm.
- [ ] URL ảnh qua SSRF policy.
- [ ] CSV malformed không bị skip âm thầm.

### Export

- [ ] ZIP finalize và stream complete trước download.
- [ ] Có Content-Length hoặc integrity check.
- [ ] Có manifest rõ ràng.
- [ ] Remote URL qua SSRF-safe fetcher.
- [ ] Redirect được validate từng bước.
- [ ] Có limit bytes, timeout, retry và concurrency.
- [ ] SVG được sanitize hoặc loại bỏ.
- [ ] Có quota job/user và disk cleanup.
- [ ] `ready` được kiểm tra thêm bằng download và ZIP validation.

### Admin UI

- [ ] Request phụ không khóa spinner chính.
- [ ] Translation lỗi không gây unhandled rejection.
- [ ] Namespace không critical không hiển thị full-screen overlay.
- [ ] Timeout/retry có giới hạn.
- [ ] Dashboard/statistics render dữ liệu cốt lõi trước.

### Quy tắc kiểm thử

- [ ] Chạy TypeScript check đúng package.
- [ ] Chạy test import/export/security phù hợp.
- [ ] Kiểm tra local backend và proxy production riêng biệt.
- [ ] Không dùng kết quả Cloudflare/Tunnel để kết luận riêng logic ZIP.
- [ ] Không ghi token, password hoặc secret vào tài liệu/log.
- [ ] Không tự chạy `npm run build` chỉ để kiểm tra các vấn đề này.

---

## 12. Trạng thái tại thời điểm lập tài liệu

### Đã hoàn tất trong phạm vi trước đó

- Điều tra `request_timeout` và translation 500/socket hang up.
- Giảm perceived loading cho `/admin/dashboard` và `/admin/statistics`.
- Tách request chính/phụ và xử lý lỗi phụ bằng `Promise.allSettled`.
- Điều tra async export và xác định ý nghĩa `queued -> processing -> ready`.
- Xác nhận trước đây ZIP chưa import trực tiếp được; hiện route ZIP-only đã triển khai.
- Xác nhận `products.json` sau khi giải nén có thể đi qua JSONAdapter/import pipeline nếu hợp lệ.
- Đọc các báo cáo Markdown hiện có về export incident, troubleshooting và seed issues.

### Chưa triển khai trong audit này

- SSRF protection dùng chung đầy đủ cho importer, exporter và Cloudinary.
- Streaming parser/temp-file staging thay cho việc giữ toàn bộ ZIP trong memory.
- CSV formula injection protection.
- Unique index/idempotency bền vững, transaction hoặc staging import.
- Mapping account Cloudinary đầy đủ trên Product/Banner và cleanup theo metadata.
- Manifest/version/checksum và bộ security regression test đầy đủ cho ZIP bomb, symlink và checksum.
- Kiểm thử tích hợp production và load test.

Các mục còn lại cần được hoàn thiện trước khi coi ZIP là backup đầy đủ, đặc biệt là asset import, checksum và staging/transaction.

---

## 13. Cập nhật tiến độ tối ưu đồng thời

### Đã triển khai

- Export job hỗ trợ `Idempotency-Key` và index duy nhất theo `userId + idempotencyKey` để retry cùng request không tạo job mới.
- Export queue giới hạn mặc định 2 job active mỗi admin và 8 job active toàn hệ thống. Có thể cấu hình bằng `MAX_ACTIVE_EXPORT_JOBS_PER_USER` và `MAX_ACTIVE_EXPORT_JOBS_GLOBAL`.
- Recovery job export hết lease chuyển sang xử lý bằng cursor tuần tự, tránh tải toàn bộ danh sách job vào RAM và `Promise.all` không giới hạn.
- Frontend export chặn double-click trong cùng tab, polling hỗ trợ abort, `Retry-After` và backoff khi nhận `429`.
- Import sản phẩm có giới hạn concurrency mặc định 2 request trên mỗi backend process qua `MAX_IMPORT_CONCURRENCY`; request vượt giới hạn nhận `429` thay vì tiếp tục giữ ZIP trong RAM.
- Frontend chặn gửi trùng import sản phẩm và import bản dịch trong cùng tab.
- Import update/upsert kiểm tra `__v` để phát hiện xung đột ghi đồng thời, không âm thầm ghi đè thay đổi mới hơn.
- Đã cập nhật test queue export để phản ánh bước kiểm tra quota mới.

### Chưa hoàn tất

- Import sản phẩm chưa có idempotency bền vững theo nội dung ZIP trên toàn hệ thống.
- Import chưa có staging/transaction bao phủ Product, Category, translation và Cloudinary.
- Giới hạn import hiện là theo từng backend process; khi chạy nhiều replica cần semaphore phân tán hoặc chuyển import thành job queue dùng chung.
- Export local storage chưa phù hợp khi nhiều replica không dùng shared volume; production nhiều instance nên dùng S3/shared storage.
- Chưa chạy được runtime/load test vì Builder setup `pnpm install` đang lỗi Corepack và chưa có dev server.

### Kiểm tra sau thay đổi

- `node --check` các file backend đã sửa: PASS.
- `git diff --check`: PASS.
- Không chạy `npm run build`.

### Cập nhật xác minh source

- `translationController.js` đã nạp `StaticTranslation`; static translation không còn vấp lỗi model chưa được khai báo.
- `safeRemoteUrl.js` đã nạp DNS promise API, nên DNS validation dùng bởi export/Cloudinary không còn lỗi khi kích hoạt.
- CSV export đã có neutralization formula; CSVAdapter đã reject row lệch cột và quote không đóng. Các mục tương ứng trong phần rủi ro được giữ lại như hardening/regression-test, không phải blocker code hiện tại.
- SVG bị từ chối trong allowlist export hiện hành. Export và Cloudinary remote download đều dùng fetcher an toàn có redirect thủ công.
- Chưa triển khai production hay chạy runtime/load test mới trong phiên này. Không chạy `npm run build`.
