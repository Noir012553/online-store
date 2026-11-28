# Tiến độ triển khai chuyển luồng deploy

## Mục tiêu

Một thao tác Super Admin có preflight và xác nhận, dùng runner độc lập dừng hai service WinSW cũ rồi chuyển mode đồng bộ sang Vercel + Render. Nếu stop hoặc health check target thất bại, Worker xếp job start để phục hồi Tunnel.

## Cập nhật vận hành — 2026-11-28

- Production đang ở Worker mode `vercel-render`; Worker status gần nhất báo `activeJob: null`, `runnerOnline: false`. Cả bốn WinSW service local đang dừng có chủ đích.
- Worker production `online-store.noir012553.workers.dev` có hai route trong zone `manln.online`: `manln.online/*` và `backend.manln.online/*`; failure mode mặc định là fail closed.
- Vercel `https://online-store-three-chi.vercel.app/` trả HTTP 200. Render `https://online-store-dmj4.onrender.com/readyz` từng trả 503 khi Render Free đang ngủ (`startupReady:false`), sau đó trả 200 (`startupReady:true`). Worker preflight `vercel-render` gần nhất trả `passed:true`.
- Sau khi thêm hai Worker routes, `https://manln.online/` và `https://backend.manln.online/readyz` đều trả HTTP 200, có `CF-Ray`. Đây là xác nhận routing/readiness cơ bản, chưa thay thế smoke test auth, checkout, upload, payment callback, Socket.IO/WebSocket.
- WinSW XML Backend/Frontend đã đổi working directory sang `E:\dev-camp\24-9-27\online-store-backend` và `E:\dev-camp\24-9-27\online-store-frontend`; Tunnel env `LAPTOP_STORE_BACKEND_ROOT` cũng trỏ tới Backend trong `24-9-27`. ACL service accounts trên source, thư mục ghi cần thiết và Backend `.env` đã được áp dụng. XML/ACL backup: `C:\Users\noir0\AppData\Local\Temp\LaptopStore-switch-24-9-27-20261128-170924`.
- Process Node thủ công PID 19376 (Frontend) và PID 4924 (Backend) đã được dừng; kiểm tra sau đó không còn listener trên cổng 3000/5000. Local services vẫn dừng, nên hiện máy `24-9-27` chưa phục vụ traffic production.
- Worker route trước khi được gắn, public URLs trả 502 dù upstream Vercel/Render có thể khỏe. Sau khi gắn route, public URLs trả 200. `/api/admin/deployment/status` từng trả 502; chưa xác minh lại sau khi gắn route.
- Probe PowerShell dùng `System.Net.Http.HttpClient` thất bại vì type không khả dụng trong phiên PowerShell đó; các kết quả lỗi từ probe ấy không phải lỗi của upstream.

## Đã xác minh

- Cloudflare Tunnel `online-store` có hai route: `manln.online` → `http://127.0.0.1:3000` và `backend.manln.online` → `http://127.0.0.1:5000`.
- Kiểm tra PowerShell ban đầu tới `https://online-store.noir012553.workers.dev/__deployment/status` trả HTTP 200 với control token nhập ẩn; snapshot ban đầu là `mode: tunnel`, Runner offline, `activeJob: null`. Trạng thái mới nhất được ghi ở phần cập nhật vận hành đầu tài liệu.
- WinSW service IDs đã xác nhận: `LaptopStoreFrontend` và `LaptopStoreBackend`; `LaptopStoreTunnel` phải được giữ để rollback.
- Backend Node.js đọc cổng từ `PORT` và bind `0.0.0.0`.
- Frontend rewrite `/api/*` theo `NEXT_PUBLIC_API_BASE_URL`; mặc định trỏ tới `https://backend.manln.online`.
- Backend khởi chạy worker/scheduler có ghi dữ liệu khi startup; không được chạy song song với Render trên cùng database production trong cutover.
- Backend candidate có `DEPLOYMENT_CANDIDATE_READ_ONLY=true`: yêu cầu `MONGO_READ_ONLY_URI`, từ chối HTTP method ghi và mọi đường dẫn webhook, không khởi chạy worker/scheduler ghi dữ liệu và từ chối Socket.IO. Policy middleware có test offline; chưa được kiểm thử với MongoDB quyền đọc thực tế và chưa hoàn tất rà soát side effect của mọi GET endpoint.

## Đã triển khai trong source

