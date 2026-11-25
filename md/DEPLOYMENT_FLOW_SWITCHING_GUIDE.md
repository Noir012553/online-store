# Hướng dẫn chuyển luồng triển khai

## Mục tiêu

Tài liệu này mô tả các mô hình triển khai của cửa hàng và cách chuẩn bị chuyển đổi an toàn:

1. **Luồng Cloudflare Tunnel**: frontend và backend chạy trên máy chủ hiện tại, được công khai qua Cloudflare Tunnel.
2. **Luồng Vercel + Render**: frontend chạy trên Vercel, backend chạy trên Render.
3. **Luồng Netlify + Railway**: frontend chạy trên Netlify, backend chạy trên Railway; đây là một cặp nền tảng thay thế cần được kiểm thử riêng.

Mục tiêu vận hành là giữ hostname công khai ổn định và chuyển đồng bộ cả frontend lẫn API giữa các luồng. Chỉ đổi biến môi trường ở frontend hoặc thêm hostname riêng lẻ không tạo ra cơ chế chuyển toàn bộ traffic.

## Trạng thái hiện tại

- Frontend Next.js nằm trong `online-store-frontend`.
- `online-store-frontend/next.config.ts` rewrite `/api/*` tới `NEXT_PUBLIC_API_BASE_URL`.
- Giá trị mặc định tại `online-store-frontend/src/config.ts` là `https://backend.manln.online`.
- Một Cloudflare Tunnel tên `online-store` hiện có hai route ứng dụng: `manln.online` → `http://127.0.0.1:3000` (frontend) và `backend.manln.online` → `http://127.0.0.1:5000` (backend); DNS `cdn.manln.online` dùng R2. Không thay đổi DNS, Tunnel ingress, hostname hoặc port trong quá trình chuẩn bị các nền tảng khác.
- Provider Catalog có metadata cho Vercel, Render và Cloudflare Tunnel nhưng chưa tự deploy ứng dụng hay quản lý routing.
- Nếu Cloudflare Worker đứng trước `manln.online`, cần một hostname origin riêng trỏ trực tiếp tới frontend Tunnel; Worker không được forward về chính hostname production đang chạy Worker vì sẽ tạo vòng lặp. Chưa tạo hostname này.
- Source hiện có API/UI Super Admin và Worker control plane cho `tunnel` ↔ `vercel-render`, nhưng chưa cấu hình hoặc triển khai trên Cloudflare/Render, chưa cài runner Windows và mặc định `DEPLOYMENT_SWITCH_ENABLED` tắt. Vì vậy hiện chưa có công tắc production khả dụng.

## Mô hình đích

| Chế độ | Frontend | Backend/API | DNS và hostname production |
| --- | --- | --- | --- |
| Cloudflare Tunnel | Frontend hiện tại trên máy chủ | Backend hiện tại qua Tunnel | Giữ tuyến hiện hành |
| Vercel + Render | Dự án Vercel, Root Directory `online-store-frontend` | Dịch vụ Render | Giữ hostname công khai; lớp điều phối chuyển traffic sang frontend Vercel |
| Netlify + Railway | Site Netlify, thư mục publish/build theo cấu hình Next.js đã kiểm chứng | Dịch vụ Railway | Giữ hostname công khai; lớp điều phối chuyển traffic sang frontend Netlify |

Trong chế độ Vercel + Render, Vercel cần được build với `NEXT_PUBLIC_API_BASE_URL` trỏ tới URL backend Render phù hợp. Vercel rewrite `/api/*` tới backend đó. Không dùng URL Render giả định; lấy URL thực tế từ dịch vụ Render đã tạo.

Trong chế độ Netlify + Railway, cấu hình `NEXT_PUBLIC_API_BASE_URL` của frontend tới URL Railway staging/production tương ứng. Trước khi xem đây là phương án deploy được, xác nhận Netlify build adapter/runtime hỗ trợ các tính năng Next.js đang dùng và proxy/rewrite `/api/*` hoạt động đúng; không giả định hai nền tảng xử lý Next.js giống Vercel.

