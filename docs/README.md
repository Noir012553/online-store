# Theo dõi vấn đề

# Theo dõi tài liệu kỹ thuật

Danh sách này phản ánh trạng thái triển khai đã được đối chiếu trong mã nguồn. Một hạng mục chỉ hoàn tất khi đáp ứng đầy đủ các bước xác minh nêu trong tài liệu liên quan.

## Tóm tắt hiện tại

- Các hạng mục responsive admin (`issue-5`) và native dropdown (`issue-6`) đã hoàn tất phần code; chỉ còn kiểm tra trực tiếp trên preview.
- `issue-8` đã có cache catalog chính, migration và import/export; vẫn cần chạy đối soát dữ liệu MongoDB, round-trip và chốt điều kiện gỡ legacy fallback.
- `issue-10` đã có contract lỗi `code`, `params`, `message` ở các boundary chính; vẫn cần rà soát payment/currency và kiểm thử xuyên locale.
- `issue-11` là luồng chuẩn cho mọi giá hiển thị: frontend gửi `lang`, `locale`, `currencyCode`, backend tính toán/quy đổi/format và trả cả field raw cùng `formatted*`; các consumer còn lại phải chuyển theo luồng này.
- Không được tự quy đổi, tính tổng hoặc format tiền ở frontend. Không fallback từ `formatted*` sang số raw, ghép số với `currencyCode` hoặc lấy format đầu tiên trong object. Thiếu `formatted*` là lỗi contract cần sửa ở API/consumer.
- Frontend vẫn quyết định layout, style, trạng thái UI và vị trí render; "frontend chỉ hiển thị" không cho phép frontend tạo lại chuỗi tiền hoặc nội dung động từ dữ liệu raw.
- Phạm vi áp dụng gồm product list/detail, search, cart, checkout, order history/success, payment, shipping, coupon và admin.
- `issue-14` đã có ownership claim, quota/concurrency và outbox/retry Cloudinary; avatar/review vẫn còn phụ thuộc local storage và cần kiểm thử vận hành.
- `issue-12` và `issue-13` đã xử lý phần lớn code authentication; cookie, JWT secrets và cấu hình nhiều instance vẫn cần xác minh khi triển khai.
- Vì vậy repository chưa thể đánh dấu hoàn tất cho đến khi chạy được dependency, MongoDB và kiểm tra preview/production.

## Đã hoàn thành

- `Issue 1 - Order 422.md` — Chuẩn hóa currency sản phẩm và checkout.
- `Issue 2 - Product Stats 500.md` — Fallback currency cho product stats và toast i18n.
- `Issue 4 - Redundant Tests and Scripts.md` — Sửa các script có wiring xác định được.
- `Issue 7 - Centralized Emoji Management.md` — Chuẩn hóa emoji UI và ký hiệu CLI trong phạm vi runtime.
- `Issue 9 - Translation Management Details.md` — Hoàn tất contract manual/batch override: resolver entity-aware phía server, response batch ổn định và audit log.
- `Issue 15 - Frontend Hooks State Optimization.md` — Hoàn thành các tối ưu hooks/state đã theo dõi.

## Đã triển khai, cần hoàn thiện hoặc xác minh

- `Issue 5 - Responsive Admin.md` — Đã triển khai responsive; cần kiểm tra các luồng admin ở desktop, tablet và mobile trên preview.
- `Issue 6 - Native Dropdown Responsive.md` — Đã chuyển sang dropdown native; cần kiểm tra nội dung dịch dài và luồng admin theo breakpoint trên preview.
- `Issue 8 - Dynamic Product Translation Management.md` — Đã có cache catalog chính, migration có đối soát, idempotent import, bulk write và re-translate; `translationController` vẫn fallback sang `LiveTranslationCache` khi cache mới thiếu dữ liệu. Cần chạy migration/đối soát, xác minh round-trip và chốt điều kiện gỡ fallback legacy.
- `Issue 10 - Internationalization Audit.md` — Các boundary lỗi chính đã theo contract `code`, `params`, `message`, middleware chung không còn trả raw message mặc định; payment/currency và kiểm thử xuyên locale vẫn cần xác minh.
- `Issue 11 - Backend Format Currency.md` — Backend đã có formatter và các consumer chính dùng field `formatted*`; chưa thấy hook `useCurrencyConversion` cũ trong source hiện tại, nhưng vẫn cần rà soát/build đầy đủ.
- `Issue 12 - API Authentication Test.md` — Đã có revoke token, clear refresh cookie và token blacklist TTL; cần xác minh bản ghi blacklist, cookie/secret và luồng session trên môi trường triển khai.
- `Issue 13 - Authentication 401 Security.md` — Frontend auth flow và build đã được xử lý; cần xác minh phiên đăng nhập hợp lệ trên production.
- `Issue 14 - Upload Cloudinary Concurrency.md` — Direct upload đã có ownership claim, validate theo claim, quota/concurrency theo user/role và outbox/retry Cloudinary. Avatar/review vẫn có local-storage path; cần kiểm thử runtime và đánh giá shared storage khi chạy nhiều instance.
- `cloudinary-about-media-deployment.md` — Hướng dẫn migration 7 ảnh About và tối ưu MP3/video với Cloudinary.

