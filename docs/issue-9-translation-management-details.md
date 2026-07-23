# Issue 9 — Đối chiếu kỹ thuật và tối ưu translation

> Tài liệu này phản ánh code hiện tại. Các mục “cần chốt” hoặc “đề xuất” chưa được xem là tính năng đã triển khai.

## 1. Luồng hiện tại

### Frontend

`online-store-frontend/src/pages/admin/translationsDynamic.tsx` hiện:

- Tải sản phẩm từ `GET /api/products` theo trang và keyword.
- Tải status bằng `GET /api/translations/admin/products/status?lang=...&productIds=...`.
- Gửi tối đa số ID của trang hiện tại; backend giới hạn 1–50 ID/request.
- Lưu thủ công bằng `PUT /api/translations/admin/products/:id?lang=...`.
- Re-translate bằng `POST /api/translations/admin/products/:id/retranslate` với `{ lang }`.
- Dùng `AbortController` với timeout 30 giây, hiển thị lỗi và mở khóa nút sau khi request kết thúc.

Tìm kiếm và phân trang sản phẩm là độc lập với status: status filter chỉ lọc mảng sản phẩm của trang hiện tại, không phải toàn bộ catalog.

### Backend theo sản phẩm

Các route được bảo vệ bởi `protect` và `admin`:

- `GET /admin/products/status`
- `GET /admin/products/:id`
- `PUT /admin/products/:id`
- `POST /admin/products/:id/retranslate`

Controller kiểm tra product ID, ngôn ngữ active và không cho dịch lại source language. Re-translate gọi AI cho các field không nằm trong `manualFields`, validate kết quả, rồi upsert vào `ProductCatalogTranslationCache` với `qualityStatus`, `qualityScore`, `validationErrors`, `manualFields` và thời gian cập nhật.

### Endpoint batch legacy

`POST /api/translations/admin/retranslate-dynamic` vẫn tồn tại và khác contract endpoint theo sản phẩm:

- Nhận `lang`, `limit` và `entityType`.
- `entityType` phải thuộc danh sách dynamic entity hợp lệ.
- `limit` từ 1 đến 500.
- Chạy `retranslateSeeder` trên `LiveTranslationCache`.
- Trả thống kê aggregate và kết quả theo record.

Endpoint này không nhận `productIds`, `fields` hoặc `idempotencyKey`, vì vậy không nên dùng làm backend cho nút re-translate sản phẩm mới.

## 2. Hybrid cache hiện tại

### Cache mới

`ProductCatalogTranslationCache` là nguồn chính cho dữ liệu translation sản phẩm và nơi endpoint re-translate theo sản phẩm ghi kết quả.

### Cache legacy

`LiveTranslationCache` vẫn được dùng trong các trường hợp:

- Fallback khi không tìm thấy record cache mới.
- Tính status legacy khi status endpoint không có record cache mới.
- Endpoint batch legacy và một số seeder/utility cũ.

Status endpoint ưu tiên record cache mới; nếu không có, nó suy ra status từ các record legacy. Vì vậy code hiện tại là hybrid, chưa phải mô hình một nguồn dữ liệu tuyệt đối.

### Việc cần chốt

Chọn một trong hai hướng:

1. Chuẩn hóa `ProductCatalogTranslationCache` thành nguồn hiển thị và trạng thái duy nhất, có migration/fallback kết thúc rõ ràng.
2. Giữ hybrid nhưng quy định rõ thứ tự ưu tiên, mapping field, trạng thái và thời hạn fallback.

Không nên để cache xử lý và cache hiển thị có thể đưa ra hai kết quả khác nhau mà không có quy tắc reconciliation.

## 3. Bản dịch thủ công

Luồng save theo product lưu các field được gửi vào `manualFields` và đặt `qualityStatus: approved`. Luồng re-translate bỏ qua các field nằm trong danh sách này.

`Product.featuresTranslations` vẫn là nguồn dữ liệu riêng trong model Product, nhưng API translation hiện đã merge nguồn này vào response. `getProductTranslationData()` lấy `features` và `featuresTranslations` từ Product rồi dùng `mergeFeatureTranslations()` cho cả cache mới và cache legacy; bản dịch lưu trong Product được ưu tiên theo từng vị trí, còn giá trị từ cache được dùng khi chưa có bản dịch thủ công.

**Trạng thái:** Đã xác minh quy tắc merge hiện tại trong `online-store-backend/src/controllers/translationController.js:727-773`. Vẫn cần kiểm thử đầu cuối để xác nhận kết quả sau save/re-translate xuất hiện nhất quán ở API sản phẩm và giao diện.

Không cần tiếp tục coi việc “API có merge `featuresTranslations` hay không” là một mục chưa xác minh.

## 4. Import/export hiện tại

### Đã có

- Export truyền locale đúng và có thể bổ sung `featureLabels` theo locale.
- Export giữ `productId`, `baseCurrencyCode` và feature key.
- Import validate `productId` nếu có.
- Khi có `productId`, import lookup theo `_id`.
- Khi thiếu `productId`, import vẫn fallback lookup theo `{ name, brand, isDeleted: false }`.
- Import so sánh `name`, `description`, `brand`, `features`, `specs`.
- Cache mới và cache legacy của field machine-managed có thể được đánh dấu `needs_retranslate` với lỗi `source_content_changed`.
- Field nằm trong `manualFields` được giữ lại.

### Rủi ro còn lại

Fallback `name + brand` không phải định danh ổn định: đổi tên hoặc brand có thể làm import tạo product mới, để translation cache cũ gắn với product ID cũ.