## Các bước chuẩn bị an toàn

### 1. Giữ nguyên production hiện tại

- Không xóa, sửa hoặc thay thế DNS record đang phục vụ `manln.online`, `www.manln.online` hay `backend.manln.online`.
- Không đổi nameserver, Tunnel ingress, origin service hoặc port.
- Có thể dùng domain mặc định `*.vercel.app` để kiểm tra frontend Vercel hoặc domain `*.netlify.app` do Netlify cấp để kiểm tra frontend Netlify; các domain này chưa chuyển traffic production từ Cloudflare.
- Có thể dùng URL staging do Render cấp (thường có dạng `https://<tên-dịch-vụ>.onrender.com`) hoặc URL public do Railway cấp để kiểm tra riêng backend; dùng chính URL hiện trong dashboard nhà cung cấp, không cần đổi DNS production.
- Ghi nhận cấu hình hiện tại và người có quyền rollback trước khi thay đổi routing.

### 2. Chuẩn bị candidate Vercel + Render

- Theo yêu cầu vận hành, không tạo database khác. Candidate chỉ được dùng MongoDB credential có quyền đọc, cùng namespace production; không cấp credential ghi.
- Backend có gate `DEPLOYMENT_CANDIDATE_READ_ONLY=true`: từ chối HTTP method ghi, chặn mọi đường dẫn webhook ở mọi method, không chạy worker/scheduler ghi dữ liệu và từ chối Socket.IO. Candidate phải đồng thời dùng `MONGO_READ_ONLY_URI`; nếu biến này thiếu, backend không kết nối bằng `MONGO_URI` dự phòng. Analytics cache-clear chỉ nhận POST. Policy có test offline nhưng chưa được triển khai trên Render, kiểm thử với MongoDB quyền đọc thực tế hoặc audit hết side effect của mọi GET endpoint; không kết nối candidate cho tới khi các kiểm tra này hoàn tất.
- Tạo candidate backend Render và frontend Vercel Preview từ nhánh phù hợp; frontend dùng Root Directory `online-store-frontend`. Lấy URL do từng dashboard cấp.
- Khi đã có read-only gate, cấu hình `NEXT_PUBLIC_API_BASE_URL` của Vercel Preview thành URL candidate Render; không cho candidate thực hiện mutation trên dữ liệu production.
- Kiểm thử riêng cách Vercel xử lý SSR, image optimization, rewrites/proxy `/api/*`, cookies và websocket; nếu tính năng nào không tương thích thì dừng trước khi gắn hostname production.
- Không đưa token, secret, connection string hoặc giá trị biến môi trường nhạy cảm vào tài liệu, Git, log hay ảnh chụp.

### 3. Kiểm thử candidate có quyền production tối thiểu

Chỉ sau khi read-only gate và giới hạn truy cập được xác minh, kiểm tra trên URL Preview/candidate:

- Các trang đọc dữ liệu, ảnh, nội dung đa ngôn ngữ, health endpoint và API GET cần thiết.
- Xác thực/cookie chỉ trong phạm vi đã phê duyệt; không tạo người dùng hoặc thay đổi trạng thái dữ liệu thật.
- Không chạy checkout, tạo đơn, thay tồn kho, upload ghi dữ liệu, seed, migration, gửi email hoặc thanh toán trên Preview.
- Kiểm tra Socket.IO, sitemap và URL trực tiếp backend ở chế độ không ghi.
- Theo dõi log của Vercel/Render; nếu có request mutation tới database production, dừng candidate và thu hồi quyền truy cập cho tới khi nguyên nhân được khắc phục.
- Chỉ chạy kiểm thử ghi có kiểm soát sau khi luồng production đã được chuyển và có xác nhận rõ ràng về tác động.

Frontend có một số luồng sử dụng `BACKEND_URL` trực tiếp ngoài các request `/api/*` (ví dụ URL ảnh và Socket.IO). Vì vậy chỉ đổi rewrite chưa đủ để xác nhận toàn bộ ứng dụng hoạt động trên backend Render hoặc Railway; cần kiểm thử từng luồng và cấu hình build/runtime tương ứng.

