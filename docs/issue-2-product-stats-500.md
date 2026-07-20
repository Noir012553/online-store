## Trạng thái

- **Loại:** Đã xác minh nguyên nhân HTTP 500 và vấn đề toast/Sonner i18n; đã xác nhận các tiêu chí sửa bằng kiểm thử API trên môi trường dev
- **Endpoint:** `GET /api/products/stats/overview?lang=vi`
- **Lỗi quan sát được:** `500 Internal Server Error`

## Mô tả

Khi người dùng mở trang giới thiệu, frontend gọi API thống kê tổng quan sản phẩm nhưng request trả về HTTP 500. Console hiển thị:

```text
api/products/stats/overview?lang=vi:1 Failed to load resource: the server responded with a status of 500 ()
```

Request này được gọi đồng thời với API testimonials từ:

- `online-store-frontend/src/pages/about.tsx:42-44`

## Phân tích nguyên nhân HTTP 500

Frontend gọi API thống kê bằng:

- `online-store-frontend/src/lib/api.ts:657-661`

Request hiện tại chỉ truyền tham số ngôn ngữ:

```text
/products/stats/overview?lang=vi
```

Backend xử lý endpoint tại:

- `online-store-backend/src/controllers/productController.js:927-973`

Ngay đầu controller, backend lấy currency báo cáo bằng:

```javascript
const reportingCurrency = await getReportingCurrency(req.query.currency);
```

Trong khi request không có `req.query.currency`, hàm tại:

- `online-store-backend/src/utils/orderRevenue.js:10-24`

sẽ ném lỗi:

```text
A reporting currency is required
```

Lỗi không được chuyển thành lỗi validation 4xx. Error middleware mặc định chuyển lỗi chưa có status thành HTTP 500 tại:

- `online-store-backend/src/middleware/errorMiddleware.js:20-23`

Sau đó controller cần dùng currency báo cáo này để tính tổng doanh thu tại:

- `online-store-backend/src/controllers/productController.js:947-950`

Vì lỗi xảy ra trước khi hoàn tất truy vấn thống kê, toàn bộ endpoint thất bại dù phần đếm sản phẩm và khách hàng có thể vẫn truy vấn được.

## Đối chiếu frontend

Trang `about` gọi:

```javascript
const [statsRes, testimonialsRes] = await Promise.all([
  productAPI.getStatsOverview(locale),
  productAPI.getTestimonials(3, locale),
]);
```

Nếu request stats thất bại, `Promise.all` đi vào `catch` và trang sử dụng các giá trị thống kê fallback tại:

- `online-store-frontend/src/pages/about.tsx:55-61`

Do đó lỗi API có thể không làm trang trắng, nhưng dữ liệu thống kê thực tế không được hiển thị.

## Phân tích các thông báo toast/Sonner chưa dịch

### Toast có chuỗi tiếng Anh trực tiếp

Hook upload Cloudinary đang gọi `toast.error` với nội dung tĩnh viết trực tiếp bằng tiếng Anh tại:

- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:44`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:57`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:62`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:128`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:161`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:170`

Các nội dung được ghi trực tiếp gồm:

```text
Failed to get upload signature
File must be smaller than 5MB
File must be an image
Upload failed
Image validation failed
Failed to validate image
```

Các chuỗi này không gọi `t(...)`, không sử dụng namespace static translation và sẽ không thay đổi theo `lang=vi`.

### Error toast API không nhận hàm dịch

Hệ thống xử lý lỗi API nằm tại:

- `online-store-frontend/src/lib/errorHandler.ts:19-65`

Hàm này có hỗ trợ tham số dịch `t` và dùng các key static như `error_server_title`, `error_server_desc`, `error_request_title`. Tuy nhiên các lần gọi từ `executeRequest` trong:

- `online-store-frontend/src/lib/api.ts:436-444`
- `online-store-frontend/src/lib/api.ts:475-483`
- `online-store-frontend/src/lib/api.ts:507-514`

không truyền `t` vào `handleApiError`.

