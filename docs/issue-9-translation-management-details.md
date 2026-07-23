# Issue 9 — Chi tiết tối ưu quản lý translation

> Tài liệu kỹ thuật chi tiết cho issue-8. Chỉ ghi nhận hiện trạng, contract và kế hoạch; không thay thế tài liệu API chính thức.

## 1. Hiện trạng đã xác nhận

### Dynamic translation

- Trang chính: `/admin/translationsDynamic`.
- Trạng thái được tính theo sản phẩm và ngôn ngữ.
- Re-translate sản phẩm gọi endpoint theo `productId` và `lang`.
- Kết quả hiển thị của sản phẩm đi qua `ProductCatalogTranslationCache`.
- `LiveTranslationCache` vẫn chứa cơ chế quality/re-translate legacy và có thể tạo trạng thái không đồng nhất nếu được dùng độc lập.

### Static translation và route

- Static translation phục vụ tại `/admin/translationsStatic`.
- Các route tier cũ chuyển hướng, không còn render hai giao diện trùng chức năng.
- Tên hiển thị dùng “Dịch sản phẩm”, không dùng “Dịch Features”.

### Import/export

- Export sản phẩm nguồn giữ `productId`, `baseCurrencyCode`, feature key và `featureLabels` theo ngôn ngữ yêu cầu.
- `featureLabels` chỉ phục vụ đọc/đối soát, không thay thế feature key khi import.
- Translation dynamic và bản dịch thủ công chưa phải nội dung của export sản phẩm nguồn.
- Import cần được đối chiếu bằng khóa ổn định, không dùng `name + brand` làm định danh lâu dài.

## 2. Blocker cần xử lý trước khi mở rộng

### A. Hai nguồn cache chưa có contract hợp nhất

`LiveTranslationCache` có `qualityStatus`, version và thông tin re-translate; `ProductCatalogTranslationCache` là nguồn API sản phẩm sử dụng nhưng không có đầy đủ metadata chất lượng tương ứng.

**Rủi ro:** AI xử lý thành công nhưng giao diện vẫn hiển thị bản dịch cũ hoặc `missing`.

**Quyết định cần chốt:** Chọn `ProductCatalogTranslationCache` làm nguồn hiển thị chuẩn và bổ sung metadata/provenance cần thiết, hoặc xây mapping đồng bộ bắt buộc theo `productId + language + field`. Không để hai nguồn tự quyết định trạng thái riêng.

### B. Contract re-translate phải giới hạn phạm vi

Endpoint legacy trước đây có thể lọc theo `lang`, `limit` và tùy chọn `entityType`, trong khi cache chứa nhiều loại entity.

**Contract đề xuất:**

```json
{
  "productIds": ["..."],
  "languages": ["en"],
  "fields": ["name", "description"],
  "forceManual": false,
  "idempotencyKey": "..."
}
```

- `productIds`, `languages` là phạm vi bắt buộc cho batch.
- `fields` giới hạn phần cần dịch; mặc định không được hiểu là mọi field nếu chưa chốt rõ.
- `forceManual` mặc định `false`; chỉ bật với xác nhận riêng.
- `limit` áp dụng sau filter và phải có giới hạn an toàn.
- Kết quả cần trả theo từng sản phẩm/ngôn ngữ/trường: `success`, `skipped`, `failed` và lỗi.

### C. Bản dịch thủ công chưa có nguồn hiển thị duy nhất

`Product.featuresTranslations` tồn tại riêng, trong khi helper overlay sản phẩm đọc các field từ `ProductCatalogTranslationCache` và có nguy cơ bỏ qua `featuresTranslations`.

**Quyết định cần chốt:** Hoặc API merge bản dịch thủ công với quy tắc ưu tiên rõ ràng, hoặc chuyển dữ liệu thủ công vào nguồn cache chuẩn với provenance `manual`. Không duy trì hai nguồn độc lập.

### D. Import chưa gắn với vòng đời translation

Import phải xác định sản phẩm bằng `productId` hoặc SKU bất biến trước khi so sánh dữ liệu. Sau đó:

1. So sánh các field có thể dịch.
2. Nếu không đổi field dịch được, không tạo job.
3. Nếu có đổi, chỉ đánh dấu translation AI liên quan là stale/pending.
4. Giữ nguyên translation `manual`.
5. Trả về danh sách product/language/field bị ảnh hưởng hoặc `jobId`.

