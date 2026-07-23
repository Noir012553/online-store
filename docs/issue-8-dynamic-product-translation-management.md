# Issue 8 — Quản lý bản dịch sản phẩm động

## Mục tiêu

Cho phép admin quản lý dynamic translation theo sản phẩm và ngôn ngữ, gồm xem trạng thái, sửa thủ công, re-translate có xác nhận và không phải chạy seed toàn bộ.

## Route hiện tại

- `/admin/translationsDynamic`: giao diện dynamic translation sản phẩm.
- `/admin/translationsStatic`: giao diện static translation.
- `/admin/productsTranslationsAdmin`: redirect tới `/admin/translationsDynamic`.
- `/admin/translationsAdminTier1`: redirect tới `/admin/translationsStatic`.
- `/admin/translationsAdminTier2`: redirect tới `/admin/translationsAdminTier1`, sau đó tiếp tục tới `/admin/translationsStatic`.

Hai route tier cũ vẫn tồn tại để tương thích URL nhưng không còn render giao diện riêng.

## Đã có trong code hiện tại

### Giao diện dynamic

- Tải sản phẩm theo trang, tìm kiếm và locale giao diện.
- Chọn ngôn ngữ dịch.
- Tải trạng thái cho các sản phẩm đang hiển thị.
- Lọc `missing`, `pending`, `approved`, `needs_retranslate`, `rejected`.
- Sửa và lưu các trường `name`, `description`, `brand`, `features`, `specs`.
- Re-translate từng sản phẩm theo ngôn ngữ đang chọn.
- Có hộp thoại xác nhận, khóa thao tác trùng và timeout frontend 30 giây.
- Giữ các trường thủ công qua `manualFields`.

### Backend

Các endpoint admin hiện có:

- `GET /api/translations/admin/products/status`
- `GET /api/translations/admin/products/:id`
- `PUT /api/translations/admin/products/:id`
- `POST /api/translations/admin/products/:id/retranslate`
- `POST /api/translations/admin/retranslate-dynamic` — endpoint batch legacy.

Endpoint theo sản phẩm ghi kết quả vào `ProductCatalogTranslationCache`. Khi chưa có dữ liệu cache này, controller vẫn fallback sang `LiveTranslationCache`.

### Import/export

- Export đã truyền locale đúng vị trí.
- Dữ liệu export giữ `productId`, `baseCurrencyCode` và feature key.
- `featureLabels` chỉ là nhãn đọc theo ngôn ngữ, không thay thế feature key khi import.
- Import đã diff các trường có thể dịch và đánh dấu cache stale khi nội dung nguồn thay đổi.
- Translation thủ công được giữ nếu field thay đổi nằm trong `manualFields`.

## Trạng thái thực tế cần lưu ý

- Hệ thống chưa hoàn toàn dùng một cache duy nhất: status và dữ liệu sản phẩm có fallback giữa `ProductCatalogTranslationCache` và `LiveTranslationCache`.
- API status nhận `productIds` dạng danh sách phân tách bằng dấu phẩy, tối đa 50 ID mỗi request. UI hiện chỉ gửi các sản phẩm của trang đang xem.
- Endpoint batch legacy vẫn chạy qua `retranslateSeeder`, nhận `entityType` và `limit` từ 1 đến 500; đây không phải contract re-translate theo product/language/field của giao diện mới.
- Import vẫn fallback tìm sản phẩm bằng `name + brand` nếu file không có `productId`; khóa này không đủ an toàn cho đồng bộ translation lâu dài.
- `Product.featuresTranslations` vẫn cần được đối chiếu với nguồn cache hiển thị để tránh lưu một nguồn thủ công nhưng API không dùng.

## Tiêu chí nghiệm thu

- Status hiển thị đúng theo sản phẩm/ngôn ngữ, kể cả trường hợp chỉ có dữ liệu legacy.
- Re-translate theo sản phẩm không xử lý nhầm entity khác.
- Không ghi đè field thủ công ngoài xác nhận rõ ràng.
- Kết quả xử lý được đọc từ đúng nguồn mà API sản phẩm sử dụng.
- Import/export nhận diện đúng sản phẩm và chỉ đánh dấu stale field thực sự thay đổi.
- Batch có giới hạn, tiến trình và chống chạy trùng.

## Trạng thái tài liệu

Giao diện và endpoint theo sản phẩm đã được triển khai. Phần còn lại là chuẩn hóa hybrid cache, contract batch/import và kiểm thử đầu cuối; các mục này chưa được xem là hoàn tất chỉ dựa trên kiểm tra tĩnh.

Xem `docs/issue-9-translation-management-details.md` để biết chi tiết kỹ thuật.
