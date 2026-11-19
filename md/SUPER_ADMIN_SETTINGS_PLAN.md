# Kế hoạch giao diện cấu hình dành riêng cho Super Admin

## Trạng thái

Code hiện có trên nhánh bao gồm `/admin/settings` cho thương hiệu/bảo trì và `/admin/providerCatalog` cho hồ sơ nhà cung cấp tham khảo. Phạm vi đang được triển khai giới hạn ở các phần không-secret: API quản trị có kiểm tra Super Admin, audit, CRUD hồ sơ catalog với phân trang và xóa mềm/khôi phục; catalog không cấu hình hoặc kích hoạt adapter. Lịch bảo trì chỉ có hiệu lực khi công tắc bật, bắt đầu tại `scheduledStart` (nếu có) và tự kết thúc tại `scheduledEnd` (nếu có); thời điểm kết thúc không còn thuộc khoảng bảo trì. Trang đăng nhập không hiển thị credentials demo. Secrets, reveal plaintext, email/payment runtime, Cloudflare DNS/Tunnel và deploy/restart vẫn chưa được triển khai và tiếp tục bị khóa cho đến khi chốt môi trường staging, kho secrets và phạm vi vận hành. Source backend đã mount các route settings/catalog, nhưng preview hiện nhận `404 ROUTE_NOT_FOUND` cho các endpoint này vì rewrite mặc định trỏ tới backend chưa có phiên bản route tương ứng. UI báo backend chưa cập nhật, khóa thao tác và không dùng dữ liệu giả. Chưa xác minh CRUD end-to-end bằng backend staging và phiên Super Admin; typecheck frontend đã đạt. Các mục còn lại trong tài liệu là yêu cầu/điều kiện cho giai đoạn sau, không được hiểu là đã triển khai.

## Mục tiêu

Xây dựng khu vực quản lý tại `/admin/settings`, chỉ tài khoản `super-admin` được truy cập. Cho phép chỉnh một danh sách cấu hình môi trường đã duyệt (không phải toàn bộ environment), cấu hình thương hiệu/email/VNPay, Cloudflare Tunnel và DNS/domain, cùng trang thông báo bảo trì website có công tắc bật/tắt. Admin thường và user không được xem hoặc thay đổi các cấu hình này.

## Nguyên tắc môi trường sandbox/non-production

Toàn bộ tích hợp được cấu hình, kiểm tra và vận hành trong phạm vi sandbox/test/staging/preview; không nhập hoặc sử dụng credential production, không tạo giao dịch thật và không thay đổi tài nguyên production. Với thanh toán và vận chuyển, dùng sandbox/staging chính thức cùng tài khoản/credential thử nghiệm riêng. Với dịch vụ không có sandbox riêng như email, R2, Cloudflare AI/Tunnel/DNS hoặc hosting/deploy, chỉ dùng tài khoản, bucket, tunnel, zone/domain, người nhận email và project preview/staging được cô lập khỏi production; nếu không thể cô lập an toàn thì không đưa vào phạm vi quản trị/thử nghiệm. Giao diện/API không cung cấp lựa chọn chuyển sang production trong phạm vi này.

Chỉ chấp nhận gói miễn phí; không dùng trial có tính phí sau kỳ hạn, tính năng trả phí bắt buộc hoặc tài nguyên gây phát sinh chi phí. Trước khi chọn hosting, phải kiểm tra điều kiện sử dụng thương mại, quota, cold start, lưu trữ, khả năng cô lập dữ liệu và tương thích framework theo tài liệu chính thức. Vercel Hobby giới hạn cho mục đích cá nhân/phi thương mại nên không mặc định phù hợp với cửa hàng; Render Free có thể spin down và không có Preview Environments (tính năng này yêu cầu Pro), vì vậy không chọn Render Preview nếu yêu cầu là miễn phí. Nếu gói miễn phí không đáp ứng an toàn hoặc điều kiện sử dụng, loại phương án đó thay vì nâng gói.

## Hiện trạng liên quan

- User model đã hỗ trợ role `user`, `admin`, `super-admin`.
- Backend đã có middleware `protect` và `superAdmin`; một số API quản trị đã áp dụng middleware này.
- Frontend có `ProtectedAdminPage`, `isSuperAdmin`, menu sidebar có thể ẩn/hiện theo role.
- Đã có model `StoreSettings` cho cấu hình thương hiệu và bảo trì storefront; chưa có model runtime config/secrets tổng quát theo allowlist.
- VNPay hiện lấy merchant code, hash secret, endpoint và callback URLs từ biến môi trường; `PaymentService` khởi tạo adapter khi được tạo.
- Email hiện lấy SMTP/SendGrid credentials từ biến môi trường và tạo transporter theo cấu hình runtime.
- Cloudflare R2 và Cloudflare AI dùng các nhóm credentials riêng từ biến môi trường; R2 còn cache S3 clients theo account.
- Do đó, giao diện không được ghi trực tiếp vào `process.env` hay sửa file `.env` trong container. Cần một lớp cấu hình runtime có allowlist rõ ràng; các thay đổi cần redeploy/restart phải được phân loại và áp dụng theo quy trình riêng.

## Phạm vi giao diện

1. **Thương hiệu và thông tin cửa hàng**
   - Logo chính, logo dùng trên nền tối, favicon nếu có, tên cửa hàng, email hỗ trợ/liên hệ.
   - Xem trước ảnh trước khi lưu; upload ảnh qua quy trình asset hiện có, kiểm tra loại file và dung lượng.