**Tối ưu đề xuất:** Với các file dùng cho round-trip hoặc migration, bắt buộc `productId` hoặc SKU bất biến; chỉ cho phép fallback tên/brand ở chế độ vận hành có cảnh báo rõ.

Export có giới hạn cần tiếp tục trả đủ thông tin để phân biệt tổng khớp và tổng đã xuất, tránh hiểu file bị cắt là backup đầy đủ.

## 5. Contract re-translate tối ưu đề xuất

Contract mới cho batch nên có dạng:

```json
{
  "productIds": ["..."],
  "languages": ["en"],
  "fields": ["name", "description"],
  "forceManual": false,
  "idempotencyKey": "..."
}
```

Quy tắc:

- Phạm vi product và language phải xác định trước khi áp dụng limit.
- Field phải giới hạn phần cần xử lý.
- Không ghi đè manual nếu `forceManual` không được xác nhận.
- Kết quả phải phân biệt `success`, `skipped`, `failed` theo product/language/field.
- Batch lớn phải chạy nền, trả `jobId`, có progress, retry và partial failure.
- Backend cần chống job trùng; khóa nút ở frontend không đủ.

Contract này là mục tiêu tối ưu, chưa phải contract của endpoint legacy hiện tại.

## 6. Kiểm thử cần thực hiện

### Theo sản phẩm

- Status với cache mới, chỉ cache legacy và không có cache.
- Status với hơn 50 product IDs; xác minh UI phân trang không bỏ sót cách hiểu trạng thái.
- Save từng field, save nhiều field và bảo toàn `manualFields`.
- Re-translate chỉ xử lý field không thủ công.
- AI validation trả `approved`, `pending`, `needs_retranslate` và lỗi.
- Timeout frontend không tạo trạng thái loading vô hạn.
- Kết quả sau re-translate xuất hiện đúng trong API sản phẩm.

### Batch legacy

- Reject entityType thiếu/sai.
- Không xử lý nhầm entity ngoài phạm vi caller mong muốn.
- Kiểm tra runtime seeder, MongoDB và Cloudflare AI.
- Xác minh dữ liệu batch có được đồng bộ sang cache mới hay không; hiện contract không bảo đảm điều này.

### Import/export

- Export JSON/CSV rồi import nguyên trạng.
- Có và không có `productId`.
- Đổi field dịch được tạo đúng stale record.
- Đổi field không dịch được không tạo re-translate.
- Manual translation không bị xóa/ghi đè.
- Đổi name/brand với productId giữ nguyên đúng product.
- File vượt giới hạn export báo rõ dữ liệu bị cắt.

### Production 422

Chưa kết luận nguyên nhân chỉ từ source. Cần thu thập:

- Request URL đầy đủ.
- Request payload `{ lang }` và product ID trên URL.
- Response body nguyên văn.
- Commit/build đang chạy production.
- Record tương ứng trong cả hai cache sau request.

## Trạng thái tài liệu

**Trạng thái hiện tại: Chưa hoàn tất.**

Tài liệu đã được cập nhật theo code hiện tại: route redirect, status cap 50, timeout frontend, hybrid cache, endpoint batch legacy và fallback import đều được ghi nhận riêng. Các đề xuất về một nguồn cache, contract batch mới và job nền vẫn là phần cần triển khai sau khi chốt yêu cầu.

## Cập nhật đối chiếu mã nguồn hiện tại

Đã rà soát lại tại commit `dcdf4ab`, không thay đổi mã nguồn.

- Luồng frontend vẫn chỉ lấy status cho sản phẩm của trang hiện tại và lọc trên tập kết quả đó tại `online-store-frontend/src/pages/admin/translationsDynamic.tsx:111-138,183-185`; vì vậy status filter chưa đại diện cho toàn bộ catalog.
- `getProductTranslationData()` vẫn trả cache catalog nếu có, nếu không mới dựng dữ liệu từ `LiveTranslationCache`; `featuresTranslations` của Product vẫn được merge theo field tại `online-store-backend/src/controllers/translationController.js:752-773`.
- Status endpoint vẫn đọc đồng thời hai cache và chỉ fallback legacy khi không có catalog record tại `online-store-backend/src/controllers/translationController.js:804-855`.
- Một số response của translation controller vẫn dùng literal tiếng Anh, ví dụ validation ID/ngôn ngữ và lỗi lấy trạng thái tại `online-store-backend/src/controllers/translationController.js:776-801,859-861`.

**Trạng thái cập nhật:** Mô tả hybrid cache và các rủi ro contract trong tài liệu vẫn đúng. Chưa có bằng chứng kiểm thử tự động cho round-trip import/export translation hoặc kiểm thử đầu-cuối xác nhận save/re-translate hiển thị nhất quán qua API sản phẩm và giao diện; các hạng mục này vẫn cần môi trường runtime phù hợp.

## Đối chiếu repository hiện tại

Đã đối chiếu tại commit `00dd0ee`:

- Luồng save/re-translate vẫn bảo toàn `manualFields`; import vẫn đánh dấu stale các field machine-managed khi source thay đổi.
- Import vẫn fallback theo `name + brand` khi thiếu `productId`, nên rủi ro định danh không ổn định vẫn còn.
- Cơ chế đọc/status vẫn là hybrid cache; chưa có migration hoặc quy tắc kết thúc fallback được triển khai trong source.

**Trạng thái hiện tại:** Chưa hoàn tất. Cần chốt nguồn cache, contract batch/import và chạy kiểm thử round-trip cùng save/re-translate trong môi trường runtime phù hợp.
