# Kế hoạch giao diện cấu hình dành riêng cho Super Admin

## Trạng thái

Kế hoạch đang triển khai. Đã có trang `/admin/settings`, status API và đọc allowlist không nhạy cảm; secret chỉ trả trạng thái cấu hình. Đã chuẩn bị `online-store-backend/scripts/install-winsw-services.ps1` và helper DPAPI cho Tunnel nhưng chưa kiểm thử trên Windows hoặc chạy trên host. Versioned settings store, DPAPI persistence cho settings, API ghi/apply, audit log và restart/apply adapter chưa hoàn tất; Save vẫn chưa khả dụng.

## Mục tiêu

Xây dựng khu vực quản lý tại `/admin/settings`, chỉ tài khoản `super-admin` được truy cập. Cho phép chỉnh một danh sách cấu hình môi trường đã duyệt (không phải toàn bộ environment), cấu hình thương hiệu/email/VNPay, Cloudflare Tunnel và DNS/domain. Admin thường và user không được xem hoặc thay đổi các cấu hình này.

## Hiện trạng liên quan

- User model đã hỗ trợ role `user`, `admin`, `super-admin`.
- Backend đã có middleware `protect` và `superAdmin`; một số API quản trị đã áp dụng middleware này.
- Frontend có `ProtectedAdminPage`, `isSuperAdmin`, menu sidebar có thể ẩn/hiện theo role.
- Chưa tìm thấy model cấu hình tổng quát cho cửa hàng.
- VNPay hiện lấy merchant code, hash secret, endpoint và callback URLs từ biến môi trường; `PaymentService` khởi tạo adapter khi được tạo.
- Email hiện lấy SMTP/SendGrid credentials từ biến môi trường và tạo transporter theo cấu hình runtime.
- Cloudflare R2 và Cloudflare AI dùng các nhóm credentials riêng từ biến môi trường; R2 còn cache S3 clients theo account.
- Do đó, giao diện không được ghi trực tiếp vào `process.env` hay sửa file `.env` trong container. Cần một lớp cấu hình runtime có allowlist rõ ràng; các thay đổi cần redeploy/restart phải được phân loại và áp dụng theo quy trình riêng.

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
   - Tách riêng Cloudflare R2 (account, bucket, access key, secret, public base URL), Cloudflare AI (account ID, token, model/policy), Tunnel và DNS vì quyền/mục đích khác nhau.
   - Tunnel: xem tunnels/hostname routes đã chọn, cấu hình hostname/service/ingress đã cho phép; kiểm tra xung đột hostname và khả năng kết nối. Không hiển thị tunnel token.
   - DNS/domain: quản lý zone được allowlist, xem/thêm/sửa DNS record; mặc định không hỗ trợ xóa zone, chuyển nameserver, đổi registrar hoặc tắt proxy. Xác nhận riêng cho thay đổi có thể làm gián đoạn truy cập.
   - Domain ở đây nghĩa là DNS/hostname trên Cloudflare; mua, gia hạn hay chuyển quyền sở hữu domain cần tích hợp riêng với registrar.
   - Hiển thị cấu hình đã có/chưa có, không bao giờ trả key/token hiện tại về trình duyệt; kiểm tra zone/account/permissions trước khi áp dụng.

## Kiến trúc đề xuất

### Phân quyền

- Tạo trang admin có metadata quyền `super-admin`; chỉ thêm link vào sidebar khi `user.role === 'super-admin'`.
- Mọi endpoint cấu hình phải dùng `protect` rồi `superAdmin`; kiểm tra quyền ở server là hàng rào chính, không dựa vào việc ẩn link hoặc component frontend.
- Các API lấy trạng thái chỉ trả dữ liệu đã lọc; không trả ciphertext, plaintext, access key đầy đủ hoặc giá trị bí mật trong lỗi.
- Thao tác xem/đổi secret cần xác nhận lại danh tính (re-authentication); nếu hệ thống có MFA thì yêu cầu xác nhận MFA cho các thay đổi nhạy cảm.

### Allowlist environment và secrets

