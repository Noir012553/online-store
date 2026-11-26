# Tiến độ triển khai chuyển luồng deploy

## Mục tiêu

Một thao tác Super Admin có preflight và xác nhận, dùng runner độc lập dừng hai service WinSW cũ rồi chuyển mode đồng bộ sang Vercel + Render. Nếu stop hoặc health check target thất bại, Worker xếp job start để phục hồi Tunnel. Source đã có phần lớn control flow, nhưng chưa được cấu hình hoặc chạy trên hạ tầng thật.

## Đã xác minh

- Cloudflare Tunnel `online-store` có hai route: `manln.online` → `http://127.0.0.1:3000` và `backend.manln.online` → `http://127.0.0.1:5000`.
- Kiểm tra PowerShell trực tiếp `https://online-store.noir012553.workers.dev/__deployment/status` trả HTTP 200 với control token nhập ẩn; Worker trả `mode: tunnel`, `runnerOnline: false`, `lastRunnerHeartbeatAt: null`, `activeJob: null`. Điều này xác nhận Worker chấp nhận token được kiểm tra và Durable Object status hoạt động; chưa xác nhận token backend đã lưu trùng Worker Secret.
- WinSW service IDs đã xác nhận: `LaptopStoreFrontend` và `LaptopStoreBackend`; `LaptopStoreTunnel` phải được giữ để rollback.
- Backend Node.js đọc cổng từ `PORT` và bind `0.0.0.0`.
- Frontend rewrite `/api/*` theo `NEXT_PUBLIC_API_BASE_URL`; mặc định trỏ tới `https://backend.manln.online`.
- Backend khởi chạy worker/scheduler có ghi dữ liệu khi startup; không được chạy song song với Render trên cùng database production trong cutover.
- Backend candidate có `DEPLOYMENT_CANDIDATE_READ_ONLY=true`: yêu cầu `MONGO_READ_ONLY_URI`, từ chối HTTP method ghi và mọi đường dẫn webhook, không khởi chạy worker/scheduler ghi dữ liệu và từ chối Socket.IO. Policy middleware có test offline; chưa được kiểm thử với MongoDB quyền đọc thực tế và chưa hoàn tất rà soát side effect của mọi GET endpoint.

## Đã triển khai trong source

