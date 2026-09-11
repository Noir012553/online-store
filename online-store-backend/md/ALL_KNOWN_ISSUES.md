# Tổng hợp vấn đề đã phát hiện

Tài liệu này ghi lại các vấn đề kỹ thuật, test setup và credential đã phát hiện trong dự án. Không ghi mật khẩu, token, secret hoặc nội dung credential XML thật.

## 1. Credential XML trên Windows

### Hiện tượng

File mặc định được các test export/import tìm là:

```text
%USERPROFILE%\\.online-store-export-credential.xml
```

Khi chạy `Import-Clixml`, biến `$credential` trả về `$null`, sau đó gọi:

```powershell
$credential.GetNetworkCredential()
```

sẽ gây lỗi:

```text
You cannot call a method on a null-valued expression.
```

### Nguyên nhân

Lệnh tạo file trước đó dùng `Get-Credential`. Nếu người dùng bấm Cancel hoặc không nhập credential, pipeline vẫn có thể tiếp tục và lệnh cũ vẫn in thông báo đã lưu file. Kết quả là file XML không chứa một `PSCredential` hợp lệ.

Ngoài ra, file do `Export-Clixml` tạo được mã hóa bằng Windows DPAPI. File chỉ đọc được trên đúng máy Windows và đúng user Windows đã tạo nó.

### Cách kiểm tra không hỏi lại credential

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; if (-not (Test-Path $path)) { throw "Không tìm thấy file: $path" }; $credential = Import-Clixml $path; if ($null -eq $credential -or $credential -isnot [System.Management.Automation.PSCredential]) { throw 'File XML không chứa credential hợp lệ hoặc không đọc được bằng user Windows hiện tại' }; Write-Host "Username: $($credential.UserName)"
```

### Khi file không hợp lệ

Không thể tự khôi phục password từ file XML rỗng hoặc file được tạo bởi user/máy khác. Cần tạo lại một lần bằng `Get-Credential`, sau đó những lần sau mới dùng `Import-Clixml` mà không cần nhập lại.

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; $credential = Get-Credential -Message 'Nhập tài khoản admin dùng cho test export/import'; if ($null -eq $credential) { throw 'Bạn đã hủy nhập credential, chưa tạo file' }; $credential | Export-Clixml -Path $path -Force; Write-Host "Đã lưu credential hợp lệ tại: $path"
```