## Cơ chế chuyển toàn bộ

Worker đặt trước hostname production và Durable Object state/queue đã được triển khai trong source; cấu hình DNS/route production và secrets vẫn chưa được provision. Source hiện chỉ hỗ trợ hai mode:

- **`tunnel`**: chuyển website tới frontend hiện tại; API và các dịch vụ liên quan tiếp tục dùng backend/Tunnel hiện tại.
- **`vercel-render`**: chuyển website tới frontend Vercel; API `/api/*` của frontend Vercel được rewrite tới backend Render.

Worker chuyển cả hostname website và API theo một mode duy nhất, khóa job đồng thời, ghi sự kiện Durable Object, kiểm tra health trước/sau và chỉ đổi mode sau khi thao tác service hoàn tất. Khi stop thất bại hoặc health check candidate thất bại, Worker xếp job `startTunnelApps` để phục hồi. Nếu runner offline, cần xử lý thủ công trên Windows; không coi recovery tự động là bảo đảm khi runner/control plane mất kết nối. `netlify-railway` chưa được Worker hỗ trợ.

### Nút dừng dịch vụ Tunnel

- API `online-store-backend/src/routes/deploymentRoutes.js` chỉ cho Super Admin gọi status, preflight, cutover, rollback, job status và cập nhật router connection. Form `/admin/deployment` tải/lưu Worker origins, runner identity/path, checklist và backend router connection; control token và runner token được mã hóa trong backend, yêu cầu xác thực lại mật khẩu và không trả plaintext về trình duyệt. Các giá trị Worker/runner trong form chỉ là cấu hình tham chiếu, chưa tự cập nhật Cloudflare hoặc WinSW; phải đồng bộ thủ công. Nếu không dùng form, backend có thể dùng `DEPLOYMENT_ROUTER_URL` và `DEPLOYMENT_CONTROL_TOKEN` từ environment. `DEPLOYMENT_SWITCH_ENABLED` phải được cấu hình `true` mới nhận cutover/rollback; mặc định thao tác bị khóa.
- UI `/admin/deployment` yêu cầu preflight Vercel + Render đạt, runner heartbeat còn mới và xác nhận trên trình duyệt trước cutover. UI có theo dõi job và hiển thị audit phía backend/Worker.
- Worker nhận action allowlist `stopTunnelApps`/`startTunnelApps`; runner `online-store-backend/scripts/deployment-runner.js` chỉ gọi đúng hai PowerShell script với tham số xác nhận cố định. Không nhận command, script path, service name hoặc port từ request.
- Hai script PowerShell chỉ điều khiển `LaptopStoreFrontend` và `LaptopStoreBackend`; không dừng `LaptopStoreTunnel`. Runner script đã có trong source nhưng chưa được cài thành WinSW service và chưa có cơ chế cấp quyền service-control tối thiểu được kiểm thử.
- Preflight Worker mặc định dùng `/readyz` cho backend. Job queue và trạng thái nằm trong Durable Object độc lập với backend Tunnel; heartbeat stale chặn tạo job mới. Không để backend API tự chạy shell/npm rồi tự dừng.
- Không bật switch cho tới khi URL/origin, Worker staging route, secrets, DO binding, runner service và luồng rollback được cấu hình, kiểm thử trên staging; route health đơn thuần không xác minh cookies, websocket, upload, callback hay tương thích Next.js.

Trước khi bật cơ chế này, cần có URL đã xác minh cho frontend/backend Vercel + Render; một hostname origin riêng cho frontend Tunnel; và một hostname staging cho Worker. Phải kiểm tra cách chuyển tiếp `Host`, HTTPS/TLS, header, cookie, websocket, body upload, timeout, cache và các đường dẫn callback. Không tạo Worker route production hay chỉnh DNS chỉ dựa trên ví dụ trong tài liệu; cần kiểm thử trên hostname staging trước. Không gửi token/secret qua chat hoặc ghi vào Markdown.

