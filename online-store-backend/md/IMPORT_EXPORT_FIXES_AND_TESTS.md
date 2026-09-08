# Audit Import/Export sản phẩm

## Phạm vi

Tài liệu này ghi lại các lỗi phát hiện trong luồng export ZIP → validate → import sản phẩm, nguyên nhân, thay đổi đã thực hiện và cách kiểm tra.

Không ghi email, mật khẩu, token hoặc nội dung credential XML.

## Kết luận hiện tại

Các lỗi đã được xử lý theo từng lớp:

- Login từ credential XML hoạt động.
- Lỗi Cloudflare HTTP 530 được tách khỏi lỗi backend bằng test trực tiếp vào backend local.
- ZIP export không còn bị đánh fail chỉ vì sản phẩm không có thông số kỹ thuật.
- Các dạng `specs` cũ được chuẩn hóa khi export.
- Giới hạn ảnh 5 MiB được dùng chung giữa exporter, ZIP importer và Cloudinary.
- Export không còn giữ lại reference ảnh nếu binary asset không được đưa vào ZIP.

Bản test runtime gần nhất đã đạt:

```text
[validate] valid=true products=10 images=78
```

Sau đó phát hiện lỗi tiếp theo ở bước import ảnh:

```text
IMPORT_ZIP_IMAGE_SIZE_INVALID
```

Bản fix xử lý lỗi ảnh đã được thêm sau lần test này và cần chạy lại integration test sau khi restart backend.

## Quy ước module test hiện tại

- File test JavaScript trong `online-store-backend/src/test` dùng thống nhất dạng `<module>.test.js`; không thêm tiền tố `test-`.
- `src/test/testConfig.js` cung cấp biến môi trường, timeout, đường dẫn frontend và discovery động cho các file `.test.js`.
- `npm test` chạy qua `src/test/test-runner.js`; module có cấu trúc Mocha được chạy bằng Mocha, script độc lập được chạy bằng Node.
- Test kiểm tra offline bằng Node nằm tại `online-store-backend/src/test/frontend-offline-manual.test.js` và chạy bằng:

```text
cd online-store-backend
npm run test:offline
```

- Test `offline-support.test.ts` vẫn nằm ở frontend vì cần môi trường browser/IndexedDB thật; không chuyển sang backend Node.
- Khi chạy manual offline test từ backend, `TEST_FRONTEND_ROOT` có thể override đường dẫn frontend nếu workspace không dùng cấu trúc thư mục mặc định.

## 1. Lỗi credential và HTTP 530

### Triệu chứng

Lệnh test frontend local ban đầu trả:

```text
[login] HTTP 530
LOGIN_FAILED_530
Cloudflare Tunnel error | backend.manln.online
```

### Nguyên nhân

Đây không phải lỗi thiếu password. Nếu credential không đọc được, script sẽ dừng trước khi gửi request login.

HTTP 530 là lỗi Cloudflare Tunnel/origin. Frontend local đang chuyển tiếp request tới backend production qua `backend.manln.online`, nên không phù hợp để kiểm tra trực tiếp backend local.

### Credential được đọc ở đâu

Các wrapper PowerShell dùng credential XML mặc định:

```text
%USERPROFILE%\.online-store-export-credential.xml
```

Node runner cũng có fallback đọc cùng file khi thiếu biến môi trường credential.

Không ghi password vào command line hoặc repository.

### Cách xử lý

Đã thêm các npm command dùng wrapper PowerShell, wrapper sẽ:

1. Kiểm tra file XML tồn tại.
2. Đọc bằng `Import-Clixml`.
3. Nạp credential tạm thời cho tiến trình test.
4. Xóa biến môi trường credential sau khi chạy.

Đã thêm trong `online-store-backend/package.json`:

```text
npm run test:import:export:dynamic:local
npm run test:import:export:dynamic:local:backend
```

Để tách Cloudflare khỏi backend, dùng:

```powershell
npm run test:import:export:dynamic:local:backend
```

### Kết quả xác nhận

Log thực tế đã xác nhận backend local hoạt động:

```text
[login] HTTP 200
[enqueue] HTTP 202
[poll] status=ready
```

## 2. Lỗi thiếu `specs` trong ZIP

