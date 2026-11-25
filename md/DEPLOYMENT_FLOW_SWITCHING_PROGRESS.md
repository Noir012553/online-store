# Tiến độ triển khai chuyển luồng deploy

## Mục tiêu

Một thao tác Super Admin có preflight và xác nhận, dùng runner độc lập dừng hai service WinSW cũ rồi chuyển mode đồng bộ sang Vercel + Render. Nếu stop hoặc health check target thất bại, Worker xếp job start để phục hồi Tunnel. Source đã có phần lớn control flow, nhưng chưa được cấu hình hoặc chạy trên hạ tầng thật.

## Đã xác minh

- Cloudflare Tunnel `online-store` có hai route: `manln.online` → `http://127.0.0.1:3000` và `backend.manln.online` → `http://127.0.0.1:5000`.
- WinSW service IDs đã xác nhận: `LaptopStoreFrontend` và `LaptopStoreBackend`; `LaptopStoreTunnel` phải được giữ để rollback.
- Backend Node.js đọc cổng từ `PORT` và bind `0.0.0.0`.
- Frontend rewrite `/api/*` theo `NEXT_PUBLIC_API_BASE_URL`; mặc định trỏ tới `https://backend.manln.online`.
- Backend khởi chạy worker/scheduler có ghi dữ liệu khi startup; không được chạy song song với Render trên cùng database production trong cutover.
- Backend candidate có `DEPLOYMENT_CANDIDATE_READ_ONLY=true`: yêu cầu `MONGO_READ_ONLY_URI`, từ chối HTTP method ghi và mọi đường dẫn webhook, không khởi chạy worker/scheduler ghi dữ liệu và từ chối Socket.IO. Policy middleware có test offline; chưa được kiểm thử với MongoDB quyền đọc thực tế và chưa hoàn tất rà soát side effect của mọi GET endpoint.

## Đã triển khai trong source

- `online-store-backend/scripts/stop-tunnel-apps.ps1`: kiểm tra Windows/admin/service IDs và WinSW executable path trước khi dừng; thử khởi động lại service đã dừng nếu thao tác bị lỗi. Yêu cầu cờ `-ConfirmStop`.
- `online-store-backend/scripts/start-tunnel-apps.ps1`: kiểm tra tương tự và yêu cầu `-ConfirmStart`; thử dừng service đã khởi động nếu rollback một phần thất bại.
- `online-store-backend/package.json`: thêm npm scripts `deployment:stop-tunnel-apps` và `deployment:start-tunnel-apps`; scripts không tự truyền cờ xác nhận.
- `cloudflare/deployment-router/worker.js`: Worker fail-closed, Durable Object mode/job queue, hai mode allowlist, proxy hai hostname, health preflight, runner heartbeat gate, audit event độc lập, rollback bằng action `startTunnelApps` và tự xếp recovery job khi cutover lỗi. Mode chỉ đổi sau khi runner action và health check thành công.
- `cloudflare/deployment-router/wrangler.toml`: khai báo Durable Object, initial mode `tunnel`, runner identity và backend health path `/readyz`; cần provision origins/secrets/hostname thật.
- `cloudflare/deployment-router/worker.test.js`: 18 test offline cho auth, heartbeat, preflight, job concurrency/lease, rollback/recovery, routing và chuyển tiếp header WebSocket upgrade.
- Backend: `src/routes/deploymentRoutes.js`, controller/service và `DeploymentAudit` cho status, preflight, cutover, rollback, job/audit. Tất cả route yêu cầu `protect` + `superAdmin`; `GET/PUT /api/admin/deployment/config` tải/lưu backend Worker URL, Worker origins, runner identity/path và checklist trong `ProviderRuntimeConfiguration`; control/runner tokens được mã hóa, yêu cầu xác thực lại mật khẩu và ghi audit field names. API không trả plaintext secrets. Form chỉ quản lý cấu hình tham chiếu; chưa tự cập nhật Cloudflare/WinSW. `DEPLOYMENT_SWITCH_ENABLED` vẫn mặc định tắt.
- `src/middleware/deploymentCandidateReadOnly.js` chặn webhook payment ở mọi method; analytics cache-clear dùng POST. `src/test/deployment-candidate-readonly.test.js` kiểm thử policy candidate offline.
- Frontend: `/admin/deployment` có form tải/sửa/lưu Worker origins, backend router URL/control token, runner identity/token file path và checklist; mode, runner, preflight, xác nhận thao tác, job và audit. Nút cutover/rollback bị khóa nếu switch chưa bật, runner offline hoặc preflight chưa đạt.
- `online-store-backend/scripts/deployment-runner.js`: polling heartbeat/job và chỉ chạy hai script PowerShell cố định với cờ xác nhận; chưa được cài thành WinSW service.
- Runbook: `md/DEPLOYMENT_FLOW_SWITCHING_GUIDE.md`.