- `online-store-backend/scripts/stop-tunnel-apps.ps1`: kiểm tra Windows/admin/service IDs và WinSW executable path trước khi dừng; thử khởi động lại service đã dừng nếu thao tác bị lỗi. Yêu cầu cờ `-ConfirmStop`.
- `online-store-backend/scripts/start-tunnel-apps.ps1`: kiểm tra tương tự và yêu cầu `-ConfirmStart`; thử dừng service đã khởi động nếu rollback một phần thất bại.
- `online-store-backend/package.json`: thêm npm scripts `deployment:stop-tunnel-apps` và `deployment:start-tunnel-apps`; scripts không tự truyền cờ xác nhận.
- `cloudflare/deployment-router/worker.js`: Worker fail-closed, Durable Object mode/job queue, hai mode allowlist, proxy hai hostname, health preflight, runner heartbeat gate, audit event độc lập, rollback bằng action `startTunnelApps` và tự xếp recovery job khi cutover lỗi. Hostname public có thể cấu hình qua Wrangler; mặc định giữ `manln.online` và `backend.manln.online`. Tunnel origin proxy/preflight hỗ trợ Cloudflare Access Service Token qua Worker Secrets `TUNNEL_ACCESS_CLIENT_ID` và `TUNNEL_ACCESS_CLIENT_SECRET`; thiếu một trong hai secret thì cấu hình fail closed, credential không được gửi tới Vercel/Render. Mode chỉ đổi sau khi runner action và health check thành công.
- `cloudflare/deployment-router/wrangler.toml`: khai báo Durable Object, initial mode `tunnel`, hostname public mặc định, runner identity và backend health path `/readyz`; cần provision origins/secrets/hostname thật.
- `cloudflare/deployment-router/worker.test.js`: 22 test offline cho auth, heartbeat, preflight, job concurrency/lease, rollback/recovery, routing, hostname cấu hình được, Tunnel Access credential isolation và chuyển tiếp header WebSocket upgrade.
- Backend: `src/routes/deploymentRoutes.js`, controller/service và `DeploymentAudit` cho status, preflight, cutover, rollback, job/audit. Tất cả route yêu cầu `protect` + `superAdmin`; `GET/PUT /api/admin/deployment/config` tải/lưu backend Worker URL, Worker origins, runner identity/path và checklist trong `ProviderRuntimeConfiguration`; control/runner tokens được mã hóa, yêu cầu xác thực lại mật khẩu và ghi audit field names. API cấu hình thông thường không trả plaintext; endpoint riêng cho phép Super Admin xác thực mật khẩu để xem lại runner token và ghi audit. Form chỉ quản lý cấu hình tham chiếu; chưa tự cập nhật Cloudflare/WinSW. `DEPLOYMENT_SWITCH_ENABLED` vẫn mặc định tắt.
- Sửa lỗi đăng xuất nhầm khi Worker từ chối control token: backend chuyển upstream HTTP 401/403 thành HTTP 502 với mã `DEPLOYMENT_ROUTER_AUTH_FAILED`; giao diện deployment hiển thị hướng dẫn đối chiếu control token thay vì để frontend hiểu nhầm là phiên người dùng hết hạn. Thay đổi được push ở commit `a7c25d2`; cần deploy backend và frontend để runtime nhận bản sửa.
- `src/middleware/deploymentCandidateReadOnly.js` chặn webhook payment ở mọi method; analytics cache-clear dùng POST. `src/test/deployment-candidate-readonly.test.js` kiểm thử policy candidate offline.
- Frontend: `/admin/deployment` có form tải/sửa/lưu Worker origins, backend router URL/control token, runner identity/token file path và checklist; có nút tạo token runner ngẫu nhiên và xem lại token đã lưu sau xác thực mật khẩu. Token không tự đồng bộ ra hạ tầng. Nút cutover/rollback bị khóa nếu switch chưa bật, runner offline hoặc preflight chưa đạt.
- Store Settings: `/admin/settings` có trường domain website trong nhóm Thương hiệu; backend source chuẩn hóa về HTTPS origin và public settings cung cấp giá trị để product SSR dùng cho canonical/hreflang/OG. Sitemap và gợi ý URL quay lại/hủy PayPal cũng dùng domain này; fallback SEO/frontend phải được cấu hình riêng. Đây là cấu hình riêng, không sinh Tunnel origins hay tự đổi callback đã lưu.
- `online-store-backend/scripts/deployment-runner.js`: polling heartbeat/job và chỉ chạy hai script PowerShell cố định với cờ xác nhận; chưa được cài thành WinSW service.
- Runbook: `md/DEPLOYMENT_FLOW_SWITCHING_GUIDE.md`.

## Chưa hoàn tất