- `online-store-backend/scripts/deployment-windows.js`: điều khiển hai Windows Service theo allowlist, chờ trạng thái chuyển đổi và khôi phục thao tác một phần thất bại. Token DPAPI được đọc qua Windows PowerShell inline vì Node.js core không cung cấp DPAPI; không cần file PowerShell runtime.
- `online-store-backend/package.json`: npm scripts `deployment:stop-tunnel-apps` và `deployment:start-tunnel-apps` gọi trực tiếp module Node với cờ xác nhận tương ứng.
- `cloudflare/deployment-router/worker.js`: Worker fail-closed, Durable Object mode/job queue, hai mode allowlist, proxy hai hostname, health preflight, runner heartbeat gate, audit event độc lập, rollback bằng action `startTunnelApps` và tự xếp recovery job khi cutover lỗi. Hostname public có thể cấu hình qua Wrangler; mặc định giữ `manln.online` và `backend.manln.online`. Tunnel origin proxy/preflight hỗ trợ Cloudflare Access Service Token qua Worker Secrets `TUNNEL_ACCESS_CLIENT_ID` và `TUNNEL_ACCESS_CLIENT_SECRET`; thiếu một trong hai secret thì cấu hình fail closed, credential không được gửi tới Vercel/Render. Mode chỉ đổi sau khi runner action và health check thành công.
- `cloudflare/deployment-router/wrangler.toml`: khai báo Durable Object, initial mode `tunnel`, hostname public mặc định, runner identity và backend health path `/readyz`; cần provision origins/secrets/hostname thật. Khối `previews` dùng Durable Object namespace riêng cho mỗi Preview, hostname `.invalid` và runner identity riêng; không khai báo origins hoặc secrets production. Previews Base trên Cloudflare có thể cấp secrets cho Preview mới, vì vậy phải kiểm tra và không dùng lại secrets hoặc origins production ở đó. Nếu không có cấu hình bổ sung, Preview fail closed cho tới khi có hostname Preview thực tế, bốn origins staging an toàn và control/runner secrets riêng; Tunnel mode còn cần Access Service Token riêng. Không dùng runner hoặc origins production để kiểm thử Preview. Chưa xác minh deploy Preview thực tế trên Cloudflare.
- `cloudflare/deployment-router/worker.test.js`: 22 test offline cho auth, heartbeat, preflight, job concurrency/lease, rollback/recovery, routing, hostname cấu hình được, Tunnel Access credential isolation và chuyển tiếp header WebSocket upgrade.
- Backend: `src/routes/deploymentRoutes.js`, controller/service và `DeploymentAudit` cho status, preflight, cutover, rollback, job/audit. Tất cả route yêu cầu `protect` + `superAdmin`; `GET/PUT /api/admin/deployment/config` tải/lưu backend Worker URL, Worker origins, runner identity/path và checklist trong `ProviderRuntimeConfiguration`; control/runner tokens được mã hóa, yêu cầu xác thực lại mật khẩu và ghi audit field names. API cấu hình thông thường không trả plaintext; endpoint riêng cho phép Super Admin xác thực mật khẩu để xem lại runner token và ghi audit. Form chỉ quản lý cấu hình tham chiếu; chưa tự cập nhật Cloudflare/WinSW. `DEPLOYMENT_SWITCH_ENABLED` vẫn mặc định tắt.
- Sửa lỗi đăng xuất nhầm khi Worker từ chối control token: backend chuyển upstream HTTP 401/403 thành HTTP 502 với mã `DEPLOYMENT_ROUTER_AUTH_FAILED`; giao diện deployment hiển thị hướng dẫn đối chiếu control token thay vì để frontend hiểu nhầm là phiên người dùng hết hạn. Thay đổi được push ở commit `a7c25d2`; cần deploy backend và frontend để runtime nhận bản sửa.
- `src/middleware/deploymentCandidateReadOnly.js` chặn webhook payment ở mọi method; analytics cache-clear dùng POST. `src/test/deployment-candidate-readonly.test.js` kiểm thử policy candidate offline.
- Frontend: `/admin/deployment` có form tải/sửa/lưu Worker origins, backend router URL/control token, runner identity/token file path và checklist; có nút tạo token runner ngẫu nhiên và xem lại token đã lưu sau xác thực mật khẩu. Token không tự đồng bộ ra hạ tầng. Nút cutover/rollback bị khóa nếu switch chưa bật, runner offline hoặc preflight chưa đạt.
- Store Settings: `/admin/settings` có trường domain website trong nhóm Thương hiệu; backend source chuẩn hóa về HTTPS origin và public settings cung cấp giá trị để product SSR dùng cho canonical/hreflang/OG. Sitemap và gợi ý URL quay lại/hủy PayPal cũng dùng domain này; fallback SEO/frontend phải được cấu hình riêng. Đây là cấu hình riêng, không sinh Tunnel origins hay tự đổi callback đã lưu.
- `online-store-backend/scripts/deployment-runner.js`: polling heartbeat/job và chỉ gọi hai thao tác Node allowlist trong `deployment-windows.js`; đã được copy vào `C:\ProgramData\LaptopStore\services\LaptopStoreDeploymentRunner` và đăng ký làm WinSW service trên host Windows.
- Runbook: `md/DEPLOYMENT_FLOW_SWITCHING_GUIDE.md`.