## Chưa hoàn tất

- Cài runner script thành WinSW service độc lập trên host Windows và cấu hình service-control ACL tối thiểu để điều khiển đúng hai service.
- Điền và lưu URL frontend Vercel, backend Render, Tunnel origins, Worker URL và runner settings trong form Super Admin; sau đó vẫn phải đồng bộ thủ công Worker secrets/origins và WinSW service trên hạ tầng. `wrangler.toml` chưa có origins/secrets/production route.
- Provision Durable Object và secrets Worker `DEPLOYMENT_CONTROL_TOKEN`, `DEPLOYMENT_RUNNER_TOKEN`; cấu hình backend `PROVIDER_CONFIG_ENCRYPTION_KEY` hợp lệ rồi nhập URL/control token qua form Super Admin hoặc dùng backend env fallback. Giữ `DEPLOYMENT_SWITCH_ENABLED=false` đến sau staging.
- Cấp `MONGO_READ_ONLY_URI` với quyền đọc cho candidate; xác minh `DEPLOYMENT_CANDIDATE_READ_ONLY` trên Render và hoàn tất audit side effect cho các GET endpoint/background tasks.
- Worker giữ header `Upgrade`/`Connection: Upgrade` khi proxy handshake WebSocket; test offline xác nhận header được chuyển tiếp nhưng chưa chứng minh kết nối WebSocket hoạt động trên Cloudflare runtime. Cần kiểm thử Socket.IO/WebSocket thực tế trên staging trước cutover.
- Kiểm thử PowerShell trên Windows và integration trên staging: Host/TLS/cookie/websocket/upload/callback, stop/start partial failure, recovery và job theo dõi khi backend Tunnel đã dừng.
- Chưa có xác nhận Vercel/Render build/runtime tương thích và URL/service ID thực tế.

## Blocker trước khi bật cutover

- Chưa có URL/service ID Render và URL Vercel đã xác minh; chưa có origin Tunnel riêng và hostname Worker staging. Các trường có thể được nhập/lưu trên form nhưng chưa provision hạ tầng.
- Chưa provision Worker bindings/secrets/route hoặc backend env. Form admin lưu cấu hình tham chiếu và mã hóa tokens ở backend; không deploy Worker, không ghi secrets lên Cloudflare và không thay thế cấu hình runner Windows.
- Runner heartbeat gate đã có trong Worker, nhưng runner chưa cài trên host Windows và chưa được kiểm thử với quyền vận hành cần thiết.
- Chưa xác minh Mongo read-only user, candidate gate hoặc thứ tự chuyển credential production mà không chạy hai backend ghi cùng lúc.
- Chưa chạy PowerShell tests hoặc hostname staging integration; môi trường trợ lý không có PowerShell hay quyền quản lý DNS/Cloudflare/Render/Vercel.

## An toàn vận hành

- Không tạo database staging theo yêu cầu vận hành. Candidate read-only chỉ được dùng cùng database production khi có credential Mongo chỉ đọc đã xác minh; không dùng `MONGO_URI` ghi trên Preview.
- Không khởi động đồng thời Tunnel và Render có quyền ghi vào cùng database. Chưa xác định được quy trình chuyển từ read-only candidate sang write-enabled production backend; cần runbook vận hành và xác nhận trước cutover.
- Chưa thay đổi DNS, Tunnel ingress, service đang chạy, Worker/DO production hoặc production environment; `DEPLOYMENT_SWITCH_ENABLED` vẫn phải để false.
- Không chạy npm stop/start scripts hoặc deployment runner trong môi trường này; chỉ dùng runner đã cài/kiểm thử trên Windows sau preflight và xác nhận.
