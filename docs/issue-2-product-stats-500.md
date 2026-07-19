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