## Phạm vi cài đặt WinSW trên host Windows

- `24-9-27` có backend package `1.0.0`, frontend `0.1.0`, `node_modules`, lockfiles, backend `.env` và frontend production build. Thư mục không phải Git working tree nên không có commit hash để đối chiếu.
- WinSW XML đã chuyển Backend sang `E:\dev-camp\24-9-27\online-store-backend`, Frontend sang `E:\dev-camp\24-9-27\online-store-frontend`; Tunnel env `LAPTOP_STORE_BACKEND_ROOT` trỏ tới Backend mới. Services dùng Node từ `C:\Program Files\nodejs\node.exe`, dependencies từ `node_modules` trong từng project.
- Lần kiểm tra gần nhất xác nhận cả bốn service Backend, Frontend, Tunnel và Deployment Runner đều `Stopped`; cổng 3000/5000 không còn listener. Đây là trạng thái có chủ đích khi production ở Vercel + Render.
- `C:\ProgramData\LaptopStore` chứa WinSW executable/XML cho bốn service, helper Tunnel/Runner được copy, log và secret DPAPI (`secrets\tunnel\tunnel-token.dpapi`, `secrets\runner\runner-token.dpapi`). Không lưu plaintext token tại đây.
- Installer cấp ACL cho source Backend/Frontend và `.env` để service accounts truy cập, đồng thời tạo ACL backup trong thư mục temp đã in ở trên. Nó từ chối cài đè khi service hoặc `C:\ProgramData\LaptopStore` đã tồn tại; không dùng lại installer như quy trình update.
- Khi tải source mới đè đúng checkout, Backend/Frontend dùng source mới sau khi restart; các helper đã copy vào ProgramData không tự được cập nhật. Khi đổi checkout hoặc cập nhật helper, cần quy trình cập nhật service/path/ACL riêng. WinSW executable và Node/cloudflared nằm ngoài source; bản WinSW hiện ở `C:\Users\noir0\Downloads\WinSW-x64-v2.12.0.exe`.
- Thao tác PowerShell sửa installer đã tạo backup source tại `online-store-backend/scripts/install-winsw-services.js.20261128-124304.bak`; đây là file backup riêng, không phải thành phần do WinSW installer cài.
- Job `0a2053c0-3085-4081-bbc4-fa90852382b0` từng được tạo; Worker status mới nhất sau đó trả `activeJob: null`.

## Xác minh cài đặt trên host

- Các lần cài trước thất bại và rollback sạch: lỗi ACL 1332 xảy ra khi cấp quyền Tunnel account trước khi account được đăng ký; lỗi `sc.exe config` 1057 ban đầu chưa đủ diagnostics để kết luận nguyên nhân. Installer đã được chỉnh để cấp ACL sau khi service được cài và cấu hình virtual account không truyền password rỗng.
- Bốn service được đăng ký từ lần cài trên `copy 176`, startup `Manual`; account là `NT SERVICE\<service-id>` và SID type `UNRESTRICTED`.
- XML WinSW Backend/Frontend và Tunnel backend root đã cập nhật sang `24-9-27`; các service hiện dừng có chủ đích.
- Hai process Node thủ công PID 19376 (Frontend) và PID 4924 (Backend) đã dừng; PowerShell kiểm tra sau đó xác nhận cổng 3000/5000 không còn listener.
- Khi cài, installer đã in ACL backup directory `C:\Users\noir0\AppData\Local\Temp\LaptopStoreAcl-9cce4ef9fbb1418fa91cb7a5f1670e6c`; giữ lại để có thể khôi phục ACL source nếu cần. Không có plaintext token được ghi trong output.

## Còn cần xác minh