- Tạo registry phía backend cho phép chỉnh sửa từng key cụ thể: key, loại dữ liệu, nhóm chức năng, giá trị mặc định, validation, nhạy cảm hay không, có cần restart/redeploy không và trạng thái bật/tắt. Frontend không được tự gửi tên key env tùy ý.
- Chỉ cho phép các key đã được rà soát, ví dụ store branding/contact, mail sender/SMTP, VNPay endpoint/mode/merchant settings, R2 upload policy/public metadata và Cloudflare resource identifiers. Secret chỉ có thể set/rotate, không đọc lại.
- Cấm tuyệt đối sửa qua giao diện các key nền tảng như MongoDB/Redis URLs, JWT/access-token/refresh-token secrets, encryption/KMS master key, CORS/trusted origins, public API base URLs, runtime ports, filesystem paths, deployment/build settings và các key không nằm trong registry.
- Giao diện chỉnh sửa một cấu hình ứng dụng có allowlist, không ghi vào `process.env` hoặc file `.env`. Cấu hình không nhạy cảm lưu có version; secret mã hóa envelope trước khi persist, khóa gốc phải nằm ngoài database trong secret manager/KMS/backend deployment environment.
- Runtime config service resolve `environment bootstrap → allowlisted persisted override`; trả trạng thái đã cấu hình/masking, không trả giá trị secret, ciphertext hay toàn bộ environment.
- Với key cần restart/redeploy: tạo bản nháp, hiển thị ảnh hưởng và trạng thái pending; chỉ áp dụng khi có quy trình restart/redeploy an toàn. Không giả lập rằng đổi DB tự cập nhật `process.env` của các process đang chạy.
- API không hỗ trợ đọc lại secret. Để thay secret, super-admin nhập giá trị mới; để giữ nguyên thì bỏ trống trường secret; xóa secret cần thao tác riêng và xác nhận.
- Mọi thay đổi có version, `updatedAt`, `updatedBy`; audit log ghi nhóm/key, người thao tác, kết quả, version và hành động nhưng không ghi secret, request body nhạy cảm hay dữ liệu thanh toán.
- Nếu yêu cầu là cập nhật environment variables thật của hosting/deployment platform, cần API provider riêng với scope tối thiểu, staging diff, phê duyệt và redeploy; đó là luồng tách biệt, không cho sửa toàn bộ environment từ ứng dụng.

### Cloudflare operations

- Dùng API token riêng cho từng phạm vi với quyền tối thiểu, tách Tunnel, DNS, R2 và AI token; không dùng Global API Key.
- Chỉ cho phép các account/zone/tunnel được cấu hình sẵn trong allowlist; validate hostname, service URL, record type/content, TTL và quyền trước khi gửi API.
- Thay đổi Tunnel/DNS phải hiển thị diff trước khi áp dụng, yêu cầu xác nhận lại, lưu version/audit và lưu cấu hình trước đó để rollback.
- Tách “cấu hình trên Cloudflare API” khỏi “dịch vụ cloudflared đang chạy”: thay đổi ingress chỉ có hiệu lực nếu tunnel agent có thể nhận cấu hình; xác minh cơ chế cập nhật hiện có trước khi cam kết thao tác runtime.
- Không cho phép xóa zone/tunnel hoặc đổi nameserver trong bản đầu. DNS record destructive changes cần xác nhận rõ và có rollback; domain registrar operations không thuộc phạm vi ban đầu.

### Nạp cấu hình runtime và env có kiểm soát

- Tạo service trung tâm đọc registry/override, kiểm tra schema và cung cấp trạng thái an toàn cho API quản trị.
- Thay đổi phải được validate trước khi kích hoạt; nếu kiểm tra thất bại thì giữ nguyên cấu hình đang chạy. Cấu hình không hợp lệ không được ghi đè giá trị hoạt động.
- Khi VNPay đổi, khởi tạo adapter phiên bản mới rồi hoán đổi an toàn, không làm mất xử lý callback đang chạy.
- Khi R2 đổi, làm mới client/cache theo account; Cloudflare AI cần nạp lại pool credentials tương ứng.
- Có version/cache invalidation giữa backend instances; hỗ trợ trạng thái `draft`, `applied`, `pending-restart`, `failed`, `rolled-back`.
- Không thay callback path công khai VNPay khi cập nhật; kiểm tra URL và hostname trước khi lưu.
- Với runtime variable không thể đổi an toàn nóng, apply chỉ được qua deploy/restart orchestrator đã được xác nhận. Nếu chưa có integration này, UI chỉ lưu pending change và hướng dẫn vận hành; không ghi trực tiếp vào host/container.
- Cloudflare Tunnel/DNS thao tác qua API độc lập với app config; kiểm tra API response và probe dịch vụ sau apply, rollback khi health check thất bại.