### E. Batch đồng bộ không phù hợp với latency AI

AI có timeout và retry nhiều lần; xử lý tuần tự batch lớn có thể kéo dài nhiều phút. Không nên giữ request HTTP đồng bộ cho toàn bộ batch.

**Mô hình đề xuất:** Request tạo job trả `jobId` nhanh; worker xử lý theo batch nhỏ; API status trả tiến trình, thành công, bỏ qua, thất bại và retry. Backend phải chống job trùng; chỉ khóa nút ở frontend là chưa đủ.

## 3. Export/import cần giữ đúng ranh giới

### Export sản phẩm nguồn

Mục đích là chỉnh sửa hàng loạt và round-trip dữ liệu `Product`. JSON/CSV phải:

- Có đầy đủ field bắt buộc của import.
- Có `productId` hoặc khóa ổn định.
- Có `baseCurrencyCode`.
- Giữ feature key; `featureLabels` chỉ là metadata đọc.
- Báo rõ `matchedTotal`, `exportedTotal` và `hasMore` nếu export có giới hạn.

Không quảng bá file này là backup đầy đủ translation.

### Backup/migration đa ngôn ngữ

Nếu phát sinh nhu cầu chuyển dữ liệu giữa môi trường, tạo định dạng JSON riêng có:

- `schemaVersion`.
- `productId`, language và field.
- Nội dung bản dịch.
- `source`: `manual` hoặc `machine`.
- Quality status, version và thời điểm cập nhật.

Không cố nhét metadata translation vào CSV vận hành.

## 4. Các lỗi cần xác minh bằng kiểm thử thật

- Endpoint re-translate theo sản phẩm với MongoDB và dịch vụ AI.
- Route legacy batch không xử lý nhầm category, review hoặc generic.
- Import không còn lỗi runtime do thiếu `getCategoryText`.
- JSON/CSV export rồi import nguyên trạng thành công.
- Đổi tên/brand qua import vẫn cập nhật đúng product nhờ khóa ổn định.
- Thay đổi field dịch được tạo đúng stale record/job.
- Thay đổi field không dịch được không tạo job.
- Bản dịch thủ công không bị xóa hoặc ghi đè.
- Kết quả re-translate được API sản phẩm đọc từ đúng cache.
- Production HTTP 422: cần thu thập Request URL, payload, response body và commit/build đang chạy trước khi kết luận nguyên nhân.

## 5. Thứ tự triển khai tối ưu

1. Chốt schema và nguồn dữ liệu translation chuẩn.
2. Chốt quy tắc ưu tiên `manual`/`machine`.
3. Chốt contract re-translate có phạm vi product/language/field.
4. Sửa import để diff field và tạo stale/job đúng phạm vi.
5. Xây job nền có idempotency, progress, retry và partial failure.
6. Bổ sung kiểm thử tích hợp backend và round-trip export/import.
7. Sau khi backend ổn định, hoàn thiện UI filter, trạng thái, cảnh báo và refresh.
8. Đo p50/p95 cho một bản ghi và batch nhỏ trước khi đặt SLA.

## 6. Tiêu chí nghiệm thu bổ sung

- Không có trạng thái mâu thuẫn giữa cache dùng để xử lý và cache dùng để hiển thị.
- Re-translate chỉ xử lý đúng product/language/field được chọn.
- Request đơn lẻ có timeout và lỗi có thể thử lại; không có spinner vô hạn.
- Batch trả tiến trình và phân biệt thành công, bỏ qua, thất bại.
- Import/export round-trip không thiếu field bắt buộc.
- Import không tạo re-translate cho thay đổi ngoài nội dung dịch.
- Translation thủ công được bảo toàn trong import và re-translate tự động.
- Không chạy seed toàn bộ như điều kiện bắt buộc của thao tác quản trị.

## Trạng thái tài liệu

Đã hợp nhất các phát hiện cũ thành các nhóm quyết định: nguồn dữ liệu, contract re-translate, provenance bản dịch thủ công, import/export và job batch. Chưa thay đổi mã nguồn trong tài liệu này; bước tiếp theo là xác minh contract bằng kiểm thử tích hợp trước khi tối ưu thêm giao diện.
