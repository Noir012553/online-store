# Các vấn đề hiện tại

Tài liệu này tổng hợp các lỗi đã kiểm tra và trạng thái xử lý hiện tại.

Lưu ý: các mục Cloudinary cũ trong tài liệu phản ánh lịch sử/policy migration. Luồng seed/import hiện tại đang dùng Cloudflare R2; blocker R2 mới nhất và policy Cloudinary nhiều tài khoản được tách tại `md/ASSET_STORAGE_CLOUDINARY_R2_RISK_REGISTER.md`.

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

- `online-store-backend/src/controllers/translationController.js` đã import `../models/StaticTranslation`; các endpoint static translation, fallback và health vẫn cần runtime test với MongoDB để xác nhận đầy đủ.
- `online-store-backend/src/test/test-config.js` hiện cho phép default discovery chạy cả test phụ thuộc MongoDB/backend/network; có thể tắt bằng `RUN_INTEGRATION_TESTS=false`. `export-production.test.js` vẫn là opt-in qua `RUN_PRODUCTION_TESTS=true`.
- `online-store-backend/src/test/translation-integration.test.js` vẫn còn assertion kiểu `status < 500` và `status < 400`; cần kiểm tra status mong đợi, body và thay đổi dữ liệu cụ thể.
- Regression test ZIP tại `online-store-backend/src/test/import-file-validator.test.js` kiểm tra metadata kích thước sai, trong khi `online-store-backend/src/utils/zipImport.js` vẫn dùng metadata cho compression ratio trước khi đọc buffer thật. Cần đồng bộ code và test.

### Cảnh báo bảo mật và độ tin cậy chưa hoàn tất

- SSRF exporter đã được harden một phần bằng `safeRemoteUrl.js`, nhưng policy chưa dùng chung: validator import chưa resolve DNS private IP và `cloudinaryService.js` còn tải URL bằng `fetch(..., redirect: 'follow')` trực tiếp. Ngoài ra `safeRemoteUrl.js` đang gọi `net.isIP()` nhưng source hiện tại cần bổ sung/xác minh import `net` trước khi bật DNS validation.
- Product/Banner chưa lưu mapping account Cloudinary đầy đủ theo từng ảnh. Claim upload có `cloudinaryAccountId`, nhưng không được dùng làm bằng chứng rằng mọi cleanup/validate về sau luôn đúng account.
- ZIP import vẫn giữ archive, dữ liệu giải nén và asset trong memory; giới hạn kích thước chưa loại bỏ hoàn toàn rủi ro OOM.
- CSV export đã neutralize công thức trong source hiện tại; cần regression test runtime riêng.
- SVG đã được loại khỏi allowlist export; các flow khác chưa được xem là đã sanitize toàn bộ.
- Import chưa atomic trên toàn bộ Product, Category, translation và Cloudinary; vẫn cần test concurrent import, duplicate key và rollback khi lỗi giữa chừng.
- Quota export/import và disk cleanup vẫn có khả năng race giữa bước kiểm tra quota và bước tạo job/upload.

### Đã đối chiếu và không còn là blocker cũ

- Category existence validation đã có trong `productImportController.js`; các tài liệu cũ ghi “category chỉ kiểm tra format” không còn phản ánh source hiện tại.
- Import ZIP trực tiếp đã có ở route `/api/products/admin/import-file`; các báo cáo cũ nói chỉ có thể giải nén offline cần được xem là lịch sử.

### Frontend và môi trường kiểm thử

- Frontend chưa có test runner riêng, nhưng đã có script `typecheck`; chạy từ `online-store-frontend` bằng `npm run typecheck` hoặc `npx --no-install tsc --noEmit`.
- `online-store-frontend/scripts/check-ui-emoji.js` đã được sửa để import `fs` và chỉ quét các thư mục frontend hiện có; `npm --prefix online-store-frontend run check:emoji` đã chạy đạt.
- Root `package.json` có `npm test` chuyển tiếp tới product suite backend và `npm run test:all` cho unified runner. Không nên coi đây là bằng chứng toàn bộ test pass nếu thiếu dependencies, MongoDB, backend readiness hoặc credential.

### Contract `specs`

Validator hiện tại cho phép sản phẩm thiếu `specs` và normalize thành `{}`; `specs: {}` cũng là trạng thái hợp lệ theo code/test hiện tại. Không được ghi hoặc test theo giả định cũ rằng `specs` luôn bắt buộc và phải không rỗng.

## 8. Cập nhật xác minh source

Đã đối chiếu source trong phiên cập nhật này:

- Đã xác minh import `StaticTranslation` đã có trong `online-store-backend/src/controllers/translationController.js`; runtime endpoint vẫn chờ môi trường MongoDB/credential phù hợp.
- `safeRemoteUrl.js` đã có `dns`, nhưng cần sửa import `net` trước khi kết luận DNS validation runtime an toàn.
- CSV export đã neutralize cell bắt đầu bằng khoảng trắng/control character rồi `=`, `+`, `-` hoặc `@` tại `productImportController.js`; mục CSV formula injection trong phần cảnh báo cũ không còn là lỗi mã nguồn hiện tại, nhưng vẫn cần regression test riêng.
- `CSVAdapter` hiện từ chối row lệch số cột và quote không đóng thay vì bỏ qua âm thầm. Parser vẫn là implementation tự viết, vì vậy việc thay bằng parser RFC 4180 streaming là hạng mục hardening sau này, không phải hotfix.
- Export ảnh hiện từ chối `image/svg+xml`; không còn đường export SVG chưa sanitize trong flow này.
- Export ảnh và Cloudinary remote-download đã dùng `fetchSafeRemoteImage()` với redirect thủ công. Import URL hiện chỉ validation, chưa fetch; policy chung vẫn là hạng mục cần hoàn thiện nếu sau này import tải URL.
- Root `package.json` hiện có trong repository; `npm test` và `npm run test:all` đã chuyển tiếp tới backend runner. Runtime root vẫn phụ thuộc `online-store-backend/node_modules` và môi trường test.

Chưa có runtime test toàn bộ mới trong môi trường agent sau khi đổi default discovery vì thiếu dependency `dotenv`; người dùng đã cung cấp log backend đạt `[STARTUP] backend ready`. Những thao tác integration cần MongoDB/credential hợp lệ và chạy lại `npm test`; không chạy `npm run build`.

## 10. Rà soát mới: R2 tương tự Cloudinary và readiness của seed

### Đã xác nhận từ source

- R2 hỗ trợ nhiều nhóm account theo hậu tố và lưu `storageAccount`, `bucket`, `storageKey`, `publicUrl`.
- Product seed có upload role `main`, `gallery` và `description`; full seed chạy `aboutMedia` trước crawler.
- Import `crypto` trong `r2AssetService.js` đã có và syntax check đạt.
- R2 đã có retry hữu hạn cho lỗi mạng/429/5xx và upload guard fail-closed; vẫn chưa có quota provider tracking hoặc rotation/failover tương đương policy Cloudinary. Không được xoay account cho lỗi xác thực, bucket sai, MIME sai hoặc dữ liệu không hợp lệ.
- Cloudflare AI đã có free-tier guard mặc định tắt, giới hạn request/input theo ngày và fail khi nhóm config đánh số bị thiếu; quota counter hiện vẫn theo process, chưa phải billing cap bền vững đa instance.
- `aboutMedia` cần R2 env đầy đủ và `ABOUT_HERO_SOURCE` nếu thiếu hero video local.
- Không có output scraper mặc định trong workspace; full seed sẽ cào lại khi không có input hoặc không dùng `--skip-scrape`.

### Vấn đề dự đoán trước khi fix

- Asset upload thành công nhưng Product/manifest ghi thất bại có thể tạo object mồ côi.
- Custom domain R2 chưa `Active`, base URL sai hoặc lưu sai account/bucket có thể tạo URL `404` dù object tồn tại.
- Manifest ZIP/backup chưa phân biệt đầy đủ role `description`.
- Retry HeadObject/PutObject chưa có chính sách hữu hạn và chưa có failover account theo lỗi rate limit.
- Giới hạn 5 MiB đang dùng chung cho asset có thể gồm video hero.
- Migration asset Cloudinary cũ có thể thiếu account/public ID; không được tự động xóa hoặc di chuyển.

Chi tiết mức độ, file nguồn và tiêu chí nghiệm thu nằm trong `md/ASSET_STORAGE_CLOUDINARY_R2_RISK_REGISTER.md`. Chưa chạy seed/upload thật hoặc build trong lần rà soát này.

## 11. Crawler dừng khi bất kỳ collection nào không có sản phẩm

### Triệu chứng

Khi chạy full seed với crawler:

```powershell
npm run seed:refresh:shutdown
```

pipeline có thể dừng tại bất kỳ scraper brand/danh mục nào nếu collection tương ứng rỗng. Log đã quan sát ở scraper HP Laptop Gaming với lỗi:

```text
RuntimeError: Collection không có sản phẩm; output cũ được giữ nguyên
C:\Windows\system32\cmd.exe kết thúc với mã 1
```