2. **Thông báo bảo trì website**
   - Có trang thông báo riêng với nội dung và thời gian bảo trì dự kiến, cùng công tắc bật/tắt chế độ bảo trì.
   - Khi bật, khách truy cập storefront được chuyển tới trang thông báo; Super Admin vẫn truy cập được trang quản trị để tắt chế độ. Không chặn các API/callback/IPN/webhook và health check cần thiết cho an toàn giao dịch/vận hành.
   - Ghi audit người bật/tắt và thời điểm; kiểm tra route/allowlist để tránh redirect loop hoặc khóa nhầm Super Admin.
3. **Email cửa hàng**
   - Nhà cung cấp, SMTP host/port/TLS, tài khoản gửi, địa chỉ From/Reply-To.
   - Password SMTP hoặc API key có thể nhập/rotate; trong Read, secret được che mặc định và Siêu Admin có thể bấm icon mắt để xem/che lại giá trị. Trạng thái đã cấu hình và thời điểm cập nhật không được dùng thay cho giá trị secret.
   - Có thao tác gửi email thử tới địa chỉ được xác nhận.
4. **VNPay**
   - Chỉ cấu hình môi trường sandbox cùng terminal/merchant code, endpoint, return URL, callback URL và hash secret sandbox.
   - Có kiểm tra cấu hình và hướng dẫn xác nhận sandbox; tuyệt đối không tạo giao dịch thật hoặc nhận credential production.
5. **Cloudflare**
   - Tách riêng Cloudflare R2 (account, bucket, access key, secret, public base URL), Cloudflare AI (account ID, token, model/policy), Tunnel và DNS vì quyền/mục đích khác nhau.
   - Tunnel: xem tunnels/hostname routes đã chọn, cấu hình hostname/service/ingress đã cho phép; kiểm tra xung đột hostname và khả năng kết nối. Token được che mặc định; Siêu Admin bấm icon mắt để reveal/che lại qua API riêng có kiểm tra quyền, không cache và audit lượt reveal.
   - DNS/domain: quản lý zone được allowlist, xem/thêm/sửa DNS record; Super Admin có thể thêm hoặc chuyển ứng dụng sang domain mới đã có quyền sở hữu/quản lý. Mặc định không hỗ trợ xóa zone, chuyển nameserver, đổi registrar hoặc tắt proxy. Xác nhận riêng cho thay đổi có thể làm gián đoạn truy cập.
   - Trước khi gắn/chuyển domain, xác minh quyền kiểm soát domain và DNS, kiểm tra bản ghi xung đột, TLS/HTTPS và khả năng truy cập. Hiển thị trước các thành phần bị ảnh hưởng (frontend, backend/API, CORS/cookie, callback thanh toán, email links và Tunnel ingress); chỉ chuyển primary domain sau khi cấu hình mới qua health check. Duy trì domain cũ trong giai đoạn chuyển tiếp và hỗ trợ rollback.
   - Domain mới ở đây là domain Super Admin đã sở hữu hoặc có thể xác minh quyền quản lý; không bao gồm mua, gia hạn hay chuyển quyền sở hữu domain tại registrar. DNS chỉ được thao tác qua provider/zone đã được cho phép.
   - API trạng thái vận hành không thay thế Read. Read hiển thị đủ các trường đã lưu; key/token được che mặc định và chỉ API reveal riêng mới trả plaintext sau khi kiểm tra quyền Super Admin. Response reveal không cache và lượt reveal được audit. Kiểm tra zone/account/permissions trước khi áp dụng.

## Kiến trúc đề xuất

### Phân quyền

- Tạo trang admin có metadata quyền `super-admin`; chỉ thêm link vào sidebar khi `user.role === 'super-admin'`.
- Mọi endpoint cấu hình phải dùng `protect` rồi `superAdmin`; kiểm tra quyền ở server là hàng rào chính, không dựa vào việc ẩn link hoặc component frontend.
- API quản trị chỉ cho phép Siêu Admin đã xác thực. Read hiển thị đầy đủ trường đã lưu; response Read/list không chứa plaintext secret, chỉ trả trạng thái có giá trị và giá trị đã che. Khi bấm icon mắt, API reveal riêng phải kiểm tra `protect` + `superAdmin`, trả plaintext qua response `no-store`, audit lượt reveal và không đưa secret vào lỗi hoặc log.
- Thao tác xem/đổi secret cần xác nhận lại danh tính (re-authentication); nếu hệ thống có MFA thì yêu cầu xác nhận MFA cho các thay đổi nhạy cảm.

### Allowlist environment và secrets