Với response HTTP 500, code hiện tại rơi vào nhánh:

```javascript
toast.error(t?.('error_server_title', 'common') || '', {
  description: t?.('error_server_desc', 'common') || '',
});
```

Khi `t` không được truyền, title và description đều thành chuỗi rỗng. Đây là nguyên nhân khiến toast lỗi API không sử dụng được bản dịch static, thậm chí có thể hiển thị toast không có nội dung.

## Phạm vi ảnh hưởng dự kiến

- Mọi request tới `GET /api/products/stats/overview` không truyền tham số `currency` đều có thể trả về HTTP 500.
- Trang `about` không lấy được số liệu thống kê thực tế và phải hiển thị dữ liệu fallback.
- Các toast lỗi API được tạo qua `api.ts` không nhận được bản dịch do thiếu hàm `t`.
- Các luồng upload ảnh sử dụng `useCloudinaryUpload` có thể hiển thị tiếng Anh khi lỗi hoặc khi file không hợp lệ, bất kể ngôn ngữ hiện tại.
- Các thông báo toast khác đã gọi `t(...)` có cấu trúc đúng không nằm trong nguyên nhân trực tiếp của lỗi endpoint này.

## Biện pháp đề xuất

- Đồng bộ tham số currency giữa frontend và backend cho request stats overview, hoặc để backend xác định currency báo cáo mặc định hợp lệ khi request chỉ truyền `lang`.
- Bổ sung kiểm tra endpoint với các trường hợp có và không có `currency`, đồng thời xác minh mã currency không hợp lệ.
- Đưa các thông báo trong `useCloudinaryUpload` thành static translation keys và gọi qua `useLanguage`/`t(...)`.
- Điều chỉnh luồng xử lý lỗi API để truyền hàm dịch hiện tại vào `handleApiError`, hoặc thống nhất một cơ chế dịch lỗi dùng chung trước khi gọi toast.
- Kiểm tra đầy đủ title và description của nhóm key lỗi trong namespace `common` cho `vi` và ngôn ngữ mặc định.

## Ghi chú

Lỗi HTTP 500 không xuất phát từ tham số `lang=vi` trực tiếp. `lang` chỉ được frontend truyền vào nhưng controller `getStatsOverview` hiện không sử dụng nó; tham số bắt buộc bị thiếu là `currency`.

Thông báo backend `A reporting currency is required` cũng là chuỗi tiếng Anh. Tuy nhiên với status 500, `handleApiError` hiện ưu tiên nhóm key lỗi server và không truyền hàm dịch, nên người dùng chủ yếu nhận toast rỗng thay vì thông báo này.

## Cập nhật tiến độ và kết quả kiểm thử

Kết quả PowerShell trên môi trường dev tại `http://localhost:5000`, locale `vi`:

| Hạng mục | Kết quả |
| --- | --- |
| `GET /api/currencies?isActive=true` | HTTP `200`; currency mặc định được chọn là `VND` |
| `GET /api/products/stats/overview?lang=vi&currency=VND` | HTTP `200` |
| `GET /api/products/stats/overview?lang=vi` | HTTP `200`; fallback currency hoạt động |
| `GET /api/products/stats/overview?lang=vi&currency=ZZZ` | HTTP `400`; currency không hợp lệ được validation đúng |
| `GET /api/translations?lang=vi&ns=common` | HTTP `200` |

Response stats cho cả request có `currency=VND` và request không truyền currency đều trả về:

```json
{
  "totalProducts": 109,
  "inStockProducts": 109,
  "totalOrders": 419,
  "totalRevenue": 11754314200,
  "totalCustomers": 1
}
```

Đã xác nhận đủ sáu khóa toast trong `common` cho locale `vi`:

- `upload_signature_error`: `Không thể lấy chữ ký tải lên`
- `upload_file_too_large`: `Tệp phải nhỏ hơn 5MB`
- `upload_file_must_be_image`: `Tệp phải là ảnh`
- `upload_failed`: `Tải ảnh lên thất bại`
- `image_validation_failed`: `Xác thực ảnh thất bại`
- `image_validation_request_failed`: `Không thể xác thực ảnh`

