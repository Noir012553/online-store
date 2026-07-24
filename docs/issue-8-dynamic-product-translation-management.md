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

**Trạng thái hiện tại: Chưa hoàn tất.**

Giao diện và endpoint theo sản phẩm đã được triển khai. Phần còn lại là chuẩn hóa hybrid cache, contract batch/import và kiểm thử đầu cuối; các mục này chưa được xem là hoàn tất chỉ dựa trên kiểm tra tĩnh.

Xem `docs/issue-9-translation-management-details.md` để biết chi tiết kỹ thuật.

## Cập nhật rà soát mã nguồn hiện tại

Đã đối chiếu lại mã nguồn tại commit `dcdf4ab`; không sửa mã nguồn trong lần rà soát này.

- Trang dynamic translation vẫn tải sản phẩm theo trang, lấy trạng thái theo danh sách sản phẩm đang hiển thị, lưu thủ công và re-translate từng sản phẩm; timeout frontend vẫn là 30 giây tại `online-store-frontend/src/pages/admin/translationsDynamic.tsx:46-231`.
- Endpoint status vẫn giới hạn từ 1 đến 50 product ID mỗi request và ưu tiên `ProductCatalogTranslationCache`, sau đó mới suy ra trạng thái từ `LiveTranslationCache` tại `online-store-backend/src/controllers/translationController.js:792-856`.
- Luồng đọc dữ liệu translation theo sản phẩm vẫn ưu tiên cache mới, fallback sang cache legacy và merge `Product.featuresTranslations` tại `online-store-backend/src/controllers/translationController.js:739-774`.
- Endpoint batch legacy vẫn có contract riêng theo `lang`, `limit` và `entityType`; chưa phải contract batch theo product/language/field của giao diện mới.

**Trạng thái cập nhật:** Tài liệu vẫn phù hợp với mã nguồn hiện tại. Hybrid cache, giới hạn status theo trang, contract batch legacy và kiểm thử đầu-cuối save/re-translate vẫn là các hạng mục chưa thể đánh dấu hoàn tất chỉ bằng rà soát tĩnh.

## Đối chiếu repository hiện tại

Đã đối chiếu tại commit `00dd0ee`: trang dynamic translation vẫn tải status theo tập sản phẩm của trang hiện tại, còn backend vẫn ưu tiên `ProductCatalogTranslationCache` và fallback `LiveTranslationCache`. Endpoint batch legacy vẫn nhận contract `lang`, `limit`, `entityType`, không phải contract batch theo product/language/field.

**Trạng thái hiện tại:** Chưa hoàn tất. Hybrid cache, contract batch mới và kiểm thử đầu-cuối vẫn là các hạng mục còn mở.

## Cập nhật đối chiếu repository hiện tại

Rà soát tĩnh hiện tại xác nhận trạng thái trong tài liệu vẫn đúng:

- Endpoint status vẫn ưu tiên `ProductCatalogTranslationCache` và chỉ fallback sang `LiveTranslationCache` khi cần.
- Giới hạn `productIds` từ 1 đến 50 và việc UI chỉ tải status cho trang sản phẩm hiện tại vẫn được giữ nguyên.
- Endpoint batch legacy vẫn dùng contract `lang`, `limit`, `entityType`; chưa có contract batch theo product, language và field của giao diện mới.

**Tiến độ cập nhật:** Không có thay đổi mã nguồn cho phép đóng issue. Cần chốt chiến lược hybrid cache, contract batch/import và chạy kiểm thử save/re-translate đầu-cuối trong môi trường backend hợp lệ.

## Cập nhật tiến độ hiện tại

Đợt cập nhật này chỉ ghi nhận tiến độ tài liệu sau khi đối chiếu frontend, backend và registry test; chưa thay đổi code và chưa đánh dấu issue hoàn tất.

### Đã xác minh

- [x] UI dynamic vẫn tải status theo sản phẩm của trang hiện tại, nên bộ lọc status chưa đại diện toàn bộ catalog.
- [x] `ProductCatalogTranslationCache` vẫn là nguồn ưu tiên; `LiveTranslationCache` vẫn là fallback cho dữ liệu/status legacy.
- [x] `manualFields` vẫn được giữ trong luồng save và được loại khỏi field re-translate mặc định.
- [x] Import/export vẫn giữ `productId` khi có, nhưng còn fallback `name + brand` khi thiếu định danh ổn định.
- [x] Batch legacy vẫn nhận `lang`, `limit`, `entityType`, chưa hỗ trợ contract theo product/language/field.

### Chưa triển khai

- Chưa có migration hoặc quy tắc kết thúc hybrid cache.
- Chưa có batch contract mới với `productIds`, `fields`, `idempotencyKey` và cơ chế job chống trùng.
- Chưa có bằng chứng runtime cho save/re-translate hiển thị nhất quán qua cache và API sản phẩm.

### Bước tiếp theo

1. Chốt nguồn dữ liệu ưu tiên và quy tắc reconciliation.
2. Chốt contract batch trước khi thay đổi endpoint legacy.
3. Bắt buộc định danh ổn định cho round-trip import/export khi phù hợp.
4. Chạy kiểm thử đầu-cuối trên database test riêng.

## Cập nhật tiến độ đối chiếu hiện tại

- **Trạng thái:** Chưa hoàn tất.
- **Đã xác nhận trong mã nguồn:** UI chỉ tải status cho sản phẩm của trang hiện tại; backend ưu tiên `ProductCatalogTranslationCache` và fallback `LiveTranslationCache`; `manualFields` vẫn được bảo toàn.
- **Còn triển khai:** Chốt chiến lược kết thúc hybrid cache, contract batch theo product/language/field và kiểm thử save/re-translate đầu-cuối trên môi trường backend hợp lệ.