- Tạo registry phía backend cho phép chỉnh sửa từng key cụ thể: key, loại dữ liệu, nhóm chức năng, giá trị mặc định, validation, nhạy cảm hay không, có cần restart/redeploy không và trạng thái bật/tắt. Frontend không được tự gửi tên key env tùy ý.
- Chỉ cho phép các key đã được rà soát, ví dụ store branding/contact, mail sender/SMTP, VNPay endpoint/mode/merchant settings, R2 upload policy/public metadata và Cloudflare resource identifiers. Read hiển thị đầy đủ các trường; secret mặc định bị che và chỉ được trả plaintext qua API reveal riêng cho Siêu Admin đã được backend phân quyền.
- Cấm tuyệt đối sửa qua giao diện các key nền tảng như MongoDB/Redis URLs, JWT/access-token/refresh-token secrets, encryption/KMS master key, CORS/trusted origins, public API base URLs, runtime ports, filesystem paths, deployment/build settings và các key không nằm trong registry.
- Giao diện chỉnh sửa một cấu hình ứng dụng có allowlist, không ghi vào `process.env` hoặc file `.env`. Cấu hình không nhạy cảm lưu có version; secret mã hóa envelope trước khi persist, khóa gốc phải nằm ngoài database trong secret manager/KMS/backend deployment environment.
- Runtime config service resolve `environment bootstrap → allowlisted persisted override`. API trạng thái chỉ trả thông tin vận hành cần thiết; endpoint Read không trả plaintext secret. Giá trị secret chỉ được trả qua endpoint reveal riêng sau khi xác thực quyền Siêu Admin; không trả ciphertext cho frontend.
- Với key cần restart/redeploy: tạo bản nháp, hiển thị ảnh hưởng và trạng thái pending; chỉ áp dụng khi có quy trình restart/redeploy an toàn. Không giả lập rằng đổi DB tự cập nhật `process.env` của các process đang chạy.
- Không trả secret trong endpoint trạng thái công khai, Read/list hoặc response dành cho role khác. Endpoint Read CRUD hiển thị đủ các trường nhưng che secret mặc định; thao tác bấm icon mắt gọi endpoint reveal riêng sau `protect` + `superAdmin` (và re-authentication/MFA nếu được cấu hình), trả plaintext với `Cache-Control: no-store`, audit lượt reveal và không ghi plaintext vào log/lỗi. Để thay secret, nhập giá trị mới; để giữ nguyên thì bỏ trống trường secret; xóa secret cần thao tác riêng và xác nhận.
- Mọi thay đổi có version, `updatedAt`, `updatedBy`; audit log ghi nhóm/key, người thao tác, kết quả, version và hành động nhưng không ghi secret, request body nhạy cảm hay dữ liệu thanh toán.
- Nếu yêu cầu là cập nhật environment variables thật của hosting/deployment platform, cần API provider riêng với scope tối thiểu, staging diff, phê duyệt và redeploy; đó là luồng tách biệt, không cho sửa toàn bộ environment từ ứng dụng.

### Cloudflare operations

- Dùng API token riêng cho từng phạm vi với quyền tối thiểu, tách Tunnel, DNS, R2 và AI token; không dùng Global API Key.
- Chỉ cho phép các account/zone/tunnel và domain đã xác minh được cấu hình trong allowlist; validate hostname, service URL, record type/content, TTL và quyền trước khi gửi API.
- Thêm/chuyển domain phải có preview diff cho DNS, frontend/backend URLs, CORS/cookie, callback và Tunnel ingress liên quan; xác nhận lại, lưu version/audit và cấu hình trước đó để rollback. Giữ domain cũ hoạt động cho đến khi domain mới qua kiểm tra DNS, TLS và health check.
- Không tự động sửa URL/callback bên thứ ba nếu không có API/adapter tương ứng; liệt kê rõ thao tác cần Super Admin cập nhật thủ công trước khi hoàn tất chuyển đổi.
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
- Hướng đã được duyệt trước đây cho secrets: file trong `ProgramData` được mã hóa bằng Windows DPAPI, không lưu secret vào MongoDB. Allowlist v1 từng gồm Email, VNPay, R2 upload policy/metadata và Cloudflare AI model/policy. Nếu thiết kế lại, CRUD Read hiển thị đầy đủ trường cho Siêu Admin nhưng che secret mặc định; icon mắt gọi API reveal có kiểm tra quyền và audit.
- Trước khi bật ghi/apply cần chốt WinSW service names, service identity và ACL của thư mục `ProgramData`; DPAPI CurrentUser phụ thuộc identity và cần mã hóa lại nếu đổi service account. Chưa cài service hoặc thay đổi tiến trình host trong phiên này.
- Dùng một nút **“Áp dụng cấu hình & khởi động lại dịch vụ”** cho Super Admin. Nút tạo tác vụ nền để validate cấu hình pending, kích hoạt version đã duyệt, restart backend rồi kiểm tra health. Chỉ restart/kết nối lại Cloudflare Tunnel khi chính cấu hình Tunnel thay đổi; cấu hình v1 Email/VNPay/R2/Cloudflare AI không tự restart Tunnel.
- Tác vụ phải chạy ngoài request handler của backend đang bị restart; UI nhận job ID và theo dõi trạng thái `queued`, `running`, `succeeded` hoặc `failed`. Nếu Siêu Admin bấm lặp khi job cùng phạm vi đang chạy, hiển thị toast cảnh báo và tiếp tục theo dõi job hiện có, không tạo job song song. Yêu cầu xác nhận trước thao tác mới và ghi audit, không ghi secret vào log.
- Nếu validate hoặc health check thất bại, không đánh dấu cấu hình là applied; giữ version trước để rollback và trả lỗi/trạng thái job rõ ràng. Không báo thành công chỉ vì tiến trình restart đã được gọi.
- Không cho Settings sửa `PORT` hoặc tự chọn port tùy ý. Orchestrator phải dùng port đã cấu hình cho đúng service; trước khi restart xác minh port chưa bị tiến trình lạ chiếm. Nếu bind thất bại, dừng apply và không kill tiến trình chỉ dựa trên số port.
- Health check phải gọi đúng host/port của backend vừa khởi động, có timeout và phân biệt instance/version cũ với instance mới. Xác nhận Tunnel origin service vẫn trỏ đúng địa chỉ và port; Tunnel kết nối được nhưng trỏ sai port không được xem là thành công.
- `npm run tunnel` chạy `scripts/tunnel.js` để khởi chạy Cloudflare Tunnel; token mới được truyền cho tiến trình cloudflared qua `TUNNEL_TOKEN`, không còn nằm trong command-line arguments. Tiến trình tunnel đang chạy theo cách cũ chỉ đổi sau khi được restart; `npm run tunnel` không build/redeploy hay restart backend. Trước khi chạy, kiểm tra trạng thái Tunnel service; nếu Tunnel đúng của ứng dụng đã chạy thì toast cảnh báo Siêu Admin, bỏ qua bước khởi chạy trùng và tiếp tục deploy frontend/backend qua Tunnel hiện có. Không khởi chạy thêm tiến trình Tunnel thứ hai; nếu trạng thái hoặc tiến trình sở hữu cổng không xác định được thì dừng phần thay đổi tuyến liên quan, không tự kill tiến trình.
- `src/scripts/deploy-seed.js` dừng API, chạy seed dữ liệu rồi khởi động service; không gọi script này từ Settings vì apply cấu hình không được phép kéo theo thao tác seed.
- Tách `DeploymentAdapter` (restart/redeploy backend) và `TunnelAdapter` (restart/reconnect tunnel) khỏi UI và config service. Adapter chỉ gọi provider/service đã cấu hình sẵn, không nhận command, đường dẫn hoặc service name tùy ý từ request.
- Trước mọi job deploy, kiểm tra xung đột theo cả môi trường và tài nguyên: cổng bind cục bộ, service/process đang sở hữu cổng, hostname/DNS/Tunnel route, provider project/service ID và deployment job đang chạy. Với host hiện tại, frontend và backend lần lượt dùng cổng 3000 và 5000; không giả định hai luồng deploy được phép chiếm cùng cổng hoặc hostname.
- Khóa/idempotency phải áp dụng xuyên các luồng Tunnel chung và deploy provider bên thứ ba, theo tài nguyên bị tác động; không chỉ theo loại nút bấm. Nếu phát hiện đúng service của ứng dụng đã chạy với cấu hình đích khớp, toast cảnh báo Siêu Admin, tái sử dụng service/route hiện có và tiếp tục các bước không trùng. Nếu cùng job đã chạy, toast và trả về job hiện tại. Nếu chủ sở hữu/cấu hình không khớp hoặc không xác định, toast nêu rõ xung đột, dừng phần deploy/route bị ảnh hưởng và không tự kill tiến trình, chiếm cổng, ghi đè hostname hay tạo service trùng.
- Khi đổi nền tảng deploy, chỉ thay/thêm adapter phù hợp; không đổi quy trình Settings hay cho phép ứng dụng tự chạy lệnh shell động trong thư mục dự án. Trước khi triển khai cần xác nhận backend và cloudflared đang chạy ở đâu, process manager nào quản lý chúng, cũng như quyền tối thiểu để restart.