## Kết luận

- **Đã đạt:** stats overview với currency hợp lệ trả HTTP `200`.
- **Đã đạt:** stats overview không truyền currency fallback thành công và trả HTTP `200`.
- **Đã đạt:** currency không hợp lệ trả HTTP `400` thay vì HTTP `500`.
- **Đã đạt:** static translations `common` cho locale `vi` có đủ sáu khóa toast upload/xác thực ảnh.

### Kiểm thử dynamic PowerShell

Đã chạy lại tập lệnh PowerShell dynamic trên `http://localhost:5000` với locale `vi`.

Kết quả: **8/8 kiểm tra API đạt**:

- Active currencies: HTTP `200`.
- Stats với currency động `VND`: HTTP `200`, đủ 5 field thống kê.
- Stats không truyền currency: HTTP `200`, đủ 5 field thống kê.
- Stats với currency `ZZZ`: HTTP `400`.
- Common translations: HTTP `200`.
- Đủ 6 khóa toast locale `vi`.

### Kết quả local npm test

Lần này đã chạy tại đúng thư mục backend:

- `npm run test:list`: **Đạt**, registry liệt kê được các suite.
- `npm run test:simple`: **Đạt**, exit code `0`.
- Backend suite: **Thất bại**, 2/8 test của `test-backend-endpoints-phase3.js` lỗi do không tìm thấy product/language phù hợp (`Cannot read properties of null`), và `test-phase4-e2e-simplified.js` thiếu module `ProductCatalogTranslationCache`.
- Payment tag suite: **Thất bại**, `testRegistry.js` resolve các file payment thành `src/test-*.js` thay vì vị trí thực tế `src/test/test-*.js`, dẫn đến không tìm thấy test file.
- Rollback/shadow writes: **Thất bại ở test runner**, vì truyền suite `shadow-writes` không tồn tại trong registry; runner cố đọc suite không xác định và lỗi tại `test-runner.js:132`.

Tổng kết dynamic test: **8/8 kiểm tra API đạt**, `test:list` và `test:simple` đạt; còn **3 nhóm local test thất bại**. Các lỗi local này không ảnh hưởng đến việc xác minh product stats API, currency fallback hoặc sáu khóa toast.

**Trạng thái cuối:** Đã xác minh trên môi trường dev rằng lỗi HTTP 500 của product stats overview đã được khắc phục theo các tiêu chí kiểm thử API; fallback currency, validation currency không hợp lệ và các khóa toast tiếng Việt đều hoạt động đúng. API đạt 8/8, nhưng toàn bộ local test suite chưa đạt do lỗi dữ liệu test, module thiếu và cấu hình test registry/runner.

## Cập nhật tiến độ lần chạy dynamic test mới

Đã chạy lại tập lệnh PowerShell dynamic tại workspace `26-4-3 copy 35`.

### Kết quả mới

- API dynamic: **8/8 PASS**.
- Currency mặc định được chọn động là `VND`.
- Stats có currency hợp lệ: HTTP `200`, đủ 5 field.
- Stats không truyền currency: HTTP `200`, đủ 5 field.
- Stats với currency `ZZZ`: HTTP `400`.
- Common translations: HTTP `200`, đủ 6 khóa toast locale `vi`.
- Backend suite: **PASS**, `test-backend-endpoints-phase3.js` đạt 8/8 và Phase 4 đạt 10 passing.
- Payment tag suite: **PASS**, cả hai test VNPay đều chạy thành công.
- Rollback suite: **FAIL**, còn 1 test file thất bại là `test-rollback-procedures.js`; `test-shadow-writes.js` kết thúc process thành công nhưng bên trong vẫn ghi nhận lỗi fixture `entityType=generic`.

### Nguyên nhân rollback còn thất bại