## Quy trình chuyển production sau khi đã có điều phối

1. Xác nhận stack đích khỏe mạnh, dùng đúng `MONGO_URI` production và đúng phiên bản ứng dụng; candidate chỉ được ghi dữ liệu sau khi trở thành luồng production được chọn.
2. Xem bản diff cấu hình routing: chế độ hiện tại, chế độ đích, hostname/origin bị tác động và các callback liên quan.
3. Xác nhận không có deploy/switch khác đang chạy; lưu lại phiên bản cấu hình để rollback.
4. Bắt đầu maintenance window. Admin xác nhận cutover; Worker tạo job nhưng giữ mode `tunnel` cho đến khi hoàn tất.
5. Runner WinSW độc lập gọi script cố định để dừng `LaptopStoreBackend` và `LaptopStoreFrontend`. Sau khi target Vercel + Render qua health check, Worker mới chuyển mode đồng bộ sang target. Job ID/trạng thái được UI theo dõi.
6. Xác nhận hai service cũ đã dừng. Render candidate chỉ có Mongo quyền đọc; trước khi cho phép thao tác ghi production, cần quy trình promotion riêng đã được kiểm thử để cấp credential ghi/chạy backend production mà không làm hai backend cùng ghi. Quy trình promotion này hiện chưa được tự động hóa.
7. Giữ `LaptopStoreTunnel` cùng cấu hình service cũ cho rollback. Kiểm tra health, đăng nhập và các thao tác đọc trước; chỉ tạo đơn thử hoặc thao tác ghi sau khi được phê duyệt rõ ràng, có phạm vi/đơn test đã định trước và có cách xử lý dữ liệu phát sinh.
8. Nếu routing hoặc health check thất bại, trước khi rollback phải dừng Render backend từ dashboard nhà cung cấp; UI yêu cầu admin xác nhận Render đã dừng. Runner khởi động lại cả frontend/backend cũ, Worker chỉ trả mode về Tunnel sau khi health check thành công.

Không coi việc API Cloudflare Tunnel còn kết nối là bằng chứng frontend Vercel/Render hoặc Netlify/Railway đã hoạt động, hoặc ngược lại.

## DNS, callback và rollback

- DNS là sổ định tuyến theo hostname; chỉ một cấu hình routing có hiệu lực cho một hostname tại một thời điểm. Giữ Cloudflare quản lý zone không đồng nghĩa mọi hostname phải trỏ tới cùng dịch vụ.
- Không xóa record của `backend.manln.online` khi chuyển frontend. Không thay DNS apex/`www` nếu chưa có routing layer và kế hoạch rollback được kiểm thử.
- Trước khi đổi backend production, xác nhận URL webhook PayPal/VNPay và các callback bên thứ ba đang tới backend có thể xác minh chữ ký và ghi nhận giao dịch. Không đổi callback trước khi backend đích sẵn sàng.
- Rollback không tự dừng dịch vụ Render. Admin phải dừng Render backend ở dashboard trước; sau đó rollback được xếp thành job `startTunnelApps`, Worker chỉ chuyển mode về `tunnel` sau khi hai service cũ khởi động và health check Tunnel đạt. Không xóa dịch vụ hay record đang hoạt động để xử lý sự cố.
- Sau rollback, xác nhận frontend/API, đăng nhập, checkout và webhook hoạt động; giữ log/audit để điều tra nguyên nhân.

## Giới hạn phạm vi

Provider Catalog hiện chỉ lưu metadata/cấu hình provider; metadata Vercel, Render hoặc Cloudflare Tunnel không tự tạo deployment hay đổi DNS. Control switch Vercel + Render là luồng riêng; chưa tự quản lý deployment hoặc bật quyền ghi MongoDB cho Render. `netlify-railway` vẫn chưa được hỗ trợ. Không bật production switch trước khi hoàn tất cấu hình hạ tầng, promotion credential, quyền runner và staging tests.