- Cài runner script thành WinSW service độc lập trên host Windows và cấu hình service-control ACL tối thiểu để điều khiển đúng hai service. Chưa có công cụ provision file DPAPI runner trong repository; cần kiểm thử việc tạo file và quyền đọc trên Windows.
- PowerShell xác nhận `tunnel-frontend.manln.online` và `tunnel-backend.manln.online` hiện không resolve trong DNS. Đây là hostname gợi ý chưa provision, không phải origin hoạt động. Cần tạo DNS/Tunnel ingress, bảo vệ cả hai hostname bằng Cloudflare Access Service Auth và lưu Access Client ID/Secret vào Worker Secrets trước khi dùng Tunnel preflight. Vẫn phải xác minh URLs Vercel/Render, đồng bộ control token backend ↔ Worker và WinSW service; `wrangler.toml` chưa có production origins/secrets/route.
- Worker status đã chạy được qua Durable Object và một control token nhập trực tiếp; preflight trực tiếp gần nhất trả HTTP 502, phù hợp với health checks Tunnel chưa đạt. Cần chạy lại sau khi DNS/ingress, Access policy và hai Worker Access Secrets được provision. Vẫn cần xác minh control token backend ↔ Worker Secret và runner secrets. Giữ `DEPLOYMENT_SWITCH_ENABLED=false` đến sau staging.
- Cấp `MONGO_READ_ONLY_URI` với quyền đọc cho candidate; xác minh `DEPLOYMENT_CANDIDATE_READ_ONLY` trên Render và hoàn tất audit side effect cho các GET endpoint/background tasks.
- Worker giữ header `Upgrade`/`Connection: Upgrade` khi proxy handshake WebSocket; test offline xác nhận header được chuyển tiếp nhưng chưa chứng minh kết nối WebSocket hoạt động trên Cloudflare runtime. Cần kiểm thử Socket.IO/WebSocket thực tế trên staging trước cutover.
- Kiểm thử PowerShell trên Windows và integration trên staging: Host/TLS/cookie/websocket/upload/callback, stop/start partial failure, recovery và job theo dõi khi backend Tunnel đã dừng.
- Chưa có xác nhận Vercel/Render build/runtime tương thích và URL/service ID thực tế.
- Chưa xác minh end-to-end trường domain website bằng phiên Super Admin: preview hiện trả `GET /api/settings/admin` → `400 INVALID_SETTINGS_FIELDS`. Mã backend trong source hiện tại không validate GET request này; cần xác minh preview đang proxy tới backend nào và triển khai/đồng bộ backend tương ứng. Frontend chỉ bỏ toast `api_error` chung và hiển thị trạng thái backend không tương thích; việc đó không sửa lỗi API runtime.
- Chưa xác nhận lưu `https://manln.online`, giá trị trả về từ `/api/settings/public`, hay canonical/hreflang/OG thực tế. Preview hiện chuyển về `/login`, nên chưa kiểm tra được form với quyền Super Admin hoặc xác nhận trực quan lỗi 401 sau deploy bản sửa.

## Blocker trước khi bật cutover

- Chưa có URL/service ID Render và URL Vercel đã xác minh; chưa có origin Tunnel riêng và hostname Worker staging. Các trường có thể được nhập/lưu trên form nhưng chưa provision hạ tầng.
- Chưa provision Worker bindings/secrets/route hoặc backend env. Form admin lưu cấu hình tham chiếu và mã hóa tokens ở backend; không deploy Worker, không ghi secrets lên Cloudflare và không thay thế cấu hình runner Windows.
- Backend runtime phục vụ preview chưa được xác minh đồng bộ với frontend cho `/api/settings/admin`; xử lý blocker này trước khi coi cấu hình Store Settings/domain website đã hoạt động. Lỗi `/api/admin/deployment/status` 401 cần kiểm tra lại sau khi backend/frontend commit `a7c25d2` được deploy; nếu nhận `DEPLOYMENT_ROUTER_AUTH_FAILED`, đồng bộ control token backend với Worker Secret.
- Runner heartbeat gate đã có trong Worker, nhưng runner chưa cài trên host Windows và chưa được kiểm thử với quyền vận hành cần thiết.
- Chưa xác minh Mongo read-only user, candidate gate hoặc thứ tự chuyển credential production mà không chạy hai backend ghi cùng lúc.
- Đã chạy kiểm tra PowerShell status/preflight trên Worker thật và kiểm tra DNS origins từ Windows; chưa chạy PowerShell tests của runner hoặc hostname staging integration. Test router backend tập trung đạt 3/3 và frontend typecheck đạt; bộ `test:deployment` đầy đủ bị chặn bởi thiếu dependency `express` trong môi trường kiểm tra. Môi trường trợ lý không có PowerShell hay quyền quản lý DNS/Cloudflare/Render/Vercel.

## An toàn vận hành

- Không tạo database staging theo yêu cầu vận hành. Candidate read-only chỉ được dùng cùng database production khi có credential Mongo chỉ đọc đã xác minh; không dùng `MONGO_URI` ghi trên Preview.
- Không khởi động đồng thời Tunnel và Render có quyền ghi vào cùng database. Chưa xác định được quy trình chuyển từ read-only candidate sang write-enabled production backend; cần runbook vận hành và xác nhận trước cutover.
- Chưa thay đổi DNS, Tunnel ingress, service đang chạy, Worker/DO production hoặc production environment; `DEPLOYMENT_SWITCH_ENABLED` vẫn phải để false.
- Không chạy npm stop/start scripts hoặc deployment runner trong môi trường này; chỉ dùng runner đã cài/kiểm thử trên Windows sau preflight và xác nhận.