### Nạp credential vào session hiện tại

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; $credential = Import-Clixml $path; if ($null -eq $credential -or $credential -isnot [System.Management.Automation.PSCredential]) { throw 'Credential XML không hợp lệ' }; $networkCredential = $credential.GetNetworkCredential(); if ([string]::IsNullOrWhiteSpace($networkCredential.Password)) { throw 'Không đọc được password từ credential XML' }; $env:TEST_ADMIN_EMAIL = $credential.UserName; $env:TEST_ADMIN_PASSWORD = $networkCredential.Password; $env:EXPORT_TEST_EMAIL = $credential.UserName; $env:EXPORT_TEST_PASSWORD = $networkCredential.Password; Write-Host "Đã nạp credential cho: $($credential.UserName)"
```

Các biến trên chỉ tồn tại trong cửa sổ PowerShell hiện tại. Không in password ra terminal và không commit file XML.

## 2. Hai flow authentication khác nhau

### Export/import dynamic

`online-store-backend/scripts/test-export-dynamic.js` hỗ trợ:

- `EXPORT_TEST_EMAIL` và `EXPORT_TEST_PASSWORD`.
- `EXPORT_CREDENTIAL_PATH` để chỉ định XML khác.
- File mặc định `%USERPROFILE%\\.online-store-export-credential.xml` trên Windows.
- `Import-Clixml`/DPAPI thông qua PowerShell.

### Backend integration harness

`online-store-backend/src/test/integrationHarness.js` không phụ thuộc Windows XML. Harness dùng:

- `TEST_ADMIN_EMAIL`.
- `TEST_ADMIN_PASSWORD`.
- `TEST_ADMIN_TOKEN` nếu backend test đã chạy sẵn.
- `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` cho process backend cô lập.

Harness đăng nhập qua API thật:

```text
POST /api/users/login
```

Lý do tách riêng là integration test có thể chạy trên Linux/container, nơi không đọc được credential DPAPI của Windows.

## 3. Lỗi backend và test đã xử lý

### Duplicate declaration

Các module từng khai báo trùng biến khiến backend không parse được:

```text
Identifier 'SpecKeyRegistry' has already been declared
```

Đã loại bỏ import trùng trong các service liên quan và kiểm tra syntax toàn bộ backend.

### VNPAY timezone

Test từng hard-code giờ theo timezone máy chạy test. Đã chuyển sang:

- Input thời gian UTC rõ ràng.
- Tính expected bằng `Intl.DateTimeFormat` với `Asia/Ho_Chi_Minh`.
- Kiểm tra zero-padding và định dạng 14 chữ số.

### Mock controller lệch production contract

Đã sửa các mock cho:

- `req.lang` và `req.query`.
- Mongoose chain `.lean()`, `.populate()`, `.maxTimeMS()`, `.select()`, `.sort()`, `.limit()` và `.skip()`.
- Currency, Category, Order và Cloudinary boundary.
- Response có field `role` và message i18n hiện hành.

### Integration setup không đầy đủ

Trước đây test phụ thuộc backend/MongoDB/token thủ công và có thể coi các trạng thái như `404`, `ECONNREFUSED` hoặc request bị reject là pass.

Đã thêm harness để:

1. Kiểm tra `TEST_MONGO_URI` hoặc `MONGO_URI` từ môi trường thật.
2. Chọn port trống.
3. Khởi động backend thật nếu chưa readiness.
4. Dùng database/backend thật theo cấu hình env hiện tại.
5. Tạo admin/product/category fixture động.
6. Gọi route thật.
7. Kiểm tra response và database.
8. Cleanup fixture và child process; không tự xoá database thật.

### Translation route

Route đúng là:

```text
POST /api/translations/admin/manual-override
```

Route cũ `/api/translations/manual-override` không tồn tại. Route đúng yêu cầu Bearer token admin, cache fixture và kiểm tra `TranslationAuditLog`.

### Mongoose deprecated option

Đã thay:

```js
{ new: true }
```

bằng:

```js
{ returnDocument: 'after' }
```

## 4. Cấu hình môi trường

Backend template nằm tại:

```text
online-store-backend/.env.example
```

Backend local secret file:

```text
online-store-backend/.env
```

Frontend public template nằm tại:

```text
online-store-frontend/.env.local.example
```

Frontend chỉ chứa các biến public `NEXT_PUBLIC_*`. Không đặt MongoDB, JWT secret, password, Cloudinary API secret hoặc VNPAY hash secret ở frontend.

## 5. Trạng thái kiểm tra

Đã thực hiện:

- Kiểm tra syntax các file test/harness đã sửa.
- Kiểm tra `git diff --check`.
- Phân tách test thường và integration test.
- Bổ sung env template theo các nhóm backend đang đọc.

Chưa thể chạy đầy đủ integration suite nếu môi trường chưa có MongoDB test và credential hợp lệ. Không chạy `npm run build` theo yêu cầu.

## 6. Cập nhật xác minh source

- `src/controllers/translationController.js` đã nạp `StaticTranslation`, vì vậy các luồng static translation không còn tham chiếu model chưa khai báo.
- `src/utils/safeRemoteUrl.js` đã nạp `dns.promises`, khắc phục lỗi runtime trong DNS validation khi kiểm tra URL ảnh từ xa.
- Chưa có deploy hoặc test integration/runtime mới trong môi trường này; cần MongoDB test và credential hợp lệ để xác nhận các endpoint liên quan.

## 7. Bản ghi vấn đề và trạng thái sau các thay đổi gần nhất

Phần này là nguồn tổng hợp mới nhất cho các vấn đề đã được phản hồi trong phiên làm việc. Các mục ở phần trước được giữ lại làm lịch sử; khi có khác biệt, trạng thái ở phần này được ưu tiên.

### 7.1. Quy ước chạy test

```text
npm test
```

- Ở root, lệnh chuyển tiếp tới backend.
- Ở backend, chạy `node src/test/test-runner.js --suite=products`.
- Đây là product suite mặc định, không phải toàn bộ test.

```text
npm run test -- --suite=products
```

- Chạy product suite một cách tường minh.
- Về mục tiêu kiểm tra, tương đương `npm test` ở backend hiện tại.

```text
npm run test:all
```

- Chạy toàn bộ suite mà unified runner discovery được.
- Không được coi là PASS nếu workspace thiếu dependencies, MongoDB, backend readiness hoặc credential.

`src/test/test-runner.js` đã được cập nhật hướng dẫn để phân biệt product suite và all suite. Không chạy `npm run build` theo yêu cầu dự án.

### 7.2. Lỗi TTL index cho translation cache

#### Triệu chứng lịch sử

MongoDB đã có index `createdAt_1` nhưng thiếu metadata `expireAfterSeconds`, khiến migration smoke test fail dù tên index tồn tại.

#### Cách sửa

```js
// src/models/ProductCatalogTranslationCache.js
ProductCatalogTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 },
);

