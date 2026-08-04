# Issue 9: Chi tiết quản lý bản dịch

## Luồng hiện tại

- Frontend tải sản phẩm theo trang và status theo tối đa 50 product ID mỗi request.
- Admin save qua endpoint theo product/language.
- Re-translate bỏ qua các field nằm trong `manualFields`.
- Cache mới `ProductCatalogTranslationCache` được ưu tiên; `LiveTranslationCache` là fallback.
- Batch legacy nhận `lang`, `limit`, `entityType`, không phải contract batch chọn lọc của UI mới.

## Đã xác minh

- Ranh giới giữa cache mới và cache legacy đã rõ.
- `manualFields` được bảo toàn khi save và re-translate.
- Import có `productId` sẽ lookup theo ID.
- Field machine-managed bị đánh dấu stale khi source thay đổi.
- Fallback `name + brand` đã được xác định là không ổn định.

## Còn lại

- Chưa có migration hoặc quy tắc kết thúc hybrid cache.
- Chưa có contract batch mới gồm product, language, field, force/manual và idempotency.
- Chế độ import `update` đã bắt buộc `productId` hợp lệ; chưa có endpoint export/import riêng cho cache bản dịch để hoàn tất round-trip.
- Cần xác minh save rồi đọc lại qua API sản phẩm và giao diện.
- Cần xác minh đầy đủ manual/machine-managed field, batch legacy và import/export.
- Hai trang admin override đã dùng đúng route; backend nhận định danh entity và resolve sang `hashKey` bằng record cache ở server, tránh ánh xạ không an toàn ở client.
- Batch override trả về `result.totalProcessed`, `successCount`, `failureCount`, `failures` và ghi audit với action `batch_update`.

## Contract đã triển khai

- **API entity-aware:** backend nhận `entityId`, `entityType`, `targetLang`, nội dung và lý do; backend tự tìm record cache, kiểm tra record tồn tại rồi cập nhật bằng `hashKey` thật và ghi audit.
- Frontend không tạo `hashKey`, gọi đúng route `/api/translations/admin/manual-override` và `/api/translations/admin/batch-manual-override`.
- Payload canonical dùng `translatedText`/`updates`; payload entity-aware cũ `newValue`/`overrides` vẫn được normalize tại backend trong lúc chuyển đổi.

Không đổi URL riêng lẻ hoặc tạo `hashKey` từ dữ liệu nhập vì có thể cập nhật nhầm bản dịch. Các bước còn lại là kiểm thử save → read API sản phẩm, re-translate và hoàn thiện idempotency cho batch.

## Tiêu chí xác minh contract

- Single override chỉ cập nhật đúng bản dịch, field và ngôn ngữ được cấp quyền.
- Batch retry bằng cùng `idempotencyKey` không tạo bản ghi hoặc thay đổi lặp.
- Save được phản ánh khi đọc qua API sản phẩm, đồng thời `manualFields` không bị re-translate ghi đè.
- Import `update` dùng `productId` từ export; bản ghi không có định danh ổn định phải bị từ chối thay vì fallback theo `name + brand`.

## Phạm vi bàn giao

Issue này chỉ theo dõi contract manual/batch override entity-aware. Cache migration, định nghĩa nguồn dữ liệu chuẩn, idempotency cho batch xử lý cache và export/import round-trip thuộc `issue-8`; không mở lại ở đây trừ khi contract override bị vi phạm.

## Trạng thái

**Đã hoàn tất phần contract override.** Backend hiện resolve entity-aware ở server, frontend dùng đúng route, batch có response thống nhất và audit log. Các hạng mục cache migration, batch/import round-trip và kiểm thử giao diện vẫn được theo dõi riêng trong `issue-8`.