### Triệu chứng ban đầu

```text
ZIP_INVALID_ZIP_REQUIRED_FIELDS_MISSING
[{"row":1,"fields":["specs"]}, ...]
```

### Điều tra dữ liệu

ZIP được giải nén và kiểm tra bằng PowerShell. Bốn sản phẩm đầu tiên có dạng:

```json
{
  "name": "Phần mềm Windows 11 Home Online DwnLd NR KW9-00664",
  "specs": {}
}
```

Các sản phẩm này không có `specifications`, `attributes` hoặc `Attributes` để phục hồi. Đây là sản phẩm không có thông số kỹ thuật, không phải ZIP hỏng.

### Thay đổi đã thực hiện

#### Chuẩn hóa dữ liệu export

Tại `src/controllers/productImportController.js`:

- Hỗ trợ `specs` dạng `Map`.
- Parse `specs` dạng JSON string.
- Fallback các field legacy:
  - `specifications`
  - `attributes`
  - `Attributes`
- Xuất thống nhất về field `specs` canonical.
- Không xuất lại các field legacy gây nhầm lẫn.

#### Đồng bộ contract validator

Tại `src/utils/productImportValidator.js`:

- `specs` trở thành field tùy chọn khi import đầy đủ.
- `specs: {}` được chấp nhận.
- Sản phẩm không có `specs` được normalize thành `{}`.
- Vẫn từ chối `specs` sai định dạng, ví dụ array hoặc JSON string không hợp lệ.

Tại `scripts/test-export-dynamic.js`:

- Bỏ `specs` khỏi danh sách required field của ZIP validator.
- JSON/CSV không có cột hoặc object `specs` không còn bị đánh fail chỉ vì thiếu thông số.

### Kết quả xác nhận

Sau khi sửa, integration test đã đạt:

```text
[validate] valid=true products=10 images=78
```

Điều này xác nhận lỗi thiếu `specs` đã được xử lý.

## 3. Lỗi `IMPORT_ZIP_IMAGE_SIZE_INVALID`

### Triệu chứng

Sau khi `specs` hợp lệ, bước import dry-run trả:

```text
[import dry-run] HTTP 400
IMPORT_FAILED_400
IMPORT_ZIP_IMAGE_SIZE_INVALID
```

### Nguyên nhân

ZIP importer giới hạn mỗi asset ảnh ở 5 MiB. Trước đó các lớp khai báo giới hạn riêng:

- Exporter: 5 MiB.
- ZIP importer: 5 MiB.
- Cloudinary: 5 MiB.

Ngoài ra, exporter có thể bỏ qua ảnh tải lỗi/quá lớn nhưng vẫn giữ metadata ảnh trong `products.json`. Khi đó ZIP có reference ảnh nhưng không có asset tương ứng.

### Thay đổi đã thực hiện

#### Dùng chung giới hạn ảnh

Thêm constant:

```text
src/utils/fileUtils.js
MAX_IMAGE_ASSET_BYTES = 5 * 1024 * 1024
```

Constant này được dùng tại:

- `src/controllers/productImportController.js`
- `src/utils/zipImport.js`
- `src/services/cloudinaryService.js`

Không nâng giới hạn lên tùy tiện vì Cloudinary cũng đang giới hạn 5 MiB.

#### Không giữ reference ảnh mồ côi

Tại `prepareExportBatchForArchive()` trong `productImportController.js`:

- Chỉ giữ ảnh có `assetPath` sau khi binary asset đã được tải và append vào ZIP.
- Ảnh tải lỗi hoặc vượt giới hạn bị loại khỏi mảng `images` của bundle.
- `image` URL chính của product vẫn được giữ để không làm mất dữ liệu sản phẩm.

Nhờ vậy exporter không tạo ZIP chứa reference tới asset không tồn tại.

#### Test giới hạn ảnh

Thêm test ZIP chứa ảnh lớn hơn `MAX_IMAGE_ASSET_BYTES` và xác nhận importer trả:

```text
IMPORT_ZIP_IMAGE_SIZE_INVALID
```

## 4. Các file đã cập nhật hoặc liên quan

### Cấu hình command

```text
online-store-backend/package.json
```

### Credential/test runner