## Các giai đoạn triển khai

1. **Chốt allowlist**: phân loại từng key theo nhóm, validation, sensitivity, hot-reload/restart, impact và rollback; lập danh sách key bị cấm; xác nhận secrets runtime/KMS.
2. **Nền tảng backend**: thêm registry, versioned config/override, mã hóa secrets, audit log đã redact và API `protect + superAdmin`; từ chối unknown keys.
3. **Env runtime và tích hợp**: chuyển từng nhóm được duyệt sang config service; thêm validate/test connection, refresh adapter/client/cache, pending restart và rollback. Không ghi vào `.env` trong container.
4. **Cloudflare Tunnel/DNS**: xác định API token scopes, allowlist account/zone/tunnel và agent update mechanism; triển khai preview diff, apply, health check và rollback.
5. **Frontend admin**: thêm `/admin/settings` với các tab, trạng thái env, preview logo, nhập/rotate secrets, cảnh báo tác động và xác nhận hành động; ẩn khỏi admin thường nhưng vẫn bảo vệ server-side.
6. **Phát hành thử nghiệm**: chỉ migrate các nhóm vào sandbox/staging/preview có thể rollback; không kết nối hoặc thao tác production trong phạm vi này; chỉ bật các mục đã có validation và vận hành an toàn.

## Kiểm thử và nghiệm thu