Các scraper trước đó như Acer, Asus và Dell vẫn thu thập được dữ liệu. Trong lần chạy này, collection GearVN `laptop-gaming-hp` trả về không có product URL; các collection khác nếu rỗng cũng phải được xử lý cùng quy tắc này.

### Nguyên nhân

`online-store-backend/python/scraper_runner.py` trước đây coi collection rỗng là lỗi fatal:

```python
if not product_urls:
    raise RuntimeError("Collection không có sản phẩm; output cũ được giữ nguyên")
```

Các script trong `online-store-backend/package.json` được nối bằng `&&`, vì vậy mã thoát `1` của bất kỳ scraper nào cũng làm dừng nhóm hiện tại và không cho các scraper tiếp theo chạy. HP Gaming chỉ là collection đầu tiên được quan sát trong lần chạy này.

Collection rỗng không đồng nghĩa với lỗi parser. Có thể nguồn GearVN đã thay đổi taxonomy, slug, nội dung collection hoặc tạm thời không có sản phẩm. Vì vậy không được tạo output rỗng để ghi đè dữ liệu cũ.

### Cách xử lý đã áp dụng

Tại `online-store-backend/python/scraper_runner.py`, collection rỗng hiện chỉ phát cảnh báo rồi kết thúc scraper thành công:

```python
if not product_urls:
    print(
        f"⚠️ Collection {collection_slug} không có sản phẩm; "
        "giữ nguyên output cũ và bỏ qua scraper này."
    )
    return
```

Hành vi sau khi sửa:

- Không ghi CSV/JSON/staging rỗng.
- Giữ nguyên output cũ của collection nếu có.
- Cho phép các scraper tiếp theo tiếp tục chạy.
- Không làm thay đổi schema hoặc field dữ liệu sản phẩm.
- Vẫn dừng nếu không thể đọc hoàn tất collection do lỗi request.
- Vẫn dừng nếu đã tìm thấy URL nhưng không đọc được sản phẩm, để tránh import batch thiếu dữ liệu.

### Kiểm tra và vận hành

Đã kiểm tra diff không có lỗi whitespace và xác nhận nhánh xử lý mới nằm trong `run_scraper()` dùng chung cho toàn bộ scraper. Có thể chạy lại full pipeline bằng:

```powershell
npm run seed:refresh:shutdown
```

Nếu các module còn lại hoàn tất thành công, lệnh shutdown Windows vẫn được thực hiện theo script hiện tại. Mọi collection rỗng cần được theo dõi riêng để cập nhật slug hoặc nguồn dữ liệu nếu GearVN khôi phục/thay đổi danh mục; không được coi đây là ngoại lệ riêng của HP Gaming.

## 12. Tiến độ hoàn thiện homepage và kiểm thử

### Đã xử lý trong phiên này

- Homepage có trạng thái lỗi sản phẩm và nút thử lại khi một hoặc nhiều request danh mục/flash deal thất bại.
- Hero homepage có selector ổn định `#homepage-hero`, không còn phụ thuộc vào tổ hợp class Tailwind để điều khiển side banner.
- Flash deal tự ẩn khi countdown về 0, tránh tiếp tục hiển thị sản phẩm sau khi hết hạn.
- Nhãn thông số trên `ProductCard` ưu tiên `specLabels` và `specDisplay` đã bản địa hóa thay vì luôn hiển thị raw key.
- Xác minh import `StaticTranslation` của controller dịch tĩnh không bị thiếu.
- Root scripts đã đồng bộ với backend runner; frontend có script `typecheck` riêng.

### Kết quả kiểm tra cập nhật

Đã chạy:

- `npm --prefix online-store-frontend run typecheck` — **PASS**.
- `npm --prefix online-store-frontend run check:emoji` — **PASS**; không có emoji hard-code ngoài registry cho phép.
- `node --check online-store-backend/src/controllers/translationController.js` — **PASS**.
- `node --check online-store-backend/src/utils/safeRemoteUrl.js` — **PASS**.
- `node --check online-store-backend/src/utils/zipImport.js` — **PASS**.
- Parse 18 file locale `admin-import`/`admin-export` cho 9 locale — **PASS**.
- `git diff --check` — **PASS**.
- Smoke test SSRF allowlist — **PASS**: chặn `127.0.0.1`, từ chối URL HTTP private và chấp nhận HTTPS public.

Chưa chạy được:

