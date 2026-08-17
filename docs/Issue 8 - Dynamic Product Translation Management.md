# Issue 8: Quản lý dịch sản phẩm động

## Mục tiêu

Cho phép admin xem trạng thái, sửa bản dịch, re-translate theo sản phẩm/ngôn ngữ và import/export mà không cần chạy seed toàn bộ.

## Đã có

- UI tải sản phẩm theo trang, tìm kiếm, chọn ngôn ngữ và lọc trạng thái.
- Có thể sửa `name`, `description`, `brand`, `features`, `specs`.
- Có re-translate từng sản phẩm, xác nhận thao tác, chống request trùng và timeout 30 giây.
- Backend có status, get, save và re-translate theo product.
- `manualFields` được giữ khi re-translate.
- Import/export giữ `productId`, feature key và đánh dấu cache stale khi source thay đổi.

## Còn lại

- `ProductCatalogTranslationCache` là nguồn chuẩn cho bản dịch sản phẩm; `LiveTranslationCache` chỉ được đọc fallback trong giai đoạn đối soát.
- Migration chỉ tạo bản ghi còn thiếu bằng `$setOnInsert`, không ghi đè bản dịch thủ công hoặc bản ghi đã có trong cache mới.
- Chỉ dừng fallback sau khi đối soát đủ theo `entityId + targetLang`, gồm số lượng bản ghi, field và hash nội dung; khi đó mới được lên kế hoạch xóa legacy.
- Status chỉ tải cho các sản phẩm ở trang hiện tại, không phải toàn catalog.
- Đã có export/import cache sản phẩm theo `productIds`, `languages`, `fields` và `idempotencyKey`; cần xác minh round-trip với MongoDB.
- Chế độ import `update` bắt buộc `productId` hợp lệ ở cả request dữ liệu trực tiếp và tải tệp; không fallback theo `name + brand`. Chế độ `upsert` vẫn dùng cặp này để nhận diện bản ghi mới hoặc đã có.
- Cần xác minh sự nhất quán giữa save, re-translate, cache và API sản phẩm.
- Contract manual/batch override đã hoàn tất tại `issue-9`: backend resolve record và `hashKey` phía server, frontend gọi đúng route, batch response ổn định và có audit log.

## Phụ thuộc và thứ tự triển khai

Phần override entity-aware đã được hoàn tất tại `issue-9`; không tạo route hoặc contract override song song. Mọi bước dưới đây dùng contract đó làm nền.

1. Đã ghi nhận `ProductCatalogTranslationCache` là nguồn cache chính; fallback legacy chỉ tồn tại trong thời gian đối soát.
2. Chạy migration có thể lặp an toàn bằng `$setOnInsert`, đối soát số lượng/hash giữa hai cache và chỉ dừng fallback sau khi đối soát đạt yêu cầu.
3. Đã thêm export/import riêng cho cache bản dịch với `productId`, ngôn ngữ, field và `idempotencyKey`; import từ chối `productId` hoặc dữ liệu không hợp lệ.
4. Xác minh theo luồng save → đọc lại API sản phẩm → re-translate → export/import round-trip, gồm cả field manual và machine-managed.

Không thay đổi cache hoặc batch/import trước khi hoàn tất bước 1.

## Điều kiện mở khóa

Trước khi thay đổi cache, batch hoặc import, cần ghi nhận nguồn cache chính, quy tắc migration/fallback và điều kiện dừng legacy. Contract override đã được triển khai tại `issue-9`; các bước còn lại cần được xác minh theo thứ tự: save → đọc lại qua API sản phẩm → re-translate → export/import round-trip.

## Trạng thái

**Đang triển khai.** Đã chốt nguồn cache và sửa migration để không ghi đè dữ liệu hiện có; còn chạy migration/đối soát trên môi trường có MongoDB, batch/import round-trip và xác minh save/re-translate.