## Cần tiếp tục triển khai

1. `Issue 8 - Dynamic Product Translation Management.md` — Chạy migration/đối soát, kiểm thử export/import round-trip, xác minh save → API → re-translate và chỉ gỡ fallback `LiveTranslationCache` khi dữ liệu khớp theo `entityId + targetLang`.
2. `Issue 10 - Internationalization Audit.md` — Rà soát các nhánh payment/currency, import/export và email; rồi kiểm thử ít nhất một locale Latin cùng một locale không-Latin.
3. `Issue 11 - Backend Format Currency.md` — Build và kiểm tra các consumer còn lại để bảo đảm không có quy đổi/format tiền nghiệp vụ ở client. `Issue 14 - Upload Cloudinary Concurrency.md` — Kiểm thử claim, retry, quota/concurrency và quyết định shared storage cho avatar/review khi triển khai nhiều instance.
4. `Issue 12 - API Authentication Test.md` và `Issue 13 - Authentication 401 Security.md` — Hoàn tất xác minh auth trên môi trường triển khai sau khi các thay đổi đã có mặt trên production.

## Lộ trình triển khai ưu tiên

1. **Ổn định cache bản dịch (`issue-8`):** chốt nguồn cache chính, migration, điều kiện dừng fallback legacy; sau đó thiết kế batch/export/import với định danh ổn định và `idempotencyKey`. Contract override entity-aware đã hoàn tất tại `issue-9`, không phải hạng mục cần triển khai lại.
2. **Hoàn thiện tiền tệ và upload (`issue-11`, `issue-14`):** chuyển toàn bộ consumer sang dữ liệu format từ backend; sau đó bổ sung claim, retry, quota/concurrency và shared storage trước khi kiểm thử vận hành.
3. **Khép kín biên i18n (`issue-10`):** hoàn thiện contract `code`, `params`, `lang`, `locale`, `currencyCode` ở payment/currency; rà soát các nhánh ngoại lệ import/export, email và kiểm thử một locale Latin cùng một locale không-Latin.
4. **Xác minh môi trường:** sau mỗi nhóm, chạy tiêu chí xác minh của issue tương ứng; chỉ chuyển trạng thái hoàn tất khi luồng thực tế đạt yêu cầu. Sau khi sửa blacklist logout, việc xác minh production về auth được theo dõi tại `issue-12` và checklist vận hành chi tiết tại `issue-13`.

## Nguyên tắc triển khai đa ngôn ngữ và đa tiền tệ

1. Người dùng chọn ngôn ngữ, locale và currency; frontend truyền nhất quán `lang`, `locale`, `currencyCode` trong mọi request liên quan.
2. Backend là nguồn duy nhất cho nội dung động, giá gốc, quy đổi, tính toán và chuỗi hiển thị tiền.
3. API giữ số raw cho nghiệp vụ và trả field `formatted*` cho hiển thị. Frontend chỉ render field `formatted*`, không tự format hoặc quy đổi lại.
4. Không fallback giá hiển thị sang số raw, `${amount} ${currencyCode}`, formatter riêng của client hoặc giá trị đầu tiên trong object.
5. Nếu thiếu `formatted*`, phải sửa contract API/consumer; UI không được âm thầm hiển thị giá sai format.
6. Locale/currency không hợp lệ chỉ fallback về giá trị mặc định đã cấu hình tại boundary. Fallback bản dịch cũng phải theo locale mặc định xác định, không lấy ngẫu nhiên bản dịch đầu tiên.
7. Chỉ đánh dấu issue hoàn tất sau khi kiểm thử đổi locale/currency trên product, cart, checkout, order, payment, shipping và admin.

## Điều kiện bắt đầu

- Không thay đổi cache bản dịch trước khi ghi nhận nguồn dữ liệu chuẩn, migration và tiêu chí dừng fallback.
- Không để frontend dùng tổng tiền hoặc giá đã quy đổi làm input nghiệp vụ trước khi có cart/checkout summary từ backend.
- Không gỡ logic format/quy đổi phía client theo kiểu âm thầm; phải chuyển từng consumer sang field `formatted*`, kiểm thử hồi quy rồi xóa fallback cũ.
- Direct upload sản phẩm/banner đã dùng claim và Cloudinary; avatar/review vẫn còn local storage, nên chưa bật nhiều instance trước khi có shared storage hoặc quy trình đồng bộ phù hợp.

## Dọn dẹp

- Đã xóa `Issue 3 - Remaining Test Issues.md` vì không có nội dung độc lập.
- Báo cáo xác thực đã được rút gọn để không lưu thông tin production nhạy cảm.