## Quyết định: áp dụng cấu hình, restart và Cloudflare Tunnel

- Hướng đã được duyệt cho host Windows: WinSW quản lý các service cố định cho backend và cloudflared; không dùng `npm run tunnel` như lệnh redeploy.
- Hướng đã được duyệt cho secrets: file trong `ProgramData` được mã hóa bằng Windows DPAPI, không lưu secret vào MongoDB. Allowlist v1 gồm Email, VNPay, R2 upload policy/metadata và Cloudflare AI model/policy; secret chỉ nhập/rotate, API không đọc lại.
- Trước khi bật ghi/apply cần chốt WinSW service names, service identity và ACL của thư mục `ProgramData`; DPAPI CurrentUser phụ thuộc identity và cần mã hóa lại nếu đổi service account. Chưa cài service hoặc thay đổi tiến trình host trong phiên này.
- Dùng một nút **“Áp dụng cấu hình & khởi động lại dịch vụ”** cho Super Admin. Nút tạo tác vụ nền để validate cấu hình pending, kích hoạt version đã duyệt, restart backend rồi kiểm tra health. Chỉ restart/kết nối lại Cloudflare Tunnel khi chính cấu hình Tunnel thay đổi; cấu hình v1 Email/VNPay/R2/Cloudflare AI không tự restart Tunnel.
- Tác vụ phải chạy ngoài request handler của backend đang bị restart; UI nhận job ID và theo dõi trạng thái `queued`, `running`, `succeeded` hoặc `failed`. Chỉ cho phép một thao tác apply/restart cùng phạm vi chạy đồng thời; yêu cầu xác nhận trước khi chạy và ghi audit, không ghi secret vào log.
- Nếu validate hoặc health check thất bại, không đánh dấu cấu hình là applied; giữ version trước để rollback và trả lỗi/trạng thái job rõ ràng. Không báo thành công chỉ vì tiến trình restart đã được gọi.
- Không cho Settings sửa `PORT` hoặc tự chọn port tùy ý. Orchestrator phải dùng port đã cấu hình cho đúng service; trước khi restart xác minh port chưa bị tiến trình lạ chiếm. Nếu bind thất bại, dừng apply và không kill tiến trình chỉ dựa trên số port.
- Health check phải gọi đúng host/port của backend vừa khởi động, có timeout và phân biệt instance/version cũ với instance mới. Xác nhận Tunnel origin service vẫn trỏ đúng địa chỉ và port; Tunnel kết nối được nhưng trỏ sai port không được xem là thành công.
- `npm run tunnel` chạy `scripts/tunnel.js` để khởi chạy Cloudflare Tunnel; token mới được truyền cho tiến trình cloudflared qua `TUNNEL_TOKEN`, không còn nằm trong command-line arguments. Tiến trình tunnel đang chạy theo cách cũ chỉ đổi sau khi được restart; `npm run tunnel` không build/redeploy hay restart backend.
- `src/scripts/deploy-seed.js` dừng API, chạy seed dữ liệu rồi khởi động service; không gọi script này từ Settings vì apply cấu hình không được phép kéo theo thao tác seed.
- Tách `DeploymentAdapter` (restart/redeploy backend) và `TunnelAdapter` (restart/reconnect tunnel) khỏi UI và config service. Adapter chỉ gọi provider/service đã cấu hình sẵn, không nhận command, đường dẫn hoặc service name tùy ý từ request.
- Khi đổi nền tảng deploy, chỉ thay/thêm adapter phù hợp; không đổi quy trình Settings hay cho phép ứng dụng tự chạy lệnh shell động trong thư mục dự án. Trước khi triển khai cần xác nhận backend và cloudflared đang chạy ở đâu, process manager nào quản lý chúng, cũng như quyền tối thiểu để restart.

## Các giai đoạn triển khai

