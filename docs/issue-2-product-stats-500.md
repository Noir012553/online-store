## Trạng thái

- **Loại:** Đã xác minh nguyên nhân HTTP 500 và phát hiện các thông báo toast/Sonner chưa đi qua static i18n; chưa triển khai biện pháp sửa
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

## Kết luận

- **Đã xác minh:** frontend gọi stats overview không truyền `currency`.
- **Đã xác minh:** backend bắt buộc `currency`, ném lỗi `A reporting currency is required` và trả về HTTP 500.
- **Đã xác minh:** một số toast trong `useCloudinaryUpload.ts` đang dùng chuỗi tiếng Anh tĩnh, không qua static i18n.
- **Đã xác minh:** `api.ts` gọi `handleApiError` không có hàm `t`, làm mất bản dịch cho các toast lỗi API.
- **Chưa thực hiện:** chưa sửa code, chưa sửa dữ liệu và chưa chạy lại test sau sửa.

**Trạng thái cuối:** Đã phân tích và ghi nhận đầy đủ lỗi HTTP 500 của product stats overview cùng vấn đề toast/Sonner chưa sử dụng static translation; đang chờ yêu cầu triển khai sửa chữa.
