# Issue 8 — Quản lý bản dịch sản phẩm động

## Mục tiêu

Hoàn thiện luồng quản trị dynamic translation để admin có thể:

- Xem trạng thái bản dịch theo `productId` và ngôn ngữ.
- Phân biệt bản dịch thiếu, đang xử lý, đạt yêu cầu, cần dịch lại và lỗi.
- Sửa bản dịch thủ công mà không bị AI ghi đè ngoài chủ đích.
- Dịch lại đúng sản phẩm và ngôn ngữ, có xác nhận và cập nhật trạng thái.
- Không phải chạy seed lại toàn bộ dữ liệu.

## Phạm vi giao diện

- `/admin/translationsDynamic`: quản lý dynamic translation của sản phẩm.
- `/admin/translationsStatic`: quản lý static translation.
- `/admin/productsTranslationsAdmin`: route legacy chuyển hướng về dynamic translation.
- `/admin/translationsAdminTier1`: route legacy chuyển hướng về static translation.
- `/admin/translationsAdminTier2`: route legacy chuyển hướng về static translation.

Không duy trì nhiều giao diện có cùng mục đích quản lý translation.

## Đã triển khai

- Trang dynamic hiển thị trạng thái theo sản phẩm và ngôn ngữ.
- Có bộ lọc `missing`, `pending`, `approved`, `needs_retranslate` và `rejected`.
- Re-translate theo từng `productId` và `lang`, có xác nhận trước khi chạy.
- Bảo toàn các trường chỉnh sửa thủ công qua `manualFields`.
- Kết quả re-translate được ghi vào `ProductCatalogTranslationCache`, là nguồn API sản phẩm đang sử dụng.
- Đổi tên hiển thị từ “Dịch Features” thành “Dịch sản phẩm”.
- Route legacy không còn render giao diện trùng lặp.
- Endpoint batch legacy yêu cầu `entityType` hợp lệ, không còn mặc định xử lý mọi loại entity.
- Export đã truyền đúng `locale`, giữ `productId`, `baseCurrencyCode`, feature key và bổ sung `featureLabels` chỉ để hiển thị.

## Các quyết định tối ưu cần giữ

1. **Một nguồn dữ liệu chuẩn**
   Trạng thái, bản dịch hiển thị và kết quả re-translate phải có mapping rõ ràng theo `productId`, ngôn ngữ và trường. Không để `LiveTranslationCache` và `ProductCatalogTranslationCache` tạo ra hai trạng thái mâu thuẫn.

2. **Re-translate có phạm vi bắt buộc**
   Contract cần xác định rõ sản phẩm, ngôn ngữ và trường cần xử lý. `limit` chỉ là giới hạn an toàn sau khi đã lọc đúng phạm vi, không thay thế cho filter.

3. **Bản dịch thủ công luôn được ưu tiên**
   Phải phân biệt `manual` và `machine`; re-translate tự động chỉ xử lý dữ liệu AI stale. Muốn ghi đè bản dịch thủ công phải có lựa chọn và xác nhận riêng.

4. **Import chỉ kích hoạt dịch lại khi cần**
   Chỉ các trường có nội dung cần dịch (`name`, `description`, `brand`, `features`, `specs`) mới làm bản dịch stale. Thay đổi giá, tồn kho, ảnh, rating hoặc cờ hiển thị không tạo job dịch lại.

5. **Tách export nguồn và backup translation**
   Export sản phẩm dùng cho chỉnh sửa hàng loạt và round-trip dữ liệu nguồn. Backup/migration đa ngôn ngữ, nếu cần, phải là JSON có schema version riêng; không mở rộng CSV vận hành một cách mơ hồ.

## Việc còn lại theo thứ tự ưu tiên

1. Chốt nguồn dữ liệu chuẩn và quy tắc ưu tiên bản dịch thủ công.
2. Hoàn thiện contract re-translate theo sản phẩm/ngôn ngữ/trường, giới hạn batch và idempotency.
3. Xác minh endpoint theo sản phẩm với MongoDB và dịch vụ AI.
4. Thiết kế job nền cho batch, gồm `jobId`, tiến trình, retry và kết quả từng bản ghi.
5. Hoàn thiện import/export với khóa định danh ổn định và invalidate translation theo field diff.
6. Xác định cách `featuresTranslations` được API hiển thị; không duy trì hai nguồn độc lập.
7. Chạy build frontend và kiểm thử round-trip JSON/CSV bằng endpoint thật.
8. Điều tra lỗi HTTP 422 bằng request URL, payload, response body và commit/build production.

## Tiêu chí nghiệm thu

- Admin xem đúng trạng thái theo sản phẩm và ngôn ngữ.
- Re-translate không tác động ngoài phạm vi đã chọn và không ghi đè bản dịch thủ công.
- API sản phẩm hiển thị ngay kết quả từ đúng nguồn cache sau khi xử lý.
- Batch không giữ request HTTP quá lâu, có tiến trình và không tạo job trùng.
- Import/export round-trip thành công và nhận diện sản phẩm bằng khóa ổn định.
- Static translation, quyền admin và các luồng sản phẩm khác không bị thay đổi.

## Trạng thái

Nền tảng frontend/backend và route mới đã có. Phần cần ưu tiên tiếp theo là chốt contract dữ liệu, xác minh tích hợp đầu cuối và thiết kế job batch; chưa nên mở rộng UI trước khi các điểm này ổn định.

Xem `docs/issue-9-translation-management-details.md` để biết phân tích kỹ thuật và kế hoạch kiểm thử chi tiết.