- Fixture `LiveTranslationCache` thiếu trường bắt buộc `originalText` tại `src/test/test-rollback-procedures.js:38` và `:224`.
- Test dùng `expect` nhưng chưa khai báo assertion library tại các dòng `193`, `202`, `213`, `291`, `356`.
- Test truyền object app không phải Express instance cho Supertest, gây `app.address is not a function` tại các dòng `249` và `260`.
- Thiếu module `TranslationAuditLog` tại `src/models/TranslationAuditLog`.
- Fixture Phase 4 tạo bản ghi trùng khóa `{ entityId: "rollback-test-product-123", targetLang: "en" }` tại dòng `322`.
- `test-shadow-writes.js` dùng `entityType: "generic"`, nhưng schema `UserContentTranslationCache` không cho phép enum này.
- Có cảnh báo port `5000` đang được sử dụng khi rollback test khởi tạo app/server phụ.

**Trạng thái cập nhật:** Product stats, currency fallback, i18n toast, backend suite và payment suite đã đạt. Chỉ còn rollback test cần chỉnh fixture, assertion import, app export và model dependency.

## Cập nhật kết quả dynamic test mới nhất

Đã chạy tập lệnh PowerShell dynamic hợp nhất tại workspace `26-4-3 copy 36` với `BaseUrl=http://localhost:5000`, `Lang=vi` và `-RunLocalSuites`.

### Kết quả đạt

- API dynamic: **8/8 PASS**.
- `GET /api/currencies?isActive=true`: HTTP `200`, chọn được currency mặc định `VND`.
- Stats với currency hợp lệ: HTTP `200`, đủ 5 field.
- Stats không truyền currency: HTTP `200`, đủ 5 field.
- Stats với currency `ZZZ`: HTTP `400`.
- Common translations: HTTP `200`, đủ 6 khóa toast locale `vi`.
- `npm run test:list`: **PASS**.
- `npm run test:simple`: **PASS**.
- Suite `backend`: **PASS**; Phase 3 đạt `8/8`, Phase 4 simplified đạt `10 passing`.
- Suite `orders` và `vnpay`: **PASS**.

### Các suite còn lỗi

- Suite `i18n`: 2 file lỗi do test import sai đường dẫn tương đối; một file khác ghi nhận HTTP `401` nhưng vẫn thoát với exit code `0`.
- Suite `products`: thiếu `ADMIN_TOKEN`; test Phase 4 cũ dùng cú pháp Jest (`test(...)`) nhưng chạy qua Mocha.
- Suite `rollback`: `15 passing`, `2 failing`; lỗi còn lại liên quan đến kiểm tra Git chưa clean và TTL index.

Các lỗi suite trên không làm thay đổi kết quả xác minh product stats, currency fallback hoặc translations. Script dynamic cũng đã chạy đúng sau khi sửa cú pháp PowerShell và cách truyền lệnh `node -e`.

**Trạng thái cập nhật mới nhất:** Product stats, fallback currency, validation currency, i18n toast, backend suite và payment suite đều đạt; các lỗi còn lại chỉ nằm trong test import, cấu hình môi trường hoặc điều kiện rollback.

## Cập nhật tiến độ kiểm tra mã nguồn mới nhất

Đã sửa các import tương đối sai trong nhóm script kiểm tra backend dưới `online-store-backend/src/test`, gồm `test-blueprint-3phase.js`, `check-db-state.js`, `check-db-brands.js`, `check-brands.js` và `check-products.js`. Các file đều đã vượt qua `node --check`.

Đã cài dependency backend theo `package.json` bằng `npm install --package-lock=false` để chạy test mà không tạo lockfile mới. `npm run test:list` đã chạy thành công và registry hiện nhận đúng các suite.

Kết quả chạy lại runtime hiện bị chặn trước khi vào assertion do môi trường thiếu `MONGO_URI`, JWT access secret và Cloudflare AI credentials. Đây là blocker cấu hình, không phải lỗi mới của endpoint stats hoặc các khóa dịch toast; không tự đặt giá trị giả cho các biến nhạy cảm.