1. **Chốt allowlist**: phân loại từng key theo nhóm, validation, sensitivity, hot-reload/restart, impact và rollback; lập danh sách key bị cấm; xác nhận secrets runtime/KMS.
2. **Nền tảng backend**: thêm registry, versioned config/override, mã hóa secrets, audit log đã redact và API `protect + superAdmin`; từ chối unknown keys.
3. **Env runtime và tích hợp**: chuyển từng nhóm được duyệt sang config service; thêm validate/test connection, refresh adapter/client/cache, pending restart và rollback. Không ghi vào `.env` trong container.
4. **Cloudflare Tunnel/DNS**: xác định API token scopes, allowlist account/zone/tunnel và agent update mechanism; triển khai preview diff, apply, health check và rollback.
5. **Frontend admin**: thêm `/admin/settings` với các tab, trạng thái env, preview logo, nhập/rotate secrets, cảnh báo tác động và xác nhận hành động; ẩn khỏi admin thường nhưng vẫn bảo vệ server-side.
6. **Phát hành**: migrate từng nhóm có thể rollback; chạy sandbox/staging trước production; chỉ bật các mục đã có validation và vận hành an toàn.

## Kiểm thử và nghiệm thu

- Chưa đăng nhập: API trả 401; `user` và `admin`: mọi endpoint settings trả 403; `super-admin`: được phép theo đúng scope.
- Thử truy cập URL trực tiếp, gọi API thủ công và sửa role ở client không vượt được kiểm soát backend.
- Kiểm tra mọi response, lỗi, audit log, analytics và frontend state không lộ plaintext/ciphertext của secret.
- Cấu hình secret sai hoặc kết nối thất bại không làm thay đổi cấu hình đang hoạt động; thao tác lưu không secret không xóa secret đang tồn tại.
- Test rotate/xóa secret, versioning, audit trail, cache invalidation và nhiều backend instance.
- Email: gửi thử thành công/thất bại, TLS/port, From/Reply-To và bảo đảm không làm lộ danh sách người nhận.
- VNPay: kiểm tra sandbox, chữ ký, return/IPN URL; giữ callback đang chạy và không tạo giao dịch production trong test.
- Env allowlist: key ngoài registry bị từ chối; test type/range/URL validation, secret masking, pending restart, invalid config giữ nguyên config hoạt động và rollback version.
- Restart/port: port đang bị chiếm hoặc backend bind sai port thì job phải fail an toàn, không dừng tiến trình không thuộc service; health check và Tunnel origin phải xác nhận đúng host/port của backend mới.
- Cloudflare: test quyền tối thiểu và allowlist; Tunnel ingress/hostname, DNS record validation, preview diff, apply, health check và rollback; xác minh upload/read R2; không log key/token.
- Branding: upload file hợp lệ, từ chối file sai loại/quá dung lượng, preview và xác nhận logo dùng đúng ở header/email.
- Gỡ hoặc vô hiệu hóa demo credentials ở môi trường production; đảm bảo tài khoản super-admin được bootstrap an toàn, không có mật khẩu mặc định dùng chung.

## Rủi ro và quyết định cần xác nhận trước khi code

- Cần duyệt danh sách env key được phép chỉnh và danh sách key bị cấm trước khi xây giao diện; không có chức năng edit arbitrary environment variables.
- Cần xác định hosting/deployment platform có API cập nhật env + redeploy hay không. Nếu chưa có, chỉ hỗ trợ app-managed runtime overrides cho key được thiết kế hot-reload; key cần restart sẽ ở trạng thái pending, không tự thay host env.
- Cần chọn secret manager/KMS hoặc bootstrap key an toàn trước khi lưu credentials mã hóa.
- Cần xác định Cloudflare account/zone/tunnel scope, quyền API tối thiểu và cách cloudflared nhận config mới; Cloudflare API thay đổi không tự bảo đảm service agent reload.
- Cần xác nhận `domain management` trong bản đầu là DNS/hostname trên Cloudflare, không bao gồm mua/gia hạn/chuyển domain tại registrar.
- Thay credentials Cloudflare có thể ảnh hưởng R2, AI, Tunnel hoặc DNS; giữ các token tách biệt và hỗ trợ rollback.
- Thay VNPay/SMTP trong lúc đang có giao dịch hoặc email gửi dở cần versioning và đổi cấu hình có hiệu lực an toàn.