// src/models/UserContentTranslationCache.js
UserContentTranslationCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000 },
);
```

`src/scripts/setup-production-indexes.js` đã drop/recreate index cùng key nhưng sai TTL, sau đó verify bằng `listIndexes().toArray()` và kiểm tra cả key lẫn `expireAfterSeconds`.

Kết quả product suite gần nhất:

```text
Discovered: 5 test files
Passed:     5 test files
Failed:     0 test files
```

`translation-migration-smoke.test.js` đạt `10 passing`. Không cần chạy `npm run clear` hoặc `npm run seed` chỉ để sửa TTL index.

### 7.3. Lỗi môi trường test đã gặp

| Lỗi | Nguyên nhân | Trạng thái |
| --- | --- | --- |
| `JWT access secret is not configured` | Process test không nạp `.env` hoặc thiếu JWT secret | Runner/config đã nạp dotenv; runtime vẫn cần env hợp lệ |
| `openUri() must be a string, got undefined` | Thiếu `TEST_MONGO_URI`/`MONGO_URI` | Config đã chuẩn hóa; phải preflight MongoDB |
| `ECONNREFUSED 127.0.0.1:5000` | Backend chưa chạy hoặc chưa readiness | Không phải lỗi product unit; endpoint test cần backend ready |
| VNPAY expected lệch 7 giờ | Test phụ thuộc timezone process | Đã chuyển expected sang `Asia/Ho_Chi_Minh` |
| Mocha không chạy trong workspace trợ lý | Thiếu `online-store-backend/node_modules/.bin/mocha` | Chưa có runtime unit result mới từ workspace này |

`node --check` và `git diff --check` đã đạt ở các lần kiểm tra trước. Đây không thay thế unit/integration test runtime.

### 7.4. Duplicate declaration và mock test không khớp production

Các lỗi lịch sử:

```text
Identifier 'SpecKeyRegistry' has already been declared
Identifier 'StaticTranslation' has already been declared
Cannot read properties of undefined (reading 'lang')
populate is not a function
```

Nguyên nhân là import trùng hoặc mock request/query chain không khớp controller thật. Đã loại import trùng và bổ sung mock cho `req.lang`, `req.query`, `req.app.get('io')`, cùng các chain Mongoose như `lean`, `populate`, `select`, `sort`, `limit`, `skip` và `maxTimeMS`.

### 7.5. Lỗi `SeedStatus` và exchange-rate history

`SeedStatus` dùng các field `phase`, `status`, `completedAt`, nhưng `exchangeRateHistorySeeder` cũ còn upsert bằng field `module`/`isCompleted`, gây:

```text
StrictModeError: Path "module" is not in schema
```

Đã đổi seeder sang phase `EXCHANGE_RATE_HISTORY` và bổ sung phase vào enum của model. Kết quả sau sửa đã tạo được `19` bản ghi lịch sử tỷ giá.

### 7.6. Full seed: thứ tự, phạm vi và lỗi đã xử lý

Trước đây `aboutMedia` chạy quá muộn, sau product crawler/import/translation. Hiện `npm run seed` tự chạy pipeline:

```text
aboutMedia
-> currencies
-> exchangeRateHistory
-> languages
-> translations
-> brandTranslations
-> specKeyCache
-> bannerSlotLabels
-> testimonialLabels
-> users
-> categories
-> brands
-> banners
-> customers
-> shippingProviders
-> locations
-> addresses
-> categoryTranslations
-> product crawler/import/translation pipeline
-> inventory
-> outOfStock
-> reviews
-> orders
-> coupons
-> specTranslations
```

`aboutMedia` là module `CRITICAL` và đứng đầu `preProducts`. Full mode log:

```text
FULL MODE: About Media -> baseline -> crawler/import -> translation -> post-products
```

Các lỗi đã xử lý trong seed orchestrator:

- `outOfStock` tự lấy admin user và categories nếu context chưa có.
- `aboutMedia` được gọi với context `{ dryRun }`.
- `locations` chỉ chạy sau `shippingProviders`.
- Post-product seeder kiểm tra products đã tồn tại.
- Lỗi cuối pipeline được chuẩn hóa, không còn log `Seeding failed with error: undefined`.
- `seed-about-media.js` tự nạp `.env`.

Asset local hiện có:

```text
online-store-frontend/public/images/team/team-1.jpg
online-store-frontend/public/images/team/team-2.jpg
online-store-frontend/public/images/team/team-3.jpg
online-store-frontend/public/images/team/team-4.jpg
online-store-frontend/public/assets/videos/about-hero.mp4
```

`aboutMediaSeeder` ưu tiên các file này, sau đó upload qua `cloudinaryService`, không gọi Cloudinary trực tiếp. Metadata lưu `cloudinaryAccountId` và `cloudName` để delivery URL dùng đúng account.

### 7.7. Lỗi import crawler: toàn bộ dòng bị invalid

Một lần chạy seed báo số dòng `invalid` bằng tổng số dòng, tổng cộng khoảng `594` sản phẩm không được import. Product pipeline vẫn dịch được các sản phẩm đã có trong database, nhưng dữ liệu crawler mới chưa được nạp.

Đã thêm log tối đa ba ví dụ lỗi validation theo row:

```text
[ProductPipeline] Lý do validation mẫu: row ...: ...
```

Nguyên nhân chính xác chưa được xác minh vì file crawler thực tế nằm ngoài workspace hiện tại. Đây vẫn là blocker dữ liệu; không được kết luận đã fix chỉ vì pipeline tiếp tục chạy translation.

### 7.8. Cloudinary account bị disabled do vượt quota

Account cũ đã trả:

```text
This Account Was Disabled
for Exceeding Usage Limits
You've used 50.35 credits in the last 30 days. Your quota is 25.
```

Khi `npm run clear` cố liệt kê resource, lỗi được chuẩn hóa thành:

```text
Cloudinary account 1 resource listing failed for image:
Cloudinary account 1 operation failed: disabled customer
```

Logger trước đó chỉ đọc `error.message`, khiến object lỗi bị in thành `[CLEAR_ERROR] undefined`; clear script đã sửa cách lấy message/stack.

Quyết định vận hành:

- Không tiếp tục dùng key/account cũ.
- Không mặc định dùng asset cũ của account cũ.
- Đưa account active vào nhóm biến base.
- Dùng nhóm hậu tố liên tiếp `_2`, `_3`, ... cho account phụ.
- Không ghi credential thật vào tài liệu hoặc repository.
- Asset cũ trên account disabled có thể không xóa được qua API; muốn xóa phải re-enable account hoặc chấp nhận asset orphaned.

Quy ước biến môi trường:

```env
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