- Chưa đăng nhập: API trả 401; `user` và `admin`: mọi endpoint settings trả 403; `super-admin`: được phép theo đúng scope.
- Thử truy cập URL trực tiếp, gọi API thủ công và sửa role ở client không vượt được kiểm soát backend.
- Kiểm tra endpoint trạng thái và Read/list không chứa plaintext secret; UI che secret mặc định. Chỉ endpoint reveal sau quyền Super Admin mới trả plaintext, response không cache, lượt reveal được audit và plaintext không xuất hiện trong log/lỗi.
- Cấu hình secret sai hoặc kết nối thất bại không làm thay đổi cấu hình đang hoạt động; thao tác lưu không secret không xóa secret đang tồn tại.
- Test rotate/xóa secret, versioning, audit trail, cache invalidation và nhiều backend instance.
- Email: gửi thử thành công/thất bại, TLS/port, From/Reply-To và bảo đảm không làm lộ danh sách người nhận.
- VNPay: chỉ kiểm tra sandbox, chữ ký, return/IPN URL; dùng tài khoản và callback thử nghiệm, không nhận credential hoặc tạo giao dịch production.
- Env allowlist: key ngoài registry bị từ chối; test type/range/URL validation, Read che secret mặc định, icon mắt reveal chỉ cho Siêu Admin qua API được bảo vệ, pending restart, invalid config giữ nguyên config hoạt động và rollback version.
- Restart/port: port đang bị chiếm hoặc backend bind sai port thì job phải fail an toàn, không dừng tiến trình không thuộc service; health check và Tunnel origin phải xác nhận đúng host/port của backend mới.
- Cloudflare: test quyền tối thiểu và allowlist; Tunnel ingress/hostname, DNS record validation, preview diff, apply, health check và rollback; xác minh upload/read R2; không log key/token.
- Branding: upload file hợp lệ, từ chối file sai loại/quá dung lượng, preview và xác nhận logo dùng đúng ở header/email.
- Bảo trì: kiểm tra bật/tắt chế độ, nội dung/thời gian hiển thị, Super Admin vẫn vào được quản trị, storefront được phục hồi khi tắt, callback/IPN/webhook/health check không bị chặn và không phát sinh redirect loop.
- Provider Create: liên kết mở đúng portal HTTPS chính thức theo provider; credential chỉ được nhập trong form của ứng dụng sau khi Siêu Admin quay lại, không thu mật khẩu portal và chỉ tạo bản ghi sau khi lưu hợp lệ.
- Không để demo credentials trong bất kỳ môi trường nào; đảm bảo tài khoản super-admin được bootstrap an toàn, không có mật khẩu mặc định dùng chung.

## Rủi ro và quyết định cần xác nhận trước khi code

- Cần duyệt danh sách env key được phép chỉnh và danh sách key bị cấm trước khi xây giao diện; không có chức năng edit arbitrary environment variables.
- Cần xác định hosting/deployment platform có API cập nhật env + redeploy hay không. Nếu chưa có, chỉ hỗ trợ app-managed runtime overrides cho key được thiết kế hot-reload; key cần restart sẽ ở trạng thái pending, không tự thay host env.
- Cần chọn secret manager/KMS hoặc bootstrap key an toàn trước khi lưu credentials mã hóa.
- Cần xác định Cloudflare account/zone/tunnel scope, quyền API tối thiểu và cách cloudflared nhận config mới; Cloudflare API thay đổi không tự bảo đảm service agent reload.
- Cần xác nhận provider DNS/domain ban đầu và phạm vi allowlist. Bản đầu cho phép gắn/chuyển sang domain mới mà Super Admin đã sở hữu hoặc xác minh quyền quản lý; không bao gồm mua/gia hạn/chuyển domain tại registrar. Chuyển primary domain cần xác nhận tác động, kiểm tra DNS/TLS/health và có rollback.
- Thay credentials Cloudflare có thể ảnh hưởng R2, AI, Tunnel hoặc DNS; giữ các token tách biệt và hỗ trợ rollback.
- Thay VNPay/SMTP trong lúc đang có giao dịch hoặc email gửi dở cần versioning và đổi cấu hình có hiệu lực an toàn.

## Kinh nghiệm xử lý thực tế `/admin/settings`

- Phân biệt rõ ba loại dữ liệu trên UI: giá trị runtime, trạng thái cấu hình và khả năng vận hành của host. Ví dụ `encryptedSecretStoreAvailable` là trạng thái kho secret, không phải một giá trị env; `tunnelManaged`/`dnsManaged` cho biết ứng dụng có tự quản lý tunnel/DNS hay không, không cho biết tài nguyên Cloudflare có tồn tại hoặc đang chạy.
- Bài học cho thiết kế sau: tách API trạng thái khỏi CRUD Read. Read hiển thị mọi trường đã lưu nhưng che secret mặc định; icon mắt gọi API reveal được backend phân quyền và audit. Response reveal không cache và secret không đi vào log/lỗi.
- Trạng thái “Đã cấu hình” trong status API không đồng nghĩa với giá trị env bị thiếu; endpoint status chỉ báo trạng thái, còn CRUD Read hiển thị đầy đủ trường và che secret mặc định để Siêu Admin reveal khi cần. Không đưa plaintext vào log hoặc lỗi.
- Các thao tác create/read/update/delete chỉ áp dụng cho key có trong registry đã duyệt. Read hiển thị đủ trường, secret che mặc định và reveal qua endpoint được bảo vệ. Xóa override chỉ gỡ giá trị do ứng dụng quản lý, không xóa `process.env` trên host; muốn đổi environment thật của hosting cần luồng triển khai riêng.
- `SETTINGS_STORE_UNAVAILABLE` khi gọi `/draft` là lỗi điều kiện lưu trữ của host, không phải thiếu một setting trong `.env`. Kho hiện phụ thuộc Windows DPAPI và thư mục `ProgramData`; không được bỏ qua lỗi bằng cách lưu secret plaintext hoặc dùng fallback không mã hóa.
- Khi hiển thị nhiều model/giá trị, không gộp danh sách dài bằng `join(', ')` vào một field: mỗi item cần một ô riêng để tránh tràn/chồng nội dung. Icon cũng cần gắn theo nhóm setting và đặt nhất quán trong từng ô giá trị.
- Lỗi `401` ở `/status` hoặc `/values` thường cần kiểm tra access token/refresh session; `403` là quyền không đủ. `404` cho route mới có thể do backend đích chưa deploy phiên bản có route đó. Xác minh phiên đăng nhập và phiên bản backend trước khi kết luận registry hoặc UI sai.
- Typecheck và kiểm tra cú pháp/diff giúp xác nhận source nhưng không thay thế kiểm tra UI. Preview không có phiên Super Admin sẽ redirect về login/“Not Authorized”; không thể xác nhận thao tác trực tiếp khi chưa có phiên hợp lệ. Các hành vi phụ thuộc DPAPI/WinSW phải được kiểm tra trên host Windows phù hợp.
- Không đổi cờ vận hành thành `true` chỉ vì Tunnel/DNS đang tồn tại bên ngoài ứng dụng. Chỉ báo “đang chạy” khi có probe hoặc nguồn kiểm tra thực trạng; nếu chỉ có cờ quản lý, đặt nhãn giải thích rõ phạm vi của cờ.

