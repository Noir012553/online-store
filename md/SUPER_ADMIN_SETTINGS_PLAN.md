# Kế hoạch giao diện cấu hình dành riêng cho Super Admin

## Trạng thái

Đề xuất triển khai; tài liệu này chỉ là kế hoạch, chưa thay đổi code tính năng.

## Mục tiêu

Xây dựng khu vực quản lý cấu hình cửa hàng tại `/admin/settings`, chỉ tài khoản `super-admin` được truy cập. Tập trung cấu hình thương hiệu, email cửa hàng, VNPay và Cloudflare; không cho phép admin thường hoặc người dùng thông thường xem hay thay đổi các cấu hình này.

## Hiện trạng liên quan

- User model đã hỗ trợ role `user`, `admin`, `super-admin`.
- Backend đã có middleware `protect` và `superAdmin`; một số API quản trị đã áp dụng middleware này.
- Frontend có `ProtectedAdminPage`, `isSuperAdmin`, menu sidebar có thể ẩn/hiện theo role.
- Chưa tìm thấy model cấu hình tổng quát cho cửa hàng.
- VNPay hiện lấy merchant code, hash secret, endpoint và callback URLs từ biến môi trường; `PaymentService` khởi tạo adapter khi được tạo.
- Email hiện lấy SMTP/SendGrid credentials từ biến môi trường và tạo transporter theo cấu hình runtime.
- Cloudflare R2 và Cloudflare AI dùng các nhóm credentials riêng từ biến môi trường; R2 còn cache S3 clients theo account.
- Do đó, một số tích hợp không thể được thay đổi chỉ bằng cách sửa giao diện: backend cần có nguồn cấu hình runtime và cơ chế làm mới adapter/client an toàn.

## Phạm vi giao diện

1. **Thương hiệu và thông tin cửa hàng**
   - Logo chính, logo dùng trên nền tối, favicon nếu có, tên cửa hàng, email hỗ trợ/liên hệ.
   - Xem trước ảnh trước khi lưu; upload ảnh qua quy trình asset hiện có, kiểm tra loại file và dung lượng.
2. **Email cửa hàng**
   - Nhà cung cấp, SMTP host/port/TLS, tài khoản gửi, địa chỉ From/Reply-To.
   - Password SMTP hoặc API key chỉ nhập mới/rotate; giao diện chỉ hiển thị trạng thái đã cấu hình và thời điểm cập nhật.
   - Có thao tác gửi email thử tới địa chỉ được xác nhận.
3. **VNPay**
   - Môi trường sandbox/production, terminal/merchant code, endpoint, return URL, callback URL và hash secret.
   - Có kiểm tra cấu hình và hướng dẫn xác nhận sandbox; tuyệt đối không tạo giao dịch thật trong thao tác kiểm tra.
4. **Cloudflare**
   - Tách riêng Cloudflare R2 (account, bucket, access key, secret, public base URL) và Cloudflare AI (account ID, token, model/policy) vì quyền và mục đích khác nhau.
   - Hiển thị cấu hình đã có/chưa có, không bao giờ trả key/token hiện tại về trình duyệt.
   - Kiểm tra quyền tối thiểu, account/bucket và khả năng kết nối trước khi áp dụng.

## Kiến trúc đề xuất

### Phân quyền

- Tạo trang admin có metadata quyền `super-admin`; chỉ thêm link vào sidebar khi `user.role === 'super-admin'`.
- Mọi endpoint cấu hình phải dùng `protect` rồi `superAdmin`; kiểm tra quyền ở server là hàng rào chính, không dựa vào việc ẩn link hoặc component frontend.
- Các API lấy trạng thái chỉ trả dữ liệu đã lọc; không trả ciphertext, plaintext, access key đầy đủ hoặc giá trị bí mật trong lỗi.
- Thao tác xem/đổi secret cần xác nhận lại danh tính (re-authentication); nếu hệ thống có MFA thì yêu cầu xác nhận MFA cho các thay đổi nhạy cảm.

### Lưu cấu hình và bí mật

- Tạo bản ghi cấu hình cửa hàng có version và người cập nhật; lưu cấu hình không nhạy cảm như logo URL, tên cửa hàng, endpoint, chế độ sandbox/production và email hiển thị.
- Bí mật như SMTP password/API key, VNPay hash secret, Cloudflare token/R2 secret phải được mã hóa envelope trước khi lưu. Khóa mã hóa gốc lấy từ secret manager/KMS hoặc biến môi trường chỉ có ở backend; không lưu chung khóa với MongoDB.
- API không hỗ trợ đọc lại secret. Để thay secret, super-admin nhập giá trị mới; để giữ nguyên thì không gửi trường secret. Có thao tác xóa secret riêng, có xác nhận.
- Mọi bản ghi cần có version, `updatedAt`, `updatedBy`; audit log ghi loại tích hợp, tên trường, người thao tác, kết quả và version nhưng không ghi secret, request body nhạy cảm hay dữ liệu thanh toán.
- Không tạo chức năng sửa `.env`, xem biến môi trường, hoặc ghi secrets vào frontend/localStorage/logs.

