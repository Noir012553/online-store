# Issue 8 — Quản lý dynamic translation sản phẩm

## Mục tiêu

Hoàn thiện khu vực quản trị bản dịch sản phẩm để admin có thể:

- Xem trạng thái bản dịch theo sản phẩm và ngôn ngữ.
- Phân biệt bản dịch chưa có, đang chờ, đạt yêu cầu, cần dịch lại hoặc bị lỗi.
- Chỉnh sửa bản dịch thủ công mà không bị re-translate ghi đè.
- Dịch lại một sản phẩm theo ngôn ngữ đã chọn, có xác nhận và cập nhật trạng thái sau thao tác.
- Không phải chạy seed lại toàn bộ dữ liệu.

## Phạm vi route

- Trang dịch sản phẩm: `/admin/translationsDynamic`.
- Route cũ `/admin/productsTranslationsAdmin`: chuyển hướng về trang dịch sản phẩm.
- Trang dịch tĩnh: `/admin/translationsStatic`.
- Route cũ `/admin/translationsAdminTier1`: chuyển hướng về trang dịch tĩnh.
- Route cũ `/admin/translationsAdminTier2`: chuyển hướng về Tầng 1, không còn giao diện trùng chức năng.

## Đã triển khai

- Bổ sung trạng thái translation theo `productId` và ngôn ngữ.
- Bổ sung lọc trạng thái trên giao diện quản trị sản phẩm.
- Bổ sung xác nhận trước khi re-translate.
- Re-translate sản phẩm gọi API theo product cụ thể và ngôn ngữ cụ thể.
- Bảo toàn các trường chỉnh sửa thủ công thông qua `manualFields`.
- Lưu bản dịch và kết quả re-translate vào `ProductCatalogTranslationCache`, là nguồn dữ liệu mà API sản phẩm sử dụng.
- Đổi tên hiển thị từ **Dịch Features** thành **Dịch sản phẩm**.
- Siết endpoint legacy `POST /api/translations/admin/retranslate-dynamic`: bắt buộc `entityType` hợp lệ, không còn mặc định xử lý mọi loại entity.
- Các phát hiện chi tiết, lịch sử rà soát và blocker được chuyển sang `docs/issue-9-translation-management-details.md`.

## Trạng thái hiện tại

Luồng quản trị sản phẩm đã có nền tảng hoạt động và các route cũ đã được chuyển hướng an toàn. Các thay đổi export/import liên quan cũng đã được ghi nhận và triển khai ở các phần phù hợp.

## Việc còn lại

1. Kiểm thử tích hợp endpoint re-translate với MongoDB và dịch vụ AI.
2. Chạy build frontend trong môi trường đã cài đầy đủ dependency.
3. Kiểm thử round-trip JSON/CSV bằng endpoint thực tế.
4. Xác định contract backup translation đa ngôn ngữ riêng với export sản phẩm nguồn.
5. Thiết kế job batch có phạm vi sản phẩm/ngôn ngữ/trường, tiến trình và idempotency nếu cần mở rộng batch.
6. Điều tra lỗi HTTP 422 trên production bằng request payload, response body và commit/build thực tế.

## Kiểm thử gần nhất

- Kiểm tra cú pháp `translationController.js`: đạt.
- `git diff --check`: đạt.
- Build frontend: chưa chạy được trong môi trường hiện tại vì thiếu dependency `next`.
- Kiểm thử tích hợp và import thực tế: chưa hoàn tất.

## Tài liệu chi tiết

Xem `docs/issue-9-translation-management-details.md` để xem toàn bộ phát hiện kỹ thuật, nguyên nhân, tác động, quyết định vận hành và lịch sử cập nhật.