## Định hướng đa nền tảng và đa nhà cung cấp

Mục tiêu là biến `/admin/settings` thành khu vực quản lý các đối tác dịch vụ theo từng nhóm rõ ràng, không gom tất cả vào một mục Cloudflare hoặc một biểu mẫu cấu hình chung. Mỗi nhóm có trang/mục riêng, hiển thị danh sách một hoặc vài nhà cung cấp được chọn ở giai đoạn đầu; cấu trúc phải cho phép bổ sung nhà cung cấp khác về sau.

### Các nhóm quản lý

- **Email**: nhà cung cấp gửi email và cấu hình kết nối tương ứng.
- **Thanh toán**: từng phương thức/đối tác thanh toán, trạng thái bật/tắt và cấu hình riêng.
- **Vận chuyển**: từng đối tác vận chuyển, trạng thái khả dụng và cấu hình riêng.
- **Nền tảng triển khai (Deploy)**: chấp nhận cả hai mô hình: (1) triển khai frontend và backend riêng, mỗi thành phần có thể ở cùng hoặc khác nền tảng; (2) triển khai/cung cấp frontend và backend thông qua Cloudflare Tunnel theo kiến trúc hiện tại. Super Admin có thể chọn mô hình phù hợp; ở mô hình riêng, chọn nền tảng cho từng thành phần. Phải phân biệt Tunnel là lớp kết nối/định tuyến với nơi build/chạy ứng dụng, và chỉ thể hiện thao tác build/deploy, cấu hình domain/DNS hoặc health check là được tích hợp khi adapter tương ứng thực sự tồn tại.
- **Lưu trữ R2**: tách thành nhóm độc lập để quản lý tài khoản/bucket và chính sách tải lên; Read hiển thị đầy đủ trường, còn access key/secret được che mặc định và reveal qua icon mắt có kiểm tra quyền. Không gộp vào Deploy chỉ vì R2 thuộc Cloudflare.
- **Bảo mật**: quản lý trạng thái kho bí mật, quyền truy cập, nhật ký kiểm toán và các thao tác nhạy cảm. Đây là nhóm bảo vệ xuyên suốt, không phải một nhà cung cấp dịch vụ.
- **Thông báo bảo trì website**: trang công khai riêng và cấu hình/công tắc bật tắt trong admin; áp dụng đầy đủ quy tắc CRUD, phân quyền và audit.
- **Thương hiệu cửa hàng**: tiếp tục là nhóm riêng cho thông tin nhận diện và liên hệ của cửa hàng.

### Nguyên tắc đa nhà cung cấp

