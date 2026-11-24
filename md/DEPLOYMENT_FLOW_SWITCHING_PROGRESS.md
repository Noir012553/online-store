# Tiến độ triển khai chuyển luồng deploy

## Mục tiêu

Một thao tác Super Admin có preflight và xác nhận, chuyển đồng bộ frontend/backend từ Cloudflare Tunnel sang Vercel + Render, rồi dừng hai service WinSW cũ. Nếu health check thất bại, khôi phục routing và khởi động lại hai service cũ.

## Đã xác minh

- Cloudflare Tunnel `online-store` có hai route: `manln.online` → `http://127.0.0.1:3000` và `backend.manln.online` → `http://127.0.0.1:5000`.
- WinSW service IDs đã xác nhận: `LaptopStoreFrontend` và `LaptopStoreBackend`; `LaptopStoreTunnel` phải được giữ để rollback.
- Backend Node.js đọc cổng từ `PORT` và bind `0.0.0.0`.
- Frontend rewrite `/api/*` theo `NEXT_PUBLIC_API_BASE_URL`; mặc định trỏ tới `https://backend.manln.online`.
- Backend khởi chạy worker/scheduler có ghi dữ liệu khi startup; không được chạy song song với Render trên cùng database production trong cutover.

## Đã triển khai trong source

- `online-store-backend/scripts/stop-tunnel-apps.ps1`: kiểm tra Windows/admin/service IDs và WinSW executable path trước khi dừng; thử khởi động lại service đã dừng nếu thao tác bị lỗi. Yêu cầu cờ `-ConfirmStop`.
- `online-store-backend/scripts/start-tunnel-apps.ps1`: kiểm tra tương tự và yêu cầu `-ConfirmStart`; thử dừng service đã khởi động nếu rollback một phần thất bại.
- `online-store-backend/package.json`: thêm npm scripts `deployment:stop-tunnel-apps` và `deployment:start-tunnel-apps`; scripts không tự truyền cờ xác nhận.
- `cloudflare/deployment-router/worker.js`: Worker fail-closed, mode state trong Durable Object, authenticated status/preflight/mode endpoints, allowlist hai mode và proxy hai hostname theo mode.
- `cloudflare/deployment-router/worker.test.js`: test offline cho auth, preflight, body allowlist, routing và trạng thái mode đồng bộ.
- Runbook: `md/DEPLOYMENT_FLOW_SWITCHING_GUIDE.md`.

## Chưa triển khai

- API Super Admin để gọi preflight/router, tạo job allowlist, xác nhận thao tác, theo dõi job và audit.
- Control plane/job queue độc lập với backend Tunnel, để job còn theo dõi được sau khi backend cũ dừng.
- WinSW runner service riêng chỉ được phép thực hiện các thao tác stop/start cố định.
- UI Super Admin cho preflight, xác nhận cutover và theo dõi trạng thái.
- Cấu hình Durable Object binding/migration, Worker secrets/origins và kiểm thử trên hostname staging.
- Kiểm thử PowerShell trên Windows và kiểm thử integration trên hostname staging.

## Blocker trước khi bật cutover

- Chưa có URL/service ID Render đã xác minh hoặc routing Vercel + Render sẵn sàng.
- Chưa có hostname origin riêng cho frontend Tunnel và hostname staging cho Worker.
- Chưa có control-plane/runner heartbeat để chứng minh runner đang sống trước khi dừng backend cũ.
- Chưa cài/kiểm thử runner trên host Windows.
- Chưa chạy PowerShell tests: môi trường trợ lý không có PowerShell.

## An toàn vận hành

- Không tạo database staging theo yêu cầu vận hành; Render production sẽ dùng database production.
- Không nối Preview vào production API/database hoặc khởi động Render với `MONGO_URI` production khi Tunnel backend còn chạy.
- Chưa thay đổi DNS, Tunnel ingress, service đang chạy hoặc production environment.
- Không chạy npm stop/start scripts trong môi trường này; chỉ runner đã cài trên Windows được gọi sau preflight và xác nhận.