CLOUDINARY_CLOUD_NAME_2
CLOUDINARY_API_KEY_2
CLOUDINARY_API_SECRET_2
```

Không đặt API secret ở frontend và không dùng tên `NEXT_PUBLIC_*` cho secret. Frontend chỉ nhận chữ ký, `api_key` public và `cloud_name` từ endpoint backend.

### 7.9. Cơ chế bảo vệ quota Cloudinary

`src/services/cloudinaryService.js` hiện có:

- Discovery account base và account `_2` đến `_100` theo thứ tự.
- Đọc `cloudinary.api.usage()` và kiểm tra `credits.usage`/`credits.limit` trước upload hoặc cấp chữ ký.
- Ngưỡng mặc định `80%`, cấu hình bằng `CLOUDINARY_QUOTA_THRESHOLD_PERCENT`.
- Cache usage `30` giây.
- Cooldown account bị gần quota hoặc rate limited trong `60` giây.
- HTTP `420`, `429` và message rate limit/quota thì được phép thử account kế tiếp.
- Lỗi file, chữ ký, xác thực, metadata không hợp lệ hoặc account disabled trả lỗi ngay, không xoay account.
- Khi mọi account đều hết capacity, upload/cấp chữ ký bị từ chối.
- Sau upload invalidate quota cache để lần kế tiếp đọc usage mới.
- Kết quả upload trả `cloudinaryAccountId` và `cloudName`.

Các đường upload đã dùng guard trung tâm:

```text
uploadToCloudinary
uploadFileToCloudinary
uploadVideoFileToCloudinary
cloudinaryController cấp chữ ký direct upload
aboutMediaSeeder
migrate-about-media-to-cloudinary.js
```

Clear theo prefix chạy trên tất cả account được cấu hình và cả ba resource type:

```text
laptop-store/
image
video
raw
```

Clear không xóa tài nguyên ngoài prefix app-managed và không xóa file gốc trên Wikimedia, Unsplash hoặc dịch vụ bên thứ ba.

Các giới hạn cần runtime verification:

- Chưa xác nhận response `cloudinary.api.usage()` thật trên account active mới.
- Chưa chạy upload thật với nhóm key mới để chứng minh rotation end-to-end.
- Nếu account base disabled vẫn còn trong `.env`, clear/seed có thể dừng ngay ở account đó.
- Nếu nhóm `_2`/`_3` bị thiếu một biến hoặc có gap, discovery sẽ dừng tại nhóm đó.
- Quota check/cache là bảo vệ trong một process; nhiều replica đồng thời vẫn có race trước khi Cloudinary cập nhật usage.

### 7.10. Phạm vi và rủi ro của `npm run clear`

`npm run clear` là thao tác destructive và chưa được chạy lại sau thay đổi quota. Source hiện thiết kế theo thứ tự:

```text
1. Xóa Cloudinary resources dưới laptop-store/ trên mọi account cấu hình
2. Xóa local uploads của app
3. Xóa/drop dữ liệu và index phụ MongoDB
4. Disconnect MongoDB
```

Nếu Cloudinary fail, script phải báo account/resource type/stack rõ ràng và dừng trước khi xóa MongoDB. Không chạy trên production hoặc database còn dữ liệu cần giữ nếu chưa backup và xác nhận đúng `MONGO_URI`.

### 7.11. Các giới hạn import/export và hardening còn tồn tại

- ZIP import còn dùng `memoryStorage`, có nguy cơ dùng nhiều RAM; chưa có streaming/staging atomic toàn bộ.
- Import Product, Category, translation và Cloudinary chưa atomic/rollback toàn bộ.
- Chưa có idempotency bền vững theo nội dung ZIP hoặc distributed lock giữa nhiều backend replica.
- Quota import/export và disk cleanup có thể race giữa preflight và thao tác thật.
- SSRF policy chưa dùng chung tuyệt đối giữa importer, exporter và Cloudinary; remote download vẫn cần tiếp tục rà soát redirect/DNS/private IP.
- Mapping `cloudinaryAccountId` chưa được lưu đầy đủ trên mọi field ảnh của Product/Banner, vì vậy cleanup mọi đường đi cũ chưa được chứng minh tuyệt đối.
- CSV formula-injection đã có neutralization trong export nhưng cần regression runtime riêng.
- SVG đã bị loại khỏi allowlist export, nhưng không được suy ra mọi flow khác đã sanitize SVG.
- Local export storage chỉ an toàn trong một instance hoặc shared volume; multi-instance nên dùng storage dùng chung.
- Frontend chưa có test runner/typecheck script chính thức; kiểm tra type phụ thuộc môi trường frontend và TypeScript dependency.

### 7.12. Trạng thái kiểm tra và việc chưa chạy

Đã có bằng chứng:

```text
node --check                         PASS cho các file đã kiểm tra
git diff --check                     PASS
product suite                        5/5 file PASS ở lần gần nhất
TTL product cache                    7776000 giây
TTL user content cache               2592000 giây
exchange rate history                19 bản ghi ở lần seed lịch sử
```

Chưa có bằng chứng runtime mới trong workspace hiện tại cho:

```text
cloudinary-service.test.js           Chưa chạy do thiếu dependency cục bộ
npm run test:all                     Chưa xác nhận toàn bộ suite
npm run clear                        Chưa chạy lại sau account rotation
npm run seed                         Chưa chạy lại sau quota/about-media refactor
upload thật với account mới         Chưa xác minh
594 dòng crawler invalid             Chưa xác định lỗi dữ liệu cụ thể
```

Không dùng các report lịch sử `26/26` hoặc `38/38` để kết luận trạng thái hiện tại nếu chưa chạy lại đúng dependencies, MongoDB, backend và credential. Không chạy `npm run build` theo yêu cầu.

## 8. Checklist trước khi chạy lại clear/seed

1. Đưa account Cloudinary active vào nhóm biến base và loại key disabled khỏi process.
2. Kiểm tra đủ nhóm biến `_2`, `_3`, ... không có gap hoặc secret bị đưa ra frontend.
3. Xác nhận `MONGO_URI` trỏ đúng database cần thao tác và đã backup nếu dữ liệu cần giữ.
4. Kiểm tra `CLOUDINARY_QUOTA_THRESHOLD_PERCENT`; mặc định là `80`.
5. Cài dependencies backend nếu cần chạy test runtime; không dùng `npx` tải dependency tạm thay cho dependency của workspace.
6. Chạy product suite trước:

```text
npm test
```

7. Chỉ sau khi xác nhận đúng môi trường mới chạy:

```text
npm run clear
npm run seed
```

8. Đọc report seed và chỉ kết luận thành công khi `aboutMedia`, product pipeline, các post-product seed và dashboard data check đều hoàn thành; phải xem log validation mẫu của crawler, không chỉ nhìn process exit.

## 9. Runtime report mới nhất: clear thành công, seed fail ở Cloudinary config cũ

### 9.1. Kết quả `npm run clear`

Lệnh đã chạy thành công trên workspace người dùng:

```text
[CLEAR] Deleted 0 managed Cloudinary resources
[CLEAR] Cloudinary account 2: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 3: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 4: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 5: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 6: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 7: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 8: { image: 0, video: 0, raw: 0 }
[CLEAR] Cloudinary account 9: { image: 0, video: 0, raw: 0 }
[CLEAR] Deleted 2 local upload directories/files
[CLEAR] Deleted data from 50 collections and dropped indexes from 50 collections
```

Điều này xác nhận lần chạy đó đã:

- Duyệt các Cloudinary account `2` đến `9`.
- Không tìm thấy asset app-managed còn lại dưới `laptop-store/` trên các account đã duyệt.
- Xóa local uploads.
- Xóa dữ liệu MongoDB của 50 collections và drop index tương ứng.

Không được suy ra rằng asset trên account disabled cũ đã bị xóa; account đó không xuất hiện trong danh sách account được API duyệt.

### 9.2. Nguyên nhân `npm run seed` fail

Seed dừng ở module critical đầu tiên:

```text
Running: About Media (Cloudinary team assets)
Missing required environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```

Nguyên nhân là source cũ của `src/seeds/aboutMediaSeeder.js` kiểm tra cứng nhóm biến base trước khi gọi service multi-account:

```js
const REQUIRED_ENVIRONMENT = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];
```

Trong khi runtime đang cấu hình account hậu tố `_2` đến `_9`. Đây là lỗi kiểm tra cấu hình của seeder, không phải lỗi thiếu file team hoặc video local và cũng không phải lỗi MongoDB.

### 9.3. Bản sửa đã áp dụng

`aboutMediaSeeder` hiện:

- Không bắt buộc nhóm base nếu nhóm account hậu tố đã được cấu hình.
- Lookup ảnh/video hiện có trên mọi account đã cấu hình khi không truyền account cụ thể.
- Upload mới vẫn đi qua `cloudinaryService`, nên vẫn kiểm tra quota và tự chọn account còn capacity.
- Lưu đúng `cloudinaryAccountId` và `cloudName` của account tìm thấy/upload thành công.

`src/services/cloudinaryService.js` đã đổi `getCloudinaryResource(publicId, null, resourceType)` thành lookup tuần tự các account. Lỗi `404` được phép thử account tiếp theo; lỗi xác thực, account disabled, file hoặc dữ liệu không hợp lệ vẫn fail-fast theo quy ước. `src/scripts/migrate-about-media-to-cloudinary.js` cũng đã bỏ yêu cầu cứng nhóm base và lookup account `1` để đồng bộ với cơ chế này.

Sau bản sửa, cần chạy lại:

```text
npm run seed
```

Không cần chạy lại `npm run clear` trước khi thử lại seed vì database đã được clear thành công. Nếu seed vẫn fail, lỗi tiếp theo cần đọc là lỗi quota/auth/asset cụ thể, không còn là lỗi bắt buộc nhóm biến base.