- Mỗi nhà cung cấp/phương thức là một mục riêng có tên, mã ổn định, mô tả, trạng thái, cấu hình riêng và thông tin năng lực; không dùng một tập trường chung để giả định mọi provider có cùng cách hoạt động.
- Super Admin có thể quản lý các mục mà backend hỗ trợ; thao tác bật/tắt phải ảnh hưởng thật đến luồng liên quan. Ẩn/xóa nên giữ tham chiếu lịch sử khi có giao dịch hoặc đơn hàng liên quan.
- Chỉ hiển thị là **đang kết nối/khả dụng** khi adapter và kiểm tra trạng thái tương ứng đã tồn tại. Nhà cung cấp mới chưa có adapter không được giả lập là đã cấu hình hoặc có thể xử lý giao dịch.
- Giai đoạn đầu chỉ cần có sẵn một vài thông tin cơ bản và một hoặc vài nhà cung cấp ban đầu trong mỗi nhóm; không cần khai báo đầy đủ mọi nhà cung cấp ngay từ đầu.
- Với Deploy, hỗ trợ hai mô hình được lựa chọn rõ ràng: triển khai frontend/backend riêng (có thể cùng hoặc khác provider) hoặc giữ cả frontend và backend đi qua Cloudflare Tunnel. Ở mô hình riêng, cấu hình provider và trạng thái triển khai gắn riêng theo frontend/backend; ở mô hình Tunnel, quản lý tuyến kết nối cho cả hai thành phần. Hệ thống phải kiểm tra tương thích URL/API, callback, CORS, health check và kết nối frontend-backend trước khi báo chuyển đổi/triển khai thành công.
- Kiểm tra va chạm giữa hai mô hình trước khi apply: không để Tunnel route và provider bên thứ ba đồng thời nhận cùng hostname/domain cho cùng thành phần; kiểm tra cổng nội bộ nếu provider chạy trên cùng host và kiểm tra project/service ID hoặc hostname trùng nếu deploy bên ngoài. Chỉ tiếp tục các thành phần không bị ảnh hưởng khi xung đột được cô lập; không báo thành công toàn luồng nếu frontend/backend chưa cùng một cấu hình đích hoạt động.
- Cloudflare Tunnel là lớp kết nối/định tuyến cho cả frontend và backend trong mô hình Tunnel; nó không tự thay thế nơi build/chạy ứng dụng. Khi đổi mô hình hoặc provider, không tự ý làm thay đổi thành phần còn lại, hostname hay tuyến Tunnel nếu chưa có thao tác/ảnh hưởng được xác nhận rõ.
- Super Admin có thể thêm nhà cung cấp/phương thức qua form input riêng trong nhóm tương ứng. Form thu thập thông tin nhận diện và các trường cấu hình theo loại provider; không cho nhập tên biến môi trường tùy ý hoặc dùng một bộ trường chung cho mọi đối tác.
- Chỉ cho phép cấu hình và kích hoạt provider có loại/adapter được backend hỗ trợ. Nếu Super Admin thêm thông tin cho loại chưa có adapter, có thể lưu như mục chưa kết nối nếu sản phẩm cần ghi nhận, nhưng phải hiển thị rõ chưa thể xử lý nghiệp vụ và không đưa vào checkout/luồng vận hành.
- Secret được nhập hoặc xoay vòng qua form an toàn. Trong Read, secret bị che mặc định; icon mắt cho phép Siêu Admin reveal/che lại. Mỗi lần reveal phải gọi API riêng có kiểm tra quyền phía backend, response `no-store` và audit lượt xem; tuyệt đối không ghi plaintext vào log.
- Trong luồng Create, form theo provider có liên kết/nút mở trang đăng nhập, đăng ký hoặc quản lý chính thức để Siêu Admin lấy credential ở phía đối tác; mở tab mới để người dùng quay lại form, điền đúng các trường schema và lưu tạo bản ghi. Chỉ tạo bản ghi sau khi validation thành công. Dùng `noopener`/`noreferrer`; ứng dụng không thu thập mật khẩu đăng nhập đối tác, không tự đọc credential từ portal và không đánh dấu đã kết nối chỉ vì người dùng mở/đăng nhập trang đó.
- Chỉ dùng URL HTTPS chính thức đã allowlist theo từng provider. Sau khi lưu, trạng thái kết nối chỉ cập nhật qua kiểm tra tích hợp đáng tin cậy hoặc xác nhận thủ công được ghi rõ; liên kết portal không thay thế adapter vận hành.
- Khi thiết kế hoặc nghiệm thu, phân biệt rõ ba trạng thái: nhà cung cấp được liệt kê, thông tin đã cấu hình, và dịch vụ thực sự có thể xử lý yêu cầu.

### Nhà cung cấp khởi đầu và hiện trạng tích hợp

- **Email**: SMTP là tích hợp hiện có; SendGrid chỉ được hiển thị là tùy chọn dùng được sau khi xác minh luồng cấu hình và gửi độc lập.
- **Thanh toán**: COD và VNPay là hai phương thức hiện có; provider khác cần adapter thanh toán, callback và kiểm tra an toàn trước khi được bật.
- **Vận chuyển**: GHN là tích hợp tính phí vận chuyển hiện có; các provider khác chỉ được bật sau khi có adapter tính phí/luồng xử lý tương ứng. Bản ghi provider chung không đồng nghĩa backend đã hỗ trợ provider đó.
- **Deploy**: chấp nhận mô hình hiện tại là cả frontend và backend được phục vụ qua Cloudflare Tunnel, đồng thời cho phép về sau tách riêng frontend và backend lên cùng hoặc khác nền tảng. Settings cần thể hiện rõ mô hình đang chọn và đích triển khai của từng thành phần; hiện tại chưa có adapter để Settings tự chuyển mô hình hoặc build/deploy. Không báo deploy/chuyển đổi thành công nếu chưa có API/adapter, tác vụ apply và health check phù hợp cho frontend, backend và các tuyến liên quan.
- **Lưu trữ R2**: Cloudflare R2 là tích hợp lưu trữ hiện có và được quản lý riêng với Deploy.
- **Cloudflare AI**: là cấu hình dịch vụ AI, không phải bằng chứng cho tích hợp Deploy. Cần xác định nhóm sản phẩm riêng hoặc phạm vi hiển thị phù hợp khi thiết kế lại menu.

### Phạm vi cấu hình và an toàn

Việc mở rộng giao diện đa provider không được mở quyền sửa tùy ý biến môi trường. Mỗi provider phải có registry/allowlist, validation, quản lý secret an toàn, phân quyền Super Admin, audit và quy trình áp dụng/rollback phù hợp. Provider cần năng lực vận hành thật mới được cung cấp nút bật, kiểm tra kết nối, deploy hoặc áp dụng cấu hình.

Các lựa chọn provider ngoài nhà cung cấp khởi đầu, phạm vi cụ thể của tích hợp Cloudflare Deploy, và vị trí quản lý Cloudflare AI cần được xác nhận trước khi triển khai CRUD/tích hợp tương ứng.

### CRUD đầy đủ và quyền đọc của Siêu Admin

Mọi loại cấu hình mà sản phẩm xác định là có thể quản lý phải có đủ Create, Read, Update và Delete; không gọi là CRUD nếu thiếu thao tác nào. Read phải hiển thị đầy đủ các trường đã lưu cho Siêu Admin; giá trị thường hiển thị đầy đủ, còn credential/secret được che mặc định và có thể xem bằng icon mắt. Thao tác reveal gọi API riêng chỉ dành cho Siêu Admin đã được backend xác thực/phân quyền; response `no-store`, audit lượt reveal và không ghi plaintext vào log. API phải kiểm tra quyền ở backend cho mọi thao tác CRUD.