**Trạng thái cập nhật:** Các lỗi import đã được xử lý; product stats và bản dịch vẫn giữ trạng thái đã xác minh đạt, còn kiểm thử runtime đầy đủ cần môi trường backend có đủ cấu hình hợp lệ.

## Cập nhật lần chạy PowerShell dynamic tại workspace `26-4-3 copy 37`

Đã chạy trực tiếp trong thư mục `online-store-backend` với:

- `BaseUrl=http://localhost:5000`
- `Lang=vi`
- Không tạo file mới

### Kết quả quan sát được

- Active currencies: **PASS**, HTTP `200`, chọn được currency động `VND`.
- Stats không truyền currency: **PASS**, HTTP `200`.
- Currency không hợp lệ `ZZZ`: **PASS**, HTTP `400`.
- Common translations: **PASS**, HTTP `200`.
- Stats với currency động: **FAIL trong script**, do biến `$currencyCode` được gán bên trong scriptblock truyền qua `& $Action`, sau đó không còn giá trị ở scope bên ngoài. Vì vậy request không được gửi với `currency=VND`.
- Kiểm tra 5 field stats: **FAIL phụ thuộc**, do `$statsWithCurrency` và `$statsFallback` cũng được gán trong child scope nên không được giữ lại.
- Kiểm tra 6 khóa toast: **FAIL trong script**, không phải kết luận thiếu bản dịch; biến `$translations` chịu cùng lỗi scope. Endpoint đã trả HTTP `200`.

### Phân tích

Lần chạy này đạt **4 PASS, 4 FAIL**. Bốn lỗi FAIL còn lại là lỗi truyền biến giữa `Test-Case` và các scriptblock con; không thay đổi kết luận trước đó rằng endpoint fallback stats, validation currency và endpoint translations đang phản hồi đúng HTTP.

Để hoàn tất kiểm tra, script cần lưu các biến dùng chung ở scope ngoài, ví dụ `$script:currencyCode`, `$script:statsWithCurrency`, `$script:statsFallback` và `$script:translations`, hoặc thay `& $Action` bằng cách thực thi scriptblock trong cùng scope phù hợp. Sau khi sửa scope, cần chạy lại để xác nhận đủ 8/8 kiểm tra.

**Trạng thái cập nhật:** API đã tiếp tục vượt qua các kiểm tra HTTP độc lập; bộ dynamic test chưa đạt 8/8 vì lỗi scope trong chính tập lệnh PowerShell.

## Kết quả xác minh sau khi sửa scope PowerShell

Đã chạy lại tập lệnh PowerShell dynamic hoàn chỉnh trực tiếp tại workspace `26-4-3 copy 37`, trong thư mục `online-store-backend`, với `BaseUrl=http://localhost:5000` và `Lang=vi`. Tập lệnh chỉ gọi API trong bộ nhớ và không tạo file mới.

Kết quả thực tế:

```text
Currency được chọn: VND
PASS  Active currencies trả HTTP 200
PASS  Stats với currency động trả HTTP 200
PASS  Stats với currency có đủ 5 trường
PASS  Stats không truyền currency trả HTTP 200
PASS  Stats fallback có đủ 5 trường
PASS  Currency không hợp lệ trả HTTP 400
PASS  Common translations trả HTTP 200
PASS  Có đủ 6 khóa toast tiếng Việt

Kết quả: 8 PASS, 0 FAIL
```

Các biến dùng chung của tập lệnh đã được lưu ở script scope để giữ giá trị giữa các test case. Kết quả xác nhận:

- Currency active được chọn động là `VND`.
- Stats với currency hợp lệ trả HTTP `200` và đủ 5 trường.
- Stats không truyền currency vẫn fallback thành công với HTTP `200` và đủ 5 trường.
- Currency không hợp lệ `ZZZ` trả HTTP `400`.
- Endpoint translations trả HTTP `200` và đủ 6 khóa toast tiếng Việt.

**Trạng thái cập nhật mới nhất:** Product stats, currency fallback, validation currency và common translations đã được xác minh đạt **8/8** bằng tập lệnh PowerShell dynamic không tạo file mới.