- `cd online-store-backend && npx --no-install mocha src/test/import-file-validator.test.js` — **BLOCKED** vì backend không có package `mocha` cục bộ và `npx --no-install` không được tải package từ registry.
- `npm --prefix online-store-backend test` — **BLOCKED** ngay khi khởi động vì thiếu module `dotenv` tại `src/test/test-runner.js:16`.
- Translation integration và các test cần MongoDB/backend/credential — **NOT RUN**; chưa có môi trường runtime hợp lệ để kết luận.

Ghi chú: `safeRemoteUrl.js` vẫn dùng `net.isIP()` nhưng chưa có `require('net')` cục bộ; smoke test không tái hiện `ReferenceError` trong Node runtime hiện tại vì môi trường đang cung cấp `net` global. Đây vẫn là việc cần chuẩn hóa để tránh phụ thuộc runtime không rõ ràng, nhưng chưa được đánh dấu là lỗi runtime đã tái hiện.

Không chạy `npm run build` theo quy ước môi trường. Chưa thực hiện retranslate Logitech G515 hoặc audit dữ liệu cache production vì đây là thao tác dữ liệu ngoài source code và cần quyền truy cập backend/MongoDB.

## 13. Audit text hard-code ngoài i18n

### Đã xác nhận và xử lý

- Header/navigation chính, search, footer và các label cart chính đã dùng `t()`/namespace i18n; không còn chuỗi giao diện chính kiểu `Trang chủ`, `Sản phẩm`, `Giỏ hàng` viết trực tiếp trong Header.
- Loại bỏ các map dịch riêng cho tab khuyến mãi trong `ProductInformationTabs.tsx` và fallback locale riêng trong `SpecsTable.tsx`.
- Loại bỏ fallback literal khỏi các luồng checkout, review, cart, order-success, homepage category carousel và một số admin action.
- Chuẩn hóa `aria-roledescription` của homepage và component carousel qua i18n.
- Bổ sung fallback dùng chung cho `retry`, `permission_denied_action`, `user_unnamed`, role carousel, loading reviews và case material tại `src/locales/uiFallbacks.json`.

### Vẫn còn hard-code cần xử lý tiếp

- Một số page admin vẫn truyền `featureName` tiếng Anh trực tiếp cho layout quyền hạn; hiện metadata này chưa được `PermissionDenied` render, nên cần đổi sang translation key khi bổ sung hiển thị tên tính năng.
- Một số call `t(key, namespace, fallback)` vẫn còn trong các page admin khác; riêng trang import sản phẩm và export sản phẩm đã chuyển các nhãn chính sang namespace backend.
- Giá trị động từ backend như tên sản phẩm, thương hiệu, category, promotion và shipping provider không được xem là hard-code frontend; cần backend trả theo locale.
- Tên thương hiệu/provider, URL, enum, CSS class, `aria-hidden`, `aria-current` và mã kỹ thuật không cần đưa vào i18n.

### 14. Tiếp tục audit sau commit 6fae881

Đã xử lý trong phiên này:

- Chuẩn hóa toàn bộ nhãn hiển thị chính của `src/pages/admin/importProducts.tsx` qua namespace `admin-import`, gồm upload ZIP, dry-run, kết quả, cảnh báo, quy trình an toàn và import bản dịch.
- Bổ sung các key tương ứng cho 9 locale backend được frontend hỗ trợ (`vi`, `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`), thay vì đưa thêm fallback tiếng Việt trực tiếp vào component.
- Chuẩn hóa `src/pages/admin/exportProducts.tsx` về namespace `admin-export` và bổ sung thông báo export ZIP theo locale.
- Sửa lời gọi trạng thái trong `src/pages/admin/i18nMonitoring.tsx`: đối số namespace không còn bị dùng nhầm làm fallback.
- Loại bỏ hai nhãn tiếng Anh còn sót (`rows`, `selected`) trong preview batch; số lượng vẫn hiển thị nhưng lấy nhãn từ bản dịch xung quanh.

Chưa xử lý trong phiên này:

- Bulk migrate `featureName` của toàn bộ admin page vì metadata hiện chưa hiển thị ra giao diện; sẽ cần gắn với key i18n khi luồng `PermissionDenied` dùng tên tính năng.
- Integration test vẫn chưa chạy được vì backend thiếu `dotenv`/`mocha` và cần MongoDB/credential; frontend typecheck, check:emoji, syntax check và locale JSON đã chạy đạt. Không chạy `npm run build` theo quy ước môi trường.

Audit hiện không còn ghi nhận `importProducts.tsx` là vùng hard-code JSX chính; các fallback literal còn lại nằm rải rác ở admin page khác và cần xử lý theo từng namespace để tránh thay đổi ngoài phạm vi.