- Tunnel origins riêng `tunnel-frontend.manln.online` → `http://127.0.0.1:3000` và `tunnel-backend.manln.online` → `http://127.0.0.1:5000` đã được provision; Worker Access Client ID/Secret cấu hình riêng trong Worker Secrets. Local Tunnel service hiện dừng có chủ đích.
- `/api/admin/deployment/status` và preflight UI từng trả 502 trước khi gắn Worker routes. Public routes hiện trả 200, nhưng admin API chưa được kiểm tra lại sau thay đổi; cần xác minh trong phiên Super Admin.
- Cấp `MONGO_READ_ONLY_URI` với quyền đọc cho candidate; xác minh `DEPLOYMENT_CANDIDATE_READ_ONLY` trên Render và hoàn tất audit side effect cho các GET endpoint/background tasks.
- Worker giữ header `Upgrade`/`Connection: Upgrade` khi proxy handshake WebSocket; test offline xác nhận header được chuyển tiếp nhưng chưa chứng minh kết nối WebSocket hoạt động trên Cloudflare runtime. Cần kiểm thử Socket.IO/WebSocket thực tế trên staging trước cutover.
- Kiểm thử trên Windows và integration trên staging: Host/TLS/cookie/websocket/upload/callback, stop/start partial failure, recovery và job theo dõi khi backend Tunnel đã dừng.
- URL Vercel/Render thực tế đã xác nhận và Worker preflight đạt; chưa có smoke test đầy đủ cho các luồng ứng dụng ngoài health check.
- Chưa xác minh end-to-end trường domain website bằng phiên Super Admin: preview hiện trả `GET /api/settings/admin` → `400 INVALID_SETTINGS_FIELDS`. Mã backend trong source hiện tại không validate GET request này; cần xác minh preview đang proxy tới backend nào và triển khai/đồng bộ backend tương ứng. Frontend chỉ bỏ toast `api_error` chung và hiển thị trạng thái backend không tương thích; việc đó không sửa lỗi API runtime.
- Chưa xác nhận lưu `https://manln.online`, giá trị trả về từ `/api/settings/public`, hay canonical/hreflang/OG thực tế. Preview hiện chuyển về `/login`, nên chưa kiểm tra được form với quyền Super Admin hoặc xác nhận trực quan lỗi 401 sau deploy bản sửa.

## Giới hạn còn lại sau khi chuyển public routes

- Vercel/Render origins đã xác minh; Worker preflight `vercel-render` đạt và public hostnames trả 200. Chưa kiểm tra các luồng sản phẩm ngoài health endpoints.
- Worker production routes đã được gắn; Tunnel Access Service Token nằm trong Worker Secrets. Form admin chỉ lưu cấu hình tham chiếu, không tự cập nhật Cloudflare hoặc WinSW.
- `/api/admin/deployment/status` từng trả 502 trước khi gắn Worker routes; chưa có kết quả kiểm tra lại sau khi public hostnames trả 200. Preview Store Settings từng trả `400 INVALID_SETTINGS_FIELDS`; cần xác minh riêng nếu cấu hình domain website còn trong phạm vi.
- Runner service hiện `Stopped`; Worker status gần nhất báo `runnerOnline:false` và `activeJob:null`. Job orchestration end-to-end qua Runner chưa được kiểm thử trong lần chuyển public route này.
- Chưa xác minh Mongo read-only user, candidate gate hoặc thứ tự chuyển credential production mà không chạy hai backend ghi cùng lúc.
- Các lỗi 502 public xuất hiện trước khi thêm Worker routes; sau khi thêm routes, hai public health URL trả 200. Chưa chạy lại test Runner end-to-end trên Windows hoặc smoke test staging.

## An toàn vận hành

- Không tạo database staging theo yêu cầu vận hành. Candidate read-only chỉ được dùng cùng database production khi có credential Mongo chỉ đọc đã xác minh; không dùng `MONGO_URI` ghi trên Preview.
- Không khởi động đồng thời Tunnel và Render có quyền ghi vào cùng database. Chưa xác định được quy trình chuyển từ read-only candidate sang write-enabled production backend; cần runbook vận hành và xác nhận trước cutover.
- Snapshot gần nhất: production mode `vercel-render`, `activeJob:null`, Runner offline; cần kiểm tra lại trước thao tác vận hành mới.
- Giữ service local ở trạng thái dừng khi production vẫn chạy trên Vercel + Render. Process thủ công đã dừng, ports 3000/5000 trống.