### Nạp cấu hình runtime

- Tạo service trung tâm đọc cấu hình, kiểm tra schema và cung cấp trạng thái an toàn cho API quản trị.
- Thay đổi phải được validate trước khi kích hoạt; nếu kiểm tra thất bại thì giữ nguyên cấu hình đang chạy.
- Khi cấu hình VNPay đổi, khởi tạo adapter phiên bản mới rồi hoán đổi an toàn, không làm mất xử lý callback đang chạy.
- Khi cấu hình R2 đổi, làm mới client/cache theo account và giữ nguyên hoạt động của các request đang chạy; Cloudflare AI cần nạp lại pool credentials tương ứng.
- Có version/cache invalidation rõ ràng giữa nhiều backend instance; không giả định cập nhật memory của một process sẽ cập nhật các instance khác.
- Không thay callback path công khai hiện có khi cập nhật VNPay; kiểm tra URL và domain trước khi cho lưu.

## Các giai đoạn triển khai

1. **Chốt ranh giới cấu hình**: phân loại trường public/non-secret và secret; xác định Cloudflare R2, Cloudflare AI và email provider nào được phép cấu hình; xác định secret manager/KMS và quy trình bootstrap khóa mã hóa.
2. **Nền tảng backend**: thêm model/service cấu hình có version, schema validation, mã hóa bí mật, audit log đã redact và API chỉ dành cho super-admin.
3. **Runtime integrations**: chuyển VNPay, email và Cloudflare sang đọc từ config service; thêm validate/test connection và cơ chế refresh adapter/client/cache an toàn.
4. **Frontend admin**: thêm trang `/admin/settings`, các tab theo nhóm tích hợp, trạng thái cấu hình, form chỉnh sửa, preview logo, nhập/rotate secret, xác nhận hành động và hiển thị lỗi đã làm sạch.
5. **Triển khai và vận hành**: migrate giá trị hiện có từ environment sang nguồn cấu hình an toàn theo từng tích hợp; giữ tương thích trong giai đoạn chuyển tiếp; có phương án quay lại cấu hình trước đó.
6. **Bật quyền và phát hành**: thêm entry sidebar chỉ cho super-admin; triển khai backend trước frontend; xác minh role và hoạt động sandbox trước khi bật production settings.

## Kiểm thử và nghiệm thu

- Chưa đăng nhập: API trả 401; `user` và `admin`: mọi endpoint settings trả 403; `super-admin`: được phép theo đúng scope.
- Thử truy cập URL trực tiếp, gọi API thủ công và sửa role ở client không vượt được kiểm soát backend.
- Kiểm tra mọi response, lỗi, audit log, analytics và frontend state không lộ plaintext/ciphertext của secret.
- Cấu hình secret sai hoặc kết nối thất bại không làm thay đổi cấu hình đang hoạt động; thao tác lưu không secret không xóa secret đang tồn tại.
- Test rotate/xóa secret, versioning, audit trail, cache invalidation và nhiều backend instance.
- Email: gửi thử thành công/thất bại, TLS/port, From/Reply-To và bảo đảm không làm lộ danh sách người nhận.
- VNPay: kiểm tra sandbox, chữ ký, return/IPN URL; giữ nguyên callback đang chạy và không tạo giao dịch production trong test.
- Cloudflare: test quyền tối thiểu và đúng account/bucket; xác minh upload/read sau đổi cấu hình, không in key ra log.
- Branding: upload file hợp lệ, từ chối file sai loại/quá dung lượng, xem trước và xác nhận logo dùng đúng ở header/email.
- Gỡ hoặc vô hiệu hóa demo credentials ở môi trường production; đảm bảo tài khoản super-admin được bootstrap an toàn, không có mật khẩu mặc định dùng chung.

## Rủi ro và quyết định cần xác nhận trước khi code

- Nếu deployment không có secret manager/KMS phù hợp, cần quyết định nơi giữ khóa mã hóa gốc và quy trình backup/rotation trước khi cho phép quản lý secrets trên giao diện.
- Thay credentials Cloudflare có thể ảnh hưởng đồng thời upload ảnh, Cloudflare AI và các worker; các loại key phải được quản lý tách biệt, có quyền tối thiểu và khả năng rollback.
- Thay VNPay/SMTP trong lúc đang có giao dịch hoặc email gửi dở cần được kiểm soát bằng versioning và đổi cấu hình có hiệu lực an toàn.
- Cần xác nhận phạm vi bản đầu: quản lý cấu hình runtime trong giao diện hay chỉ quản lý trạng thái/metadata còn secrets tiếp tục nằm trong deployment secret manager. Khuyến nghị ưu tiên secret manager nếu hạ tầng hỗ trợ; không cho phép sửa trực tiếp biến môi trường production từ ứng dụng.