```text
online-store-backend/scripts/test-export-dynamic.js
online-store-backend/scripts/test-import-export.ps1
online-store-backend/scripts/test-export-production.ps1
```

`test-export-dynamic.js` và `package.json` đã được cập nhật; hai wrapper PowerShell đã được kiểm tra và dùng làm entrypoint đọc credential XML.

### Export/import

```text
online-store-backend/src/controllers/productImportController.js
online-store-backend/src/utils/productImportValidator.js
online-store-backend/src/utils/fileUtils.js
online-store-backend/src/utils/zipImport.js
online-store-backend/src/services/cloudinaryService.js
```

### Test hồi quy

```text
online-store-backend/src/test/importFileValidator.test.js
```

## 5. Cách test đã thực hiện

### 5.1. Kiểm tra cú pháp

Đã chạy kiểm tra cú pháp Node cho các file đã sửa:

```powershell
node --check scripts/test-export-dynamic.js
node --check src/utils/productImportValidator.js
node --check src/controllers/productImportController.js
node --check src/utils/fileUtils.js
node --check src/utils/zipImport.js
node --check src/services/cloudinaryService.js
node --check src/test/importFileValidator.test.js
```

Kết quả:

```text
syntax-ok
```

### 5.2. Kiểm tra diff

Đã chạy:

```powershell
git diff --check
```

Không phát hiện whitespace error.

### 5.3. Unit test hồi quy đã bổ sung

Trong `src/test/importFileValidator.test.js`:

- Export giữ được `specs` canonical.
- Export chuyển `Map` về object.
- Export fallback field legacy.
- Sản phẩm không có specs vẫn import được.
- `specs: {}` vẫn import được.
- ZIP reject image asset vượt 5 MiB.

Mocha chưa chạy được trong môi trường trợ lý vì workspace hiện không có dependency `node_modules` backend. Đây là kiểm tra syntax, không phải kết quả unit test runtime.

### 5.4. Integration test trên máy Windows

Lệnh dùng:

```powershell
npm run test:import:export:dynamic:local:backend
```

Luồng test:

```text
login
  -> enqueue export job
  -> poll queued/processing/ready
  -> download ZIP
  -> validate products.json và image assets
  -> import dry-run
```

Các kết quả đã quan sát:

1. HTTP 530 frontend qua Cloudflare — đã tách nguyên nhân bằng backend target.
2. HTTP 200 login backend local — credential XML hoạt động.
3. ZIP bị fail vì `specs` — đã fix và đạt `valid=true`.
4. Import dry-run tiếp tục phát hiện `IMPORT_ZIP_IMAGE_SIZE_INVALID` — đã thêm fix xử lý giới hạn/reference ảnh.

## 6. Lệnh test sau bản fix mới nhất

Restart backend:

```powershell
npm start
```

Sau đó chạy:

```powershell
npm run test:import:export:dynamic:local:backend
```

Kết quả mong đợi:

```text
[login] HTTP 200
[enqueue] HTTP 202
[poll] status=ready
[validate] valid=true
[import dry-run] HTTP 200
[FINAL RESULT] PASS
```

Nếu muốn kiểm tra frontend sau khi backend local pass:

```powershell
npm run test:import:export:dynamic:local
```

Frontend test có thể vẫn phụ thuộc Cloudflare Tunnel và `backend.manln.online`; vì vậy backend target là test chuẩn để xác nhận logic import/export.

## 7. Lưu ý vận hành

- Dùng `--mode upsert` hoặc npm script backend local mặc định.
- Không dùng `--commit-import` khi chỉ kiểm tra; mặc định hiện tại là dry-run.
- Không chạy `npm run build` trong quy trình test này.
- Không commit file ZIP, report runtime hoặc credential XML vào repository.
- Nếu test vẫn báo lỗi ảnh, cần kiểm tra process backend đã restart và ZIP được tạo sau thời điểm cập nhật code.

## 8. Kết quả xác nhận sau bản fix mới nhất

### 8.1. Sửa `IMPORT_ZIP_IMAGE_SIZE_INVALID`

Importer không còn dùng riêng metadata `uncompressedSize` trong central directory của ZIP làm nguồn xác thực cuối cùng. Ảnh được giải nén và kiểm tra bằng kích thước buffer thực tế, đồng thời vẫn giữ:

- Tối đa 5 MiB cho mỗi ảnh.
- Tối đa 256 MiB cho tổng dữ liệu sau giải nén.
- Từ chối ảnh rỗng hoặc vượt giới hạn.

Đã thêm test hồi quy cho ZIP có metadata kích thước lớn hơn buffer thực tế tại:

```text
online-store-backend/src/test/importFileValidator.test.js
```

### 8.2. Rotation nhiều tài khoản Cloudinary

Đã hỗ trợ các nhóm biến môi trường liên tiếp:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

CLOUDINARY_CLOUD_NAME_2
CLOUDINARY_API_KEY_2
CLOUDINARY_API_SECRET_2

CLOUDINARY_CLOUD_NAME_3
CLOUDINARY_API_KEY_3
CLOUDINARY_API_SECRET_3
```

Khi upload gặp HTTP `420`, `429` hoặc lỗi rate limit/quota, hệ thống thử tài khoản tiếp theo. Claim upload lưu `cloudinaryAccountId`; validate và cleanup dùng đúng tài khoản đã upload để tránh thao tác nhầm ảnh giữa các cloud.

Các file chính:

```text
online-store-backend/src/services/cloudinaryService.js
online-store-backend/src/controllers/cloudinaryController.js
online-store-backend/src/models/CloudinaryUploadClaim.js
online-store-backend/src/models/CloudinaryCleanupOutbox.js
online-store-frontend/src/hooks/useCloudinaryUpload.ts
online-store-backend/src/test/cloudinaryService.test.js
```

### 8.3. Integration test thực tế trên backend local

Lệnh đã chạy sau khi restart backend:

```powershell
npm run test:import:export:dynamic:local:backend
```

Kết quả:

```text
[login] HTTP 200
[enqueue] HTTP 202
[poll] status=queued attempts=0
[poll] status=processing attempts=1
[poll] status=ready attempts=1
[validate] valid=true products=10 images=78
[import dry-run] HTTP 200
[FINAL RESULT] PASS
```

Kết luận: luồng `EXPORT -> ZIP VALIDATE -> IMPORT DRY-RUN` đã hoạt động thành công với 10 sản phẩm và 78 ảnh.

Bài test này không cố tình tạo lỗi rate limit Cloudinary vì import dry-run không upload ảnh thật. Rotation Cloudinary cần được xác nhận thêm bằng một lần upload thực tế khi các nhóm key bổ sung đã được cấu hình.

Không chạy `npm run build`.

## 9. Cập nhật tiến độ xử lý đồng thời

### Đã triển khai

- Export async nhận `Idempotency-Key`, lưu khóa trên `ExportJob` và trả lại job hiện có khi request được gửi lại.
- Queue export giới hạn mặc định 2 job active mỗi admin và 8 job active toàn hệ thống; cấu hình qua `MAX_ACTIVE_EXPORT_JOBS_PER_USER` và `MAX_ACTIVE_EXPORT_JOBS_GLOBAL`.
- Recovery export job hết lease dùng cursor tuần tự thay vì tải toàn bộ expired jobs và cập nhật đồng thời không giới hạn.
- Frontend export chống double-click, polling có abort, backoff và xử lý `429`/`Retry-After`.
- Import ZIP giới hạn mặc định 2 request đồng thời trên mỗi backend process qua `MAX_IMPORT_CONCURRENCY`.
- Import update/upsert kiểm tra `__v` để trả conflict khi dữ liệu đã bị thay đổi bởi lượt import khác.
- Test syntax backend, test syntax export job và `git diff --check` đã PASS.

### Giới hạn cần theo dõi

- Import product chưa có idempotency bền vững theo nội dung ZIP, transaction/staging toàn bộ hoặc khóa phân tán giữa nhiều backend replica.
- Các thao tác import vẫn có thể cần RAM lớn vì ZIP được nhận bằng `memoryStorage`.
- Local export storage chỉ an toàn trong một instance hoặc shared volume; nhiều instance nên dùng S3/shared storage.
- Chưa chạy runtime/load test trong Builder do setup `pnpm install` lỗi Corepack; không chạy `npm run build`.