Mọi danh sách CRUD đều phải có phân trang đầy đủ, với phân trang thực hiện ở backend, tổng số bản ghi, thứ tự sắp xếp ổn định và khả năng giữ bộ lọc/tìm kiếm khi chuyển trang. Các danh sách chọn dữ liệu liên quan cũng phải hỗ trợ phân trang hoặc tìm kiếm phân trang khi số lựa chọn có thể lớn; không tải toàn bộ dữ liệu không giới hạn chỉ để hiển thị một trang.

Delete phải nêu rõ và hỗ trợ chính sách xóa mềm và xóa cứng. Xóa mềm giữ bản ghi cùng lịch sử kiểm toán, loại khỏi danh sách/luồng hoạt động mặc định và cho phép khôi phục nếu nghiệp vụ cần. Chỉ cho xóa cứng khi bản ghi không còn được giao dịch, lịch sử hoặc cấu hình khác tham chiếu, đồng thời không vi phạm yêu cầu lưu trữ; nếu còn tham chiếu thì từ chối xóa cứng hoặc chỉ cho xóa mềm. Backend phải thực thi các ràng buộc này, không chỉ ẩn/khóa thao tác trên giao diện. Update phải áp dụng validation theo schema chính thức của loại provider, kiểm tra quyền và quan hệ tham chiếu; không cho đổi loại cấu hình nếu làm sai lệch dữ liệu hoặc lịch sử.

### Form cấu hình theo yêu cầu từng nền tảng

Giao diện Super Admin phải chọn bộ input theo provider và adapter đã chọn; không suy luận rằng mọi cổng thanh toán cần cùng một trường, cũng không để người dùng tự nhập tên environment key tùy ý. Backend giữ registry/schema tường minh cho từng adapter, gồm tên trường, loại dữ liệu, bắt buộc/tùy chọn, validation, độ nhạy, môi trường áp dụng và khả năng reload/restart. Frontend chỉ render schema được backend cho phép.

Phân biệt rõ ba nhóm dữ liệu:

- **Thông tin hồ sơ tham khảo**: tên, mô tả, trang quản lý và các ghi chú không nhạy cảm. Nhóm này không cấu hình hay kích hoạt tích hợp.
- **Cấu hình tích hợp cố định**: credentials, môi trường, endpoint và callback URLs được adapter hỗ trợ. Secret khi nhập dùng input password và chỉ đi qua kho mã hóa; khi Read, secret bị che mặc định, icon mắt gọi API reveal riêng để Siêu Admin xem đầy đủ giá trị. Không lưu secret trong danh sách thông tin tùy ý của hồ sơ đối tác.
- **Dữ liệu từng giao dịch**: order/request ID, amount, redirect URL trả về từ cổng và signature sinh cho request. Adapter/backend tạo hoặc xử lý theo giao dịch; không yêu cầu Super Admin nhập các giá trị này như cấu hình dùng chung.

Ví dụ bộ trường sandbox cần được xác nhận theo đúng sản phẩm/API adapter trước khi đưa vào registry:

- **VNPay hiện tại**: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` (secret), endpoint, return URL và callback/IPN URL. Đây là bộ đang có trong registry dự án.
- **PayPal Standard Checkout**: Client ID, Client Secret (secret) và chế độ sandbox. Backend dùng cặp credential để lấy OAuth access token; access token là dữ liệu runtime, không phải input lưu lâu dài. Dùng sandbox API host trong sandbox. Webhook ID chỉ cần khi adapter triển khai xác minh webhook. Client ID có thể cần cho PayPal JavaScript SDK ở frontend, còn Client Secret chỉ được dùng ở backend.
- **MoMo**: `partnerCode`, `accessKey` (secret), `secretKey` (secret), endpoint/môi trường sandbox và các URL redirect/IPN cần cho luồng đã chọn. Các trường như `partnerName` hoặc `storeId` có thể phụ thuộc sản phẩm/API và hồ sơ merchant; xác nhận theo tài liệu/onboarding MoMo được cấp trước khi bắt buộc chúng.

Mỗi cổng sandbox dùng credentials và endpoint sandbox riêng, không được dùng credential production để kiểm tra. Chữ ký được adapter tạo/xác minh theo thuật toán và canonical payload của từng cổng; không dùng chung cách ký URL của VNPay cho PayPal hoặc MoMo. Callback/IPN phải xác minh phía backend trước khi cập nhật đơn hàng; không tin riêng kết quả redirect trên trình duyệt.

Chỉ hiển thị nút bật, kiểm tra kết nối hoặc đưa phương thức vào checkout khi adapter, validation, callback/IPN và xử lý trạng thái đã được triển khai. Provider chưa có adapter chỉ được lưu như hồ sơ tham khảo với trạng thái rõ ràng “Chưa tích hợp”. Nếu kho secret mã hóa không khả dụng, khóa lưu/apply và báo lỗi cụ thể; không fallback sang MongoDB plaintext hoặc trường thông tin tự do.

Tham khảo tài liệu chính thức: [PayPal REST Authentication](https://developer.paypal.com/api/rest/authentication), [PayPal Checkout SPA](https://developer.paypal.com/docs/checkout/standard/customize/single-page-app/), [MoMo Payment API Init](https://developers.momo.vn/v3/docs/payment/api/payment-api/init/) và [MoMo Integration Process](https://developers.momo.vn/v3/docs/payment/onboarding/integration-process/). Các trường MoMo ngoài credential/endpoint cần đối chiếu lại với phiên bản API và merchant account được cấp.
